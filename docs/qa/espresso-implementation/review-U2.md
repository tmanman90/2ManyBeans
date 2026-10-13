# U2 independent correctness review

Disposition: **REVISE** for the pre-correction source reviewed here. Writer resumed corrections after review; these findings do not claim the latest edits remain defective. Reviewed unstaged U2 and new recipe/hook/modal modules against U2/R1–R3/R7/R9. No tests, builds, browser requests or model calls were run by this reviewer. Only the two review reports were written.

## Findings

1. **P1 — Patch bypasses recipe validation.** `api/_lib/ruphusCommandService.js:145–147,469`. Send a valid `command.recipe` plus `patch: { 'espressoRecipe.doseGrams': 99 }`. The recipe validates, then the patch corrupts the bean projection after its valid revision is committed. Whole-recipe replacement with a different invalid object also passes. Subsequent commands encounter source drift. Fix: remove redundant patch authority or require its effective projection to match the validated recipe and validate before commit. Confidence 100.

2. **P1 — Endpoint does not bind bean/setup identity or allowlist recipe fields.** `src/lib/espressoRecipes.js:139–155`; `src/lib/ruphus/legacyRecipeResolver.js:33,36–44`. Executable validation supplies neither `coffeeId` nor trusted setup; setup merely must be an object, and its key is not recomputed. A request for bean A can persist recipe coffeeId B, unknown machine, or an inconsistent setup key. Extra observation fields are also accepted, allowing targets and actuals to mix. Owner scoping is present; this concerns authority inside the authenticated owner's data. Fix: bind exact bean and eligible setup, verify key consistency, and allowlist target fields. Confidence 100 for the source trace.

3. **P1 — StrictMode leaves every Espresso open stuck loading.** `src/hooks/useEspressoBrew.js:21–26`; `src/main.jsx:430`. Development effect setup → cleanup → setup leaves mountedRef false forever. Opening sets loading, then `active()` returns false before recipe/error/clear-loading. Fix: set the ref true during effect setup. Confidence 100 from the effect trace; no browser check performed.

4. **P1 — Late mutation response replaces a newer bean's modal.** `src/hooks/useEspressoBrew.js:73–78,97–101`. Save A, close while pending, open B, then resolve A. Because the hook remains mounted, A's response replaces the recipe and merges A's bean/id into B's modal. Failures can similarly attach stale errors. Fix: bind Save/Undo result, error and loading updates to the initiating bean/setup/modal session and ignore stale UI completions. Confidence 75; reachable ordinary close/reopen sequence, no timing test run.

5. **P1 — Direct Save never exposes Undo.** `src/components/EspressoModal.jsx:64`; `api/_lib/ruphusCommandService.js:305`. Modal Save is replace_active_recipe/source replace; undoAvailable is true only for apply/promote. Therefore every direct save hides Undo, despite the unit script invoking it directly. Fix: offer truthful Undo for reversible direct Espresso replacements, including first save-to-absence. Also reconcile endpoint permission: Undo is Agent v3 allowlist-gated while ordinary replacement is not (`api/recipe-command.js`). Confidence 100 for the hidden control.

6. **P1 — Refresh/setup round trip discards saved target continuity.** `src/lib/espressoRecipes.js:162–168`; `src/hooks/useEspressoBrew.js:154`; `api/_lib/ruphusCommandService.js:24`. Save 39 g, press Refresh: forceRegenerate bypasses saved overrides and roaster evidence and displays medium baseline 36 g without explicit replacement/reset. Save integrated setup A, then external B, return to A: only B remains in the single espressoRecipe projection, so A's targets are no longer selected. Fix: preserve saved overrides on refresh unless replacement is explicit; retain/select targets by exact bean/setup identity. This requires target storage, not a new shot journal. Confidence 100.

7. **P2 — Post-scan Save silently does nothing.** `src/components/QuickRecipeFlow.jsx:516`; `src/hooks/useEspressoBrew.js:53`; `src/components/EspressoModal.jsx:63`. The scan bean has no persisted id. Save returns bean_required without error or inventory save, and the modal ignores the result. Existing quick-recipe inventory action footer is omitted. Fix: use the existing save-to-inventory/auto-save flow, attach the resulting bean id to recipe identity, and expose actual saved/failure state. Confidence 100.

