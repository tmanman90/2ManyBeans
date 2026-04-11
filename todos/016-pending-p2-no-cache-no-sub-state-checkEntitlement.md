---
status: pending
priority: p2
issue_id: 016
tags: [code-review, subscriptions, caching]
dependencies: []
---

# P2: checkEntitlement caches "no subscription" state → purchase unlock delayed

## Problem Statement

`api/lib/checkEntitlement.js` caches the result of both Firestore reads and RC API fallback reads in a per-instance in-memory Map for 5 minutes. But when the user has no active subscription yet (fresh free user), both paths return `{pro: false, ultra: false}` and this negative result gets cached.

On a purchase:
1. User completes purchase on-device
2. RC SDK fires → client UI unlocks (good)
3. Webhook fires → writes `subscription.status = 'active'` to Firestore
4. Webhook calls `invalidateEntitlementCache(uid)` → clears cache on the SAME function instance
5. User makes an AI call → request lands on a DIFFERENT warm instance (different Vercel region) → instance still has cached `{pro: false}` from before purchase → 5 min until TTL → 403

The client unlocks but server-side gates still reject.

## Findings

**File:** `api/lib/checkEntitlement.js:72-74`

Flagged by: architecture P1-3, performance (indirectly).

## Proposed Solution

Only cache POSITIVE entitlements. Don't cache `{pro: false}`:
```js
const result = { pro, ultra };
if (pro || ultra) {
  cache.set(uid, { ...result, expiresAt: Date.now() + CACHE_TTL_MS });
}
return result;
```

Negative checks will re-read Firestore on every call (~50ms), which is acceptable for free users making occasional AI calls. Positive checks still hit the cache.

## Acceptance Criteria

- [ ] `checkEntitlement` only caches when `pro || ultra === true`
- [ ] Negative results re-read Firestore every time
- [ ] Test: free user makes a call → no cache entry created → user purchases → next call immediately picks up purchase via Firestore

## Work Log
