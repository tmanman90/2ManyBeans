const AGENT_PROTOCOL_VERSION = 1;
const MAX_LEDGER_ENTRIES = 8;
const MAX_LEDGER_BYTES = 4096;
const byteLength = (value) => new TextEncoder().encode(value).byteLength;
const textValue = (value) => String(value || '').trim();

// Failed Agent turns may be retried after relaunch, but the persisted retry
// record must never carry the request body, image data, auth state, or server
// tool context. The explicit kind is the retryability proof; prose alone is
// never treated as a retry instruction.
function safeAgentRetry(retry) {
  if (!retry || retry.kind !== 'agent') return null;
  // The Agent endpoint does not impose a smaller user-text cap than the
  // chat input, so do not silently alter a retry's requested text here.
  const text = textValue(retry.text);
  if (!text) return null;
  const source = retry.contextRef;
  const contextRef = {};
  if (source && typeof source === 'object') {
    for (const key of ['surface', 'coffeeRef', 'sessionId']) {
      if (typeof source[key] === 'string' && source[key].trim()) contextRef[key] = source[key].trim().slice(0, 180);
    }
    if (source.launchItem && typeof source.launchItem === 'object') {
      const launchItem = {};
      for (const key of ['kind', 'ref', 'method']) {
        if (typeof source.launchItem[key] === 'string' && source.launchItem[key].trim()) launchItem[key] = source.launchItem[key].trim().slice(0, 180);
      }
      if (Object.keys(launchItem).length > 0) contextRef.launchItem = launchItem;
    }
  }
  return { kind: 'agent', text, ...(Object.keys(contextRef).length > 0 ? { contextRef } : {}) };
}

// Keep native cards attached when persisted messages enter the Chat display.
export function restoreChatMessage(message) {
  const retry = message?.errored ? safeAgentRetry(message.retry) : null;
  return {
    id: message.id || crypto.randomUUID(),
    role: message.role,
    content: String(message.content || ''),
    createdAt: message.createdAt,
    sources: Array.isArray(message.sources) ? message.sources : undefined,
    disclaimer: message.disclaimer,
    ...(message.turnId ? { turnId: message.turnId } : {}),
    ...(Array.isArray(message.artifacts) ? { artifacts: message.artifacts.slice() } : {}),
    ...(retry ? {
      errored: true,
      retry,
      retryTurn: {
        text: retry.text,
        apiMsg: { role: 'user', content: retry.text },
        ...(retry.contextRef ? { agentContextOverride: retry.contextRef } : {}),
      },
    } : {}),
  };
}
const methodFocusName = (value) => {
  const displayName = textValue(value);
  return ['Aiden', 'hot V60', 'iced V60', 'hot Kalita', 'iced Kalita'].includes(displayName)
    || /^(?:hot|iced) Switch (?:02|03)$/.test(displayName)
    || /^(?:hot|iced) Kalita (?:155|185)$/.test(displayName)
    ? displayName : null;
};
const emptyLedger = () => ({ version: 1, entries: [], namedCoffees: [], bytes: 0 });

function settleUndoneReceipts(messages) {
  const undos = messages.flatMap(message => message.artifacts || []).filter(item => item.mode === 'undo_revision' && item.status === 'succeeded' && item.undoneRevisionId);
  return messages.map(message => !Array.isArray(message.artifacts) ? message : {
    ...message,
    artifacts: message.artifacts.map(item => {
      const undone = ['apply_proposal', 'promote_attempt'].includes(item.mode) && undos.some(undo =>
        undo.undoneRevisionId === item.revisionId
        && (!undo.coffeeId || undo.coffeeId === item.coffeeId)
        && (!undo.slotKey || undo.slotKey === item.slotKey));
      return undone ? { ...item, status: 'undone', undoAvailable: false, executionAvailable: false, promoteAvailable: false } : item;
    }),
  });
}

export function retainActionReceipt(messages, receipt, proposalStatus) {
  receipt = Object.fromEntries(Object.entries(receipt).filter(([, value]) => value !== undefined));
  let attached = false;
  const latestTrialMessage = receipt.mode === 'promote_attempt' && receipt.status === 'succeeded'
    ? messages.findLastIndex(message => message.artifacts?.some(item => item.attemptId === receipt.attemptId)) : -1;
  const updated = messages.map((message, index) => {
    if (!Array.isArray(message.artifacts)) return message;
    const ownsProposal = message.artifacts.some(item => item.type === 'recipe_proposal' && item.id === receipt.proposalId);
    const ownsReceipt = message.artifacts.some(item => item.id === receipt.id);
    const ownsSavedTrial = receipt.mode === 'promote_attempt' && receipt.status === 'succeeded'
      && message.artifacts.some(item => item.attemptId === receipt.attemptId);
    if (!ownsProposal && !ownsReceipt && !ownsSavedTrial) return message;
    const artifacts = message.artifacts.filter(item => item.id !== receipt.id).map(item => {
      if (ownsProposal && item.id === receipt.proposalId && proposalStatus) return { ...item, status: proposalStatus };
      if (receipt.mode === 'promote_attempt' && receipt.status === 'succeeded' && item.attemptId === receipt.attemptId) return {
        ...item, promoteAvailable: false,
        ...(item.mode === 'brew_once' ? { title: 'Trial selected', message: 'You chose this version for one brew. See the recipe update below.' } : {}),
      };
      return item;
    });
    if (!attached && (latestTrialMessage < 0 || index === latestTrialMessage)) {
      artifacts.push(receipt);
      attached = true;
    }
    return { ...message, artifacts };
  });
  if (!attached) updated.push({ id: `receipt-${receipt.id}`, role: 'assistant', content: 'Recipe action result', turnId: `action-${receipt.id}`, createdAt: Date.now(), artifacts: [receipt] });
  return settleUndoneReceipts(updated);
}

