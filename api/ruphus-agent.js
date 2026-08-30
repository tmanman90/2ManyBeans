import { withCorsAuthPro, getDb } from './_lib/cors-auth.js';
import { logApiUsage } from './_lib/costLogger.js';
import { RATE_LIMIT } from './_lib/claudeShared.js';
import { buildRuphusContext } from './_lib/ruphusContext.js';
import { createRuphusTools } from './_lib/ruphusTools.js';
import { runRuphusTurn } from './_lib/ruphusOrchestrator.js';
import { createOpenAIProvider, RUPHUS_OPENAI_MODEL } from './_lib/ruphusProviders/openai.js';
import { persistProposal } from './_lib/ruphusRepository.js';
import { RUPHUS_SYSTEM_PROMPT } from './_lib/ruphusPrompt.js';
import { resolveLegacyRecipe } from '../src/lib/ruphus/legacyRecipeResolver.js';
import { SLOT_KEYS } from '../src/lib/ruphus/contracts.js';
import { isAgentAccessAllowed, normalizeTelemetryUsage, persistRuphusTrace } from './_lib/ruphusRollout.js';
import { normalizeAgentSession, prepareSession } from '../src/lib/ruphus/session.js';
import { boundLedger, MAX_LEDGER_BYTES } from './_lib/ruphusEvidence.js';

export const allowedAgentUids = () => new Set(String(process.env.RUPHUS_AGENT_V3_UIDS || '').split(',').map((uid) => uid.trim()).filter(Boolean));
function writeFrame(res, frame) { res.write(`${JSON.stringify(frame)}\n`); }
const activeSessionRef = (db, uid) => db.collection('users').doc(uid).collection('chatSessions').doc('active');
async function readActiveSession(db, uid) {
  if (!db || !uid) return null;
  const snap = await activeSessionRef(db, uid).get();
  return snap?.exists ? normalizeAgentSession(snap.data()) : null;
}
async function writeActiveSession(db, uid, session, options = {}) {
  if (!db || !uid || !session) return;
  const normalized = normalizeAgentSession(session, options);
  await activeSessionRef(db, uid).set(normalized, { merge: true });
}
function firestoreReaders(db) {
  return {
    async listCoffees({ uid }) { const snap = await db.collection('users').doc(uid).collection('beans').get(); return snap.docs.map((item) => ({ id: item.id, ...item.data() })); },
    async readCoffee({ uid, coffeeId }) { const snap = await db.collection('users').doc(uid).collection('beans').doc(coffeeId).get(); return snap.exists ? { id: coffeeId, ...snap.data() } : null; },
    async readRecipe({ uid, coffeeId, slotKey, slot }) {
      const bean = await this.readCoffee({ uid, coffeeId }); if (!bean) return null;
      const requested = slotKey || slot;
      if (requested) { const result = resolveLegacyRecipe(bean, requested); return result.ok ? { ...result.recipe, selectedPath: result.source, selectedHash: result.hash, slotKey: requested } : { code: result.code }; }
      return SLOT_KEYS.map((candidate) => { const result = resolveLegacyRecipe(bean, candidate); return result.ok ? { ...result.recipe, selectedPath: result.source, selectedHash: result.hash, slotKey: candidate } : null; }).filter(Boolean);
    },
    async readTastings({ uid, coffeeId }) { const snap = await db.collection('users').doc(uid).collection('tastings').where('beanId', '==', coffeeId).get(); return snap.docs.map((item) => ({ id: item.id, ...item.data() })); },
    async readAttempts({ uid, coffeeId }) { const snap = await db.collection('users').doc(uid).collection('brewAttempts').where('coffeeId', '==', coffeeId).get(); return snap.docs.map((item) => ({ id: item.id, ...item.data() })); },
    async readBrews(args) { return this.readAttempts(args); },
    async readSetup({ uid }) {
      const snap = await db.collection('users').doc(uid).get();
      const profile = snap?.exists ? snap.data() || {} : {};
      const preferences = profile.preferences && typeof profile.preferences === 'object' ? profile.preferences : {};
      const rawMethod = preferences.brewMethod || preferences.defaultMethod || profile.brewMethod || profile.defaultMethod || null;
      const defaultMethod = rawMethod === 'handbrew' ? 'v60_hot' : SLOT_KEYS.includes(rawMethod) ? rawMethod : rawMethod === 'v60' ? 'v60_hot' : rawMethod === 'kalita' ? 'kalita_hot' : rawMethod === 'aiden' ? 'aiden' : null;
      return { ...(defaultMethod ? { defaultMethod } : {}), ...(preferences.grinderCustomName || preferences.grinder ? { grinder: preferences.grinderCustomName || preferences.grinder } : {}), units: preferences.units || preferences.unitSystem || 'metric' };
    },
    async readLaunchItem({ uid, item, coffeeRef = null, coffees = [] }) {
      if (!item?.kind || !item?.ref) return { ok: false, code: 'invalid_launch_item' };
      if (item.kind === 'recipe') {
        if (!item.method || !SLOT_KEYS.includes(item.method)) return { ok: false, code: 'slot_required' };
        if (coffeeRef && !coffees.some((coffee) => coffee.id === coffeeRef || coffee.refKey === coffeeRef)) return { ok: false, code: 'cross_owner_or_context' };
        return { ok: true };
      }
      const collection = item.kind === 'tasting' ? 'tastings' : 'brewAttempts';
      const snap = await db.collection('users').doc(uid).collection(collection).doc(item.ref).get();
      if (!snap?.exists) return { ok: false, code: 'launch_item_not_found' };
      const data = snap.data() || {};
      const linkedCoffee = data.beanId || data.coffeeId || data.beanRef;
      if (coffeeRef && linkedCoffee && linkedCoffee !== coffeeRef) return { ok: false, code: 'cross_owner_or_context' };
      return { ok: true };
    },
  };
}

