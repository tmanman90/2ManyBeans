// Fire-and-forget analytics writer for the onboarding flow.
// Events land in `users/{uid}/onboarding_events/{eventId}` — a Firestore
// subcollection governed by the Phase 0 rules block. Firebase Analytics
// is not installed (WKWebView-flaky), so Firestore is the funnel source.
//
// Every call is swallowed on failure — we never let a missed analytics
// event block the user. Offline writes queue in the Firestore cache and
// replay on reconnect.

import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';

export async function logOnboardingEvent(name, meta = {}) {
  try {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    if (typeof name !== 'string' || !name) return;
    // `screen` is pulled out of meta so it can be a top-level field (matches
    // the rules validator + makes funnel queries trivial). Everything else
    // stays in `meta`.
    const { screen, ...rest } = meta || {};
    await addDoc(collection(db, 'users', uid, 'onboarding_events'), {
      name: name.slice(0, 80),
      screen: typeof screen === 'string' ? screen.slice(0, 40) : null,
      timestamp: serverTimestamp(),
      meta: rest && typeof rest === 'object' ? rest : {},
    });
  } catch {
    // Swallowed on purpose. Analytics is directional — one dropped event
    // never justifies interrupting onboarding.
  }
}
