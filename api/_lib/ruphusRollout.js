import crypto from 'node:crypto';
import { calculateCost, normalizeUsage } from './modelPricing.js';
import { RUPHUS_READ_TOOL_NAMES } from './ruphusTools.js';
import { SLOT_KEYS } from '../../src/lib/ruphus/contracts.js';

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
  'recipe_preview_v1', 'technique_experiment_v1',
]);
export const MUTATION_ROLLOUT_MODES = new Set([
  'apply_proposal',
  'undo_revision',
  'brew_once',
  'keep_current',
  'start_attempt',
  'prepare_attempt',
  'promote_attempt',
]);
const TRACE_TOOL_NAMES = new Set([...RUPHUS_READ_TOOL_NAMES, 'propose_recipe_change']);
const TRACE_OUTCOMES = new Set(['started', 'succeeded', 'failed']);
// Telemetry carries diagnostic categories only. Keep this closed so a
// provider/tool supplied identifier (or credential-shaped string) can never
// become a persisted "code" field.
const TRACE_CODES = new Set([
  'active_revision_not_found', 'legacy_recipe_ambiguous', 'recipe_invalid', 'recipe_missing', 'recipe_slot_mismatch',
  'read_timeout', 'read_failed', 'tool_failed', 'tool_unavailable', 'coffee_required', 'slot_required', 'invalid_tool_input',
  'cross_owner_or_context', 'invalid_launch_item', 'launch_item_not_found', 'unsupported_technique_brewer', 'source_format_unsupported',
  'invalid_recipe_intent', 'proposal_timing', 'proposal_target_required', 'proposal_target_mismatch',
  'proposal_target_stale', 'proposal_failed', 'proposal_validation_failed', 'invalid_proposal', 'invalid_proposal_intent',
  'invalid_dose_preview', 'invalid_ratio_preview', 'invalid_aiden_change', 'invalid_recipe', 'one_change_required', 'no_recipe_change',
  'duplicate_alternative', 'physical_grind_required', 'technique_option_required', 'source_recipe_control_unsupported',
  'source-ratio-adaptation-unsupported', 'read_budget_complete', 'read_budget_exceeded', 'tool_round_limit',
]);
const traceCode = (item) => {
  if (typeof item?.code === 'string' && TRACE_CODES.has(item.code)) return item.code;
  if (item?.outcome === 'failed') return typeof item?.name === 'string' && item.name.startsWith('read_') ? 'read_failed' : 'tool_failed';
  return undefined;
};

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

export function isMutationAllowed({ uid, mode, rawUids = process.env.RUPHUS_AGENT_V3_MUTATION_UIDS, rawAccessUids = process.env.RUPHUS_AGENT_V3_UIDS } = {}) {
  return MUTATION_ROLLOUT_MODES.has(mode) && isUidAllowed(uid, rawUids) && isUidAllowed(uid, rawAccessUids);
}

export function parseClientVersion(value) {
  if (typeof value !== 'string' || !/^\d+\.\d+\.\d+$/.test(value.trim())) return null;
  const parsed = value.trim().split('.').map(Number);
  return parsed.every((part) => Number.isSafeInteger(part)) ? parsed : null;
}

export function normalizeClientVersion(value) {
  return parseClientVersion(value) ? value.trim() : null;
}

export function compareClientVersions(left, right) {
  const a = parseClientVersion(left); const b = parseClientVersion(right);
  if (!a || !b) return null;
  for (let index = 0; index < 3; index += 1) if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  return 0;
}

export function evaluateBeanCensus({ beans = [], minimumVersion, acceptedStragglers = [] } = {}) {
  if (!parseClientVersion(minimumVersion)) return { ready: false, reason: 'minimum_version_invalid', observedUids: [], stragglers: [] };
  const accepted = new Set(acceptedStragglers.filter((uid) => typeof uid === 'string' && uid));
  const observedUids = [...new Set(beans.map((bean) => bean?.uid).filter((uid) => typeof uid === 'string' && uid))].sort();
  if (!observedUids.length) return { ready: false, reason: 'no_observed_beans', observedUids, stragglers: [] };
  const stragglers = [];
  for (const uid of observedUids) {
    const observations = beans.filter((bean) => bean?.uid === uid);
    if (!observations.length || observations.some((bean) => {
      const versionValid = parseClientVersion(bean.clientVersion) && compareClientVersions(bean.clientVersion, minimumVersion) >= 0;
      const updatedAt = timestampMs(bean.updatedAt);
      const clientVersionUpdatedAt = timestampMs(bean.clientVersionUpdatedAt);
      const stampFresh = Number.isFinite(updatedAt) && Number.isFinite(clientVersionUpdatedAt)
        && clientVersionUpdatedAt >= updatedAt;
      return !versionValid || !stampFresh;
    })) stragglers.push(uid);
  }
  return { ready: stragglers.every((uid) => accepted.has(uid)), reason: stragglers.length ? 'stragglers' : 'ready', observedUids, stragglers };
}

