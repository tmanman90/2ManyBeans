import { createLifecycleFrame, RUPHUS_CONTRACT_VERSION } from '../../src/lib/ruphus/contracts.js';
import { gradeReply, runtimeTriggers } from '../../src/lib/ruphus/conversationContract.js';
import { RUPHUS_FORBIDDEN_TOOL_NAMES } from './ruphusTools.js';
import { aggregateProviderRetryCount, aggregateProviderUsage } from './ruphusRollout.js';
import { MAX_READS_PER_TURN, MAX_TOOL_ROUNDS } from './ruphusEvidence.js';

const REPLACEMENT = 'I lost my train of thought there. Ask me that again and I’ll keep it short.';
const READS = new Set(['resolve_coffee', 'read_coffee_evidence', 'read_recipe']);
const SEVERE_SECOND_FAILURES = new Set([
  'CF5_MACHINE_TOKEN', 'CF5_OPAQUE_REFERENCE', 'CF5_SECRET',
  'CF6_JSON_PROSE', 'CF6_PROPOSAL_PROSE', 'RT2_FALSE_AUTHORITY', 'CF4_FALSE_AUTHORITY',
]);

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

/**
 * Proposal eligibility is a trusted, target-bound context input. The
 * conversation transcript is deliberately not consulted: an old diagnosis
 * or agreement about another coffee must not authorize this turn.
 *
 * Main-lane input contract:
 * { proposalState: { target: { coffeeRef, slot }, diagnosisReady: true,
 *   userAgreed: true, proposalIssued?: false } }
 */
export function proposalEligibleForTarget(context, request = {}) {
  const state = context?.proposalState;
  if (!state || state.proposalIssued === true || state.issued === true) return false;
  const target = proposalTarget(state);
  const requestCoffeeRef = request?.coffeeRef || null;
  const requestSlot = request?.slot || request?.slotKey || null;
  const diagnosis = state.diagnosis || {};
  const agreement = state.agreement || {};
  const diagnosisReady = state.diagnosisReady === true || diagnosis.ready === true || diagnosis.complete === true;
  const userAgreed = state.userAgreed === true || agreement.accepted === true || agreement.ready === true;
  const diagnosisTarget = { coffeeRef: state.diagnosisCoffeeRef || diagnosis.coffeeRef || target.coffeeRef, slot: state.diagnosisSlot || diagnosis.slot || diagnosis.slotKey || target.slot };
  const agreementTarget = { coffeeRef: state.agreementCoffeeRef || agreement.coffeeRef || target.coffeeRef, slot: state.agreementSlot || agreement.slot || agreement.slotKey || target.slot };
  return Boolean(
    target.coffeeRef && target.slot && requestCoffeeRef === target.coffeeRef && requestSlot === target.slot
      && diagnosisReady && userAgreed
      && diagnosisTarget.coffeeRef === target.coffeeRef && diagnosisTarget.slot === target.slot
      && agreementTarget.coffeeRef === target.coffeeRef && agreementTarget.slot === target.slot
  );
}

