---
title: "feat: Brew Methods Expansion + Roaster Intelligence"
type: feat
status: active
date: 2026-04-22
origin: docs/brainstorms/2026-04-21-brew-methods-expansion-requirements.md
---

# feat: Brew Methods Expansion + Roaster Intelligence

## Enhancement Summary

**Deepened on:** 2026-04-22
**Research agents used:** 12 (4 learnings, security sentinel, performance oracle, architecture strategist, pattern recognition, code simplicity, best practices x3)

### Key Improvements

1. **Replace 5 DEVICE_FAMILY_DEFAULTS tables with 1 base table + device offsets.** The plan proposed duplicating the 7-family defaults structure 5 times (~200 lines). This is the highest architectural risk. Use one shared table with `getDeviceFamilyDefaults(device, family)` that applies device-specific adjustments from `DEVICE_CONFIGS`. ~60 lines instead of ~200.
2. **Drop F5 Layer 2 (auto-learn) entirely. Ship Layers 1+3 only.** For <200 beans and a single user, the auto-learn layer (scan existing beans for matching roaster) provides marginal value over the 50-75 roaster database + roast-style fallback. Removes hard B4 dependency, letting both plans ship independently.
3. **Tiered scoring function for roaster fuzzy matching.** Replace the plan's "min length 4, >= 50% overlap" with a proper tiered scorer: exact=100, starts-with=85, word-match=70, contains-with-ratio=60. Add noise-word stripping ("coffee", "roasters") and a ROASTER_ALIASES map for short names (SEY, PT's).
4. **Authoritative device parameters from Hoffmann, Rao, Kasuya.** Full parameter tables validated against World Atlas of Coffee, championship recipes, and manufacturer guides. Key correction: Hoffmann recommends MEDIUM grind for French Press (not coarse), with 9-12 minute total brew time including settle.
5. **Derive BREW_DEVICES from BREW_METHODS.** No separate constant. Single source of truth.

### New Considerations Discovered

- **F3**: Pick one Ode micron formula (`200 + (step-1)*70` or `150 + stepIndex*45`), delete the other. Express all grinder scales as data `{ base, perStep }`, not formula functions.
- **F2**: Keep `'handbrew'` as deprecated alias in BREW_METHODS for one cycle. Audit all references before removal.
- **F2**: Preference migration via `useMemo` with idempotent deferred write (not useEffect) to avoid React 19 StrictMode double-write.
- **F5**: `getProfileForRoaster(roasterName, bean)` signature change needs backward compatibility (optional bean param).
- **Phase 2**: Validate immersion device grind floors independently (Aeropress at `-1` offset from light roast baseline risks falling into Aiden grind territory).

---

## Overview

Replace the single generic "Hand Brew" with five device-specific brew methods (V60, Kalita Wave, Chemex, Aeropress, French Press), translate Aiden grind recommendations to any grinder, surface saved recipes in archive, and build a three-layer roaster resolution system that eliminates "Unknown Roaster."

## Problem Statement

Users brew with different devices that have meaningfully different extraction characteristics. A V60 recipe applied to a French Press produces bad coffee. The app currently treats all manual brewing as one generic pour-over. Additionally, Aiden grind recommendations are locked to Ode Gen 2 notation even for users with other grinders, archived beans hide their recipe history, and most roasters show as "Unknown" despite reasonable default timing.

## Technical Approach

### Architecture

The existing hand brew system (`lib/handbrew.js` + `hooks/useHandBrew.js`) is the foundation. It already follows the two-step pattern (research bean → generate recipe) with family-based defaults and grinder-aware output. The expansion extends this architecture rather than replacing it.

**Key architectural decisions:**
- One shared recipe generation pipeline with device-specific parameter injection (not 5 separate pipelines)
- Device-specific `FAMILY_DEFAULTS` tables (currently V60-centric `FAMILY_POUROVER_DEFAULTS`)
- Device-specific `repairRecipe` rules (grind clamping, timing validation)
- Shared research step (bean research is device-agnostic)

### Implementation Phases

#### Phase 1: Foundation (Settings + Grind Translation + Roaster Database)

Lowest risk, no recipe generation changes. Sets up the infrastructure that Phases 2 and 3 build on.

**F2: Brew Device Preference**

| File | Change |
|------|--------|
| `src/components/SettingsPage.jsx` | Add BREW_DEVICES constant and selector in Equipment section |
| `src/components/onboarding/screens/R07Preferences.jsx` | Add brew device selection alongside grinder |
| `src/hooks/useUserProfile.jsx` | Add `brewDevice` to DEFAULT_PREFERENCES (default: `'v60'`) |
| `src/lib/brewMethods.js` | Expand BREW_METHODS registry from 2 to 6 entries |
| `src/components/BrewMethodMenu.jsx` | Replace hardcoded 2-option menu with dynamic list |
| `src/components/BrewButton.jsx` | Read `preferences.brewDevice` for default method |

**BREW_DEVICES constant:**
```js
const BREW_DEVICES = [
  { key: 'v60', label: 'Hario V60' },
  { key: 'kalita', label: 'Kalita Wave' },
  { key: 'chemex', label: 'Chemex' },
  { key: 'aeropress', label: 'Aeropress' },
  { key: 'french-press', label: 'French Press' },
];
```

