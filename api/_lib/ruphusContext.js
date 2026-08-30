import { canonicalHash, clone, validateLaunchContext } from '../../src/lib/ruphus/contracts.js';
import { sanitizeEvidence } from '../../src/lib/ruphus/sanitizeEvidence.js';
import { appendLedger, boundLedger, buildRotationSnapshot, MAX_LEDGER_BYTES, shouldWidenHistory } from './ruphusEvidence.js';

function safeDynamic({ userText, launchContext, conversation, ledger }, maxBytes) {
  const dynamic = sanitizeEvidence({ userText, launchContext, conversation, ledger }, { maxBytes });
  if (dynamic.truncated) throw Object.assign(new Error('dynamic context exceeds configured byte cap'), { code: 'evidence_too_large' });
  return dynamic.value;
}

function launchCoffeeRef(launchContext, snapshot) {
  const reference = launchContext?.coffeeRef;
  if (!reference) return null;
  if (snapshot.refs?.[reference]) return reference;
  return Object.entries(snapshot.refs || {}).find(([, id]) => id === reference)?.[0] || null;
}

const displayMethod = (value) => ({ aiden: 'Aiden', v60_hot: 'hot V60', v60_iced: 'iced V60', kalita_hot: 'hot Kalita', kalita_iced: 'iced Kalita' }[value] || value || null);
function publicSnapshot(snapshot) {
  return {
    version: snapshot.version,
    setup: { defaultMethod: displayMethod(snapshot.setup?.defaultMethod), grinder: snapshot.setup?.grinder || null, units: snapshot.setup?.units || 'metric' },
    coffees: (snapshot.coffees || []).map((coffee) => ({ ...coffee, recipes: Array.isArray(coffee.recipes) ? coffee.recipes.slice() : [] })),
    lines: snapshot.lines.slice(), text: snapshot.text, sealedCount: snapshot.sealedCount, finishedCount: snapshot.finishedCount,
  };
}
function publicLaunchContext(value) {
  const item = value?.launchItem;
  return {
    ...(value?.surface ? { surface: value.surface } : {}),
    ...(value?.coffeeRef ? { coffeeRef: value.coffeeRef } : {}),
    ...(item ? { launchItem: { kind: item.kind, method: item.method || null } } : {}),
  };
}
function installServerField(target, key, value) {
  Object.defineProperty(target, key, { value, enumerable: false, writable: true, configurable: true });
}

