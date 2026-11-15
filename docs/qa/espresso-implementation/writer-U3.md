# U3 writer handback

Status: implementation pass complete; frozen for root endpoint/browser verification.

Scope covered:

- Added espresso to the conversation method/slot/launch contracts and method resolver, including `recipe_espresso` handoff validation.
- Propagated confirmed espresso machine, basket, grinder, optional model/name, and confirmation state through the authenticated reader, rotation snapshot, and public Ruphus context.
- Made malformed espresso snapshots fail closed in the Firestore reader and strengthened the browser-neutral recipe snapshot contract.
- Added `save_espresso_recipe` and `undo_espresso_recipe` as the only conversational mutation tools for espresso. They call the existing authenticated `executeRecipeCommand` service, derive owner-scoped coffee IDs from server refs, bind the current setup and revision, freeze an action identity per turn, preserve untouched recipe fields, and return action/undo artifacts only after the command receipt.
- Kept generic recipe proposals and all other mutation tools unchanged; espresso proposal calls return a typed explicit-save requirement.
- Added prompt guidance for explicit espresso save/Undo, exact saved fields, relative guidance for unknown grinders, and no conversational shot log.
- Updated the espresso modal to show persisted grinder setting, machine-default temperature offset, source URL/locator when present, and button-press timing language including preinfusion.

Verification performed by writer:

```text
git diff --check  # PASS
```

No tests, emulator, browser, build, dev server, provider generation, or heavy command was run by this writer; root owns the U3 verification slot and actual 36-case endpoint/oracle run.

Known handoff checks for root:

- Exercise explicit save with an existing app-baseline espresso recipe and with a first save from a missing espresso slot; verify the owner profile is confirmed and the command service materializes the revision atomically.
- Exercise same-turn transport retry, new-turn same-value save, wrong-owner/cross-bean, stale revision, malformed setup, and Undo after setup switch.
- Verify response envelope/artifact binding for `action_receipt`/`undo_receipt`, and that a modal-to-chat `recipe_espresso` launch opens context without sending a starter message.

Final bounded correction pass before root verification:

- `api/ruphus-agent.js` now validates bare canonical espresso snapshots before attaching trusted reader `selectedPath`/`selectedHash` metadata, so valid saved revisions are readable instead of being marked invalid by the strict contract.
- `api/_lib/ruphusTools.js` now requires concrete direct save intent (while accepting direct polite requests and natural Undo wording), rejects negated save requests, freezes the full command per turn for response-loss retry, and binds Undo to a prior owner-scoped espresso receipt plus its exact current revision. An intervening direct save therefore returns `recipe_stale` rather than undoing the wrong revision.
- The save path also compares any verified launch revision (including its reader-selected revision marker) with the fresh owner bean revision before constructing a command, so a stale modal launch cannot overwrite a newer saved recipe.
- `api/ruphus-agent.js` carries active-session espresso action receipts into the server-only tool context. No receipt is surfaced as conversational authority without the command service's owner/revision checks.
- `src/lib/ruphus/conversationContract.js` no longer treats the ordinary word `espresso` as a catastrophic internal-token leak; the explicit slot remains in the method/launch enums.
- Modal handoff now carries `launchMethod: 'espresso'` and a verified recipe launch item when an active revision exists, with no starter message. The launch contract and method resolver preserve espresso when the user's default is V60.
- `scripts/ruphus-espresso-tools.test.mjs` adds active reader/save/idempotency/stale-Undo/Undo and handoff regression coverage. It was written but not run under the root-owned test slot.
- `src/lib/coffeeKnowledge.js` and `api/_lib/ruphusPrompt.js` now carry the bounded E01–E12 espresso guidance: confirmed setup and provenance priority, mass/ratio bounds, button-press timing including preinfusion, flow-pattern diagnosis, near-balance yield refinement, milk context, 40-second shots can still taste good, relative unknown-grinder guidance, and supported temperature offsets.

Focused verification after the import-cycle correction:

```text
top -l 1 -n 0  # CPU idle 51.19%; heavy lock free
node scripts/ruphus-espresso-tools.test.mjs  # PASS: active save/idempotency/stale-Undo/Undo/handoff
```

Receipt UI correction after root review (source frozen; focused test slot remains root-owned):