8. **P2 — Incompatible evidence may be labeled verified Espresso.** `src/lib/espressoRecipes.js:75–77,90–95,164–166`. Kind roaster + dose/yield + URL qualifies despite another method, bean, basket, or non-mass units; missing method/units are defaulted to Espresso/g. The current bean/setup is stamped over those targets and labeled verified. Fix: require explicit Espresso mass evidence with compatible identity and complete provenance; otherwise use honest baseline/adaptation labeling. Confidence 75 for the candidate trace; provider output was not tested.

## Further acceptance gaps

- Save/Undo uses new timestamp action ids on every click (`useEspressoBrew.js:60,95`), so transport retry does not replay the prior operation. First saves omit revision checks (`:71`), permitting competing first writes or duplicate revisions after lost responses. Retain the operation/key for retries and use an explicit absent/source-hash precondition.
- Modal receives onRetry but never renders it. Implement/check the planned recoverable error action.
- Chat/tasting handoff mostly passes bean id/surface, not displayed recipe/setup/revision; U3/U4 context acceptance remains pending. No completed R7 behavior is established here.
- Schema/editor lacks a typed grinder setting; required grind-only save/oracle remains shared-contract/U3 work. Dose/output editing alone does not fulfill R9.

## Evidence and limits

Client Save statically reaches /api/recipe-command, authentication, entitlement and owner-scoped Firestore transaction. Command-test source exercises memory-store owner isolation, supplied stale revisions, stable-key replay/conflict and direct Undo. It does not execute modal visibility, StrictMode, transport loss, first-write conflicts, patch integrity, session switching or scan saving.

Root separately reported an actual isolated Auth/Firestore endpoint run: 8/13 checks passed, with failures for Undo availability, patch bypass, bean mismatch, unsupported/inconsistent setup and observation-field acceptance. Receipt: `emulator-U2-1791851019678-receipt.json`. These are root-run results, not tests performed by this reviewer. No immutable tasting full-path PASS is claimed.

## Correction recheck

Disposition: **REVISE**. This recheck used the correction source and writer receipt; no tests were run. Original finding status:

| Original | Source disposition |
|---|---|
| 1 Patch bypass | Resolved: only a whole espressoRecipe projection equal to the validated snapshot is accepted. |
| 2 Identity/fields | Primary bean, owner-preference setup and top-level field checks added. Nested grinder/capability validation remains incomplete below. |
| 3 StrictMode | Resolved: effect setup restores mountedRef. |
| 4 Late responses | Resolved for the reported close/reopen sequence: operation token is invalidated and checked. |
| 5 Undo visibility | Partial: first absent save now offers Undo; subsequent direct replacements still do not. Rollout permission remains unchanged. |
| 6 Refresh/setup continuity | Saved override survives Refresh; setup-map storage added. Undo does not keep that map consistent, as below. |
| 7 Scan Save | Partial: now creates a bean through inventory callback, but that caller drops the Espresso recipe. |
| 8 Source envelope | Main method/units/bean/setup mismatch checks added; runtime/source attribution proof still pending. |

### Actionable remaining/new issues

1. **P1 — Reader metadata is rejected by the new strict allowlist.** `src/lib/espressoRecipes.js:171–172`; `src/lib/ruphus/legacyRecipeResolver.js:36,53,60–70`. canonicalRecipeSnapshot always adds recipeHash. That field is absent from allowedKeys, so resolveRequestedRecipe of an otherwise valid stored Espresso recipe returns invalid. When a legacy stored recipe without activeRevisionIds is materialized as an initial revision, its parent snapshot also contains recipeHash; Undo subsequently validates and rejects that snapshot. Fix: separate reader metadata from executable target validation, or explicitly validate/allow the computed metadata without opening target fields. Confidence 100.

2. **P1 — Undo still disappears after a second direct save.** `api/_lib/ruphusCommandService.js:324`; `src/components/EspressoModal.jsx:64`. The new condition enables Undo only if the previous slot was absent or source apply/promote. A direct edit of an existing recipe has present source and replace, so its receipt still hides Undo. `/api/recipe-command` also retains the Agent v3 allowlist requirement for Undo despite ordinary Save access. Fix: expose and permit guarded direct Espresso Undo for the same authorized owner/tier as direct Save, without broadening unrelated Agent mutation access. Confidence 100 for visibility; permission reachability depends on configured allowlists.

