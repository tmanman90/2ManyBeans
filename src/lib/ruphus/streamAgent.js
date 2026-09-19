import { streamWithAuth } from '../streamChat.js';
import { LIFECYCLE_TYPES, validateLifecycleFrame } from './contracts.js';

const TERMINAL = new Set(['turn_completed', 'turn_interrupted', 'turn_cancelled', 'turn_failed']);
const TRANSITIONS = {
  start: new Set(['turn_accepted']), turn_accepted: new Set(['context_loading', 'text_delta', 'tool_started', 'turn_failed', 'turn_interrupted']),
  context_loading: new Set(['context_loading', 'text_delta', 'tool_started', 'artifact_ready', 'turn_completed', 'turn_failed', 'turn_interrupted']),
  text_delta: new Set(['text_delta', 'tool_started', 'artifact_ready', 'awaiting_approval', 'turn_completed', 'turn_failed', 'turn_interrupted']),
  tool_started: new Set(['tool_result', 'turn_failed', 'turn_interrupted']), tool_result: new Set(['tool_started', 'text_delta', 'artifact_ready', 'awaiting_approval', 'turn_completed', 'turn_failed', 'turn_interrupted']),
  artifact_ready: new Set(['tool_started', 'artifact_ready', 'text_delta', 'awaiting_approval', 'turn_completed', 'turn_failed', 'turn_interrupted']), awaiting_approval: new Set(['text_delta', 'artifact_ready', 'turn_completed', 'turn_failed', 'turn_interrupted']),
};

function frameError(code, message) { return Object.assign(new Error(message), { code }); }

export function resolveAgentStreamResult({ terminalType, terminalCode = null, usageSeen = true, transportError = null } = {}) {
  const missingUsageTransport = transportError == null || transportError.code === 'stream_incomplete';
  if (terminalType === 'turn_completed' && missingUsageTransport) return { ok: true, usageMissing: !usageSeen || transportError?.code === 'stream_incomplete' };
  // The lifecycle failure was already received. A missing accounting trailer
  // cannot turn that known cause into an unrelated connection failure.
  if (terminalCode && TERMINAL.has(terminalType) && missingUsageTransport) {
    return { ok: false, error: frameError(terminalCode, `The Agent turn ended with ${terminalType}.`) };
  }
  return { ok: false, error: transportError || frameError(terminalCode || terminalType || 'stream_incomplete', `The Agent turn ended with ${terminalType || 'an incomplete stream'}.`) };
}

