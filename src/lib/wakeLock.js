// Screen wake lock helper — prevents the display from sleeping during a brew.
//
// Web: uses `navigator.wakeLock.request('screen')`. Feature-detected.
// Native (Capacitor): no-op for now. iOS WebView does support Web Wake Lock in
// 16.4+, but backgrounding suspends JS anyway, so the practical benefit inside
// Capacitor is small. A future TestFlight build can swap this for
// `@capacitor-community/keep-awake` without changing the call sites.
//
// Spec detail: iOS auto-releases the sentinel on visibility change. The
// caller should wire a `visibilitychange` listener to re-acquire on foreground.

import { Capacitor } from '@capacitor/core';

let sentinel = null;

export async function acquireWakeLock() {
  if (Capacitor.isNativePlatform()) return;
  if (typeof navigator === 'undefined') return;
  if (!('wakeLock' in navigator)) return;
  // Already holding a lock — don't double-acquire.
  if (sentinel) return;
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
  try {
    const next = await navigator.wakeLock.request('screen');
    // If something else took the module sentinel while we were awaiting
    // (e.g. a concurrent acquire won the race), release this one instead.
    if (sentinel) {
      try { await next.release(); } catch { /* already released */ }
      return;
    }
    sentinel = next;
    // Only null out when THIS exact sentinel releases. Identity check
    // prevents a stale release event from clearing a newer, active sentinel.
    next.addEventListener('release', () => {
      if (sentinel === next) sentinel = null;
    });
  } catch (err) {
    // NotAllowedError is expected when the page is hidden / policy blocked.
    if (err?.name !== 'NotAllowedError') {
      console.warn('[wakeLock] acquire failed:', err);
    }
  }
}

export async function releaseWakeLock() {
  const current = sentinel;
  if (!current) return;
  sentinel = null;
  try {
    await current.release();
  } catch {
    // Already released.
  }
}