- Espresso command artifacts now retain `status: 'succeeded'`, matching `ActionReceiptCard` and session recovery. Other-method receipts are unchanged.
- `ArtifactRenderer` passes `onPreview` through to `ActionReceiptCard`; espresso receipts expose `View recipe` and route through the existing modal preview path.
- Espresso receipts show exact saved dose, output, grinder value, and machine-default temperature offset when present. `CurrentRecipeCard` now renders those fields plus button-start-to-stop timing and provenance for espresso.
- The focused active-tool regression asserts the succeeded receipt status and exact saved dose in the returned artifact.
- Chat receipts now carry a narrow `onEspressoAction` route independent of the generic mutation rollout flag. Espresso Undo therefore reaches the existing authenticated `/api/recipe-command` path with its bound revision and `espresso_direct_undo` intent; ordinary method receipts retain their prior rollout gate.
- Root’s first post-receipt focused run showed `first.ok === false`: `makeArtifact` rejected the newly aligned `succeeded` status because `ACTION_STATES` did not yet include the command-service receipt state. Added `succeeded` to the shared artifact status contract; no mutation behavior changed.
- `git diff --check` passes. No additional test run was started after this UI-only correction because root owns the next verification slot.

Final live-gate corrections (source frozen for root rerun):

- `api/_lib/ruphusOrchestrator.js` now treats a successful espresso save/Undo receipt as the authoritative result when a provider emits a stale follow-up `propose_recipe_change` call. It returns exact committed/restored mass, grinder, and temperature-offset fields from the receipt, marks the continuation answered, and keeps the action artifact available instead of returning a blank `turn_interrupted` response.
- `api/_lib/ruphusTools.js` carries `restoredSourceState` into the espresso Undo artifact so an absence restore can be described truthfully.
- `src/lib/ruphusActionIdentity.js` adds `clientIntent: 'espresso_direct_undo'` only for native espresso `action_receipt` Undo requests; other receipt/action identities retain their existing request shape and rollout behavior.
- No tests or provider calls were run in this correction pass; root owns the next live endpoint/browser slot. `git diff --check` was not rerun after these final edits per the no-command handoff instruction.

Review-U3 boundary fixes before rerun:

- `api/_lib/ruphusTools.js` now rejects unresolved alternatives such as “finer grind or more output—save that” even if the provider guesses one concrete field. It also recognizes a persisted same-session/session-replay espresso receipt for explicit retry wording, and returns that committed revision instead of issuing a duplicate save when the live recipe and setup still match.
- Espresso save commands now carry `absentRecipeSourceHash('espresso')` when no active revision exists. Historical launch reads are rejected whenever their revision differs from the live revision, including present-to-absent after first-save Undo, so an old launch snapshot cannot repopulate a deleted recipe.
- `api/ruphus-agent.js` carries the persisted receipt status/mode/source/Undo metadata needed for bounded new-turn replay.
- `api/_lib/ruphusOrchestrator.js` now completes immediately from any successful authenticated espresso receipt before provider follow-up, and its error boundary recovers the exact receipt after any later provider/budget failure. This covers stale preview calls and broader post-commit continuation failures without claiming the saved recipe is unchanged.
- `scripts/ruphus-espresso-tools.test.mjs` now covers negated and ambiguous save requests despite provider-supplied fields, same-receipt new-turn retry replay, repeated Undo stale protection, historical launch after first-save Undo to absence, and native espresso-only action identity intent. These assertions were added but not run; root owns the test slot.
- No provider calls, builds, or browser runs were started; source is frozen for root’s slot.

Focused replay correction:

- Root-authorized `node scripts/ruphus-espresso-tools.test.mjs` ran once at measured CPU idle 67.59% and failed at the new-turn replay assertion (`replay.ok === false` initially). The first correction showed the retry gate then admitted the turn but `replayed` was absent because the persisted artifact omits transient `generatedAt`, while the reconstructed recipe retained it.
- `api/_lib/ruphusTools.js` now admits “try saving it again” as explicit retry wording and compares persisted/current espresso recipes with `espressoRecipeFingerprint`, excluding only the intended transient metadata. The retry returns the original committed receipt/action instead of creating another revision.
- `src/lib/ruphus/session.js` now settles succeeded espresso `replace_active_recipe` receipts as undone when a matching espresso Undo receipt arrives; legacy apply/promote settlement remains unchanged.
- The focused test now also asserts session settlement. No second test run was started; root owns rerun and live verification.

Replay follow-up and final focused proof:

- Root candidate4 reproduced `replay.ok === true` with `replayed` undefined: the test supplied the raw action artifact, whose `setupKey` lives inside `recipe`, while the matcher required a top-level key. This created a new mutation despite matching values.
- `api/_lib/ruphusTools.js` now normalizes persisted receipt entries to one top-level `setupKey` when loading session artifacts, and the retry matcher uses that canonical field.
- Final authorized focused run: `top -l 1 -n 0` measured CPU idle 64.3%; `node scripts/ruphus-espresso-tools.test.mjs` passed: `active save/idempotency/stale-Undo/Undo/handoff passed`.
- Source is frozen for root. No live endpoint, browser, build, or model run was started by this writer.

Live E07 launch-context correction:

