---
title: "fix: Brew Methods Review Findings"
type: fix
status: active
date: 2026-04-23
origin: docs/rip-it-runs/2026-04-23-180000.md
---

# fix: Brew Methods Review Findings

## Overview

Three issues found during the final cross-phase review of the Brew Methods Expansion feature (branch `feat/brew-methods-expansion`). All three are on the same branch, ready to fix before merge.

## Problem Statement

1. **grindOffset unit mismatch**: Device grind offsets are applied in raw grinder units instead of converting through microns. Non-Ode Gen 2 users get nearly identical grind starts across all devices.
2. **BrewMethodMenu doesn't pass device key**: Long-press menu shows 5 device options but all call the same handler. Users can't do a one-off brew with a different device.
3. **roasterStyle half-wired**: EditBeanModal dropdown writes `roasterStyle` to Firestore, but `getProfileForRoaster()` callers don't pass the bean, so it's never read. Resolution order also lets fuzzy match override an explicit user selection.

## Scope Boundaries

- No changes to ArchiveDetailSheet, BeanCard, claude.js, or brewMethods.js display logic
- No peak window recalculation when roasterStyle changes (follow-up)
- No visual indicator of "current default device" in the menu (follow-up)
- No multi-recipe archive view (follow-up)
- beanBuilder.js and ChatTab.jsx call sites stay as-is (creation-time paths where roasterStyle/roastLevel don't exist yet)

---

## Fix 1: grindOffset Conversion

**File:** `src/lib/handbrew.js` (function `getDeviceAdjustedGrindStart`, line 229)

**Bug:** `grindOffset` is defined in Ode Gen 2 steps (each = 70 microns). The function adds it directly to every grinder's native `pourOverStart` value. Example: Chemex offset +2 means +140 microns on Ode, but only +10.4 microns on JX-Pro (5.2 microns/click) and +50 microns on Comandante (25 microns/click).

**Fix:** Import `GRINDER_MICRON_SCALES` from `brewMethods.js`. Convert offset to microns, then to target grinder's native units:

```
const odePerStep = 70;
const targetPerStep = GRINDER_MICRON_SCALES[grinderKey]?.perStep || odePerStep;
const nativeOffset = (offset * odePerStep) / targetPerStep;
const adjusted = base + nativeOffset;
```

**Verification (expected values for Chemex offset +2, light roast):**

| Grinder | pourOverStart | Raw +2 (broken) | Converted (correct) |
|---------|--------------|-----------------|---------------------|
| Ode Gen 2 | 4.5 | 6.5 | 6.5 (unchanged) |
| JX-Pro | 90 | 92 | 116.9 |
| Comandante | 22 | 24 | 27.6 |
| Opus | 4.0 | 6.0 | 4.9 |
| Encore ESP | 15 | 17 | 19.7 |
| Virtuoso+ | 15 | 17 | 19.7 |

**Edge cases:**
- `grinderKey` not in `GRINDER_MICRON_SCALES`: fall back to raw offset (same as current behavior). This path is only reached for known grinders since `GRINDER_POUROVER_STARTS` gates entry to the function with the same key set.
- V60 offset = 0: `(0 * 70) / perStep = 0`. No change. Correct.
- Rounding: the adjusted value feeds into the AI prompt as a start point and into repair as a floor. Both tolerate decimals. No rounding needed.
- Both call sites of `getDeviceAdjustedGrindStart` (prompt builder line 441, repair function line 297) benefit from the same fix since they call the same function.

**Files touched:** `src/lib/handbrew.js` only (add import + ~3 lines in function body)

---

## Fix 2: BrewMethodMenu Device Passthrough + Keyed Recipe Cache

### 2a. Menu Passthrough

**Files:** `src/components/BrewMethodMenu.jsx`, `src/components/BrewButton.jsx`, `src/hooks/useHandBrew.js`

**BrewMethodMenu.jsx (line 71):**
Change `onHandBrew()` to `onHandBrew(device.key)`.

**BrewButton.jsx (line 63):**
Change `onHandBrew={() => onHandBrew(bean)}` to `onHandBrew={(deviceKey) => onHandBrew(bean, null, false, deviceKey)}`.

Default tap (line 33) stays as `onHandBrew(bean)`, no device override. Correct: default tap uses preference.

**useHandBrew.js:**
Add 4th param `deviceOverride = null` to `handleBrewHandBrew`. Use `deviceOverride || getBrewDevice()` as the effective device.

**Retry/regenerate callbacks (line 161-162):**
Pass `handBrewRecipe?.device` as the device override. This preserves the current brew session's device: if you did a one-off Chemex brew and hit regenerate, it regenerates for Chemex (from the recipe's stored device), not your default V60. When no recipe exists yet, `handBrewRecipe?.device` is undefined, falling back to `getBrewDevice()`. Correct.

