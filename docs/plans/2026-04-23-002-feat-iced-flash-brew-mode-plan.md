---
title: "feat: Iced Flash Brew Mode for Aiden and Hand Brew Modals"
type: feat
status: active
date: 2026-04-23
origin: docs/data/japanese-iced-pour-over-research.md
deepened: 2026-04-23
---

# Iced Flash Brew Mode for Aiden and Hand Brew Modals

## Enhancement Summary

**Deepened on:** 2026-04-23
**Agents used:** architecture-strategist, performance-oracle, julik-frontend-races-reviewer, spec-flow-analyzer, code-simplicity-reviewer, best-practices-researcher, pattern-recognition-specialist, security-sentinel

### Critical Bugs Fixed in Plan
1. `waterTemp` is an object `{ celsius, fahrenheit }`, not a number. Transform must destructure.
2. Hand brew steps use `action` field, not `label`. Ice step must match.
3. Hand brew `ratio` is a string `"1:16"`, not a number. Transform must preserve format.
4. Ice step at `timeSeconds: 0` breaks `buildTimerSteps` ascending invariant. Needs synthetic duration.

### Simplifications Applied
1. `AidenIcedSetupCard.jsx` eliminated as separate file (inline in AidenModal, matches existing pattern)
2. `icedUserCoffeeGrams` persistence eliminated (hot dose = iced dose for pour-over/immersion)
3. Aiden iced dose made session-local (`useState(25)`, no Firestore)
4. `repairRecipe` mode parameter dropped (iced recipes never flow through it)
5. Iced palette tokens defined as local constants (not in theme.js), matching hot palette pattern
6. `FAMILY_GRIND_BANDS` removed from import (unused in transform)

### Race Conditions to Guard
1. In-flight push must capture mode in closure (hot vs iced link persistence)
2. `icedMode` must reset when modal opens for a new bean
3. BrewTimer must receive a snapshot of the iced recipe, not a live-computed value
4. Regeneration must snap to hot mode (iced transform on null recipe would crash)

---

## Overview

Add an "Iced flash brew this bean" button to both AidenModal and HandBrewModal that transforms the current hot recipe into a Japanese-style flash brew (急冷式) recipe. When activated, the modal content fully swaps to show the iced recipe with a cool frost visual palette, interactive dose adjustment, and device-specific setup instructions. The user can push the iced Aiden profile to their Fellow Aiden, or use the iced hand brew recipe with the brew timer.

The translation is fully deterministic (no AI calls). It's a pure function: hotRecipe + deviceCategory + userDose -> icedRecipe. All recipe research and translation formulas are in the origin document.

## Problem Statement / Motivation

Flash brew (急冷式) locks in acidity and aromatics by brewing concentrated hot coffee directly onto ice. It's the preferred iced method for specialty light roasts, and the user wants to try any bean iced without leaving the existing brew flow. Currently there's no iced option anywhere in the app.

## Proposed Solution

### UX Flow

1. User opens AidenModal or HandBrewModal as usual (hot recipe displays normally)
2. Below the Share/Regenerate row, a button reads: **"Iced flash brew this bean"**
3. Tapping it: modal content fully swaps to the iced recipe view (instant swap, scroll to top)
4. Visual palette shifts from warm paper tones to cool frost tones (instant visual signal)
5. A small "Back to hot recipe" text link at the top lets them return
6. The iced view shows:
   - Interactive dose stepper (DoseStepperCard, already exists) driving all derived values
   - Water and Ice display cards that update live with dose changes
   - Device-specific setup instructions (critical for Aiden: "Machine says Xg, load Yg")
   - Adjusted grind recommendation
   - Its own "Push to Aiden" button (for Aiden) or "Start Brew" button (for hand brew)

### Research Insight: Mode Switching UX
- Instant swap with scroll-to-top on toggle. No slide/flip animation (adds latency on mobile).
- Scroll position reset is critical: hot and iced recipes have different step counts. Preserving scroll from a 6-step hot recipe into a 3-step iced recipe lands the user mid-page.
- GPU-accelerated opacity cross-fade (150ms) is acceptable if visual polish is desired later.

