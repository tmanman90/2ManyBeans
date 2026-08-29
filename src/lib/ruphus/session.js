const MAX_MESSAGES = 50;
const MAX_TEXT = 2000;
const AGENT_PROTOCOL_VERSION = 1;
const textValue = (value) => String(value || '').trim();

export function normalizeAgentSession(session) {
  if (!session || typeof session !== 'object') return null;
  return { protocolVersion: AGENT_PROTOCOL_VERSION, messages: (Array.isArray(session.messages) ? session.messages : []).filter(Boolean).map((message) => ({ id: textValue(message.id), role: message.role, text: textValue(message.text || message.content).slice(0, MAX_TEXT), createdAt: Number(message.createdAt) || Date.now(), ...(message.turnId ? { turnId: textValue(message.turnId) } : {}), ...(Array.isArray(message.artifacts) ? { artifacts: message.artifacts.slice() } : {}) })).filter((message) => (message.role === 'user' || message.role === 'assistant') && message.text).slice(-MAX_MESSAGES), turns: Array.isArray(session.turns) ? session.turns.slice(-MAX_MESSAGES) : [], contextRef: session.contextRef || null, pendingActionIds: Array.isArray(session.pendingActionIds) ? session.pendingActionIds.slice() : [], updatedAt: Number(session.updatedAt) || Date.now() };
}
export function inflateAgentSession(session) {
  if (!session || session.protocolVersion !== AGENT_PROTOCOL_VERSION) return null;
  return { ...session, messages: session.messages.map((message) => ({ id: textValue(message.id), role: message.role, content: textValue(message.text).slice(0, MAX_TEXT), createdAt: Number(message.createdAt) || Date.now(), ...(message.turnId ? { turnId: textValue(message.turnId) } : {}), ...(Array.isArray(message.artifacts) ? { artifacts: message.artifacts.slice() } : {}) })).slice(-MAX_MESSAGES) };
}
