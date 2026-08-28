import { MODEL_ARMS, getArm, assertExactArms, EVALUATION_CAP_USD } from './models.mjs';

export const ALLOWED_PROVIDER_HOSTS = Object.freeze(new Set(['api.openai.com', 'api.anthropic.com']));
const FORBIDDEN_ENV = /(^|_)(FIREBASE|GOOGLE_APPLICATION|FELLOW|AIDEN|VERCEL|SUPABASE|GEMINI|XAI|STRIPE|PRODUCTION|SERVICE_ACCOUNT|DATABASE_URL)/i;

export function checkEvaluationIdentity(identity = {}, expectedIdentity = null) {
  const errors = [];
  const requiredEvidence = ['projectId', 'workspaceId', 'credentialFingerprint', 'quotaEvidenceId', 'maxQuotaUsd'];
  if (!expectedIdentity || requiredEvidence.some((key) => expectedIdentity[key] == null)) errors.push('frozen expected evaluation identity and provider evidence are required');
  if (expectedIdentity && (typeof expectedIdentity.maxQuotaUsd !== 'number' || !Number.isFinite(expectedIdentity.maxQuotaUsd) || expectedIdentity.maxQuotaUsd <= 0 || expectedIdentity.maxQuotaUsd > EVALUATION_CAP_USD)) errors.push('expected identity quota cap must be finite, positive, and no higher than approved cap');
  if (!identity.projectId || !identity.workspaceId || identity.dedicated !== true || !identity.credentialFingerprint || !identity.quotaEvidenceId) errors.push('dedicated evaluation project/workspace attestation and evidence are required');
  if (expectedIdentity) for (const key of requiredEvidence) if (identity[key] !== expectedIdentity[key]) errors.push(`actual evaluation identity does not match expected ${key}`);
  if (identity.projectId === 'production' || identity.workspaceId === 'production' || identity.shared === true) errors.push('production/shared provider identity is forbidden');
  if (typeof identity.quotaUsd !== 'number' || !Number.isFinite(identity.quotaUsd) || identity.quotaUsd > EVALUATION_CAP_USD || (expectedIdentity && identity.quotaUsd > expectedIdentity.maxQuotaUsd)) errors.push('provider-side quota must be attributable and no higher than approved cap');
  if (typeof identity.quotaUsd === 'number' && identity.quotaUsd <= 0) errors.push('provider-side quota must be positive');
  return { ok: errors.length === 0, errors };
}
export function checkEnvironment(env = process.env) {
  const forbidden = Object.keys(env).filter((key) => FORBIDDEN_ENV.test(key));
  return { ok: forbidden.length === 0, forbidden };
}
export function checkEgress(url) {
  try { const parsed = new URL(url); const host = parsed.hostname; return { ok: parsed.protocol === 'https:' && ALLOWED_PROVIDER_HOSTS.has(host), host }; }
  catch { return { ok: false, host: null }; }
}
export function validatePreflight(result = {}) {
  const errors = [];
  const identity = checkEvaluationIdentity(result.identity, result.expectedIdentity);
  if (!identity.ok) errors.push(...identity.errors);
  const env = checkEnvironment(result.env || process.env);
  if (!env.ok) errors.push(`forbidden environment variables: ${env.forbidden.join(', ')}`);
  if (!result.modelAccess || !result.streaming || !result.completeUsage || !result.requestId) errors.push('model access, streaming, complete usage, and request ID are all required');
  if (!result.providerHost || !checkEgress(result.providerHost).ok) errors.push('provider host attribution is required and must be allowlisted');
  if (!result.requestedModel || !result.returnedModel || result.returnedModel !== result.requestedModel) errors.push('provider returned model does not equal requested exact model');
  return { ok: errors.length === 0, errors, identity, environment: env };
}
export function assertPreflight(result) { const checked = validatePreflight(result); if (!checked.ok) throw new Error(`preflight failed: ${checked.errors.join('; ')}`); return checked; }
export async function runPreflight({ adapters = [], identity, expectedIdentity, env = process.env } = {}) {
  assertExactArms(MODEL_ARMS);
  const results = [];
  for (const arm of MODEL_ARMS) {
    const adapter = adapters.find((item) => item.provider === arm.provider);
    const probe = adapter?.probe ? await adapter.probe(arm) : {};
    const forbiddenIdentityKeys = ['armId', 'provider', 'model', 'effort', 'thinking', 'endpoint', 'cacheRegime', 'requestedModel', 'identity', 'expectedIdentity'];
    if (forbiddenIdentityKeys.some((key) => Object.prototype.hasOwnProperty.call(probe, key))) throw new Error(`preflight probe cannot override canonical ${forbiddenIdentityKeys.find((key) => Object.prototype.hasOwnProperty.call(probe, key))}`);
    results.push({ ...probe, id: arm.id, armId: arm.id, provider: arm.provider, model: arm.model, effort: arm.effort ?? null, thinking: arm.thinking ?? null, endpoint: arm.endpoint, cacheRegime: arm.cacheRegime });
  }
  assertExactArms(results);
  const checks = results.map((result) => ({ ...result, ...validatePreflight({ ...result, requestedModel: result.model, identity, expectedIdentity, env }) }));
  return { ok: checks.every((check) => check.ok), checks };
}