### Visual Design: Iced Mode Palette

Current hot palette (defined as local constants in AidenModal.jsx, unchanged):
- `PAPER_GRAD`: `linear-gradient(180deg, #FBF1DF 0%, #F5E6D3 100%)`
- `RULE`: `#EADFD0`
- `TILE_BG`: `#EADFCB`
- `GRIND_BORDER`: `#E8D5A0`

New iced palette (defined as local constants in the same file, following the same pattern):
- `ICE_PAPER_GRAD`: `linear-gradient(180deg, #E8F0F8 0%, #D8E8F2 100%)`
- `ICE_RULE`: `#C8D8E4`
- `ICE_TILE_BG`: `#DCE8F0`
- `ICE_GRIND_BORDER`: `#A8C4D8`
- Brand accent stays the same brown/amber (keeps brand consistency)

### Research Insight: Color Theming Scope
- Only theme accent colors, card backgrounds, icon tints. Modal chrome (header, close button, shadows, text colors) stays consistent.
- Pass `palette` as a prop to mode-sensitive sub-components, not via Context.
- Do NOT add `icedPalette` to theme.js. Keep iced tokens co-located with hot tokens in the modal files.

### Aiden Iced Layout

```
┌─────────────────────────────┐  <- frost palette
│  <- Back to hot recipe       │  <- text link, top left
│                              │
│  Iced Flash Brew             │  <- title
│  [Bean Chip: Ethiopia Telila]│
│                              │
│  ┌───────┬──────┬──────┐    │
│  │Coffee │Water │ Ice  │    │
│  │[-25g+]│250ml │170g  │    │  <- DoseStepperCard drives all three
│  └───────┴──────┴──────┘    │
│                              │
│  ┌─ YOUR AIDEN SETUP ──────┐│
│  │  Volume dial: 250ml     ││
│  │  Machine says: 18g      ││
│  │  You load:  25g         ││  <- bold accent
│  │                         ││
│  │  Add 170g ice to carafe ││
│  │  before pressing Start  ││
│  └─────────────────────────┘│
│                              │
│  [Grind Card: shifted finer] │
│  [Temp curve: all +1C]       │
│  [Bloom/Pulse summary]       │
│                              │
│  [ Push Iced to Aiden ]      │
│  Share                       │
└─────────────────────────────┘
```

### Hand Brew Iced Layout

```
┌─────────────────────────────┐  <- frost palette
│  <- Back to hot recipe       │
│                              │
│  Iced Flash Brew             │
│  [Hoffmann Method - V60]     │
│                              │
│  ┌───────┬──────┬──────┐    │
│  │Coffee │Water │ Ice  │    │
│  │[-16g+]│156g  │104g  │    │
│  │       │(hot) │(server)│   │
│  └───────┴──────┴──────┘    │
│                              │
│  [Grind: 1 step finer]      │
│  [Water Temp: +1C]           │
│                              │
│  Steps:                      │
│  0:00 Prepare: add 104g ice  │  <- prep step (10s duration)
│  0:10 Bloom 48g (30s)        │  <- shifted by prep duration
│  0:40 Pour to 96g            │
│  1:10 Pour to 156g           │
│  ...                         │
│                              │
│  [ Start Brew ]              │
└─────────────────────────────┘
```

## Translation Formulas (see origin: docs/data/japanese-iced-pour-over-research.md)

### Category 1: Manual Pour-Over (V60, Kalita, Chemex)

Input: hot recipe with `{ coffeeGrams, waterGrams, grindSize, waterTemp: { celsius, fahrenheit }, steps }`

