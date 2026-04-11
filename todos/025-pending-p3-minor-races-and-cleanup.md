---
status: pending
priority: p3
issue_id: 025
tags: [code-review, cleanup, races]
dependencies: []
---

# P3: Minor frontend race hygiene and small cleanup items

## Problem Statement

Collection of small issues, none individually important enough to warrant their own todo:

1. **`logInRevenueCat` not cancel-guarded** (main.jsx:73-78): rapid sign-out/sign-in could complete a logIn against a previous uid. Add a `cancelled` ref in the effect cleanup.

2. **`purchasePackage` cancelled-detection flimsy** (revenuecat.js:122-129): `PURCHASES_ERROR_CODE?.PURCHASE_CANCELLED_ERROR` may be undefined on older SDKs. Check `err?.userCancelled` as the primary signal.

3. **Initial `getCustomerInfo` vs listener ordering** (SubscriptionContext.jsx:96-111): listener could fire before the initial `getCustomerInfo` resolves, then the initial's stale data could clobber the listener's fresh data. Register listener first.

4. **Webhook double-write** (revenuecat-webhook.js:109-110): covered in TODO 009, included here for cross-reference.

5. **Webhook idempotency key**: RC retries webhooks. Harmless today but if we ever add accrual-type side effects (free-tier resets, analytics), dedupe on `event.id`.

6. **SettingsPage 1080-LOC re-renders on sub change** (performance #5): extract SubscriptionRow into its own component to isolate re-renders. Optional optimization, not a correctness issue.

7. **`deleteStep` state object vs two primitives**: keep split (clearer).

## Findings

Flagged by: races P3-1, P3-2, P3-4, performance #5, data-integrity (idempotency mention).

## Proposed Solution

Address as time allows. None are blockers. Items 1-3 are ~5 lines each.

## Acceptance Criteria

- [ ] `logInRevenueCat` effect cancel-guarded
- [ ] purchasePackage primarily checks `err?.userCancelled`
- [ ] SubscriptionContext listener registered before initial getCustomerInfo
- [ ] Optional: SettingsPage subscription row extracted

## Work Log
