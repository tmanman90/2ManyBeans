import { canonicalHash, clone, validateLaunchContext } from '../../src/lib/ruphus/contracts.js';
import { sanitizeEvidence } from '../../src/lib/ruphus/sanitizeEvidence.js';
import { appendLedger, boundLedger, buildRotationSnapshot, MAX_LEDGER_BYTES, shouldWidenHistory } from './ruphusEvidence.js';
import { bindRuphusTurn } from './ruphusTurnBinder.js';
import { explicitMethodFromText, resolveMethod } from '../../src/lib/ruphus/methodResolver.js';

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
function ledgerCoffeeRef(ledger, coffees, snapshot) {
  const latest = Array.isArray(ledger?.namedCoffees) ? ledger.namedCoffees.at(-1) : null;
  const name = typeof latest === 'string' ? latest : latest?.name;
  if (!name) return null;
  const coffee = coffees.find((item) => String(item?.name || item?.coffeeName || '').trim().toLocaleLowerCase() === String(name).trim().toLocaleLowerCase());
  return coffee ? Object.entries(snapshot.refs || {}).find(([, id]) => id === coffee.id)?.[0] || null : null;
}
function addOwnerLaunchRef(reference, coffees, snapshot) {
  if (!reference || !Array.isArray(coffees)) return null;
  const match = coffees.find((coffee) => coffee?.id === reference || coffee?.refKey === reference);
  if (!match?.id) return null;
  const refKey = `c${canonicalHash({ id: match.id, launch: true }).slice(0, 8)}`;
  snapshot.refs[refKey] = match.id;
  return refKey;
}

function methodFocusForCoffee(ledger, coffeeName) {
  const normalizedName = String(coffeeName || '').trim().toLocaleLowerCase();
  if (!normalizedName || !Array.isArray(ledger?.entries)) return null;
  const entry = ledger.entries.slice().reverse().find((item) => item?.kind === 'method_focus'
    && item?.status === 'available'
    && Array.isArray(item.namedCoffees)
    && item.namedCoffees.some((name) => String(name || '').trim().toLocaleLowerCase() === normalizedName));
  return entry?.methodFocus?.displayName ? { displayName: entry.methodFocus.displayName } : null;
}