- The actual E07 rerun showed the retained espresso launch item still forcing the original 36 revision into ordinary `read_recipe`, so the model could not see the saved 39 receipt and emitted no Undo. `api/_lib/ruphusTools.js` now uses the live owner revision for ordinary espresso reads/evidence, while save validation explicitly requests the historical launch baseline and retains stale/absence rejection. Non-espresso historical launch behavior is unchanged.
- `scripts/ruphus-espresso-tools.test.mjs` adds a launch-shadow characterization: with an old espresso launch item and a committed current recipe, ordinary read returns the current saved dose. The focused script passed at CPU idle 68.98%.
- Source is frozen for root’s next live run; no browser, build, or model call was started by this writer.

Final source-only live-gate correction:

- `api/_lib/ruphusTools.js` now adds a model-facing `undoAvailable`/`reversibleAction` marker to an ordinary live espresso `read_recipe` only when the authenticated session receipt is succeeded, undoable, setup-matched, active-revision-matched, and fingerprint-matched to the current canonical recipe. The marker carries no prior targets; `undo_espresso_recipe` still performs the owner/revision transaction checks.
- The same read now summarizes espresso as dose in to output out, avoiding the prior `?g water` contradiction that caused the model to miss the current target.
- `src/tabs/RotationTab.jsx` and `src/tabs/InventoryTab.jsx` omit a historical recipe launch item for an unsaved espresso modal target and give chat a clear “save it first” starter instruction, preventing silent discussion of the older saved recipe.
- `src/tabs/TastingTab.jsx` only uses a bean espresso recipe for direct tasting when its setup key matches the confirmed current espresso preferences; a switched setup therefore records no borrowed recipe/equipment.
- Static verification only: `git diff --check`, `node --check api/_lib/ruphusTools.js`, and `node --check api/ruphus-agent.js` passed. No new test/provider/browser/build command was run; source is frozen for root’s E07/full-app verification.

Final receipt-replay correction:

- `api/ruphus-agent.js` now carries a succeeded `undo_receipt` back into the active-session espresso receipt projection. The associated save is marked `undone` with its restored revision/recipe, while other-method receipts and rollout gates are unchanged.
- `api/_lib/ruphusTools.js` now accepts an identical new-turn save request as a replay when the authenticated owner, bean, setup, live revision, and canonical recipe fingerprint all match the persisted succeeded receipt. A changed live revision still creates a new operation.
- `api/_lib/ruphusTools.js` returns a canonical idempotent Undo result when the exact persisted receipt is already undone and its restored revision remains live. No transaction or second revision is created.
- `api/_lib/ruphusOrchestrator.js` now recognizes that settled Undo receipt during a blocked provider continuation and re-enters the guarded espresso command, allowing the duplicate request to finish with a completed receipt-bound response instead of `response_blocked`/`turn_interrupted`. Exact locked bean/setup/method and explicit direct Undo checks remain required.
- `scripts/ruphus-espresso-tools.test.mjs` adds same-request response-loss replay and completed Undo replay assertions, including unchanged Firestore state. Tests were not run in this handback; root owns the coordinated slot.
- Static `git diff --check` passed after this correction. No provider call, browser, build, emulator, or heavy test was run.

Receipt revision/identity correction after focused review:

- Undo replay now matches the command receipt’s `revisionId`, which is the newly committed live restoration revision. `restoredRevisionId` remains the parent snapshot only. The same path supports first-save Undo back to absence, where no restored recipe or parent revision exists.
- Session projection carries `undoRevisionId`, restored source state, and the canonical Undo artifact so the orchestrator can complete an already-undone direct request without dispatching a second transaction.
- Espresso command identities remain deterministic per authenticated turn. Same-turn retries reuse the matching frozen operation; cross-turn response loss is recovered from the persisted receipt, while the command service continues to reject mismatched input.
- Present Undo replay now requires the live Undo revision plus an exact restored-recipe fingerprint. Absence Undo replay requires the authenticated succeeded Undo artifact and a currently absent espresso slot, so deletion is not mistaken for a stale revision.
- Focused regressions now cover absence Undo replay and save A→B→A without idempotency collision. Tests were added but not run; root owns the coordinated slot.
- Static `git diff --check` passes. Source is frozen for root verification.

Focused correction verification:

- Updated repeated Undo coverage to assert idempotent replay and unchanged bean state, retaining the separate intervening-revision stale Undo guard.
- Added owner-scoped action-journal recovery coverage using a fresh same-turn context with no prior session receipt; it returns the original succeeded receipt without a second revision.
- Added absence Undo replay and present Undo exact-fingerprint guards to the same focused script.
- Fresh `top -l 1 -n 0` reported 45.82% CPU idle before the single authorized test command. `node scripts/ruphus-espresso-tools.test.mjs` passed: `active save/idempotency/stale-Undo/Undo/handoff passed`.
- No emulator, browser, build, provider, or model command was run. Source is frozen for root.

Final stale-launch recovery correction:

