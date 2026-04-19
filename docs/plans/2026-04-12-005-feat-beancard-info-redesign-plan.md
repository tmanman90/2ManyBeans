---
title: "feat: BeanCard info section redesign"
type: feat
status: active
date: 2026-04-12
origin: docs/brainstorms/2026-04-12-beancard-info-redesign-requirements.md
---

## Enhancement Summary

**Deepened on:** 2026-04-12
**Sections enhanced:** 5
**Research agents used:** Performance Oracle, Code Simplicity Reviewer, iOS Design Patterns, Best Practices Researcher

### Key Improvements
1. Labels bumped from 10px to 11px for iPhone SE readability
2. CSS `-webkit-line-clamp` for notes truncation (zero JS cost, native iOS)
3. Animated expand/collapse with `max-height` transition + chevron indicator
4. Badge overlay uses solid bg without box-shadow (scroll perf)
5. notesSummary writes async after save (never blocks UX)

### Research-Driven Additions
- `aria-expanded` + `aria-controls` on Show Details toggle (WCAG disclosure)
- Store `grindLabel` result in local variable (avoid double-call)
- One grid template with conditional cells (not two separate grid definitions)
- CSS-only truncation on bean name and subtitle to prevent layout push

---

# BeanCard Info Section Redesign

## Overview

Redesign the BeanCard info section from a dense inline metadata dump into a structured specs grid with clear visual hierarchy. Inspired by the Stitch Ghibli redesign mockup: peak badge overlays the product shot, bean name is more prominent, key specs display in a 2-column grid with tiny uppercase labels, and secondary data moves behind "Show details."

## Proposed Solution

Replace the current inline metadata line, emoji-prefixed rows, and dot separators with a clean 2-column CSS grid. Move the peak/frozen badge from inline to a photo overlay chip. Push secondary data into the expandable details section.

### Card Layout (Full Mode, Rotation)

```
+------------------------------------------+
|  [Product Shot Photo]                     |
|  [Peak/Frozen Badge overlay, top-left]    |
+------------------------------------------+
|  Bean Name (20px, Playfair)    [icons]    |
|  Roaster   Origin                         |
|                                           |
|  REGION          PROCESS                  |
|  Yirgacheffe     Washed                   |
|                                           |
|  ROAST DATE      WEIGHT                   |
|  2026-02-17      250g                     |
|                                           |
|  NOTES           GRIND                    |
|  Jasmine, peach  Ode Gen 2: SS 4.2       |
|                                           |
|  Show details                             |
|  [Brew with Aiden] [Return] [Finish Bag]  |
+------------------------------------------+
```

### Card Layout (Compact Mode, Inventory)

```
+------------------------------------------+
|  [Product Shot Photo (shorter)]           |
|  [Peak/Frozen Badge overlay]              |
+------------------------------------------+
|  Bean Name (17px)              [icons]    |
|  Roaster   Origin                         |
|                                           |
|  REGION          PROCESS                  |
|  Yirgacheffe     Washed                   |
|                                           |
|  ROAST DATE      NOTES                    |
|  2026-02-17      Jasmine, peach           |
|                                           |
|  Show details                             |
|  [Open] [Brew] [Finish]                   |
+------------------------------------------+
```

## Acceptance Criteria

### Phase 1: BeanCard Grid Redesign

- [ ] **R1/R2 Photo overlay badge**: Peak badge renders as absolute-positioned chip on photo (top-left, 8px inset). When frozen, frozen badge replaces peak badge (only one shows). Falls back to inline next to icon buttons when no photo exists.
  - Badge overlay styling: existing Badge pill + `position: absolute`, slight background opacity for readability over photos. Do NOT use `rgba(0,0,0,...)` for any overlay (use warm brown per convention).

- [ ] **R3 Bean name prominence**: Font size 20px full / 17px compact (up from 18/16). Keep `lineHeight: 1.2`.

- [ ] **R4 Subtitle cleanup**: `Roaster   Origin` with `gap: 8` flex spacing. No dot separator.

- [ ] **R5/R6 Specs grid (full mode)**: 2-column CSS grid (`gridTemplateColumns: '1fr 1fr'`, `gap: 8` per codebase convention).
  - Row 1: REGION | PROCESS
  - Row 2: ROAST DATE | WEIGHT
  - Row 3: NOTES | GRIND
  - Labels: 11px, fontWeight 700, `C.textLight`, uppercase, `letterSpacing: 0.5` (11px minimum for iPhone SE readability)
  - Values: 13px, `C.text`

- [ ] **R7 Notes cell**: Display `bean.notesSummary` if available. Fallback: CSS `-webkit-line-clamp: 1` on `bean.bagNotes` (zero JS cost, native iOS truncation). Full notes in Show Details. Skip display for `'(not logged)'` sentinel.

- [ ] **R8 Empty handling**: Show "--" placeholder for single empty cells. Skip entire row if both cells are empty.

- [ ] **R9/R10 Compact grid**: Only 4 cells: REGION | PROCESS, ROAST DATE | NOTES. Tighter gap (6px). No WEIGHT or GRIND cells.

