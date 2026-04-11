---
title: "Research-Driven Hand Brew Recipe Engine"
type: feat
status: active
date: 2026-04-05
---

# Research-Driven Hand Brew Recipe Engine

## Enhancement Summary

**Deepened on:** 2026-04-05
**Review agents used:** Architecture Strategist, Performance Oracle, Code Simplicity Reviewer, Security Sentinel, Pattern Recognition Specialist, SpecFlow Analyzer, Lessons/Learnings Checks

### Key Improvements from Review
1. **Mirror the Aiden architecture**: Use `cupStructureFamily` (already from beanResearch) instead of reinventing a roast x process matrix. Add a `repairHandBrewRecipe()` enforcement layer like Aiden's `repairRecipe()`.
2. **Simplify data structures**: Flatten grinder ranges to `pourOverStart` only. Kill `BREW_TECHNIQUE_PROFILES` as a JS export (inline as prompt text). Collapse process modifiers from 4 to 2.
3. **Inject only the user's grinder** into the prompt (not all 6). Store grinder key in cached recipe for invalidation.

### New Considerations Discovered
- "Other" grinder (custom name) has no pour-over range data: needs a micron-only fallback path
- `ultra-light` roast level from beanResearch has no matrix entry: map to `light`
- Cached recipes go stale when user changes grinder: store grinder key for validation
- The `sanitize()` regex allows newlines via `\s`: tighten to literal space
- French Press/AeroPress sections in HANDBREW_KNOWLEDGE waste ~200 tokens per pour-over request

---

## Overview

The current hand brew recipe generator produces near-identical recipes regardless of bean characteristics. It anchors on a fixed 1:16.7 ratio, a single Hoffmann-style 4-pour technique, 97C water, and guesses grind settings without grinder-specific data. This plan upgrades the knowledge base, prompt, and post-generation enforcement to produce genuinely custom recipes.

## Problem Statement

Three specific failures in the current system:

1. **Ratio never varies.** The prompt says "60g/L starting point" and the example JSON hardcodes `1:16.7`. GPT anchors there every time. Research shows light roasts benefit from 1:15-1:16, dark roasts from 1:17-1:18, and naturals from tighter ratios than washed.

2. **Grind settings are blind guesses.** The prompt tells GPT the grinder's scale but gives zero pour-over-specific ranges. Result: a light washed Ethiopian got 4.1 on Ode Gen 2, which is Aiden machine territory (3.1-4.0), not pour-over (should be ~4.5-5.0 for V60).

3. **Only one technique.** Every recipe is a 4-pour Hoffmann-style method. There are at least three well-established approaches (Hoffmann, Hedrick 1-2-1, Kasuya 4:6) that suit different beans and user preferences.

## Research Foundation

All findings are grounded in primary research conducted 2026-04-05:

| File | Key Contribution |
|------|-----------------|
| `~/Documents/Last30Days/fellow-ode-gen2-pour-over-grind-settings.md` | Grinder-specific V60 ranges by roast level |
| `~/Documents/Last30Days/best-v60-pour-over-recipe-hoffmann-hedrick.md` | Hoffmann vs. Hedrick techniques, modern trends |
| `~/Documents/Last30Days/tetsu-kasuya-4-6-method-pour-over.md` | 4:6 method parameters and flavor tuning |
| `~/Documents/Last30Days/pour-over-coffee-ratio-adjustment.md` | Ratio/temp/grind by roast level and process |
| `~/.claude/books/world-atlas-coffee.md` | Hoffmann's canonical pour-over methodology |
| `~/Documents/Last30Days/fellow-aiden-opus-grind-settings-deep.md` | Aiden vs pour-over grind comparison data |

## Proposed Solution

### Phase 1: Add data structures

Two new data structures. **Both live in `handbrew.js`** (not `coffeeKnowledge.js`), following the Aiden pattern where grinder data stays co-located with the logic that uses it.

#### 1A. Grinder pour-over start points (`GRINDER_POUROVER_STARTS`)

Flat lookup: one anchor value per roast level per grinder. GPT gets only the user's grinder. The enforcement layer uses this for post-generation clamping.

