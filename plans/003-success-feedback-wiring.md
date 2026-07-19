# 003 — Wire success feedback: haptics + confirmation on every save that succeeds silently

- **Status**: TODO
- **Commit**: ec777a5
- **Severity**: MEDIUM
- **Category**: Purpose & frequency (feedback)
- **Estimated scope**: 5 files, ~15 small insertions, no new UI components

## Problem

Several successful actions complete with no positive feedback at all, while errors always get a toast:

```jsx
// src/components/QuickRecipeFlow.jsx:330-334 — current: quick-rate save, silent success
  const handleQuickRateSubmit = async ({ rating, notes }) => {
    const beanId = savedBeanId;
    if (!beanId || !addTasting) return;
    await addTasting({ beanId, rating, notes });
  };
```

```jsx
// src/tabs/TastingTab.jsx:527-536 — current: tasting save, silent success (error path has showError)
  const handleFormSubmit = async (formData) => {
    const tastingData = { date: today(), ...formData };
    try {
      const tastingId = await onAddTasting(tastingData);
      if (tastingId) convertScoresInBackground(tastingId, tastingData);
      setMode('list');
    } catch (err) {
      showError("Couldn't save tasting. Check your connection and try again.");
    }
  };
```

```jsx
// src/components/FinishBagPrompt.jsx:48-50 and :77-80 — current: fist-pump video plays with NO haptic
      await onFinish(bean.id);
      setCelebrating(true);
```

```jsx
// src/components/PaywallSheet.jsx:258 and :281 — current: top commercial moment, text pill only
      setToast('Subscription active');
      ...
        setToast('Subscription restored');
```

```jsx
// src/components/StarRating.jsx:46 — current: bean tap animates but is silent
            onClick={() => onChange?.(value === n ? 0 : n)}
```

`grep -n haptic` confirms none of FinishBagPrompt.jsx, PaywallSheet.jsx, StarRating.jsx, QuickRecipeFlow.jsx import `src/lib/haptics.js`.

## Target

Reuse existing primitives only — `haptic` (`src/lib/haptics.js:4-30`, no-op on web) and the already-animated `Toast` (`src/components/Toast.jsx`, spring entrance with check icon):

- Quick-rate save: success toast "Rating saved" + `haptic.success()`.
- TastingTab form save: `haptic.success()` (the mode flip back to the journal already provides the visual state change; no new toast infra in this tab).
- Bag finished: `haptic.success()` at the exact moment `setCelebrating(true)` runs, both paths.
- Paywall purchase and restore success: `haptic.success()` alongside the existing toasts.
- Star/bean tap: `haptic.selection()` on every rating change.

## Repo conventions to follow

- Haptic exemplar: `src/components/BrewTimer.jsx:77` (`haptic.success()` when the completion screen mounts).
- Selection-haptic exemplar: `src/components/SegmentedControl.jsx` uses `haptic.selection()` on pill change.
- Import style: `import { haptic } from '../lib/haptics';` — do not await the calls in UI handlers (fire and forget, as BrewTimer does).
- QuickRecipeFlow already owns toast state (`:46 const [toast, setToast]`, rendered at `:479`) — reuse it, exemplar `:311 setToast(\`${scanData.name || 'Bean'} saved to inventory\`)`.

## Steps

1. `src/components/QuickRecipeFlow.jsx`: add the haptic import; in `handleQuickRateSubmit` (:330-334), after `await addTasting(...)` add:
   ```jsx
    haptic.success();
    setToast('Rating saved');
   ```
2. `src/tabs/TastingTab.jsx`: add the haptic import; in `handleFormSubmit` (:527), after `const tastingId = await onAddTasting(tastingData);` add `haptic.success();`.
3. `src/components/FinishBagPrompt.jsx`: add the haptic import; insert `haptic.success();` immediately before `setCelebrating(true)` at :49 and :78.
4. `src/components/PaywallSheet.jsx`: add the haptic import; insert `haptic.success();` immediately before `setToast('Subscription active')` (:258) and before `setToast('Subscription restored')` (:281). Do NOT add one to the "No active subscription found" branch (:289) — that is not a success.
5. `src/components/StarRating.jsx`: add the haptic import; change the onClick at :46 to:
   ```jsx
            onClick={() => { if (onChange) { haptic.selection(); onChange(value === n ? 0 : n); } }}
   ```

## Boundaries

- Do NOT add new toast state to TastingTab, FinishBagPrompt, or StarRating.
- Do NOT add haptics to error paths or to non-final steps.
- Do NOT touch the Intelligent Tasting Wizard (`src/components/tasting/`) — it manages its own feedback.
- Do NOT add new dependencies.
- If code at a cited line does not match (drift since ec777a5), STOP and report.

## Verification

- **Mechanical**: `npm run build` passes.
- **Feel check** (device required — haptics are a no-op on web; ship via `/ship-dev`):
  - Quick Recipe > Quick Rate > save: success thud + "Rating saved" toast slides in.
  - Tasting tab > form save: thud as the journal returns.
  - Finish a bag with a rating: thud lands exactly when the fist-pump video appears, not before.
  - Tap stars anywhere (Quick Rate, forms): each tap gives the light selection tick, including tapping the same bean to clear.
  - Paywall (sandbox): purchase/restore success gives the thud with the toast.
- **Done when**: every listed success path produces feedback on device and no error path gained a success signal.
