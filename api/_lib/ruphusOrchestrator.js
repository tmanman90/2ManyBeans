import { createLifecycleFrame, RUPHUS_CONTRACT_VERSION, SLOT_KEYS } from '../../src/lib/ruphus/contracts.js';
import { gradeReply, isTechniqueExplorationRequest, runtimeTriggers } from '../../src/lib/ruphus/conversationContract.js';
import { isContextualTechniqueFollowupRequest, isExplicitTechniqueReuseRequest, isHistoricalTechniqueInspectionRequest, RUPHUS_FORBIDDEN_TOOL_NAMES } from './ruphusTools.js';
import { aggregateProviderRetryCount, aggregateProviderUsage } from './ruphusRollout.js';
import { MAX_READS_PER_TURN, MAX_TOOL_ROUNDS } from './ruphusEvidence.js';
import { mentionedMethodSlots } from '../../src/lib/ruphus/methodResolver.js';
import { isOdeStep } from '../../src/lib/brewMethods.js';

const READS = new Set(['resolve_coffee', 'read_coffee_evidence', 'read_recipe', 'read_technique_options', 'review_trial_recipe']);
const SEVERE_SECOND_FAILURES = new Set([
  'CF5_MACHINE_TOKEN', 'CF5_OPAQUE_REFERENCE', 'CF5_SECRET', 'CF5_DRAFT_LEAK',
  'CF6_JSON_PROSE', 'CF6_PROPOSAL_PROSE', 'RT2_FALSE_AUTHORITY', 'CF4_FALSE_AUTHORITY',
  'RT6_METHOD_CONTRADICTION',
]);
// These are expected proposal-validation outcomes. They may be corrected once
// from the same exact evidence; owner, target, stale, timing, and transport
// failures remain terminal and must never earn a second proposal attempt.
const PROPOSAL_RECOVERABLE_FAILURES = new Set([
  'duplicate_alternative', 'invalid_dose_preview', 'invalid_proposal',
  'invalid_proposal_intent', 'invalid_ratio_preview', 'no_recipe_change',
  'one_change_required', 'technique-conflict', 'unsupported-dose-profile', 'invalid_aiden_change', 'invalid_aiden_candidate',
]);
const TECHNIQUE_RECOVERY = 'I can explain a different source-backed technique for this brewer, but I couldn’t prepare its review recipe safely. Your saved recipe is unchanged.';
const CARD_RECOVERY = 'I haven’t prepared a recipe card yet. Your saved recipe is unchanged.';
const PREPARATION_CLAIM = /\b(?:prepared\s*:\s*|prepared\s+(?:the\s+)?(?:recipe|card|schedule)|prepared\s+for\s+review|ready\s+to\s+review|full\s+adapted\s+schedule\s+is\s+ready)\b/i;
const SAFE_FAILURE_MESSAGES = Object.freeze({
  provider_schema: 'I couldn’t finish a reliable answer from the response. Your message is kept.',
  provider_refusal: 'I couldn’t finish a reliable answer from the response. Your message is kept.',
  provider_incomplete: 'I couldn’t finish a reliable answer from the response. Your message is kept.',
  provider_transport: 'The coffee coach is temporarily unavailable. Your message is kept—tap retry when you’re ready.',
  provider_timeout: 'The coffee coach took too long to finish. Your message is kept—tap retry.',
  provider_unavailable: 'The coffee coach is temporarily unavailable. Your message is kept—tap retry.',
  provider_rate_limited: 'The coffee coach is busy right now. Your message is kept—try again in a moment.',
  provider_call_limit: 'I couldn’t finish that recipe within this turn. Your message is kept—tap retry.',
  response_validation_failed: 'I couldn’t finish a reliable answer. Your message is kept.',
  proposal_target_stale: 'That recipe changed while I was checking it. Your message is kept—tap retry to refresh it.',
  read_timeout: 'I couldn’t check that coffee’s records right now. Your message is kept—tap retry.',
});
const safeFailureMessage = (error, fallback = 'I couldn’t complete that safely. Your saved recipe is unchanged.') => SAFE_FAILURE_MESSAGES[error?.code]
  || (error?.code === 'tool_round_limit' ? 'I couldn’t complete that within the safe read limit. Your saved recipe is unchanged.' : fallback);
const safeRecoveryText = (value, fallback = CARD_RECOVERY) => {
  const text = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  if (!text || text.length > 280 || /[{}[\]<>`]/.test(text)
    || runtimeTriggers({ reply: text, userTurn: '' }).length
    || /\b(?:internal|debug|provider|tool|function|credential|secret|stack|trace|hash)\b/i.test(text)) return fallback;
  return text;
};
const safeProposalExplanation = (value) => {
  if (typeof value !== 'string') return null;
  const text = value.trim().replace(/\s+/g, ' ');
  if (!text || text.length > 280 || /[<>`]/.test(text)) return null;
  return text;
};
const techniqueRequest = (value, context = null, target = null) => isTechniqueExplorationRequest(value || '')
  || isExplicitTechniqueReuseRequest(value || '')
  || isContextualTechniqueFollowupRequest(value || '', context, target || undefined)
  || Boolean(context?.proposalState?.techniqueReady?.optionIds?.length);

function contextualTechniqueReadRequired({ userText = '', context = null, toolEvidence = [] } = {}) {
  const binding = context?.__ruphusTurnBinding;
  const target = proposalTarget(context?.proposalState);
  if (!target?.coffeeRef || !target?.slot
    || binding?.status !== 'locked'
    || !binding.techniqueSlot
    || binding.coffeeRef !== target.coffeeRef
    || binding.techniqueSlot !== target.slot
    || !isContextualTechniqueFollowupRequest(userText || context?.userText || '', context, target)) return false;
  const existingTechniqueRead = [...toolEvidence].reverse().find((item) => item?.name === 'read_technique_options'
    && item.result?.coffeeRef === target.coffeeRef
    && item.result?.slot === target.slot);
  if (existingTechniqueRead) return false;
  const evidence = [...toolEvidence].reverse().find((item) => item?.name === 'read_coffee_evidence'
    && item.result?.coffeeRef === target.coffeeRef
    && item.result?.method?.slot === target.slot);
  return Boolean(evidence);
}

function historicalTechniqueTarget(context) {
  const target = proposalTarget(context?.proposalState);
  if (target.coffeeRef && target.slot) return target;
  const binding = context?.__ruphusTurnBinding;
  return binding?.status === 'locked' && binding.coffeeRef && binding.techniqueSlot
    ? { coffeeRef: binding.coffeeRef, slot: binding.techniqueSlot }
    : null;
}

function historicalTechniqueReadRequired({ userText = '', context = null, toolEvidence = [] } = {}) {
  if (!isHistoricalTechniqueInspectionRequest(userText || context?.userText || '')) return null;
  const binding = context?.__ruphusTurnBinding;
  const target = historicalTechniqueTarget(context);
  if (binding?.status !== 'locked' || !binding.techniqueSlot || !target
    || binding.coffeeRef !== target.coffeeRef || binding.techniqueSlot !== target.slot) return null;
  const existingRead = [...toolEvidence].reverse().find((item) => item?.name === 'read_technique_options'
    && item.result?.coffeeRef === target.coffeeRef
    && item.result?.slot === target.slot);
  if (existingRead) return null;
  const review = (Array.isArray(context?.proposalReviews) ? context.proposalReviews : [])
    .find((item) => item?.coffeeRef === target.coffeeRef && item?.slot === target.slot
      && (item?.sourceId || ['v60_technique', 'manual_source_technique'].includes(item?.techniqueExperiment?.kind))
      && (item?.proposalId || item?.artifactId));
  return review ? target : null;
}

function cancelledError() {
  return Object.assign(new Error('turn cancelled'), { code: 'turn_cancelled' });
}