```javascript
// In handbrew.js (mirrors Aiden's FAMILY_GRIND_BANDS / ODE_GEN2_STEPS pattern)
const GRINDER_POUROVER_STARTS = {
  'fellow-ode-gen2': {
    label: 'Fellow Ode Gen 2',
    scale: '1-11 with .1/.2 sub-steps',
    pourOverStart: { light: 4.5, medium: 5.5, dark: 7.0 },
    validRange: { min: 4, max: 8 },  // Fellow official manual: pour-over range 4-8
    aidenRange: '3.1-4.0 (light roast Aiden, do NOT use pour-over settings this low)',
  },
  'fellow-opus': {
    label: 'Fellow Opus',
    scale: '1-6 with 10 clicks per number',
    pourOverStart: { light: 4.0, medium: 5.0, dark: 6.0 },
    validRange: { min: 2.5, max: 6.5 },
  },
  'comandante-c40': {
    label: 'Comandante C40 MK4',
    scale: '~40 clicks, 0-40',
    pourOverStart: { light: 22, medium: 28, dark: 32 },
    validRange: { min: 18, max: 38 },
  },
  'baratza-encore-esp': {
    label: 'Baratza Encore ESP',
    scale: '40 steps, 1-40',
    pourOverStart: { light: 15, medium: 20, dark: 25 },
    validRange: { min: 10, max: 32 },
  },
  '1zpresso-jx-pro': {
    label: '1Zpresso JX-Pro',
    scale: '~200 clicks, 0-200',
    pourOverStart: { light: 90, medium: 110, dark: 130 },
    validRange: { min: 70, max: 150 },
  },
  'baratza-virtuoso-plus': {
    label: 'Baratza Virtuoso+',
    scale: '40 steps, 1-40',
    pourOverStart: { light: 15, medium: 20, dark: 25 },
    validRange: { min: 10, max: 32 },
  },
};
```

**"Other" grinder fallback:** When `grinder === 'other'`, inject micron-only guidance (no grinder-specific setting number). Prompt GPT to respond in microns only. The enforcement layer skips grind clamping for custom grinders.

**Source:** Honest Coffee Guide grind chart, Fellow Ode Gen 2 range 2.2-5.2 for V60, cross-referenced with Aiden deep-dive data.

#### 1B. Cup-structure family pour-over defaults (`FAMILY_POUROVER_DEFAULTS`)

Use the same `cupStructureFamily` classification that `beanResearch.js` already returns (7 families). This ensures Aiden and hand brew give consistent advice for the same bean.

```javascript
// In handbrew.js (mirrors Aiden's per-family baseline defaults)
const FAMILY_POUROVER_DEFAULTS = {
  'washed-floral-clarity': {
    ratio: '1:15.5 to 1:16', tempC: '97-100', bloom: '2-3x, 30-45s',
    grindDirection: 'finer', process: 'washed',
    technique: 'Hoffmann or Hedrick 1-2-1 (extended bloom helps with florals)',
    notes: 'Push extraction for clarity. Full boil OK.',
  },
  'washed-ethiopia-clarity': {
    ratio: '1:15.5 to 1:16', tempC: '97-100', bloom: '2-3x, 30-45s',
    grindDirection: 'finer', process: 'washed',
    technique: 'Hedrick 1-2-1 (extended bloom maximizes floral/citrus clarity)',
    notes: 'Dense, high-altitude. Needs heat. Expect bergamot, jasmine, citrus.',
  },
  'washed-kenya-clarity': {
    ratio: '1:15.5 to 1:16', tempC: '97-100', bloom: '2x, 30s',
    grindDirection: 'finer', process: 'washed',
    technique: 'Hoffmann classic (bright acidity benefits from even extraction)',
    notes: 'Bright, juicy. Blackcurrant, tomato, grapefruit.',
  },
  'clean-natural-fruit': {
    ratio: '1:15 to 1:15.5', tempC: '95-98', bloom: '2x, 30s',
    grindDirection: 'slightly coarser than washed', process: 'natural-or-fruited',
    technique: 'Kasuya 4:6 (flavor tuning controls sweetness/fruit balance)',
    notes: 'Higher solubility. Gentler pours. Risk of over-extraction.',
  },
  'processed-clarity': {
    ratio: '1:15.5 to 1:16', tempC: '95-98', bloom: '2x, 30s',
    grindDirection: 'slightly coarser', process: 'natural-or-fruited',
    technique: 'Hoffmann or Kasuya 4:6',
    notes: 'Honey/anaerobic. Between washed and natural in behavior.',
  },
  'medium-washed': {
    ratio: '1:16', tempC: '93-96', bloom: '2x, 30s',
    grindDirection: 'middle of range', process: 'washed',
    technique: 'Hoffmann classic (standard approach works well)',
    notes: 'Balanced extraction. Good starting point.',
  },
  'dark-roast': {
    ratio: '1:17 to 1:18', tempC: '88-93', bloom: '2x, 25s',
    grindDirection: 'coarser end of range', process: 'washed',
    technique: 'Hoffmann classic (gentle, prevent over-extraction)',
    notes: 'Very porous. Low temp, coarse grind, wider ratio.',
  },
};
```

