---
title: "Wire grind size display toggle and consolidate grinder label logic"
category: "logic-errors"
date: "2026-04-05"
severity: "low"
modules_affected:
  - "src/lib/brewMethods.js"
  - "src/components/HandBrewModal.jsx"
  - "src/components/AidenModal.jsx"
tags:
  - "grind-size"
  - "microns"
  - "settings-toggle"
  - "grinder-preference"
  - "duplication"
  - "consumer-launch-phase4"
related_plans:
  - "docs/plans/2026-04-04-005-feat-consumer-launch-master-plan.md"
related_docs:
  - "docs/solutions/database-issues/firestore-settings-phase2-write-patterns.md"
  - "docs/solutions/security-issues/llm-prompt-sanitization-patterns.md"
---

# Grind Size Display Toggle Unwired + Inconsistent Grinder Labels

## Problem

The Settings grind display toggle ("Grinder Steps" vs "Microns") was cosmetic only. Toggling `preferences.grindSizeDisplay` between `'default'` and `'microns'` changed nothing in the UI. Additionally:

1. `AidenModal.jsx` hardcoded "Ode Gen 2 Grind" regardless of the user's grinder preference
2. `brewMethods.js` fallback chain was `GRINDER_LABELS[key] || 'Grinder'`, missing the `grinderCustomName` fallback that modals had. Users with "other" grinder saw "Grinder" on bean cards but their custom name in modals.
3. `GRINDER_LABELS` was copy-pasted in 4 files with no single source of truth

## Root Cause

Phased feature rollout created a gap: Phase 2 built the Settings toggle, Phase 3 built hand brew recipes (which already included microns from GPT output), but Phase 4 (wiring the toggle to display logic) was deferred. The toggle existed in the preference store but no display component read it.

The fallback chain bug came from organic growth: each file that needed grinder names defined its own copy of `GRINDER_LABELS` with slightly different fallback logic.

## Solution

Three files changed:

### brewMethods.js: Centralize and export

Extracted `formatAidenGrind()` and `formatHandBrewGrind()` helpers. Exported `GRINDER_LABELS` as the single source of truth. Fixed fallback chain to include `grinderCustomName`:

```js
export const GRINDER_LABELS = { ... };

function formatHandBrewGrind(gs, preferences) {
  const useMicrons = preferences?.grindSizeDisplay === 'microns';
  const isOtherGrinder = !GRINDER_LABELS[preferences?.grinder];
  const grinderName = GRINDER_LABELS[preferences?.grinder]
    || preferences?.grinderCustomName || 'Grinder';

  if (useMicrons && gs.microns) {
    return isOtherGrinder
      ? `${gs.description}, ~${gs.microns}um`
      : `${grinderName}: ~${gs.microns}um`;
  }
  if (isOtherGrinder) {
    return `${gs.description}${gs.microns ? ` (~${gs.microns}um)` : ''}`;
  }
  return `${grinderName}: ${gs.setting} ${gs.description}`;
}
```

### HandBrewModal.jsx: Simplify grind card

Replaced branching JSX (two near-identical template blocks) with computed `primary`/`secondary` values:

```jsx
const isMicrons = preferences?.grindSizeDisplay === 'microns' && recipe.grindSize.microns;
const primary = isMicrons ? `~${recipe.grindSize.microns}um` : recipe.grindSize.setting;
const secondary = isMicrons
  ? (recipe.grindSize.setting ? `${grinderName}: ${recipe.grindSize.setting}` : null)
  : (recipe.grindSize.microns ? `~${recipe.grindSize.microns}um` : null);
```

Imported `GRINDER_LABELS` from `brewMethods.js` instead of local copy.

### AidenModal.jsx: Dynamic grinder name

Added `usePreferences` hook, imported `GRINDER_LABELS` from `brewMethods.js`, replaced hardcoded "Ode Gen 2 Grind" with `{grinderName} Grind`.

## Prevention Strategies

1. **Dead toggles**: When building a toggle before its wiring, add `// TODO(Phase N): wire to [component]` at the toggle site. During the wiring phase code review, grep for the preference key to confirm it's consumed by display components, not just written.

2. **Constant duplication**: Lookup maps used in 2+ files must live in a shared module and be imported. Code review check: if a PR introduces a constant that exists elsewhere, it should import rather than redefine.

3. **Fallback chain drift**: Define a single canonical fallback function for display names. When each file assembles its own fallback chain (`A || B || C`), they drift apart silently. One function, one place.

## Notes

- `handbrew.js` has its own `GRINDER_LABELS` with longer descriptions (grinder specs for GPT prompts). This is intentionally different from the display labels and should stay separate.
- The "other" grinder display path uses description + microns without a grinder-name prefix since there's no canonical short name to show.
