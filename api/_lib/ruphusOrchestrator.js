import { createLifecycleFrame, RUPHUS_CONTRACT_VERSION } from '../../src/lib/ruphus/contracts.js';
import { gradeReply, isTechniqueExplorationRequest, runtimeTriggers } from '../../src/lib/ruphus/conversationContract.js';
import { isContextualTechniqueFollowupRequest, isExplicitTechniqueReuseRequest, isHistoricalTechniqueInspectionRequest, RUPHUS_FORBIDDEN_TOOL_NAMES } from './ruphusTools.js';
import { aggregateProviderRetryCount, aggregateProviderUsage } from './ruphusRollout.js';
import { MAX_READS_PER_TURN, MAX_TOOL_ROUNDS } from './ruphusEvidence.js';
import { mentionedMethodSlots } from '../../src/lib/ruphus/methodResolver.js';

const REPLACEMENT = 'I lost my train of thought there. Ask me that again and I’ll keep it short.';
const READS = new Set(['resolve_coffee', 'read_coffee_evidence', 'read_recipe', 'read_technique_options', 'review_trial_recipe']);
const SEVERE_SECOND_FAILURES = new Set([
  'CF5_MACHINE_TOKEN', 'CF5_OPAQUE_REFERENCE', 'CF5_SECRET', 'CF5_DRAFT_LEAK',
  'CF6_JSON_PROSE', 'CF6_PROPOSAL_PROSE', 'RT2_FALSE_AUTHORITY', 'CF4_FALSE_AUTHORITY',
  'RT6_METHOD_CONTRADICTION',
]);
const TECHNIQUE_RECOVERY = 'I can explain a different source-backed technique for this brewer, but I couldn’t prepare its review recipe safely. Your saved recipe is unchanged.';
const PREPARATION_CLAIM = /\b(?:prepared\s*:\s*|prepared\s+(?:the\s+)?(?:recipe|card|schedule)|prepared\s+for\s+review|ready\s+to\s+review|full\s+adapted\s+schedule\s+is\s+ready)\b/i;
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
  const incompatible = mentionedMethodSlots(reply, { ignoreExplicitlyRejected: true }).filter((slot) => slot !== binding.slot);
  return incompatible.length ? [{ code: 'RT6_METHOD_CONTRADICTION', severity: 'catastrophic', methods: incompatible }] : [];
}

function checkedTriggers({ reply, userTurn, trace, evidence, methodBinding }) {
  return [...runtimeTriggers({ reply, userTurn, trace, evidence }), ...methodBindingTriggers({ reply, binding: methodBinding })];
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
  if (control === 'dose') return recipe.coffeeGrams ?? recipe.userCoffeeGrams ?? recipe.dose ?? null;
  if (control === 'water') return recipe.waterGrams ?? recipe.water ?? null;
  if (control === 'grind') return recipe.grindSize?.setting ?? recipe.grind ?? null;
  if (control === 'temperature') return recipe.waterTemp?.celsius ?? recipe.temperatureC ?? recipe.temperature ?? null;
  if (control === 'ratio') return recipe.ratio ?? null;
  return null;
}