**BREW_METHODS expansion:**
```js
export const BREW_METHODS = {
  aiden: { label: 'Brew with Aiden', icon: '/images/aiden-icon.png', ... },
  v60: { label: 'V60 Recipe', icon: '/images/v60-icon.webp', category: 'pourover', ... },
  kalita: { label: 'Kalita Wave Recipe', icon: '/images/kalita-icon.webp', category: 'pourover', ... },
  chemex: { label: 'Chemex Recipe', icon: '/images/chemex-icon.webp', category: 'pourover', ... },
  aeropress: { label: 'Aeropress Recipe', icon: '/images/aeropress-icon.webp', category: 'immersion', ... },
  'french-press': { label: 'French Press Recipe', icon: '/images/frenchpress-icon.webp', category: 'immersion', ... },
};
```

**Preference model (from SpecFlow):** Replace `preferences.brewMethod` entirely. The new field `preferences.brewMethod` accepts: `'aiden'`, `'v60'`, `'kalita'`, `'chemex'`, `'aeropress'`, `'frenchpress'`. This is simpler than maintaining two fields (`brewMethod` + `brewDevice`) and matches how the codebase routes behavior today.

**Migration:** Existing users with `preferences.brewMethod === 'handbrew'` should map to `'v60'` (closest to current Hoffmann pour-over default). Add migration logic in `useUserProfile.jsx` initialization.

**Migration implementation** (Best Practices Research):
Use `useMemo` with idempotent deferred write (not `useEffect`) to avoid React 19 StrictMode double-write:
```js
const preferences = useMemo(() => {
  const raw = profile?.preferences || DEFAULT_PREFERENCES;
  if (raw.brewMethod === 'handbrew') {
    const migrated = { ...raw, brewMethod: 'v60' };
    if (uid) updateDoc(doc(db, 'users', uid), { 'preferences.brewMethod': 'v60' }).catch(() => {});
    return migrated;
  }
  return raw;
}, [profile?.preferences, uid]);
```
The `useRef` guard alternative works too, but `useMemo` is cleaner since the migration is pure + a fire-and-forget write.

**Audit all `'handbrew'` references** (Architecture Strategist): Search the codebase for all references to the string `'handbrew'` before removing the key from `BREW_METHODS`. Consider keeping it as a deprecated alias for one release cycle: `handbrew: BREW_METHODS.v60`.

**Bean card UX:** Two buttons stay: Aiden (if applicable) + default brew device. Tap = generate recipe for default device. Long-press = BrewMethodMenu showing all 5 manual methods.

**BrewMethodMenu update:** The current absolute-positioned popup needs to accommodate 6 items. With 6 items at 44pt min tap target + separators = ~290pt, this fits on iPhone SE (568pt). Try adding `maxHeight: 320, overflowY: 'auto'` and the 4 new rows first. Only redesign as a bottom sheet if the popup doesn't fit after testing (Code Simplicity Review).

**Derive BREW_DEVICES from BREW_METHODS** (Pattern Recognition): Do NOT create a separate `BREW_DEVICES` constant. Derive it:
```js
const BREW_DEVICES = Object.entries(BREW_METHODS)
  .filter(([key]) => key !== 'aiden')
  .map(([key, val]) => ({ key, label: val.label }));
```

**F3: Aiden Grind Translation**

| File | Change |
|------|--------|
| `src/lib/brewMethods.js` | Extend `formatAidenGrind()` to translate Ode steps to user's grinder |
| `src/lib/brewMethods.js` | Add `odeStepToGrinderSetting()` translation function |
| `src/components/EditBeanModal.jsx` | Update Chapter 6 "Grind Settings" subtitle from hardcoded "Ode Gen 2" |

**Translation approach (display-only, from SpecFlow):**

The Aiden system stores grind as Ode Gen 2 steps internally (deterministic enforcement, will not change). Storage stays as Ode Gen 2 steps. Translation happens ONLY in `formatAidenGrind()` at display time. No migration of existing bean docs needed. The display layer translates:

```
Ode Gen 2 step → microns (via odeStepToMicrons) → target grinder setting
```

Use `GRINDER_POUROVER_STARTS` from `handbrew.js` as the reference mapping. Each grinder has `validRange` and `pourOverStart` values that define the scale. Build a linear interpolation:

```js
function odeStepToGrinderSetting(odeStep, grinderKey) {
  if (grinderKey === 'fellow-ode-gen2') return odeStep; // identity
  const microns = odeStepToMicrons(odeStep);
  const grinder = GRINDER_POUROVER_STARTS[grinderKey];
  if (!grinder) return { microns, description: descriptorForMicrons(microns) };
  // Linear interpolation within grinder's range
  // Map microns to grinder scale using known anchor points
  return { setting: interpolatedSetting, label: grinder.label };
}
```

**Anchor points for interpolation** (derived from GRINDER_POUROVER_STARTS and coffee industry references):

| Grinder | Fine end (espresso-ish) | Pour-over sweet spot | Coarse (French Press) |
|---------|------------------------|---------------------|----------------------|
| Ode Gen 2 | 1 (~200um) | 4-6 (~410-550um) | 11 (~900um) |
| Opus | 1 (~200um) | 3.5-5.5 | 7+ |
| Encore ESP | 5 (~200um) | 15-22 | 32+ |
| Comandante C40 | 10 (~200um) | 22-30 | 38+ |
| 1Zpresso JX-Pro | 40 (~200um) | 85-115 | 150+ |
| Virtuoso+ | 5 (~200um) | 15-22 | 32+ |

