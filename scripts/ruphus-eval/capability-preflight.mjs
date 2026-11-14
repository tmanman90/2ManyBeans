import { MODEL_ARMS, getArm, assertExactArms, EVALUATION_CAP_USD } from './models.mjs';

export const ALLOWED_PROVIDER_HOSTS = Object.freeze(new Set(['api.openai.com', 'api.anthropic.com']));
const FORBIDDEN_ENV = /(^|_)(FIREBASE|GOOGLE_APPLICATION|FELLOW|AIDEN|VERCEL|SUPABASE|GEMINI|XAI|STRIPE|PRODUCTION|SERVICE_ACCOUNT|DATABASE_URL)/i;

export function checkEvaluationIdentity(identity = {}, expectedIdentity = null) {
  const errors = [];
  const requiredEvidence = ['credentialFingerprint', 'authorizationLabel'];
  if (!expectedIdentity || requiredEvidence.some((key) => typeof expectedIdentity[key] !== 'string' || !expectedIdentity[key])) errors.push('frozen expected credential fingerprint and authorization label are required');
  if (identity.userAuthorized !== true) errors.push('explicit user authorization is required');
  if (typeof identity.credentialFingerprint !== 'string' || !identity.credentialFingerprint) errors.push('credential fingerprint is required');
  if (typeof identity.authorizationLabel !== 'string' || !identity.authorizationLabel) errors.push('authorization label is required');
  if (expectedIdentity) for (const key of requiredEvidence) if (identity[key] !== expectedIdentity[key]) errors.push(`actual evaluation identity does not match expected ${key}`);
  if (identity.projectId === 'production' || identity.workspaceId === 'production' || identity.shared === true) errors.push('production/shared provider identity is forbidden');
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
  // Identity, quota, and environment gates run before any adapter can issue a
  // provider request. Invalid setup is a zero-call fail-closed result.
  const identityCheck = checkEvaluationIdentity(identity, expectedIdentity);
  const environmentCheck = checkEnvironment(env);
  const setupErrors = [...identityCheck.errors];
  if (!environmentCheck.ok) setupErrors.push(`forbidden environment variables: ${environmentCheck.forbidden.join(', ')}`);
  if (setupErrors.length) return { ok: false, checks: [], errors: setupErrors, identity: identityCheck, environment: environmentCheck };
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
