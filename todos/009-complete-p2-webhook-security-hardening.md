---
status: pending
priority: p2
issue_id: 009
tags: [code-review, security, webhook]
dependencies: []
---

# P2: RevenueCat webhook — timing-safe comparison, uid validation, strict plan mapping, atomic write

## Problem Statement

Four related issues in `api/revenuecat-webhook.js`:

1. **Non-timing-safe bearer comparison** (`line 57`): `authHeader !== expected` is a plain string compare. Timing oracle leaks the secret. Use `crypto.timingSafeEqual`.

2. **No uid validation** (`line 66`): `event.app_user_id` is used directly in `db.collection('users').doc(uid)`. A crafted uid with `/` splits into subcollections. No length cap. Combined with a leaked webhook secret (low probability), attacker can write to arbitrary Firestore docs.

3. **Fragile plan mapping** (`mapPlan`, lines 18-25): `productId.includes('ultra.annual')` does substring matching. If Apple/RC changes format or a combo product name matches two patterns, wrong plan gets written. A `null` fallback silently drops plan updates, so a user renewing from pro to ultra could show as pro forever.

4. **Double Firestore write** (`lines 109-110`): `set({subscription: {}}, {merge: true})` followed by `update(update)` is non-atomic. If the second call fails, an empty `subscription: {}` doc is created. Should be a single `set(..., {merge: true})`.

## Findings

**File:** `api/revenuecat-webhook.js`

Flagged by: security P2-2, P2-3, P2-4, data-integrity P2-5, performance #11.

## Proposed Solution

Combined fix:

```js
import { timingSafeEqual } from 'crypto';

const PLAN_MAP = {
  'com.talmeltzer.coffeehub.pro.monthly': 'pro_monthly',
  'com.talmeltzer.coffeehub.pro.annual': 'pro_annual',
  'com.talmeltzer.coffeehub.ultra.monthly': 'ultra_monthly',
  'com.talmeltzer.coffeehub.ultra.annual': 'ultra_annual',
};

const UID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

function mapPlan(productId) {
  return PLAN_MAP[productId] ?? null;
}

function timingSafeAuthCheck(header, expected) {
  const provided = header?.startsWith('Bearer ') ? header.slice(7) : header;
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// In handler:
if (!timingSafeAuthCheck(req.headers.authorization, expected)) {
  return res.status(401).json({ error: 'Unauthorized' });
}

const uid = event.app_user_id;
if (!uid || !UID_PATTERN.test(uid)) {
  return res.status(400).json({ error: 'Invalid app_user_id' });
}

const plan = mapPlan(event.product_id);
if (!plan && (event.type === 'INITIAL_PURCHASE' || event.type === 'RENEWAL' || event.type === 'PRODUCT_CHANGE')) {
  // Unknown product on a purchase-like event is a revenue-integrity failure.
  console.error('[RC webhook] unknown product_id on purchase event:', event.product_id, event.type);
  return res.status(500).json({ error: 'unknown_product' }); // RC will retry
}

// Single atomic write:
const subFields = {
  status: newStatus,
  lastEventType: type,
  lastEventAt: new Date().toISOString(),
};
if (plan) subFields.plan = plan;
if (event.expiration_at_ms) subFields.expiresAt = new Date(event.expiration_at_ms).toISOString();
if (event.purchased_at_ms && type === 'INITIAL_PURCHASE') {
  subFields.originalPurchaseDate = new Date(event.purchased_at_ms).toISOString();
}
if (event.store) subFields.store = String(event.store).toLowerCase();

await userRef.set({ subscription: subFields }, { merge: true });
```

## Technical Details

- File: `api/revenuecat-webhook.js`
- Confirm exact App Store Connect product IDs from `docs/plans/2026-04-09-gtm-app-store-launch-plan.md`

## Acceptance Criteria

- [ ] Bearer comparison uses `timingSafeEqual`
- [ ] uid validated against `^[A-Za-z0-9_-]{1,128}$`
- [ ] `mapPlan` uses explicit allowlist, logs unknown product_ids
- [ ] Purchase events with unknown product_id return 500 (triggers RC retry)
- [ ] Single `set({...}, {merge: true})` call instead of set+update
- [ ] Test: webhook with invalid uid → 400
- [ ] Test: webhook with unknown product on RENEWAL → 500, retries
- [ ] Test: webhook with forged bearer → 401

## Work Log
