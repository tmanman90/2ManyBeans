---
title: Finish Ruphus's existing recipe journeys
type: fix
status: completed
date: 2026-09-19
origin: docs/plans/2026-09-13-001-fix-ruphus-capability-completion-plan.md
---

# Finish Ruphus's existing recipe journeys

Completed for the approved Dev engineering scope on2026-09-19. Code candidate7892b4e; evidence and explicit exclusions: `docs/qa/2026-09-19-ruphus-final-candidate.md`. Production publication remains a separate decision. Historical non-green frozen evaluation disagreements are documented, not claimed resolved.

## Decision and scope

Finish the existing implementation, not a new agent architecture. This continuation retains the origin plan's R1–R7: correct context and source states; same-response usable recipes; supported-family parity; coherent native actions; useful coaching; honest recovery; ordinary conversation. It updates execution order using `docs/qa/2026-09-19-ruphus-reconciliation.md`. Historical native successes are evidence to reuse, not final-candidate acceptance.

Planning only: no application edits or deployment are authorized by this document alone. Work in `.worktrees/codex/ruphus-production-ota`, initially HEAD `417b6a8`, preserving existing dirty work and diagnostics. Reconcile changes before editing; do not reset, wholesale replace, or blindly publish the worktree.

### Why the latest failure happened

- Chat adds the selected grinder to preview configuration, but the recorded release's endpoint rejects all configuration. A local uncommitted allowlist repair already exists. Review and retain it rather than write another fix.
- Source recipes bypass the ordinary selected-grinder presentation. Existing calibration and physical-click helpers already solve the underlying conversion problem approximately; use them rather than build a new grinder system.
- Internal projection language and excessively precise targets reached users. Original Onyx timing is real, not evidence of a timing bug: its official guide specifies elapsed pour starts at 0:00, 0:30, 0:45, 1:05, 1:30, 2:00 and drain at 3:30. Explain the schedule rather than invent waits.
- Prior native successes used different evolving Dev builds. Switch dose continuation and hot Kalita temperature continuation were not closed on a final integrated build. Green unit tests did not prove those journeys or the published build.

Primary timing source: https://onyxcoffeelab.com/products/monarch?variant=31861823176802 . Preserve source attribution; adaptations for another coffee are allowed but must not imply the author endorsed that adaptation.

## Ordered work

### 1. Reconcile and finish the existing preview contract

Inspect the relevant dirty diff and retain valid existing repairs. Explicitly reconcile any `ios/App/GoogleService-Info.plist` changes and Dev configuration without reverting them or disrupting existing sign-in; exclude unrelated native/auth changes from the repair. In `api/ruphus-preview.js`, `src/tabs/ChatTab.jsx`, and `src/lib/recipeCommands.js` (confirmed preview request path), align the actual preview request with the allowlisted grinder preference. Keep unknown-field rejection, ownership, method/mode, revision, and source validation. Source-specific configuration is a separate contract, not permission for arbitrary overrides.

Verify ordinary and source recipe previews using real request shapes. Failure must preserve the user's message/card and provide a recoverable consumer explanation; never display `unsupported_preview_configuration` or call a validation failure a connection problem. Do not add a silent legacy-chat fallback.

Resolve the three known test disagreements against behavior, not by making assertions easier:

- `scripts/ruphus-recipe-card.test.mjs`: proposed preview, saved inspection, and undone disabled states—not a brittle JSX regex.
- `scripts/ruphus-response-recovery.test.mjs`: genuinely absent Aiden can have a creation target; unavailable data must not become an invented existing recipe.
- `scripts/ruphus-technique-conversation.test.mjs`: a promised recipe with no card is not successful fulfillment; recover with a card or report an explicit unresolved failure.

Exit: the reported preview request reaches an executable preview; invalid requests still fail safely. Record actual test results, including unresolved failures.

### 2. Make source recipes usable through the existing recipe experience