export async function buildRuphusContext({ uid, contextRef = {}, userText = '', conversation = [], ledger = null, readers = {}, evidenceByteCap, sessionState = null } = {}) {
  if (!uid || typeof uid !== 'string') throw Object.assign(new Error('owner is required'), { code: 'owner_required' });
  if (contextRef?.uid || contextRef?.ownerId) throw Object.assign(new Error('owner identity is server-bound'), { code: 'forged_owner' });
  const launchValidation = validateLaunchContext(contextRef);
  if (!launchValidation.valid) throw Object.assign(new Error(launchValidation.errors.join('; ')), { code: 'invalid_launch_context' });
  if (typeof readers.listCoffees !== 'function') throw Object.assign(new Error('listCoffees reader is required'), { code: 'inventory_required' });
  const coffees = await readers.listCoffees({ uid });
  const setup = typeof readers.readSetup === 'function' ? await readers.readSetup({ uid }) : {};
  const snapshot = buildRotationSnapshot({ coffees, setup });
  const launchItem = contextRef?.launchItem;
  if (launchItem && typeof readers.readLaunchItem === 'function') {
    const launchRef = launchCoffeeRef(contextRef, snapshot);
    const launchId = launchRef ? snapshot.refs[launchRef] : contextRef.coffeeRef || null;
    const verified = await readers.readLaunchItem({ uid, item: clone(launchItem), coffeeRef: launchId, coffeeRefKey: launchRef, coffees });
    if (!verified?.ok) throw Object.assign(new Error(verified?.message || 'launch item is not available to this owner'), { code: verified?.code || 'invalid_launch_item' });
  }
  if (!Number.isInteger(evidenceByteCap) || evidenceByteCap < 1) throw Object.assign(new Error('evidence byte cap must be configured'), { code: 'evidence_config_required' });
  const currentLedger = boundLedger(ledger || contextRef.ledger || {}, { maxBytes: Math.min(evidenceByteCap, MAX_LEDGER_BYTES) });
  const dynamic = safeDynamic({ userText, launchContext: publicLaunchContext(contextRef), conversation: Array.isArray(conversation) ? conversation.map((item) => ({ role: item?.role, content: item?.content || item?.text })).filter((item) => item.role === 'user' || item.role === 'assistant') : [], ledger: currentLedger }, evidenceByteCap);
  const launchCoffee = launchCoffeeRef(contextRef, snapshot);
  if (contextRef?.coffeeRef && !launchCoffee) throw Object.assign(new Error('launch coffee is outside the owner-scoped context'), { code: 'cross_owner_or_context' });
  const normalizedInternalLaunch = { ...clone(contextRef), ...(launchCoffee && launchCoffee !== contextRef.coffeeRef ? { coffeeRef: launchCoffee } : {}) };
  const normalizedLaunch = publicLaunchContext(normalizedInternalLaunch);
  const widened = shouldWidenHistory({ userText: dynamic.userText || '', correction: sessionState?.correction === true || shouldWidenHistory({ userText: dynamic.userText || '' }), olderReference: sessionState?.olderReference === true });
  const safeSnapshot = publicSnapshot(snapshot);
  const evidence = { launchContext: normalizedLaunch, rotationSnapshot: safeSnapshot, ledger: currentLedger, conversation: dynamic.conversation || [], userText: dynamic.userText || '', historyWidened: widened };
  const result = {
    version: 2,
    context: normalizedLaunch,
    launchContext: normalizedLaunch,
    rotationSnapshot: safeSnapshot,
    ledger: currentLedger,
    conversation: dynamic.conversation || [],
    userText: dynamic.userText || '',
    evidenceHash: canonicalHash(evidence),
    historyWidened: widened,
    sessionState: { lastActivityAt: Number.isFinite(Number(sessionState?.lastActivityAt)) ? Number(sessionState.lastActivityAt) : null, boundaryIndex: Number.isInteger(sessionState?.boundaryIndex) ? Math.max(0, sessionState.boundaryIndex) : 0, launchHintConsumed: sessionState?.launchHintConsumed === true },
  };
  installServerField(result, '__ruphusRefs', clone(snapshot.refs));
  installServerField(result, '__ruphusServerSnapshot', snapshot);
  installServerField(result, '__ruphusLaunchContext', normalizedInternalLaunch);
  installServerField(result, '__ruphusLaunchHintConsumed', sessionState?.launchHintConsumed === true);
  installServerField(result, '__ruphusHistoryWidened', widened);
  installServerField(result, '__ruphusEvidenceByteCap', evidenceByteCap);
  installServerField(result, '__ruphusResolvedTargets', new Map());
  installServerField(result, 'launchCoffeeId', launchCoffee);
  installServerField(result, 'trace', { focusChanges: [], reads: [], regenerations: [] });
  installServerField(result, 'proposalState', { target: null, diagnosisReady: false, userAgreed: false, proposalIssued: false });
  result.evidenceHash = canonicalHash(evidence);
  return result;
}

export function addContextLedgerEntry(context, entry) {
  if (!context) return context;
  context.ledger = appendLedger(context.ledger, entry);
  return context;
}

export function resolveContextRecipe(bean, contextRef) {
  const item = contextRef?.launchItem;
  if (!item?.method) return { ok: false, code: 'slot_required' };
  return { ok: false, code: 'resolver_required', slotKey: item.method, bean };
}
