---
status: pending
priority: p1
issue_id: 008
tags: [code-review, security, dead-code, subscriptions]
dependencies: []
---

# P1: Legacy productShot branch in api/gemini.js bypasses Pro gate

## Problem Statement

`api/gemini.js` is wrapped in `withCorsAuthMetered({ feature: 'aiScans', freeLimit: 3 })`. Inside the handler, there's a legacy `action === 'productShot'` branch (lines 117-119) that routes to `handleProductShot()`. The canonical product-shot route is `/api/product-shot` (wrapped in `withCorsAuthPro`, Pro required). But the legacy branch in gemini.js is reachable by any authenticated client that POSTs `{ action: 'productShot' }` — a free user with 2 scans remaining can generate a product shot by hitting the Gemini route instead, burning a scan credit in the process but bypassing the Pro-only gate on the canonical route.

Client code (`src/lib/gemini.js:172`) already posts to `/api/product-shot` (correct), so the gemini.js branch is dead code. But it's also an abuse surface.

## Findings

**File:** `api/gemini.js:115-119`

Flagged by: architecture P1-5.

## Proposed Solutions

### Delete the dead branch (recommended)
```js
// api/gemini.js — remove these lines:
if (action === 'productShot') {
  return await handleProductShot(req, res);
}
```

And if `handleProductShot` is not used elsewhere in gemini.js, delete it too. Verify with grep first.

## Recommended Action

Ship before launch. Lowest-risk fix of all the P1s.

## Technical Details

- File: `api/gemini.js`
- Verify: `grep -n "handleProductShot" api/gemini.js` — if the only call site is the dead branch, delete the helper

## Acceptance Criteria

- [ ] `action === 'productShot'` branch removed from `api/gemini.js`
- [ ] `handleProductShot` helper removed if unused
- [ ] Test: POST `{action: 'productShot'}` to `/api/gemini` as a free user → rejected (or ignored and routed to handleText)
- [ ] Test: existing client-side product shot flow still works via `/api/product-shot`
- [ ] Build passes

## Work Log