export function methodBindingTriggers({ reply = '', binding = null } = {}) {
  if (binding?.status !== 'locked' || !binding.slot) return [];
  // Memory is a starting point, not an instruction in the current message.
  // Exact recipe reads and proposal validation still bind all action targets.
  if (binding.source === 'M2') return [];
  const mentioned = mentionedMethodSlots(reply, { ignoreExplicitlyRejected: true });
  // Mentioning another brewer while discussing the bound one is not proof of
  // substitution (comparisons and explanations routinely require both). Only
  // an exclusive off-target answer earns this prose check. Action authority is
  // enforced independently by exact read/proposal targets.
  if (mentioned.includes(binding.slot)) return [];
  const incompatible = mentioned.filter((slot) => slot !== binding.slot);
  return incompatible.length ? [{ code: 'RT6_METHOD_CONTRADICTION', severity: 'catastrophic', methods: incompatible }] : [];
}

function groundedClaimTriggers({ reply = '', context = null } = {}) {
  const grinder = context?.rotationSnapshot?.setup?.grinder
    || context?.__ruphusServerSnapshot?.setup?.grinder
    || context?.setup?.grinder;
  if (grinder !== 'fellow-ode-gen2') return [];
  const invalid = String(reply || '').split(/[!?]+|\.(?=\s|$)/).some((sentence) => {
    if (!/\b(?:grind|grinder|ode|setting|clicks?|notches?)\b/i.test(sentence)) return false;
    const values = [];
    for (const match of sentence.matchAll(/\b(?:grind(?:er)?(?:\s+(?:setting|at|to|from|of))?|setting|ode(?:\s+gen\s*2)?)\s*(?:at|to|from|of|:)?\s*(\d+(?:\.\d+)?)/gi)) {
      const suffix = sentence.slice(match.index + match[0].length);
      if (!/^\s*(?:microns?\b|µm\b|°|[cfg]\b|ml\b|:|clicks?\b|notches?\b)/i.test(suffix)) values.push(Number(match[1]));
    }
    return values.some((value) => !isOdeStep(value));
  });
  return invalid ? [{ code: 'RT7_UNGROUNDED_GRINDER_STEP', severity: 'catastrophic' }] : [];
}

function checkedTriggers({ reply, userTurn, trace, evidence, methodBinding, context }) {
  return [...runtimeTriggers({ reply, userTurn, trace, evidence }), ...methodBindingTriggers({ reply, binding: methodBinding }), ...groundedClaimTriggers({ reply, context })];
}

function runtimeEvidence(toolEvidence = []) {
  const combined = {};
  for (const item of toolEvidence) {
    const result = item?.result;
    if (!result || typeof result !== 'object') continue;
    for (const kind of ['coffee', 'recipe', 'brews', 'tastings']) {
      if (result[kind] && typeof result[kind] === 'object') combined[kind] = result[kind];
      else if (result.unavailable?.includes(kind)) combined[kind] = { status: 'unavailable' };
    }
  }
  combined.unavailable = Object.entries(combined).filter(([, entry]) => entry?.status === 'unavailable').map(([kind]) => kind);
  return combined;
}

export function ambiguityClarification(candidates = []) {
  const labels = candidates.slice(0, 2).map((candidate) => {
    const name = String(candidate?.name || '').trim();
    const process = String(candidate?.process || '').trim();
    return name ? `${name}${process ? `, the ${process} one` : ''}` : '';
  }).filter(Boolean);
  const reply = labels.length > 1 ? `Which do you mean: ${labels[0]}, or ${labels[1]}?` : 'Which coffee do you mean?';
  return runtimeTriggers({ reply }).length ? 'Which coffee do you mean?' : reply;
}

function proposalTarget(state) {
  const target = state?.target || {};
  return {
    coffeeRef: state?.targetCoffeeRef || target.coffeeRef || null,
    slot: state?.targetSlot || state?.slot || target.slot || target.slotKey || null,
  };
}

function proposalValue(recipe = {}, control) {
  const typed = recipe[control];
  if (typed && typeof typed === 'object' && 'value' in typed) {
    if (!['C', 'F', 'g', 'mL', 'ml', 'µm', 'microns'].includes(typed.unit)) return null;
    return ['number', 'string'].includes(typeof typed.value) ? typed.value : null;
  }
  if (control === 'dose') return recipe.coffeeGrams ?? recipe.userCoffeeGrams ?? recipe.dose ?? null;
  if (control === 'water') return recipe.waterGrams ?? recipe.water ?? null;
  if (control === 'grind') return recipe.grindSize?.setting ?? recipe.grind ?? null;
  if (control === 'temperature') return recipe.waterTemp?.celsius ?? recipe.temperatureC ?? recipe.temperature ?? null;
  if (control === 'ratio') return recipe.ratio ?? null;
  return null;
}

function proposalUnit(control, recipe = {}) {
  const nativeUnit = recipe[control]?.unit;
  if (nativeUnit === 'C' || nativeUnit === 'F') return `°${nativeUnit}`;
  if (['g', 'mL', 'ml', 'µm', 'microns'].includes(nativeUnit)) return nativeUnit;
  if (control === 'dose' || control === 'water') return 'g';
  if (control === 'temperature') return '°C';
  return '';
}

function recipeRatio(recipe = {}) {
  const declared = recipe.ratio ?? recipe.finalBeverageRatio;
  const match = String(declared ?? '').match(/(?:1\s*[:/]\s*)?([0-9]+(?:\.[0-9]+)?)/);
  const value = match ? Number(match[1]) : Number(recipe.waterGrams ?? recipe.water) / Number(recipe.coffeeGrams ?? recipe.userCoffeeGrams ?? recipe.dose);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function displayRatio(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/u, '');
}

export function proposalHandoff(artifact = {}, { includeDifference = true } = {}) {
  const withExplanation = (handoff) => {
    const explanation = safeProposalExplanation(artifact.explanation);
    return explanation ? `${explanation} ${handoff}` : handoff;
  };
  const technique = artifact.techniqueExperiment;
  if (artifact.slotKey === 'aiden') {
    if (artifact.sourceState === 'absent' && artifact.before == null) {
      return withExplanation('Here’s a new Aiden profile to review. Nothing has been saved; saving it and preparing it in Fellow are separate choices.');
    }
    const before = artifact.before || {};
    const after = artifact.after || {};
    const change = before.ratio !== after.ratio
      ? `ratio 1:${before.ratio} → 1:${after.ratio}`
      : 'temperature curve, keeping the ratio and pulse timing unchanged';
    return withExplanation(`Here’s the Aiden profile with the adjusted ${change}. Review it below; saving it and preparing it in Fellow are separate choices.`);
  }
  if (['v60_technique', 'manual_source_technique'].includes(technique?.kind)) {
    const name = String(technique.name || 'this coffee approach').trim();
    // One explanation source per handoff: model rationale and registry
    // difference often describe the same technique in slightly different words.
    const rationale = safeProposalExplanation(artifact.explanation)
      || (includeDifference && Array.isArray(technique.differences) ? technique.differences[0] : null);
    return `Try ${name}.${rationale ? ` ${rationale}` : ''} Here’s the recipe to review.`;
  }
  if (artifact.sourceState === 'absent' && artifact.before == null) {
    return withExplanation('Here’s your recipe draft to review. Nothing has been saved.');
  }
  const rawControl = String(artifact.changedPaths?.[0] || '').split('.')[0];
  const control = rawControl === 'coffeeGrams' || rawControl === 'userCoffeeGrams' ? 'dose'
    : rawControl === 'waterGrams' ? 'water'
      : rawControl === 'grindSize' ? 'grind'
        : rawControl === 'waterTemp' || rawControl === 'temperatureC' ? 'temperature'
          : ['dose', 'water', 'grind', 'temperature', 'ratio'].includes(rawControl) ? rawControl : null;
  const before = control ? proposalValue(artifact.before, control) : null;
  const after = control ? proposalValue(artifact.after, control) : null;
  if (!control || before == null || after == null) return withExplanation('I’ve prepared one recipe change for you to review. It has not been applied.');
  if (['dose', 'water', 'ratio'].includes(control)) {
    const beforeRatio = recipeRatio(artifact.before);
    const afterRatio = recipeRatio(artifact.after);
    if (beforeRatio != null && afterRatio != null) {
      const detail = control === 'dose'
        ? ` That changes your dose from ${before} g to ${after} g for the same water.`
        : control === 'water' && proposalValue(artifact.after, 'dose') != null
          ? ` At your current ${proposalValue(artifact.after, 'dose')} g dose, that's ${after} g of water.`
          : '';
      return withExplanation(`Try a 1:${displayRatio(afterRatio)} ratio instead of 1:${displayRatio(beforeRatio)}.${detail} Open the recipe to choose your dose and review the pours; nothing is saved yet.`);
    }
  }
  const beforeUnit = proposalUnit(control, artifact.before);
  const afterUnit = proposalUnit(control, artifact.after);
  const unchanged = ['dose', 'water', 'grind', 'temperature']
    .filter((item) => item !== control && proposalValue(artifact.before, item) != null && proposalValue(artifact.before, item) === proposalValue(artifact.after, item)
      && proposalUnit(item, artifact.before) === proposalUnit(item, artifact.after))
    .slice(0, 3);
  const unchangedList = unchanged.length > 2 ? `${unchanged.slice(0, -1).join(', ')}, and ${unchanged.at(-1)}` : unchanged.join(' and ');
  const unchangedText = unchanged.length ? ` ${unchangedList[0].toUpperCase()}${unchangedList.slice(1)} stay${unchanged.length === 1 ? 's' : ''} the same.` : '';
  return withExplanation(`Prepared: change the ${control} from ${before}${beforeUnit} to ${after}${afterUnit}.${unchangedText} Review it before applying.`);
}