- `api/_lib/ruphusTools.js` now defers the historical launch mismatch result until after the exact owner-scoped action journal lookup. A matching same-turn committed save is recovered from `users/{uid}/actions/{actionId}`; any mismatch without that exact live recipe/setup/revision match still returns `recipe_stale` before writing.
- Action identity uses the authenticated turn plus canonical espresso recipe fingerprint, avoiding drift from reader-only launch metadata while retaining deterministic idempotency.
- Focused coverage now exercises historical launch36 → committed save39 → fresh same-turn retry with no chat receipt.
- Fresh `top -l 1 -n 0` reported 59.29% CPU idle before the single rerun. `node scripts/ruphus-espresso-tools.test.mjs` passed: `active save/idempotency/stale-Undo/Undo/handoff passed`.
- `git diff --check` passes. Source is frozen for root.

Non-espresso evidence compatibility correction:

- `api/_lib/ruphusEvidence.js` now renders ratio/output mass only for espresso records. Existing pour-over/other-brewer brew summaries retain their prior numeric order and ratio text, while espresso summaries avoid duplicated `1:1:` prefixes.
- Fresh CPU idle was 57.91% before the brew-evidence command; `node scripts/ruphus-brew-evidence.test.mjs` passed all 10 tests.
- Fresh CPU idle was 58.49% before the espresso-tools command; `node scripts/ruphus-espresso-tools.test.mjs` passed: `active save/idempotency/stale-Undo/Undo/handoff passed`.
- `git diff --check` passes; source is frozen.

Duplicate Undo live-gate diagnosis and bounded correction:

- Receipt `live-E07-duplicate-1791861683757-receipt.json` shows the first Save39 and Undo36 succeeded, and the duplicate provider context still has the exact espresso launch clue and method binding, but `<TRUSTED_TURN_BINDING>` is `null`. The provider therefore returned an already-restored preview, and the orchestrator's recovery guard could not derive `boundEspressoRef`; it fell through to `response_blocked`/`turn_interrupted` before evaluating the persisted Undo artifact. This was not a command or Firestore revision failure.
- `api/_lib/ruphusOrchestrator.js` now permits this one resumed pronoun-only path only when explicit Undo, locked espresso method, espresso launch clue, authenticated persisted receipt matched to `launchCoffeeId` and current setup, and exactly one opaque ref for that receipt all hold. Locked turn bindings retain the existing path; ambiguous or missing launch/receipt matches remain blocked.
- `scripts/ruphus-espresso-tools.test.mjs` now builds the active-session projection with `retainActionReceipt` and `espressoReceiptsForSession`, then asserts a blocked provider with no turn binding completes receipt-bound Undo recovery without another mutation.
- No test/provider/model command was run after this correction; root owns the coordinated focused/live slot. Source is frozen.

Reviewer-directed binder correction superseding the launch fallback above:

- The orchestrator recovery remains locked-binding-only; the launchReceiptBinding branch was removed so it cannot infer a target from a launch/latest receipt.
- `api/_lib/ruphusTurnBinder.js` now recognizes direct current-recipe Undo pronouns such as “nah put it back how it was” through the existing current-focus/launch resolver, while “Would undo help?”, negated requests, and `Undo jar one or jar two?` remain non-mutating/ambiguous.
- The persisted-projection orchestrator regression now obtains `turnBinding` from `bindRuphusTurn` rather than injecting a manual binding. `scripts/ruphus-reference-resolution.test.mjs` adds the natural-pronoun and alternative-target coverage.
- No post-correction test command was run in this handback; root owns the authorized focused slot.

Authorized binder correction verification:

- Fresh `top -l 1 -n 0` readings showed 63.61% and 64.52% CPU idle before the two serial focused commands.
- `node --test scripts/ruphus-reference-resolution.test.mjs` passed all 16 tests, including current-focus Undo pronouns, negation/hypothetical non-binding, and ambiguous alternative targets.
- `node scripts/ruphus-espresso-tools.test.mjs` passed: `active save/idempotency/stale-Undo/Undo/handoff passed`, including persisted `espressoReceiptsForSession` projection with a real `bindRuphusTurn` binding.
- No browser, emulator, build, or provider/model command was run. Source is frozen for root live verification.

E01 incomplete sour-without-measurement correction:

- `api/_lib/ruphusPrompt.js` now explicitly requires a useful flow/preparation question when espresso is sour or sharp without actual flow, preparation, dose, yield, or measured time. Saved targets and older tastings are explicitly excluded as shot measurements; measured fast/even evidence still permits the bounded finer experiment, and near-balanced evidence still permits the small yield refinement.
- `src/lib/coffeeKnowledge.js` carries the same rule in the espresso-qualified method/troubleshooting guidance. Generic pour-over sour guidance is unchanged.
- `git diff --check` passed. No tests, provider calls, browser runs, or builds were started; source is frozen for root's E01 rerun.

E03 near-balanced refinement correction:

- `api/_lib/ruphusPrompt.js` now asks for one useful missing detail when a sweeter/less-sharp request lacks cup profile or measurements, while allowing one modest yield test when dose, yield, button-time, even flow, and small-refinement intent are already present. It explicitly states the longer-yield versus shorter-yield concentration/body and possible-extraction tradeoff, with a taste criterion, and prevents repeated generic sharpness clarification once evidence is sufficient.
- `src/lib/coffeeKnowledge.js` carries the same espresso-qualified near-balanced rule; generic pour-over guidance is unchanged.
- `git diff --check` passed. No tests, provider calls, browser runs, or builds were started; source is frozen for root's E03 rerun.

E03 yield-timing correction:

- `api/_lib/ruphusPrompt.js` and the espresso-qualified `src/lib/coffeeKnowledge.js` rule now state that a dose/grind-held yield experiment stops at the target output mass. Button-to-stop time, including preinfusion, is an observed measurement rather than a fixed second target for the experiment.
- `git diff --check` passed. No tests or provider calls were run; source is frozen for root's E03 rerun.

E05 flow-separation and E06 explicit-save round-boundary correction:

- The actual E05 casual receipt (`live-E05-casual-1791863141813-receipt.json`) grouped “fast or uneven” as one possible finer condition. Research E07 requires uneven, spraying, or channeling flow to raise preparation/channeling first; only fast and even flow can support a bounded finer test. `api/_lib/ruphusPrompt.js` and the espresso-qualified section of `src/lib/coffeeKnowledge.js` now state that separation explicitly and prohibit an automatic finer recommendation for uneven flow. Pour-over guidance was not changed.
- The actual E06 incomplete receipt (`live-E06-incomplete-1791863223279-receipt.json`) showed the model correctly issuing `save_espresso_recipe` after `resolve_coffee` and `read_recipe`, but the orchestrator rejected that third, exact mutation round because `MAX_TOOL_ROUNDS` is two. The tool call never reached the command service, so no revision was created. `api/_lib/ruphusOrchestrator.js` now permits exactly one final espresso mutation round after at least one bounded read, while retaining the existing command-level owner/setup/revision/explicit-intent validation and the general read/tool-round budget.
- Static `git diff --check` passed after the correction. No provider, emulator, browser, build, or test command was run; source is frozen for root’s coordinated rerun.

Final espresso mutation-round regression:

- `scripts/ruphus-espresso-tools.test.mjs` now creates the initial espresso revision through the real command service, then drives `runRuphusTurn` through resolve → exact `read_recipe` → `save_espresso_recipe`. This exercises the new single final mutation round and asserts one succeeded canonical revision at 39 g output; a negated save request still returns `espresso_save_requires_explicit_request` and leaves the bean unchanged.
- The first two attempts were fixture reds: the resolver reference did not match the snapshot name, then a seeded recipe lacked its active revision and was correctly rejected as stale. The fixture now uses the existing snapshot identity and real initial-save path; no production behavior was weakened.
- Fresh `top -l 1 -n 0` reported 61.97% CPU idle before the single passing command. `node scripts/ruphus-espresso-tools.test.mjs` passed: `active save/idempotency/stale-Undo/Undo/handoff passed`.
- No provider, emulator, browser, build, or heavy suite was run. Source is frozen for root.

E08 incomplete setup-authority correction:

- `live-E08-incomplete-1791863604616-receipt.json` had `espressoMachine=breville-barista-express`, `espressoBasket=null`, `espressoGrinder=external`, no grinder model, and `espressoSetupConfirmed=false`. The provider nevertheless reused the historical stock-double/integrated recipe as a current 18 g/36 g/default-temperature recommendation and invented a “middle espresso range” for the unidentified grinder.
- `api/_lib/ruphusPrompt.js` now makes the dynamic equipment authority explicit: only confirmed Barista Express + stock double single-wall permits the app numeric baseline. Unknown/unconfirmed basket or setup requires the missing identity; saved values from another setup are historical context, while known measured dose/output and relative coffee guidance remain available. Unknown external/custom grinder models cannot receive a middle/default dial recommendation.
- The static active espresso guidance and espresso-qualified `src/lib/coffeeKnowledge.js` carry the same boundary without changing generic chat or tasting guidance.
- Static `git diff --check` passed. No tests, provider calls, emulator, browser, build, or heavy command was run; source is frozen for root verification.

E11 focus-switch completion correction:

- `live-E11-clear-1791864040791-receipt.json` showed two selection-only turns. “Use the other beans instead” resolved Maple Ridge and read its espresso evidence, but the provider classified the focus change as an answered `recipe_preview` without a proposal artifact, so the envelope guard turned it into `response_blocked`. “I mean the bean in jar 2, and I want V60 now” read the exact V60 evidence, then submitted a null proposal change; the tool correctly refused an unchanged card, after which the provider’s blocked correction again interrupted the turn.
- `api/_lib/ruphusOrchestrator.js` now has a narrow selection-only classifier requiring bean/brewer focus language and no recipe control, card, brew, technique, or save request. Selection-only turns with a null/unchanged proposal become clarification, asking for one concrete adjustment; answered focus switches with no artifact become completed information turns. Explicit recipe/control/technique requests retain the exact-card and mutation guards.
- The correction is runtime-only and does not write persistence or relax prepared-card fulfillment for explicit recipe requests. Static `git diff --check` passed. No tests, provider calls, emulator, browser, build, or heavy command was run; source is frozen for root’s coordinated E11 rerun.

E11 blocked-response completion refinement:

- The first E11 trace included a second provider recovery response marked `recipe_preview/blocked`, so the focus-only completion must run before the generic blocked-envelope recovery. `api/_lib/ruphusOrchestrator.js` now converts that exact selection-only/no-artifact case into completed information from the trusted read evidence; explicit recipe requests still enter the existing blocked/card guard.
- `node --check api/_lib/ruphusOrchestrator.js` and `git diff --check` passed. No runtime test or provider command was run; source is frozen for root’s E11 rerun.

E11 reviewer-directed correction superseding the runtime bypass:

- Root review found the temporary selection-only runtime classifier could match ordinary coffee discussion and could synthesize a subject without a narrowly verified binding. I removed only the new `selectionOnly*` helpers and all three runtime bypass branches from `api/_lib/ruphusOrchestrator.js`; the global artifact and mutation guards are restored unchanged.
- `api/_lib/ruphusPrompt.js` now carries the bounded instruction instead: a bare bean/brewer focus switch uses information or identity clarification and never submits a null proposal; explicit saved-recipe, brew, technique, and concrete-control requests retain their normal card path.
- `node --check api/_lib/ruphusOrchestrator.js` and `git diff --check` pass. No tests or provider calls were run; source is frozen for root’s E11 rerun.

E11 prompt-only focus-switch tightening:

- The E11.clear77 rerun still had the provider classify a bare bean/brewer switch as `recipe_preview` while merely restating the saved V60 recipe, which triggered the normal missing-card recovery. The runtime remains unchanged.
- `api/_lib/ruphusPrompt.js` now explicitly requires selection-only turns to acknowledge the exact coffee/brewer as information without restating saved recipe numbers, asking for an adjustment, classifying the turn as `recipe_preview`, submitting a null proposal, or claiming a review card. Explicit saved-recipe/card/brew/technique/control requests retain their normal flow.
- `git diff --check` passes. No tests or provider calls were run; source is frozen for root’s E11 rerun.

E11 provider-schema alignment:

- `live-E11-clear-1791864538754-receipt.json` confirmed the prompt-only wording was still competing with the OpenAI response schema, whose intent description treated information as explanation/comparison only. The provider therefore labeled a bare bean/brewer switch `recipe_preview` even while only acknowledging the saved recipe.
- `api/_lib/ruphusProviders/openai.js` now defines `information` to include a bare bean or brewer focus switch when no recipe, card, brew, technique, or control change is requested. Explicit recipe requests remain `recipe_preview`, including blocked/clarification outcomes when a requested card cannot be prepared. No enum, shape, or runtime validation changed.
- Fresh `top -l 1 -n 0` reported 54.41% CPU idle before the single authorized command. `node scripts/ruphus-provider-contract.test.mjs` passed all 12 tests.
- `git diff --check` and `node --check api/_lib/ruphusProviders/openai.js` pass. No live provider, emulator, browser, build, or heavy suite was run; source is frozen for root.

Typed no-change recovery correction:

- The existing no-change test covered a first-call `no_recipe_change`, but not a trusted no-change result after an earlier recoverable proposal failure. That sequence set `proposalRecoveryAttempted`, then the later answered information response was incorrectly rejected by the proposal-recovery fulfillment guard.
- `api/_lib/ruphusOrchestrator.js` now records a no-change recovery only when the actual `propose_recipe_change` request passes the existing exact target eligibility check (coffee, slot, resolved owner coffee ID, source hash, and matching proposal target). The final bypass requires an answered `information` envelope whose coffeeRef and slot exactly match that request. Duplicate alternatives, unrelated failures, mismatched requests, and mismatched final envelopes retain the existing failure path.
- `scripts/ruphus-u2-runtime.test.mjs` adds positive chained-recovery coverage and a negative unrelated-final-envelope case. Before the fix, the positive case failed with `proposal_failed` after two proposal calls; the same red command also exposed one pre-existing fixture assertion expecting the older read-tool list while the current source exposes espresso tools.
- Fresh `top -l 1 -n 0` readings showed 62.72% and 62.84% idle before the focused commands. `node --test --test-name-pattern='trusted no-change result|no-change recovery does not' scripts/ruphus-u2-runtime.test.mjs` passed both new tests; `node --test --test-name-pattern='already matching recipe values' scripts/ruphus-u2-runtime.test.mjs` passed the existing no-change test.
- No provider, emulator, browser, build, or heavy suite was run. Source is frozen for root’s coordinated E11 rerun.