3. **P1 — Cross-setup Undo leaves the undone target in the setup map.** `api/_lib/ruphusCommandService.js:24–26,313–324`. Save integrated A, save external B, Undo B. Parent A is projected and written into A's map entry, but B's just-undone entry remains. Returning to B selects it through resolveEspressoRecipe and resurrects the supposedly reverted target. Fix: Undo must restore the prior state of the edited setup's entry (including absence), retain untouched entries, and maintain active/setup revision identity consistently. Confidence 100 for the state trace; no endpoint test performed.

4. **P1 — Same-value Save is mistaken for replay under a different revision.** `src/hooks/useEspressoBrew.js:81–95`. The action id depends only on bean and recipe fingerprint. Save successfully, then click Save again unchanged: the key is reused but expectedRevisionId is now the newly returned revision rather than the prior absent/source precondition. Server command fingerprint therefore differs and returns idempotency_conflict. Returning to the same targets after Undo/new edits has the same collision. Fix: keep a full immutable command/key for an uncertain transport retry; create a new operation id for a separately authorized save, binding its source revision. Undo still uses a fresh timestamp key on retry. Confidence 100.

5. **P1 — Scan inventory caller drops the recipe, and auto-save identity is not rebound.** `src/tabs/RotationTab.jsx:170–178`; `src/components/QuickRecipeFlow.jsx:290,329`. Save passes espressoRecipe in fields to buildNewBeanData, which ignores it; only manual/Aiden recipes are explicitly reattached. Thus a scan edit disappears after inventory Save. Guided auto-save does attach the ephemeral Espresso recipe, but coffeeId remains null and there is no active revision. Its next recipe open ignores that saved target, and the hook's new absent hash precondition rejects replacement of the actually present legacy recipe. Fix: allocate/bind the real bean id, preserve/revalidate the selected target and setup entry, and use the actual present source hash for a recipe with no materialized revision. Confidence 100.

6. **P2 — New grinder/temperature target fields permit incompatible hardware values.** `src/lib/espressoRecipes.js:168–170`. grinderSetting is checked only for an enum: an external-setup recipe may carry integrated grinder5, unrelated model, arbitrary value/unit/source and still pass. machineTemperatureC accepts 85C and allowedTemperatureOffsetC accepts ±10C for the supported BES870, which the approved source does not establish as controls. Fix: bind grinder setting identity to recipe.setup and validate its typed value/unit/provenance; use machine default unless a supported explicit configuration is known. Store the manual's supported −4/−2/0/+2/+4°F offsets accurately, rather than an invented absolute-temperature/range capability. Confidence 100 for acceptance; unsupported settings are a source/plan violation, not a measured machine claim.

7. **P2 — Save-error Try again regenerates instead of retrying the save.** `src/components/EspressoModal.jsx:33`; `src/hooks/useEspressoBrew.js:179` (onRetry return). On a failed edit save, Try again invokes handleBrewEspresso with the old espressoBean; it restores the old persisted targets and clears the error rather than replaying the attempted save. Fix: distinguish recipe-resolution retry from mutation retry and preserve the edited targets and original command while retrying an uncertain save. Confidence 100 from callback wiring.

Tests added in the correction pass still bypass rendered Undo visibility, metadata-bearing reader/legacy parent paths, true setup-map Undo, hook retry/revision transitions and the actual scan inventory caller. Root runtime/endpoint/browser verification remains independent and pending.

After this recheck, a final line-number probe showed further hook edits already in progress (onRetry now points to retryEspressoMutation). The findings above describe the correction snapshot read for this review; newer follow-up edits have not been certified by this reviewer.

## Stable second-correction recheck

Disposition: **REVISE for the remaining bounded issues below**. Writer was paused for this source recheck. No tests were run by this reviewer.