Use `src/lib/brewMethods.js` calibration/quantization and existing adapters from `src/components/HandBrewModal.jsx` and `src/lib/manualSourceProjection.js` as appropriate. Show the selected grinder and a valid physical setting, honoring existing display preferences. Retain source microns as secondary detail; calibration is approximate, not a claim of exact measurement equivalence. Unknown grinders or qualitative-only sources get useful honest guidance, not invented numeric settings.

Make one-click edits use actual grinder steps (Ode whole/.2/.6), and ensure displayed guidance and executable draft agree. Reuse existing draft fields/conversion functions; no parallel recipe or grinder schema. Preserve original source data separately from adapted values.

Present human instructions: ratio, adjustable dose, sensible rounded cumulative targets, elapsed start times, any source-defined drain/valve events, and final drawdown guidance. Display and timer use identical cumulative targets; final target equals displayed total exactly. Rescale from original proportions, not rounded outputs, and preserve source units. Do not turn timed pours into drain-triggered pours or invent exact pour durations. Replace internal projection disclaimers with concise source/adaptation language. Explain when a source is adapted to this coffee; use existing applicability data rather than claiming every named technique is ideal.

Exit: the reported 23 g Kalita185 recipe shows actionable grinder guidance labeled as an approximate starting point where calibration-derived, understandable schedule including the source's 3:30 drain target, and working Start/Save routes; scaling retains proportions and execution semantics. Unknown-grinder and qualitative-only-source checks must show honest guidance without an invented number.

### 3. Close the demonstrated conversational continuation gaps

Review existing changes in `api/_lib/ruphusOrchestrator.js`, `api/_lib/ruphusTools.js`, and related exact readers. Finish bounded exact-read recovery already added for Switch's 20 g follow-up and close hot Kalita temperature continuation. Preserve coffee/method/mode and current draft across follow-ups and corrections.

Use the existing typed response intent and tool/action outcomes to enforce fulfillment. Audit `actionableRecipeRequest`/`needsRecipeArtifact` so ordinary information is not forced into a recipe and natural requests are not dependent on magic verbs. Do not expand a keyword ladder, add another classifier/router, or rewrite the agent. A missing prerequisite should trigger its authorized read within existing budgets, not an irrelevant sensory question. Truly absent supported recipes can be drafted through existing generators; unavailable/invalid data remains distinct.

