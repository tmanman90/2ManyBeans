---
title: "Native profile getDoc failure treated as 'profile doesn't exist' risks data loss"
category: logic-errors
date: 2026-04-04
tags: [firestore, capacitor, native, error-handling, getDoc, data-loss]
module: User Profile
symptom: "Existing user silently sent through onboarding after network hiccup, profile overwritten"
root_cause: "getDoc catch block sets profile=null, same state as genuinely missing document"
---

## Problem

On native (Capacitor/WKWebView), `useUserProfile` does a single `getDoc` at boot. If that call fails (network error, timeout), the catch block set `profile = null` and `loaded = true`. This is the same state as "profile genuinely doesn't exist."

The boot sequence then falls through to onboarding. If the user completes onboarding, `createProfile` does a full `setDoc` (not merge), overwriting their real profile with defaults. Their preferences, display name, and consent settings are gone.

## Root Cause

```jsx
// WRONG: error and missing are indistinguishable
.catch(err => {
  setProfile(null);  // same as "doesn't exist"
  setLoaded(true);
});
```

## Solution

Add a distinct `loadError` state and retry with backoff:

```jsx
const [loadError, setLoadError] = useState(false);

const loadProfile = (attempt = 1) => {
  getDoc(profileRef).then(snap => {
    if (snap.exists()) {
      setProfile({ id: snap.id, ...snap.data() });
    } else {
      setProfile(null); // genuinely doesn't exist
    }
    setLoaded(true);
    setLoadError(false);
  }).catch(err => {
    if (attempt < 3) {
      setTimeout(() => loadProfile(attempt + 1), 1000 * attempt);
    } else {
      setLoadError(true); // NOT "doesn't exist"
      setLoaded(true);
    }
  });
};
```

In main.jsx, check `profileLoadError` before falling through to onboarding:
```jsx
if (profileLoadError) return <LoadingScreen message="Connection issue. Retrying..." />;
```

## Prevention

- Always distinguish "data doesn't exist" from "failed to load data"
- Use separate state values: `null` for missing, `loadError` for failure
- Add retry with backoff for single-read patterns on native (no real-time listener to recover)
- Never let a network error silently trigger a destructive write path (like createProfile overwriting existing data)
