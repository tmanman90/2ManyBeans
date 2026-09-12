import { appendLedger, MAX_LEDGER_BYTES } from './ruphusEvidence.js';
import { resolveCoffeeReference } from '../../src/lib/ruphus/referenceResolver.js';

const text = (value) => String(value ?? '').trim();
const normalize = (value) => text(value).toLocaleLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const SUPPORTED_PRONOUN = /^(?:this|that|current|earlier|previous)(?:\s+(?:coffee|bean|one))?$|^(?:back\s+to\s+)?the\s+first\s+(?:coffee|bean|one)$/i;
const PRONOUN_PHRASE = /\b(?:this|that|current|earlier|previous)\s+(?:coffee|bean|one)\b/i;
const RECIPE_PRONOUN = /\b(this|that|current)\s+(?:(?:hot|iced)\s+)?(?:(?:kalita(?:\s+(?:155|185))?|v60|aiden)\s+)?(?:trial(?:\s+recipe)?|recipe)\b/i;
const CURRENT_RECIPE_ACTION = /^(?:(?:ok(?:ay)?|yes|sure|please)[, ]+)*(?:(?:can|could)\s+(?:we|you)\s+)?(?:update|change|save|apply)\s+(?:my|the|our)\s+recipe(?:\s+please)?$/i;
const ORDINAL = /\b(?:jar|shelf|bean)\s*#?\s*(?:\d+|one|two|three)\b/i;
const OTHER = /\bother\b/i;
const DESCRIPTOR = /^(?:now\s+)?the\s+[a-z0-9][a-z0-9' -]{0,64}\s+one[.!?]?$/i;
const CONTEXTUAL_TECHNIQUE_FOLLOWUP = /^(?:show|give)\s+me\s+(?:another|a\s+different)\s+(?:one|option)[.!?]?$/i;
const TECHNIQUE_COMPARISON_REFERENCE = /^(?:(?:compare|contrast)\s+(?:(?:those|these|the)\s+)?(?:two|both)(?:\s+(?:source\s+)?(?:techniques?|methods?|options?|cards?))?|(?:what(?:'s|\s+is)\s+the\s+difference\s+between)\s+(?:those|these|the\s+two)(?:\s+(?:source\s+)?(?:techniques?|methods?|options?|cards?))?)[.!?]?$/i;
const TECHNIQUE_HISTORY_REFERENCE = /^(?:(?:show|give|tell|describe|inspect|review|open|use|try|brew|prepare|make|pick|choose|revisit|repeat)\s+(?:me\s+)?)*(?:the\s+)?(?:first|1st|second|2nd|third|3rd|last|previous|earlier)\s+(?:one|option|technique|method|card|recipe)(?:\s+(?:again|back|repeat))?[.!?]?$/i;
// A short noun-phrase answer can select one of the source choices named in a
// prior clarification (for example, “Full immersion”). It is only useful
// below when every meaningful token matches exactly one delivered card, so a
// bare phrase never becomes a coffee reference without authenticated history.
const TECHNIQUE_CHOICE_REFERENCE = /^(?:the\s+)?[a-z][a-z0-9' -]{1,48}(?:\s+(?:one|option|technique|method|recipe|trial))?[.!?]?$/i;
const TECHNIQUE_CHOICE_FILLERS = new Set(['a', 'an', 'the', 'one', 'option', 'technique', 'method', 'recipe', 'trial']);
// This is the registry identity for the HARIO Switch 03 instruction-manual
// schedule. Its source label says "instruction-manual immersion" while the
// source stage contract is the full closed immersion, so users may answer a
// clarification with the shorter, source-faithful "full immersion" alias.
// Keep aliases tied to audited source IDs; never manufacture them from chat
// prose or from an arbitrary proposal name.
const TRUSTED_TECHNIQUE_ALIASES = Object.freeze({
  'hario-switch-03-instruction-manual-36-2023': ['full', 'immersion'],
});
const TECHNIQUE_EXPERIMENT_KINDS = new Set(['v60_technique', 'manual_source_technique']);
const DELIVERED_PROPOSAL_STATUSES = new Set(['ready', 'proposed', 'applying', 'applied', 'kept', 'attempt_created', 'prepared']);
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

function deliveredTechniqueProposal(proposal) {
  const experiment = proposal?.techniqueExperiment;
  const hasSelection = [experiment?.techniqueId, experiment?.familyId, experiment?.sourceId]
    .some((value) => typeof value === 'string' && value.trim());
  return proposal?.type === 'recipe_proposal'
    && typeof proposal?.id === 'string' && proposal.id.trim()
    && typeof proposal?.coffeeId === 'string' && proposal.coffeeId.trim()
    && ['v60_hot', 'kalita_hot'].includes(proposal?.slotKey)
    && TECHNIQUE_EXPERIMENT_KINDS.has(experiment?.kind)
    && hasSelection
    && proposal?.before && typeof proposal.before === 'object' && !Array.isArray(proposal.before)
    && proposal?.after && typeof proposal.after === 'object' && !Array.isArray(proposal.after)
    && (proposal.status == null || DELIVERED_PROPOSAL_STATUSES.has(proposal.status));
}

function techniqueOrdinal(value) {
  const match = String(value || '').match(/\b(first|1st|second|2nd|third|3rd|last|previous|earlier)\b/i);
  if (!match) return null;
  if (/^(?:last|previous|earlier)$/i.test(match[1])) return -1;
  return { first: 0, '1st': 0, second: 1, '2nd': 1, third: 2, '3rd': 2 }[match[1].toLocaleLowerCase()] ?? null;
}

function techniqueChoiceMatches(userText, proposal) {
  const requested = normalize(userText).split(/\s+/).filter((token) => token && !TECHNIQUE_CHOICE_FILLERS.has(token));
  if (!requested.length) return false;
  const experiment = proposal?.techniqueExperiment || {};
  const sourceIds = [
    experiment.sourceId,
    proposal?.after?.sourceProjection?.sourceId,
    proposal?.after?.sourceLineage?.sourceId,
    proposal?.after?.sourceId,
  ].filter((value) => typeof value === 'string' && value.trim());
  const reviewed = new Set(normalize([
    experiment.name,
    experiment.techniqueId,
    experiment.familyId,
    experiment.sourceId,
    experiment.differences,
    proposal?.after?.techniqueLabel,
  ].filter(Boolean).join(' ')).split(/\s+/).filter(Boolean));
  sourceIds.forEach((sourceId) => {
    const alias = TRUSTED_TECHNIQUE_ALIASES[sourceId.trim()];
    if (alias) alias.forEach((token) => reviewed.add(token));
  });
  return requested.every((token) => reviewed.has(token));
}

function techniqueProposalIdentity(proposal) {
  const experiment = proposal?.techniqueExperiment || {};
  const sourceId = [
    experiment.sourceId,
    proposal?.after?.sourceProjection?.sourceId,
    proposal?.after?.sourceLineage?.sourceId,
    proposal?.after?.sourceId,
    experiment.familyId,
    experiment.techniqueId,
  ].find((value) => typeof value === 'string' && value.trim());
  return [proposal?.coffeeId, proposal?.slotKey, sourceId?.trim() || 'unknown'].join(':');
}

function contextualTechniqueReference(userText, coffees, ledger, launchContext, refs, priorTechniqueProposals = []) {
  const value = text(userText).replace(/[.!?]+$/, '').trim();
  const contextualAlternative = CONTEXTUAL_TECHNIQUE_FOLLOWUP.test(value);
  const comparison = TECHNIQUE_COMPARISON_REFERENCE.test(value);
  const historical = TECHNIQUE_HISTORY_REFERENCE.test(value);
  const techniqueChoice = !contextualAlternative && !comparison && !historical && TECHNIQUE_CHOICE_REFERENCE.test(value);
  if (!contextualAlternative && !comparison && !historical && !techniqueChoice) return null;
  const proposals = (Array.isArray(priorTechniqueProposals) ? priorTechniqueProposals : [])
    .filter(deliveredTechniqueProposal)
    .map((proposal) => ({ proposal, coffee: coffees.find((item) => item?.id === proposal.coffeeId) }))
    .filter((item) => item.coffee);
  if (!proposals.length) return null;
  const current = currentName({ coffees, ledger, launchContext, refs });
  const scoped = current
    ? proposals.filter(({ coffee }) => normalize(coffee?.name || coffee?.coffeeName) === normalize(current))
    : proposals;
  if (!scoped.length) return null;
  if (!current && new Set(scoped.map(({ coffee }) => coffee.id)).size > 1) return null;
  let selected;
  if (comparison) {
    // “Those two” is only meaningful when the two most recent delivered
    // cards are for the same coffee and saved brewer. Otherwise leave the
    // provider to ask rather than guessing across coffees or methods.
    const pair = scoped.slice(-2);
    if (pair.length !== 2 || new Set(pair.map(({ coffee }) => coffee.id)).size !== 1
      || new Set(pair.map(({ proposal }) => proposal.slotKey)).size !== 1) return null;
    selected = pair.at(-1);
  } else if (historical) {
    const ordinal = techniqueOrdinal(value);
    selected = ordinal === -1 ? scoped.at(-1) : ordinal == null ? null : scoped[ordinal];
    if (!selected) return null;
  } else if (techniqueChoice) {
    // A session may retain several preview revisions of the same source
    // card. They are one contextual choice, not separate coffee candidates;
    // retain the newest representative while keeping distinct coffees,
    // slots, and source identities ambiguous.
    const matches = [];
    const seen = new Set();
    for (const item of scoped.filter(({ proposal }) => techniqueChoiceMatches(value, proposal)).reverse()) {
      const identity = techniqueProposalIdentity(item.proposal);
      if (seen.has(identity)) continue;
      seen.add(identity);
      matches.unshift(item);
    }
    if (matches.length !== 1) return null;
    selected = matches[0];
  } else {
    selected = scoped.at(-1);
  }
  const coffeeName = text(selected.coffee?.name || selected.coffee?.coffeeName);
  if (!coffeeName) return null;
  return { reference: coffeeName, current: coffeeName, techniqueSlot: selected.proposal.slotKey, techniqueKind: selected.proposal.techniqueExperiment.kind };
}

function isSupportedReference(userText, coffees, ledger, launchContext, refs, priorTechniqueProposals = []) {
  const value = text(userText).replace(/[.!?]+$/, '').trim();
  if (exactNameReference(value, coffees)) return { reference: exactNameReference(value, coffees) };
  if (ORDINAL.test(value)) return { reference: value.match(ORDINAL)[0] };
  if (CURRENT_RECIPE_ACTION.test(value)) {
    const current = currentName({ coffees, ledger, launchContext, refs });
    return current ? { reference: 'current coffee', current } : null;
  }
  const phrase = value.match(PRONOUN_PHRASE)?.[0];
  if (phrase) return { reference: phrase, current: currentName({ coffees, ledger, launchContext, refs }) };
  const recipePronoun = value.match(RECIPE_PRONOUN);
  if (recipePronoun) return { reference: `${recipePronoun[1]} coffee`, current: currentName({ coffees, ledger, launchContext, refs }) };
  if (SUPPORTED_PRONOUN.test(value) || OTHER.test(value) || DESCRIPTOR.test(value)) {
    return { reference: value, current: currentName({ coffees, ledger, launchContext, refs }) };
  }
  return contextualTechniqueReference(value, coffees, ledger, launchContext, refs, priorTechniqueProposals);
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

export function bindRuphusTurn({ userText = '', coffees = [], ledger = {}, launchContext = {}, refs = {}, evidenceByteCap = MAX_LEDGER_BYTES, priorTechniqueProposals = [] } = {}) {
  const inventory = Array.isArray(coffees) ? coffees : [];
  const supported = isSupportedReference(userText, inventory, ledger, launchContext, refs, priorTechniqueProposals);
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
  if (supported.techniqueSlot && binding.status === 'locked') {
    binding.techniqueSlot = supported.techniqueSlot;
    binding.techniqueKind = supported.techniqueKind;
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
