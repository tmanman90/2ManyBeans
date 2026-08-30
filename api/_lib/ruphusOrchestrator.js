import { createLifecycleFrame, RUPHUS_CONTRACT_VERSION } from '../../src/lib/ruphus/contracts.js';
import { gradeReply, runtimeTriggers } from '../../src/lib/ruphus/conversationContract.js';
import { RUPHUS_FORBIDDEN_TOOL_NAMES } from './ruphusTools.js';
import { aggregateProviderRetryCount, aggregateProviderUsage } from './ruphusRollout.js';
import { MAX_READS_PER_TURN, MAX_TOOL_ROUNDS } from './ruphusEvidence.js';

const REPLACEMENT = 'I lost my train of thought there. Ask me that again and I’ll keep it short.';
const READS = new Set(['resolve_coffee', 'read_coffee_evidence', 'read_recipe']);
const AGREEMENT = /\b(?:yes|agree|go ahead|do it|make that|try that|change it|please change)\b/i;

function previousDiagnosis(context) {
  return (context?.conversation || []).some((message) => message?.role === 'assistant' && String(message.content || message.text || '').trim().split(/\s+/).length >= 8);
}

function eligibleProposal(context, userText, text) {
  return previousDiagnosis(context) && AGREEMENT.test(String(userText || '')) && String(text || '').trim().split(/\s+/).filter(Boolean).length >= 4;
}

export async function runRuphusTurn({ turnId, context, userText, provider, tools, emit, maxToolCalls = Number.POSITIVE_INFINITY, maxToolRounds = MAX_TOOL_ROUNDS } = {}) {
  if (!turnId || !provider?.runTurn || !tools?.call) throw new Error('turn requires identity, provider, and tools');
  const send = (type, fields = {}) => emit?.(createLifecycleFrame(type, turnId, fields));
  send('turn_accepted', { protocolVersion: RUPHUS_CONTRACT_VERSION });
  send('context_loading', { evidenceHash: context?.evidenceHash || null });
  let response; let toolCalls = 0; let readCalls = 0; let toolRounds = 0; let text = '';
  const toolNames = []; const proposalIds = []; const usageSamples = []; const providerRetrySamples = [];
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
      for (const request of calls) {
        if (!tools.names?.includes(request.name) || RUPHUS_FORBIDDEN_TOOL_NAMES.includes(request.name)) throw Object.assign(new Error('model requested an unavailable action'), { code: 'forbidden_tool' });
        if (READS.has(request.name) && readCalls + 1 > MAX_READS_PER_TURN) throw Object.assign(new Error('maximum evidence reads exceeded'), { code: 'read_budget_exceeded' });
        if (request.name === 'propose_recipe_change' && !eligibleProposal(context, userText, text)) throw Object.assign(new Error('proposal is not yet earned'), { code: 'proposal_timing' });
        if (READS.has(request.name)) readCalls += 1;
      }
      toolCalls += calls.length;
      const results = await Promise.all(calls.map(async (request) => {
        send('tool_started', { name: request.name }); toolNames.push(request.name);
        const result = await tools.call(request.name, request.args || {});
        if (READS.has(request.name)) trace.reads.push({ name: request.name, at: new Date().toISOString() });
        if (result?.coffeeRef && context?.launchCoffeeId && context.launchCoffeeId !== result.coffeeRef) trace.focusChanges.push({ from: context.launchCoffeeId, to: result.coffeeRef });
        if (result?.proposal?.id) proposalIds.push(result.proposal.id);
        send('tool_result', { name: request.name, result });
        if (result?.artifact) send('artifact_ready', { artifact: result.artifact });
        return { callId: request.callId, name: request.name, result };
      }));
      response = await provider.runTurn({ turnId, context, userText, conversation: context?.conversation || [], tools: tools.definitions, previous: response, toolResult: { results } }); rememberUsage(response);
    }
    let checked = text.trim();
    let triggers = runtimeTriggers({ reply: checked, userTurn: userText, trace });
    if (triggers.length) {
      trace.regenerations.push({ triggers: triggers.map((trigger) => trigger.code), at: new Date().toISOString() });
      const regenerated = await provider.runTurn({ turnId, context, userText, conversation: context?.conversation || [], tools: tools.definitions, previous: response, correctiveInstruction: 'Keep the reply short, plain coffee language, with no markup, JSON, internal names, or claims of saved changes.' });
      rememberUsage(regenerated); const regeneratedText = String(regenerated?.text || '').trim();
      const second = runtimeTriggers({ reply: regeneratedText, userTurn: userText, trace });
      if (!second.length) { checked = regeneratedText; triggers = []; } else if (second.some((trigger) => ['CF5_MACHINE_TOKEN', 'CF5_OPAQUE_REFERENCE', 'CF5_SECRET', 'CF6_JSON_PROSE', 'CF6_PROPOSAL_PROSE', 'RT2_FALSE_AUTHORITY', 'CF4_FALSE_AUTHORITY'].includes(trigger.code))) { checked = REPLACEMENT; }
      trace.regenerations.at(-1).secondFailure = second.map((trigger) => trigger.code);
    }
    if (checked) send('text_delta', { text: checked });
    send('turn_completed', { text: checked });
    return { ok: true, turnId, text: checked, toolCalls, toolNames, proposalIds, trace, requestId: response?.requestId || null, model: response?.model || null, ...accounting(), grader: gradeReply({ reply: checked, userTurn: userText, trace }) };
  } catch (error) {
    send(error.code === 'forbidden_tool' ? 'turn_failed' : 'turn_interrupted', { code: error.code || 'turn_failed', message: error.message });
    return { ok: false, turnId, code: error.code || 'turn_failed', text: '', toolCalls, toolNames, proposalIds, trace, model: response?.model || null, ...accounting() };
  }
}
