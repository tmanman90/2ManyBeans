---
status: pending
priority: p3
issue_id: 024
tags: [code-review, cleanup, config]
dependencies: [019]
---

# P3: Free tier limits hardcoded in multiple places

## Problem Statement

Free tier caps are duplicated:
- `api/claude.js`: `freeLimit: 1` (tasteTests)
- `api/gemini.js`: `freeLimit: 3` (aiScans)
- `src/hooks/usePaywall.jsx` (if not deleted per TODO 019): `>= 1` and `>= 3` hardcoded

If we ever bump server-side limits, the client must be updated in lockstep or will show the paywall early.

## Findings

**Files:** `api/claude.js`, `api/gemini.js`, `src/hooks/usePaywall.jsx`

Flagged by: architecture P2-2.

## Proposed Solution

Extract to a shared config:
```js
// src/lib/subscriptionConfig.js
export const FREE_LIMITS = {
  aiScans: 3,
  tasteTests: 1,
};
```

Import in both client and server (plain JS module, no React/firebase-admin).

## Acceptance Criteria

- [ ] Single source of truth for free limits
- [ ] Imported by client and server
- [ ] Test: change limit in one place, verify both sides use new value

## Work Log
