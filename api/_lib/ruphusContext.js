import { canonicalHash, clone, validateLaunchContext } from '../../src/lib/ruphus/contracts.js';
import { sanitizeEvidence } from '../../src/lib/ruphus/sanitizeEvidence.js';
import { appendLedger, boundLedger, buildRotationSnapshot } from './ruphusEvidence.js';

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

export async function buildRuphusContext({ uid, contextRef = {}, userText = '', conversation = [], ledger = null, readers = {}, evidenceByteCap } = {}) {
  if (!uid || typeof uid !== 'string') throw Object.assign(new Error('owner is required'), { code: 'owner_required' });
  if (contextRef?.uid || contextRef?.ownerId) throw Object.assign(new Error('owner identity is server-bound'), { code: 'forged_owner' });
  const launchValidation = validateLaunchContext(contextRef);
  if (!launchValidation.valid) throw Object.assign(new Error(launchValidation.errors.join('; ')), { code: 'invalid_launch_context' });
  if (typeof readers.listCoffees !== 'function') throw Object.assign(new Error('listCoffees reader is required'), { code: 'inventory_required' });
  const coffees = await readers.listCoffees({ uid });
  const setup = typeof readers.readSetup === 'function' ? await readers.readSetup({ uid }) : {};
  const snapshot = buildRotationSnapshot({ coffees, setup });
  const currentLedger = boundLedger(ledger || contextRef.ledger || {});
  if (!Number.isInteger(evidenceByteCap) || evidenceByteCap < 1) throw Object.assign(new Error('evidence byte cap must be configured'), { code: 'evidence_config_required' });
  const dynamic = safeDynamic({ userText, launchContext: contextRef, conversation, ledger: currentLedger }, evidenceByteCap);
  const launchCoffee = launchCoffeeRef(contextRef, snapshot);
  const normalizedLaunch = { ...clone(dynamic.launchContext), ...(launchCoffee && launchCoffee !== dynamic.launchContext.coffeeRef ? { coffeeRef: launchCoffee } : {}) };
  const evidence = { launchContext: normalizedLaunch, rotationSnapshot: snapshot, ledger: currentLedger, conversation: dynamic.conversation || [], userText: dynamic.userText || '' };
  return {
    version: 2,
    context: normalizedLaunch,
    launchContext: normalizedLaunch,
    rotationSnapshot: snapshot,
    ledger: currentLedger,
    conversation: dynamic.conversation || [],
    userText: dynamic.userText || '',
    evidenceHash: canonicalHash(evidence),
    refs: clone(snapshot.refs),
    launchCoffeeId: launchCoffee,
    trace: { focusChanges: [], reads: [], regenerations: [] },
  };
}

export function addContextLedgerEntry(context, entry) {
  return { ...context, ledger: appendLedger(context?.ledger, entry) };
}

export function resolveContextRecipe(bean, contextRef) {
  const item = contextRef?.launchItem;
  if (!item?.method) return { ok: false, code: 'slot_required' };
  return { ok: false, code: 'resolver_required', slotKey: item.method, bean };
}
