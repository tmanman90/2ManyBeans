import { toAidenProfile, buildAidenTitle, assertValidAidenProfile } from '../../src/lib/aidenProfileValidation.js';

export function buildRuphusAttemptProfile(attempt, bean) {
  const profile = toAidenProfile(attempt?.snapshot, bean);
  const suffix = ` · ${String(attempt?.id || '').slice(-16)}`;
  profile.title = `${buildAidenTitle(bean, '').slice(0, Math.max(1, 50 - suffix.length))}${suffix}`.slice(0, 50);
  return profile;
}

/**
 * The external adapter is injected so this state machine can be verified
 * without contacting Fellow. Only the immutable attempt snapshot is projected
 * into the adapter; callers cannot supply a recipe or model metadata.
 */
export async function prepareRuphusAttempt({ attempt, bean, adapter, now = new Date().toISOString() }) {
  if (!attempt?.id || !attempt.snapshot || !['created', 'preparing', 'uncertain'].includes(attempt.status)) {
    throw Object.assign(new Error('Attempt is not available for preparation.'), { code: 'invalid_attempt_state' });
  }
  const profile = buildRuphusAttemptProfile(attempt, bean);
  assertValidAidenProfile(profile);
  if (attempt.status === 'uncertain') {
    if (typeof adapter?.reconcile !== 'function') return { attempt: { status: 'uncertain', updatedAt: now }, external: null };
    const observed = await adapter.reconcile({ attemptId: attempt.id, externalId: attempt.externalId || null, title: profile.title });
    if (!observed) return { attempt: { status: 'uncertain', updatedAt: now }, external: null };
    return { attempt: { status: 'profile_prepared', preparedAt: now, externalId: observed.profileId || attempt.externalId || null, link: observed.link || attempt.link || null }, external: observed };
  }
  try {
    const prepare = typeof adapter === 'function' ? adapter : adapter?.prepare;
    if (typeof prepare !== 'function') throw new Error('Aiden preparation adapter is unavailable.');
    const external = await prepare(profile);
    return { attempt: { status: 'profile_prepared', preparedAt: now, externalId: external?.profileId || null, link: external?.link || null }, external };
  } catch (error) {
    const uncertain = error?.code === 'timeout' || error?.name === 'AbortError';
    return { attempt: { status: uncertain ? 'uncertain' : 'failed', updatedAt: now, ...(error?.externalId ? { externalId: error.externalId } : {}) }, error };
  }
}

export async function reconcileRuphusAttempt({ attempt, adapter, now = new Date().toISOString() }) {
  if (!attempt?.id || attempt.status !== 'uncertain' || typeof adapter?.reconcile !== 'function') {
    throw Object.assign(new Error('Attempt is not available for reconciliation.'), { code: 'invalid_attempt_state' });
  }
  const observed = await adapter.reconcile({ attemptId: attempt.id, externalId: attempt.externalId || null });
  if (!observed) return { attempt: { status: 'uncertain', updatedAt: now }, external: null };
  return { attempt: { status: 'profile_prepared', preparedAt: now, externalId: observed.profileId || attempt.externalId || null, link: observed.link || attempt.link || null }, external: observed };
}
