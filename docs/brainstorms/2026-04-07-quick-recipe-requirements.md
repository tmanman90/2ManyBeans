---
date: 2026-04-07
topic: quick-recipe
---

# Quick Recipe: Scan & Brew Without Inventory

## Problem Frame
Tal frequently receives small coffee samplers (e.g., 20g) that aren't worth adding to full inventory rotation, but he still wants an Aiden brew recipe tuned to the specific bean. Currently the only path to an Aiden recipe requires adding a bean to inventory, assigning a jar slot, and going through the full Add Bean flow. This creates friction that discourages brewing samplers.

## Requirements

- R1. **Quick Recipe button** on RotationTab header, to the right of "Active Rotation" title. Small icon button (camera or zap icon) that launches the quick recipe flow.
- R2. **Photo scan flow**: Opens camera (native on iOS, file input on web), captures 1 photo, runs Gemini scan + search grounding enrichment (same pipeline as AddBeanForm but single-photo only).
- R3. **Dose detection**: Use `bagSize` from scan results as the dose. If scan doesn't detect bag size, prompt user for grams before recipe generation.
- R4. **Aiden recipe pipeline**: Run the full research > recipe > push flow (researchBean, generateAidenRecipe, pushToAiden) using scan data as the bean context. Show progress phases in a modal (reuse or adapt AidenModal UX).
- R5. **Brew link delivery**: Display the Aiden brew link and grind recommendation, same as current AidenModal completion state.
- R6. **Offer to save**: After recipe is generated, offer a "Save to Inventory" action that promotes the scanned data into a full bean entry (triggers the existing Add Bean review/save flow, pre-filled with scan data + recipe).
- R7. **Dismissable**: User can close the modal at any point after the brew link is shown without saving. Data is discarded.

## Success Criteria
- A user can go from photo to Aiden brew link in one flow without touching inventory
- Samplers and one-off beans get the same recipe quality as inventory beans
- No orphaned data in Firestore if the user dismisses without saving

## Scope Boundaries
- Single photo only (not multi-photo gallery). Keeps the flow fast.
- No tasting log integration for quick recipes unless saved to inventory.
- No standalone "Quick Brews" history. Either save as full bean or discard.
- Professor Ruphus story and product photo generation only trigger if user saves to inventory.

## Key Decisions
- **Ephemeral by default, save optional**: Quick recipe data lives only in component state until explicitly saved. Avoids Firestore clutter from samplers.
- **Placement in header bar**: Compact, always visible, doesn't disrupt rotation card layout.
- **Bag size as dose source**: Leverages existing Gemini scan field. Fallback prompt only when scan misses it.
- **Single photo**: Samplers usually have one label. Keeps the flow minimal.

## Outstanding Questions

### Deferred to Planning
- [Affects R4][Technical] Can AidenModal be reused directly with a "virtual" bean object (not persisted), or does it need a parallel component?
- [Affects R6][Technical] Best UX for the "Save to Inventory" transition: navigate to AddBeanForm in review mode, or inline save with auto-assigned jar slot?
- [Affects R2][Technical] Should the quick scan skip search grounding enrichment to be faster, or keep it for recipe quality?

## Next Steps
→ `/ce:plan` for structured implementation planning
