export function recoveryForAgentFrame(frame) {
  if (!frame || !['turn_failed', 'turn_interrupted'].includes(frame.type)) return null;
  return { turnId: frame.turnId || null, reason: frame.type === 'turn_interrupted' ? 'interrupted' : 'failed' };
}
