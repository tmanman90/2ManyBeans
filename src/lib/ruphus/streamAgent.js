import { streamWithAuth } from '../streamChat.js';
import { LIFECYCLE_TYPES, validateLifecycleFrame } from './contracts.js';

const TERMINAL = new Set(['turn_completed', 'turn_interrupted', 'turn_cancelled', 'turn_failed']);
const TRANSITIONS = {
  start: new Set(['turn_accepted']), turn_accepted: new Set(['context_loading', 'text_delta', 'tool_started', 'turn_failed', 'turn_interrupted']),
  context_loading: new Set(['context_loading', 'text_delta', 'tool_started', 'artifact_ready', 'turn_completed', 'turn_failed', 'turn_interrupted']),
  text_delta: new Set(['text_delta', 'tool_started', 'artifact_ready', 'awaiting_approval', 'turn_completed', 'turn_failed', 'turn_interrupted']),
  tool_started: new Set(['tool_result', 'turn_failed', 'turn_interrupted']), tool_result: new Set(['tool_started', 'text_delta', 'artifact_ready', 'awaiting_approval', 'turn_completed', 'turn_failed', 'turn_interrupted']),
  artifact_ready: new Set(['artifact_ready', 'text_delta', 'awaiting_approval', 'turn_completed', 'turn_failed', 'turn_interrupted']), awaiting_approval: new Set(['text_delta', 'artifact_ready', 'turn_completed', 'turn_failed', 'turn_interrupted']),
};

function frameError(code, message) { return Object.assign(new Error(message), { code }); }

export function createAgentFrameParser({ onFrame } = {}) {
  let pending = ''; let previous = 'start'; let turnId = null; let sawFrame = false;
  const accept = (frame) => {
    const validation = validateLifecycleFrame(frame);
    if (!validation.valid) throw frameError('invalid_frame', validation.errors.join('; '));
    if (turnId && frame.turnId !== turnId) throw frameError('turn_mismatch', 'Agent frame turn identity changed');
    if (!turnId) turnId = frame.turnId;
    if (previous !== 'start' && !TRANSITIONS[previous]?.has(frame.type)) throw frameError('out_of_order', `out of order: ${frame.type} cannot follow ${previous}`);
    if (sawFrame && TERMINAL.has(previous)) throw frameError('out_of_order', 'terminal Agent turn emitted another frame');
    previous = frame.type; sawFrame = true; onFrame?.(frame); return frame;
  };
  const parseLine = (line) => { if (!line.trim()) return null; let frame; try { frame = JSON.parse(line); } catch { throw frameError('malformed_stream', 'The Agent stream returned malformed JSON.'); } return accept(frame); };
  return {
    accept(frame) { return accept(frame); },
    push(chunk) { pending += typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk, { stream: true }); const lines = pending.split('\n'); pending = lines.pop() || ''; return lines.map(parseLine).filter(Boolean); },
    flush() { const tail = pending.trim(); pending = ''; return tail ? [parseLine(tail)] : []; },
    get sawFrame() { return sawFrame; }, get terminal() { return TERMINAL.has(previous); }, get turnId() { return turnId; },
  };
}

export function parseAgentFrames(text) { const frames = []; const parser = createAgentFrameParser({ onFrame: (frame) => frames.push(frame) }); parser.push(text); parser.flush(); return frames; }

/** Stream Agent v3 frames. Retries happen only before the first accepted frame. */
export async function streamAgentWithAuth({ url, body, onFrame, onError } = {}) {
  const parser = createAgentFrameParser({ onFrame });
  let result;
  await streamWithAuth({ url, body, maxRetries: 2, onFrame: (frame) => { if (LIFECYCLE_TYPES.includes(frame.type)) parser.accept(frame); }, onError: (error) => { result = { ok: false, error }; onError?.(error); }, onDone: () => { if (!result) result = parser.terminal ? { ok: true, turnId: parser.turnId, sawFrame: parser.sawFrame } : { ok: false, error: frameError('stream_incomplete', 'The Agent stream ended before completion.') }; } });
  return result || { ok: false, error: frameError('stream_incomplete', 'The Agent stream ended before completion.') };
}

export { LIFECYCLE_TYPES };
