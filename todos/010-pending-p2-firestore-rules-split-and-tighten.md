---
status: pending
priority: p2
issue_id: 010
tags: [code-review, security, firestore-rules]
dependencies: [002]
---

# P2: Firestore rules — split create/update, tighten subcollection fallback

## Problem Statement

Two issues beyond TODO 002 (create-path subscription injection):

1. **Permissive subcollection fallback** (`users/{userId}/{collection}/{document}`): Grants `read, write` on EVERY subcollection under `users/{uid}` except `secrets`. If we ever add `users/{uid}/usageLedger/*` (e.g. to fix TODO 001 with a sharded counter), clients get unrestricted write access by default.

2. **Create rule with diff guard**: The current rule uses `diff(resource.data)` which behaves unexpectedly on create (where `resource` is null). See TODO 002 for the full fix.

## Findings

**File:** `firestore.rules:56-64`

Flagged by: security P2-6, data-integrity (question 3).

## Proposed Solution

Replace the permissive fallback with an explicit allowlist:

```
match /users/{userId}/beans/{beanId} {
  allow read, write: if request.auth != null && request.auth.uid == userId;
}

match /users/{userId}/tastings/{tastingId} {
  allow read, write: if request.auth != null && request.auth.uid == userId;
}

match /users/{userId}/secrets/{secretId} {
  allow read, write: if false; // Admin SDK only
}

// Deny-by-default: any subcollection not explicitly matched above is blocked for clients.
// Server-managed collections (e.g. usageLedger) should be reached only via Admin SDK.
```

Also combine with TODO 002's create/update split.

## Acceptance Criteria

- [ ] Explicit allowlist for `beans`, `tastings`, `secrets`
- [ ] Wildcard `users/{uid}/{collection}/{document}` fallback removed
- [ ] Test: client can write to `users/{uid}/beans/x` ✓
- [ ] Test: client can write to `users/{uid}/tastings/x` ✓
- [ ] Test: client cannot write to `users/{uid}/junk/x` ✗
- [ ] Test: Admin SDK can still write to any subcollection (bypasses rules)

## Work Log
