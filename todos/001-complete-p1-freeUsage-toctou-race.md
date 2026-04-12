---
status: pending
priority: p1
issue_id: 001
tags: [code-review, security, data-integrity, subscriptions]
dependencies: []
---

# P1: freeUsage quota has a TOCTOU race — free users can burn the cap N× in parallel

## Problem Statement

`withCorsAuthMetered` does read-check-write on the freeUsage counter without a transaction. Two concurrent requests both read `used`, both pass the check, both increment. For `tasteTests` (limit=1) a user can double-spend trivially from two devices or by firing concurrent requests. The header comment claims "atomically BEFORE the handler runs" but the implementation is non-atomic.

## Findings

**File:** `api/lib/cors-auth.js:190-207`

Flagged by: security-sentinel P1-1, data-integrity P1-1, architecture P1-2, performance #1.

**Reproducer:**
```bash
for i in {1..20}; do
  curl -X POST https://2manybeans.vercel.app/api/claude \
    -H "Authorization: Bearer $ID_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"messages":[{"role":"user","content":"hi"}]}' &
done
wait
```
Expected AI budget burn: 1 call. Actual: up to 20. Same exploit on `/api/gemini` with `freeLimit: 3`.

## Proposed Solutions

### Option 1: Firestore transaction (recommended)
Wrap read-check-increment in `db.runTransaction`:
```js
await db.runTransaction(async (tx) => {
  const snap = await tx.get(userRef);
  const used = snap.data()?.subscription?.freeUsage?.[feature] ?? 0;
  if (used >= freeLimit) throw { code: 'exhausted', used };
  tx.set(userRef, { subscription: { freeUsage: { [feature]: used + 1 } } }, { merge: true });
});
```
- Pros: Atomic. Retries on conflict. Standard Firestore pattern.
- Cons: Adds ~50-100ms vs current implementation. One round-trip per call still.
- Effort: Small

### Option 2: Sharded counter with server-verified cap
Use a separate `users/{uid}/usageLedger/{feature}` doc with `FieldValue.increment(1)` then verify post-write.
- Pros: No transaction needed.
- Cons: Separate Firestore doc, more complex security rules.
- Effort: Medium

## Recommended Action

Option 1. Ship before launch.

## Technical Details

- File: `api/lib/cors-auth.js`
- Affects: All metered endpoints (`api/claude.js`, `api/gemini.js`)
- No schema changes

## Acceptance Criteria

- [ ] `withCorsAuthMetered` uses `db.runTransaction` for read-check-increment
- [ ] Concurrent-fire test: 10 parallel requests against `/api/claude` with `freeLimit: 1` result in exactly 1 AI call
- [ ] 403 `free_tier_exhausted` returned for 9 of 10 requests
- [ ] Transaction handles retry-on-conflict correctly (Firestore retries up to 5 times by default)

## Work Log