function timestampMs(value) {
  if (value && typeof value.toDate === 'function') return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : NaN;
}

export async function readRuphusBeanCensus({ db, minimumVersion, acceptedStragglers = [], now = Date.now() } = {}) {
  if (!db?.collectionGroup) return { ready: false, reason: 'census_unavailable', observedUids: [], stragglers: [] };
  const cutoff = now - CENSUS_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const snap = await db.collectionGroup('beans').where('updatedAt', '>=', new Date(cutoff)).get();
  const beans = snap.docs.map((doc) => {
    const segments = String(doc.ref?.path || '').split('/');
    return {
      uid: segments[1],
      clientVersion: doc.data()?.clientVersion,
      clientVersionUpdatedAt: doc.data()?.clientVersionUpdatedAt,
      updatedAt: doc.data()?.updatedAt,
    };
  }).filter((bean) => timestampMs(bean.updatedAt) >= cutoff);
  return evaluateBeanCensus({ beans, minimumVersion, acceptedStragglers });
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

export function aggregateProviderUsage(provider, usages = []) {
  const normalized = usages.map((usage) => normalizeUsage(provider, usage)).filter(Boolean);
  if (!usages.length || normalized.length !== usages.length) return null;
  const sum = (key) => normalized.reduce((total, value) => total + (Number(value[key]) || 0), 0);
  return {
    input_tokens: sum('inputTokens'),
    output_tokens: sum('outputTokens'),
    input_tokens_details: { cached_tokens: sum('cacheReadTokens') },
    output_tokens_details: { reasoning_tokens: sum('reasoningTokens') },
  };
}

export function aggregateProviderRetryCount(usages = []) {
  const values = usages.map((usage) => usage?.retryCount ?? usage?.retry_count).filter((value) => typeof value === 'number' && Number.isFinite(value) && value >= 0);
  return values.length ? values.reduce((total, value) => total + value, 0) : undefined;
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
  const proposalHash = hashTelemetryId(input.proposalHash || input.proposalId);
  if (contextHash) output.contextHash = String(contextHash);
  if (receiptHash) output.receiptHash = String(receiptHash);
  if (actionHash) output.actionHash = String(actionHash);
  if (requestHash) output.requestHash = String(requestHash);
  if (proposalHash) output.proposalHash = String(proposalHash);
  if (Array.isArray(input.proposalIds)) output.proposalHashes = input.proposalIds.map(hashTelemetryId).filter(Boolean);
  if (Array.isArray(input.toolNames)) {
    output.toolNames = input.toolNames.filter((name) => typeof name === 'string' && RUPHUS_READ_TOOL_NAMES.includes(name.trim())).map((name) => name.trim());
  }
  if (input.trace && typeof input.trace === 'object') {
    const trace = {};
    if (Array.isArray(input.trace.reads)) trace.reads = input.trace.reads
      .filter((item) => RUPHUS_READ_TOOL_NAMES.includes(item?.name))
      .map((item) => ({ name: item.name, ...(typeof item.at === 'string' ? { at: item.at } : {}) }));
    if (Array.isArray(input.trace.focusChanges)) trace.focusChanges = input.trace.focusChanges
      .filter((item) => item && (item.from != null || item.to != null))
      .map((item) => ({ ...(hashTelemetryId(item.from) ? { fromRefHash: hashTelemetryId(item.from) } : {}), ...(hashTelemetryId(item.to) ? { toRefHash: hashTelemetryId(item.to) } : {}) }));
    if (Array.isArray(input.trace.regenerations)) trace.regenerations = input.trace.regenerations.map((item) => ({
      ...(Array.isArray(item?.triggers) ? { triggers: item.triggers.filter((value) => typeof value === 'string' && /^[A-Z0-9_]+$/.test(value)) } : {}),
      ...(Array.isArray(item?.secondFailure) ? { secondFailure: item.secondFailure.filter((value) => typeof value === 'string' && /^[A-Z0-9_]+$/.test(value)) } : {}),
      ...(typeof item?.at === 'string' ? { at: item.at } : {}),
    }));
    if (Array.isArray(input.trace.toolEvents)) {
      trace.toolEvents = input.trace.toolEvents.filter((item) => TRACE_TOOL_NAMES.has(item?.name))
        .map((item) => ({
          name: item.name,
          ...(TRACE_OUTCOMES.has(item?.outcome) ? { outcome: item.outcome } : {}),
          ...(traceCode(item) ? { code: traceCode(item) } : {}),
          ...(SLOT_KEYS.includes(item?.slot) ? { slot: item.slot } : {}),
          ...(hashTelemetryId(item?.target) ? { targetHash: hashTelemetryId(item.target) } : {}),
        }));
      if (!trace.toolEvents.length) delete trace.toolEvents;
    }
    if (Object.keys(trace).length) output.trace = trace;
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
