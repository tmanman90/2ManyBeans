import { appendLedger, MAX_LEDGER_BYTES } from './ruphusEvidence.js';
import { resolveCoffeeReference } from '../../src/lib/ruphus/referenceResolver.js';

const text = (value) => String(value ?? '').trim();
const normalize = (value) => text(value).toLocaleLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const SUPPORTED_PRONOUN = /^(?:this|that|current|earlier|previous)(?:\s+(?:coffee|bean|one))?$|^(?:back\s+to\s+)?the\s+first\s+(?:coffee|bean|one)$/i;
const PRONOUN_PHRASE = /\b(?:this|that|current|earlier|previous)\s+(?:coffee|bean|one)\b/i;
const RECIPE_PRONOUN = /\b(this|that|current)\s+(?:(?:hot|iced)\s+)?(?:(?:kalita(?:\s+(?:155|185))?|v60|aiden)\s+)?(?:trial(?:\s+recipe)?|recipe)\b/i;
const ORDINAL = /\b(?:jar|shelf|bean)\s*#?\s*\d+\b/i;
const OTHER = /\bother\b/i;
const DESCRIPTOR = /^(?:now\s+)?the\s+[a-z0-9][a-z0-9' -]{0,64}\s+one[.!?]?$/i;
const FOCUS_ENTRY = 'coffee_focus';
const REFERENCE_CONSTRAINT_ENTRY = 'coffee_reference_constraint';

function candidateCoffee(coffee, coffeeRef) {
  const coffeeName = text(coffee?.name || coffee?.coffeeName);
  if (!coffeeName || !coffeeRef) return null;
  return { coffeeRef, coffeeName };
}

function refForCoffee(coffee, refs = {}) {
  if (!coffee) return null;
  const direct = text(coffee.refKey || coffee.coffeeRef);
  if (direct && refs[direct] === coffee.id) return direct;
  return Object.entries(refs).find(([, id]) => id && id === coffee.id)?.[0] || null;
}

function exactNameReference(userText, coffees = []) {
  const value = ` ${normalize(userText)} `;
  const matches = coffees.map((coffee) => ({ coffee, name: text(coffee?.name || coffee?.coffeeName), normalized: normalize(coffee?.name || coffee?.coffeeName) }))
    .filter((item) => item.normalized && value.includes(` ${item.normalized} `))
    .sort((left, right) => right.normalized.split(' ').length - left.normalized.split(' ').length);
  if (!matches.length) return null;
  const longest = matches.filter((item) => item.normalized.split(' ').length === matches[0].normalized.split(' ').length);
  return longest.length === 1 ? longest[0].name : null;
}

function currentName({ coffees, ledger, launchContext, refs }) {
  const named = Array.isArray(ledger?.namedCoffees) ? ledger.namedCoffees.at(-1) : null;
  if (named) {
    const match = coffees.find((coffee) => normalize(coffee?.name || coffee?.coffeeName) === normalize(named));
    if (match) return text(match.name || match.coffeeName);
  }
  const launchRef = text(launchContext?.coffeeRef);
  if (launchRef && refs[launchRef]) {
    const match = coffees.find((coffee) => coffee?.id === refs[launchRef]);
    if (match) return text(match.name || match.coffeeName);
  }
  return null;
}

function isSupportedReference(userText, coffees, ledger, launchContext, refs) {
  const value = text(userText).replace(/[.!?]+$/, '').trim();
  if (exactNameReference(value, coffees)) return { reference: exactNameReference(value, coffees) };
  if (ORDINAL.test(value)) return { reference: value.match(ORDINAL)[0] };
  const phrase = value.match(PRONOUN_PHRASE)?.[0];
  if (phrase) return { reference: phrase, current: currentName({ coffees, ledger, launchContext, refs }) };
  const recipePronoun = value.match(RECIPE_PRONOUN);
  if (recipePronoun) return { reference: `${recipePronoun[1]} coffee`, current: currentName({ coffees, ledger, launchContext, refs }) };
  if (SUPPORTED_PRONOUN.test(value) || OTHER.test(value) || DESCRIPTOR.test(value)) {
    return { reference: value, current: currentName({ coffees, ledger, launchContext, refs }) };
  }
  return null;
}

function publicResult(result, refs) {
  if (result?.ok) {
    const coffeeRef = refForCoffee(result.coffee, refs) || text(result.ref);
    const candidate = candidateCoffee(result.coffee, coffeeRef);
    if (candidate) return { status: 'locked', ...candidate, source: result.source, coffee: result.coffee, refs: result.coffee?.id && coffeeRef && !refs[coffeeRef] ? { [coffeeRef]: result.coffee.id } : {} };
  }
  if (result?.reason === 'ambiguous') {
    const candidates = (result.candidates || []).map((item) => {
      const value = candidateCoffee(item.coffee, refForCoffee(item.coffee, refs) || text(item.ref));
      return value ? { ...value, coffee: item.coffee } : null;
    }).filter(Boolean).slice(0, 3);
    if (candidates.length > 1) return { status: 'ambiguous', candidates };
  }
  return { status: 'none' };
}

function activeReferenceConstraint(ledger) {
  return (Array.isArray(ledger?.entries) ? ledger.entries : []).slice().reverse()
    .find((entry) => entry?.kind === REFERENCE_CONSTRAINT_ENTRY && entry?.status === 'ambiguous' && text(entry.summary))?.summary || null;
}

function appendReferenceConstraint(ledger, reference, evidenceByteCap) {
  return appendLedger(ledger, { kind: REFERENCE_CONSTRAINT_ENTRY, status: 'ambiguous', summary: text(reference) }, {
    maxBytes: Math.min(Number(evidenceByteCap) || MAX_LEDGER_BYTES, MAX_LEDGER_BYTES),
  });
}

function retireReferenceConstraints(ledger) {
  if (!Array.isArray(ledger?.entries)) return ledger;
  return { ...ledger, entries: ledger.entries.filter((entry) => entry?.kind !== REFERENCE_CONSTRAINT_ENTRY) };
}

export function bindRuphusTurn({ userText = '', coffees = [], ledger = {}, launchContext = {}, refs = {}, evidenceByteCap = MAX_LEDGER_BYTES } = {}) {
  const inventory = Array.isArray(coffees) ? coffees : [];
  const supported = isSupportedReference(userText, inventory, ledger, launchContext, refs);
  if (!supported) return { status: 'none', ledger, refs: {}, launchHintConsumed: false };
  // A launch coffee is an established current reference even before the
  // first evidence read has populated namedCoffees. Seed only the resolver's
  // local input; the authoritative ledger is updated only after a lock.
  const resolverLedger = supported.current && (!Array.isArray(ledger?.namedCoffees) || !ledger.namedCoffees.length)
    ? { ...ledger, namedCoffees: [supported.current] }
    : ledger;
  const reference = supported.current && /^(?:this|current|that|earlier|previous)\b/i.test(supported.reference)
    ? supported.current
    : supported.reference;
  const priorConstraint = activeReferenceConstraint(resolverLedger);
  const constrainedReference = priorConstraint && DESCRIPTOR.test(supported.reference)
    ? `${priorConstraint} ${supported.reference}`
    : reference;
  const result = resolveCoffeeReference({ reference: constrainedReference, coffees: inventory, ledger: resolverLedger });
  const binding = publicResult(result, refs);
  if (binding.status === 'none') return { status: 'none', ledger, refs: {}, launchHintConsumed: false };
  if (binding.status === 'ambiguous') {
    const nextLedger = DESCRIPTOR.test(supported.reference)
      ? appendReferenceConstraint(retireReferenceConstraints(ledger), constrainedReference, evidenceByteCap)
      : ledger;
    return { ...binding, ledger: nextLedger, refs: {}, launchHintConsumed: false };
  }

  const focusEntry = {
    kind: FOCUS_ENTRY,
    status: 'available',
    namedCoffees: [binding.coffeeName],
    coffee: {
      name: binding.coffeeName,
      ...(text(binding.coffee?.roaster) ? { roaster: text(binding.coffee.roaster) } : {}),
      ...(text(binding.coffee?.origin) ? { origin: text(binding.coffee.origin) } : {}),
      ...(text(binding.coffee?.process) ? { process: text(binding.coffee.process) } : {}),
    },
  };
  const nextLedger = appendLedger(retireReferenceConstraints(ledger), focusEntry, { maxBytes: Math.min(Number(evidenceByteCap) || MAX_LEDGER_BYTES, MAX_LEDGER_BYTES) });
  const launchHintConsumed = Boolean(launchContext?.launchItem && launchContext?.coffeeRef && launchContext.coffeeRef !== binding.coffeeRef);
  return { ...binding, ledger: nextLedger, refs: binding.refs, launchHintConsumed };
}

export const turnBindingReference = Object.freeze({
  supportedPronoun: SUPPORTED_PRONOUN.source,
  ordinal: ORDINAL.source,
  other: OTHER.source,
});