**Grinder micron formulas (from deepening research):**

| Grinder | Formula | Notes |
|---------|---------|-------|
| Ode Gen 2 | `150 + stepIndex * 45` | Use brewcommons calibration, NOT the simpler `200 + (step-1)*70` in current `odeStepToMicrons()` |
| Opus | `150 + (setting - 1) * 150` | ~15um per click |
| Encore ESP | `100 + (setting - 1) * 29.5` | ESP variant calibrated finer |
| Comandante C40 | `150 + (clicks - 5) * 25` | Clamp to reasonable range |
| 1Zpresso JX-Pro | `100 + (clicks - 20) * 5.2` | Fine adjustment dial |
| Virtuoso+ | `150 + (setting - 1) * 29.5` | Similar scale to Encore ESP |

**Pick one Ode micron formula** (Code Simplicity Review): The plan contains two competing formulas. Keep the existing `200 + (step-1) * 70` since it is already in production and the difference is cosmetic for display-only translation. Changing it introduces a discrepancy with existing displayed values. Not worth the confusion.

**Express all grinder scales as data, not formulas** (Code Simplicity Review):
```js
const GRINDER_MICRON_SCALES = {
  'fellow-ode-gen2': { base: 200, perStep: 70 },
  'fellow-opus':     { base: 150, perStep: 150 },
  'baratza-encore':  { base: 100, perStep: 29.5 },
  'comandante-c40':  { base: 25, perStep: 25 },
  '1zpresso-jx-pro': { base: -4, perStep: 5.2 },
  'baratza-virtuoso': { base: 150, perStep: 29.5 },
};

function grinderSettingToMicrons(setting, grinderKey) {
  const g = GRINDER_MICRON_SCALES[grinderKey];
  return g.base + (setting - 1) * g.perStep;
}
```
Data-driven, not formula-per-grinder. Same result, much less code.

**Cross-grinder translation table (key anchor points):**

| Microns | Ode Gen 2 | Opus | Encore ESP | Comandante | JX-Pro | Virtuoso+ |
|---------|-----------|------|------------|------------|--------|-----------|
| ~200 | 1.0 | 1.3 | 5 | 7 | 40 | 3 |
| ~400 | 3.0 | 2.7 | 11 | 15 | 60 | 9 |
| ~550 | 4.0 | 3.7 | 16 | 21 | 90 | 15 |
| ~650 | 4.2 | 4.3 | 20 | 25 | 107 | 18 |
| ~800 | 6.0 | 5.3 | 25 | 31 | 135 | 23 |
| ~1000 | 8.0 | 6.7 | 32 | 39 | 173 | 30 |

All values are approximate mean particle sizes. Present to users with "approximately" language.

**F5 Layer 1: Roaster Database Expansion**

| File | Change |
|------|--------|
| `src/lib/roasterProfiles.js` | Expand ROASTER_PROFILES from 13 to 50-75 entries |
| `src/lib/roasterProfiles.js` | Add ROAST_STYLE_CATEGORIES with timing profiles |
| `src/lib/roasterProfiles.js` | Update `getProfileForRoaster()` to support style-based fallback |

**Roast style categories** (new constant):
```js
const ROAST_STYLE_CATEGORIES = {
  'nordic-ultra-light': { degasMin: 10, degasMax: 14, peakStart: 21, peakEnd: 60, label: 'Nordic / Ultra-Light' },
  'specialty-light':    { degasMin: 7, degasMax: 14, peakStart: 14, peakEnd: 60, label: 'Specialty Light' },
  'medium':             { degasMin: 5, degasMax: 10, peakStart: 10, peakEnd: 45, label: 'Medium' },
  'dark':               { degasMin: 3, degasMax: 7, peakStart: 7, peakEnd: 30, label: 'Dark' },
  'extended-rest':      { degasMin: 35, degasMax: 45, peakStart: 60, peakEnd: 90, label: 'Extended Rest' },
};
```

**Expanded ROASTER_PROFILES:** Each roaster maps to a style category key instead of duplicating timing values. The `getProfileForRoaster()` function resolves: roaster name → category key → timing profile.

**Proposed roaster list (organized by category):**

*Nordic / Ultra-Light:* Koppi, Prodigal, La Cabra, Coffee Collective, Drop Coffee, Tim Wendelboe, April Coffee, Gardelli, Casino Mocca, Square Mile, The Barn, Friedhats, Nomad, Manhattan Coffee Roasters, Nordic Approach

*Specialty Light:* Sey, Onyx, Dayglow, Dayglow Promethium, Leaves Tokyo, Momos Coffee, Wonderstate, George Howell, Counter Culture, Intelligentsia, Stumptown, Heart, Proud Mary, Little Wolf, Passenger, Regalia, Devocion, Black & White, Brandywine, Sightglass, Verve, Blue Bottle, Equator, Temple, Huckleberry, Cat & Cloud, Methodical, Tandem, Ruby, Madcap, Ceremony, PT's, Merit, Olympia, Sweet Bloom, Luna, JBC, Parlor

*Medium:* Peet's, La Colombe, Lavazza, Illy

*Dark:* (most dark roasters not in specialty space, but include a few known names if needed)

*Extended Rest:* Apollon's Gold

**Fuzzy match: Tiered scoring function** (Fuzzy Matching Research, Performance Oracle):

