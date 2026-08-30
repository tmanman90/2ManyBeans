const AGENT_PROTOCOL_VERSION = 1;
const MAX_LEDGER_ENTRIES = 8;
const MAX_LEDGER_BYTES = 4096;
const textValue = (value) => String(value || '').trim();
const emptyLedger = () => ({ version: 1, entries: [], namedCoffees: [], bytes: 0 });
const safeLedgerEntry = (entry = {}) => {
  const value = {};
  for (const key of ['kind', 'status', 'summary', 'windowDays', 'count', 'at']) if (typeof entry[key] === 'string' || typeof entry[key] === 'number') value[key] = entry[key];
  if (Array.isArray(entry.namedCoffees)) value.namedCoffees = entry.namedCoffees.filter((item) => typeof item === 'string').map(textValue);
  if (entry.coffee && typeof entry.coffee === 'object') value.coffee = Object.fromEntries(['name', 'roaster', 'origin', 'process'].filter((key) => typeof entry.coffee[key] === 'string').map((key) => [key, textValue(entry.coffee[key])]));
  return value;
};
const boundedLedger = (ledger, { maxBytes = MAX_LEDGER_BYTES, maxEntries = MAX_LEDGER_ENTRIES } = {}) => {
  const entries = Array.isArray(ledger?.entries) ? ledger.entries.map(safeLedgerEntry).slice(-maxEntries) : [];
  while (Number.isFinite(maxBytes) && JSON.stringify(entries).length > maxBytes && entries.length > 1) entries.shift();
  if (Number.isFinite(maxBytes) && JSON.stringify(entries).length > maxBytes) return emptyLedger();
  return { version: 1, entries, namedCoffees: [...new Set(entries.flatMap((entry) => entry.namedCoffees || entry.coffee?.name ? [entry.coffee?.name || entry.namedCoffees].flat() : []))].filter(Boolean), bytes: JSON.stringify(entries).length };
};

export function normalizeAgentSession(session, options = {}) {
  if (!session || typeof session !== 'object') return null;
  const messages = (Array.isArray(session.messages) ? session.messages : []).filter(Boolean).map((message) => ({ id: textValue(message.id), role: message.role, text: textValue(message.text || message.content), createdAt: Number.isFinite(Number(message.createdAt)) ? Number(message.createdAt) : Date.now(), ...(message.turnId ? { turnId: textValue(message.turnId) } : {}), ...(Array.isArray(message.artifacts) ? { artifacts: message.artifacts.slice() } : {}) })).filter((message) => (message.role === 'user' || message.role === 'assistant') && message.text);
  const timestamp = Number(session.lastActivityAt || session.updatedAt);
  const lastActivityAt = Number.isFinite(timestamp) && timestamp >= 0 ? Math.min(timestamp, Date.now()) : Date.now();
  const updatedAtValue = Number(session.updatedAt);
  const updatedAt = Number.isFinite(updatedAtValue) && updatedAtValue >= 0 ? Math.min(updatedAtValue, Date.now()) : lastActivityAt;
  const boundary = Number.isInteger(session.boundaryIndex) ? Math.max(0, Math.min(messages.length, session.boundaryIndex)) : 0;
  return { protocolVersion: AGENT_PROTOCOL_VERSION, messages, turns: Array.isArray(session.turns) ? session.turns.slice() : [], contextRef: session.contextRef || null, launchContext: session.launchContext || session.contextRef || null, ledger: boundedLedger(session.ledger, options), boundaryIndex: boundary, lastActivityAt, launchHintConsumed: session.launchHintConsumed === true, historyWidened: session.historyWidened === true, pendingActionIds: Array.isArray(session.pendingActionIds) ? session.pendingActionIds.slice() : [], updatedAt };
}
export function inflateAgentSession(session, options = {}) {
  if (!session || session.protocolVersion !== AGENT_PROTOCOL_VERSION) return null;
  return { ...session, messages: session.messages.map((message) => ({ id: textValue(message.id), role: message.role, content: textValue(message.text), createdAt: Number(message.createdAt) || Date.now(), ...(message.turnId ? { turnId: textValue(message.turnId) } : {}), ...(Array.isArray(message.artifacts) ? { artifacts: message.artifacts.slice() } : {}) })), ledger: boundedLedger(session.ledger, options), boundaryIndex: Math.max(0, Math.min(session.messages.length, Number.isInteger(session.boundaryIndex) ? session.boundaryIndex : 0)), lastActivityAt: Number(session.lastActivityAt || session.updatedAt) || Date.now(), launchHintConsumed: session.launchHintConsumed === true, historyWidened: session.historyWidened === true };
}

export function sessionAge({ lastActivityAt, now = Date.now() } = {}) {
  const elapsedMs = Math.max(0, Number(now) - Number(lastActivityAt || now));
  const hours = elapsedMs / 3600000;
  return { elapsedMs, hours, state: hours < 6 ? 'fresh' : hours <= 24 * 7 ? 'recent' : 'stale' };
}

export function startNewChat(session, { now = Date.now() } = {}) {
  const normalized = normalizeAgentSession(session) || normalizeAgentSession({ messages: [] });
  return { ...normalized, boundaryIndex: normalized.messages.length, ledger: emptyLedger(), launchHintConsumed: false, lastActivityAt: Number(now), updatedAt: Number(now) };
}

export function continuePrevious(session, { now = Date.now() } = {}) {
  const normalized = normalizeAgentSession(session);
  if (!normalized) return null;
  return { ...normalized, ledger: boundedLedger(normalized.ledger), lastActivityAt: Number(now), updatedAt: Number(now) };
}

export function rebuildStaleSession(session, { now = Date.now() } = {}) {
  const normalized = normalizeAgentSession(session);
  if (!normalized) return null;
  return { ...normalized, ledger: boundedLedger(normalized.ledger), lastActivityAt: normalized.lastActivityAt, updatedAt: Number(now) };
}

export function prepareSession(session, { now = Date.now() } = {}) {
  const normalized = normalizeAgentSession(session);
  if (!normalized) return null;
  return sessionAge({ lastActivityAt: normalized.lastActivityAt, now }).state === 'stale' ? rebuildStaleSession(normalized, { now }) : normalized;
}

export { emptyLedger, boundedLedger };