function appendHandoff(current, handoff) {
  return [String(current || '').trim(), String(handoff || '').trim()].filter(Boolean).join(' ');
}

/**
 * Proposal eligibility is a trusted, target-bound context input. The
 * conversation transcript is deliberately not consulted: an old diagnosis
 * or agreement about another coffee must not authorize this turn.
 *
 * Main-lane input contract:
 * { proposalState: { target: { coffeeRef, slot }, previewReady: true,
 *   proposalIssued?: false } } or a target-bound techniqueReady record with
 *   the selected option identity. A typed recipe_preview additionally needs
 *   an exact owner-bound recipe in __ruphusResolvedTargets.
 */
export function proposalEligibleForTarget(context, request = {}) {
  const state = context?.proposalState;
  if (!state || state.proposalIssued === true || state.issued === true) return false;
  const target = proposalTarget(state);
  const requestCoffeeRef = request?.coffeeRef || null;
  const requestSlot = request?.slot || request?.slotKey || null;
  const diagnosis = state.diagnosis || {};
  const agreement = state.agreement || {};
  const previewReady = state.previewReady === true;
  const diagnosisReady = previewReady || state.diagnosisReady === true || diagnosis.ready === true || diagnosis.complete === true;
  const userAgreed = previewReady || state.userAgreed === true || agreement.accepted === true || agreement.ready === true;
  const diagnosisTarget = { coffeeRef: state.diagnosisCoffeeRef || diagnosis.coffeeRef || target.coffeeRef, slot: state.diagnosisSlot || diagnosis.slot || diagnosis.slotKey || target.slot };
  const agreementTarget = { coffeeRef: state.agreementCoffeeRef || agreement.coffeeRef || target.coffeeRef, slot: state.agreementSlot || agreement.slot || agreement.slotKey || target.slot };
  const techniqueKind = request?.experiment?.kind;
  const technique = techniqueKind === 'v60_technique' || techniqueKind === 'manual_source_technique';
  if (!technique && request?.intent === 'information') return false;
  const typedPreview = !technique && (request?.intent === 'recipe_preview'
    || (request?.intent == null && (request?.servingDoseGrams != null || request?.change?.control === 'dose')));
  const resolvedTarget = context?.__ruphusResolvedTargets instanceof Map
    ? context.__ruphusResolvedTargets.get(`${target.coffeeRef}:${target.slot}`)
    : null;
  if (typedPreview) {
    return Boolean(target.coffeeRef && target.slot && requestCoffeeRef === target.coffeeRef && requestSlot === target.slot
      && resolvedTarget?.coffeeRef === target.coffeeRef
      && resolvedTarget?.coffeeId
      && resolvedTarget?.sourceHash
      && (!state.target || (state.target.coffeeRef === target.coffeeRef && (state.target.slot || state.target.slotKey) === target.slot)));
  }
  if (technique) {
    const ready = state.techniqueReady;
    const selectedId = request.experiment.techniqueId || request.experiment.familyId || request.experiment.sourceId;
    return Boolean(target.coffeeRef && target.slot && requestCoffeeRef === target.coffeeRef && requestSlot === target.slot
      && ready?.coffeeRef === target.coffeeRef && ready?.slot === target.slot
      && (ready.kind === techniqueKind || (!ready.kind && request.intent == null))
      && (!resolvedTarget?.sourceHash || !ready.sourceHash || resolvedTarget.sourceHash === ready.sourceHash)
      && Array.isArray(ready.optionIds) && ready.optionIds.includes(selectedId)
      && request.intent !== 'information'
      && (request.intent === 'recipe_preview' || techniqueRequest(context?.userText || '', context, target)));
  }
  return Boolean(
    target.coffeeRef && target.slot && requestCoffeeRef === target.coffeeRef && requestSlot === target.slot
      && diagnosisReady && userAgreed
      && diagnosisTarget.coffeeRef === target.coffeeRef && diagnosisTarget.slot === target.slot
      && agreementTarget.coffeeRef === target.coffeeRef && agreementTarget.slot === target.slot
  );
}

function isRecoverableProposalFailure(result) {
  return result?.name === 'propose_recipe_change'
    && result?.result?.ok !== true
    && PROPOSAL_RECOVERABLE_FAILURES.has(result?.result?.code);
}

function isBoundedProposalRequest(request) {
  const args = request?.args || {};
  return args.intent === 'recipe_preview' || (args.intent == null && (args.servingDoseGrams != null || args.change?.control === 'dose'))
    || ['dose', 'water', 'grind', 'temperature', 'ratio'].includes(args.change?.control);
}

// A provider can occasionally select the proposal tool immediately after
// resolving a coffee, before it has emitted an exact recipe read. For a
// typed preview only, spend one existing tool slot on that exact owner-bound
// read, then re-evaluate the normal proposal gate. This is deliberately not
// a general readiness bypass: explicit coffee/method conflicts, unsupported
// slots, missing owner refs, and exhausted budgets remain blocked.
function justInTimeRecipeReadRequest(context, calls, { readCalls, toolCalls, maxToolCalls } = {}) {
  if (!Array.isArray(calls) || calls.length !== 1) return null;
  const request = calls[0];
  const args = request?.args || {};
  if (request.name !== 'propose_recipe_change'
    || !(args.intent === 'recipe_preview'
      || (args.intent == null && (args.servingDoseGrams != null || args.change?.control === 'dose')))
    || args.experiment) return null;
  const coffeeRef = typeof args.coffeeRef === 'string' ? args.coffeeRef.trim() : '';
  const slot = args.slot || args.slotKey;
  if (!coffeeRef || !SLOT_KEYS.includes(slot)) return null;
  if (context?.__ruphusRefs?.[coffeeRef] == null) return null;
  const turnBinding = context?.__ruphusTurnBinding;
  if (turnBinding?.status === 'locked' && turnBinding.coffeeRef && turnBinding.coffeeRef !== coffeeRef) return null;
  const methodBinding = context?.methodBinding;
  if (methodBinding?.slot && methodBinding.slot !== slot) return null;
  const equipmentAnswer = context?.equipmentAnswer;
  if (equipmentAnswer?.slot && equipmentAnswer.slot !== slot) return null;
  const target = proposalTarget(context?.proposalState);
  const resolved = context?.__ruphusResolvedTargets instanceof Map
    ? context.__ruphusResolvedTargets.get(`${coffeeRef}:${slot}`)
    : null;
  if (resolved?.coffeeId && resolved.sourceHash) return null;
  if (readCalls >= MAX_READS_PER_TURN || toolCalls + calls.length + 1 > maxToolCalls) return null;
  if (target.coffeeRef && (target.coffeeRef !== coffeeRef || (target.slot && target.slot !== slot))) return null;
  return { callId: 'jit-exact-recipe', name: 'read_recipe', args: { coffeeRef, slot } };
}

