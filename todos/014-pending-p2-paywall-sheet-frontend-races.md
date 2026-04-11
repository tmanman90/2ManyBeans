---
status: pending
priority: p2
issue_id: 014
tags: [code-review, frontend, races, ux]
dependencies: []
---

# P2: PaywallSheet + Settings restore/delete async bugs

## Problem Statement

Four frontend race/cleanup issues in the paywall and settings subscription flows:

1. **PaywallSheet setTimeout not cleared**: `handlePurchase` success sets a `setTimeout(onClose, 600)`. If the user taps close during the 600ms window, `onClose` still fires a second time. If the user rapidly reopens the paywall, the timer closes the fresh instance.

2. **`useEffect([open, context?.promote])` resets cycle on every promote object change**: `usePaywall.jsx` creates a new `paywallContext` object on every `setPaywallContext({trigger, promote})` call. If the user manually switches to Monthly and then another gate triggers with the same promote, the effect re-runs and resets to Annual.

3. **`handleRestore` has no unmount guard**: SettingsPage's restore handler calls `restorePurchases()` async. If the user closes Settings during the 2-5s StoreKit call, the success toast lands on an unmounted component → silent success with no feedback.

4. **Ultra gate in `handlePushToAiden` leaves modal spinning**: Pro user triggers recipe generation → generates → phase flips to `'push'` → Ultra gate denies → paywall opens but `aidenLoading` stays true. User closes paywall → spinner still shown forever until modal manually closed.

## Findings

**Files:**
- `src/components/PaywallSheet.jsx:110-116, 168-191`
- `src/components/SettingsPage.jsx:347-367`
- `src/hooks/useAidenBrew.js:37-44`

Flagged by: races P2-2, P2-3, P2-4, P2-8.

## Proposed Solution

**1. PaywallSheet timer cleanup:**
```js
const closeTimerRef = useRef(null);
// on success:
closeTimerRef.current = setTimeout(() => { /* ... */ }, 600);
// cleanup on unmount AND on open→false:
useEffect(() => () => clearTimeout(closeTimerRef.current), []);
useEffect(() => { if (!open) clearTimeout(closeTimerRef.current); }, [open]);
```

**2. PaywallSheet open-transition guard:**
```js
const wasOpenRef = useRef(false);
useEffect(() => {
  if (open && !wasOpenRef.current) {
    setError(null);
    setTier(context?.promote === 'ultra' ? 'ultra' : 'pro');
    setCycle('annual');
  }
  wasOpenRef.current = open;
}, [open, context?.promote]);
```

**3. SettingsPage handleRestore mounted ref:**
```js
const mountedRef = useRef(true);
useEffect(() => () => { mountedRef.current = false; }, []);
// in handler:
const info = await restorePurchases();
if (!mountedRef.current) {
  // Still show a global-level toast so the user sees the outcome even after navigating away
  window.dispatchEvent(new CustomEvent('global-toast', { detail: 'Subscription restored' }));
  return;
}
setToast(...);
```

Or better: hoist `toast` state up to a global toast provider that outlives SettingsPage.

**4. useAidenBrew Ultra gate cleanup:**
```js
if (!hasUltra) {
  setAidenLoading(false);
  setAidenPhase(null);
  openPaywall({ feature: 'aiden', promote: 'ultra' });
  return;
}
```

## Acceptance Criteria

- [ ] PaywallSheet timer cleared on unmount AND on open flip
- [ ] Tier/cycle reset only on open false→true transition
- [ ] handleRestore doesn't call setState on unmounted component
- [ ] Ultra gate in push resets loading/phase state before opening paywall
- [ ] Test: rapid paywall close+reopen doesn't auto-close the fresh instance
- [ ] Test: Pro user tapping Aiden push doesn't leave a stuck spinner

## Work Log