// UI transcript saves must not replace evidence and lifecycle state written by
// the endpoint after each turn. Explicit New chat/Continue remain reset paths.
export function clientSessionWrite(session, { resetContext = false, archiveActive = false, remoteSession = null } = {}) {
  if (session.protocolVersion !== AGENT_PROTOCOL_VERSION || (resetContext && !archiveActive)) return { data: session, merge: false };
  const data = resetContext ? { ...session } : Object.fromEntries(['protocolVersion', 'messages', 'pendingActionIds', 'updatedAt']
    .filter(key => key in session).map(key => [key, session[key]]));
  // Chat renders only the active suffix. Keep the archived prefix that the
  // server's boundary indexes; otherwise even a valid first message is denied.
  if (remoteSession?.protocolVersion === AGENT_PROTOCOL_VERSION && Array.isArray(data.messages)) {
    const remote = normalizeAgentSession(remoteSession);
    const prefix = remote.messages.slice(0, remote.boundaryIndex);
    const archivedIds = new Set(prefix.map(message => message.id).filter(Boolean));
    data.messages = [...prefix, ...data.messages.filter(message => !resetContext || !message.id || !archivedIds.has(message.id))];
  }
  if (resetContext) data.boundaryIndex = data.messages.length;
  return { data, merge: !resetContext };
}
const safeLedgerEntry = (entry = {}) => {
  const value = {};
  for (const key of ['kind', 'status', 'summary', 'windowDays', 'count', 'at']) if (typeof entry[key] === 'string' || typeof entry[key] === 'number') value[key] = entry[key];
  if (Array.isArray(entry.namedCoffees)) value.namedCoffees = entry.namedCoffees.filter((item) => typeof item === 'string').map(textValue);
  if (entry.coffee && typeof entry.coffee === 'object') value.coffee = Object.fromEntries(['name', 'roaster', 'origin', 'process'].filter((key) => typeof entry.coffee[key] === 'string').map((key) => [key, textValue(entry.coffee[key])]));
  const methodFocus = methodFocusName(entry.methodFocus?.displayName);
  if (methodFocus) value.methodFocus = { displayName: methodFocus };
  return value;
};
const boundedLedger = (ledger, { maxBytes = MAX_LEDGER_BYTES, maxEntries = MAX_LEDGER_ENTRIES } = {}) => {
  const entries = Array.isArray(ledger?.entries) ? ledger.entries.map(safeLedgerEntry).slice(-maxEntries) : [];
  while (Number.isFinite(maxBytes) && byteLength(JSON.stringify(entries)) > maxBytes && entries.length > 1) entries.shift();
  if (Number.isFinite(maxBytes) && byteLength(JSON.stringify(entries)) > maxBytes) return emptyLedger();
  return { version: 1, entries, namedCoffees: [...new Set(entries.flatMap((entry) => entry.namedCoffees || entry.coffee?.name ? [entry.coffee?.name || entry.namedCoffees].flat() : []))].filter(Boolean), bytes: byteLength(JSON.stringify(entries)) };
};

