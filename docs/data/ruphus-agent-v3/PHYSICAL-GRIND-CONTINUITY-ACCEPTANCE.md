# Physical grinder and technique continuity acceptance

Plan: `docs/plans/2026-09-09-001-fix-ruphus-clicks-and-technique-continuity-plan.md`.

## Implementation and review

- Ode app labels now follow whole / .2 / .6, with physical-index micron conversion. Five manual adapters quantize new recipes; legacy AI handbrew repair quantizes invalid generated labels. Existing saved records are not rewritten.
- Exact proposal boundary rejects invalid Ode positions using trusted setup. The orchestrator can make one deterministic correction in the requested direction without another provider call. Full-patch invalid values cannot bypass validation.
- Owner-session reviews supply the actual named before/after schedule to follow-up turns, filtered by locked coffee/method and new-chat boundary. No client artifact gains authority.
- Repeated alternatives are rejected, without blocking safe ordinary retry. V60 family exclusions remain authoritative. Named cards and recipe headings share source identity.
- Sequential correctness/trust/UX review addressed: invalid-proposal round-limit failure, actual-pour count versus bloom ambiguity, stale cross-target projection, and decimal tie precision. No new auth or mutation authority, migration, source corpus, or production action.

## Current evidence

- Focused 12-file deterministic matrix: **53 passed, 0 failed**, rerun at 03c3cd1 after the native-discovered review-intent correction, including physical-grind/continuity tests and real orchestrator/tool recovery.
- `verify-brew-params.mjs` and `verify-grind-calibration.mjs`: passed. These retain historical baseline checks; they do not establish new physical hardware calibration.
- Recipe-first rendered harness: passed mobile/desktop, dose 13 → 20 g at 1:15 = 300 g, close/reopen, explicit Start, zero Save and network writes; new named-technique card opens a matching recipe heading. Screenshot: `/tmp/ruphus-named-technique-mobile.png`, visually inspected.
- Live provider with synthetic in-memory readers, actual production context/tools/orchestrator: sour Kalita returns one 5.6 → 5.2 card. Three provider calls, $0.001572, zero saved-recipe writes.
- Live comparison initially named the correct Kasuya technique but counted the bloom ambiguously. Added authoritative total water-addition count and total guide time. Rerun correctly states no-stir 50 g bloom plus four pulses to 120/180/240/300 g, 20 g dose, 1:15, Ode 7.2, 92°C, about 3:30. No new card/save. One call, $0.001445; initial probe $0.001226.
- Cumulative paid testing after these checks: $48.020282 of $55; approximately $6.979718 remains. Diagnostic ledger preserved outside this commit.

## Initial native findings (subsequently corrected)

The first updated native build (cb554aa) installed in place and launched on the signed-in Dev simulator, preserving login and inventory. A real native `Jar one kalita sour` turn returned “one physical click finer … 5.6 → 5.2,” with 13 g / 215 g / 94°C unchanged. Cost $0.002549. The next `Show recipe` turn wrongly recited the unchanged recipe instead of opening the suggested version ($0.001509). This is a failed handoff, not a native acceptance pass. Commit ddc34c1 adds explicit review-followup readiness and short extraction-report readiness plus prompt guidance and regressions. Follow-up native verification remains pending. Cumulative accounted spend is $48.024340 of $55, no open reservation.

Native build/install is Dev-only; no phone installation is claimed. No production Vercel, Capgo, Firebase rules, or saved coffee recipe has been changed by this repair. Simulator lease was released to GETUP after this attempt.

Full `npm test` still stops at the pre-existing `handbrew-timing-memory-integration.test.mjs` source-pattern assertion for `scaleRecipeForDose(recipe, effectiveDose)`. Both that test and the referenced modal are unchanged from 4e7a77a. Focused source ESLint, build, and diff checks pass; this does not claim the full repository suite is green.

## Final Dev acceptance

Final native source 03c3cd1: guarded preview `https://twomanybeans-ruphus-pt3y2juiy-tmanman90s-projects.vercel.app` (dpl_5ei6ZWQ8XfWC6ve7riHvSc1rL3xS) is READY and exact-commit matched. In-place XcodeBuildMCP build/install/launch passed on iPhone 17 Pro simulator 7EC6BF90-33B7-4B1A-A651-464B4AC9AA9E. Verified bundle com.talmeltzer.coffeehub.dev, display 2manybeans Dev, isolated Firebase twomanybeans-ruphus-dev, exact preview URL, Ask Professor Ruphus label, autoUpdate false and dev channel. Login and three rotation coffees remained present.

Observed final native journeys:
- `Jar one kalita sour` immediately emitted a 5.6 → 5.2 card. View recipe opened Kalita review (not timer), showing 5.2. Dose 13 → 20 g scaled water to 330 g at 1:16.5, retaining 5.2. Close returned to the durable card. No Save/Start tap. Cost $0.001385.
- `V60 different technique` emitted Tetsu Kasuya 4:6, prominently named on the card. View recipe matched the method, 20 g / 300 g / 1:15 / Ode 7.2 / 92°C. Close returned to the same card. Cost $0.001684.
- `How does it differ` compared the actual saved continuous-pour recipe against Kasuya's actual proposed five additions (50/120/180/240/300 g), 7.2, 92°C, about 3:30; no new card or substituted technique. Cost $0.001352.
- `Another one` produced a distinct James Hoffmann One-Cup V60 card, explicitly named, rather than repeating Kasuya. Cost $0.001493.
- Read-only comparison against the existing 48-recipe baseline reported zero changed recipes and Aiden unchanged. No restore write was necessary.

Simulator desktop typing/clipboard was unreliable, and AXe failed to load Xcode CoreSimulator architecture support. Native touch-keyboard control succeeded. One unintended welcome suggestion (`What should I brew today?`) was triggered during keyboard recovery; its observed $0.001665 telemetry was accounted explicitly, not treated as free. No coffee mutation resulted.

Follow-up live reproduction exposed a second part of the handoff: `read_recipe` did not call `setPreviewReadiness` (the composite evidence reader did). Initial reproduction truthfully failed the card check ($0.002602). Commit 03c3cd1 grounds readiness on the exact recipe read, with a real-tool regression. Live rerun of `Show recipe` after explicit 5.6 → 5.2 advice returned exactly one 5.2 card, two provider calls, $0.001284, zero saved-recipe writes. Accounted total is now $48.028226, remaining $6.971774. This live test uses synthetic readers and is not native evidence.

The scoped plan's engineering acceptance is complete: deterministic, rendered, live-provider and signed-in native evidence are distinguished above. Final cumulative paid-test spend is $48.035805 of $55, reserved $0, remaining $6.964195. This repair's paid probes added approximately 1.97 cents since the pre-turn ledger. Simulator lease released after final verification. The phone was not updated; no production deployment, Capgo upload/channel change, physical brew, or broader product-perfect claim is made.