Drop the "min length 4, >= 50% overlap" approach. It creates false negatives (e.g., "Blue Bottle Coffee" vs "Blue Bottle" fails the overlap check). Use a tiered scoring function with noise-word stripping:

```js
const NOISE_WORDS = new Set(['coffee', 'roasters', 'roasting', 'co', 'the']);

function scoreRoasterMatch(input, candidate) {
  const a = normalize(input), b = normalize(candidate);
  if (a === b) return 100;
  if (b.startsWith(a) && a.length >= 4) return 85;
  if (a.startsWith(b) && b.length >= 4) return 80;
  const aWords = a.split(/\s+/), bWords = b.split(/\s+/);
  if (aWords.length > 1 && aWords.every(w => bWords.includes(w))) return 75;
  const sigA = aWords.filter(w => !NOISE_WORDS.has(w) && w.length >= 3);
  const sigB = bWords.filter(w => !NOISE_WORDS.has(w) && w.length >= 3);
  for (const sw of sigA) {
    if (sigB.some(cw => cw === sw)) return 70;
  }
  return 0;
}
```

Add `ROASTER_ALIASES` map for ultra-short names: `{ 'sey': 'SEY', "pt's": "PT's Coffee" }`. Check aliases before the scoring loop. Min score threshold: 60. No external library needed (microfuzz at ~1-2 kB only if list grows past 100).

**Backward-compatible `getProfileForRoaster` signature** (Architecture Strategist):
The three-layer resolution needs the bean object for layers 3-4. Make it optional:
```js
getProfileForRoaster(roasterName, bean = null)
```
Callers with only a roaster name (e.g., during initial scan before the bean doc exists) still work with layers 1-2 only.

**Medium/Dark timing validation:** Use industry consensus: medium roasts rest less and peak earlier; dark roasts peak almost immediately. The values above are reasonable starting points based on general roasting science.

---

#### Phase 2: Device-Specific Recipes (F1)

The core recipe generation work. Depends on Phase 1 (brew device preference wired up).

| File | Change |
|------|--------|
| `src/lib/handbrew.js` | Add `DEVICE_CONFIGS` with per-device parameters |
| `src/lib/handbrew.js` | Add per-device `FAMILY_DEFAULTS` tables |
| `src/lib/handbrew.js` | Extend `buildHandBrewPrompt()` to inject device context |
| `src/lib/handbrew.js` | Extend `repairHandBrewRecipe()` with device-specific rules |
| `src/lib/handbrew.js` | Extend `GRINDER_POUROVER_STARTS` with per-device grind adjustments |
| `src/hooks/useHandBrew.js` | Pass `brewDevice` to recipe generation |
| `src/hooks/useHandBrew.js` | Cache key: include device for invalidation |

**Device configurations** (renamed to `BREW_DEVICE_CONFIGS` per Pattern Recognition -- "DEVICE_CONFIGS" is too generic):

```js
const BREW_DEVICE_CONFIGS = {
  v60: {
    label: 'Hario V60',
    type: 'pourover',
    filterType: 'thin paper cone',
    drainSpeed: 'fast (single large hole)',
    grindOffset: 0,  // baseline
    ratioRange: [15, 17],
    tempRange: [92, 100],
    defaultTechnique: 'hoffmann',
    techniques: ['hoffmann', 'kasuya-46'],
  },
  kalita: {
    label: 'Kalita Wave',
    type: 'pourover',
    filterType: 'wavy paper flat-bed',
    drainSpeed: 'restricted (3 small holes)',
    grindOffset: +1,  // slightly coarser than V60
    ratioRange: [15, 17],
    tempRange: [93, 100],
    defaultTechnique: 'center-pour',
    techniques: ['center-pour'],
  },
  chemex: {
    label: 'Chemex',
    type: 'pourover',
    filterType: 'thick bonded paper',
    drainSpeed: 'slow (thick filter absorbs oils)',
    grindOffset: +2,  // noticeably coarser than V60
    ratioRange: [15, 17],
    tempRange: [96, 100],
    defaultTechnique: 'hoffmann-chemex',
    techniques: ['hoffmann-chemex'],
  },
  aeropress: {
    label: 'Aeropress',
    type: 'immersion-pressure',
    filterType: 'paper or metal disc',
    drainSpeed: 'user-controlled (plunge)',
    grindOffset: -1,  // finer than V60 (shorter contact time)
    ratioRange: [12, 16],
    tempRange: [80, 100],
    defaultTechnique: 'standard',
    techniques: ['standard', 'inverted', 'bypass'],
  },
  'french-press': {
    label: 'French Press',
    type: 'full-immersion',
    filterType: 'metal mesh (no paper)',
    drainSpeed: 'none (full immersion)',
    grindOffset: +4,  // much coarser than V60
    ratioRange: [15, 17],
    tempRange: [93, 96],
    defaultTechnique: 'hoffmann-french-press',
    techniques: ['hoffmann-french-press'],
  },
};
```

**grindOffset (validated by deepening research):** Relative to V60 baseline in Ode Gen 2 steps. Applied to `GRINDER_POUROVER_STARTS` values. Example: V60 light roast on Ode = 4.5 → Chemex = 4.5 + 2 = 6.5 (adjusted to nearest valid step).