export default withCorsAuthPro(async (req, res, decodedToken) => {
  const uid = decodedToken?.uid; if (!isAgentAccessAllowed({ uid, rawUids: process.env.RUPHUS_AGENT_V3_UIDS })) return res.status(404).json({ error: 'agent_v3_unavailable' });
  const { turnId, contextRef, userText = '', conversation = [], ledger = null } = req.body || {};
  if (!uid || typeof turnId !== 'string' || !contextRef || typeof userText !== 'string') return res.status(400).json({ error: 'turnId, contextRef, and userText are required' });
  const startedAt = Date.now();
  let firstFrameAt = null;
  let db; let context; let activeSession;
  try {
    db = getDb();
    const readers = firestoreReaders(db);
    activeSession = prepareSession(await readActiveSession(db, uid), { now: startedAt });
    const replayConversation = activeSession?.messages?.map((message) => ({ role: message.role, content: message.text })) || [];
    const suppliedConversation = Array.isArray(conversation) && conversation.length ? conversation : replayConversation;
    const replayLedger = activeSession?.ledger || null;
    const priorText = suppliedConversation.map((message) => message?.content || message?.text || '').join(' ');
    const olderReference = activeSession?.historyWidened === true || /\b(?:older|last month|three weeks?|weeks? ago|before that|historical|earlier)\b/i.test(priorText);
    const correction = /\b(?:actually|correction|instead|not the|i (?:meant|brewed|used)|it was)\b/i.test(`${priorText} ${userText}`);
    context = await buildRuphusContext({ uid, contextRef, userText, conversation: suppliedConversation, ledger: ledger || replayLedger, readers, evidenceByteCap: Number(process.env.RUPHUS_AGENT_EVIDENCE_BYTES), sessionState: activeSession ? { lastActivityAt: activeSession.lastActivityAt, boundaryIndex: activeSession.boundaryIndex, launchHintConsumed: activeSession.launchHintConsumed, olderReference, correction } : { olderReference, correction } });
    context.sessionId = turnId;
    context.sessionState.lastActivityAt = activeSession?.lastActivityAt || null;
    context.sessionState.boundaryIndex = activeSession?.boundaryIndex || 0;
    const tools = createRuphusTools({ uid, context, readers, proposalStore: (input) => persistProposal({ db, ...input }) });
    res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache, no-transform' });
    const turnResult = await runRuphusTurn({ turnId, context, userText: context.userText, tools, provider: createOpenAIProvider({ instructions: RUPHUS_SYSTEM_PROMPT, maxOutputTokens: Number(process.env.RUPHUS_AGENT_MAX_OUTPUT_TOKENS) }), emit: (frame) => { if (!firstFrameAt) firstFrameAt = Date.now(); writeFrame(res, frame); } });
    const priorMessages = activeSession?.messages || [];
    const suppliedMessages = (Array.isArray(suppliedConversation) ? suppliedConversation : []).filter((message) => message?.role === 'user' || message?.role === 'assistant').map((message) => ({ id: message.id || `replay-${priorMessages.length}`, role: message.role, text: String(message.content || message.text || ''), createdAt: Number(message.createdAt) || startedAt })).filter((message) => message.text);
    const nextMessages = [...priorMessages, ...suppliedMessages, { id: `${turnId}-user`, role: 'user', text: context.userText, createdAt: startedAt, turnId }, ...(turnResult.text ? [{ id: `${turnId}-assistant`, role: 'assistant', text: turnResult.text, createdAt: Date.now(), turnId }] : [])];
    const ledgerBytes = Math.min(context.__ruphusEvidenceByteCap || MAX_LEDGER_BYTES, MAX_LEDGER_BYTES);
    await writeActiveSession(db, uid, { protocolVersion: 1, messages: nextMessages, turns: [...(activeSession?.turns || []), { id: turnId, status: turnResult.ok ? 'completed' : 'interrupted' }], contextRef, launchContext: context.launchContext, ledger: boundLedger(context.ledger, { maxBytes: ledgerBytes }), boundaryIndex: activeSession?.boundaryIndex || 0, lastActivityAt: Date.now(), launchHintConsumed: context.__ruphusLaunchHintConsumed === true, historyWidened: context.historyWidened === true, updatedAt: Date.now() }, { maxBytes: ledgerBytes });
    logApiUsage({ uid, provider: 'openai', model: turnResult.model || RUPHUS_OPENAI_MODEL, feature: 'ruphus-agent-v3', endpoint: '/api/ruphus-agent', usage: turnResult.usage });
    const model = turnResult.model || RUPHUS_OPENAI_MODEL;
    await persistRuphusTrace({ db, uid, event: { provider: 'openai', model, contextHash: context.evidenceHash, requestId: turnResult.requestId, proposalIds: turnResult.proposalIds, feature: 'ruphus-agent-v3', endpoint: '/api/ruphus-agent', toolNames: turnResult.toolNames, trace: { reads: context.trace.reads, focusChanges: context.trace.focusChanges.map((item) => ({ from: item.from, to: item.to })), regenerations: context.trace.regenerations.map((item) => ({ triggers: item.triggers, secondFailure: item.secondFailure })) }, totalMs: Date.now() - startedAt, ttffMs: firstFrameAt ? firstFrameAt - startedAt : undefined, retryCount: turnResult.retryCount, ...normalizeTelemetryUsage('openai', model, turnResult.usage), failureCode: turnResult.ok ? undefined : turnResult.code, recovered: false }, retentionRaw: process.env.RUPHUS_AGENT_TRACE_RETENTION_DAYS }).catch(() => {});
    // streamWithAuth uses the shipped terminal usage envelope for retry and
    // completion semantics; transport usage is not a lifecycle frame.
    writeFrame(res, { type: 'usage', usage: turnResult.usage || null });
    res.end();
  } catch (error) {
    if (db && context) await writeActiveSession(db, uid, { protocolVersion: 1, messages: [{ id: `${turnId}-user`, role: 'user', text: context.userText, createdAt: startedAt, turnId }], contextRef, launchContext: context.launchContext, ledger: boundLedger(context.ledger), boundaryIndex: context.sessionState?.boundaryIndex || 0, lastActivityAt: Date.now(), launchHintConsumed: context.__ruphusLaunchHintConsumed === true, updatedAt: Date.now() }).catch(() => {});
    await persistRuphusTrace({ db, uid, event: { provider: 'openai', model: RUPHUS_OPENAI_MODEL, contextHash: contextRef?.evidenceHash, feature: 'ruphus-agent-v3', endpoint: '/api/ruphus-agent', totalMs: Date.now() - startedAt, failureCode: error.code || 'agent_v3_failed' }, retentionRaw: process.env.RUPHUS_AGENT_TRACE_RETENTION_DAYS }).catch(() => {});
    if (!res.headersSent) return res.status(error.code === 'not_found' ? 404 : 400).json({ error: error.code || 'agent_v3_failed', message: error.message });
    writeFrame(res, { version: 1, protocol: 'ruphus-agent-v3', type: 'turn_failed', turnId, code: error.code || 'agent_v3_failed', message: error.message }); res.end();
  }
}, { rateLimit: RATE_LIMIT });

export { firestoreReaders, writeFrame, RUPHUS_OPENAI_MODEL, readActiveSession, writeActiveSession };