- `dose`: KEEP same as hot
- `hotWater`: `waterGrams * 0.6`
- `iceGrams`: `waterGrams * 0.4` (in server BEFORE brewing)
- `grind`: shift 1-2 steps finer (use `nearestOdeStep` in Ode equivalent, translate to user's grinder)
- `waterTemp`: `{ celsius: waterTemp.celsius + 1, fahrenheit: waterTemp.fahrenheit + 2 }` (cap celsius at 99)
- `ratio`: KEEP as string format `"1:16"` (do NOT parse to number)
- `steps`: KEEP same number of pours, scale each `waterTotal` down proportionally to 60% of original
- Prepend "Step 0: Add Xg ice to server/glass" with 10s duration, shift all subsequent step times by 10s
- Steps must use `action` field (not `label`) to match existing schema

Device-specific ice placement:
- V60: ice in server
- Kalita: ice in glass (pour brewed coffee over ice after)
- Chemex: ice in carafe

### Category 2: Immersion (AeroPress, French Press)

- `dose`: KEEP same
- `water`: reduce to 60% of original
- `iceGrams`: 40% of original total water (press/release ONTO the ice)
- `grind`: KEEP same or 1 step finer
- `waterTemp`: `{ celsius: waterTemp.celsius + 1, fahrenheit: waterTemp.fahrenheit + 2 }` (cap celsius at 99)
- `steepTime`: KEEP same

### Category 3: Fellow Aiden (Automatic)

Input: hot Aiden recipe JSON + user-adjustable dose

- `ratio`: force to 14 (machine minimum)
- `dose`: interactive, default 25g, adjustable 15-35g via DoseStepperCard (session-local, no Firestore persistence)
- `brewWaterMl`: `dose * 10` (target 1:10 effective concentration)
- `iceGrams`: `dose * 6.8` (targets ~1:15.7 total)
- `machineSuggestedDose`: `brewWaterMl / 14` (what the Aiden screen shows)
- `grind`: shift 1-2 steps finer within family band (use `nearestOdeStep`)
- `bloomTemp`, `pulseTemps`: each +1C from hot recipe (cap at 99C)
- `bloomRatio`, `bloomDuration`, `pulseIntervals`, `pulseCount`: KEEP from hot recipe

The KEY Aiden insight: the user sets a volume (e.g., 250ml), the machine at ratio 1:14 suggests ~18g coffee, but the user loads 25g. The machine still dispenses 250ml. So the effective concentration is 250/25 = 1:10.

## Technical Considerations

### Critical: Avoid Double-Scaling of Ice Amounts

There are two possible derivation paths for dose changes. Pick ONE:

**Option A (recommended for hand brew):** The flash brew transform takes `userDose` as input and produces the final recipe at the desired dose. `scaleRecipeForDose` is NOT called on iced recipes. All values (water, ice, steps) are computed from `userDose` inside the transform.

**Option B (recommended for Aiden):** `transformAiden` always computes from `userDose` directly (the formulas `dose * 10` and `dose * 6.8` inherently incorporate the dose). No scaling function needed.

The `scaleRecipeForDose` extension for `iceGrams` should still be added as a safety net, but the primary path for iced recipes should be re-running the transform with the new dose, not scaling a previously-transformed recipe.

### Research Insight: Memoization Pattern
Wrap the iced transform in `useMemo` to prevent cascading re-renders during hold-to-repeat:
```js
const icedRecipe = useMemo(
  () => icedMode ? transformToFlashBrew(recipe, deviceKey, effectiveDose) : null,
  [icedMode, recipe, deviceKey, effectiveDose]
);
```
Without this, each render during hold-to-repeat (every ~120ms) creates a new object reference that defeats downstream memos.

### DoseStepperCard Reuse

`DoseStepperCard` (`src/components/DoseStepperCard.jsx`) already has hold-to-repeat, haptics, and boundary clamping. For Aiden iced, pass `min={15} max={35}`. For hand brew iced, keep existing range. All derived values (water, ice, machine suggestion) are computed from dose via pure functions.

### BrewTimer Ice Step Handling

**Critical:** `buildTimerSteps` in `useBrewTimer.js` requires strictly ascending `timeSeconds`. The ice preparation step needs:
- `timeSeconds: 0` with a synthetic `durationSeconds: 10` (preparing ice genuinely takes a few seconds)
- All subsequent step `timeSeconds` values shifted forward by 10 seconds
- The ice step uses `action` field (not `label`): `"Add Xg ice to server"`
- `waterTotal: 0` is safe (HandBrewModal conditionally renders water total, only when truthy)

Without this fix, `buildTimerSteps` returns `null` and the timer refuses to render.

### Iced Dose Persistence

**Simplified from original plan:**

- **Aiden iced dose**: Session-local `useState(25)` in AidenModal. NOT persisted to Firestore. The default 25g is appropriate for most users. If persistence is requested later, add `preferences.aidenIcedDose` to user profile (not per-bean).
- **Hand brew iced dose**: Uses the SAME dose as hot (`userCoffeeGrams`). No separate field needed. For pour-over and immersion, iced dose equals hot dose (the plan's formulas say "dose: KEEP same as hot").

### Push to Aiden (Iced Profile)

The iced profile JSON pushed to Fellow uses `ratio: 14` with adjusted temps (+1C, capped at 99C). The dose override and ice instructions are displayed in the app UI only, not part of the Fellow API payload.

**Iced link persistence:** `bean.aidenIcedLink` (separate from hot `bean.aidenLink`). `handlePushToAiden` must accept a `{ isIced }` flag to route the link to the correct field. The flag must be captured in closure at call time, not read from modal state at write time (modal state may change during the async push).

**Title format:** Pass `" (Iced)"` suffix to `buildAidenTitle` so it accounts for the 7 extra chars in its 50-char budget. Do NOT append the suffix after title generation.

### Research Insight: Clear Iced Link on Hot Regeneration
When `handleBrewWithAiden` regenerates a hot recipe (which clears `aidenLink: null`), it must ALSO clear `aidenIcedLink: null`. The iced recipe derives from the hot recipe, so a new hot recipe invalidates the existing iced link.

### Research Insight: Cached Iced Link Detection
When the user enters iced mode and `bean.aidenIcedLink` already exists, show the cached link with "Open in Fellow" button (matching the hot recipe's cached-link pattern at line 100-111 of `useAidenBrew.js`). This prevents re-pushing to Fellow on every iced mode entry.

### No AI Calls

The entire translation is deterministic math. No calls to GPT, Claude, or Gemini. The transform derives the iced recipe from the existing hot recipe on-the-fly. No need to cache iced recipes in Firestore. If the hot recipe changes (regenerate), the iced version updates automatically.

### French Press Inclusion

French Press is included in Category 2 (Immersion) alongside AeroPress. The 60/40 water/ice split and "press onto ice" pattern work for both. French Press grind stays coarse (only shift 1 step finer at most).

### Share Card for Iced Recipes

When sharing an iced recipe, the share card title must include "Iced" indicator (e.g., "Iced Flash Brew" prefix). A bare "1:14 ratio" without context looks like an incorrect strong hot recipe.

## System-Wide Impact

- **State lifecycle**: Iced mode is local UI state (`useState`) within each modal. No new hooks needed. `icedMode` must reset to `false` when modal opens (via `useEffect` on `open` prop, since modals stay mounted).
- **BrewTimer integration**: HandBrewModal already does sibling-swap with BrewTimer. The iced recipe must be **snapshotted to a ref** when "Start Brew" is clicked, then passed to BrewTimer. Do not pass a live-computed value (prevents race between dose stepper and timer mount).
- **Aiden push flow**: `handlePushToAiden` takes the recipe object directly. The iced recipe (with ratio:14 and adjusted temps) passes through the same push pipeline. The `{ isIced }` flag routes persistence to `aidenIcedLink`.
- **ShareCard**: Existing share functionality works with the iced recipe object, but needs "Iced" indicator in the title.
- **Regeneration**: If user is in iced mode and taps Regenerate, snap to hot mode first. Iced transform on null recipe would crash.
- **No effect on**: BrewButton, BrewMethodMenu, brew method selection, hot recipe generation, bean research, or any other existing feature.

## Acceptance Criteria

- [ ] "Iced flash brew this bean" button appears below Share/Regenerate row in both AidenModal and HandBrewModal (only when a recipe is loaded)
- [ ] Tapping the button fully swaps modal content to iced view with frost palette, scrolls to top
- [ ] "Back to hot recipe" link at top returns to hot view
- [ ] Aiden iced view shows: dose stepper (15-35g), water amount, ice amount, "Your Aiden Setup" card with volume/machine suggestion/actual dose/ice instructions
- [ ] Hand brew iced view shows: dose stepper, hot water amount, ice amount, grind adjustment, temp adjustment, transformed step timeline with ice prep step
- [ ] All derived values update live when dose changes (water, ice, machine suggestion, steps)
- [ ] Grind shifts 1-2 steps finer within family band, displayed in user's grinder
- [ ] Temps shift +1C from hot recipe, capped at 99C
- [ ] Aiden iced profile can be pushed to Fellow (ratio:14)
- [ ] Iced aidenLink persists to `bean.aidenIcedLink` (separate from hot link)
- [ ] Cached iced link detected and shown without re-pushing
- [ ] Hot recipe regeneration clears both `aidenLink` and `aidenIcedLink`
- [ ] Hand brew iced recipe passes to BrewTimer with correct step timing (ice prep step has 10s duration)
- [ ] French Press and AeroPress use immersion translation (60/40 split, press onto ice)
- [ ] Visual palette clearly distinguishes iced from hot mode
- [ ] `icedMode` resets to false when modal opens for a different bean
- [ ] Regeneration snaps to hot mode before regenerating
- [ ] Share card indicates "Iced" when sharing an iced recipe

## Dependencies & Risks

- **Aiden 14-profile limit**: Pushing an iced profile consumes one of 14 Fellow profile slots. No mitigation needed, just a user awareness issue (existing behavior for hot profiles too).
- **Grind shift edge case**: If the hot recipe's grind is already at the fine end of the family band, shifting finer may hit the band floor. Use `nearestOdeStep` to clamp.
- **Ice amount rounding**: Display rounded to nearest gram. All internal math uses full precision.
- **Temperature ceiling**: `bumpTemp` must cap at 99C (enforceSchemaConstraints ceiling). Hot recipes at 99C stay at 99C when iced.

## Sources & References

- **Origin document:** [docs/data/japanese-iced-pour-over-research.md](docs/data/japanese-iced-pour-over-research.md) - all device recipes, translation formulas, confirmed Aiden flash brew method from r/FellowProducts + Fellow support
- **Kurasu Kyoto recipes** - most battle-tested flash brew pour-over source
- **r/FellowProducts community** - confirmed Aiden overdose method (u/nonbinarybullshet, 15 upvotes)

## MVP Implementation

### Phase 1: Core Transform + Grind Utility Extraction

**Extract to `src/lib/brewMethods.js` (existing file):**

Move `nearestOdeStep` and `ODE_GEN2_STEPS` from `aiden.js` to `brewMethods.js`. Both `aiden.js` and `flashBrewTransform.js` import from `brewMethods.js`. This keeps `aiden.js` focused on Aiden-specific logic and avoids cross-dependency between transform modules.

```js
// Add to brewMethods.js (existing file)
export const ODE_GEN2_STEPS = [
  1, 1.1, 1.2, 2, 2.1, 2.2, 3, 3.1, 3.2, 4, 4.1, 4.2,
  5, 5.1, 5.2, 6, 6.1, 6.2, 7, 7.1, 7.2, 8, 8.1, 8.2,
  9, 9.1, 9.2, 10, 10.1, 10.2, 11,
];

export function nearestOdeStep(target, preferCoarser = true) {
  let closest = ODE_GEN2_STEPS[0];
  let minDist = Math.abs(target - closest);
  for (const step of ODE_GEN2_STEPS) {
    const dist = Math.abs(target - step);
    if (dist < minDist || (dist === minDist && preferCoarser && step > closest)) {
      closest = step;
      minDist = dist;
    }
  }
  return closest;
}
```

Update `aiden.js` to import these from `brewMethods.js` instead of defining locally.

**New file: `src/lib/flashBrewTransform.js`**

Pure functions for hot-to-iced translation across all three device categories.

```js
import { nearestOdeStep } from './brewMethods';
import { BREW_METHODS } from './brewMethods';

const ICE_FRACTION = 0.4;
const HOT_FRACTION = 0.6;
const ICE_PREP_DURATION = 10; // seconds for "add ice" step

function computeIceSplit(hotRecipe, userDose) {
  const dose = userDose || hotRecipe.coffeeGrams;
  const ratioStr = hotRecipe.ratio || '1:16';
  const divisor = parseFloat(String(ratioStr).match(/1\s*:\s*(\d+(?:\.\d+)?)/)?.[1]) || 16;
  const totalWater = dose * divisor;
  return {
    dose,
    totalWater,
    hotWater: Math.round(totalWater * HOT_FRACTION),
    iceGrams: Math.round(totalWater * ICE_FRACTION),
  };
}

function bumpTemp(waterTemp) {
  if (!waterTemp) return waterTemp;
  if (typeof waterTemp === 'number') return Math.min(waterTemp + 1, 99);
  if (typeof waterTemp === 'object' && waterTemp.celsius != null) {
    return {
      celsius: Math.min(waterTemp.celsius + 1, 99),
      fahrenheit: typeof waterTemp.fahrenheit === 'number'
        ? waterTemp.fahrenheit + 2
        : waterTemp.fahrenheit,
    };
  }
  return waterTemp;
}

function shiftGrindFiner(grindSize, steps) {
  if (!grindSize) return grindSize;
  if (typeof grindSize.setting === 'number') {
    return {
      ...grindSize,
      setting: nearestOdeStep(grindSize.setting - steps),
    };
  }
  return grindSize;
}

// Parse step time string "M:SS" to seconds
function parseTimeToSeconds(timeStr) {
  if (typeof timeStr !== 'string') return null;
  const parts = timeStr.split(':');
  if (parts.length !== 2) return null;
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

// Format seconds to "M:SS"
function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Category 1: Manual pour-over (V60, Kalita, Chemex)
export function transformPourOver(hotRecipe, userDose) {
  const { dose, hotWater, iceGrams } = computeIceSplit(hotRecipe, userDose);

  // Scale steps proportionally to 60%, shift times by ICE_PREP_DURATION
  const icedSteps = (hotRecipe.steps || []).map(step => {
    const origSeconds = parseTimeToSeconds(step.time);
    const shifted = origSeconds != null ? origSeconds + ICE_PREP_DURATION : null;
    return {
      ...step,
      time: shifted != null ? formatTime(shifted) : step.time,
      timeSeconds: shifted,
      waterTotal: typeof step.waterTotal === 'number'
        ? Math.round(step.waterTotal * HOT_FRACTION)
        : step.waterTotal,
    };
  });

  // Prepend ice prep step
  const device = hotRecipe.device || 'v60';
  const icePlacement = device === 'kalita' ? 'glass'
    : device === 'chemex' ? 'carafe' : 'server';

  icedSteps.unshift({
    time: '0:00',
    timeSeconds: 0,
    durationSeconds: ICE_PREP_DURATION,
    action: `Add ${iceGrams}g ice to ${icePlacement}`,
    waterTotal: 0,
    isIceStep: true,
  });

  return {
    ...hotRecipe,
    coffeeGrams: dose,
    waterGrams: hotWater,
    iceGrams,
    totalLiquid: hotWater + iceGrams,
    steps: icedSteps,
    grindSize: shiftGrindFiner(hotRecipe.grindSize, 1.5),
    waterTemp: bumpTemp(hotRecipe.waterTemp),
    isIced: true,
    icePlacement,
  };
}

// Category 2: Immersion (AeroPress, French Press)
export function transformImmersion(hotRecipe, userDose) {
  const { dose, hotWater, iceGrams } = computeIceSplit(hotRecipe, userDose);

  const icedSteps = (hotRecipe.steps || []).map(step => ({
    ...step,
    waterTotal: typeof step.waterTotal === 'number'
      ? Math.round(step.waterTotal * HOT_FRACTION)
      : step.waterTotal,
  }));

  // Append "press/pour onto ice" step
  icedSteps.push({
    time: null,
    action: `Press/pour onto ${iceGrams}g ice`,
    isIceStep: true,
  });

  return {
    ...hotRecipe,
    coffeeGrams: dose,
    waterGrams: hotWater,
    iceGrams,
    totalLiquid: hotWater + iceGrams,
    steps: icedSteps,
    grindSize: shiftGrindFiner(hotRecipe.grindSize, 1),
    waterTemp: bumpTemp(hotRecipe.waterTemp),
    isIced: true,
    icePlacement: 'glass',
  };
}

// Category 3: Fellow Aiden
export function transformAiden(hotRecipe, userDose = 25) {
  const dose = userDose;
  const brewWaterMl = Math.round(dose * 10);
  const iceGrams = Math.round(dose * 6.8);
  const machineSuggestedDose = Math.round(brewWaterMl / 14 * 10) / 10;

  const bumpAidenTemp = (t) => typeof t === 'number' ? Math.min(t + 1, 99) : t;

  const ssGrind = hotRecipe.grindRecommendation?.singleServe;
  const icedSsGrind = typeof ssGrind === 'number' ? nearestOdeStep(ssGrind - 1) : ssGrind;

  return {
    ...hotRecipe,
    ratio: 14,
    bloomTemperature: bumpAidenTemp(hotRecipe.bloomTemperature),
    ssPulseTemperatures: hotRecipe.ssPulseTemperatures?.map(bumpAidenTemp) || [],
    batchPulseTemperatures: hotRecipe.batchPulseTemperatures?.map(bumpAidenTemp) || [],
    icedDose: dose,
    brewWaterMl,
    iceGrams,
    machineSuggestedDose,
    totalLiquid: brewWaterMl + iceGrams,
    grindRecommendation: icedSsGrind != null ? {
      singleServe: icedSsGrind,
      batch: hotRecipe.grindRecommendation?.batch,
    } : hotRecipe.grindRecommendation,
    isIced: true,
  };
}

// Dispatcher based on device category
export function transformToFlashBrew(hotRecipe, deviceKey, userDose) {
  const method = BREW_METHODS[deviceKey];
  if (!method) return transformPourOver(hotRecipe, userDose);
  if (deviceKey === 'aiden') return transformAiden(hotRecipe, userDose);
  if (method.category === 'immersion') return transformImmersion(hotRecipe, userDose);
  return transformPourOver(hotRecipe, userDose);
}
```

**Modify: `src/lib/recipeScaling.js`**

Add `iceGrams` scaling as a safety net (primary iced path re-runs the transform, but this catches edge cases):

```js
// In scaleRecipeForDose return object, add:
iceGrams: typeof recipe.iceGrams === 'number'
  ? Math.round(recipe.iceGrams * scaleFactor)
  : undefined,
```

### Phase 2: Aiden Iced View

**Modify: `src/components/AidenModal.jsx`**

Add iced mode state toggle, conditional rendering for hot vs iced view, frost palette application. The "Your Aiden Setup" card is defined inline (matching BeanChip, DialCard, TempCard pattern).

Key changes:
- Add local iced palette constants next to existing hot palette constants
- Add `const [icedMode, setIcedMode] = useState(false)` local state
- Add `useEffect` to reset `icedMode = false` when `open` changes to true (modal stays mounted)
- Add `useMemo` for iced recipe: `transformAiden(recipe, icedDose)`
- Add `const [icedDose, setIcedDose] = useState(25)` for session-local dose
- Below Share/Regenerate row, add "Iced flash brew this bean" button (only when `recipe` is loaded and not in loading/error state)
- When `icedMode === true`, render iced content with frost palette:
  - DoseStepperCard (min=15, max=35)
  - Water/Ice ParamCards showing `brewWaterMl` and `iceGrams`
  - Inline `AidenIcedSetupCard` component (volume dial, machine suggestion, actual dose, ice instructions)
  - GrindCard with shifted grind
  - TempCard with bumped temps
- "Back to hot recipe" link at top sets `icedMode = false` and scrolls to top
- Iced "Push to Aiden" calls `onPushCached(icedRecipe)` with `{ isIced: true }` flag
- On Regenerate tap: snap to hot mode first
- Share card adds "Iced" indicator when `recipe.isIced`

**Modify: `src/lib/brewMethods.js`**

Export `nearestOdeStep` and `ODE_GEN2_STEPS` (moved from aiden.js).

**Modify: `src/lib/aiden.js`**

- Import `nearestOdeStep` and `ODE_GEN2_STEPS` from `brewMethods.js` (remove local definitions)
- Remove local `nearestOdeStep` function and `ODE_GEN2_STEPS` array (now in brewMethods.js)
- `buildAidenTitle`: accept optional `suffix` parameter, account for it in 50-char budget
- NO `mode` parameter on `repairRecipe` (iced recipes never flow through it)

### Phase 3: Hand Brew Iced View

**Modify: `src/components/HandBrewModal.jsx`**

Add iced mode state toggle, conditional rendering.

Key changes:
- Add local iced palette constants
- Add `const [icedMode, setIcedMode] = useState(false)` local state
- Add `useEffect` to reset `icedMode = false` when `open` changes to true
- Add `useMemo` for iced recipe: `transformToFlashBrew(recipe, recipe.device, effectiveDose)`
- Below Start Brew / Regenerate area, add "Iced flash brew this bean" button
- When `icedMode === true`:
  - Render param grid: Coffee (DoseStepperCard) | Water "hot" | Ice
  - Show grind adjustment and temp adjustment
  - Render transformed steps timeline (ice prep step + scaled pours)
  - "Start Brew" snapshots the iced recipe to a ref, then opens BrewTimer with the snapshot
- "Back to hot recipe" link sets `icedMode = false` and scrolls to top
- On Regenerate: snap to hot mode first
- Dose changes use existing `onCoffeeGramsChange` (hot dose = iced dose for hand brew)
- Close handler: only one persist path (existing `persistIfChanged`), no iced-specific persist needed

### Phase 4: Persistence + Polish

**Modify: `src/hooks/useAidenBrew.js`**

- `handlePushToAiden`: accept `{ isIced }` options parameter. Capture `isIced` in closure at call time.
  - If `isIced`: persist link to `bean.aidenIcedLink` instead of `bean.aidenLink`
  - If hot: persist to `bean.aidenLink` as before
- `handleBrewWithAiden` regeneration (forceRegenerate): clear both `aidenLink: null` AND `aidenIcedLink: null`
- When opening modal: if `bean.aidenIcedLink` exists and user enters iced mode, show cached link directly (no re-push)

**NO modification to `src/hooks/useHandBrew.js`** (iced hand brew uses same dose as hot)

## File Summary (Revised)

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/flashBrewTransform.js` | CREATE | Pure transform functions for all 3 device categories |
| `src/lib/brewMethods.js` | MODIFY | Add `nearestOdeStep`, `ODE_GEN2_STEPS` exports (moved from aiden.js) |
| `src/lib/aiden.js` | MODIFY | Import grind utils from brewMethods.js, title suffix budget |
| `src/lib/recipeScaling.js` | MODIFY | Scale `iceGrams` when present |
| `src/components/AidenModal.jsx` | MODIFY | Add iced mode toggle + iced view + inline setup card |
| `src/components/HandBrewModal.jsx` | MODIFY | Add iced mode toggle + iced view |
| `src/hooks/useAidenBrew.js` | MODIFY | Iced link persistence, clear on regen, cached link detection |

Files NOT modified: BrewButton, BrewMethodMenu, BrewTimer, DoseStepperCard, useHandBrew.js, handbrew.js, beanResearch.js, ShareCard, theme.js.

**Eliminated from original plan:** `AidenIcedSetupCard.jsx` (inlined), `useHandBrew.js` modification (unnecessary), `theme.js` modification (iced tokens are local constants).

## Open Questions (Non-Blocking)

1. **Iced mode memory**: Should the modal remember if the user was in iced mode last time they opened it for a given bean? Current plan: always default to hot, user taps into iced each time. Could persist `bean.preferIced` later if requested.
2. **Aiden iced dose persistence**: Currently session-local (resets to 25g on modal close). Could add `preferences.aidenIcedDose` to user profile later if users request persistence.
3. **Batch mode**: Aiden batch flash brew is less common. MVP supports single serve only. Batch parameters carry through from hot recipe unchanged.
4. **BrewTimer ice step UI**: The ice prep step renders in the step timeline with `waterTotal: 0`. Verify the BrewTimer's ring animation handles this gracefully (no pour indicator for a 0-water step). May need a visual distinction (different dot color, "prep" label) during implementation.
