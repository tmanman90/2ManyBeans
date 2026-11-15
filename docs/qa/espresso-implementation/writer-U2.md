# Espresso implementation writer U2

Status: concrete U2 source/persistence/UI integration delivered; root review and emulator endpoint verification remain.

## Scope completed

- Added the espresso recipe contract in `src/lib/espressoRecipes.js`: explicit Barista Express + stock double confirmation, independent grinder identity, setup fingerprinting, dose/output mass targets, ratio validation, explicit machine-start-to-stop timing basis, provenance, saved recipe precedence, and fail-closed unsupported setup behavior.
- Added stale request protection and direct editing/save/guarded undo in `src/hooks/useEspressoBrew.js` and `src/components/EspressoModal.jsx`. Dose edits stay in 16–19g at 0.1g; output edits recalculate ratio; no water-input or timer/shot-log fields are emitted.
- Added `espresso` as an owner-scoped Ruphus recipe slot. Existing command service revision, owner, idempotency, stale expected-revision, and undo machinery now projects `espressoRecipe` without weakening legacy hand-brew/Aiden guards. Client protected update routing includes the espresso slot.
- Replaced U1 placeholder entry paths in Rotation, Inventory, Chat, and Quick Recipe post-scan with the real espresso hook/modal. Archived Bean Detail recap now displays an independently saved espresso profile. Onboarding replay preserves explicit null for newly introduced espresso equipment fields, so unknown selections clear older values.

## Verification

Fresh CPU idle was above 40% for each focused run.

```text
node scripts/espresso-recipe.test.mjs
espresso recipe tests: 16 passed

node scripts/espresso-command.test.mjs
espresso command tests: 8 passed

npx eslint src/tabs/ChatTab.jsx src/components/QuickRecipeFlow.jsx src/tabs/RotationTab.jsx src/tabs/InventoryTab.jsx src/components/EspressoModal.jsx src/hooks/useEspressoBrew.js src/lib/espressoRecipes.js src/lib/brewMethods.js src/lib/recipeCommands.js src/lib/ruphus/contracts.js src/lib/ruphus/legacyRecipeResolver.js api/_lib/ruphusCommandService.js src/components/onboarding/OnboardingFlow.jsx src/components/onboarding/screens/R07Preferences.jsx src/hooks/useUserProfile.jsx src/components/BeanDetailCard.jsx
clean

git diff --check
clean
```

The recipe test exercises roast-specific dose/yield baselines, explicit unknown roast fallback, filter-only evidence rejection, saved recipe priority, setup-change cache isolation, mass edits, bounds, and water-field rejection. The command test exercises owner scoping, first save, duplicate action replay, idempotency conflict, expected-revision stale rejection, guarded undo, and restored prior recipe.

## Remaining U2 review/integration limits

- No paid provider generation was called. U2 uses the approved deterministic baseline and explicit verified-roaster envelope; root owns the later 12x3 real endpoint/model harness.
- The focused command proof uses `createMemoryCommandStore`; root should run the already prepared Firebase/Auth emulator endpoint proof for direct save, wrong owner, stale, duplicate, and undo.
- Full build, dev server, simulator, and long suites were not started under the shared heavy-job rule. Root owns canonical build and final route verification.

## U2 correction pass

The emulator review found five server-side acceptance gaps and lifecycle/cache risks. The correction pass now:

- requires the patch projection to be exactly the validated `espressoRecipe` snapshot, binds bean identity and setup fingerprint, rejects observed-shot/arbitrary fields, and validates the owner profile's confirmed setup inside the Firestore transaction;
- exposes first-save guarded Undo through the receipt, while retaining revision and absence-hash protection;
- keeps a valid saved user recipe across refresh/regeneration and preserves original provenance separately from user overrides;
- requires an exact-bean, espresso-method, gram-unit, setup-bound roaster envelope;
- resets hook mounted state under StrictMode, invalidates late operations after close/setup changes, and uses stable action IDs for retry after an unknown response;
- routes scanned no-ID recipe Save through inventory creation and records explicit grinder/temperature fields without inventing calibration.

The correction proof is covered by the added command assertions for first-save Undo, projection tampering, bean identity, observed fields, plus resolver assertions for saved-recipe refresh preservation and unsupported evidence.

