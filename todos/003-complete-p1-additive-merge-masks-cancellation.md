---
status: pending
priority: p1
issue_id: 003
tags: [code-review, subscriptions, frontend]
dependencies: []
---

# P1: SubscriptionContext additive-merge locks user in Pro after cancellation

## Problem Statement

`SubscriptionContext.jsx` merges two state sources (Firestore + RC SDK) with `prev.hasPro || (active && isProPlan)` in BOTH listeners. Once `hasPro` becomes true in component state, no source can ever make it false for the lifetime of the mount. A cancelled user retains Pro UI access forever until they reload the app, even when the webhook has correctly written `subscription.status = 'expired'` to Firestore.

The comment at lines 82-90 correctly states Firestore should be authoritative — the implementation contradicts the comment.

Related: On user-switch on a shared device (sign out → sign in as a different user), the previous user's `hasPro=true` leaks into the new user's context until the first Firestore snapshot arrives AND the OR logic keeps it.

## Findings

**File:** `src/contexts/SubscriptionContext.jsx:58-61, 99-120`

Flagged by: architecture P1-1, races P1-2, performance #3, simplicity Finding 5.

**Scenario:**
1. User subscribes → context `hasPro = true`
2. User cancels in iOS Settings → EXPIRATION webhook fires → Firestore `status = 'expired'`
3. Firestore listener fires, computes `active = false`, runs `prev.hasPro || false = true` → UI stays unlocked
4. Server-side gates still reject API calls (good) but client shows Pro UI → user is confused
5. Server-side calls return generic errors (not paywall)

## Proposed Solutions

### Option 1: Firestore-authoritative, SDK additive-only (recommended)
Make Firestore listener directly assign state (can unlock AND downgrade). Keep RC SDK as additive-only (can only unlock, never downgrade) to preserve the cold-start protection.

```js
// Firestore listener (authoritative):
setState((prev) => ({
  ...prev,
  hasPro: active && isProPlan,       // direct assignment, can downgrade
  hasUltra: active && isUltraPlan,
  plan, status, freeUsage,
  loading: false,
}));

// RC SDK listener (additive only):
setState((prev) => ({
  ...prev,
  hasPro: prev.hasPro || hasPro,
  hasUltra: prev.hasUltra || hasUltra,
}));
```
- Pros: Matches stated policy. Cancellation works. Cold-start SDK-empty case still handled.
- Cons: Brief flicker if SDK returns stale "true" right after Firestore returns "false". Acceptable.
- Effort: Small

### Option 2: firestoreLoaded flag
Track whether Firestore has reported once. Before it has, SDK is additive. After, Firestore wins.
- Pros: Handles the "purchase just completed, webhook not yet fired" window more gracefully.
- Cons: More state.
- Effort: Small-Medium

### Option 3: Reset state to INITIAL on uid change
Orthogonal fix for the user-switch leak. Both listeners reset on every `uid` change, not only null.
```js
useEffect(() => {
  setState(INITIAL_STATE);
  if (!uid) return;
  // ...
}, [uid]);
```
Should be combined with Option 1 or 2.

## Recommended Action

Option 1 + Option 3. Ship both before launch.

## Technical Details

- File: `src/contexts/SubscriptionContext.jsx`
- No server changes
- No schema changes

## Acceptance Criteria

- [ ] Firestore listener uses direct assignment (not OR merge)
- [ ] RC SDK listener keeps additive-only merge
- [ ] Both listeners reset to INITIAL_STATE on every `uid` change
- [ ] Test: subscribe, cancel in Firestore console (`status = 'expired'`), verify UI locks without reload
- [ ] Test: sign out user A, sign in as user B (fresh account), verify user B starts as free even if user A was Pro
- [ ] Test: purchase flow still unlocks UI instantly via RC SDK listener before webhook fires

## Work Log
