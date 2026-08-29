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
import { isAgentAccessAllowed, normalizeTelemetryUsage, persistRuphusTrace } from './_lib/ruphusRollout.js';

export const allowedAgentUids = () => new Set(String(process.env.RUPHUS_AGENT_V3_UIDS || '').split(',').map((uid) => uid.trim()).filter(Boolean));
function writeFrame(res, frame) { res.write(`${JSON.stringify(frame)}\n`); }
function firestoreReaders(db) {
  return {
    async readCoffee({ uid, coffeeId }) { const snap = await db.collection('users').doc(uid).collection('beans').doc(coffeeId).get(); return snap.exists ? { id: coffeeId, ...snap.data() } : null; },
    async readRecipe({ uid, coffeeId, slotKey }) { const bean = await this.readCoffee({ uid, coffeeId }); if (!bean) return null; const result = resolveLegacyRecipe(bean, slotKey); return result.ok ? { ...result.recipe, selectedPath: result.source, selectedHash: result.hash } : { code: result.code }; },
    async readTastings({ uid, coffeeId }) { const snap = await db.collection('users').doc(uid).collection('tastings').where('beanId', '==', coffeeId).get(); return snap.docs.map((item) => ({ id: item.id, ...item.data() })); },
    async readAttempts({ uid, coffeeId }) { const snap = await db.collection('users').doc(uid).collection('brewAttempts').where('coffeeId', '==', coffeeId).get(); return snap.docs.map((item) => ({ id: item.id, ...item.data() })); },
  };
}

export default withCorsAuthPro(async (req, res, decodedToken) => {
  const uid = decodedToken?.uid; if (!isAgentAccessAllowed({ uid, rawUids: process.env.RUPHUS_AGENT_V3_UIDS })) return res.status(404).json({ error: 'agent_v3_unavailable' });
  const { turnId, contextRef, userText = '' } = req.body || {};
  if (!uid || typeof turnId !== 'string' || !contextRef || typeof userText !== 'string') return res.status(400).json({ error: 'turnId, contextRef, and userText are required' });
  const startedAt = Date.now();
  let firstFrameAt = null;
  let db;
  try {
    db = getDb();
    const readers = firestoreReaders(db); const context = await buildRuphusContext({ uid, contextRef: { ...contextRef, sessionId: contextRef.sessionId || turnId }, userText, readers, evidenceByteCap: Number(process.env.RUPHUS_AGENT_EVIDENCE_BYTES) });
    const tools = createRuphusTools({ uid, context, readers, proposalStore: (input) => persistProposal({ db, ...input }) });
    res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache, no-transform' });
    const turnResult = await runRuphusTurn({ turnId, context, userText: context.userText, tools, provider: createOpenAIProvider({ instructions: RUPHUS_SYSTEM_PROMPT, maxOutputTokens: Number(process.env.RUPHUS_AGENT_MAX_OUTPUT_TOKENS) }), emit: (frame) => { if (!firstFrameAt) firstFrameAt = Date.now(); writeFrame(res, frame); } });
    logApiUsage({ uid, provider: 'openai', model: turnResult.model || RUPHUS_OPENAI_MODEL, feature: 'ruphus-agent-v3', endpoint: '/api/ruphus-agent', usage: turnResult.usage });
    const model = turnResult.model || RUPHUS_OPENAI_MODEL;
    await persistRuphusTrace({ db, uid, event: { provider: 'openai', model, contextHash: context.evidenceHash, requestId: turnResult.requestId, proposalIds: turnResult.proposalIds, feature: 'ruphus-agent-v3', endpoint: '/api/ruphus-agent', toolNames: turnResult.toolNames, totalMs: Date.now() - startedAt, ttffMs: firstFrameAt ? firstFrameAt - startedAt : undefined, retryCount: turnResult.retryCount, ...normalizeTelemetryUsage('openai', model, turnResult.usage), failureCode: turnResult.ok ? undefined : turnResult.code, recovered: false }, retentionRaw: process.env.RUPHUS_AGENT_TRACE_RETENTION_DAYS }).catch(() => {});
    // streamWithAuth uses the shipped terminal usage envelope for retry and
    // completion semantics; transport usage is not a lifecycle frame.
    writeFrame(res, { type: 'usage', usage: turnResult.usage || null });
    res.end();
  } catch (error) {
    await persistRuphusTrace({ db, uid, event: { provider: 'openai', model: RUPHUS_OPENAI_MODEL, contextHash: contextRef?.evidenceHash, feature: 'ruphus-agent-v3', endpoint: '/api/ruphus-agent', totalMs: Date.now() - startedAt, failureCode: error.code || 'agent_v3_failed' }, retentionRaw: process.env.RUPHUS_AGENT_TRACE_RETENTION_DAYS }).catch(() => {});
    if (!res.headersSent) return res.status(error.code === 'not_found' ? 404 : 400).json({ error: error.code || 'agent_v3_failed', message: error.message });
    writeFrame(res, { version: 1, protocol: 'ruphus-agent-v3', type: 'turn_failed', turnId, code: error.code || 'agent_v3_failed', message: error.message }); res.end();
  }
}, { rateLimit: RATE_LIMIT });

export { firestoreReaders, writeFrame, RUPHUS_OPENAI_MODEL };
