---
status: pending
priority: p2
issue_id: 015
tags: [code-review, frontend, races, subscriptions]
dependencies: []
---

# P2: Subscription gate in brew hooks doesn't cancel in-flight chain

## Problem Statement

`useHandBrew.js` and `useAidenBrew.js` use a Symbol-based request-token pattern (`activeRequestRef.current = rid`) to gate stale tail effects. But the subscription gates return early WITHOUT updating `activeRequestRef`. Sequence:

1. Pro user taps Bean A → `rid_A` assigned → research + recipe generation starts
2. Subscription expires mid-flight → `hasPro = false`
3. User taps Bean B → gate fires, returns with `openPaywall()`
4. Bean A's async chain is STILL running. `activeRequestRef.current === rid_A` because the gate didn't clear it.
5. A's tail effects fire normally: `setAidenRecipe`, `setAidenResult`, and `updateBean(beanA.id, {aidenRecipe: ...})` persists a Pro-gated recipe despite the user no longer having Pro

Additionally: if the user cancels mid-generation, the already-generated recipe still gets persisted because `bean.id` is closure-captured.

## Findings

**Files:**
- `src/hooks/useHandBrew.js:49-53`
- `src/hooks/useAidenBrew.js:76-82`

Flagged by: races P2-7.

## Proposed Solution

When a gate denies, invalidate any in-flight chain:
```js
// useAidenBrew handleBrewWithAiden
if (!hasCachedRecipeOnly && !hasPro) {
  activeRequestRef.current = null; // cancel anything in flight
  openPaywall({ feature: 'generic', promote: 'pro' });
  return;
}

// useHandBrew handleBrewHandBrew
if (!hasPro) {
  activeRequestRef.current = null;
  openPaywall({ feature: 'generic', promote: 'pro' });
  return;
}
```

Additionally, watch `hasPro`/`hasUltra` at the hook level via useEffect and null the ref whenever they flip true → false:
```js
useEffect(() => {
  if (!hasPro) activeRequestRef.current = null;
}, [hasPro]);
```

This defends against "user's sub lapsed while a request was already in flight."

## Acceptance Criteria

- [ ] Subscription gates null `activeRequestRef.current` on deny
- [ ] Effect watching hasPro/hasUltra flips invalidates in-flight chains
- [ ] Test: start a recipe generation, expire subscription via Firestore console, verify no recipe persisted to bean doc
- [ ] Test: tap Bean A (in-flight Pro recipe) → sub expires → tap Bean B → paywall shows → Bean A's modal doesn't magically complete

## Work Log
