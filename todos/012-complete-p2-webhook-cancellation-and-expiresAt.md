---
status: pending
priority: p2
issue_id: 012
tags: [code-review, data-integrity, subscriptions]
dependencies: []
---

# P2: Webhook cancellation premature downgrade + checkEntitlement doesn't honor expiresAt

## Problem Statement

Two related bugs:

1. **Premature cancellation downgrade**: `api/revenuecat-webhook.js` maps `CANCELLATION` → `status: 'cancelled'` immediately. `checkFirestoreSubscription` only returns active for `status in ['active','trial']` → a cancelled user loses Pro immediately when the webhook fires, even if 11 months of paid access remain.

2. **expiresAt not checked in fast path**: `api/lib/checkEntitlement.js:48` only checks `status`, not `expiresAt`. A user whose subscription expired BUT whose `EXPIRATION` webhook was lost retains entitlement indefinitely (Firestore says `active`, no expiry check).

Combined impact: users either get downgraded too early (cancellation) or too late (missed expiration event).

## Findings

**Files:**
- `api/revenuecat-webhook.js:29-44`
- `api/lib/checkEntitlement.js:41-54`

Flagged by: security P3-1, data-integrity P3-2.

## Proposed Solution

**Webhook**: keep `status: 'active'` on CANCELLATION, add `cancelAtPeriodEnd: true`:
```js
const STATUS_MAP = {
  INITIAL_PURCHASE: 'active',
  RENEWAL: 'active',
  PRODUCT_CHANGE: 'active',
  UNCANCELLATION: 'active',
  TRIAL_STARTED: 'trial',
  TRIAL_CONVERTED: 'active',
  TRIAL_CANCELLED: 'active', // still active until trialEnd
  CANCELLATION: 'active', // still active until expiresAt
  EXPIRATION: 'expired',
  BILLING_ISSUE: 'active',
  BILLING_ISSUE_DETECTED: 'active',
  // ...
};

// On CANCELLATION or TRIAL_CANCELLED, set cancelAtPeriodEnd flag for UI display
if (type === 'CANCELLATION' || type === 'TRIAL_CANCELLED') {
  subFields.cancelAtPeriodEnd = true;
}
if (type === 'UNCANCELLATION') {
  subFields.cancelAtPeriodEnd = false;
}
```

**checkEntitlement**: verify expiresAt in fast path:
```js
async function checkFirestoreSubscription(uid) {
  // ...
  if (sub.status !== 'active' && sub.status !== 'trial') return null;
  if (sub.expiresAt && new Date(sub.expiresAt) < new Date()) return null; // expired, fall through to RC
  return entitlementsFromPlan(sub.plan);
}
```

## Acceptance Criteria

- [ ] CANCELLATION keeps `status: 'active'`, sets `cancelAtPeriodEnd: true`
- [ ] EXPIRATION still sets `status: 'expired'`
- [ ] `checkFirestoreSubscription` falls through to RC API when `expiresAt < now`
- [ ] Test: cancel mid-period → user keeps access until `expiresAt`
- [ ] Test: expired subscription with missing webhook → RC API fallback catches it
- [ ] UI can read `cancelAtPeriodEnd` and show "Your subscription ends on MM/DD"

## Work Log