function proposalUnit(control) {
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
  const technique = artifact.techniqueExperiment;
  if (technique?.kind === 'v60_technique') {
    const name = String(technique.name || 'this V60 approach').trim();
    const difference = includeDifference && Array.isArray(technique.differences) ? technique.differences[0] : null;
    return `Try ${name}.${difference ? ` ${difference}` : ''} Here’s the recipe to review.`;
  }
  if (technique?.kind === 'manual_source_technique') {
    const name = String(technique.name || 'this coffee approach').trim();
    const difference = includeDifference && Array.isArray(technique.differences) ? technique.differences[0] : null;
    return `Try ${name}.${difference ? ` ${difference}` : ''} Here’s the recipe to review.`;
  }
  const rawControl = String(artifact.changedPaths?.[0] || '').split('.')[0];
  const control = rawControl === 'coffeeGrams' || rawControl === 'userCoffeeGrams' ? 'dose'
    : rawControl === 'waterGrams' ? 'water'
      : rawControl === 'grindSize' ? 'grind'
        : rawControl === 'waterTemp' || rawControl === 'temperatureC' ? 'temperature'
          : ['dose', 'water', 'grind', 'temperature', 'ratio'].includes(rawControl) ? rawControl : null;
  const before = control ? proposalValue(artifact.before, control) : null;
  const after = control ? proposalValue(artifact.after, control) : null;
  if (!control || before == null || after == null) return 'I’ve prepared one recipe change for you to review. It has not been applied.';
  if (['dose', 'water', 'ratio'].includes(control)) {
    const beforeRatio = recipeRatio(artifact.before);
    const afterRatio = recipeRatio(artifact.after);
    if (beforeRatio != null && afterRatio != null) {
      const detail = control === 'dose'
        ? ` That changes your dose from ${before} g to ${after} g for the same water.`
        : control === 'water' && proposalValue(artifact.after, 'dose') != null
          ? ` At your current ${proposalValue(artifact.after, 'dose')} g dose, that's ${after} g of water.`
          : '';
      return `Try a 1:${displayRatio(afterRatio)} ratio instead of 1:${displayRatio(beforeRatio)}.${detail} Open the recipe to choose your dose and review the pours; nothing is saved yet.`;
    }
  }
  const unit = proposalUnit(control);
  const unchanged = ['dose', 'water', 'grind', 'temperature']
    .filter((item) => item !== control && proposalValue(artifact.before, item) != null && proposalValue(artifact.before, item) === proposalValue(artifact.after, item))
    .slice(0, 3);
  const unchangedList = unchanged.length > 2 ? `${unchanged.slice(0, -1).join(', ')}, and ${unchanged.at(-1)}` : unchanged.join(' and ');
  const unchangedText = unchanged.length ? ` ${unchangedList[0].toUpperCase()}${unchangedList.slice(1)} stay${unchanged.length === 1 ? 's' : ''} the same.` : '';
  return `Prepared: change the ${control} from ${before}${unit} to ${after}${unit}.${unchangedText} Review it before applying.`;
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
 *   the selected option identity.
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
  if (technique) {
    const ready = state.techniqueReady;
    const selectedId = request.experiment.techniqueId || request.experiment.familyId || request.experiment.sourceId;
    const resolvedTarget = context?.__ruphusResolvedTargets instanceof Map
      ? context.__ruphusResolvedTargets.get(`${target.coffeeRef}:${target.slot}`)
      : null;
    return Boolean(target.coffeeRef && target.slot && requestCoffeeRef === target.coffeeRef && requestSlot === target.slot
      && ready?.coffeeRef === target.coffeeRef && ready?.slot === target.slot
      && (!ready.kind || ready.kind === techniqueKind)
      && (!resolvedTarget?.sourceHash || !ready.sourceHash || resolvedTarget.sourceHash === ready.sourceHash)
      && Array.isArray(ready.optionIds) && ready.optionIds.includes(selectedId)
      && techniqueRequest(context?.userText || '', context, target));
  }
  return Boolean(
    target.coffeeRef && target.slot && requestCoffeeRef === target.coffeeRef && requestSlot === target.slot
      && diagnosisReady && userAgreed
      && diagnosisTarget.coffeeRef === target.coffeeRef && diagnosisTarget.slot === target.slot
      && agreementTarget.coffeeRef === target.coffeeRef && agreementTarget.slot === target.slot
  );
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
  let response; let toolCalls = 0; let readCalls = 0; let toolRounds = 0; let text = '';
  let roundLimitRecovered = false;
  const toolNames = []; const proposalIds = []; const artifacts = []; const toolEvidence = []; const usageSamples = []; const providerRetrySamples = [];
  let proposalClaimed = false;
  const trace = context?.trace || { focusChanges: [], reads: [], regenerations: [] };
  const rememberUsage = (value) => { usageSamples.push(value?.usage ?? null); const retryCount = value?.retryCount ?? value?.retry_count; if (typeof retryCount === 'number' && Number.isFinite(retryCount) && retryCount >= 0) providerRetrySamples.push({ retryCount }); };
  const accounting = () => { const retryCount = aggregateProviderRetryCount(providerRetrySamples); return { usage: aggregateProviderUsage('openai', usageSamples), ...(retryCount === undefined ? {} : { retryCount }) }; };
  const pendingTools = new Set();
  const throwIfCancelled = () => { if (signal?.aborted) throw cancelledError(); };
  let techniqueContinuationUsed = false;
  let techniqueRoundRecoveryUsed = false;
  const runTool = async (request, { blockedResult = null } = {}) => {
    throwIfCancelled();
    const pending = { callId: request.callId || null, name: request.name };
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
      throwIfCancelled();
      toolNames.push(request.name);
      const result = blockedResult || await tools.call(request.name, request.args || {});
      throwIfCancelled();
      pendingTools.delete(pending);
      toolEvidence.push({ callId: request.callId, name: request.name, result });
      if (READS.has(request.name)) trace.reads.push({ name: request.name, at: new Date().toISOString() });
      if (result?.coffeeRef && context?.launchCoffeeId && context.launchCoffeeId !== result.coffeeRef) trace.focusChanges.push({ from: context.launchCoffeeId, to: result.coffeeRef });
      if (result?.proposal?.id) proposalIds.push(result.proposal.id);
      send('tool_result', { name: request.name, ...(request.callId ? { callId: request.callId } : {}), result });
      throwIfCancelled();
      if (result?.artifact) {
        artifacts.push(JSON.parse(JSON.stringify(result.artifact)));
        send('artifact_ready', { artifact: result.artifact });
        pending.artifactEmitted = true;
      }
      return { callId: request.callId, name: request.name, result };
    } catch (error) {
      if ((signal?.aborted || error?.code === 'turn_cancelled') && proposalStateBefore && !pending.artifactEmitted) {
        Object.assign(context.proposalState, proposalStateBefore);
      }
      if ((signal?.aborted || error?.code === 'turn_cancelled') && techniqueSelectionKey && selectedIdsBefore
        && context?.__ruphusTechniqueSelections instanceof Map) {
        const current = context.__ruphusTechniqueSelections.get(techniqueSelectionKey);
        if (current) current.selectedIds = [...selectedIdsBefore];
      }
      if (!signal?.aborted && error?.code !== 'turn_cancelled') pendingTools.delete(pending);
      throw error;
    }
  };
  try {
    throwIfCancelled();
    if (context?.equipmentAnswer?.slot && context?.turnBinding?.status === 'locked') {
      const request = { callId: 'answered-equipment-options', name: 'read_technique_options', args: { coffeeRef: context.turnBinding.coffeeRef, slot: context.equipmentAnswer.slot } };
      response = { toolCalls: [request], outputItems: [{ type: 'function_call', call_id: request.callId, name: request.name, arguments: JSON.stringify(request.args) }] };
    } else {
      response = await provider.runTurn({ turnId, context, userText, conversation: context?.conversation || [], tools: tools.definitions, signal }); throwIfCancelled(); rememberUsage(response);
    }
    while (response) {
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
          response = await provider.runTurn({
            turnId, context, userText, conversation: context?.conversation || [],
            tools: (tools.definitions || []).filter((definition) => definition?.name === 'propose_recipe_change'),
            previous: pairedPrevious, toolResult: { results: [techniqueRead] }, regeneration: true,
            correctiveInstruction: 'The authenticated same-session technique follow-up needs one new option from the trusted reader. Choose one exact executable option from the provided technique options and call propose_recipe_change now. Do not cite an option from prose or claim a review card unless the proposal tool returns its artifact.',
            signal,
          });
          throwIfCancelled();
          rememberUsage(response);
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
            response = await provider.runTurn({
              turnId, context, userText, conversation: context?.conversation || [],
              tools: (tools.definitions || []).filter((definition) => definition?.name === 'propose_recipe_change'),
              previous: response, toolResult: { results: [techniqueRead] }, regeneration: true,
              correctiveInstruction: 'The user explicitly asked to try a different source-backed technique or reuse one named earlier. Choose one exact executable option from the trusted technique reader and call propose_recipe_change now. Do not ask for another yes, call another read, reuse an old action ID, or claim a review card unless the proposal tool returns its artifact.',
              signal,
            });
            throwIfCancelled();
            rememberUsage(response);
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
        || (techniqueRoundRecoveryUsed && toolRounds === maxToolRounds + 2);
      const finalProposal = proposalRoundException && readCalls > 0
        && !roundLimitRecovered && !proposalClaimed && calls.length === 1
        && calls[0].name === 'propose_recipe_change'
        && proposalEligibleForTarget(context, calls[0].args || {});
      if (toolRounds > maxToolRounds && !finalProposal) {
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
          response = await provider.runTurn({
            turnId, context, userText, conversation: context?.conversation || [],
            tools: (tools.definitions || []).filter((definition) => definition?.name === 'propose_recipe_change'),
            previous: response, toolResult: { results }, regeneration: true,
            correctiveInstruction: 'The exact coffee evidence and eligible source-backed technique options are already loaded. Choose one exact executable option for the current coffee and slot from the trusted technique reader and call propose_recipe_change now. Do not reread the recipe, change the target, ask for another detail, or claim a review card unless the proposal tool returns its artifact.',
            signal,
          });
          throwIfCancelled();
          rememberUsage(response);
          continue;
        }
        const unreadyReview = calls.length === 1 && calls[0].name === 'propose_recipe_change'
          && !proposalClaimed && target.coffeeRef && target.slot
          && calls[0].args?.coffeeRef === target.coffeeRef
          && (calls[0].args?.slot || calls[0].args?.slotKey) === target.slot;
        if (roundLimitRecovered || (!unreadyReview && !calls.every((request) => READS.has(request.name)))) throw Object.assign(new Error('maximum tool rounds exceeded'), { code: 'tool_round_limit' });
        roundLimitRecovered = true;
        const results = calls.map((request) => ({ callId: request.callId, name: request.name, result: { ok: false, code: 'read_budget_complete', message: 'Use the coffee evidence already provided and answer without another read.' } }));
        response = await provider.runTurn({
          turnId, context, userText, conversation: context?.conversation || [], tools: [], previous: response,
          toolResult: { results }, regeneration: true,
          correctiveInstruction: 'The useful coffee and recipe evidence is already in this turn. A recipe card has not been prepared and no change has been saved. Answer the user naturally from that evidence, make at most one concrete suggestion, and do not call another tool or claim a card is ready. If the user is uncertain, help them without forcing a recipe change.',
          signal,
        });
        throwIfCancelled();
        rememberUsage(response);
        continue;
      }
      if (toolCalls + calls.length > maxToolCalls) throw Object.assign(new Error('model requested too many actions'), { code: 'forbidden_tool' });
      const proposalRequests = calls.filter((request) => request.name === 'propose_recipe_change');
      const blockedProposalCalls = new Set();
      // Validate the whole round before dispatching any tool. This keeps the
      // one-proposal rule atomic while independent reads remain concurrent.
      if (proposalRequests.length > 1 || (proposalClaimed && proposalRequests.length > 0)) throw Object.assign(new Error('at most one proposal is allowed per turn'), { code: 'proposal_timing' });
      for (const request of calls) {
        if (!tools.names?.includes(request.name) || RUPHUS_FORBIDDEN_TOOL_NAMES.includes(request.name)) throw Object.assign(new Error('model requested an unavailable action'), { code: 'forbidden_tool' });
        if (READS.has(request.name) && readCalls + 1 > MAX_READS_PER_TURN) throw Object.assign(new Error('maximum evidence reads exceeded'), { code: 'read_budget_exceeded' });
        if (request.name === 'propose_recipe_change' && !proposalEligibleForTarget(context, request.args || {})) blockedProposalCalls.add(request.callId || request);
        if (READS.has(request.name)) readCalls += 1;
      }
      if (proposalRequests.length) proposalClaimed = true;
      toolCalls += calls.length;
      const readRoundStartedAt = performance.now();
      const results = await Promise.all(calls.map((request) => runTool(request, {
        blockedResult: blockedProposalCalls.has(request.callId || request)
          ? { ok: false, code: 'proposal_timing', message: 'Resolve the coffee and recipe, then give the bounded recommendation before preparing its review card.' }
          : null,
      })));
      readRoundMs = Math.max(readRoundMs, performance.now() - readRoundStartedAt);
      const ambiguous = results.find((item) => item.name === 'resolve_coffee' && item.result?.ok === false && item.result?.reason === 'ambiguous');
      if (ambiguous) { text += ambiguityClarification(ambiguous.result.candidates); break; }
      const historicalRead = results.find((item) => item.name === 'read_technique_options' && item.result?.historical === true);
      if (historicalRead) {
        text = historicalRead.result.message || 'I reopened the earlier technique as a read-only recipe. Your saved recipe is unchanged.';
        break;
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
      if (results.some(item => item.name === 'propose_recipe_change' && ['duplicate_alternative', 'no_recipe_change'].includes(item.result?.code))) {
        response = await provider.runTurn({ turnId, context, userText, conversation: context?.conversation || [], tools: [], previous: response, toolResult: { results }, regeneration: true, correctiveInstruction: 'Do not repeat the prior recipe as a new one or claim a card was prepared. Explain a genuinely different supported direction concisely, or honestly explain why you recommend keeping the prior suggestion.', signal });
        throwIfCancelled();
        rememberUsage(response);
        continue;
      }
      if (finalProposal) { text = 'I couldn’t prepare that change safely. Your saved recipe is unchanged.'; break; }
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
        response = await provider.runTurn({
          turnId, context, userText, conversation: context?.conversation || [], tools: [], previous: response,
          toolResult: { results }, regeneration: true,
          correctiveInstruction: 'The recipe change is not authorized yet. Do not call another tool or claim a change was prepared. If the symptom is only watery, weak, or watered down and the user has not clarified its taste, ask one short sensory question (thin but sweet/clean, or sour/sharp/muted?) and wait; do not choose a control or give conditional advice yet. Otherwise reply with useful coffee advice only, making at most one concrete suggestion supported by the established diagnosis.',
          signal,
        });
        throwIfCancelled();
        rememberUsage(response);
        continue;
      }
      response = await provider.runTurn({ turnId, context, userText, conversation: context?.conversation || [], tools: tools.definitions, previous: response, toolResult: { results }, signal }); throwIfCancelled(); rememberUsage(response);
    }
    throwIfCancelled();
    let checked = text.trim();
    if (!artifacts.some((artifact) => artifact?.type === 'recipe_proposal')
      && techniqueRequest(userText || context?.userText || '', context, proposalTarget(context?.proposalState))
      && PREPARATION_CLAIM.test(checked)) checked = TECHNIQUE_RECOVERY;
    const checkedEvidence = runtimeEvidence(toolEvidence);
    let triggers = checkedTriggers({ reply: checked, userTurn: userText, trace, evidence: checkedEvidence, methodBinding: context?.methodBinding });
    if (triggers.length) {
      trace.regenerations.push({ triggers: triggers.map((trigger) => trigger.code), at: new Date().toISOString() });
      const methodCorrection = context?.methodBinding?.status === 'locked'
        ? ` The user explicitly used ${context.methodBinding.displayName}; do not mention, suggest, or ask about another brewer.`
        : '';
      const correctiveInstruction = `The previous draft failed the response check. Keep the reply short and in plain coffee language; do not include markup, JSON, internal names, drafting notes, credential-shaped values, or claims of saved changes. If a source was unavailable, say you could not check it right now instead of claiming nothing exists. Return a fresh complete reply, and preserve useful conclusions from the tool evidence.${methodCorrection}`;
      const regenerated = await provider.runTurn({ turnId, context, userText, conversation: context?.conversation || [], tools: tools.definitions, previous: response, correctiveInstruction, priorToolEvidence: toolEvidence, toolResult: { results: toolEvidence }, regeneration: true, signal });
      throwIfCancelled();
      rememberUsage(regenerated); const regeneratedText = String(regenerated?.text || '').trim();
      const second = checkedTriggers({ reply: regeneratedText, userTurn: userText, trace, evidence: checkedEvidence, methodBinding: context?.methodBinding });
      if (!second.length) { checked = regeneratedText; triggers = []; } else if (second.some((trigger) => SEVERE_SECOND_FAILURES.has(trigger.code))) { checked = REPLACEMENT; }
      else checked = regeneratedText;
      trace.regenerations.at(-1).secondFailure = second.map((trigger) => trigger.code);
      trace.regenerations.at(-1).delivered = checked === REPLACEMENT ? 'replacement' : 'regenerated';
    }
    throwIfCancelled();
    if (checked) send('text_delta', { text: checked });
    const timing = { firstFrameMs: firstFrameAt == null ? null : firstFrameAt - turnStartedAt, checkedReplyMs: performance.now() - turnStartedAt, readRoundMs: readRoundMs || null, regenerationCount: trace.regenerations.length };
    send('turn_completed', { text: checked, timing });
    const emittedArtifacts = artifacts.map((artifact) => ({ type: 'artifact_ready', artifact }));
    return { ok: true, turnId, text: checked, artifacts, toolCalls, toolNames, proposalIds, trace, timing, requestId: response?.requestId || null, model: response?.model || null, ...accounting(), grader: gradeReply({ reply: checked, userTurn: userText, trace, frames: emittedArtifacts, previewReady: context?.proposalState?.previewReady === true }) };
  } catch (error) {
    const cancelled = signal?.aborted === true || error?.code === 'turn_cancelled';
    if (cancelled) {
      for (const pending of pendingTools) {
        send('tool_result', { name: pending.name, ...(pending.callId ? { callId: pending.callId } : {}), result: { ok: false, code: 'turn_cancelled', message: 'Turn cancelled.' } });
      }
      pendingTools.clear();
    }
    const code = cancelled ? 'turn_cancelled' : error.code || 'turn_failed';
    send(code === 'forbidden_tool' ? 'turn_failed' : 'turn_interrupted', { code, message: error.message });
    return { ok: false, turnId, code, text: '', artifacts, toolCalls, toolNames, proposalIds, trace, model: response?.model || null, ...accounting() };
  }
}