U2 complete-file verification after authorized-tool-list assertion update:

- `scripts/ruphus-u2-runtime.test.mjs` now expects the two intentionally authorized narrow espresso tools (`save_espresso_recipe`, `undo_espresso_recipe`) while retaining the existing forbidden-action/tool-surface checks.
- Fresh `top -l 1 -n 0` reported 60.37% CPU idle before `node --test scripts/ruphus-u2-runtime.test.mjs`.
- Complete file result: 54 passed, 1 failed. The updated tool-list assertion passed; the remaining failure is the existing `explanation.anyOf` deep-equality assertion, which expects `{ type: 'string' }` while the current intentional schema includes `maxLength` and a description. No source/schema change was made for that unrelated assertion.
- No output log was saved; this is the terminal receipt above. No provider, emulator, browser, build, or heavy suite was run.

U2 schema-contract cleanup attribution and final verification:

- `git blame` attributes the `explanation` schema’s `maxLength: 280` and description to commit `15f92735` (`fix: ground Ruphus experiments in completed brew evidence`, 2026-10-11), predating this espresso work. The test now checks nullable string/null shape and the 280-character constraint without coupling to prose description.
- The same contract assertion now includes the intentionally supported `espresso` slot in the exact recipe slot enum; no production schema was changed.
- Fresh `top -l 1 -n 0` reported 56.90% CPU idle before the final complete run. `node --test scripts/ruphus-u2-runtime.test.mjs` passed **55/55**.
- No provider, emulator, browser, build, or heavy suite was run. Source is frozen for root.

E11 protective-reference binding correction (red then green):

- The red focused run was `node --test scripts/ruphus-reference-resolution.test.mjs` after a fresh `top -l 1 -n 0` reading of 45.80% CPU idle. It passed 16/18 and failed only the two new cases: `Use jar 2 for V60. Don't change jar 1's espresso recipe.` bound jar 1 instead of jar 2, and the protected jar 1 clause incorrectly replaced an established jar 2 focus for the next current-recipe turn.
- `api/_lib/ruphusTurnBinder.js` now treats negated/protective ordinal clauses, including ASCII and smart-apostrophe forms, as non-authoritative; it also recognizes the existing current-focus Undo/pronoun path without allowing negated or ambiguous alternatives to bind. `src/lib/ruphus/methodResolver.js` applies the same clause-local protection to recipe-method mentions while preserving sensory method mentions such as `not sour with hot Kalita`.
- `scripts/ruphus-reference-resolution.test.mjs` covers positive jar/method selection, reversed clause order, smart/ASCII protective language, next-turn inheritance, sensory method preservation, polite current-recipe Undo, negated/hypothetical Undo, and ambiguous alternatives.
- The green focused run used a fresh `top -l 1 -n 0` reading of 50.15% CPU idle: `node --test scripts/ruphus-reference-resolution.test.mjs` passed **18/18**. `git diff --check` passed. No provider, emulator, browser, build, or heavy command was run.

E12 casual failed-save retry design (investigation only; no source/test change):

- `live-E12-casual-1791865569884-receipt.json` shows the first explicit save reached `save_espresso_recipe`, hit the injected persistence failure, and returned a truthful unchanged-state error. The follow-up `didnt work? try again pls` reached the save tool but was correctly rejected by the current explicit-save guard because a bare retry phrase must not authorize model-invented controls.
- The safe bounded design is a server-recorded, owner-scoped retryable failed-save record in the existing authenticated actions path, containing the frozen bean/setup identity, exact validated recipe fingerprint/patch, expected live revision (or absence hash), original action identity, and a failed/retryable status. Chat-synchronized errored messages are not authority. A subsequent retry is eligible only for a narrow retry-intent phrase with no new bean/setup/control values, an authenticated exact coffee/setup/live-revision match, and tool args byte-for-byte equivalent to the frozen failed request. On success it produces the normal canonical receipt; focus/setup/revision changes, Undo, success, or mismatched args invalidate it. This preserves successful receipt replay as a separate path and never makes generic “try again” a save authorization.
- No retryable-failure persistence was implemented because the current transaction path only records successful actions (`users/{uid}/actions/{actionId}`); implementing the failed record needs a deliberate server-side action-state extension and focused failure/retry tests before live use. Current behavior remains safely explicit-save-only for an unrecorded failed operation.

E11 conjunction-boundary correction:

- The protected-clause method filter was initially broader than the bean binder and treated `Don't change jar 1's espresso recipe but use jar 2 for V60` as protected espresso because it did not split at the positive `but` correction boundary.
- `src/lib/ruphus/methodResolver.js` now applies the same local clause split (`but`, `however`, `instead`, `rather than`, and punctuation) before evaluating protective method language. The existing protective-ordinal and sensory regressions remain unchanged; the focused red/green command is held for root's coordinated slot.

E12 bounded failed-save retry implementation:

- `api/_lib/ruphusTools.js` now supports a narrow server-owned companion document at `users/{uid}/chatSessions/espresso-retry`. Existing Firestore rules already allow client writes only to the literal `active` chat document, so no rules/config/schema change was made. The Admin transaction path records only an explicitly authorized command that reaches persistence and fails with a retryable persistence code; reads, advice, validation, negation, and stale failures do not create a retry record.
- The record stores the original action ID/turn, active-session boundary, owner bean/setup, expected revision or absent-source hash, exact validated recipe/fingerprint, attempt count, and a ten-minute expiry. Client-synchronized errored chat messages and prior receipt history are not authority.
- A later retry is accepted only for a narrow direct retry phrase (`didn't work? try again pls`, `try saving it again`, and equivalent bounded forms), with an authenticated locked current coffee and espresso method, matching boundary/setup/revision, and exact frozen recipe fingerprint. Changed args, wrong bean/setup, stale baseline, changed focus, negation, or hypothetical wording invalidates the companion and performs no write. A successful retry or Undo marks it unusable. A persisted successful action is still recovered through the existing owner-scoped action journal before stale rejection, covering commit-before-response-loss.
- `scripts/ruphus-espresso-tools.test.mjs` adds red-first coverage for retry success, forged/model-changed args, wrong bean, wrong setup, stale baseline, and negation, plus retry-intent assertions. The fake Firestore harness rolls back injected action failures and exposes only the test helper `failNextPersistence`; production dependencies/rules were untouched.
- Static checks passed: `node --check api/_lib/ruphusTools.js`, `node --check scripts/ruphus-espresso-tools.test.mjs`, and `git diff --check`. Root holds the focused test slot; no provider, emulator, browser, build, or heavy command was run after this implementation.

E12 documentation correction:

- The retry-focused assertions were added before handback, but the writer did not observe a red execution of those new assertions. The actual pre-fix red receipt available here is root's `live-E12-casual-1791865569884-receipt.json`; root owns green verification of the added focused cases.

E12 retry follow-up corrections and focused verification:

- The initial focused retry run correctly exposed `invalid_recipe` for a wrong-bean retry before retry binding; the test now asserts that legitimate fail-closed validation and verifies the retry companion is marked `stale` with no bean write. Production validation paths now close a retry record on retry-specific invalid args/setup identity instead of leaving it reusable.
- Companion writes are transactional and compare the existing owner/action/status before setting. A delayed older failure cannot replace a newer retry candidate or reopen a companion already closed by success, Undo, focus, setup, or staleness. Invalidation likewise only closes the currently matching retryable action.
- `api/_lib/ruphusTurnBinder.js` now resolves bounded retry wording to the authenticated current coffee from launch/ledger context; it never derives a target from retry prose. `scripts/ruphus-context.test.mjs` covers real `buildRuphusContext` binding with current espresso method inheritance.
- Fresh CPU readings were 62.85%, 60.43%, and 55.82% idle before the serial checks. `node scripts/ruphus-espresso-tools.test.mjs` passed active save/idempotency/stale-Undo/Undo/handoff plus retry cases; `node --test scripts/ruphus-context.test.mjs` passed **11/11**; `node --test scripts/ruphus-reference-resolution.test.mjs` passed **18/18**, including the conjunction-boundary regression.

Root integration correction and proof boundary:

- Retry guards compare the current authenticated focus, session boundary, setup and revision when a retry is attempted. They do not install unconditional cancellation hooks for every focus change or new-chat event. Negation closes the record when the save tool is invoked with that negation. Earlier blanket cancellation wording above is superseded by this narrower description.
- Independent review found fresh explicit saves inherited an older retryable record's timestamp and turn. Root separated fresh-operation metadata from exact-retry metadata and rejects replacement by a different action with an equal timestamp. Tests now cover an older still-retryable failure, newer explicit operation, original turn/attempt reset, tied timestamp and delayed failure. New red runs were CPU-deferred; no pre-fix execution of these new assertions is claimed.
- Root corrected the forged-retry fixture to preserve 41 g after the preceding successful B lifecycle, rather than expecting its earlier 39 g value. The subsequent ten focused commands passed in `focused-1791866952-receipt.json`, before the additional ordering correction. All 14 existing pour-over/Aiden commands passed in `prior-chat-1791866967-receipt.json`; final-source reruns remain separately recorded.
- No provider, emulator, browser, build, or heavy command was run. Source is frozen for root's live E11/E12 verification.
