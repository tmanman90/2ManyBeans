---
title: "Async side effect during React render causes duplicate Firestore writes"
category: runtime-errors
date: 2026-04-04
tags: [react, render-phase, side-effects, firestore, useRef, migration]
module: App Shell
symptom: "Firestore document written multiple times, especially in StrictMode"
root_cause: "Async function called directly in render body without re-entry guard"
---

## Problem

`migrateExistingUser(user)` was called directly in the render body of `Root` in main.jsx. React 19 StrictMode renders twice in development, firing the migration twice. Even in production, any re-render (state change, poll tick) would re-trigger the migration.

```jsx
// WRONG: side effect in render body
if (!profile && dataLoaded && beans.length > 0) {
  migrateExistingUser(user);  // fires on EVERY render
  return <LoadingScreen />;
}
```

## Root Cause

React render functions must be pure. Calling an async function that writes to Firestore during render violates this. The write fires, then the component re-renders (because loading screen triggers), and the write fires again before the first one completes.

## Solution

```jsx
const migrationStarted = useRef(false);

if (!profile && dataLoaded && beans.length > 0) {
  if (!migrationStarted.current) {
    migrationStarted.current = true;
    migrateExistingUser(user).catch(err => {
      console.error('[Migration] Failed:', err);
      migrationStarted.current = false; // allow retry
    });
  }
  return <LoadingScreen />;
}
```

The `useRef` flag is checked and set synchronously (same tick), preventing re-entry even if React renders twice. On error, the flag resets to allow retry on the next render.

## Prevention

- Never call async functions directly in render. Use `useEffect` or a ref guard.
- If you must trigger a one-time side effect from a render gate, use a `useRef(false)` flag
- `setDoc` with `{ merge: true }` makes duplicate writes non-destructive, but they still waste network calls