Addressed in this stable source: patch snapshot equality; exact bean/owner-preference/setup binding and fail-closed missing preferences; StrictMode; close/reopen response guards; saved override Refresh; reader recipeHash compatibility (`espressoRecipes.js:198`); operation UUIDs with frozen full-request Save/Undo retries; source-faithful temperature and setup-bound grinder fields; scan recipe rebinding/authenticated attachment in both inventory and guided auto-save paths. Original direct-save Undo visibility is now addressed for subsequent replacements. These are source conclusions, not endpoint/browser PASS.

1. **P1 — Undo API still excludes ordinary eligible Espresso owners.** `api/recipe-command.js:23`. Direct replacement is an ordinary Pro action, while undo_revision remains in MUTATION_ROLLOUT_MODES and requires both Agent v3 allowlists. A Pro owner outside those lists can Save and receive undoAvailable true, then sees mutation_unavailable when pressing Undo. Fix: authorize guarded Espresso Undo with the same ordinary owner/tier contract as direct Espresso Save while preserving unrelated Agent rollout restrictions. Confidence 100 for the route's conditional trace; live environment membership was not guessed.

2. **P1 — Cross-setup Undo deletes an older saved target for that setup.** `api/_lib/ruphusCommandService.js:36–40,320–326`. The first cross-setup resurrection case is fixed by removing the undone entry, but removal is unconditional. Sequence: save B at 35 g; save A at 39 g; return to B and save 40 g; Undo the 40 g edit. The global parent is A39, so Undo removes B's entry completely and restores A. B35—the value in B's map immediately before the edit—is lost. Returning to B produces baseline rather than its prior saved recipe. Fix: persist the edited setup entry's prior value/absence with the revision and restore that exact entry on Undo, leaving unrelated setup targets intact. Confidence 100 from the map/revision state trace.

3. **P2 — Optional external model is now an undocumented recipe gate.** `src/lib/espressoRecipes.js:62–63`; `src/components/SettingsPage.jsx:1005`; `src/components/onboarding/screens/R07Preferences.jsx:82–94`. Choose a supported confirmed machine/basket and External grinder, leaving the field labeled Optional empty. Setup now fails eligibility and numeric mass targets are unavailable. Onboarding silently saves confirmation false even if the checkbox was checked. The prior U1 contract allows an unknown external model with qualitative grinder guidance; no dial number should be supplied without appropriate identity/scale evidence. Fix: keep weight/yield recipes eligible with unknown external identity and no numeric grinder setting; require model/setting only for the guidance that depends on it. If changing that product contract, the UI/approved plan must explicitly describe it. Confidence 100 for the gating trace.

4. **P2 — Undo eligibility change spills into existing methods.** `api/_lib/ruphusCommandService.js:332`. Adding unqualified source === replace changes every ordinary Aiden/manual replacement receipt from undoAvailable false to true, beyond the Espresso scope. Fix: scope the new replace/first-save eligibility to Espresso and preserve prior eligibility for other slots unless their owning work explicitly adopts the change. Confidence 100 for the API response change; no unrelated UI regression is claimed.

Root separately reported short checks: routing 3/4 passed with the unknown external-model assertion failing, recipe 16 passed, and command script failed on the external setup fixture because owner preferences were not switched. Logs: `root-U2-1791851516453-espresso-equipment-routing.test.mjs.log`, `root-U2-1791851518087-espresso-command.test.mjs.log`. Those results do not establish corrected endpoint or browser behavior. Update the memory fixture's trusted preferences for legitimate setup switches; retain its rejection check when request and owner preferences disagree.

U3/U4 context, live conversation results and rendered tasting/immutable-history proof remain acceptance gates already recorded above. No new scope or additional baseline review was introduced in this recheck.


## Final frozen-source U2 disposition

Disposition: **REVISE for one remaining production preference-binding issue**. This bounded recheck inspected source only; no tests, builds, browser actions or model calls were run by this reviewer.

