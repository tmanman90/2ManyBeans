import { buildTimerSteps } from './brewTimerSteps.js';

const KEY_PREFIX = 'active-brew-timer-v1:';
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

const keyFor = (uid) => `${KEY_PREFIX}${uid || 'demo'}`;

export function readBrewTimerSession(uid, storage, now = Date.now()) {
  try {
    storage ||= globalThis.localStorage;
    const raw = storage.getItem(keyFor(uid));
    if (!raw) return null;
    const session = JSON.parse(raw);
    const valid = session?.version === 1
      && ['running', 'paused', 'done'].includes(session.phase)
      && Number.isFinite(session.startedAt)
      && session.startedAt <= now
      && now - session.startedAt < MAX_AGE_MS
      && Number.isInteger(session.stepIndex)
      && session.stepIndex >= 0
      && Number.isFinite(session.stepStartedAt)
      && Number.isFinite(session.pausedAccumMs)
      && Number.isFinite(session.stepPausedAccumMs)
      && (session.phase !== 'paused' || Number.isFinite(session.pauseStartedAt))
      && (session.phase !== 'done' || Number.isFinite(session.completion?.elapsedMs))
      && buildTimerSteps(session.recipe)?.[session.stepIndex];
    if (valid) return session;
    storage.removeItem(keyFor(uid));
  } catch {
    // Storage may be unavailable in private browsing or after WebView reset.
  }
  return null;
}

export function writeBrewTimerSession(uid, session, storage) {
  try {
    storage ||= globalThis.localStorage;
    storage.setItem(keyFor(uid), JSON.stringify({ ...session, version: 1 }));
    return true;
  } catch {
    return false;
  }
}

export function clearBrewTimerSession(uid, storage) {
  try { (storage || globalThis.localStorage).removeItem(keyFor(uid)); } catch { /* storage unavailable */ }
}