function envelopeArtifactIssue(envelope, artifacts, context) {
  if (!envelope || envelope.intent !== 'recipe_preview' || envelope.state !== 'answered') return null;
  // An answered preview must positively bind both dimensions. Null identity
  // fields are appropriate for information/clarification turns, never for a
  // recipe card that could be rendered or acted on.
  if (typeof envelope.coffeeRef !== 'string' || !envelope.coffeeRef.trim() || typeof envelope.slot !== 'string' || !envelope.slot.trim()) return 'recipe_subject_required';
  const expectedCoffeeId = envelope.coffeeRef && context?.__ruphusRefs?.[envelope.coffeeRef];
  const candidates = artifacts.filter((candidate) => ['recipe_proposal', 'action_receipt'].includes(candidate?.type)
    && candidate?.slotKey === envelope.slot);
  const artifact = candidates.find((candidate) =>
    ((expectedCoffeeId && candidate?.coffeeId === expectedCoffeeId)
      || (!expectedCoffeeId && candidate?.coffeeRef === envelope.coffeeRef)));
  if (!artifact) return candidates.length ? 'recipe_subject_mismatch' : 'recipe_artifact_required';
  const binding = context?.__ruphusTurnBinding;
  if (binding?.status === 'locked' && (envelope.coffeeRef !== binding.coffeeRef
    || (binding.techniqueSlot && envelope.slot !== binding.techniqueSlot))) return 'recipe_subject_mismatch';
  return null;
}