Key device differences from research:
- **V60**: Fast drain (single large hole), thin paper. Baseline. Grind 400-600um. Ratio 1:15-1:17. Temp 92-100C. Time 2:30-3:30.
- **Kalita**: Restricted flow (3 small holes), flat bed. Slightly coarser (+0.5-1 steps). More forgiving, center-pour technique.
- **Chemex**: Thick bonded paper, slow flow. Noticeably coarser (+1.5-2.5 steps). Higher temp (96-100C, compensates heat loss). Time 3:30-5:00.
- **Aeropress**: Short contact, pressure. Finer (-0.5-1 steps). Variable temp (80-100C). Ratio 1:10-1:16. Time 1:00-2:30.
- **French Press**: Full immersion, metal mesh. Much coarser (+2-4 steps). Ratio 1:13-1:14 (higher dose). Hoffmann method: 4min steep + 5min settle = 9min total.

**Per-device FAMILY_DEFAULTS: Use 1 base table + device offsets** (Pattern Recognition, Code Simplicity, Architecture):

Do NOT duplicate the family defaults 5 times (~200 lines of config). Keep one `FAMILY_POUROVER_DEFAULTS` table and apply device adjustments at generation time:

```js
function getDeviceFamilyDefaults(device, family) {
  const base = FAMILY_POUROVER_DEFAULTS[family] || FAMILY_POUROVER_DEFAULTS[DEFAULT_POUROVER_FAMILY];
  const config = DEVICE_CONFIGS[device];
  return {
    ...base,
    grindDirection: adjustGrindForDevice(base.grindDirection, config.grindOffset),
    tempC: config.tempRange ? `${config.tempRange[0]}-${config.tempRange[1]}` : base.tempC,
    technique: config.defaultTechnique,
  };
}
```

For pour-over devices (V60, Kalita, Chemex), the families are identical except for grind offset and technique. For immersion devices (Aeropress, French Press), add 2 small immersion config objects with steep time and press/settle timing. ~60 lines total instead of ~200.

Add dev-time validation (Architecture Strategist): an assertion that checks all `DEVICE_CONFIGS` keys have valid entries and all required fields exist.

The family structure (washed-floral-clarity, clean-natural-fruit, etc.) remains the same across devices. Only the parameters change.

**Prompt architecture:**

One shared system prompt with device-specific injection (not 5 separate prompts). The `buildHandBrewPrompt()` function gets a `device` parameter:

```
buildHandBrewPrompt(preferences, family, roastLevel, device)
  → Injects DEVICE_CONFIGS[device] context (filter type, drain speed, techniques)
  → Injects DEVICE_FAMILY_DEFAULTS[device][family] parameters
  → Injects GRINDER context (existing, per-grinder)
  → Only device-relevant knowledge (no French Press info in V60 prompts)
```

This addresses the token waste noted in the existing hand brew plan (French Press sections wasting ~200 tokens in V60 requests).

**Recipe cache invalidation (from SpecFlow -- existing bug + expansion):**

**Existing bug:** The current cache hit logic at `useHandBrew.js:48` returns any cached recipe without checking the grinder key. If a user changes their grinder in Settings, the next brew tap serves the old grinder's recipe. Fix this first.

**Expanded cache check:**
```js
// useHandBrew.js cache check
if (!forceRegenerate && bean.handBrewRecipe &&
    (bean.handBrewRecipe.device || 'v60') === preferences.brewDevice &&
    bean.handBrewRecipe.grinder === preferences.grinder) {
  // use cached recipe
}
```

Switching devices OR grinders forces regeneration. Old hand brew recipes (no `device` key) are treated as V60 by convention.

**CRITICAL: Ensure `device` is written to Firestore** (Performance Oracle):
The current `useHandBrew.js:108-114` writes the recipe to the bean doc but does NOT include a `device` field. If the implementation forgets to include `device: preferences.brewDevice` in the `updateBean` call, every recipe defaults to `'v60'` on re-read, causing spurious regeneration for non-V60 users on every app restart.

**Single-recipe model:** `bean.handBrewRecipe` holds one recipe at a time (overwrite on device switch). This matches the current single-recipe pattern. F4 archive shows whatever recipe was last generated. If per-device history is needed later, it can be added as a follow-up.

**Repair rules per device:**

`repairHandBrewRecipe()` gets device-specific validation:
- V60: grind floor from `pourOverStart`, max brew time 4:00
- Kalita: slightly coarser floor, max brew time 4:30 (restricted flow)
- Chemex: coarser floor, max brew time 6:00 (thick filter, varies by size)
- Aeropress: finer floor, max brew time 3:30
- French Press: medium floor (NOT coarse, see below), brew time 9:00-12:00 (Hoffmann settle method)

### Research Insights: Authoritative Device Parameters (Brewing Research)

Parameters validated against James Hoffmann (World Atlas of Coffee), Scott Rao, Tetsu Kasuya, World AeroPress Championship data, and manufacturer guides.

**Key correction: French Press grind is MEDIUM, not coarse.** Hoffmann explicitly challenges the "coarse grind" convention. He recommends medium grind (same range as pour-over, 500-800 microns) for better extraction, relying on the 5-8 minute settling period to let fines sink instead of trying to prevent them. The traditional coarse grind under-extracts.

**Device Parameter Summary Table (for DEVICE_CONFIGS defaults):**

