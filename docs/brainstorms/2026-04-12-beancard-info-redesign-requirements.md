---
date: 2026-04-12
topic: beancard-info-redesign
---

# BeanCard Info Section Redesign

## Problem Frame

The BeanCard info section is dense and visually noisy: inline metadata chains with dot separators, emoji prefixes, and a flat info dump. Inspired by the Stitch Ghibli redesign mockup, the card needs a cleaner structured layout with better visual hierarchy, a specs grid, and a clear separation between primary and secondary data.

## Requirements

### Photo Overlay Badges
- R1. Peak status badge renders as a chip overlaying the product shot photo (top-left). Falls back to inline position next to icon buttons when no photo exists.
- R2. When frozen, a frozen badge (blue, shows days frozen) REPLACES the peak badge on the photo overlay. Only one status badge shows at a time: frozen takes priority. Falls back to inline when no photo.

### Header
- R3. Bean name font size increases to 20px (full mode) / 17px (compact mode) for more prominence.
- R4. Subtitle shows Roaster and Origin separated by gap spacing, no dot separators.

### Specs Grid (Full Mode)
- R5. 2-column grid with tiny uppercase labels (10px, bold, muted) above values (13px, regular).
- R6. Grid cells in order:
  - Row 1: REGION | PROCESS
  - Row 2: ROAST DATE | WEIGHT
  - Row 3: NOTES | GRIND
- R7. Notes cell displays a `notesSummary` field (short phrase, ~40 chars max). Full `bagNotes` visible in Show Details.
- R8. Empty cells show a placeholder dash ("--"). If both cells in a row are empty, skip the entire row.

### Specs Grid (Compact Mode, Inventory)
- R9. Compact mode shows only 4 cells: REGION, PROCESS, ROAST DATE, NOTES. No weight or grind.
- R10. Compact mode uses tighter spacing (smaller gaps, same label/value pattern).

### Note Summarization
- R11. At bean scan/save time, generate a `notesSummary` field from `bagNotes` using the cheapest available model. Store alongside `bagNotes` in Firestore.
- R12. Existing beans without `notesSummary` display truncated `bagNotes` (~40 chars + ellipsis) as fallback.

### Show Details (Expanded Section)
- R13. All secondary data moves behind "Show details" toggle: Variety, Post-roast days, Days open, Frozen details, Region (if already shown), Farm, Altitude, Roast Level, Cup Score, Roasted In, Sourced By, Brewing Rec, Last brew recipe.

### Cleanup
- R14. Remove all emoji prefixes (no more coffee cup or gear icons before text).
- R15. Remove all dot separators from metadata lines. Use gap spacing.

## Success Criteria

- Cards look clean and structured at both Rotation (full) and Inventory (compact) sizes
- Key info (region, process, roast date, weight, notes, grind) is scannable at a glance
- No information is lost, just reorganized between primary grid and Show Details
- Peak and frozen badges on the photo feel like the Stitch reference

## Scope Boundaries

- No changes to the photo area itself (gradient blending stays as-is)
- No changes to action buttons layout
- No changes to ArchiveTab's inline image component (it has its own layout)
- Note summarization is a new stored field, not a prompt rewrite of existing scan flow
- This is BeanCard only. EditBeanModal photo treatment was already handled separately.

## Key Decisions

- **Region first**: Region is the most important spec for specialty coffee identification, goes top-left.
- **Process over variety in primary view**: Process affects flavor more immediately. Variety moves to details.
- **Post-roast days in details, not grid**: Roast date is sufficient at a glance. Days calculation is secondary.
- **Stored notesSummary**: Summarize at save time, not render time. Zero runtime cost.
- **Frozen replaces peak badge**: Only one status badge at a time. Frozen takes priority over peak when active.
- **Compact shows fewer cells**: Region, Process, Roast Date, Notes only. Keeps inventory cards tight.
- **Hybrid empty handling**: Placeholder "--" for single empty cells, skip row if both are empty.

## Dependencies / Assumptions

- `notesSummary` field needs to be generated during the AddBeanForm save flow (scan path and manual entry path)
- Cheapest model for summarization (Haiku 4.5 or GPT-5.4 Mini)
- Existing beans will show truncated bagNotes until re-scanned or a backfill runs

## Outstanding Questions

### Deferred to Planning
- [Affects R11][Technical] Which model endpoint to use for note summarization and where to call it in the save flow
- [Affects R11][Needs research] Whether to backfill notesSummary for existing beans or let it populate organically

## Next Steps

-> `/ce:plan` for structured implementation planning
