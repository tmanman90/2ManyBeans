---
title: "feat: Quick Recipe — Scan & Brew Without Inventory"
type: feat
status: active
date: 2026-04-07
origin: docs/brainstorms/2026-04-07-quick-recipe-requirements.md
---

# Quick Recipe: Scan & Brew Without Inventory

## Overview

Add a "Quick Recipe" button to the RotationTab header that lets users photograph a coffee bag, scan it with Gemini, and generate an Aiden brew recipe in one flow, without adding the bean to inventory. After the recipe is generated, optionally save to inventory as a full bean.

## Problem Statement

The only path to an Aiden recipe currently requires the full Add Bean flow (photos, scan, review, save, assign jar slot, then brew). For small samplers (e.g., 20g), this is too much friction. Users want the recipe without the inventory commitment. (see origin: `docs/brainstorms/2026-04-07-quick-recipe-requirements.md`)

## Proposed Solution

A self-contained modal flow triggered from a header icon on RotationTab. The flow captures one photo, scans via Gemini, enriches via search grounding, then runs the full Aiden pipeline (research, recipe, push). All data lives in component state. No Firestore writes unless the user explicitly saves.

### Key Technical Insight

`useAidenBrew` already supports ephemeral beans. All Firestore writes are guarded by `if (bean.id)` (`useAidenBrew.js:32,94`). Passing a bean object without an `id` field skips all persistence. `AidenModal` is purely presentational. This means the entire downstream pipeline works unchanged.

## Technical Approach

### Architecture

One new component (`QuickRecipeFlow`) and one small change to `RotationTab`. Everything else is reuse.

```
RotationTab (adds icon button)
  └─ QuickRecipeFlow (new modal component)
       ├─ Photo capture (reuses existing Camera/file input pattern)
       ├─ scanBeanLabel() + researchBeanOnline() (existing Gemini lib)
       ├─ useAidenBrew(noop) with ephemeral bean
       ├─ AidenModal (existing, unchanged)
       └─ "Save to Inventory" → AddBeanForm (pre-filled, review mode)
```

### Phase 1: Quick Recipe Flow

**Files to create:**
- `src/components/QuickRecipeFlow.jsx` — the new modal component

**Files to modify:**
- `src/tabs/RotationTab.jsx` — add icon button to header

#### QuickRecipeFlow Component

States: `idle` → `capturing` → `scanning` → `enriching` → `brewing` → `done`

```jsx
// src/components/QuickRecipeFlow.jsx
// 
// Props: { open, onClose, onSaveToInventory }
//
// Internal flow:
// 1. Photo capture (Camera.getPhoto on iOS, file input on web)
// 2. scanBeanLabel([photo]) → parsed bean fields
// 3. researchBeanOnline(scanData) → enriched fields
// 4. If no bagSize detected, show inline gram input before proceeding
// 5. Assemble ephemeral bean object (no id, no Firestore doc)
// 6. Call handleBrewWithAiden(ephemeralBean) from useAidenBrew
// 7. AidenModal shows progress (research → recipe → push)
// 8. On completion: show brew link + grind + "Save to Inventory" button
```

#### Ephemeral Bean Shape

```js
{
  // From Gemini scan + enrichment (no id = no Firestore writes)
  roaster: string,
  name: string,
  origin: string,
  process: string,
  variety: string,
  roastDate: string,        // ISO, from scan or today's date
  bagNotes: string,
  bagSize: string,           // e.g. "20g" — context for recipe
  // Enrichment fields (optional, filled by researchBeanOnline)
  altitude: string,
  region: string,
  farm: string,
  roastLevel: string,
  cupScore: string,
  brewingRec: string,
  producer: string,
  // No id, no status, no jarSlot, no photos array
}
```

#### RotationTab Header Change

```jsx
// src/tabs/RotationTab.jsx — add to the title row
<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
  <div style={sectionTitle}>Active Rotation</div>
  <button onClick={() => setQuickRecipeOpen(true)} style={quickRecipeButtonStyle}>
    {/* Camera or Zap icon */}
  </button>
</div>
```

#### Dose / Bag Size Handling

