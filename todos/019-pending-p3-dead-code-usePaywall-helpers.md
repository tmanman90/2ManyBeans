---
status: pending
priority: p3
issue_id: 019
tags: [code-review, cleanup, yagni]
dependencies: []
---

# P3: Dead code — requirePro, requireUltra, requireScanQuota, requireTasteQuota

## Problem Statement

`src/hooks/usePaywall.jsx` exports 5 helpers: `requirePro`, `requireUltra`, `requireScanQuota`, `requireTasteQuota`, `openPaywall`. A grep across `src/**` shows **only `openPaywall` is ever called**. Every AI feature gate uses `openPaywall` directly after an inline check. The four `require*` helpers are ~50 lines of speculative generality with zero callers.

## Findings

**File:** `src/hooks/usePaywall.jsx:33-73`

Flagged by: simplicity Finding 2.

## Proposed Solution

Delete `requirePro`, `requireUltra`, `requireScanQuota`, `requireTasteQuota` and their related docstring. Keep `openPaywall`, `close`, `paywallContext`.

~50 lines removed.

## Acceptance Criteria

- [ ] Four unused helpers removed
- [ ] Build passes
- [ ] Grep confirms no references outside the file itself

## Work Log
