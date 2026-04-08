---
date: 2026-04-08
topic: quick-recipe-enhancements
---

# Quick Recipe Enhancements: Brew Toggle, Tasting, and Learn

## Problem Frame
Quick Recipe shipped as a scan-to-Aiden-recipe flow. It works, but it's a dead end: you get the recipe and that's it. For samplers, you often want to also try a hand pour, rate what you tasted, or learn about the bean's origin. Right now those actions all require saving to inventory first and navigating to separate flows. These enhancements turn Quick Recipe into a complete mini-session: scan, brew (either method), taste, learn, done.

## Requirements

- R1. **"Quick Recipe" button label**: Replace the camera icon button in the RotationTab header with a wider button that says "Quick Recipe" (with camera icon). Still positioned to the right of "Active Rotation" title.
- R2. **Brew method toggle**: After recipe generation, the default recipe matches the user's brew method preference. If default is Aiden, show an Aiden recipe with a button to also get a hand brew recipe. If default is hand brew, show a hand brew recipe with a button to also get an Aiden recipe. Both recipes use the same scanned bean data.
- R3. **Quick Rate button**: On the recipe result screen, a "Quick Rate" button that lets the user assign a star rating and optional note. Auto-saves the bean to inventory (SEALED, no jar slot) before creating the tasting entry. Brief toast confirms save.
- R4. **Ruphus Tasting button**: On the recipe result screen, a "Tasting with Ruphus" button that launches the coached tasting flow (Professor Ruphus chat). Auto-saves the bean to inventory (same as R3) before launching.
- R5. **Learn button**: On the recipe result screen, a "Learn" button that triggers the Professor Ruphus story/learn flow for the scanned bean. This can work ephemerally (story displays but doesn't persist) since the user just wants to read about the bean.
- R6. **Auto-save on tasting**: When a user taps Quick Rate or Ruphus Tasting, the bean is silently saved to inventory as SEALED with no jar slot assigned. A toast confirms: "[Bean name] saved to inventory." The tasting is then linked to the saved bean's ID.

## Success Criteria
- User can scan a sampler and complete a full session (brew recipe + taste + learn) without manually managing inventory
- Brew method toggle respects user's default preference and offers the alternative
- Tasting data is properly linked to a real bean in Firestore
- No extra taps or confirmation dialogs for auto-save (silent, with toast)

## Scope Boundaries
- No changes to the photo scan or enrichment flow (R2-R7 from original requirements still apply as-is)
- No "Quick Brews" history or separate tracking for quick recipes
- Auto-save creates a SEALED bean, not ACTIVE (no jar slot assignment)
- The "Save to Inventory" button from v1 remains as an explicit promotion path (for users who want to assign a jar slot / go through full review)

## Key Decisions
- **Auto-save on tasting, not on recipe**: Getting a recipe is ephemeral, but logging a tasting requires persistence. Auto-save only triggers when the user takes an action that needs a real bean.
- **Both tasting options**: Quick Rate for speed, Ruphus Tasting for depth. Samplers often warrant just a quick star, but some interesting beans deserve the full coached experience.
- **Brew toggle, not brew picker**: Two methods only (Aiden vs hand brew). Default to preference, one-tap to get the other. Not a dropdown or menu.
- **Learn is ephemeral**: Professor Ruphus story displays but doesn't persist unless the bean is saved. Reading about a bean doesn't imply you want to keep it.

## Dependencies / Assumptions
- User has `preferences.brewMethod` set (defaults to Aiden if unset)
- `useHandBrew` hook works with ephemeral beans the same way `useAidenBrew` does (needs verification during planning)
- Professor Ruphus `handleLearn` can accept an ephemeral bean object

## Outstanding Questions

### Deferred to Planning
- [Affects R2][Technical] Does `useHandBrew` support ephemeral beans (no `id` field), or does it need the same guard pattern as `useAidenBrew`?
- [Affects R5][Technical] Does `useProfessorRuphus.handleLearn` work with an ephemeral bean, or does it require `updateBean` to persist the story?
- [Affects R3/R4][Technical] Best approach for auto-save: call `addBean` inline before creating the tasting, or create a helper that chains save + tasting creation?

## Next Steps
-> `/ce:plan` for structured implementation planning
