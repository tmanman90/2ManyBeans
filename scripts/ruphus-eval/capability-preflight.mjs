import { MODEL_ARMS, assertExactArms, EVALUATION_CAP_USD } from './models.mjs';

export const ALLOWED_PROVIDER_HOSTS = Object.freeze(new Set(['api.openai.com', 'api.anthropic.com']));
const FORBIDDEN_ENV = /(^|_)(FIREBASE|GOOGLE_APPLICATION|FELLOW|AIDEN|VERCEL|SUPABASE|GEMINI|XAI|STRIPE|PRODUCTION|SERVICE_ACCOUNT|DATABASE_URL)/i;

export function checkEvaluationIdentity(identity = {}) {
  const errors = [];
  if (!identity.projectId || !identity.workspaceId) errors.push('evaluation project/workspace identity is required');
  if (identity.projectId === 'production' || identity.workspaceId === 'production' || identity.shared === true) errors.push('production/shared provider identity is forbidden');
  if (identity.quotaUsd == null || identity.quotaUsd > EVALUATION_CAP_USD) errors.push('provider-side quota must be attributable and no higher than approved cap');
  if (identity.quotaUsd != null && identity.quotaUsd <= 0) errors.push('provider-side quota must be positive');
  return { ok: errors.length === 0, errors };
}
export function checkEnvironment(env = process.env) {
  const forbidden = Object.keys(env).filter((key) => FORBIDDEN_ENV.test(key));
  return { ok: forbidden.length === 0, forbidden };
}
export function checkEgress(url) {
  try { const host = new URL(url).hostname; return { ok: ALLOWED_PROVIDER_HOSTS.has(host), host }; }
  catch { return { ok: false, host: null }; }
}
export function validatePreflight(result = {}) {
  const errors = [];
  const identity = checkEvaluationIdentity(result.identity);
  if (!identity.ok) errors.push(...identity.errors);
  const env = checkEnvironment(result.env || process.env);
  if (!env.ok) errors.push(`forbidden environment variables: ${env.forbidden.join(', ')}`);
  if (!result.modelAccess || !result.streaming || !result.completeUsage || !result.requestId) errors.push('model access, streaming, complete usage, and request ID are all required');
  if (result.providerHost && !checkEgress(result.providerHost).ok) errors.push('provider host is not allowlisted');
  return { ok: errors.length === 0, errors, identity, environment: env };
}
export function assertPreflight(result) { const checked = validatePreflight(result); if (!checked.ok) throw new Error(`preflight failed: ${checked.errors.join('; ')}`); return checked; }
export async function runPreflight({ adapters = [], identity, env = process.env } = {}) {
  assertExactArms(MODEL_ARMS);
  const results = [];
  for (const arm of MODEL_ARMS) {
    const adapter = adapters.find((item) => item.provider === arm.provider);
    const probe = adapter?.probe ? await adapter.probe(arm) : {};
    results.push({ armId: arm.id, ...probe });
  }
  const checks = results.map((result) => ({ ...result, ...validatePreflight({ ...result, identity, env }) }));
  return { ok: checks.every((check) => check.ok), checks };
}