export function normalizeAgentSession(session, options = {}) {
  if (!session || typeof session !== 'object') return null;
  session = { ...session, messages: settleUndoneReceipts((Array.isArray(session.messages) ? session.messages : []).filter(Boolean)) };
  const messages = (Array.isArray(session.messages) ? session.messages : []).filter(Boolean).map((message) => {
    const retry = message.errored ? safeAgentRetry(message.retry) : null;
    return {
      id: textValue(message.id), role: message.role, text: textValue(message.text || message.content), createdAt: Number.isFinite(Number(message.createdAt)) ? Number(message.createdAt) : Date.now(),
      ...(message.turnId ? { turnId: textValue(message.turnId) } : {}),
      ...(Array.isArray(message.artifacts) ? { artifacts: message.artifacts.slice() } : {}),
      ...(retry ? { errored: true, retry } : {}),
    };
  }).filter((message) => (message.role === 'user' || message.role === 'assistant') && message.text);
  const timestamp = Number(session.lastActivityAt || session.updatedAt);
  const lastActivityAt = Number.isFinite(timestamp) && timestamp >= 0 ? Math.min(timestamp, Date.now()) : Date.now();
  const updatedAtValue = Number(session.updatedAt);
  const updatedAt = Number.isFinite(updatedAtValue) && updatedAtValue >= 0 ? Math.min(updatedAtValue, Date.now()) : lastActivityAt;
  const boundary = Number.isInteger(session.boundaryIndex) ? Math.max(0, Math.min(messages.length, session.boundaryIndex)) : 0;
  return { protocolVersion: AGENT_PROTOCOL_VERSION, messages, turns: Array.isArray(session.turns) ? session.turns.slice() : [], contextRef: session.contextRef || null, launchContext: session.launchContext || session.contextRef || null, ledger: boundedLedger(session.ledger, options), boundaryIndex: boundary, lastActivityAt, launchHintConsumed: session.launchHintConsumed === true, historyWidened: session.historyWidened === true, pendingActionIds: Array.isArray(session.pendingActionIds) ? session.pendingActionIds.slice() : [], updatedAt };
}
export function inflateAgentSession(session, options = {}) {
  if (!session || session.protocolVersion !== AGENT_PROTOCOL_VERSION) return null;
  session = { ...session, messages: settleUndoneReceipts(session.messages) };
  return { ...session, messages: session.messages.map((message) => {
    const retry = message.errored ? safeAgentRetry(message.retry) : null;
    return {
      id: textValue(message.id), role: message.role, content: textValue(message.text), createdAt: Number(message.createdAt) || Date.now(),
      ...(message.turnId ? { turnId: textValue(message.turnId) } : {}),
      ...(Array.isArray(message.artifacts) ? { artifacts: message.artifacts.slice() } : {}),
      ...(retry ? { errored: true, retry } : {}),
    };
  }), ledger: boundedLedger(session.ledger, options), boundaryIndex: Math.max(0, Math.min(session.messages.length, Number.isInteger(session.boundaryIndex) ? session.boundaryIndex : 0)), lastActivityAt: Number(session.lastActivityAt || session.updatedAt) || Date.now(), launchHintConsumed: session.launchHintConsumed === true, historyWidened: session.historyWidened === true };
}

// Remote evidence and action state remain authoritative. Only recover local
// unanswered failure pairs that could not be uploaded (for example auth loss).
// Never resurrect a prior chat or overwrite a successful answer with an error.
export function reconcileChatSession(local, remote) {
  if (local?.protocolVersion !== AGENT_PROTOCOL_VERSION) return remote;
  if (!remote) return normalizeAgentSession(local);
  if (remote.protocolVersion !== AGENT_PROTOCOL_VERSION
    || local.contextRef?.sessionId !== remote.contextRef?.sessionId
    || (local.boundaryIndex || 0) !== (remote.boundaryIndex || 0)) return remote;
  const messages = [...(remote.messages || [])];
  const normalized = normalizeAgentSession(local);
  for (let index = normalized.boundaryIndex; index < normalized.messages.length; index++) {
    const failed = normalized.messages[index];
    const question = normalized.messages[index - 1];
    if (!failed.errored || !failed.retry || question?.role !== 'user'
      || question.text !== failed.retry.text || !failed.id || !question.id
      || messages.some(item => item.id === failed.id)) continue;
    const questionIndex = messages.findIndex(item => item.id === question.id);
    if (questionIndex >= 0 && messages.slice(questionIndex + 1).some(item => item.role === 'assistant' && !item.errored)) continue;
    // A distinct newer remote conversation is not a place for an old retry.
    if (questionIndex < 0 && messages.some(item => Number(item.createdAt) > question.createdAt)) continue;
    if (questionIndex < 0) messages.push(question);
    messages.push({ ...failed, artifacts: [] });
  }
  return { ...remote, messages };
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
  const stale = sessionAge({ lastActivityAt: normalized.lastActivityAt, now }).state === 'stale';
  const archived = normalized.messages.length > 0 && normalized.boundaryIndex === normalized.messages.length;
  return { ...normalized, boundaryIndex: archived ? 0 : normalized.boundaryIndex, ledger: stale || archived ? emptyLedger() : boundedLedger(normalized.ledger), lastActivityAt: Number(now), updatedAt: Number(now), ...(stale ? { historyWidened: true } : {}) };
}

export function sessionPresentation(session, { now = Date.now() } = {}) {
  const normalized = normalizeAgentSession(session);
  if (!normalized) return { state: 'fresh', showOpening: false, showContinue: false, session: null };
  const age = sessionAge({ lastActivityAt: normalized.lastActivityAt, now });
  const archived = normalized.messages.length > 0 && normalized.boundaryIndex === normalized.messages.length;
  return { state: age.state, showOpening: archived || age.state !== 'fresh', showContinue: normalized.messages.length > 0 && (archived || age.state === 'stale'), session: normalized };
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