Before paid reruns, lock a small behavioral case set: the recorded Switch dose and Kalita temperature failures plus two paraphrases each (matching updated card and exact source-read prerequisite); an informational technique comparison (answer, no mandatory card); jar correction (new owner-scoped target); another technique (different supported named card); and make-that-permanent (current draft's native save/confirmation route, no invented save claim). Use deterministic provider/tool seams for these variants, then sample natural wording in native acceptance. Include the proposal_timing regression that previously stripped tools and asked an irrelevant sensory question.

Exit: requests and follow-ups produce matching actionable cards when appropriate, without repeated consent rituals; informative questions remain conversational. Recovery preserves authorization and does not fabricate success. If this cannot be achieved within existing contracts, report the concrete conflict before expanding architecture. After two unsuccessful repair cycles for the same journey, use one focused Opus/Fable diagnosis rather than repeat paid attempts blindly.

### 4. Verify one candidate, then prepare a separate release decision

First run focused deterministic tests for changed contracts and existing UI/action checks. Implementation approval includes a Dev-only Vercel preview backend and locally bundled Dev simulator assets using the established Dev build workflow, not a production or Capgo channel publication. Verify the simulator actually loads those assets and preview URL, not an older OTA. Preserve installed account storage; no uninstall or auth reset. If the established workflow cannot deliver this without changing native/auth configuration, report that concrete conflict before expanding scope. Capgo read permission is not required for this local-bundle route but remains a release prerequisite.

Then test native journeys in the already-signed-in Dev simulator. Preserve login and personal data, capture relevant pre-test recipe state, and undo test changes with verified readback. No phone or production writes; no authentication backdoor. Seeded backend evidence remains separate from signed-in native evidence.

| Journey | Required behavior |
|---|---|
| Hot V60 | Named alternative, ratio-first strength follow-up, scalable preview, Start/return |
| Iced V60 | Dose scaling preserves ice/water semantics; trial survives return/relaunch |
| Hot Kalita155 →185 | Size correction, temperature edit, selected grinder, source schedule, Start |
| Iced Kalita | Supported first/existing recipe and meaningful grinder-click change |
| Switch | Named technique, natural 20 g follow-up, valve/timer semantics intact |
| Aiden | First and existing profiles, coherent adjustment; ordinary profile view still opens/closes |

Run Tier A first: reported Kalita185 source journey, Switch20g, hot Kalita temperature, and Aiden ordinary view/open/close. Then Tier B: shortened chat smoke for the historically passing V60/iced/Aiden flows. Reuse each resulting card for native action checks rather than pay for repeated equivalent conversations. Every family must demonstrate preview, the applicable brew/trial handoff, Save/readback, and Undo/restored state. Most downstream button/readback checks need no new model call. Test navigation/relaunch across both manual and Aiden paths; Aiden acceptance does not send to or start hardware without separate authorization. Sample the small behavioral case set above in native conversations without creating a Cartesian test matrix. Use deterministic seams for stale/unavailable/invalid data; do not damage the signed-in account to manufacture faults.

Before native acceptance, create a scoped candidate commit without staging unrelated work or diagnostic ledgers/reports. Record its SHA, actual build-input state, native/bundled asset identity, backend deployment and Firebase environment; unrelated uncommitted build inputs must be excluded or explicitly reconciled, not hidden behind a SHA. Required final evidence must apply to the same candidate. After a repair, rerun affected journeys plus shared-boundary checks; rerun other journeys only when the change could affect them. Do not aggregate different model/runtime builds into a final PASS.

Observe response usefulness, visible card, rendered instructions, actual action result, and persisted state. A polite refusal on a supported happy path is FAIL, not PASS. A screenshot of a card is not timer/save evidence. Human taste/preference verdicts may remain pending; known engineering failures may not.

## Cost and execution controls

- One executor at a time for overlapping runtime/UI contracts. Luna can handle bounded display/copy work; use Opus for difficult shared-state work or if Luna's rework outweighs savings. Fable reviews this plan and only genuinely difficult unresolved decisions, not every small patch.
- Reuse existing tests and historical evidence; add only regressions for demonstrated gaps. No new evaluation framework, model tournament, research campaign, or repeated broad suite while unchanged.
- Before any paid app-provider testing, reconcile the existing $55 total authorization and cost ledger, estimate/reserve per-conversation costs using configured models, and fit the ordered run list within the verified remainder. The prior recorded remainder is not a current spending guarantee. Stop dispatch before exceeding authorization; unfinished rows remain NOT RUN, not PASS, while free deterministic work can continue. Disclose any additional authority needed. Claude subscription usage is separate and must not be misrepresented as free.
- Local tests precede paid native conversations. Keep a short results table and decisive screenshots/readbacks instead of large repeated reports.
- Do not change native plugins, RevenueCat, authentication, production rules, or real cloud coffee records as part of this repair.

## Release and completion boundary

Current read-only Vercel metadata identifies production deployment `dpl_B2vogTLLkRyGChP8nYzHVqYeNdsL` (September13); it does not provide a verified source SHA. Capgo channel readback failed with permission code42501, so current channel/phone OTA identity is unconfirmed. This does not block local repairs or Dev acceptance. Resolve release provenance/access before any publication; do not alter permissions to bypass it.

Implementation approval authorizes the repair/Dev verification scope, not production publication. A later release decision must identify exact tested assets/backend, compatibility and rollback target. No phone action is required to finish engineering. Report separately: implemented, passed final-candidate native acceptance, unverified, and deployed. Do not call this “perfect” or promise every future utterance; do not call it complete with observed unmet requirements.
