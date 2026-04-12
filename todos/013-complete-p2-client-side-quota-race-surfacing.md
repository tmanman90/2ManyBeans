---
status: pending
priority: p2
issue_id: 013
tags: [code-review, frontend, ux, subscriptions]
dependencies: []
---

# P2: Stale freeUsage race shows generic error instead of paywall

## Problem Statement

Client-side quota check reads `freeUsage?.aiScans` from `SubscriptionContext`, which updates only when the Firestore snapshot fires. The counter is incremented server-side inside `withCorsAuthMetered`. Between "user taps Scan" and "Firestore snapshot reflects the increment" there's a 300-800ms window (seconds on cellular).

Sequence on scan 3 of 3:
1. User taps Scan → client sees `aiScans: 2`, passes gate → request sent
2. Server increments to 3, scan completes
3. Before snapshot fires, user taps Scan again → client still reads `aiScans: 2`, passes gate again
4. Server rejects with 403 `free_tier_exhausted`
5. Client shows generic "Couldn't read the label" toast instead of opening the paywall

User burns retry attempts thinking it's a network issue, then finally Firestore catches up and the paywall opens.

## Findings

**Files:**
- `src/components/AddBeanForm.jsx:handleScan` and `handleAiFill`
- `src/tabs/TastingTab.jsx:startChat`
- `src/tabs/ChatTab.jsx:handleSend`
- `src/hooks/usePaywall.jsx:51-72` (quota helpers, though unused per TODO 026)
- Server error path: the `fetchWithRetry` 403 handling in `src/lib/fetchWithRetry.js` DOES throw a typed error with `err.code === 'free_tier_exhausted'`, but the callers don't catch and route to the paywall

Flagged by: races P2-1.

## Proposed Solution

Two fixes, both needed:

**1. Intercept the server error in each call site** and open the paywall:
```js
try {
  await scanBeanLabel(photos);
} catch (err) {
  if (err.code === 'free_tier_exhausted' || err.code === 'subscription_required') {
    openPaywall({
      feature: err.feature || 'generic',
      promote: err.tier === 'ultra' ? 'ultra' : 'pro',
    });
    return;
  }
  showError('Couldn\'t read the label');
}
```

**2. Optimistic local increment** in `usePaywall` or `SubscriptionContext`:
```js
// Bump a local pending counter when starting a metered call
const [localPending, setLocalPending] = useState({ aiScans: 0, tasteTests: 0 });

// Compare against max of Firestore + pending
const effectiveScans = (freeUsage?.aiScans ?? 0) + localPending.aiScans;
if (effectiveScans >= 3) { /* paywall */ }

// Bump on start, roll back on error
setLocalPending(p => ({ ...p, aiScans: p.aiScans + 1 }));
try { await call() } catch { setLocalPending(p => ({ ...p, aiScans: p.aiScans - 1 })); throw; }
```

Alternatively, centralize in a `useMeteredCall` hook that handles both the optimistic bump and the error-to-paywall routing.

## Acceptance Criteria

- [ ] All AI call sites catch `err.code === 'free_tier_exhausted'` and open the paywall
- [ ] All AI call sites catch `err.code === 'subscription_required'` and open the paywall with correct tier promotion
- [ ] Optimistic local increment prevents the race from surfacing (optional but recommended)
- [ ] Test: throttle network to Slow 3G, free user on 2/3 scans, tap Scan twice rapidly → second tap shows paywall, not generic error

## Work Log