export async function runRuphusTurn({ turnId, context, userText, provider, tools, emit, signal, maxToolCalls = Number.POSITIVE_INFINITY, maxToolRounds = MAX_TOOL_ROUNDS } = {}) {
  if (!turnId || !provider?.runTurn || !tools?.call) throw new Error('turn requires identity, provider, and tools');
  const turnStartedAt = performance.now(); let firstFrameAt = null; let readRoundMs = 0;
  const send = (type, fields = {}) => {
    if (type === 'text_delta' && firstFrameAt == null) firstFrameAt = performance.now();
    return emit?.(createLifecycleFrame(type, turnId, fields));
  };
  send('turn_accepted', { protocolVersion: RUPHUS_CONTRACT_VERSION });
  send('context_loading', { evidenceHash: context?.evidenceHash || null });
  let response; let responseEnvelope = null; let toolCalls = 0; let readCalls = 0; let toolRounds = 0; let text = '';
  let roundLimitRecovered = false;
  const toolNames = []; const proposalIds = []; const artifacts = []; const toolEvidence = []; const usageSamples = []; const providerRetrySamples = [];
  let proposalClaimed = false;
  let proposalRecoveryAttempted = false;
  let proposalRetryAvailable = false;
  let preparationClaimRecoveryAttempted = false;
  const trace = context?.trace || { focusChanges: [], reads: [], regenerations: [] };
  if (!Array.isArray(trace.toolEvents)) trace.toolEvents = [];
  const rememberUsage = (value) => { usageSamples.push(value?.usage ?? null); const retryCount = value?.retryCount ?? value?.retry_count; if (typeof retryCount === 'number' && Number.isFinite(retryCount) && retryCount >= 0) providerRetrySamples.push({ retryCount }); };
  const accounting = () => { const retryCount = aggregateProviderRetryCount(providerRetrySamples); return { usage: aggregateProviderUsage('openai', usageSamples), ...(retryCount === undefined ? {} : { retryCount }) }; };
  const pendingTools = new Set();
  let providerCalls = 0;
  let envelopeRecoveryAttempted = false;
  const throwIfCancelled = () => { if (signal?.aborted) throw cancelledError(); };
  const runProvider = async (input) => {
    const providerLimit = 1 + Math.max(0, Number(maxToolRounds) || 0) + 4;
    if (providerCalls >= providerLimit) throw Object.assign(new Error('provider call limit exceeded'), { code: 'provider_call_limit' });
    providerCalls += 1;
    try {
      const result = await provider.runTurn(input);
      rememberUsage(result);
      return result;
    } catch (error) {
      rememberUsage(error);
      throw error;
    }
  };
  let techniqueContinuationUsed = false;
  let techniqueRoundRecoveryUsed = false;
  let aidenContinuationUsed = false;
  const runTool = async (request, { blockedResult = null } = {}) => {
    throwIfCancelled();
    const pending = { callId: request.callId || null, name: request.name, started: false, resultEmitted: false };
    const proposalStateBefore = request.name === 'propose_recipe_change' && context?.proposalState
      ? {
        proposalIssued: context.proposalState.proposalIssued,
        previewReady: context.proposalState.previewReady,
        diagnosisReady: context.proposalState.diagnosisReady,
        userAgreed: context.proposalState.userAgreed,
      }
      : null;
    const techniqueSelectionKey = request.name === 'propose_recipe_change'
      && ['v60_technique', 'manual_source_technique'].includes(request.args?.experiment?.kind)
      ? `${request.args.coffeeRef}:${request.args.slot || request.args.slotKey}`
      : null;
    const techniqueSelectionBefore = techniqueSelectionKey && context?.__ruphusTechniqueSelections instanceof Map
      ? context.__ruphusTechniqueSelections.get(techniqueSelectionKey)
      : null;
    const selectedIdsBefore = techniqueSelectionBefore && Array.isArray(techniqueSelectionBefore.selectedIds)
      ? [...techniqueSelectionBefore.selectedIds]
      : null;
    pendingTools.add(pending);
    try {
      send('tool_started', { name: request.name, ...(request.callId ? { callId: request.callId } : {}) });
      pending.started = true;
      throwIfCancelled();
      toolNames.push(request.name);
      const result = blockedResult || await tools.call(request.name, request.args || {});
      throwIfCancelled();
      const safeResult = result?.artifact && Object.hasOwn(result.artifact, 'explanation')
        ? { ...result, artifact: { ...result.artifact, explanation: safeProposalExplanation(result.artifact.explanation) } }
        : result;
      trace.toolEvents.push({ name: request.name, outcome: safeResult?.ok === false ? 'failed' : 'succeeded', ...(safeResult?.code ? { code: safeResult.code } : {}), ...(request.args?.slot || request.args?.slotKey ? { slot: request.args.slot || request.args.slotKey } : {}), ...(request.args?.coffeeRef ? { target: request.args.coffeeRef } : {}) });
      toolEvidence.push({ callId: request.callId, name: request.name, result: safeResult });
      if (READS.has(request.name)) trace.reads.push({ name: request.name, at: new Date().toISOString() });
      if (safeResult?.coffeeRef && context?.launchCoffeeId && context.launchCoffeeId !== safeResult.coffeeRef) trace.focusChanges.push({ from: context.launchCoffeeId, to: safeResult.coffeeRef });
      if (safeResult?.proposal?.id) proposalIds.push(safeResult.proposal.id);
      pending.resultEmitted = true;
      pendingTools.delete(pending);
      send('tool_result', { name: request.name, ...(request.callId ? { callId: request.callId } : {}), result: safeResult });
      throwIfCancelled();
      if (safeResult?.artifact) {
        artifacts.push(JSON.parse(JSON.stringify(safeResult.artifact)));
        send('artifact_ready', { artifact: safeResult.artifact });
        pending.artifactEmitted = true;
      }
      return { callId: request.callId, name: request.name, result: safeResult };
    } catch (error) {
      if ((signal?.aborted || error?.code === 'turn_cancelled') && proposalStateBefore && !pending.artifactEmitted) {
        Object.assign(context.proposalState, proposalStateBefore);
      }
      if ((signal?.aborted || error?.code === 'turn_cancelled') && techniqueSelectionKey && selectedIdsBefore
        && context?.__ruphusTechniqueSelections instanceof Map) {
        const current = context.__ruphusTechniqueSelections.get(techniqueSelectionKey);
        if (current) current.selectedIds = [...selectedIdsBefore];
      }
      const cancelled = signal?.aborted === true || error?.code === 'turn_cancelled';
      if (!cancelled && pending.started && !pending.resultEmitted) {
        const failure = { ok: false, code: error?.code || 'tool_failed', message: safeFailureMessage(error) };
        trace.toolEvents.push({ name: request.name, outcome: 'failed', code: failure.code, ...(request.args?.slot || request.args?.slotKey ? { slot: request.args.slot || request.args.slotKey } : {}), ...(request.args?.coffeeRef ? { target: request.args.coffeeRef } : {}) });
        pending.resultEmitted = true;
        pendingTools.delete(pending);
        toolEvidence.push({ callId: request.callId, name: request.name, result: failure });
        send('tool_result', { name: request.name, ...(request.callId ? { callId: request.callId } : {}), result: failure });
      } else if (!cancelled) pendingTools.delete(pending);
      throw error;
    }
  };
  try {
    throwIfCancelled();
    if (context?.equipmentAnswer?.slot && context?.turnBinding?.status === 'locked') {
      const request = { callId: 'answered-equipment-options', name: 'read_technique_options', args: { coffeeRef: context.turnBinding.coffeeRef, slot: context.equipmentAnswer.slot } };
      response = { toolCalls: [request], outputItems: [{ type: 'function_call', call_id: request.callId, name: request.name, arguments: JSON.stringify(request.args) }] };
    } else {
      response = await runProvider({ turnId, context, userText, conversation: context?.conversation || [], tools: tools.definitions, signal }); throwIfCancelled();
    }
    // A corrected response is still an agent turn: its reads/proposals must
    // pass the same dispatch, owner, budget and one-proposal checks as before.
    // Never extract only its text and silently discard its tool calls.
    for (let checkAttempt = 0; checkAttempt < 2; checkAttempt += 1) {
    while (response) {
      responseEnvelope = response?.envelope || null;
      if (response.text) text += String(response.text);
      const calls = Array.isArray(response.toolCalls) ? response.toolCalls : [];
      throwIfCancelled();
      // An authenticated ordinal inspection reopens its original card. Do
      // this before dispatching provider calls: a model-selected fresh
      // proposal or extra evidence read cannot consume the history budget.
      const historyTarget = historicalTechniqueReadRequired({ userText, context, toolEvidence });
      if (historyTarget
        && toolRounds < maxToolRounds
        && readCalls < MAX_READS_PER_TURN
        && toolCalls < maxToolCalls) {
        const request = { callId: 'historical-technique-inspection', name: 'read_technique_options', args: { coffeeRef: historyTarget.coffeeRef, slot: historyTarget.slot } };
        toolRounds += 1;
        readCalls += 1;
        toolCalls += 1;
        text = '';
        const historicalRead = await runTool(request);
        text = historicalRead.result?.message || 'I reopened the earlier technique as a read-only recipe. Your saved recipe is unchanged.';
        break;
      }
      if (!calls.length) {
        // A bare same-session technique follow-up has an authenticated target
        // from its delivered card, but the provider may answer after evidence
        // without asking for the option reader. Spend the existing second
        // read round deterministically for that narrow case; ordinary prose
        // turns and unbound/new-chat requests remain unchanged.
        if (!techniqueContinuationUsed
          && contextualTechniqueReadRequired({ userText, context, toolEvidence })
          && toolRounds < maxToolRounds
          && readCalls < MAX_READS_PER_TURN
          && toolCalls < maxToolCalls) {
          const target = proposalTarget(context?.proposalState);
          const request = { callId: 'contextual-technique-options', name: 'read_technique_options', args: { coffeeRef: target.coffeeRef, slot: target.slot } };
          toolRounds += 1;
          readCalls += 1;
          toolCalls += 1;
          techniqueContinuationUsed = true;
          text = '';
          const techniqueRead = await runTool(request);
          // This read is initiated by the trusted session boundary rather
          // than by a provider function call. Pair it with an internal call
          // item before handing the result to the Responses adapter so the
          // API never receives an orphan function_call_output.
          const pairedPrevious = {
            ...response,
            outputItems: [
              ...(Array.isArray(response?.outputItems) ? response.outputItems : []),
              {
                type: 'function_call',
                call_id: request.callId,
                name: request.name,
                arguments: JSON.stringify(request.args || {}),
              },
            ],
          };
          response = await runProvider({
            turnId, context, userText, conversation: context?.conversation || [],
            tools: (tools.definitions || []).filter((definition) => definition?.name === 'propose_recipe_change'),
            previous: pairedPrevious, toolResult: { results: [techniqueRead] }, regeneration: true,
            correctiveInstruction: 'The authenticated same-session technique follow-up needs one new option from the trusted reader. Choose one exact executable option from the provided technique options and call propose_recipe_change now. Do not cite an option from prose or claim a review card unless the proposal tool returns its artifact.',
            signal,
          });
          throwIfCancelled();
          continue;
        }
        const techniqueRead = [...toolEvidence].reverse().find((item) => item.name === 'read_technique_options'
          && item.result?.ok === true && item.result?.actionable === true
          && Array.isArray(item.result?.options) && item.result.options.length > 0);
        if (techniqueRead && !proposalClaimed && context?.proposalState?.techniqueReady?.optionIds?.length
          && techniqueRequest(userText || context?.userText || '', context, proposalTarget(context?.proposalState))) {
          if (toolCalls >= maxToolCalls) {
            text = TECHNIQUE_RECOVERY;
            break;
          }
          if (!techniqueContinuationUsed) {
            techniqueContinuationUsed = true;
            response = await runProvider({
              turnId, context, userText, conversation: context?.conversation || [],
              tools: (tools.definitions || []).filter((definition) => definition?.name === 'propose_recipe_change'),
              previous: response, toolResult: { results: [techniqueRead] }, regeneration: true,
              correctiveInstruction: 'The user explicitly asked to try a different source-backed technique or reuse one named earlier. Choose one exact executable option from the trusted technique reader and call propose_recipe_change now. Do not ask for another yes, call another read, reuse an old action ID, or claim a review card unless the proposal tool returns its artifact.',
              signal,
            });
            throwIfCancelled();
            continue;
          }
          text = TECHNIQUE_RECOVERY;
        }
        break;
      }
      if (techniqueContinuationUsed && calls.some((request) => request.name !== 'propose_recipe_change')) {
        text = TECHNIQUE_RECOVERY;
        break;
      }
      toolRounds += 1;
      // Two evidence rounds may already have resolved and read the exact
      // recipe. Deliver the one eligible proposal requested by that final
      // model response; this neither adds a read nor another model call.
      const proposalRoundException = toolRounds === maxToolRounds + 1
        || (techniqueRoundRecoveryUsed && toolRounds === maxToolRounds + 2)
        || (proposalRecoveryAttempted && toolRounds <= maxToolRounds + 2);
      const finalProposal = proposalRoundException && readCalls > 0
        && !roundLimitRecovered && (!proposalClaimed || proposalRetryAvailable) && calls.length === 1
        && calls[0].name === 'propose_recipe_change'
        && proposalEligibleForTarget(context, calls[0].args || {});
      if (toolRounds > maxToolRounds && !finalProposal) {
        // Aiden can edit an existing device profile, but cannot generate one
        // through the manual source catalog. A verified missing profile is a
        // capability result, not a failed connection or an earned proposal.
        const missingAiden = calls.length === 1 && calls[0].name === 'propose_recipe_change' && calls[0].args?.slot === 'aiden'
          ? [...toolEvidence].reverse().find(item => item.name === 'read_recipe' && item.result?.ok === true
            && item.result.slot === 'aiden' && item.result.coffeeRef === calls[0].args.coffeeRef && item.result.recipe === null)
          : null;
        if (missingAiden
          && !aidenContinuationUsed
          && tools.names?.includes('propose_recipe_change')
          && (tools.definitions || []).some((definition) => definition?.name === 'propose_recipe_change')
          && toolCalls < maxToolCalls) {
          // A missing Aiden slot is a capability boundary, not a reason to
          // strand the conversation. Give the provider one continuation with
          // the verified bean context and require a complete, review-only
          // profile draft. The tool still validates every field and persists
          // nothing until the user explicitly chooses an action.
          aidenContinuationUsed = true;
          if (toolCalls < maxToolCalls) toolCalls += 1;
          text = '';
          response = await runProvider({
            turnId, context, userText, conversation: context?.conversation || [],
            tools: (tools.definitions || []).filter((definition) => definition?.name === 'propose_recipe_change'),
            previous: response,
            toolResult: { results: [missingAiden] },
            regeneration: true,
            correctiveInstruction: 'The verified Aiden slot is empty, but this request asks for a useful Aiden recipe change. Generate a complete profile candidate from the bean context and call propose_recipe_change with intent recipe_preview, the exact coffeeRef and slot aiden, and all required aidenProfile fields. Do not ask the user to leave chat or claim a saved profile; return a review card only when the proposal tool returns its artifact.',
            signal,
          });
          throwIfCancelled();
          continue;
        }
        if (missingAiden) { text = missingAiden.result.summary; break; }
        if (techniqueRoundRecoveryUsed) {
          text = TECHNIQUE_RECOVERY;
          break;
        }
        const target = proposalTarget(context?.proposalState || {});
        const techniqueRead = [...toolEvidence].reverse().find((item) => item.name === 'read_technique_options'
          && item.result?.ok === true && item.result?.actionable === true
          && Array.isArray(item.result?.options) && item.result.options.length > 0);
        const proposalRequests = calls.filter((request) => request.name === 'propose_recipe_change');
        const canContinueTechnique = !roundLimitRecovered && !proposalClaimed && toolCalls < maxToolCalls
          && proposalRequests.length <= 1
          && calls.every((request) => READS.has(request.name) || request.name === 'propose_recipe_change')
          && techniqueRead
          && techniqueRead.result.coffeeRef === target.coffeeRef && techniqueRead.result.slot === target.slot
          && techniqueRequest(userText || context?.userText || '', context, target);
        if (canContinueTechnique) {
          // A model may bundle a stale/off-target proposal or an extra read
          // after the evidence and technique readers have already established
          // a target-bound option set. Do not dispatch any of those requests;
          // use one proposal-only continuation with the exact current call IDs.
          techniqueContinuationUsed = true;
          techniqueRoundRecoveryUsed = true;
          const results = calls.map((request) => ({
            callId: request.callId,
            name: request.name,
            result: {
              ok: false,
              code: 'read_budget_complete',
              message: 'Use the coffee evidence and technique options already provided; do not request another read.',
              techniqueOptions: techniqueRead.result,
            },
          }));
          response = await runProvider({
            turnId, context, userText, conversation: context?.conversation || [],
            tools: (tools.definitions || []).filter((definition) => definition?.name === 'propose_recipe_change'),
            previous: response, toolResult: { results }, regeneration: true,
            correctiveInstruction: 'The exact coffee evidence and eligible source-backed technique options are already loaded. Choose one exact executable option for the current coffee and slot from the trusted technique reader and call propose_recipe_change now. Do not reread the recipe, change the target, ask for another detail, or claim a review card unless the proposal tool returns its artifact.',
            signal,
          });
          throwIfCancelled();
          continue;
        }
        const unreadyReview = calls.length === 1 && calls[0].name === 'propose_recipe_change'
          && !proposalClaimed && target.coffeeRef && target.slot
          && calls[0].args?.coffeeRef === target.coffeeRef
          && (calls[0].args?.slot || calls[0].args?.slotKey) === target.slot;
        if (roundLimitRecovered || (!unreadyReview && !calls.every((request) => READS.has(request.name)))) throw Object.assign(new Error('maximum tool rounds exceeded'), { code: 'tool_round_limit' });
        roundLimitRecovered = true;
        const results = calls.map((request) => ({ callId: request.callId, name: request.name, result: { ok: false, code: 'read_budget_complete', message: 'Use the coffee evidence already provided and answer without another read.' } }));
        response = await runProvider({
          turnId, context, userText, conversation: context?.conversation || [], tools: [], previous: response,
          toolResult: { results }, regeneration: true,
          correctiveInstruction: 'The useful coffee and recipe evidence is already in this turn. A recipe card has not been prepared and no change has been saved. Answer the user naturally from that evidence, make at most one concrete suggestion, and do not call another tool or claim a card is ready. If the user is uncertain, help them without forcing a recipe change.',
          signal,
        });
        throwIfCancelled();
        continue;
      }
      if (toolCalls + calls.length > maxToolCalls) throw Object.assign(new Error('model requested too many actions'), { code: 'forbidden_tool' });
      const proposalRequests = calls.filter((request) => request.name === 'propose_recipe_change');
      // Validate the whole round before dispatching any tool. This keeps the
      // one-proposal rule atomic while independent reads remain concurrent.
      if (proposalRequests.length > 1 || (proposalClaimed && !proposalRetryAvailable && proposalRequests.length > 0)) throw Object.assign(new Error('at most one proposal is allowed per turn'), { code: 'proposal_timing' });
      for (const request of calls) {
        if (!tools.names?.includes(request.name) || RUPHUS_FORBIDDEN_TOOL_NAMES.includes(request.name)
          || (!READS.has(request.name) && request.name !== 'propose_recipe_change')) throw Object.assign(new Error('model requested an unavailable action'), { code: 'forbidden_tool' });
        if (READS.has(request.name) && readCalls + 1 > MAX_READS_PER_TURN) throw Object.assign(new Error('maximum evidence reads exceeded'), { code: 'read_budget_exceeded' });
      }
      // If the only requested action is a typed recipe preview and its exact
      // target has not been server-resolved yet, perform one bounded exact
      // read before deciding whether to dispatch the proposal. The read is
      // synthetic but uses the real tool path and target authority, so an
      // unavailable/invalid/mismatched result can never be proposed around.
      let justInTimeRead = null;
      const justInTimeRequest = justInTimeRecipeReadRequest(context, calls, { readCalls, toolCalls, maxToolCalls });
      if (justInTimeRequest && tools.names?.includes('read_recipe')) {
        readCalls += 1;
        toolCalls += 1;
        justInTimeRead = await runTool(justInTimeRequest);
        // The read was initiated by the runtime rather than the provider.
        // Keep its synthetic function call paired in any later Responses
        // continuation (for example, when the proposal needs one bounded
        // validation correction).
        response = {
          ...response,
          outputItems: [
            ...(Array.isArray(response?.outputItems) ? response.outputItems : []),
            { type: 'function_call', call_id: justInTimeRequest.callId, name: justInTimeRequest.name, arguments: JSON.stringify(justInTimeRequest.args) },
          ],
        };
      }
      const blockedProposalCalls = new Set();
      for (const request of calls) {
        if (request.name === 'propose_recipe_change' && !proposalEligibleForTarget(context, request.args || {})) blockedProposalCalls.add(request.callId || request);
        if (READS.has(request.name)) readCalls += 1;
      }
      if (proposalRequests.length) {
        proposalClaimed = true;
        // A failed proposal earns at most one replacement call, and consuming
        // it here prevents a second model-selected retry after another error.
        if (proposalRetryAvailable) proposalRetryAvailable = false;
      }
      toolCalls += calls.length;
      const readRoundStartedAt = performance.now();
      const settled = await Promise.allSettled(calls.map((request) => runTool(request, {
        blockedResult: blockedProposalCalls.has(request.callId || request)
          ? { ok: false, code: 'proposal_timing', message: 'Resolve the coffee and recipe, then give the bounded recommendation before preparing its review card.' }
          : null,
      })));
      readRoundMs = Math.max(readRoundMs, performance.now() - readRoundStartedAt);
      const rejected = settled.find((item) => item.status === 'rejected');
      if (rejected) throw rejected.reason;
      const results = [...(justInTimeRead ? [justInTimeRead] : []), ...settled.map((item) => item.value)];
      const ambiguous = results.find((item) => item.name === 'resolve_coffee' && item.result?.ok === false && item.result?.reason === 'ambiguous');
      if (ambiguous) { text += ambiguityClarification(ambiguous.result.candidates); break; }
      const historicalRead = results.find((item) => item.name === 'read_technique_options' && item.result?.historical === true);
      if (historicalRead) {
        text = historicalRead.result.message || 'I reopened the earlier technique as a read-only recipe. Your saved recipe is unchanged.';
        break;
      }
      const missingAidenRead = results.find((item) => item.name === 'read_recipe'
        && item.result?.ok === true && item.result?.slot === 'aiden'
        && item.result?.recipe === null && item.result?.sourceState === 'absent');
      const missingAidenProposal = calls.find((request) => request.name === 'propose_recipe_change'
        && request.args?.slot === 'aiden'
        && request.args?.intent === 'recipe_preview');
      if (missingAidenRead && missingAidenProposal
        && !results.some((item) => item.name === 'propose_recipe_change' && item.result?.ok === true)
        && !aidenContinuationUsed
        && tools.names?.includes('propose_recipe_change')
        && (tools.definitions || []).some((definition) => definition?.name === 'propose_recipe_change')
        && toolCalls < maxToolCalls) {
        aidenContinuationUsed = true;
        toolCalls += 1;
        text = '';
        response = await runProvider({
          turnId, context, userText, conversation: context?.conversation || [],
          tools: (tools.definitions || []).filter((definition) => definition?.name === 'propose_recipe_change'),
          previous: response, toolResult: { results }, regeneration: true,
          correctiveInstruction: 'The verified Aiden slot is empty, but this request asks for a useful Aiden recipe change. Generate a complete profile candidate from the bean context and call propose_recipe_change with intent recipe_preview, the exact coffeeRef and slot aiden, and all required aidenProfile fields. Do not ask the user to leave chat or claim a saved profile; return a review card only when the proposal tool returns its artifact.',
          signal,
        });
        throwIfCancelled();
        continue;
      }
      const proposed = results.find((item) => item.name === 'propose_recipe_change' && item.result?.ok === true && item.result?.artifact?.type === 'recipe_proposal');
      if (proposed) {
        const difference = proposed.result.artifact?.techniqueExperiment?.differences?.[0];
        text = appendHandoff(text, proposalHandoff(proposed.result.artifact, {
          includeDifference: typeof difference !== 'string' || !String(text).includes(difference),
        }));
        break;
      }
      const invalidGrind = results.find(item => item.name === 'propose_recipe_change' && item.result?.code === 'physical_grind_required');
      if (invalidGrind) {
        const original = calls.find(call => call.name === 'propose_recipe_change');
        const value = Number(original?.args?.change?.value);
        const target = context.__ruphusResolvedTargets?.get(`${original?.args?.coffeeRef}:${original?.args?.slot}`);
        const current = Number(target?.before?.grindSize?.setting ?? target?.before?.grind);
        const corrected = value < current ? invalidGrind.result.validNearbySettings?.finer : value > current ? invalidGrind.result.validNearbySettings?.coarser : null;
        // One deterministic physical-click correction of the same proposal,
        // not another model-selected control, read, or saved recipe write.
        if (original?.args?.change?.control === 'grind' && Number.isFinite(corrected) && toolCalls < maxToolCalls) {
          toolCalls += 1;
          const correction = await runTool({ name: 'propose_recipe_change', args: { ...original.args, change: { control: 'grind', value: corrected } } });
          const result = correction.result;
          if (result?.ok && result.artifact) {
            const difference = result.artifact?.techniqueExperiment?.differences?.[0];
            text = appendHandoff(text, proposalHandoff(result.artifact, {
              includeDifference: typeof difference !== 'string' || !String(text).includes(difference),
            }));
            break;
          }
        }
        text = 'That suggested grind isn’t a physical click on your Ode. I haven’t prepared or saved a change.';
        break;
      }
      const failedProposal = results.find((result) => {
        if (!isRecoverableProposalFailure(result)) return false;
        const request = calls.find((candidate) => candidate.callId === result.callId);
        return isBoundedProposalRequest(request);
      });
      if (failedProposal) {
        if (proposalRecoveryAttempted) {
          throw Object.assign(new Error('bounded proposal correction failed'), { code: failedProposal.result.code, responseText: 'I couldn’t prepare that recipe change safely. Your saved recipe is unchanged.' });
        }
        proposalRecoveryAttempted = true;
        proposalRetryAvailable = true;
        response = await runProvider({
          turnId, context, userText, conversation: context?.conversation || [],
          tools: (tools.definitions || []).filter((definition) => definition?.name === 'propose_recipe_change'),
          previous: response, toolResult: { results }, regeneration: true,
          correctiveInstruction: 'The exact coffee and recipe evidence is already loaded. The proposed card failed a bounded recipe validation check. Make one corrected proposal using only that evidence, preserving the exact coffee, brewer, source, ratio or dose bounds, and physical grinder setting. Do not request another read, do not save or brew, and do not claim a card unless the proposal tool succeeds. If no safe correction exists, return a typed blocked response, or clarification only when a specific missing user choice would allow completion.',
          signal,
        });
        throwIfCancelled();
        continue;
      }
      if (results.some(item => item.name === 'propose_recipe_change' && ['duplicate_alternative', 'no_recipe_change'].includes(item.result?.code))) {
        response = await runProvider({ turnId, context, userText, conversation: context?.conversation || [], tools: [], previous: response, toolResult: { results }, regeneration: true, correctiveInstruction: 'Do not repeat the prior recipe as a new one or claim a card was prepared. Explain a genuinely different supported direction concisely, or honestly explain why you recommend keeping the prior suggestion.', signal });
        throwIfCancelled();
        continue;
      }
      if (finalProposal) {
        const proposalFailure = results.find((item) => item.name === 'propose_recipe_change' && item.result?.ok !== true);
        throw Object.assign(new Error('proposal could not be prepared safely'), { code: proposalFailure?.result?.code || 'proposal_failed' });
      }
      const recoveredTrial = results.find(item => item.name === 'review_trial_recipe' && item.result?.ok === true && item.result?.artifact);
      if (recoveredTrial) {
        text += recoveredTrial.result.artifact.promoteAvailable
          ? 'Here’s the trial recipe you chose. Review it below, then choose “Make this my recipe” to save it.'
          : 'Here’s the exact trial recipe for review. Your saved recipe is unchanged.';
        break;
      }
      const prematureProposal = results.some((item) => item.name === 'propose_recipe_change' && item.result?.code === 'proposal_timing');
      if (prematureProposal) {
        if (techniqueRequest(userText || context?.userText || '', context, proposalTarget(context?.proposalState))) techniqueContinuationUsed = true;
        const typedPreviewProposal = calls.some((request) => request.name === 'propose_recipe_change'
          && request.args?.intent === 'recipe_preview' && !request.args?.experiment);
        const correctiveInstruction = typedPreviewProposal
          ? 'The typed recipe preview could not be prepared because its exact target is not currently verified. Explain the actual read or target failure above in a truthful typed blocked response, or ask for a specific missing user choice only when it would resolve the target. No card was prepared and the saved recipe is unchanged. Do not call another tool, ask an unrelated sensory question, switch brewers, or claim a card without a returned artifact.'
          : 'The recipe change is not authorized yet. Do not call another tool or claim a change was prepared. If the symptom is only watery, weak, or watered down, ask one short sensory question; otherwise ask one short unanswered sensory distinction and wait. Do not repeat an answered distinction, choose a control, or give conditional advice. Otherwise reply with useful coffee advice only, making at most one concrete suggestion supported by the established diagnosis.';
        response = await runProvider({
          turnId, context, userText, conversation: context?.conversation || [], tools: [], previous: response,
          toolResult: { results }, regeneration: true, correctiveInstruction,
          signal,
        });
        throwIfCancelled();
        continue;
      }
      response = await runProvider({ turnId, context, userText, conversation: context?.conversation || [], tools: tools.definitions, previous: response, toolResult: { results }, signal }); throwIfCancelled();
    }
    throwIfCancelled();
    // The typed request intent and actual tool outcomes govern fulfillment.
    // Verbs such as "suggest" also occur in informational questions and must
    // not override a valid information response or manufacture recipe intent.
    // Failed proposals are already corrected above; missing preview artifacts
    // use the single envelope recovery below, with exact-read tools available.
    if (responseEnvelope?.state === 'blocked') {
      throw Object.assign(new Error('provider marked the turn blocked'), { code: 'response_blocked', responseText: safeRecoveryText(text) });
    }
    const artifactIssue = envelopeArtifactIssue(responseEnvelope, artifacts, context);
    if (artifactIssue) {
      if (!envelopeRecoveryAttempted) {
        envelopeRecoveryAttempted = true;
        response = await runProvider({
          turnId, context, userText, conversation: context?.conversation || [], tools: tools.definitions,
          previous: response, toolResult: { results: toolEvidence }, regeneration: true,
          correctiveInstruction: 'The final response must use the exact current coffee and brewer. A recipe_preview answer is valid only when the proposal tool has returned a matching review card for this turn. If the card is missing or the target is wrong, call the exact proposal tool or answer with clarification/blocked state; do not claim a card is ready.',
          signal,
        });
        throwIfCancelled();
        text = '';
        checkAttempt -= 1;
        continue;
      }
      throw Object.assign(new Error('recipe response did not match a current review card'), { code: artifactIssue });
    }
    const hasCurrentCard = artifacts.some((artifact) => ['recipe_proposal', 'action_receipt'].includes(artifact?.type));
    if (proposalRecoveryAttempted && !hasCurrentCard && responseEnvelope?.state !== 'clarification') {
      throw Object.assign(new Error('proposal recovery did not fulfill the recipe request'), { code: 'proposal_failed', responseText: safeRecoveryText(text) });
    }
    if (!hasCurrentCard && PREPARATION_CLAIM.test(text)) {
      if (!preparationClaimRecoveryAttempted) {
        preparationClaimRecoveryAttempted = true;
        trace.regenerations.push({ triggers: ['PREPARATION_CLAIM'], at: new Date().toISOString() });
        response = await runProvider({
          turnId, context, userText, conversation: context?.conversation || [], tools: tools.definitions,
          previous: response, toolResult: { results: toolEvidence }, regeneration: true,
          correctiveInstruction: 'The previous response claimed a recipe was prepared without a current proposal or trial-review artifact. Do not claim a card, save, or ready-to-review schedule without that artifact. Return a typed clarification or blocked response, or provide information only without preparation language; preserve the user’s useful information.',
          signal,
        });
        throwIfCancelled();
        text = '';
        checkAttempt -= 1;
        continue;
      }
      throw Object.assign(new Error('response claimed an unbacked recipe card'), { code: 'response_validation_failed', responseText: CARD_RECOVERY });
    }
    // Once the bounded preparation-claim recovery has been used, an ordinary
    // answered information envelope cannot quietly turn the correction into a
    // successful recipe turn. The provider must explicitly classify the
    // non-fulfillment as clarification or blocked; unrelated information
    // turns never enter this branch because the flag is turn-local.
    if (preparationClaimRecoveryAttempted && !hasCurrentCard
      && responseEnvelope?.intent === 'information' && responseEnvelope?.state === 'answered') {
      throw Object.assign(new Error('response did not classify the missing recipe card'), { code: 'response_validation_failed', responseText: safeRecoveryText(text) });
    }
    let checked = text.trim();
    const checkedEvidence = runtimeEvidence(toolEvidence);
    // A validated card is already a published preview, not a rejected model
    // draft. Keep that exact card and use its app-owned handoff if surrounding
    // prose fails; never regenerate a competing proposal after publication.
    const preparedRecipe = artifacts.find(artifact => artifact?.type === 'recipe_proposal');
    if (preparedRecipe && checkedTriggers({ reply: checked, userTurn: userText, trace, evidence: checkedEvidence, methodBinding: context?.methodBinding, context }).length) {
      checked = proposalHandoff(preparedRecipe);
    }
    const triggers = checkedTriggers({ reply: checked, userTurn: userText, trace, evidence: checkedEvidence, methodBinding: context?.methodBinding, context });
    if (!checked) triggers.push({ code: 'RESPONSE_EMPTY' });
    if (checkAttempt > 0) {
      trace.regenerations.at(-1).secondFailure = triggers.map(trigger => trigger.code);
      trace.regenerations.at(-1).delivered = triggers.some(trigger => SEVERE_SECOND_FAILURES.has(trigger.code) || trigger.code === 'RESPONSE_EMPTY') ? 'failed' : 'regenerated';
      if (trace.regenerations.at(-1).delivered === 'failed') throw Object.assign(new Error('I couldn’t finish a reliable answer. Your message is kept.'), { code: 'response_validation_failed' });
    } else if (triggers.length) {
      trace.regenerations.push({ triggers: triggers.map((trigger) => trigger.code), at: new Date().toISOString() });
      const methodCorrection = context?.methodBinding?.status === 'locked' && context.methodBinding.source !== 'M2'
        ? ` The current request is bound to ${context.methodBinding.displayName}; do not substitute another brewer.`
        : context?.methodBinding?.source === 'M2'
          ? ` ${context.methodBinding.displayName} is remembered context, not a new user instruction. If the user requests a different brewer, read that exact recipe before advising a change.`
        : '';
      const groundedCorrection = triggers.some((trigger) => trigger.code === 'RT7_UNGROUNDED_GRINDER_STEP')
        ? ' The user has a Fellow Ode Gen 2: use only its physical labels (whole number, .2, or .6). Replace any unsupported decimal with the nearest real click and explain the exact click change.'
        : '';
      const correctiveInstruction = `The previous draft failed the response check. Keep the reply short and in plain coffee language; do not include markup, JSON, internal names, drafting notes, credential-shaped values, or claims of saved changes. If a source was unavailable, say you could not check it right now instead of claiming nothing exists. Return a fresh complete reply, and preserve useful conclusions from the tool evidence.${methodCorrection}${groundedCorrection}`;
      response = await runProvider({ turnId, context, userText, conversation: context?.conversation || [], tools: tools.definitions, previous: response, correctiveInstruction, priorToolEvidence: toolEvidence, toolResult: { results: toolEvidence }, regeneration: true, signal });
      throwIfCancelled();
      text = '';
      continue;
    }
    throwIfCancelled();
    if (checked) send('text_delta', { text: checked });
    const timing = { firstFrameMs: firstFrameAt == null ? null : firstFrameAt - turnStartedAt, checkedReplyMs: performance.now() - turnStartedAt, readRoundMs: readRoundMs || null, regenerationCount: trace.regenerations.length };
    send('turn_completed', { text: checked, ...(responseEnvelope?.state ? { state: responseEnvelope.state } : {}), timing });
    const emittedArtifacts = artifacts.map((artifact) => ({ type: 'artifact_ready', artifact }));
    return { ok: true, turnId, text: checked, state: responseEnvelope?.state || null, intent: responseEnvelope?.intent || null, artifacts, toolCalls, toolNames, proposalIds, trace, timing, requestId: response?.requestId || null, model: response?.model || null, ...accounting(), grader: gradeReply({ reply: checked, userTurn: userText, trace, frames: emittedArtifacts, previewReady: context?.proposalState?.previewReady === true }) };
    }
  } catch (error) {
    const cancelled = signal?.aborted === true || error?.code === 'turn_cancelled';
    if (cancelled) {
      for (const pending of pendingTools) {
        send('tool_result', { name: pending.name, ...(pending.callId ? { callId: pending.callId } : {}), result: { ok: false, code: 'turn_cancelled', message: 'Turn cancelled.' } });
      }
      pendingTools.clear();
    }
    const code = cancelled ? 'turn_cancelled' : error.code || 'turn_failed';
    const responseText = typeof error?.responseText === 'string' ? error.responseText.trim() : '';
    if (responseText && !cancelled) send('text_delta', { text: responseText });
    send(code === 'forbidden_tool' ? 'turn_failed' : 'turn_interrupted', { code, message: cancelled ? 'Turn cancelled.' : safeFailureMessage(error, 'I couldn’t complete that safely. Your saved recipe is unchanged.') });
    return { ok: false, turnId, code, text: responseText, state: code === 'response_blocked' ? 'blocked' : null, artifacts, toolCalls, toolNames, proposalIds, trace, model: response?.model || null, ...accounting() };
  }
}