**Fallback when research fails or returns no family:** Import or replicate Aiden's `classifyFamilyFallback()` logic. Map `ultra-light` roast level to the `washed-floral-clarity` family. When research is completely null, default to `medium-washed`.

**Source:** Pour-over ratio research, Kasuya 4:6 research, Hoffmann book, aligned with Aiden's existing family classification.

### Phase 2: Rewrite the system prompt in `handbrew.js`

Replace `buildHandBrewPrompt()` with a research-informed prompt. Key changes:

1. **Inject only the user's grinder range** (from `GRINDER_POUROVER_STARTS[grinderKey]`), not all grinders. For "other" grinders, inject micron-only guidance.

2. **Inject the matched family defaults** (from `FAMILY_POUROVER_DEFAULTS[family]`). Pre-select the family in code based on `cupStructureFamily` from research, and inject only that family's defaults. Include the recommended technique.

3. **Inline technique descriptions** as 3-4 sentences in the prompt (not a JS data structure). GPT already knows these techniques. Just say: "Choose the best technique for this bean. Options: Hoffmann Classic (all-rounder, 2-3 pours after bloom, gentle swirl), Hedrick 1-2-1 (light roasts, extended 2-min bloom, single final pour, boiling water), Kasuya 4:6 (coarse grind, 5 equal pours at 45s intervals, first 40% controls flavor balance). You may blend approaches."

4. **Remove the hardcoded example JSON** that anchors GPT on 1:16.7, 4-pour, 97C. Replace with a schema-only format spec (field names and types, no example values).

5. **Add a "reasoning" field** (capped at 1-2 sentences) to the JSON output for debugging.