function priorExplicitMethod(conversation = []) {
  for (const message of conversation.slice().reverse()) {
    if (message?.role !== 'user') continue;
    const method = explicitMethodFromText(message?.content || message?.text);
    if (method) return method;
  }
  return null;
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
  const launchCoffee = launchCoffeeRef(contextRef, snapshot) || addOwnerLaunchRef(contextRef?.coffeeRef, coffees, snapshot);
  if (contextRef?.coffeeRef && !launchCoffee) throw Object.assign(new Error('launch coffee is outside the owner-scoped context'), { code: 'cross_owner_or_context' });
  const normalizedInternalLaunch = { ...clone(contextRef), ...(launchCoffee && launchCoffee !== contextRef.coffeeRef ? { coffeeRef: launchCoffee } : {}) };
  const turnBinding = bindRuphusTurn({ userText, coffees, ledger: currentLedger, launchContext: normalizedInternalLaunch, refs: snapshot.refs, evidenceByteCap });
  Object.assign(snapshot.refs, turnBinding.refs || {});
  const launchHintConsumed = sessionState?.launchHintConsumed === true || turnBinding.launchHintConsumed === true;
  const launchForTurn = launchHintConsumed && normalizedInternalLaunch.launchItem
    ? { ...normalizedInternalLaunch, launchItem: null }
    : normalizedInternalLaunch;
  const normalizedLaunch = publicLaunchContext(launchForTurn);
  const boundCoffeeRef = turnBinding.status === 'locked' ? turnBinding.coffeeRef : launchCoffee || ledgerCoffeeRef(currentLedger, coffees, snapshot);
  const boundCoffee = (snapshot.coffees || []).find((coffee) => coffee.refKey === boundCoffeeRef);
  const carriedMethod = methodFocusForCoffee(turnBinding.ledger, boundCoffee?.name);
  let resolvedMethod = resolveMethod({
    userText,
    launchItem: launchForTurn.launchItem,
    launchCoffeeRef: launchCoffee,
    coffeeRef: boundCoffeeRef,
    recipeSlots: boundCoffee?.recipes || [],
    defaultMethod: snapshot.setup?.defaultMethod,
    launchHintConsumed,
    methodFocus: carriedMethod,
    methodFocusCoffeeRef: carriedMethod ? boundCoffeeRef : null,
  });
  let methodBinding = resolvedMethod?.slot && ['M1', 'M1b', 'M2'].includes(resolvedMethod.tier)
    ? { status: 'locked', slot: resolvedMethod.slot, displayName: resolvedMethod.displayName, source: resolvedMethod.tier }
    : null;
  if (!methodBinding && /\b(?:not|never|no|didn't|did\s+not|wasn't|was\s+not|isn't|is\s+not|don't|do\s+not)\b[\s\S]*\b(?:aiden|v\s*60|kalita)\b/i.test(userText)) {
    const prior = priorExplicitMethod(Array.isArray(conversation) ? conversation : []);
    if (prior) {
      resolvedMethod = { slot: prior, displayName: displayMethod(prior), tier: 'M1-correction' };
      methodBinding = { status: 'locked', slot: prior, displayName: displayMethod(prior), source: 'M1-correction' };
    }
  }
  let turnLedger = turnBinding.ledger;
  if (methodBinding && boundCoffee?.name) {
    turnLedger = {
      ...turnLedger,
      entries: Array.isArray(turnLedger?.entries) ? turnLedger.entries.filter((entry) => entry?.kind !== 'method_focus') : [],
    };
    turnLedger = appendLedger(turnLedger, { kind: 'method_focus', status: 'available', namedCoffees: [boundCoffee.name], methodFocus: { displayName: methodBinding.displayName } }, { maxBytes: Math.min(evidenceByteCap, MAX_LEDGER_BYTES) });
  }
  const dynamic = safeDynamic({ userText, launchContext: normalizedLaunch, conversation: Array.isArray(conversation) ? conversation.map((item) => ({ role: item?.role, content: item?.content || item?.text })).filter((item) => item.role === 'user' || item.role === 'assistant') : [], ledger: turnLedger }, evidenceByteCap);
  const widened = shouldWidenHistory({ userText: dynamic.userText || '', correction: sessionState?.correction === true || shouldWidenHistory({ userText: dynamic.userText || '' }), olderReference: sessionState?.olderReference === true });
  const safeSnapshot = publicSnapshot(snapshot);
  const publicBinding = turnBinding.status === 'none'
    ? undefined
    : turnBinding.status === 'locked'
      ? { status: 'locked', coffeeRef: turnBinding.coffeeRef, coffeeName: turnBinding.coffeeName }
      : { status: 'ambiguous', candidates: turnBinding.candidates.map(({ coffeeRef, coffeeName }) => ({ coffeeRef, coffeeName })) };
  const trace = { focusChanges: [], reads: [], regenerations: [] };
  if (publicBinding?.status === 'locked') trace.focusChanges.push({ from: launchCoffee || ledgerCoffeeRef(currentLedger, coffees, snapshot) || null, to: publicBinding.coffeeRef, source: 'turn_binding' });
  const evidence = { launchContext: normalizedLaunch, rotationSnapshot: safeSnapshot, ledger: turnLedger, turnBinding: publicBinding || null, methodBinding, conversation: dynamic.conversation || [], userText: dynamic.userText || '', historyWidened: widened };
  const result = {
    version: 2,
    context: normalizedLaunch,
    launchContext: normalizedLaunch,
    rotationSnapshot: safeSnapshot,
    ledger: turnLedger,
    conversation: dynamic.conversation || [],
    userText: dynamic.userText || '',
    evidenceHash: canonicalHash(evidence),
    historyWidened: widened,
    ...(publicBinding ? { turnBinding: publicBinding } : {}),
    ...(methodBinding ? { methodBinding } : {}),
    sessionState: { lastActivityAt: Number.isFinite(Number(sessionState?.lastActivityAt)) ? Number(sessionState.lastActivityAt) : null, boundaryIndex: Number.isInteger(sessionState?.boundaryIndex) ? Math.max(0, sessionState.boundaryIndex) : 0, launchHintConsumed },
  };
  installServerField(result, '__ruphusRefs', clone(snapshot.refs));
  installServerField(result, '__ruphusServerSnapshot', snapshot);
  installServerField(result, '__ruphusLaunchContext', launchForTurn);
  installServerField(result, '__ruphusLaunchHintConsumed', launchHintConsumed);
  installServerField(result, '__ruphusHistoryWidened', widened);
  installServerField(result, '__ruphusEvidenceByteCap', evidenceByteCap);
  installServerField(result, '__ruphusResolvedTargets', new Map());
  installServerField(result, '__ruphusTurnBinding', turnBinding.status === 'none' ? null : turnBinding);
  installServerField(result, '__ruphusMethodBinding', methodBinding);
  installServerField(result, 'launchCoffeeId', launchCoffee);
  installServerField(result, 'trace', trace);
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
