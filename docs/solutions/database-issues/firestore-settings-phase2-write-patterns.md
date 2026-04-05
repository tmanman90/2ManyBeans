---
title: "Phase 2 Settings: Firestore write patterns, atomic consent, context memoization, Capgo OTA"
category: database-issues
date: 2026-04-05
tags:
  - firestore-writes
  - batch-operations
  - security-rules
  - memoization
  - capgo-ota
  - pwa-workbox
  - ui-consistency
  - settings
  - preferences
modules:
  - src/components/SettingsPage.jsx
  - src/hooks/useUserProfile.jsx
  - src/hooks/useAppData.js
  - firestore.rules
  - vite.config.js
severity: P1
---

# Phase 2 Settings & Preferences: Write Patterns and Deployment

Consumer launch Phase 2 introduced a full Settings page with user preferences (grinder, brew method, grind display, canister count), dynamic canister management, and a brew method registry. Code review surfaced 3 P1 and 5 P2 issues, all resolved before merge.

## Related Documentation

- [Async side-effect during React render](../runtime-errors/async-side-effect-during-react-render.md) -- useRef guard pattern for migration writes
- [Native profile load failure](../logic-errors/native-profile-load-failure-indistinguishable-from-missing.md) -- Firestore read error vs. missing state
- [Capgo OTA overrides](../integration-issues/capgo-ota-overrides-local-builds-and-native-deploy-path.md) -- autoUpdate lifecycle and TestFlight boundary
- [Consumer launch master plan](../../plans/2026-04-04-005-feat-consumer-launch-master-plan.md) -- Phase 2 spec (tasks 2.1-2.7)

---

## Problem 1: Double Firestore Writes in Preference Handlers

**Symptom:** Two Firestore writes fired for a single user action (changing grinder, confirming canister decrease).

**Root cause:** `handleGrinderChange` called `updatePreferences({grinder})` then `updatePreferences({grinderCustomName: null})` as separate operations. `handleCanisterConfirm` wrote `preferences.canisterCount` via `writeBatch` AND then called `updatePreferences()` which fires another `updateDoc`.

**Fix:** Merge related fields into a single call per handler.

```js
// BEFORE (two writes):
await updatePreferences({ grinder: val });
if (val !== 'other') {
  await updatePreferences({ grinderCustomName: null });
}

// AFTER (single write):
const updates = { grinder: val };
if (val !== 'other') updates.grinderCustomName = null;
await updatePreferences(updates);
```

For canister confirm: remove preferences from the batch, keep only `updatePreferences()` after `batch.commit()`.

**Rule:** One logical change = one Firestore write. Never call `updatePreferences` more than once per handler.

---

## Problem 2: Non-Atomic Multi-Document Writes

**Symptom:** Marketing consent toggle could leave profile and emailList collections inconsistent if the second write failed.

**Root cause:** `updateProfile()` then `setDoc()`/`deleteDoc()` on `emailList` as independent async calls with no transactional guarantee.

**Fix:** Use `writeBatch` for both operations atomically.

```js
const batch = writeBatch(db);
batch.update(profileRef, {
  marketingConsent: newVal,
  marketingConsentDate: serverTimestamp(),
});
if (newVal) {
  batch.set(emailRef, { email, displayName, signUpDate: serverTimestamp(), source: 'settings' });
} else {
  batch.delete(emailRef);
}
await batch.commit();
// Optimistic local update AFTER confirmed commit
await updateProfile({ marketingConsent: newVal, marketingConsentDate: new Date() });
```

**Rule:** When writing to 2+ documents that must stay consistent, always use `writeBatch`. Known patterns: marketing consent (profile + emailList), canister decrease (preferences + beans).

---

## Problem 3: Missing Firestore Server-Side Validation

**Symptom:** Username field had client-side regex (`[a-zA-Z0-9_]{3,30}`) but no Firestore rules. Any HTTP client could bypass and write arbitrary strings.

**Fix:** Add validation to `firestore.rules`:

```
&& (request.resource.data.username == null
    || (request.resource.data.username is string
        && request.resource.data.username.size() >= 3
        && request.resource.data.username.size() <= 30
        && request.resource.data.username.matches('^[a-zA-Z0-9_]+$')));
```

**Rule:** Deploy Firestore rules BEFORE client code that writes new fields. Client validation is UX; server validation is security.

---

## Problem 4: Preferences Context Cascade Re-Renders

**Symptom:** Toggling marketing consent (unrelated to preferences) caused all 5 components consuming `usePreferences()` to re-render.

**Root cause:** `const preferences = profile?.preferences || DEFAULT_PREFERENCES` creates a new object reference on every `profile` change. `useMemo` sees a "new" dependency, creates a new context value, and re-renders all consumers.

**Fix:** Stabilize reference with `useRef` + JSON deep-compare:

```js
const prevPrefsRef = useRef(null);
const preferences = useMemo(() => {
  const next = profile?.preferences || DEFAULT_PREFERENCES;
  if (prevPrefsRef.current && JSON.stringify(prevPrefsRef.current) === JSON.stringify(next)) {
    return prevPrefsRef.current;
  }
  prevPrefsRef.current = next;
  return next;
}, [profile?.preferences]);
```

**Rule:** When deriving objects from Firestore docs for React context, always stabilize references with deep-compare. Raw fallback expressions (`x || DEFAULT`) create new references every render.

---

## Problem 5: Capgo OTA Updates Not Applying

**Symptom:** Bundle uploaded successfully, `npx @capgo/cli probe --platform ios` confirmed update available, channel pinned to correct version. Device would not apply the update after 15+ force-closes.

**Root cause:** Unknown. No error in Capgo dashboard.

**Workaround:** Fall back to `cap sync` + TestFlight build.

**Rule:** After any Capgo OTA push, physically test on the iOS device. If the update does not appear within 2 app restarts, escalate to TestFlight rather than debugging Capgo further. Never tell the user "it's live" based solely on CLI output. (auto memory [claude])

---

## Problem 6: PWA Workbox Precache Limit

**Symptom:** Vercel build failed. `onboarding-welcome.png` (2.68MB) exceeded workbox's default 2MB limit.

**Fix:** Add to vite.config.js workbox config:

```js
maximumFileSizeToCacheInBytes: 3 * 1024 * 1024, // 3MB
```

**Rule:** Check image sizes before adding to `public/`. Any image > 2MB breaks workbox precache unless the limit is bumped. Run `find public/ -size +2M` before deploys.

---

## Problem 7: Modal Overlay Inconsistency

**Symptom:** SettingsPage used `rgba(0,0,0,0.4)` without backdrop blur, while every other modal uses warm brown `rgba(44,24,16,0.4)` + `blur(4px)`.

**Fix:** Match Modal.jsx pattern. Also add `-webkit-backdrop-filter` for Safari/iOS.

**Rule:** New modals must use the canonical overlay: `rgba(44,24,16,0.4)` + `backdropFilter: 'blur(4px)'`. Search for `rgba(0` in any modal PR diff.

---

## Prevention Checklist

| # | Check | Signal |
|---|-------|--------|
| 1 | `updatePreferences` called more than once per function | Double write |
| 2 | Consecutive `updateDoc`/`setDoc` on different docs without `writeBatch` | Non-atomic write |
| 3 | Inline object/array in context `value` prop without `useMemo` | Memoization leak |
| 4 | Deploy task closed without device verification for OTA | Unconfirmed delivery |
| 5 | New file in `public/` over 2MB | Precache breakage |
| 6 | `rgba(0,0,0` in any modal overlay | Design inconsistency |
| 7 | New Firestore field without server-side rule validation | Security gap |