```
onRetry: handBrewBean
  ? () => handleBrewHandBrew(handBrewBean, handBrewResearch, false, handBrewRecipe?.device)
  : undefined,
onRegenerate: handBrewBean
  ? () => handleBrewHandBrew(handBrewBean, handBrewResearch, true, handBrewRecipe?.device)
  : undefined,
```

### 2b. Keyed Recipe Cache

**Motivation:** Without keyed storage, switching devices overwrites the previous recipe and forces a new API call when switching back. With 5 devices, this burns tokens unnecessarily.

**Approach: dual-write.** Keep `bean.handBrewRecipe` as "latest recipe" (backward compatible, used by all display consumers). Add `bean.handBrewRecipes[device]` as the keyed cache (used only by useHandBrew for cache lookups).

This means 5 files that READ `bean.handBrewRecipe` for display (ArchiveDetailSheet, BeanCard, claude.js, brewMethods.js, QuickRecipeFlow display) need NO changes. Only the 2 files that WRITE recipes need dual-write logic.

**useHandBrew.js cache check (lines 51-65):**

```
const effectiveDevice = deviceOverride || getBrewDevice();

// Check keyed cache first, fall back to legacy single-recipe field
const keyedRecipe = bean.handBrewRecipes?.[effectiveDevice];
const legacyRecipe = bean.handBrewRecipe;
const cached = keyedRecipe ||
  (legacyRecipe && (legacyRecipe.device || 'v60') === effectiveDevice ? legacyRecipe : null);

if (!forceRegenerate && cached) {
  const cachedGrinder = cached.grinder || 'fellow-ode-gen2';
  if (cachedGrinder === grinderKey) {
    // serve cached recipe
  }
}
```

**useHandBrew.js save (lines 109-118):**

```
const recipeData = {
  ...recipe,
  generatedAt: new Date().toISOString(),
  grinder: grinderKey,
  device: effectiveDevice,
};
await updateBean(bean.id, {
  handBrewRecipe: recipeData,
  [`handBrewRecipes.${effectiveDevice}`]: recipeData,
});
```

Firestore `updateDoc` supports dot-notation for nested writes. Confirmed: useAppData.js line 216 uses `updateDoc`, and the codebase already uses this pattern (line 142: `'handBrewRecipe.userCoffeeGrams': newDose`).

**useHandBrew.js dose persistence (lines 140-142):**

```
const device = handBrewRecipe?.device || 'v60';
await updateBean(handBrewBean.id, {
  'handBrewRecipe.userCoffeeGrams': newDose,
  [`handBrewRecipes.${device}.userCoffeeGrams`]: newDose,
});
```

**QuickRecipeFlow.jsx save logic (2 paths):**

Path 1 (line 229, handleSave): `saveData.handBrewRecipe = handBrewForSave`. Add:
```
if (handBrewForSave) {
  const dev = handBrewForSave.device || 'v60';
  saveData.handBrewRecipes = { [dev]: handBrewForSave };
}
```

Path 2 (line 255, handleSaveToRotation): `beanData.handBrewRecipe = {...}`. Add:
```
if (beanData.handBrewRecipe) {
  const dev = beanData.handBrewRecipe.device || 'v60';
  beanData.handBrewRecipes = { [dev]: beanData.handBrewRecipe };
}
```

Note: QuickRecipeFlow uses `addBean`/`setDoc` (not `updateDoc`), so we set the full `handBrewRecipes` object rather than using dot-notation.

### Edge Cases

