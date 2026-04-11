---
status: pending
priority: p2
issue_id: 011
tags: [code-review, data-integrity, apple-review-blocker]
dependencies: [004]
---

# P2: delete-account ordering, parallelization, timeout, idempotency

## Problem Statement

Four related issues in `api/delete-account.js`:

1. **Ordering leaves partial state**: RC → Storage → Firestore → Auth. If Firestore fails mid-way, the user has no photos (Storage wiped) and no RC subscriber but keeps Firestore data + Auth record. If Auth fails last, data is gone but Auth record survives.

2. **Serial subcollection deletion**: `tastings`, `beans`, `secrets` are deleted sequentially. For a user with 1000+ beans + tastings, this approaches Vercel's 10-15s function timeout.

3. **Hardcoded subcollection list**: If a future feature adds `users/{uid}/brewLogs`, delete handler silently orphans it.

4. **Non-idempotent on Auth not-found**: `getAuth().deleteUser(uid)` throws `auth/user-not-found` on retry after a successful first call. The catch converts it to a 500 with a misleading error.

## Findings

**File:** `api/delete-account.js:39-54, 103-168`

Flagged by: security P2-7, data-integrity P2-1, P2-3, architecture P2-4, performance #2.

## Proposed Solution

```js
// Add at top of file
export const config = { maxDuration: 60 }; // Vercel Pro

// Enumerate subcollections dynamically
const subcols = await userRef.listCollections();
// Parallelize
await Promise.all(subcols.map(col => deleteCollection(col)));

// Catch auth/user-not-found as success
try {
  await getAuth().revokeRefreshTokens(uid); // from TODO 004
  await getAuth().deleteUser(uid);
  result.auth = true;
} catch (err) {
  if (err?.code === 'auth/user-not-found') {
    result.auth = true; // idempotent
  } else {
    throw err;
  }
}

// Consider flipping order: Firestore → Storage → RC → Auth
// Rationale: Firestore is reversible-ish (the webhook could recreate sub state),
// but once Storage/RC/Auth are gone, there's no rollback. Do the most-reversible
// step first, most-destructive last.
```

Also add a safety counter to `deleteCollection`:
```js
let iterations = 0;
while (true) {
  if (++iterations > 200) throw new Error('deleteCollection runaway');
  // ...
}
```

## Acceptance Criteria

- [ ] `export const config = { maxDuration: 60 }` added
- [ ] Subcollections enumerated via `listCollections()` (no hardcoded names)
- [ ] Parallel subcollection deletion via `Promise.all`
- [ ] `auth/user-not-found` caught and treated as success
- [ ] `deleteCollection` runaway counter added
- [ ] Test: user with 2000 beans completes deletion in <30s
- [ ] Test: retry after successful delete returns 200, not 500
- [ ] Test: Apple review flow (Guideline 5.1.1(v)) still passes

## Work Log
