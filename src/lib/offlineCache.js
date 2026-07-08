// Offline cache for bean/tasting/profile snapshots on native.
//
// Big-data cache (beans, tastings, profile) uses idb-keyval → IndexedDB.
// Async, non-blocking, no main-thread stalls from localStorage.setItem.
// Each write is tagged with a monotonic `writtenAt` timestamp so a later
// write can skip if the target is already fresher (eliminates the last-
// writer-wins race between polls and mutation refetches).
//
// Small-data keys (LAST_UID_KEY) stay in localStorage because they're
// boot-critical, tiny, and read synchronously during the auth gate.
import { Capacitor } from '@capacitor/core';
import { get as idbGet, set as idbSet, del as idbDel, createStore } from 'idb-keyval';

const PREFIX = 'tmb_';
const LAST_UID_KEY = `${PREFIX}lastUid`;
const isNative = Capacitor.isNativePlatform();

export const chatKey = (uid) => `chat_${uid}`;

// Dedicated IDB database so we don't collide with Firestore's persistence IDB.
const store = createStore('tmb-cache', 'kv');

// --- Big-data cache (async, IDB-backed) ---

// In-memory write queue keyed by cacheKey. A pending write for the same key
// overrides an older one -- we don't need to persist the stale value.
const pendingWrites = new Map();
let flushTimer = null;

async function flushPending() {
  flushTimer = null;
  const entries = Array.from(pendingWrites.entries());
  pendingWrites.clear();
  for (const [key, { data, writtenAt }] of entries) {
    try {
      // Skip if something newer was written to IDB between enqueue and flush.
      const existing = await idbGet(key, store);
      if (existing && existing.writtenAt && existing.writtenAt > writtenAt) continue;
      await idbSet(key, { data, writtenAt }, store);
    } catch { /* quota / IDB unavailable -- silent */ }
  }
}

export const cacheWrite = (key, data) => {
  if (!isNative) return;
  pendingWrites.set(PREFIX + key, { data, writtenAt: Date.now() });
  // Coalesce bursts: schedule a single flush on the next tick rather than
  // firing one IDB transaction per caller.
  if (!flushTimer) {
    flushTimer = setTimeout(flushPending, 0);
  }
};

export const cacheRead = async (key) => {
  if (!isNative) return null;
  try {
    const entry = await idbGet(PREFIX + key, store);
    return entry?.data ?? null;
  } catch {
    return null;
  }
};

// --- Last-uid boot hint (sync, localStorage) ---

// "Was signed in last time" hint — lets the boot sequence keep the loading
// screen up on native cold starts while Firebase Auth restores the persisted
// session, instead of flashing the sign-in screen.
export const cacheWriteLastUid = (uid) => {
  if (!isNative || !uid) return;
  try { localStorage.setItem(LAST_UID_KEY, uid); } catch { /* silent */ }
};

export const cacheReadLastUid = () => {
  if (!isNative) return null;
  try { return localStorage.getItem(LAST_UID_KEY); } catch { return null; }
};

export const cacheClearLastUid = () => {
  if (!isNative) return;
  try { localStorage.removeItem(LAST_UID_KEY); } catch { /* silent */ }
};

// --- Full per-uid clear (fire-and-forget) ---

export const cacheClear = (uid) => {
  if (!isNative || !uid) return;
  // Drop the known IDB keys for this user. Fire and forget.
  Promise.all([
    idbDel(`${PREFIX}beans_${uid}`, store),
    idbDel(`${PREFIX}tastings_${uid}`, store),
    idbDel(`${PREFIX}profile_${uid}`, store),
    idbDel(`${PREFIX}${chatKey(uid)}`, store),
  ]).catch(() => { /* silent */ });
  // Also clear any legacy localStorage entries from before the IDB migration.
  try {
    const suffix = `_${uid}`;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith(PREFIX) && key.endsWith(suffix)) {
        localStorage.removeItem(key);
      }
    }
  } catch { /* silent */ }
};
