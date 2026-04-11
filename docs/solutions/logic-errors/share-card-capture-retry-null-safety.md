---
title: "Share card capture: unvalidated retry, unconditional font wait, missing optional chaining"
category: logic-errors
date: 2026-04-05
module:
  - src/components/ShareCard.jsx
  - src/hooks/useLongPress.js
tags:
  - share-cards
  - modern-screenshot
  - capacitor
  - ios
  - domToPng
  - safari-foreignobject
  - optional-chaining
  - code-review
severity: medium
---

# Share Card Capture: Pre-Merge Bug Trio

Three bugs caught via multi-agent code review on `feat/share-cards-brew-toggle` before merge. All in new share card infrastructure (Phases 1-2).

## Problem

1. **Blank image shared on retry failure:** `captureShareCard()` retries `domToPng` when Safari's foreignObject bug produces a blank PNG. The retry path returned its result without validation, so a second blank attempt would propagate a near-empty data URL to the caller, which would share a blank image with no error.

2. **Unconditional `document.fonts.ready` on Capacitor:** The plan explicitly required skipping this on native builds (fonts load from disk). The implementation waited unconditionally, adding 50-200ms unnecessary latency on every iOS capture.

3. **Crash on missing hook callbacks:** `useLongPress` called `onTap(e)` and `onLongPress(e)` without optional chaining. Any consumer omitting either callback would get a runtime TypeError on touch.

## Root Cause

1. **Retry validation gap:** `domToPng` always resolves (never rejects on blank output). The primary path validated via `dataUrl.length < 1000`, but the retry path returned the raw result. The failure is invisible because a blank PNG is a valid data URL that the Share API accepts without complaint.

2. **Plan-to-code translation miss:** The plan's Performance Considerations section correctly identified the conditional ("Skip on Capacitor builds"), but the sample code block in Phase 2 called `await document.fonts.ready` unconditionally. Implementation followed the code block, not the prose.

3. **Hook API contract unclear:** `useLongPress({ onTap, onLongPress })` destructures both callbacks but doesn't require them. JavaScript destructuring produces `undefined` for missing keys, and calling `undefined()` crashes.

## Solution

### Bug 1: Validate retry result (ShareCard.jsx)

```js
// Before: returns whatever retry produces, even if blank
if (!dataUrl || dataUrl.length < 1000) {
  await new Promise(r => setTimeout(r, 300));
  return domToPng(ref.current, { ...opts, drawImageInterval: 400 });
}

// After: validates retry, returns null on double failure
if (!dataUrl || dataUrl.length < 1000) {
  await new Promise(r => setTimeout(r, 300));
  const retry = await domToPng(ref.current, { ...opts, drawImageInterval: 400 });
  return (!retry || retry.length < 1000) ? null : retry;
}
```

Callers must check for `null` and show a user-facing error.

### Bug 2: Platform-gate font wait (ShareCard.jsx)

```js
// Before: always waits
await document.fonts.ready;

// After: web-only
if (!Capacitor.isNativePlatform()) {
  await document.fonts.ready;
}
```

Required adding `import { Capacitor } from '@capacitor/core'` at the top of the file.

### Bug 3: Optional chaining on callbacks (useLongPress.js)

```js
// Before: crashes if undefined
onLongPress(e);
onTap(e);

// After: no-op if not provided
onLongPress?.(e);
onTap?.(e);
```

## Prevention

**For capture/retry code:**
- Treat retry output as untrusted. Apply the same validation as the primary path.
- Ask: "What does the user see if this step silently returns a bad value instead of throwing?" If the answer is "a bad share" rather than "an error they can retry," add validation.

**For platform-conditional code:**
- When a plan says "skip X on Capacitor," that is a mandatory `if` branch, not an optimization note.
- Review checklist: "Does this function have web-only waits or DOM APIs? Are they all gated with `Capacitor.isNativePlatform()`?"

**For React hooks with callback props:**
- Default rule: all event callbacks are optional. Use `?.()` on every invocation.
- If a callback is truly required, enforce with an explicit guard and error message, not an implicit crash.

## Cross-References

- [Plan doc](../../plans/2026-04-05-011-feat-share-cards-and-brew-toggle-plan.md): Performance Considerations (font wait skip), Dependencies table (blank image risk), Security Notes (touchcancel cleanup)
- [Async side-effect guard pattern](../runtime-errors/async-side-effect-during-react-render.md): same `useRef` guard philosophy used in capture concurrency lock
- [Capgo OTA deploy path](../integration-issues/capgo-ota-overrides-local-builds-and-native-deploy-path.md): new Capacitor plugins (Share, Filesystem) require TestFlight, not Capgo
- `lessons.md`: WKWebView timing quirks, "stabilize context object references"