6. **Add a final checklist** (modeled on Aiden's 10-item checklist) that GPT must verify before outputting:
   - "Ratio must NOT be 1:16.7 for every bean. Use family defaults."
   - "Grind setting must be within the provided pour-over range, NOT in the Aiden range."
   - "Water temperature must vary with roast level (light = hotter, dark = cooler)."
   - "Technique must match the family recommendation unless you have a specific reason to deviate."
   - "Bloom duration and water must vary (light roasts get longer/more bloom)."

7. **Strip French Press and AeroPress sections** from the injected knowledge (saves ~200 tokens). Only inject pour-over-relevant content from `HANDBREW_KNOWLEDGE`.

8. **Expand the user content** in `generateHandBrewRecipe()` to pass roast level, process type, and cup-structure family as explicit top-level fields (not buried in research context).

### Phase 3: Add `repairHandBrewRecipe()` enforcement layer

Following the Aiden pattern (`repairRecipe()` + `enforceDeterministicGrind()`), add post-generation enforcement in `handbrew.js`:

```javascript
function repairHandBrewRecipe(recipe, grinderKey, family) {
  const grinder = GRINDER_POUROVER_STARTS[grinderKey];
  const defaults = FAMILY_POUROVER_DEFAULTS[family] || FAMILY_POUROVER_DEFAULTS['medium-washed'];

  // 1. Clamp grind setting to valid pour-over range (skip for "other" grinder)
  if (grinder && recipe.grindSize?.setting != null) {
    const setting = parseFloat(recipe.grindSize.setting);
    if (setting < grinder.validRange.min) recipe.grindSize.setting = String(grinder.validRange.min);
    if (setting > grinder.validRange.max) recipe.grindSize.setting = String(grinder.validRange.max);
  }

  // 2. Clamp ratio to valid range (1:14 to 1:19)
  const ratioMatch = recipe.ratio?.match(/1:([\d.]+)/);
  if (ratioMatch) {
    const r = parseFloat(ratioMatch[1]);
    if (r < 14) recipe.ratio = '1:14';
    if (r > 19) recipe.ratio = '1:19';
  }

  // 3. Clamp water temperature
  if (recipe.waterTemp?.celsius) {
    if (recipe.waterTemp.celsius < 83) recipe.waterTemp.celsius = 83;
    if (recipe.waterTemp.celsius > 100) recipe.waterTemp.celsius = 100;
    recipe.waterTemp.fahrenheit = Math.round(recipe.waterTemp.celsius * 9/5 + 32);
  }

  // 4. Ensure steps have ascending waterTotal
  if (Array.isArray(recipe.steps)) {
    let lastTotal = 0;
    for (const step of recipe.steps) {
      if (step.waterTotal < lastTotal) step.waterTotal = lastTotal;
      lastTotal = step.waterTotal;
    }
  }

  // 5. Default optional fields
  recipe.reasoning = recipe.reasoning || '';
  recipe.technique = recipe.technique || 'hoffmann';

  return recipe;
}
```

Call after `JSON.parse` and before `validateRecipe()`. Log a warning if any value was clamped (helps debugging without blocking the recipe).

### Phase 4: Fix the degree symbol rendering bug + display `reasoning`

In `HandBrewModal.jsx`:
- Fix the degree symbol rendering (raw `\u00B0` showing instead of °)
- Add a small collapsible "Why this recipe" section that displays `recipe.reasoning` (if present)
- Display the technique name (e.g., "Hoffmann Classic" or "Kasuya 4:6") in the recipe subtitle
- Handle both old and new recipe shapes gracefully (old cached recipes won't have `reasoning` or `technique`)

### Phase 5: Store grinder key in cached recipe

In `useHandBrew.js`, add the grinder key when persisting:

```javascript
await updateBean(bean.id, {
  handBrewRecipe: { ...recipe, generatedAt: new Date().toISOString(), grinder: grinderKey },
});
```

This enables future cache invalidation if needed (currently recipes are always regenerated on tap, so this is defensive).

## Files to Modify

| File | Change |
|------|--------|
| `src/lib/handbrew.js` | Add `GRINDER_POUROVER_STARTS`, `FAMILY_POUROVER_DEFAULTS`. Rewrite `buildHandBrewPrompt()`. Add `repairHandBrewRecipe()`. Expand `generateHandBrewRecipe()` user content. Strip French Press/AeroPress from injected knowledge. |
| `src/lib/coffeeKnowledge.js` | Export a pour-over-only subset of `HANDBREW_KNOWLEDGE` (or let `handbrew.js` import and trim). No new data structures here. |
| `src/components/HandBrewModal.jsx` | Fix degree symbol. Display `reasoning` and `technique`. Handle old recipe shapes. |
| `src/hooks/useHandBrew.js` | Store grinder key alongside cached recipe. |

## Files NOT Modified

- `src/lib/beanResearch.js` -- Already provides `cupStructureFamily`, `roastLevel`, `processingNuance`. No changes needed.
- `src/lib/brewMethods.js` -- Display logic is fine.
- `api/openai.js` -- Proxy is unchanged.

## Edge Cases (from SpecFlow Analysis)

| Edge Case | Handling |
|-----------|----------|
| "Other" grinder selected | Inject micron-only guidance, skip grind clamping in enforcement |
| `ultra-light` roast level | Map to `light` (same family as `washed-floral-clarity`) |
| Research fails entirely (`research = null`) | Default to `medium-washed` family, instruct GPT to infer roast from bean description |
| GPT returns grind outside documented range | `repairHandBrewRecipe()` clamps to `validRange` |
| GPT still returns 1:16.7 | Prompt checklist explicitly prohibits this + enforcement clamps to family range |
| Unmapped processing (semi-washed, SWP decaf, co-ferment) | Prompt instruction: "If process is not listed, treat fermented/fruited processes as natural-or-fruited, all others as washed" |
| Old cached recipes missing `reasoning`/`technique` | Modal renders conditionally, defaults to empty |
| Regenerate produces same recipe | OpenAI default temperature (1.0) provides variation. Prompt says "vary your technique choice on regeneration." |

## Security Notes (from Security Sentinel)

- All new data in the prompt is static (hardcoded in source), not user-controlled. No new attack surface.
- Existing `sanitize()` covers user-controlled fields in the prompt path.
- **Minor hardening:** Consider replacing `\s` with literal space in `sanitize()` regex to block newline injection (important if bean data ever becomes shared).
- The `reasoning` field is displayed via React JSX (auto-escapes, no XSS risk). No `dangerouslySetInnerHTML` anywhere in the codebase.

## Performance Notes (from Performance Oracle)

- Prompt size with the new approach: ~2,000-2,400 tokens (from ~1,200). Well within GPT-5.4 limits.
- Injecting only the user's grinder saves ~150-300 tokens vs. all 6.
- Stripping French Press/AeroPress saves ~200 tokens.
- Two sequential API calls (research + recipe) unchanged at 4-10 seconds total.
- `reasoning` field adds ~30-50 response tokens (capped at 1-2 sentences).
- Bundle size impact: ~1-2KB unminified for new data structures. Negligible.

## Acceptance Criteria

- [ ] A light washed Ethiopian generates a different ratio, grind, and temp than a dark natural Brazilian
- [ ] Grind settings are within the documented pour-over range for the user's selected grinder (enforced by `repairHandBrewRecipe()`)
- [ ] Ratio varies between 1:15 and 1:18 depending on cup-structure family
- [ ] Water temperature varies inversely with roast level (light = hotter, dark = cooler)
- [ ] Bloom parameters adjust (light roasts get longer bloom, more water)
- [ ] The technique structure varies (not always 4-pour Hoffmann)
- [ ] Recipe includes a `reasoning` field explaining parameter choices (1-2 sentences)
- [ ] Degree symbol (°) renders correctly in HandBrewModal
- [ ] Regenerating a recipe produces meaningfully different results
- [ ] All grinder types in `GRINDER_LABELS` have corresponding pour-over start data
- [ ] "Other" grinder falls back to micron-only guidance
- [ ] `repairHandBrewRecipe()` clamps grind, ratio, and temp to valid ranges
- [ ] Grinder key stored alongside cached recipe

## Testing Approach

Generate recipes for these test beans and verify parameter variation:

1. **Light washed Ethiopian** (family: `washed-ethiopia-clarity`) -- ratio ~1:15.5, temp 97-100C, Ode Gen 2 ~4.0-4.5, likely Hedrick technique
2. **Dark natural Brazilian** (family: `dark-roast`) -- ratio ~1:17-1:18, temp 88-93C, Ode Gen 2 ~6.5-7.5, Hoffmann technique
3. **Medium honey Costa Rican** (family: `processed-clarity`) -- ratio ~1:15.5-1:16, temp 95-98C, Ode Gen 2 ~5.0-5.5
4. **Light natural Geisha** (family: `clean-natural-fruit`) -- ratio ~1:15, temp 95-98C, coarser grind than washed, Kasuya 4:6

Also test:
5. **"Other" grinder selected** -- recipe should use micron values, no grinder-specific setting
6. **Research failure** -- recipe still generates with `medium-washed` defaults
7. **Regenerate same bean** -- second recipe should differ from first

## Sources & References

### Research Files
- `~/Documents/Last30Days/fellow-ode-gen2-pour-over-grind-settings.md` -- Ode Gen 2 V60 range 2.2-5.2, ~25 microns/click
- `~/Documents/Last30Days/best-v60-pour-over-recipe-hoffmann-hedrick.md` -- Hoffmann, Hedrick 1-2-1, modern trends
- `~/Documents/Last30Days/tetsu-kasuya-4-6-method-pour-over.md` -- 4:6 method, 1:15, coarse grind, flavor tuning
- `~/Documents/Last30Days/pour-over-coffee-ratio-adjustment.md` -- Ratio/temp/grind by roast and process
- `~/Documents/Last30Days/fellow-aiden-opus-grind-settings-deep.md` -- Aiden grind comparison data

### Book
- `~/.claude/books/world-atlas-coffee.md` -- Hoffmann canonical methodology, 60g/L starting point, extraction science

### Codebase Patterns (from Pattern Recognition review)
- `src/lib/aiden.js` -- Reference architecture: `FAMILY_GRIND_BANDS`, `enforceDeterministicGrind()`, `repairRecipe()`, `classifyFamilyFallback()`, 10-item prompt checklist
- `src/lib/beanResearch.js:60` -- `cupStructureFamily` field (7 families)

### Learnings Applied
- `docs/solutions/security-issues/llm-prompt-sanitization-patterns.md` -- Sanitize at source, system prompt injection is higher impact
- `lessons.md` -- Always try/catch JSON.parse on LLM output, modal overlay pattern, single Firestore write per handler

### Web Sources
- Honest Coffee Guide (grind chart), Fellow Products (official ranges), Clive Coffee, Counter Culture, Coffee Chronicler, Philocoffea, Project Barista
