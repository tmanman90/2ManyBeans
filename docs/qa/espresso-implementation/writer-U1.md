# U1 writer evidence — equipment and brew entry points

## Scope

U1 from `docs/plans/2026-10-12-0920-feat-barista-express-espresso-plan.md`: add an explicit espresso category and independently persisted machine, basket, and espresso grinder setup; keep existing Aiden/manual routing isolated; surface unsupported or unconfirmed Barista Express equipment without borrowing pour-over guidance.

## Evidence strategy

Proof-first focused contract in `scripts/espresso-equipment-routing.test.mjs`. The initial run was intentionally before implementation and failed because `brewMethods.js` did not export the espresso equipment/routing contract. Its wrapper printed `fresh_idle_percent=34.74`, but that first wrapper used the inverse of `top`'s idle field; the numeric label is therefore not trusted. The red result is retained as a characterization signal only. The passing run below uses the corrected idle-field read.

## Changed files

- `src/lib/brewMethods.js`
- `src/hooks/useUserProfile.jsx`
- `src/components/SettingsPage.jsx`
- `src/components/onboarding/screens/R07Preferences.jsx`
- `src/components/BeanCard.jsx`
- `src/components/BeanDetailCard.jsx`
- `src/components/BrewButton.jsx`
- `src/components/BrewMethodMenu.jsx`
- `src/components/QuickRecipeFlow.jsx`
- `src/tabs/RotationTab.jsx`
- `src/tabs/InventoryTab.jsx`
- `src/tabs/ChatTab.jsx`
- `src/hooks/useHandBrew.js`
- `scripts/espresso-equipment-routing.test.mjs`

## Verification

Revision after root U1 review:

- `fresh_idle_percent=57.22 ./node_modules/.bin/eslint src/lib/brewMethods.js src/hooks/useUserProfile.jsx src/hooks/useHandBrew.js src/components/BeanCard.jsx src/components/BeanDetailCard.jsx src/components/BrewButton.jsx src/components/BrewMethodMenu.jsx src/components/QuickRecipeFlow.jsx src/components/SettingsPage.jsx src/components/onboarding/screens/R07Preferences.jsx src/tabs/RotationTab.jsx src/tabs/InventoryTab.jsx src/tabs/ChatTab.jsx` — passed with no diagnostics.
- `fresh_idle_percent=55.90 node --test scripts/espresso-equipment-routing.test.mjs` — 4 tests passed, 0 failed.
- `git diff --check` — passed.

The added regressions exercise the saved archive profile predicate independently of current preference, setup eligibility/confirmation transitions, and category routing. No build, dev server, simulator, or broad suite was run for this unit.

## Open boundary

The setup defaults to unknown machine/basket and `espressoSetupConfirmed: false`. The verified numeric recipe path must use `isSupportedEspressoSetup()` and remain unavailable until the user confirms the standard Barista Express and stock double single-wall basket. U2 owns the recipe hook/modal that consumes this gate.

## Root review fixes

- Restored archived `handBrewRecipe` visibility based on saved recipe presence, even when the current preference is Aiden or Espresso; espresso-specific profile rendering remains U2 scope.
- Cleared `espressoSetupConfirmed` on every machine or basket change in onboarding and Settings, including changing away and back.
- Replaced the espresso menu row with a native keyboard-accessible button retaining the shared 44px row target.
- Moved Rotation toast state above the attempt effect, removed the unnecessary BrewButton dependency, and removed the absent espresso raster reference in favor of the existing Lucide icon strategy.
