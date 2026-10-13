# U1 independent correctness review

Disposition after source recheck: **all three reported U1 findings resolved; no remaining concrete regression found in this bounded recheck**. U1 browser/integration acceptance remains pending. Reviewed the source diff against `58d1643`, U1/R1/R3/R5/KTD1 and E01/E04. Source inspection only; no tests, build, browser, server, model calls, commits or external messages were run. Only this report was written.

## Fix recheck

- **Finding 1 resolved in source.** `src/components/BeanDetailCard.jsx:726` now calls `hasSavedBrewProfile`, whose implementation (`src/lib/brewMethods.js:308`) depends only on the archive flag and stored recipes. The inner hand-brew recap at `BeanDetailCard.jsx:741` also no longer checks current preference. An Aiden preference therefore no longer suppresses the stored hand-brew recap.
- **Finding 2 resolved in source.** Machine and basket handlers at `src/components/onboarding/screens/R07Preferences.jsx:101–108` clear confirmation; both selectors use those handlers. `changesEspressoEquipmentIdentity` returns true for both keys. Changing away and back now leaves confirmation false until explicitly checked.
- **Finding 3 resolved in source.** `src/components/BrewMethodMenu.jsx:115` renders a native `button type="button"` with an accessible name and the existing click callback. Native focus and Enter/Space activation address the reported row defect. Overall menu opening/focus behavior still requires interaction verification.

The added helper tests are narrow. The archive test does not render the card or transition preferences; equipment helper assertions do not execute onboarding handlers. No full path proof is claimed from them, and this reviewer did not run them.

## Original findings (resolved)

1. **P2 — Archive hides existing hand-brew recaps for Aiden users.** `src/components/BeanDetailCard.jsx:727` and `:742`. Trigger: a finished bean has `handBrewRecipe`; the current preference is Aiden; open its card in Archive (`src/tabs/ArchiveTab.jsx:442` passes `showBrewProfile`). Previously the stored recap appeared regardless of current method. The new `isManualBrew` guard suppresses that recap, or the entire profile when no Aiden recipe exists. Current preference should not change historical recipe visibility. Smallest fix: preserve archive rendering based on stored recipe presence; keep the separate active-method grind-label behavior. Confidence: 100.

2. **P2 — Onboarding confirmation survives machine/basket changes.** `src/components/onboarding/screens/R07Preferences.jsx:233–236`. Trigger: choose the supported machine/basket, check confirmation, select a different basket or unknown machine, then return to the supported selection. Both select handlers retain `espressoSetupConfirmed`; the restored checkbox is already checked and Continue persists confirmation without reconfirming the restored setup. Settings correctly resets confirmation on the same transitions. Smallest fix: reset confirmation to false whenever either equipment selector changes. Confidence: 100 for the state trace; 75 for the requirement impact.

3. **P2 — New Espresso menu action is inaccessible by keyboard.** `src/components/BrewMethodMenu.jsx:115–120`. Trigger: open the method menu by touch, then navigate with a keyboard or assistive technology. The Espresso action is a plain `div` with only `onClick`, no focusability, button semantics or keyboard handler. It cannot receive Tab focus or activate with Enter/Space. Smallest fix: render a native `button` with the existing row appearance. Existing menu actions use the same pattern, but this new action independently inherits the defect. Confidence: 100 for keyboard behavior from the rendered element contract.

## Integration gates and proof limits

- Rotation, Inventory, Chat recipe actions and post-scan Quick Recipe now explicitly classify Espresso; source inspection found no remaining Espresso-to-hand-brew recipe request in those changed entry points. This is a bounded source conclusion, not browser PASS.
- Temporary toasts and the Quick Recipe placeholder remain U2 integration gates. Confirmed equipment currently receives the same placeholder limitation as unconfirmed equipment. U1 wiring does not establish completed Espresso recipe behavior.
- U3 must address the live legacy chat context before product acceptance: `src/lib/claude.js:35` validates methods without Espresso; `buildChatContext` continues selecting an existing brewer/grinder and ignores the independent espresso equipment fields. This is a dependent chat integration gate; no model behavior was tested or inferred.
- Grinder changes currently clear the incompatible model/name field and preserve the standalone `grinder` preference. There is no Espresso recipe/settings cache yet to prove E04 recipe invalidation; exact setup identity and invalidation remain U2/U3 acceptance gates.
- The current test file checks registry/setup eligibility, helper output and source patterns; it does not execute settings/onboarding persistence, confirmation transitions, archive rendering, keyboard access, or post-scan routing. Those paths require focused interaction checks and the planned browser smoke before final acceptance.
- At initial review, root reported a separate scoped lint failure (`RotationTab.jsx:96`, `setToast` used before its declaration) and the missing registry icon asset. Their current check disposition belongs in root's verification record; this bounded recheck did not rerun them.

No source was changed. The report is the only artifact created by this review.