| Prior stable finding | Final source disposition |
|---|---|
| Ordinary Espresso Undo rejected by rollout | Addressed. `api/recipe-command.js:10–15,29–37` permits only an Espresso direct-Undo intent with expected revision and no proposal/attempt through the ordinary Pro path. `ruphusCommandService.js:182–184,515–517` additionally requires the current owned Espresso replacement and checks the expected revision. Other mutation rollout gates remain. |
| Cross-setup Undo loses prior saved target | Addressed for the reported B35 → A39 → B40 → Undo sequence. `ruphusCommandService.js:326–345` saves the exact replaced setup entry in the revision, removes the undone entry, restores that prior entry, then projects the global parent while retaining unrelated entries. |
| Optional external/custom name gates mass recipe | Addressed. `espressoRecipes.js:56–63` allows absent model/name; `:185` still rejects calibrated setting values without identity. Onboarding `R07Preferences.jsx:82–91` preserves machine/basket confirmation without requiring an optional grinder name. Known grinder class remains required. |
| Undo eligibility spills into Aiden/manual | Addressed. `ruphusCommandService.js:351` scopes the new direct-replace/first-save eligibility to Espresso; apply/promote retain their prior shared policy. |

**P1 — Missing profile preferences still fall back to bean data in production.** `api/_lib/ruphusCommandService.js:178,443,512`. The transaction explicitly sets ownerPreferences to null when the profile or its preferences are missing, but executeOnState passes `state.preferences || bean.preferences`, and assertEspressoCommand repeats that fallback. An owned bean carrying old or client-written confirmed preferences can therefore authorize a fresh Espresso replacement even though the actual profile setup is unavailable. It can also authorize an obsolete setup after profile preferences are removed. This contradicts the intended fail-closed owner-profile binding and the writer receipt's claim that missing profile preferences reject. Smallest fix: require the actual production profile preferences for this validation; remove both bean fallbacks, with memory fixtures supplying explicit store preferences. Confidence 100 for the conditional source trace. This is an owner setup authority issue, not a cross-owner claim.

Correction to the earlier root short-check attribution: the routing assertion at line40 failed because the confirmed machine/basket fixture omitted espressoGrinder, not because it tested an unknown external model. Explicit integrated class is appropriate for that fixture; the optional-model issue was independently established from source and is now addressed. Command fixtures should change trusted store preferences when switching legitimate setups.

Root separately reports the latest real endpoint/Auth/Firestore retest passed 18/18, preserving the original 8/13 failure receipt. Those are root-run results, not reviewer-executed proof; no claim is made that the 18 checks include missing-profile-with-bean-preferences rejection. Root browser verification remains underway. U3/U4 and live conversation/tasting acceptance gates remain as previously recorded.


## Final preference-binding closure

Disposition: **No remaining source blocker in the bounded U2 recheck.** The last P1 is addressed: `ruphusCommandService.js:178–180` validates only supplied owner preferences; both memory and production callers (`:206,512`) pass store/profile preferences without bean fallback. The production transaction reads the actual profile (`:443,452`) and absent preferences now reach invalid_recipe even if the bean carries confirmed preferences. The missing-profile and stale-profile memory assertions are present in `scripts/espresso-command.test.mjs:11–16`; fixtures explicitly supply/change trusted preferences for legitimate setup switches. These tests were inspected, not executed by this reviewer.

No shell commands, tests, browser actions, builds or model calls were run for this closure; only source/test-file reads and this report appendix were performed. Root has prepared the corresponding authenticated endpoint missing-profile-with-bean-preferences case but has not yet reported executing it. Root browser verification remains underway. This closes the reported source defect without claiming runtime or overall product acceptance.


## Absence-Undo display delta

Disposition: **No new source finding in this bounded delta.** `useEspressoBrew.js:137–153,182–195` keeps the canonical returned bean after direct/retry Undo and resolves a display recipe from that bean when the saved projection is absent. `resolveEspressoRecipe` returns a labeled baseline or eligible source recipe without persisting it. The removed saved target is not merged back into bean state, so the next Save uses the absence precondition; direct and retry paths keep their existing operation-token guard. An absent saved projection can now display numeric targets and the Save action again. The Undo receipt still controls Undo visibility.

Root reports `browser-U2-1791852334234-receipt.json` passed eight checks with `emulator-U2-browser-04-manifest.json` sourceStable true, and endpoint03 passed 19 checks including missing-profile rejection with its source manifest. These are attributed root-run results; this reviewer performed source reads only and ran no tests. Full-App U1/U2 entry integration, U3/U4 and live natural-language/tasting acceptance remain pending. No whole-feature acceptance is claimed.