| Parameter | V60 | Kalita Wave | Chemex | AeroPress | French Press |
|-----------|-----|-------------|--------|-----------|--------------|
| Grind (microns, light) | 400-500 | 500-600 | 600-750 | 300-400 | 500-700 |
| Grind (microns, dark) | 600-700 | 700-800 | 800-950 | 500-600 | 700-900 |
| Grind vs V60 delta | Baseline | +1-2 steps | +2-4 steps | -1-3 steps finer | 0 to +2 (Hoffmann method) |
| Temp, light (C) | 96-100 | 96-100 | 97-100 | 92-100 | 100 (boiling) |
| Temp, dark (C) | 88-93 | 88-93 | 90-94 | 80-88 | 100 (boiling) |
| Ratio | 1:15-1:17 | 1:15-1:17 | 1:15-1:17 | 1:13-1:15 | 1:13-1:16 |
| Brew time | 2:30-4:00 | 3:00-4:30 | 3:30-6:00 | 0:50-3:30 | 9:00-12:00 |
| Bloom | 2-3x, 30-45s | 2x, 30s | 2-3x, 30-45s | N/A (stir) | N/A |

**Roast level adjustments across ALL devices:**
- Light: -1-2 steps finer, +3-7C hotter, 1:15-1:16, +10-15% contact time, bloom 35-45s
- Dark: +1-3 steps coarser, lower temp, 1:17-1:18, -10-15% contact time, bloom 20-25s

