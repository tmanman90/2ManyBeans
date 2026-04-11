---
status: pending
priority: p3
issue_id: 020
tags: [code-review, cleanup]
dependencies: []
---

# P3: Dead imports and unused CONTEXT_COPY variants

## Problem Statement

Small cleanup items:

1. **`src/components/SettingsPage.jsx`**: Icons `FileText`, `Shield`, `CreditCard` imported from `lucide-react` but never rendered in JSX. Tree-shaken by Vite so zero bundle impact, but noisy.

2. **`src/components/PaywallSheet.jsx`**: `CONTEXT_COPY.multi_brewer` entry has no call site. The only Ultra trigger in the codebase is `feature: 'aiden'`.

3. **`src/lib/revenuecat.js`**: `deriveEntitlements` is exported but only imported by `SubscriptionContext.jsx`. Either drop `export` keyword or inline.

## Findings

**Files:**
- `src/components/SettingsPage.jsx:4`
- `src/components/PaywallSheet.jsx:40-43`
- `src/lib/revenuecat.js:106-114`

Flagged by: simplicity Findings 3, 6, 14.

## Proposed Solution

1. Remove `FileText`, `Shield`, `CreditCard` from SettingsPage imports
2. Remove `multi_brewer` entry from PaywallSheet CONTEXT_COPY
3. Leave `deriveEntitlements` for testability (marginal either way)

## Acceptance Criteria

- [ ] SettingsPage lucide-react import line trimmed
- [ ] PaywallSheet CONTEXT_COPY has 4 entries (scan_cap, taste_cap, aiden, generic)
- [ ] Build passes

## Work Log