The Aiden recipe system generates its own ratio and dose internally based on bean profile. `bagSize` from scan serves as context (e.g., "only 20g available" signals single-serve only, no batch). If Gemini doesn't detect `bagSize`, show a simple inline input: "How many grams do you have?" before proceeding. This value is passed as `bagSize` on the ephemeral bean object. (see origin: R3)

#### Error Handling

- **Scan failure** (blurry photo, non-coffee, Gemini error): Show error message + "Retry Photo" button. Same pattern as AddBeanForm scan failures.
- **Aiden pipeline failure**: Handled by existing `useAidenBrew` error state + `AidenModal` retry buttons (onRetry, onRetryPush, onRegenerate). No new error handling needed.
- **Push failure**: Show recipe + grind recommendation anyway (useful even without the brew.link). Offer "Retry Push" via existing modal button.

### Phase 2: Save to Inventory

When the user taps "Save to Inventory" after a successful quick recipe:

1. Close the quick recipe modal
2. Open `AddBeanForm` in review mode, pre-filled with:
   - All scan + enrichment data
   - The generated `aidenRecipe` and `aidenLink`
   - The original photo
3. User reviews, picks a jar slot, and saves normally
4. On save, the bean is persisted to Firestore with the recipe already attached (no re-generation needed)

This reuses `AddBeanForm`'s existing review state. The form already supports receiving pre-filled data from the scan flow. Pass additional `aidenRecipe`, `aidenLink`, `aidenGrind` fields to be persisted alongside the bean. Professor Ruphus story and product photo generation trigger on save (existing behavior). (see origin: R6)

### Camera Pattern (reuse)

```js
// iOS native
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';

if (Capacitor.isNativePlatform()) {
  const image = await Camera.getPhoto({
    resultType: CameraResultType.DataUrl,
    source: CameraSource.Prompt,  // camera or library
    quality: 90,
  });
  // Extract base64 + mediaType from dataUrl
}

// Web fallback
// <input type="file" accept="image/*"> + compressImage(file)
```

Per lessons.md: always call `checkPermissions()` + `requestPermissions()` before `getPhoto()` on iOS.

## Acceptance Criteria

- [ ] Camera/zap icon button appears in RotationTab header, right of "Active Rotation"
- [ ] Tapping opens photo capture (camera prompt on iOS, file input on web)
- [ ] Single photo scans via Gemini + search grounding enrichment
- [ ] If no bagSize detected, user is prompted for grams
- [ ] Full Aiden pipeline runs (research → recipe → push) with progress phases shown
- [ ] Brew link + grind recommendation displayed on completion
- [ ] "Save to Inventory" button present after recipe completion
- [ ] Saving opens AddBeanForm pre-filled with scan data + recipe (no re-scan)
- [ ] Dismissing without saving leaves no Firestore data
- [ ] Scan failure shows error + retry photo option
- [ ] Push failure shows recipe + grind anyway, with retry push option

## Scope Boundaries (from origin)

- Single photo only (not multi-photo gallery)
- No tasting log for quick recipes unless saved to inventory
- No standalone "Quick Brews" history
- Professor Ruphus story + product photo only trigger on save to inventory

## Key Decisions (carried from origin)

- **Ephemeral by default**: No `id` on bean object = no Firestore writes via existing guards
- **Header placement**: Compact icon right of title, no layout disruption
- **Bag size as dose context**: Passed to recipe generation, not a literal brew dose
- **Full enrichment kept**: Search grounding runs for recipe quality (a few seconds, worth it)
- **Reuse over rebuild**: AidenModal, useAidenBrew, AddBeanForm all used as-is

## Sources

- **Origin document:** [docs/brainstorms/2026-04-07-quick-recipe-requirements.md](docs/brainstorms/2026-04-07-quick-recipe-requirements.md) — key decisions: ephemeral-first, header placement, bag-size dose, single photo
- Existing patterns: `src/components/AddBeanForm.jsx:52-164` (photo + scan flow), `src/hooks/useAidenBrew.js:32,94` (ephemeral bean guards)
- Learnings: `lessons.md` — iOS camera plist permissions, JSON.parse safety on LLM output
