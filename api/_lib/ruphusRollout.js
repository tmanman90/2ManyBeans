import crypto from 'node:crypto';
import { calculateCost, normalizeUsage } from './modelPricing.js';

// These are rollout controls, not client feature flags. A missing or malformed
// server value must leave the capability unavailable.
export const CENSUS_WINDOW_DAYS = 14;
// Validation ceiling only; no retention period is selected by the app. Trace
// collection remains disabled until the owner supplies a value.
export const TRACE_RETENTION_MAX_DAYS = 365;
export const CENSUS_CAPABILITIES = new Set([
  'apply_proposal', 'brew_once', 'keep_current', 'start_attempt', 'timer_started',
  'complete_attempt', 'prepare_attempt', 'promote_attempt', 'set_dose',
  'set_aiden_grind', 'set_aiden_link', 'undo_revision', 'replace_active_recipe',
]);
export const MUTATION_ROLLOUT_MODES = new Set([
  'apply_proposal',
  'undo_revision',
  'brew_once',
  'keep_current',
  'start_attempt',
  'timer_started',
  'complete_attempt',
  'prepare_attempt',
  'promote_attempt',
]);

export function parseUidAllowlist(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return new Set();
  return new Set(raw.split(',').map((value) => value.trim()).filter(Boolean));
}

export function isUidAllowed(uid, raw) {
  return typeof uid === 'string' && uid.length > 0 && parseUidAllowlist(raw).has(uid);
}

export function isAgentAccessAllowed({ uid, rawUids = process.env.RUPHUS_AGENT_V3_UIDS } = {}) {
  return isUidAllowed(uid, rawUids);
}

export function isMutationAllowed({ uid, mode, rawUids = process.env.RUPHUS_AGENT_V3_MUTATION_UIDS } = {}) {
  return MUTATION_ROLLOUT_MODES.has(mode) && isUidAllowed(uid, rawUids);
}

export function isTraceRetentionConfigured(raw = process.env.RUPHUS_AGENT_TRACE_RETENTION_DAYS) {
  if (typeof raw !== 'string' || !raw.trim()) return { enabled: false, reason: 'retention_not_configured' };
  const days = Number(raw);
  if (!Number.isInteger(days) || days <= 0 || days > TRACE_RETENTION_MAX_DAYS) return { enabled: false, reason: 'retention_invalid' };
  return { enabled: true, days };
}

export function hashTelemetryId(value) {
  if (value === undefined || value === null || value === '') return null;
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 16);
}

export function normalizeTelemetryUsage(provider, model, usage) {
  const tokens = normalizeUsage(provider, usage);
  if (!tokens) return {};
  return {
    inputTokens: tokens.inputTokens,
    outputTokens: tokens.outputTokens,
    totalTokens: tokens.totalTokens,
    estimatedCost: calculateCost(model, tokens),
  };
}

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function boundedString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/**
 * Build the intentionally narrow telemetry envelope. Callers may pass rich
 * runtime objects; only these scalar/hashed fields can leave the process.
 */
export function redactRuphusTelemetry(input = {}) {
  const output = {};
  const provider = boundedString(input.provider);
  const model = boundedString(input.model);
  const feature = boundedString(input.feature);
  const endpoint = boundedString(input.endpoint);
  const failureCode = boundedString(input.failureCode);
  const recovery = boundedString(input.recovery);
  const approvalSource = boundedString(input.approvalSource);
  const source = boundedString(input.source);
  if (provider) output.provider = provider;
  if (model) output.model = model;
  if (feature) output.feature = feature;
  if (endpoint) output.endpoint = endpoint;
  if (failureCode) output.failureCode = failureCode;
  if (recovery) output.recovery = recovery;
  if (approvalSource) output.approvalSource = approvalSource;
  if (source) output.source = source;

  const contextHash = hashTelemetryId(input.contextHash || input.contextId);
  const receiptHash = hashTelemetryId(input.receiptHash || input.receiptId);
  const actionHash = hashTelemetryId(input.actionHash || input.actionId);
  const requestHash = hashTelemetryId(input.requestHash || input.requestId);
  if (contextHash) output.contextHash = String(contextHash);
  if (receiptHash) output.receiptHash = String(receiptHash);
  if (actionHash) output.actionHash = String(actionHash);
  if (requestHash) output.requestHash = String(requestHash);
  if (Array.isArray(input.toolNames)) {
    output.toolNames = input.toolNames.filter((name) => typeof name === 'string' && name.trim()).map((name) => name.trim());
  }
  if (typeof input.proposalValid === 'boolean') output.proposalValid = input.proposalValid;
  if (typeof input.recovered === 'boolean') output.recovered = input.recovered;
  for (const key of ['latencyMs', 'ttffMs', 'totalMs', 'retryCount', 'inputTokens', 'outputTokens', 'totalTokens', 'estimatedCost']) {
    const value = finiteNumber(input[key]);
    if (value !== undefined) output[key] = value;
  }
  return output;
}

export async function persistRuphusTrace({ db, uid, event, retentionRaw = process.env.RUPHUS_AGENT_TRACE_RETENTION_DAYS } = {}) {
  const retention = isTraceRetentionConfigured(retentionRaw);
  if (!retention.enabled || !db || typeof uid !== 'string' || !uid) {
    return { written: false, reason: retention.reason || 'trace_store_unavailable' };
  }
  const trace = redactRuphusTelemetry(event);
  const now = Date.now();
  const ref = db.collection('users').doc(uid).collection('ruphusTelemetry');
  await ref.add({ ...trace, retentionDays: retention.days, createdAt: new Date(now), expiresAt: new Date(now + retention.days * 24 * 60 * 60 * 1000) });
  return { written: true, retentionDays: retention.days };
}

export async function recordRuphusCensus({ db, uid, clientVersion, commandCapabilities = [], source = 'client' } = {}) {
  const normalizedVersion = typeof clientVersion === 'string' ? clientVersion.trim() : '';
  if (!db || typeof uid !== 'string' || !uid || !/^[A-Za-z0-9._+-]{1,180}$/.test(normalizedVersion)) {
    return { written: false, reason: 'census_invalid' };
  }
  const capabilities = [...new Set(commandCapabilities.filter((mode) => typeof mode === 'string' && CENSUS_CAPABILITIES.has(mode)))].sort();
  const ref = db.collection('users').doc(uid).collection('ruphusCensus');
  await ref.add({ clientVersion: normalizedVersion, commandCapabilities: capabilities, source: source === 'server' ? 'server' : 'client', windowDays: CENSUS_WINDOW_DAYS, observedAt: new Date() });
  return { written: true, windowDays: CENSUS_WINDOW_DAYS };
}
