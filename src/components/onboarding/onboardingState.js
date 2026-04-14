// Uid-scoped localStorage persistence for the onboarding flow.
// Every key is namespaced per-uid so signing out and back in (or switching
// accounts on a shared WKWebView device) never leaks answers between users.
//
// On QuotaExceeded, we flip an in-memory latch and no-op subsequent saves —
// the flow continues in memory and the resume-on-next-launch path starts fresh.

export const ONBOARDING_STATE_KEY_PREFIX = 'onboarding_state_v1';
// DEV-only flag that forces Gate 5 to mount the onboarding flow even when
// the Firestore profile already has onboardingComplete === true. Local to
// the device — NEVER writes to Firestore, so toggling it on one device
// cannot strand the user in onboarding on another device.
export const DEV_FORCE_ONBOARDING_KEY = '__dev_force_onboarding_v1';

export function keyFor(uid) {
  return `${ONBOARDING_STATE_KEY_PREFIX}_${uid}`;
}

let quotaBroken = false;

// Best-effort "did the stored blob even look right" check. We never trust
// shapes — anything that fails validation falls back to a fresh start.
function isValidShape(obj, validSteps) {
  if (!obj || typeof obj !== 'object') return false;
  if (typeof obj.step !== 'string') return false;
  if (validSteps && !validSteps.includes(obj.step)) return false;
  if (!obj.answers || typeof obj.answers !== 'object') return false;
  return true;
}

export function loadState(uid, { validSteps, onFailure } = {}) {
  if (!uid) return null;
  try {
    const raw = localStorage.getItem(keyFor(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isValidShape(parsed, validSteps)) {
      if (onFailure) onFailure('shape_invalid');
      return null;
    }
    return parsed;
  } catch (err) {
    if (onFailure) onFailure('corrupt_json');
    return null;
  }
}

export function saveState(uid, state) {
  if (!uid || quotaBroken) return;
  try {
    localStorage.setItem(keyFor(uid), JSON.stringify(state));
  } catch (err) {
    // QuotaExceededError (name varies by browser) — give up on localStorage
    // for this session. In-memory state keeps the flow running.
    if (err && (err.name === 'QuotaExceededError' || err.code === 22)) {
      quotaBroken = true;
    }
  }
}

export function clearState(uid) {
  if (!uid) return;
  try {
    localStorage.removeItem(keyFor(uid));
  } catch {
    // localStorage can be completely unavailable in private modes; treat
    // as success — there's nothing to clear.
  }
}

// Test/dev hook so the error boundary can reset the latch after a reload.
export function __resetQuotaLatch() {
  quotaBroken = false;
}

// DEV-only replay flag helpers. Safe to call from any module; no-op if
// localStorage is unavailable. See DEV_FORCE_ONBOARDING_KEY comment.
export function isDevForceOnboarding() {
  try {
    return localStorage.getItem(DEV_FORCE_ONBOARDING_KEY) === '1';
  } catch {
    return false;
  }
}

export function setDevForceOnboarding(value) {
  try {
    if (value) {
      localStorage.setItem(DEV_FORCE_ONBOARDING_KEY, '1');
    } else {
      localStorage.removeItem(DEV_FORCE_ONBOARDING_KEY);
    }
  } catch {
    // localStorage unavailable — nothing to do.
  }
}
