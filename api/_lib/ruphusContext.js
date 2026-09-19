import { canonicalHash, clone, validateLaunchContext } from '../../src/lib/ruphus/contracts.js';
import { sanitizeEvidence } from '../../src/lib/ruphus/sanitizeEvidence.js';
import { appendLedger, boundLedger, buildRotationSnapshot, MAX_LEDGER_BYTES, shouldWidenHistory } from './ruphusEvidence.js';
import { bindRuphusTurn } from './ruphusTurnBinder.js';
import { equipmentClarificationAnswer, explicitMethodFromText, resolveMethod } from '../../src/lib/ruphus/methodResolver.js';
import { absentRecipeSourceHash } from '../../src/lib/ruphus/recipeSourceState.js';

function safeDynamic({ userText, launchContext, conversation, ledger }, maxBytes) {
  // The transcript is durable; only its provider projection is windowed. A
  // growing restored chat must not turn an ordinary send into an HTTP 400.
  let recent = conversation.slice();
  let memory = ledger;
  const sanitize = () => sanitizeEvidence({ userText, launchContext, conversation: recent, ledger: memory }, { maxBytes });
  let dynamic = sanitize();
  while (dynamic.truncated) {
    const nextTurn = recent.findIndex((message, index) => index > 0 && message.role === 'user');
    if (nextTurn < 0) break;
    recent = recent.slice(nextTurn);
    dynamic = sanitize();
  }
  // Reserve space for the latest exchange and the current request before
  // older memory. Coffee/method bindings were already resolved from the full
  // history; stored messages and authority-bearing trial receipts stay intact.
  while (dynamic.truncated && memory?.entries?.length) {
    memory = boundLedger({ entries: memory.entries.slice(1) });
    dynamic = sanitize();
  }
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
const EDITABLE_REVIEW_STATUSES = new Set(['proposed', 'ready', 'prepared']);
function reviewIdentity(recipe, slot) {
  const mode = recipe?.mode || (slot?.endsWith('_iced') ? 'iced' : 'hot');
  const variant = slot?.startsWith('v60') ? String(recipe?.variant || recipe?.v60Variant || 'classic').toLowerCase() : null;
  const size = slot?.startsWith('v60')
    ? String(recipe?.v60Size || recipe?.size || (variant === 'switch' ? '03' : '02'))
    : slot?.startsWith('kalita') ? String(recipe?.kalitaSize || recipe?.size || '') : null;
  return { mode, variant, size };
}
function reviewDisplayName(item) {
  const slot = item?.slotKey;
  const identity = reviewIdentity(item?.after, slot);
  if (slot?.startsWith('v60') && identity.variant === 'switch') {
    return slot === 'v60_hot' && identity.size === '03' ? 'hot Switch 03' : null;
  }
  if (slot?.startsWith('v60') && identity.variant === 'classic' && identity.size === '02') return displayMethod(slot);
  if (slot?.startsWith('kalita') && ['155', '185'].includes(identity.size)) {
    return `${slot.endsWith('_iced') ? 'iced' : 'hot'} Kalita ${identity.size}`;
  }
  return null;
}
function methodBindingMatchesReview(displayName, expectedDisplay, slot) {
  const bound = String(displayName || '').trim();
  if (!bound || !expectedDisplay) return false;
  if (bound === expectedDisplay) return true;
  // Context reconstruction often has only the M2 family/mode binding. Let a
  // trusted review refine that binding with its authenticated size; detailed
  // equipment bindings remain exact and cannot cross 155/185 or Switch/classic.
  return bound === displayMethod(slot) && expectedDisplay.startsWith(`${bound} `);
}
function currentReviewContext({ proposals = [], coffeeId, methodBinding } = {}) {
  if (!coffeeId || !methodBinding?.slot) return null;
  return proposals.slice().reverse().find((item) => {
    if (item?.type !== 'recipe_proposal' || item.coffeeId !== coffeeId || item.slotKey !== methodBinding.slot
      || !EDITABLE_REVIEW_STATUSES.has(item.status) || !item.after || typeof item.after !== 'object' || Array.isArray(item.after)) return false;
    if (item.sourceState === 'absent' && (item.before !== null || item.sourceHash !== absentRecipeSourceHash(item.slotKey))) return false;
    if (item.sourceState !== 'absent' && (!item.before || typeof item.before !== 'object' || Array.isArray(item.before))) return false;
    const expectedDisplay = reviewDisplayName(item);
    return reviewIdentity(item.after, item.slotKey).mode === (item.slotKey.endsWith('_iced') ? 'iced' : 'hot')
      && methodBindingMatchesReview(methodBinding.displayName, expectedDisplay, item.slotKey);
  }) || null;
}
function carriedReviewMethod({ proposals = [], coffeeId } = {}) {
  if (!coffeeId) return null;
  const item = proposals.slice().reverse().find((candidate) => {
    if (candidate?.type !== 'recipe_proposal' || candidate.coffeeId !== coffeeId
      || !EDITABLE_REVIEW_STATUSES.has(candidate.status) || !candidate.after || typeof candidate.after !== 'object' || Array.isArray(candidate.after)) return false;
    if (candidate.sourceState === 'absent' && (candidate.before !== null || candidate.sourceHash !== absentRecipeSourceHash(candidate.slotKey))) return false;
    if (candidate.sourceState !== 'absent' && (!candidate.before || typeof candidate.before !== 'object' || Array.isArray(candidate.before))) return false;
    return Boolean(reviewDisplayName(candidate));
  });
  return item ? { slot: item.slotKey, displayName: reviewDisplayName(item), proposalId: item.id } : null;
}
function publicCurrentReview(item) {
  if (!item) return null;
  const identity = reviewIdentity(item.after, item.slotKey);
  return {
    editable: true,
    status: item.status,
    sourceState: item.sourceState || 'present',
    slot: item.slotKey,
    mode: identity.mode,
    ...(identity.variant ? { variant: identity.variant } : {}),
    ...(identity.size ? { size: identity.size } : {}),
  };
}
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

export async function buildRuphusContext({ uid, contextRef = {}, userText = '', conversation = [], ledger = null, readers = {}, evidenceByteCap, sessionState = null, priorTechniqueProposals = [] } = {}) {
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
  const equipmentAnswer = equipmentClarificationAnswer(userText, conversation);
  const turnBinding = bindRuphusTurn({ userText: equipmentAnswer ? 'this coffee' : userText, coffees, ledger: currentLedger, launchContext: normalizedInternalLaunch, refs: snapshot.refs, evidenceByteCap, priorTechniqueProposals });
  Object.assign(snapshot.refs, turnBinding.refs || {});
  const launchHintConsumed = sessionState?.launchHintConsumed === true || turnBinding.launchHintConsumed === true;
  const launchForTurn = launchHintConsumed && normalizedInternalLaunch.launchItem
    ? { ...normalizedInternalLaunch, launchItem: null }
    : normalizedInternalLaunch;
  const normalizedLaunch = publicLaunchContext(launchForTurn);
  const boundCoffeeRef = turnBinding.status === 'locked' ? turnBinding.coffeeRef : launchCoffee || ledgerCoffeeRef(currentLedger, coffees, snapshot);
  const boundCoffee = (snapshot.coffees || []).find((coffee) => coffee.refKey === boundCoffeeRef)
    || (turnBinding.status === 'locked' && turnBinding.coffee?.id && snapshot.refs?.[boundCoffeeRef] === turnBinding.coffee.id ? turnBinding.coffee : null);
  // A conditional candidate is useful for clarification, but must not become
  // the active coffee merely because it is the only resolver match.
  const boundCoffeeName = boundCoffee?.name || (turnBinding.status === 'locked' ? turnBinding.coffeeName : null);
  const carriedReview = carriedReviewMethod({ proposals: priorTechniqueProposals, coffeeId: boundCoffeeRef ? snapshot.refs?.[boundCoffeeRef] : null });
  const carriedMethod = carriedReview
    || methodFocusForCoffee(turnBinding.ledger, boundCoffeeName)
    || (turnBinding.status === 'locked' && turnBinding.techniqueSlot ? { displayName: displayMethod(turnBinding.techniqueSlot) } : null);
  let resolvedMethod = resolveMethod({
    userText,
    explicitSlot: equipmentAnswer?.slot,
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
  if (methodBinding?.source === 'M2' && carriedMethod?.displayName && /^(?:hot|iced) Kalita (?:155|185)$/.test(carriedMethod.displayName)
    && methodBinding.slot?.startsWith('kalita')) methodBinding = { ...methodBinding, displayName: carriedMethod.displayName };
  if (methodBinding && equipmentAnswer) methodBinding = { ...methodBinding, displayName: equipmentAnswer.variant === 'switch' ? `hot Switch ${equipmentAnswer.size}` : `hot Kalita ${equipmentAnswer.size}`, source: 'equipment-answer' };
  if (methodBinding?.slot?.startsWith('kalita')) {
    const explicitKalitaSize = String(userText || '').match(/\b(?:kalita|wave)\s*(155|185)\b/i)?.[1];
    if (explicitKalitaSize && !equipmentAnswer) methodBinding = { ...methodBinding, displayName: `${methodBinding.slot.endsWith('_iced') ? 'iced' : 'hot'} Kalita ${explicitKalitaSize}` };
  }
  const currentReviewArtifact = currentReviewContext({ proposals: priorTechniqueProposals, coffeeId: boundCoffeeRef ? snapshot.refs?.[boundCoffeeRef] : null, methodBinding });
  const currentReview = publicCurrentReview(currentReviewArtifact);
  if (!methodBinding && /\b(?:not|never|no|didn't|did\s+not|wasn't|was\s+not|isn't|is\s+not|don't|do\s+not)\b[\s\S]*\b(?:aiden|v\s*60|kalita)\b/i.test(userText)) {
    const prior = priorExplicitMethod(Array.isArray(conversation) ? conversation : []);
    if (prior) {
      resolvedMethod = { slot: prior, displayName: displayMethod(prior), tier: 'M1-correction' };
      methodBinding = { status: 'locked', slot: prior, displayName: displayMethod(prior), source: 'M1-correction' };
    }
  }
  let turnLedger = turnBinding.ledger;
  if (methodBinding && boundCoffeeName) {
    turnLedger = {
      ...turnLedger,
      entries: Array.isArray(turnLedger?.entries) ? turnLedger.entries.filter((entry) => entry?.kind !== 'method_focus') : [],
    };
    turnLedger = appendLedger(turnLedger, { kind: 'method_focus', status: 'available', namedCoffees: [boundCoffeeName], methodFocus: { displayName: methodBinding.displayName } }, { maxBytes: Math.min(evidenceByteCap, MAX_LEDGER_BYTES) });
  }
  const dynamic = safeDynamic({ userText, launchContext: normalizedLaunch, conversation: Array.isArray(conversation) ? conversation.map((item) => ({ role: item?.role, content: item?.content || item?.text })).filter((item) => item.role === 'user' || item.role === 'assistant') : [], ledger: turnLedger }, evidenceByteCap);
  turnLedger = dynamic.ledger;
  const widened = shouldWidenHistory({ userText: dynamic.userText || '', correction: sessionState?.correction === true || shouldWidenHistory({ userText: dynamic.userText || '' }), olderReference: sessionState?.olderReference === true });
  const safeSnapshot = publicSnapshot(snapshot);
  const publicBinding = turnBinding.status === 'none'
    ? undefined
    : turnBinding.status === 'locked'
      ? { status: 'locked', coffeeRef: turnBinding.coffeeRef, coffeeName: turnBinding.coffeeName }
      : { status: 'ambiguous', ...(turnBinding.certainty ? { certainty: turnBinding.certainty } : {}), candidates: turnBinding.candidates.map(({ coffeeRef, coffeeName }) => ({ coffeeRef, coffeeName })) };
  const trace = { focusChanges: [], reads: [], regenerations: [] };
  if (publicBinding?.status === 'locked') trace.focusChanges.push({ from: launchCoffee || ledgerCoffeeRef(currentLedger, coffees, snapshot) || null, to: publicBinding.coffeeRef, source: 'turn_binding' });
  const evidence = { launchContext: normalizedLaunch, rotationSnapshot: safeSnapshot, ledger: turnLedger, turnBinding: publicBinding || null, methodBinding, equipmentAnswer, ...(currentReview ? { currentReview } : {}), conversation: dynamic.conversation || [], userText: dynamic.userText || '', historyWidened: widened };
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
    ...(equipmentAnswer ? { equipmentAnswer } : {}),
    ...(currentReview ? { currentReview } : {}),
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
  installServerField(result, 'proposalState', { target: null, diagnosisReady: false, userAgreed: false, proposalIssued: false, ...(currentReview ? { currentReview } : {}) });
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