## Correction pass 2 (write-only, pending root verification)

Applied the bounded reviewer/root corrections without running tests or heavy jobs:

- `src/lib/espressoRecipes.js`: replaced invented absolute Celsius fields with a source-faithful machine-default temperature object and exact `[-4,-2,0,+2,+4]` Fahrenheit offsets; added strict setup-bound scalar grinder-setting validation; accepted `recipeHash` only as reader metadata; external/custom grinders now require a non-empty model/name for confirmed numeric setup.
- `api/_lib/ruphusCommandService.js`: espresso command writes now fail closed when owner profile preferences are absent, require the recipe to match the confirmed owner setup, advertise Undo for reversible replacements, and remove only the exact undone setup map entry while preserving unrelated setup targets.
- `src/hooks/useEspressoBrew.js`: save/undo operation IDs are UUIDs per operation; retries reuse the frozen full request and action ID; successful completion clears the retry request so a later identical save is new; setup changes/unmount invalidate pending mutations.
- `src/components/onboarding/screens/R07Preferences.jsx`: external/custom grinder confirmation requires the supplied model/name.
- `src/tabs/RotationTab.jsx`, `src/components/QuickRecipeFlow.jsx`: scanned espresso recipes are never persisted with `coffeeId:null`; after inventory creation they are rebound to the returned bean ID and fingerprint, then saved through the authenticated espresso command, with a truthful attach-failure toast.
- `scripts/espresso-command.test.mjs`: memory command fixture now supplies explicit owner preferences to match server fail-closed behavior.

Verification for this correction pass is pending root’s test slot; no test/build/emulator command was run here. Earlier U2 focused evidence remains in this file, but does not cover these latest edits.

## Final bounded correction pass

Focused verification after the final corrections:

```text
node scripts/espresso-recipe.test.mjs                  PASS (16 passed)
node scripts/espresso-command.test.mjs                 PASS (12 passed)
node --test scripts/espresso-equipment-routing.test.mjs PASS (4 passed)
node --test scripts/recipe-command-entitlement.test.mjs PASS (2 passed)
node --test scripts/ruphus-rollout-gates.test.mjs      PASS (21 passed)
npx eslint api/recipe-command.js api/_lib/ruphusCommandService.js src/components/EspressoModal.jsx src/hooks/useEspressoBrew.js src/lib/espressoRecipes.js src/components/onboarding/screens/R07Preferences.jsx src/tabs/RotationTab.jsx src/components/QuickRecipeFlow.jsx PASS
```

Final fixes include an espresso-only `clientIntent` path for ordinary Pro direct-save Undo. It bypasses only the Agent mutation UID rollout gate; entitlement remains Pro-gated, and service checks require the owner revision to be an owned active espresso replacement with no proposal/attempt. Existing Agent/global mutation gates remain unchanged.

Setup history now stores the prior target for the exact setup being replaced. Undo of A39 → B42 → A41 → B45 restores A41 and B42. External/custom grinder names remain optional for weight-based recipes; missing names keep relative guidance and reject calibrated grinder values. EspressoModal consumes rejected mutation promises after the hook sets visible error state, preventing unhandled browser rejections while preserving Try again replay.

The first-save Undo hook now adopts the canonical bean returned by the command, so an absent espresso projection cannot remain in local state or reappear on Refresh. Root owns the remaining authenticated emulator/browser proof and final source review; no further tests were started after this handback.

## Profile binding correction (write-only, pending root browser batch)

Removed the final production fallback to `bean.preferences` from espresso command authorization. Firestore commands now bind only to the current owner profile preferences read inside the transaction; memory callers must pass explicit `preferences`. Added targeted command regressions for missing owner profile preferences and stale embedded bean preferences, both rejected before mutation. No tests were run for this correction because root’s browser harness was active.

## Absence Undo display correction (write-only)

When direct or retry Undo returns a canonical bean with no `espressoRecipe`, `useEspressoBrew` now keeps that canonical absence in local bean state while resolving a fresh app baseline for display from the current owner setup. Refresh therefore cannot resurrect the deleted saved target, and the modal returns to a usable baseline recipe. No tests were run; root owns the next browser proof.
