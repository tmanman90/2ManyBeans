import { createLifecycleFrame, MAX_TOOL_CALLS, RUPHUS_CONTRACT_VERSION } from '../../src/lib/ruphus/contracts.js';
import { containsAuthorityClaim } from '../../src/lib/ruphus/sanitizeEvidence.js';
import { RUPHUS_FORBIDDEN_TOOL_NAMES } from './ruphusTools.js';

export async function runRuphusTurn({ turnId, context, userText, provider, tools, emit, maxToolCalls = MAX_TOOL_CALLS }) {
  if (!turnId || !provider?.runTurn || !tools?.call) throw new Error('turn requires identity, provider, and tools');
  const send = (type, fields = {}) => emit?.(createLifecycleFrame(type, turnId, fields));
  send('turn_accepted', { protocolVersion: RUPHUS_CONTRACT_VERSION });
  send('context_loading', { evidenceHash: context?.evidenceHash || null });
  let response;
  let toolCalls = 0;
  const toolNames = [];
  let text = '';
  try {
    response = await provider.runTurn({ turnId, context, userText, tools: tools.definitions });
    while (response) {
      if (response.text) { text += String(response.text); send('text_delta', { text: String(response.text) }); }
      const calls = Array.isArray(response.toolCalls) ? response.toolCalls : [];
      if (!calls.length) break;
      const results = [];
      for (const request of calls) {
        toolCalls += 1;
        if (toolCalls > maxToolCalls || RUPHUS_FORBIDDEN_TOOL_NAMES.includes(request.name)) throw Object.assign(new Error('model requested an unavailable action'), { code: 'forbidden_tool' });
        send('tool_started', { name: request.name });
        toolNames.push(request.name);
        const result = await tools.call(request.name, request.args || {});
        send('tool_result', { name: request.name, result });
        if (result?.artifact) send('artifact_ready', { artifact: result.artifact });
        results.push({ callId: request.callId, name: request.name, result });
      }
      response = await provider.runTurn({ turnId, context, userText, tools: tools.definitions, previous: response, toolResult: { results } });
    }
    if (containsAuthorityClaim(text)) text = text.replace(/(?:receipt|action[_ -]?id|brew once|fellow|physical machine success)/gi, '');
    send('turn_completed', { text: text.trim() });
    return { ok: true, turnId, text: text.trim(), toolCalls, toolNames, retryCount: 0, requestId: response?.requestId || null, model: response?.model || null, usage: response?.usage || null };
  } catch (error) {
    const code = error?.code === 'forbidden_tool' ? 'forbidden_tool' : 'turn_failed';
    send(code === 'forbidden_tool' ? 'turn_failed' : 'turn_interrupted', { code, message: error.message });
    return { ok: false, turnId, code, text, toolCalls, toolNames, retryCount: 0, model: response?.model || null, usage: response?.usage || null };
  }
}