export async function runRuphusTurn({ turnId, context, userText, provider, tools, emit, maxToolCalls = Number.POSITIVE_INFINITY, maxToolRounds = MAX_TOOL_ROUNDS } = {}) {
  if (!turnId || !provider?.runTurn || !tools?.call) throw new Error('turn requires identity, provider, and tools');
  const turnStartedAt = performance.now(); let firstFrameAt = null; let readRoundMs = 0;
  const send = (type, fields = {}) => {
    if (type === 'text_delta' && firstFrameAt == null) firstFrameAt = performance.now();
    return emit?.(createLifecycleFrame(type, turnId, fields));
  };
  send('turn_accepted', { protocolVersion: RUPHUS_CONTRACT_VERSION });
  send('context_loading', { evidenceHash: context?.evidenceHash || null });
  let response; let toolCalls = 0; let readCalls = 0; let toolRounds = 0; let text = '';
  const toolNames = []; const proposalIds = []; const toolEvidence = []; const usageSamples = []; const providerRetrySamples = [];
  let proposalClaimed = false;
  const trace = context?.trace || { focusChanges: [], reads: [], regenerations: [] };
  const rememberUsage = (value) => { usageSamples.push(value?.usage ?? null); const retryCount = value?.retryCount ?? value?.retry_count; if (typeof retryCount === 'number' && Number.isFinite(retryCount) && retryCount >= 0) providerRetrySamples.push({ retryCount }); };
  const accounting = () => { const retryCount = aggregateProviderRetryCount(providerRetrySamples); return { usage: aggregateProviderUsage('openai', usageSamples), ...(retryCount === undefined ? {} : { retryCount }) }; };
  try {
    response = await provider.runTurn({ turnId, context, userText, conversation: context?.conversation || [], tools: tools.definitions }); rememberUsage(response);
    while (response) {
      if (response.text) text += String(response.text);
      const calls = Array.isArray(response.toolCalls) ? response.toolCalls : [];
      if (!calls.length) break;
      toolRounds += 1; if (toolRounds > maxToolRounds) throw Object.assign(new Error('maximum tool rounds exceeded'), { code: 'tool_round_limit' });
      if (toolCalls + calls.length > maxToolCalls) throw Object.assign(new Error('model requested too many actions'), { code: 'forbidden_tool' });
      const proposalRequests = calls.filter((request) => request.name === 'propose_recipe_change');
      // Validate the whole round before dispatching any tool. This keeps the
      // one-proposal rule atomic while independent reads remain concurrent.
      if (proposalRequests.length > 1 || (proposalClaimed && proposalRequests.length > 0)) throw Object.assign(new Error('at most one proposal is allowed per turn'), { code: 'proposal_timing' });
      for (const request of calls) {
        if (!tools.names?.includes(request.name) || RUPHUS_FORBIDDEN_TOOL_NAMES.includes(request.name)) throw Object.assign(new Error('model requested an unavailable action'), { code: 'forbidden_tool' });
        if (READS.has(request.name) && readCalls + 1 > MAX_READS_PER_TURN) throw Object.assign(new Error('maximum evidence reads exceeded'), { code: 'read_budget_exceeded' });
        if (request.name === 'propose_recipe_change' && !proposalEligibleForTarget(context, request.args || {})) throw Object.assign(new Error('proposal is not yet earned for this coffee and recipe'), { code: 'proposal_timing' });
        if (READS.has(request.name)) readCalls += 1;
      }
      if (proposalRequests.length) proposalClaimed = true;
      toolCalls += calls.length;
      const readRoundStartedAt = performance.now();
      const results = await Promise.all(calls.map(async (request) => {
        send('tool_started', { name: request.name, ...(request.callId ? { callId: request.callId } : {}) }); toolNames.push(request.name);
        const result = await tools.call(request.name, request.args || {});
        toolEvidence.push({ callId: request.callId, name: request.name, result });
        if (READS.has(request.name)) trace.reads.push({ name: request.name, at: new Date().toISOString() });
        if (result?.coffeeRef && context?.launchCoffeeId && context.launchCoffeeId !== result.coffeeRef) trace.focusChanges.push({ from: context.launchCoffeeId, to: result.coffeeRef });
        if (result?.proposal?.id) proposalIds.push(result.proposal.id);
        send('tool_result', { name: request.name, ...(request.callId ? { callId: request.callId } : {}), result });
        if (result?.artifact) send('artifact_ready', { artifact: result.artifact });
        return { callId: request.callId, name: request.name, result };
      }));
      readRoundMs = Math.max(readRoundMs, performance.now() - readRoundStartedAt);
      const ambiguous = results.find((item) => item.name === 'resolve_coffee' && item.result?.ok === false && item.result?.reason === 'ambiguous');
      if (ambiguous) { text += ambiguityClarification(ambiguous.result.candidates); break; }
      response = await provider.runTurn({ turnId, context, userText, conversation: context?.conversation || [], tools: tools.definitions, previous: response, toolResult: { results } }); rememberUsage(response);
    }
    let checked = text.trim();
    let triggers = runtimeTriggers({ reply: checked, userTurn: userText, trace });
    if (triggers.length) {
      trace.regenerations.push({ triggers: triggers.map((trigger) => trigger.code), at: new Date().toISOString() });
      const correctiveInstruction = 'The previous draft failed the response check. Keep the reply short and in plain coffee language; do not include markup, JSON, internal names, credential-shaped values, or claims of saved changes. Return a fresh complete reply, and preserve useful conclusions from the tool evidence.';
      const regenerated = await provider.runTurn({ turnId, context, userText, conversation: context?.conversation || [], tools: tools.definitions, previous: response, correctiveInstruction, priorToolEvidence: toolEvidence, toolResult: { results: toolEvidence }, regeneration: true });
      rememberUsage(regenerated); const regeneratedText = String(regenerated?.text || '').trim();
      const second = runtimeTriggers({ reply: regeneratedText, userTurn: userText, trace });
      if (!second.length) { checked = regeneratedText; triggers = []; } else if (second.some((trigger) => SEVERE_SECOND_FAILURES.has(trigger.code))) { checked = REPLACEMENT; }
      else checked = regeneratedText;
      trace.regenerations.at(-1).secondFailure = second.map((trigger) => trigger.code);
      trace.regenerations.at(-1).delivered = checked === REPLACEMENT ? 'replacement' : 'regenerated';
    }
    if (checked) send('text_delta', { text: checked });
    const timing = { firstFrameMs: firstFrameAt == null ? null : firstFrameAt - turnStartedAt, checkedReplyMs: performance.now() - turnStartedAt, readRoundMs: readRoundMs || null, regenerationCount: trace.regenerations.length };
    send('turn_completed', { text: checked, timing });
    return { ok: true, turnId, text: checked, toolCalls, toolNames, proposalIds, trace, timing, requestId: response?.requestId || null, model: response?.model || null, ...accounting(), grader: gradeReply({ reply: checked, userTurn: userText, trace }) };
  } catch (error) {
    send(error.code === 'forbidden_tool' ? 'turn_failed' : 'turn_interrupted', { code: error.code || 'turn_failed', message: error.message });
    return { ok: false, turnId, code: error.code || 'turn_failed', text: '', toolCalls, toolNames, proposalIds, trace, model: response?.model || null, ...accounting() };
  }
}