**Technique notes per device:**
- **V60 Hoffmann**: Bloom 2x weight 45s, pour to 60% in 30s, remaining 40% in 30s, Rao spin, drain. Total 3:00-3:30.
- **Kalita**: Center-weighted spiral (don't hit paper walls). More forgiving than V60. The device controls flow, not the barista.
- **Chemex**: Hoffmann adapted. Higher temp compensates glass heat loss. Pre-rinse filter AND glass body.
- **Aeropress**: Standard or inverted. Bypass brewing (concentrate + water) wins championships. Widest temp range (80-100C).
- **French Press Hoffmann**: 4min steep, break crust, scoop foam, settle 5-8min, DO NOT plunge to bottom. Pour slowly. Total 9-12min.

**Immersion device grind floor validation** (Architecture Strategist): The `grindOffset` approach assumes linear grind relationship. Aeropress at `-1` from a light-roast V60 baseline of 4.5 gives 3.5 (Ode Gen 2), which falls into Aiden territory (3.1-4.0). The repair layer must have immersion-specific floor logic, not just pour-over `validRange`.

---

#### Phase 3: Archive + Auto-Learn (F4, F5 Layers 2-3)

Independent of Phase 2. Can be built in parallel.

**F4: Archive Recipe View**

| File | Change |
|------|--------|
| `src/components/ArchiveDetailSheet.jsx` | Add recipe section between metadata (line 411) and tastings (line 414) |

**Implementation:**

Add a collapsible "Brew Profile" section. Render based on what's available on the bean doc:

```jsx
{(bean.aidenRecipe || bean.handBrewRecipe) && (
  <Section title="Brew Profile">
    {bean.aidenRecipe && (
      <AidenRecipeSummary recipe={bean.aidenRecipe} />
      {bean.aidenLink && <BrewLink url={bean.aidenLink} />}
    )}
    {bean.handBrewRecipe && (
      <HandBrewRecipeSummary recipe={bean.handBrewRecipe} />
    )}
  </Section>
)}
```

**AidenRecipeSummary**: Read-only display of ratio, bloom, pulse count, grind recommendation, temperatures. Compact format (not the full recipe modal).

**HandBrewRecipeSummary**: Read-only display of method, technique, dose, ratio, grind, total brew time, steps summary. Show device label if stored (`recipe.device`).

**No regeneration.** No "Brew Again" button. Archive is historical record (see origin: F4c).

**F5 Layer 2: Auto-Learn from Enrichment**

**RECOMMENDATION: Drop Layer 2 entirely. Ship Layers 1+3 only.** (Code Simplicity Review)

For <200 beans and a single user, Layer 2 adds: (a) scan of all beans on every new bean add, (b) `roasterStyle` field persisted on each bean, (c) hard dependency on B4 enrichment shipping first. The payoff: if you add a bean from an unlisted roaster that you previously added and enriched, the second bean inherits the learned style. With 50-75 roasters in the database, most specialty roasters will be in the list. The few that are not fall through to Layer 3 (roast level inference), which gives a perfectly adequate result.

Dropping Layer 2 removes the B4 dependency, letting the two plans ship independently. If needed later, add auto-learn as a follow-up.

<details>
<summary>Original Layer 2 design (deferred)</summary>

**Hard dependency on Bug B4** (enrichment-first). If B4 hasn't shipped, Layer 2 is inoperable. Ship F5 with Layers 1+3 first; Layer 2 activates when B4 lands.

| File | Change |
|------|--------|
| `src/lib/roasterProfiles.js` | Add `classifyRoasterStyle()` from enrichment data |
| `src/hooks/useProfessorRuphus.js` | After enrichment, classify and persist roaster style |
| `src/hooks/useAppData.js` | Learned roaster lookup via existing bean collection (no new subcollection) |

**Auto-learn flow:**

```
Enrichment returns roasterInfo (location, roast style, founding info)
  → classifyRoasterStyle(roasterInfo.roastLevel, roasterInfo.roastedIn)
  → Returns style key: 'nordic-ultra-light' | 'specialty-light' | 'medium' | 'dark'
  → Persist on bean doc: bean.roasterStyle = styleKey
  → Optional: persist to per-user roaster cache for future beans from same roaster
```

**Per-user roaster cache (F5d):**

Option A: Bean-level field only. Each bean stores `roasterStyle`. When a new bean is added from a known roaster, check existing beans for that roaster's learned style.
Option B: Firestore subcollection `users/{uid}/learnedRoasters/{roasterName}` with `{ style, learnedAt }`.

**Recommendation: Option A** (bean-level field). Simpler, no new Firestore collections, and the lookup is cheap (user's beans are already loaded). When adding a new bean, scan existing beans for matching roaster name, use the most recent learned style.

**If implemented later:** Learned style lookup must use exact roaster name string, not fuzzy match (Architecture Strategist). Fuzzy matching belongs in ROASTER_PROFILES database lookup, not per-user learned style lookup.

</details>

**F5 Layer 3: Roast Style Fallback**

| File | Change |
|------|--------|
| `src/lib/roasterProfiles.js` | Update `getProfileForRoaster()` with style-based fallback |
| `src/components/AddBeanForm.jsx` | When no roaster match, use bean's roast level to determine style |
| `src/components/EditBeanModal.jsx` | Add roast style override dropdown |

**Updated `getProfileForRoaster()` resolution order:**

```
1. Exact roaster match in ROASTER_PROFILES → specific profile
2. Fuzzy roaster match → specific profile
3. Bean has roasterStyle field (from enrichment auto-learn) → ROAST_STYLE_CATEGORIES[style]
4. Bean has roastLevel → infer style (light→specialty-light, medium→medium, dark→dark)
5. Fallback → ROAST_STYLE_CATEGORIES['specialty-light'] (current DEFAULT_PROFILE)
```

**Display:** Instead of "Unknown Roaster (Specialty Light default)", show the roaster name with the style label: "Manhattan Coffee Roasters (Nordic / Ultra-Light)" or just the style label if roaster is truly unknown.

**Edit Bean override:** Add a "Roast Style" dropdown in EditBeanModal Chapter 5 with options from `ROAST_STYLE_CATEGORIES`. When set, overrides the auto-detected style. Stored as `bean.roasterStyle`.

---

## System-Wide Impact

### Interaction Graph

**Brew device preference change** (Settings):
→ `updatePreferences({ brewDevice })` → Firestore write
→ All BeanCard components re-render (read `preferences.brewDevice`)
→ BrewButton shows new default device label
→ BrewMethodMenu highlights new default
→ Existing cached recipes with old device key show "switch device" indicator

**Recipe generation (new device)**:
→ `useHandBrew.handleBrew()` → `researchBean()` (cached, no re-call)
→ `generateHandBrewRecipe(bean, research, preferences)` with `device` param
→ `buildHandBrewPrompt()` injects device-specific context
→ GPT-5.4 Mini returns recipe → `repairHandBrewRecipe()` with device rules
→ `updateBean({ handBrewRecipe: { ...recipe, device, grinder } })` → Firestore
→ Bean card updates grind display via `formatHandBrewGrind()`

**Roaster profile resolution (add bean)**:
→ User enters roaster name → `getProfileForRoaster(name)`
→ Check ROASTER_PROFILES (50-75 entries) → fuzzy match
→ If no match: check existing beans for learned roasterStyle
→ If no match: infer from roastLevel
→ If no match: specialty-light fallback
→ Persist `{ degasMin, peakStart, peakEnd, roasterStyle }` on bean doc

### Error Propagation

- Recipe generation failure: GPT call fails → `repairHandBrewRecipe` never runs → error shown in recipe modal. No bean doc changes. User can retry.
- Grind translation for unknown grinder: `odeStepToGrinderSetting` returns microns + description. No crash, graceful degradation.
- Roaster style auto-learn failure: enrichment fails → no `roasterStyle` persisted → fallback to roastLevel inference or specialty-light default. Silent failure.

### State Lifecycle Risks

- **Recipe cache migration**: Existing `bean.handBrewRecipe` has no `device` field. Code must treat these as V60 recipes. If user switches to Chemex, the missing `device` field triggers regeneration. No data loss.
- **Preference migration**: Existing `preferences.brewMethod === 'handbrew'` needs mapping to `'v60'`. Handle in `useUserProfile.jsx` initialization.
- **Roaster profile expansion**: No migration needed. Existing beans have `degasMin`, `peakStart`, `peakEnd` values baked in from add time. New beans from recognized roasters get better defaults. Existing beans are unaffected.

### API Surface Parity

- `BREW_METHODS` registry: expanded from 2 to 6. All consumers (`BeanCard`, `BrewButton`, `BrewMethodMenu`, `SettingsPage`, `formatHandBrewGrind`) must handle the new keys.
- `GRINDER_LABELS`: unchanged. Already supports all 6 grinders.
- `formatAidenGrind()`: extended with translation. Same interface, richer output.
- `formatHandBrewGrind()`: unchanged interface. Recipe already contains grinder-specific data.
- `getProfileForRoaster()`: extended with style fallback. Same interface, more paths.

---

## Acceptance Criteria

### Functional Requirements

- [ ] V60 and French Press recipes for the same bean produce meaningfully different grind sizes, water temps, and pour techniques
- [ ] A user with a Comandante C40 sees grind in clicks (e.g., "22 clicks") in both Aiden and manual recipes
- [ ] An archived bean shows its saved Aiden recipe and/or hand brew recipe (read-only)
- [ ] Archived bean with aidenLink shows tappable brew.link
- [ ] A bean from an unknown roaster shows style label (e.g., "Specialty Light") instead of "Unknown Roaster"
- [ ] Switching brew device in recipe view regenerates without changing Settings default
- [ ] Default brew device selectable in Settings and onboarding
- [ ] BrewMethodMenu shows all 5 manual devices
- [ ] Recipe cache invalidated when device or grinder changes
- [ ] Existing users with `brewMethod: 'handbrew'` are migrated to `brewDevice: 'v60'`

### Non-Functional Requirements

- [ ] Recipe generation latency comparable to current hand brew (~4-8s)
- [ ] No increase in Firestore reads for roaster profile resolution
- [ ] Grind translation is instant (client-side math, no API call)
- [ ] Archive recipe view renders without delay (data already on bean doc)

### Quality Gates

- [ ] Family classifiers produce same family for same bean regardless of device
- [ ] All 5 devices x 6 grinders x 3 roast levels generate valid recipes (30 combinations spot-checked)
- [ ] Roaster fuzzy match produces no false positives with expanded 50-75 entry database
- [ ] iOS picker wheels scroll correctly for all new dropdowns (brew device, roast style)

---

## Dependencies & Prerequisites

| Dependency | Type | Impact |
|-----------|------|--------|
| Bug B4 (Ruphus enrichment-first) | Feature dependency | F5 Layer 2 auto-learn depends on enrichment returning roaster data. Ship B4 first or in parallel. |
| Brew device icons | Asset | 5 new icons needed for brew methods (v60, kalita, chemex, aeropress, french-press). Can use placeholders initially. |
| Grinder translation accuracy | Research | Anchor points for micron-to-grinder mapping need validation. Can ship with best-effort values and refine. |
| Roaster list curation | Research | 50-75 roasters need categorization. Can be iteratively expanded. |
| Firestore rules | Deploy | New fields (`brewDevice`, `roasterStyle`, `shelfLife`) need read/write rules deployed BEFORE client code. |

## Risk Analysis & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Grind translation inaccuracy | Medium | Medium | Ship with disclaimer "approximate". Users with specific grinders will provide feedback. Offer microns as fallback. |
| Recipe quality varies by device | Medium | High | Start with V60 (current quality bar), tune other devices iteratively. V60 recipes should not regress. |
| Roaster fuzzy match false positives | Low | Medium | Tighten matching (min length 4, >= 50% overlap). Log ambiguous matches for review. |
| Token waste in device prompts | Low | Low | Device-specific prompt injection prevents this (only inject relevant device knowledge). |
| Existing recipe cache breaks | Low | Low | Missing `device` field treated as V60. Graceful degradation. |

## Future Considerations

- **Brew timer**: Recipes output timer-ready step sequences. The timer UI (P0 roadmap) will consume these directly. No recipe format changes needed.
- **Espresso**: Explicitly out of scope. Would need a fundamentally different recipe engine (pressure, dose, yield, extraction time).
- **Cold brew**: Different extraction paradigm. Separate feature if ever needed.
- **Shared roaster database**: Currently per-user learned roasters. Could become a shared community database if user base grows.

---

## Sources & References

### Origin

- **Origin document:** [docs/brainstorms/2026-04-21-brew-methods-expansion-requirements.md](docs/brainstorms/2026-04-21-brew-methods-expansion-requirements.md) -- Key decisions: device-specific recipes (not generic pour-over), default device in Settings + per-recipe switching, Aiden stays separate, three-layer roaster resolution, archive recipes are read-only
- **Bugs dependency:** [docs/brainstorms/2026-04-21-bug-fixes-spring-cleanup-requirements.md](docs/brainstorms/2026-04-21-bug-fixes-spring-cleanup-requirements.md) -- B4 enrichment-first is a prerequisite for F5 Layer 2

### Internal References

- Hand brew engine: `src/lib/handbrew.js` (GRINDER_POUROVER_STARTS:19-57, FAMILY_POUROVER_DEFAULTS:63-106, generateHandBrewRecipe:431-493)
- Brew methods registry: `src/lib/brewMethods.js:50-66`
- Settings equipment section: `src/components/SettingsPage.jsx:650-757`
- Archive detail sheet: `src/components/ArchiveDetailSheet.jsx` (metadata:362-411, tastings:414-496)
- Roaster profiles: `src/lib/roasterProfiles.js` (13 roasters, getProfileForRoaster:26-34)
- Aiden grind enforcement: `src/lib/aiden.js` (FAMILY_GRIND_BANDS:23-33, enforceDeterministicGrind:609-653)
- Grind display: `src/lib/brewMethods.js` (formatAidenGrind:20-29, odeStepToMicrons:15-17)
- Bean card brew button: `src/components/BrewButton.jsx:31-67`, `src/components/BrewMethodMenu.jsx`
- Default preferences: `src/hooks/useUserProfile.jsx:8-14`

### Learnings Applied

- One Firestore write per handler (Settings preferences)
- GRINDER_LABELS from brewMethods.js as single source of truth
- Sanitize user inputs in LLM prompts at source
- Wrap JSON.parse on LLM output in try/catch
- Device-specific prompt injection to avoid token waste
- useRef(false) for async re-entry guards
