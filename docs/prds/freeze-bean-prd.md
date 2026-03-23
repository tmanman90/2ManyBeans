# Freeze Bean PRD

## Problem
When going on vacation (or anytime beans won't be used), the "days since roast" clock keeps ticking. Beans that are currently in peak will show as fading/past peak when the user returns, even though they were frozen and their freshness was preserved.

## Solution
Add a freeze/unfreeze toggle to any bean. Freezing pauses the roast clock. Unfreezing resumes it.

## How the Clock Works Today
- `daysSinceRoast(bean.roastDate)` calculates days between `roastDate` and today
- This drives peak status (Degassing, Resting, In Peak, Fading, Past Peak, Stale)
- The calculation is purely live, no stored "days" value

## Data Model Changes

Add to bean document in Firestore:

```
frozenAt: string | null       // ISO date when freeze was activated, null if not frozen
frozenDaysElapsed: number | null  // total days already "banked" from prior freeze/unfreeze cycles
```

### Clock Logic

When calculating `daysSinceRoast`:
1. If `frozenAt` is set (bean is currently frozen): return `frozenDaysElapsed + daysBetween(roastDate, frozenAt)`
2. If `frozenDaysElapsed > 0` but `frozenAt` is null (bean was frozen, now thawed): return `daysBetween(roastDate, today()) - frozenDaysElapsed` ... wait, simpler approach:

**Simpler approach: adjust the roast date.**

Instead of tracking frozen time separately, when unfreezing, shift `roastDate` forward by the number of days the bean was frozen. This way the existing `daysSinceRoast` calculation just works with zero changes to peakStatus.js.

BUT this loses the original roast date, which is displayed on the card. So we need:

```
originalRoastDate: string | null   // preserved when first frozen, null if never frozen
frozenAt: string | null            // ISO date when freeze started, null if not frozen
```

**Actually, cleanest approach: offset model.**

```
frozenAt: string | null           // ISO date when freeze was activated, null if not frozen
frozenDays: number                // total frozen days accumulated (default 0)
```

### Adjusted daysSinceRoast Calculation

In `peakStatus.js`, update `daysSinceRoast`:

```js
export const daysSinceRoast = (roastDate, bean = {}) => {
  const { frozenAt, frozenDays = 0 } = bean;
  if (frozenAt) {
    // Frozen: count days from roast to freeze date, minus any prior frozen time
    return daysBetween(roastDate, frozenAt) - frozenDays;
  }
  // Not frozen: normal calculation minus total frozen days
  return daysBetween(roastDate, today()) - frozenDays;
};
```

This is the cleanest because:
- Original `roastDate` is never modified
- "Roasted 2026-03-01" still shows correctly on the card
- Multiple freeze/unfreeze cycles work (frozenDays accumulates)
- Only one function changes (`daysSinceRoast`)

## Freeze Action

When user taps **Freeze**:
```js
updateBean(bean.id, { frozenAt: today() })
```

## Unfreeze Action

When user taps **Unfreeze**:
```js
const daysFrozenThisCycle = daysBetween(bean.frozenAt, today());
updateBean(bean.id, {
  frozenAt: null,
  frozenDays: (bean.frozenDays || 0) + daysFrozenThisCycle
})
```

## UI Changes

### Bean Card
- Add a freeze/unfreeze button next to the edit pencil icon
- **Not frozen**: Snowflake icon (outline), tapping freezes the bean
- **Frozen**: Snowflake icon (filled/blue), tapping unfreezes the bean
- When frozen, the peak status badge should append a snowflake or show "Frozen" indicator so it's obvious the clock is paused
- The "Xd post-roast" text continues to show the frozen day count (it won't change while frozen)

### Where It Appears
- Rotation tab (ACTIVE beans): freeze button visible
- Inventory tab (SEALED beans): freeze button visible
- Archive tab (FINISHED beans): no freeze button (irrelevant)

### Confirmation
- Freeze: no confirmation needed (easily reversible)
- Unfreeze: no confirmation needed (easily reversible)

## Scope
- No batch freeze/unfreeze (one bean at a time)
- No auto-freeze on a schedule
- No freeze history/log
- Works on both ACTIVE and SEALED beans

## Files to Change
1. `src/lib/peakStatus.js` - update `daysSinceRoast` to accept bean object and subtract frozen days
2. `src/components/BeanCard.jsx` - add freeze/unfreeze button, frozen indicator
3. All callers of `daysSinceRoast` and `getPeakStatus` - pass full bean object
4. No Firestore schema migration needed (new fields default to null/0)
