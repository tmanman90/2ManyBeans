---
status: pending
priority: p2
issue_id: 017
tags: [code-review, frontend, subscriptions, logs]
dependencies: []
---

# P2: AddBeanForm pre-generates product shot for free users (noisy 403)

## Problem Statement

After a successful scan, `AddBeanForm` auto-calls `generateProductShot` via `/api/product-shot`. That endpoint is Pro-gated (`withCorsAuthPro`). For free users, every scan produces a 403 in Vercel logs + flips `productShotStatus` to `'failed'` with no user-visible "this is a Pro feature" hint. Not a correctness bug (caught and logged quietly) but wasteful and noisy.

## Findings

**File:** `src/components/AddBeanForm.jsx` (product-shot pre-generation block)

Flagged by: architecture P2-5.

## Proposed Solution

Gate the pre-generation on `hasPro`:
```js
// In AddBeanForm, before calling generateProductShot:
if (!hasPro) {
  // Free users don't get auto product shots. Silent skip — the UI already tolerates no photoUrl.
  return;
}
await generateProductShot(...);
```

Do NOT set `productShotStatus` for free users — leave it at `'idle'` so the UI shows no spinner/failure state.

## Acceptance Criteria

- [ ] `generateProductShot` call wrapped in `if (hasPro)` check
- [ ] Free users complete a scan with no product-shot 403s in Vercel logs
- [ ] Free users don't see a "product shot failed" UI state
- [ ] Pro users still get auto product shots as before

## Work Log
