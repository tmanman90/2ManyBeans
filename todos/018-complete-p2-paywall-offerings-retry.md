---
status: pending
priority: p2
issue_id: 018
tags: [code-review, frontend, ux, apple-review]
dependencies: []
---

# P2: PaywallSheet has no retry when `getOfferings()` fails

## Problem Statement

`PaywallSheet.jsx` calls `Purchases.getOfferings()` on open. On failure, it shows "Could not load subscription options. Please try again." with NO retry button. Apple reviewers may flag a paywall that shows a dead error state on first launch as broken. The rejection comment lives at the top of the file warning about toggle paywalls — a broken paywall is worse.

## Findings

**File:** `src/components/PaywallSheet.jsx:133-139`

Flagged by: architecture P2-3.

## Proposed Solution

Add a retry button AND show skeleton cards with "-" placeholders:
```jsx
{error && !offering ? (
  <div style={styles.errorState}>
    <p>Could not load subscription options.</p>
    <button onClick={handleRetryOfferings}>Try Again</button>
  </div>
) : loading ? (
  <SkeletonCards /> // greyed-out card layout with "-" prices
) : (
  <TierCards ... />
)}
```

Do NOT hardcode fallback prices in the UI — Apple has rejected apps for that. Dynamic-only.

## Acceptance Criteria

- [ ] Retry button appears on `getOfferings` failure
- [ ] Skeleton cards show while loading
- [ ] Retry re-calls `getOfferings` and either succeeds or shows error again
- [ ] No hardcoded price strings in the UI on any path

## Work Log