- **Legacy beans (no `handBrewRecipes` field):** Cache check falls through to `legacyRecipe`. Old beans work unchanged. On next generation, both fields get written, migrating the bean.
- **Legacy recipes (no `device` field):** Treated as `'v60'` via `|| 'v60'` fallback. Matches existing behavior.
- **Firestore document size:** Each recipe is ~500 bytes. 5 keyed recipes + 1 latest = ~3KB. Firestore limit is 1MB. Not a concern.
- **"Last Brew" display on BeanCard:** Shows `bean.handBrewRecipe` (latest). If user did a one-off Chemex, BeanCard shows "Last Brew: Chemex". This is correct: it reflects what was actually brewed, not the default preference.
- **Default tap after a one-off:** User does one-off Chemex, then regular-taps next day. `deviceOverride` is null, `getBrewDevice()` returns V60 (default). Cache check looks for V60 in `handBrewRecipes.v60`. If found, serves it. If not, generates fresh. The Chemex recipe stays cached in `handBrewRecipes.chemex` for next time. No tokens wasted.

**Files touched:** `src/components/BrewMethodMenu.jsx`, `src/components/BrewButton.jsx`, `src/hooks/useHandBrew.js`, `src/components/QuickRecipeFlow.jsx`

---

## Fix 3: roasterStyle Wiring

### 3a. Resolution Order

**File:** `src/lib/roasterProfiles.js` (function `getProfileForRoaster`, lines 135-179)

Move the `roasterStyle` check (lines 159-163) above the fuzzy match block (lines 147-157). New order:

1. Direct match (ROASTER_PROFILES[name])
2. Alias lookup
3. **User-set roasterStyle** (moved up)
4. Tiered fuzzy match
5. roastLevel inference
6. Default

**Why:** A user who explicitly sets "Medium" on a bean should not have that overridden by a fuzzy match that happens to hit "Heart" (score 70) and returns "Specialty Light". Direct matches and aliases are authoritative (the roaster IS in the DB), so they stay above. But user-explicit should beat automated fuzzy guessing.

**Edge cases:**
- `bean` is null (2 creation-time callers): `bean?.roasterStyle` is undefined, check short-circuits, falls through to fuzzy. No behavior change.
- `roasterStyle` not set (most beans): same short-circuit. No behavior change.
- `roasterStyle` set AND roaster is in the DB: direct match catches it first, roasterStyle never reached. Correct: known roaster profile beats user override.
- `roasterStyle` set AND roaster NOT in DB but fuzzy-matches something wrong: user's explicit choice wins. This is the bug being fixed.

### 3b. Wire Bean Param in beanResearch.js

**File:** `src/lib/beanResearch.js` (function `buildBeanDescription`, line 94)

Change: `getProfileForRoaster(bean.roaster)` to `getProfileForRoaster(bean.roaster, bean)`

The `bean` object is already the function's argument. This enables the `roasterStyle` and `roastLevel` fallbacks when the roaster isn't in the database, giving the AI prompt more accurate timing context for recipe generation.

**Not wiring beanBuilder.js and ChatTab.jsx:** These are creation-time paths. At bean creation, `roasterStyle` hasn't been set by the user yet (it's an EditBeanModal field). The `fields` object in beanBuilder.js could have `roastLevel` from scan data, which would enable the inference fallback and change the initial peak window values. That's arguably more correct but IS a behavior change for new beans. Out of scope per "do NOT break anything."

**Files touched:** `src/lib/roasterProfiles.js`, `src/lib/beanResearch.js`

---

## Implementation Order

1. Fix 1 (grindOffset) -- isolated, no dependencies
2. Fix 3 (roasterStyle) -- isolated, no dependencies
3. Fix 2 (menu + cache) -- largest change, do last

Fixes 1 and 3 can be done in parallel. Fix 2 is independent but saved for last since it touches the most files.

## Verification

- [ ] `npm run build` passes after each fix
- [ ] Manual calculation: Chemex + JX-Pro light roast produces start ~117 (not 92)
- [ ] Manual calculation: Aeropress + Comandante light roast produces start ~19.2 (not 21)
- [ ] V60 grind starts unchanged for all grinders (offset 0)
- [ ] Legacy beans (no `handBrewRecipes` field) still serve cached recipes
- [ ] Long-press menu tap generates recipe for selected device, not preference default
- [ ] Default tap still uses preference device
- [ ] Regenerate after one-off device selection regenerates for the same device
- [ ] Switching back to a previously-brewed device serves the cached recipe without an API call