- [ ] **R13 Show Details expansion**: Move all secondary data here:
  - Variety, Process type details
  - Post-roast days, Days open
  - Frozen details (date, total days)
  - Farm, Altitude, Roast Level, Cup Score
  - Roasted In, Sourced By
  - Brewing Rec
  - Last brew recipe (show whichever matches current brew method: Aiden recipe for Aiden users, hand brew recipe for hand brew users)
  - Remove Region from Show Details (already in grid, avoid duplication)

- [ ] **R14/R15 Cleanup**: Remove all emoji prefixes. Remove dot separators in BeanCard, use gap spacing.

- [ ] **GRIND cell overflow**: Store `brewMethod.grindLabel(bean, preferences)` in a local variable (avoid double-call). Allow text to wrap within the cell.

- [ ] **Icon buttons**: Preserve existing padding (2px learn, 4px freeze/edit). NO minWidth/minHeight (documented lesson).

- [ ] **Show Details animation**: Animate expand/collapse with `max-height` (300px cap) + `opacity` transition (250ms ease-out). Add `ChevronDown` icon that rotates 180deg on expand. Add `aria-expanded` + `aria-controls` for WCAG accessibility.

- [ ] **Text truncation**: Apply CSS `overflow: hidden; white-space: nowrap; text-overflow: ellipsis` to bean name and subtitle to prevent layout push on long names.

- [ ] **Badge overlay**: Use solid Badge bg (from peak status colors), no `box-shadow` on photo-overlay variant (scroll performance). Position with `position: absolute; top: 10px; left: 10px; zIndex: 2` inside the existing photo container.

### Phase 2: Note Summarization

- [ ] **R11 Generate notesSummary at save time**: In AddBeanForm `handleSave` (line 367-380 area), after building `beanData`, call Gemini Flash (`callGemini` with `metered: false`) to summarize `bagNotes` into ~40 chars. Store as `notesSummary` field in beanData. Skip if bagNotes is empty or `'(not logged)'`.
  - Prompt: "Summarize these coffee tasting notes into a short phrase (under 40 characters): {bagNotes}"
  - Model: `gemini-2.5-flash` (cheapest, no quota impact with `metered: false`)
  - Do NOT block save UX: generate async, write via `updateBean(beanId, { notesSummary })` after save completes.

- [ ] **R11b Regenerate on edit**: In EditBeanModal, when bagNotes changes on save, regenerate notesSummary with the same flow.

- [ ] **R12 Fallback**: Beans without notesSummary truncate bagNotes at ~40 chars + ellipsis.

## Technical Considerations

### Files to modify

| File | Changes |
|------|---------|
| `src/components/BeanCard.jsx` | Main redesign: photo overlay badge, specs grid, details reorganization, emoji/separator cleanup |
| `src/components/AddBeanForm.jsx` | Add notesSummary generation after save (~line 420) |
| `src/components/EditBeanModal.jsx` | Regenerate notesSummary when bagNotes changes |
| `src/lib/gemini.js` | Add `summarizeNotes(bagNotes)` helper function |

### Patterns to follow

- CSS grid: `gridTemplateColumns: '1fr 1fr'`, `gap: 8` (matches AddBeanForm, EditBeanModal, AidenModal patterns)
- Inline styles throughout (no CSS modules, consistent with codebase)
- `callGemini()` with `metered: false` for summarization (no free-tier quota impact)
- Badge component for overlay: reuse existing `Badge` with absolute positioning wrapper

### Edge cases

- Bean with no photo: badge falls back to inline in header row (same as current behavior)
- Bean with no bagNotes: NOTES cell shows "--"
- Bean with very long grind label: wraps within grid cell
- Frozen bean: frozen badge replaces peak badge, not alongside it
- Both cells in a row empty: skip the entire row
- notesSummary generation fails: silently falls back to truncated bagNotes (R12)

## Scope Boundaries

- BeanCard.jsx only. ArchiveTab, ShareCard, recommendation cards keep their current formatting.
- No changes to photo area (gradient blending stays as-is)
- No changes to action buttons layout
- notesSummary backfill for existing beans is deferred (populate organically as beans are edited/re-scanned)

## Success Criteria

- Cards look clean and structured at both Rotation (full) and Inventory (compact) sizes
- Key info (region, process, roast date, weight, notes, grind) scannable at a glance
- No information lost, just reorganized between grid and Show Details
- Peak/frozen badge on the photo feels polished
- No visual regression on iPhone SE through 16 Pro Max

## Sources & References

- **Origin document:** [docs/brainstorms/2026-04-12-beancard-info-redesign-requirements.md](docs/brainstorms/2026-04-12-beancard-info-redesign-requirements.md) -- Key decisions: region first, process over variety, post-roast in details, frozen replaces peak, notesSummary at save time
- BeanCard component: `src/components/BeanCard.jsx`
- Grid pattern reference: `src/components/AddBeanForm.jsx:704`
- Badge component: `src/components/Badge.jsx`
- Peak status: `src/lib/peakStatus.js:28-46`
- Grind label: `src/lib/brewMethods.js:20-65`
- Gemini helper: `src/lib/gemini.js:7-16`
- Icon button lesson: `lessons.md:42` (NO minWidth/minHeight)
- Overlay color convention: `rgba(44,24,16, 0.4)` + blur, never `rgba(0,0,0,...)`