export function createAgentFrameParser({ onFrame } = {}) {
  let pending = ''; let previous = 'start'; let turnId = null; let sawFrame = false; let terminalCode = null;
  const pendingTools = [];
  const rememberToolStart = (frame) => pendingTools.push({ callId: frame.callId || null, name: frame.name || null });
  const consumeToolResult = (frame) => {
    const index = pendingTools.findIndex((tool) => (frame.callId && tool.callId === frame.callId) || (frame.name && tool.name === frame.name) || (!frame.callId && !frame.name));
    if (index < 0) throw frameError('out_of_order', `tool_result ${frame.callId || frame.name || 'unknown'} has no matching tool_started frame`);
    pendingTools.splice(index, 1);
  };
  const accept = (frame) => {
    const validation = validateLifecycleFrame(frame);
    if (!validation.valid) throw frameError('invalid_frame', validation.errors.join('; '));
    if (turnId && frame.turnId !== turnId) throw frameError('turn_mismatch', 'Agent frame turn identity changed');
    if (!turnId) turnId = frame.turnId;
    if (sawFrame && TERMINAL.has(previous)) throw frameError('out_of_order', 'terminal Agent turn emitted another frame');
    const hasPendingTools = pendingTools.length > 0;
    const normalTransition = previous === 'start' || TRANSITIONS[previous]?.has(frame.type);
    // Promise.all starts every request synchronously, so starts may precede
    // either result and results may complete in any order. The parser tracks
    // outstanding tool identities instead of imposing completion order.
    const parallelTransition = hasPendingTools && (
      frame.type === 'tool_started'
      || (frame.type === 'tool_result' && ['tool_started', 'tool_result', 'artifact_ready'].includes(previous))
    );
    if (!normalTransition && !parallelTransition) throw frameError('out_of_order', `out of order: ${frame.type} cannot follow ${previous}`);
    if (hasPendingTools && TERMINAL.has(frame.type)) throw frameError('out_of_order', 'terminal Agent turn emitted before all tools completed');
    if (hasPendingTools && !['tool_started', 'tool_result', 'artifact_ready'].includes(frame.type)) throw frameError('out_of_order', `out of order: ${frame.type} cannot follow pending tools`);
    if (frame.type === 'tool_started') rememberToolStart(frame);
    if (frame.type === 'tool_result') {
      if (!hasPendingTools) throw frameError('out_of_order', 'tool_result has no pending tool');
      consumeToolResult(frame);
    }
    previous = frame.type; sawFrame = true; if (TERMINAL.has(frame.type)) terminalCode = frame.code || null; onFrame?.(frame); return frame;
  };
  const parseLine = (line) => { if (!line.trim()) return null; let frame; try { frame = JSON.parse(line); } catch { throw frameError('malformed_stream', 'The Agent stream returned malformed JSON.'); } return accept(frame); };
  return {
    accept(frame) { return accept(frame); },
    push(chunk) { pending += typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk, { stream: true }); const lines = pending.split('\n'); pending = lines.pop() || ''; return lines.map(parseLine).filter(Boolean); },
    flush() { const tail = pending.trim(); pending = ''; return tail ? [parseLine(tail)] : []; },
    get sawFrame() { return sawFrame; }, get terminal() { return TERMINAL.has(previous); }, get terminalType() { return previous; }, get terminalCode() { return terminalCode; }, get turnId() { return turnId; },
  };
}

export function parseAgentFrames(text) { const frames = []; const parser = createAgentFrameParser({ onFrame: (frame) => frames.push(frame) }); parser.push(text); parser.flush(); return frames; }

/** Stream Agent v3 frames. Retries happen only before the first accepted frame. */
export const RUPHUS_SOURCE_FORMAT_CAPABILITY = 'technique_experiment_v1';

export function addRuphusSourceFormatCapability(body = {}) {
  const existing = Array.isArray(body?.commandCapabilities) ? body.commandCapabilities : [];
  return { ...body, commandCapabilities: [...new Set([...existing, RUPHUS_SOURCE_FORMAT_CAPABILITY])] };
}

export async function streamAgentWithAuth({ url, body, onFrame, onError, signal } = {}) {
  const parser = createAgentFrameParser({ onFrame });
  let result;
  await streamWithAuth({ url, body: addRuphusSourceFormatCapability(body), signal, maxRetries: 2, onFrame: (frame) => { if (LIFECYCLE_TYPES.includes(frame.type)) parser.accept(frame); }, onError: (error) => { const resolved = resolveAgentStreamResult({ terminalType: parser.terminalType, terminalCode: parser.terminalCode, usageSeen: false, transportError: error }); result = resolved.ok ? { ...resolved, turnId: parser.turnId, sawFrame: parser.sawFrame } : resolved; if (!result.ok) onError?.(result.error); }, onDone: ({ usage } = {}) => { if (!result) { const resolved = resolveAgentStreamResult({ terminalType: parser.terminalType, terminalCode: parser.terminalCode, usageSeen: usage != null }); result = resolved.ok ? { ...resolved, turnId: parser.turnId, sawFrame: parser.sawFrame, usage } : resolved; } } });
  return result || { ok: false, error: frameError('stream_incomplete', 'The Agent stream ended before completion.') };
}

export { LIFECYCLE_TYPES };
