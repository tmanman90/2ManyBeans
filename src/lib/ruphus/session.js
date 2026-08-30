const AGENT_PROTOCOL_VERSION = 1;
const textValue = (value) => String(value || '').trim();
const emptyLedger = () => ({ version: 1, entries: [], namedCoffees: [], bytes: 0 });
const boundedLedger = (ledger) => {
  const entries = Array.isArray(ledger?.entries) ? ledger.entries.slice(-8) : [];
  while (JSON.stringify(entries).length > 4096) entries.shift();
  return { version: 1, entries, namedCoffees: [...new Set(entries.flatMap((entry) => entry.namedCoffees || entry.coffee?.name ? [entry.coffee?.name || entry.namedCoffees].flat() : []))].filter(Boolean), bytes: JSON.stringify(entries).length };
};

export function normalizeAgentSession(session) {
  if (!session || typeof session !== 'object') return null;
  return { protocolVersion: AGENT_PROTOCOL_VERSION, messages: (Array.isArray(session.messages) ? session.messages : []).filter(Boolean).map((message) => ({ id: textValue(message.id), role: message.role, text: textValue(message.text || message.content), createdAt: Number(message.createdAt) || Date.now(), ...(message.turnId ? { turnId: textValue(message.turnId) } : {}), ...(Array.isArray(message.artifacts) ? { artifacts: message.artifacts.slice() } : {}) })).filter((message) => (message.role === 'user' || message.role === 'assistant') && message.text), turns: Array.isArray(session.turns) ? session.turns.slice() : [], contextRef: session.contextRef || null, launchContext: session.launchContext || session.contextRef || null, ledger: boundedLedger(session.ledger), boundaryIndex: Number.isInteger(session.boundaryIndex) ? Math.max(0, session.boundaryIndex) : 0, lastActivityAt: Number(session.lastActivityAt || session.updatedAt) || Date.now(), pendingActionIds: Array.isArray(session.pendingActionIds) ? session.pendingActionIds.slice() : [], updatedAt: Number(session.updatedAt) || Date.now() };
}
export function inflateAgentSession(session) {
  if (!session || session.protocolVersion !== AGENT_PROTOCOL_VERSION) return null;
  return { ...session, messages: session.messages.map((message) => ({ id: textValue(message.id), role: message.role, content: textValue(message.text), createdAt: Number(message.createdAt) || Date.now(), ...(message.turnId ? { turnId: textValue(message.turnId) } : {}), ...(Array.isArray(message.artifacts) ? { artifacts: message.artifacts.slice() } : {}) })), ledger: boundedLedger(session.ledger), boundaryIndex: Number.isInteger(session.boundaryIndex) ? session.boundaryIndex : 0, lastActivityAt: Number(session.lastActivityAt || session.updatedAt) || Date.now() };
}

export function sessionAge({ lastActivityAt, now = Date.now() } = {}) {
  const elapsedMs = Math.max(0, Number(now) - Number(lastActivityAt || now));
  const hours = elapsedMs / 3600000;
  return { elapsedMs, hours, state: hours < 6 ? 'fresh' : hours <= 24 * 7 ? 'recent' : 'stale' };
}

export function startNewChat(session, { now = Date.now() } = {}) {
  const normalized = normalizeAgentSession(session) || normalizeAgentSession({ messages: [] });
  return { ...normalized, boundaryIndex: normalized.messages.length, ledger: emptyLedger(), lastActivityAt: Number(now), updatedAt: Number(now) };
}

export function continuePrevious(session, { now = Date.now() } = {}) {
  const normalized = normalizeAgentSession(session);
  if (!normalized) return null;
  return { ...normalized, ledger: boundedLedger(normalized.ledger), lastActivityAt: Number(now), updatedAt: Number(now) };
}

export { emptyLedger, boundedLedger };
