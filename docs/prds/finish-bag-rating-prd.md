# Finish Bag Rating Prompt — PRD

## Context

When a user finishes a bag (taps "Finish Bag" on the Rotation tab), it currently archives immediately with no prompt. Many beans end up in the Archive unrated because there's no natural touchpoint to capture a rating. This feature intercepts the finish flow to prompt for a rating before archiving.

## Feature Summary

When the user taps "Finish Bag", check if any tasting exists for that bean:
- **Has tasting(s)** → finish immediately (no change to current behavior)
- **No tastings** → show a prompt modal with 3 options:
  1. **Quick Rate** — inline star rating (1-5 coffee beans), saves a minimal tasting record, finishes the bag
  2. **Full Review** — opens the manual tasting form (all fields), saves tasting on submit, finishes the bag
  3. **Skip** — "Just finish it" — finishes with no rating (current behavior)

## User Flow

```
Tap "Finish Bag"
  → Any tastings for this bean?
    → YES → finishBean() immediately (no change)
    → NO → Show FinishBagPrompt modal:
        ┌─────────────────────────────┐
        │  Rate this bean?            │
        │  {bean.name} by {roaster}   │
        │                             │
        │  ☕ ☕ ☕ ☐ ☐  (tap to rate) │
        │                             │
        │  [Quick Save]  [Full Review]│
        │                             │
        │  Just finish it →           │
        └─────────────────────────────┘

  Quick Save (after tapping stars):
    → addTasting({ beanId, date: today(), rating: N })
    → finishBean(beanId)
    → close modal

  Full Review:
    → open manual tasting form (pre-selected to this bean)
    → user fills fields + rating
    → on submit: addTasting({...fields}) → finishBean(beanId)
    → close modal

  Just finish it:
    → finishBean(beanId)
    → close modal
```

## Data Model

No new fields. Uses existing tasting record structure:

```js
// Quick rate creates a minimal tasting:
{
  beanId: "...",
  date: "2026-02-24",       // today()
  rating: 4,                // 1-5, from star tap
  aroma: "",
  firstSip: "",
  acidity: "",
  sweetness: "",
  body: "",
  finish: "",
  oneWord: "",
  notes: "",
  changeTomorrow: ""
}
```

## Files to Create

| File | Purpose |
|------|---------|
| `src/components/FinishBagPrompt.jsx` | Modal with quick-rate stars, full review button, skip option |

## Files to Modify

| File | Change |
|------|--------|
| `src/tabs/RotationTab.jsx` | Intercept "Finish Bag" click — check tastings, show prompt or finish directly |
| `src/App.jsx` | Pass `tastings` and `addTasting` to RotationTab |

## Component: FinishBagPrompt

Uses existing `Modal` component (centered variant). Props:

```jsx
FinishBagPrompt({ open, onClose, bean, onQuickRate, onFullReview, onSkip })
```

**UI Layout:**
- Title: "Rate this bean?"
- Bean name + roaster subtitle
- `StarRating` component (interactive, reuse existing)
- "Quick Save" button (enabled only after tapping a star)
- "Full Review" button → opens manual tasting form
- "Just finish it" link/ghost button at bottom

**Styling:** Uses existing Modal with `centered` prop. Warm theme, compact.

## Full Review Sub-flow

When user taps "Full Review":
- Close the FinishBagPrompt
- Open a tasting form modal (reuse TastingTab's form fields, but in a Modal)
- Bean is pre-selected (not a dropdown — we know which bean)
- All tasting fields available: aroma, firstSip, acidity, sweetness, body, finish, oneWord, notes, changeTomorrow, rating
- On submit: `addTasting({...})` then `finishBean(beanId)`

**Implementation note:** The tasting form is currently inline in TastingTab (not a reusable component). Two approaches:
1. **Extract the form into a shared component** (`TastingForm.jsx`) that both TastingTab and FinishBagPrompt can use
2. **Build a simpler version** directly in FinishBagPrompt — same fields, wrapped in a Modal

Option 1 is cleaner long-term. The extracted form would accept `beanId` (fixed, no dropdown) and `onSubmit` callback.

## Props Flow

```
App.jsx
  → RotationTab: beans, tastings, addTasting, onFinishBean, updateBean
    → FinishBagPrompt: bean, onQuickRate, onFullReview, onSkip
```

Currently RotationTab does NOT receive `tastings` or `addTasting`. App.jsx needs to pass these down.

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Bean has multiple tastings | Any tasting exists → skip prompt, finish directly |
| User rates 0 stars (no selection) | "Quick Save" button stays disabled until stars tapped |
| User opens full review then cancels | Return to prompt modal (don't finish the bag) |
| User taps same star twice | Toggles to 0 (existing StarRating behavior) — Quick Save re-disables |
| Offline | Same as current — Firestore will sync when back online |
| Quick rate then immediately tap another finish | Each is independent, modal is per-bean |

## Implementation Sequence

1. Pass `tastings` and `addTasting` from App.jsx to RotationTab
2. Create `FinishBagPrompt.jsx` with quick-rate UI
3. Extract tasting form into `TastingForm.jsx` (shared component)
4. Refactor TastingTab to use the shared `TastingForm`
5. Wire full review flow in FinishBagPrompt using `TastingForm` in a Modal
6. Intercept "Finish Bag" in RotationTab — check tastings, show prompt or finish

## Verification

1. Build succeeds
2. Tap "Finish Bag" on a bean WITH existing tastings → finishes immediately (no prompt)
3. Tap "Finish Bag" on a bean with NO tastings → prompt appears
4. Quick rate: tap 4 stars → "Quick Save" → bean finishes, tasting with rating=4 appears in Archive
5. Full review: fill in fields → submit → bean finishes, full tasting record in Archive
6. Skip: "Just finish it" → bean finishes with no tasting (same as current behavior)
7. Cancel: close modal → nothing happens, bean stays active
8. Verify tasting records show up correctly in Archive tab (star ratings visible)
9. Test on mobile viewport
