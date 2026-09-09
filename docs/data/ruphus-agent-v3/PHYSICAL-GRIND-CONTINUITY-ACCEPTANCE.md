# Physical grinder and technique continuity acceptance

Plan: `docs/plans/2026-09-09-001-fix-ruphus-clicks-and-technique-continuity-plan.md`.

## Implementation and review

- Ode app labels now follow whole / .2 / .6, with physical-index micron conversion. Five manual adapters quantize new recipes; legacy AI handbrew repair quantizes invalid generated labels. Existing saved records are not rewritten.
- Exact proposal boundary rejects invalid Ode positions using trusted setup. The orchestrator can make one deterministic correction in the requested direction without another provider call. Full-patch invalid values cannot bypass validation.
- Owner-session reviews supply the actual named before/after schedule to follow-up turns, filtered by locked coffee/method and new-chat boundary. No client artifact gains authority.
- Repeated alternatives are rejected, without blocking safe ordinary retry. V60 family exclusions remain authoritative. Named cards and recipe headings share source identity.
- Sequential correctness/trust/UX review addressed: invalid-proposal round-limit failure, actual-pour count versus bloom ambiguity, stale cross-target projection, and decimal tie precision. No new auth or mutation authority, migration, source corpus, or production action.

## Current evidence

- Focused 12-file deterministic matrix: **51 passed, 0 failed**, including seven new physical-grind/continuity tests and real orchestrator/tool recovery.
- `verify-brew-params.mjs` and `verify-grind-calibration.mjs`: passed. These retain historical baseline checks; they do not establish new physical hardware calibration.
- Recipe-first rendered harness: passed mobile/desktop, dose 13 → 20 g at 1:15 = 300 g, close/reopen, explicit Start, zero Save and network writes; new named-technique card opens a matching recipe heading. Screenshot: `/tmp/ruphus-named-technique-mobile.png`, visually inspected.
- Live provider with synthetic in-memory readers, actual production context/tools/orchestrator: sour Kalita returns one 5.6 → 5.2 card. Three provider calls, $0.001572, zero saved-recipe writes.
- Live comparison initially named the correct Kasuya technique but counted the bloom ambiguously. Added authoritative total water-addition count and total guide time. Rerun correctly states no-stir 50 g bloom plus four pulses to 120/180/240/300 g, 20 g dose, 1:15, Ode 7.2, 92°C, about 3:30. No new card/save. One call, $0.001445; initial probe $0.001226.
- Cumulative paid testing after these checks: $48.020282 of $55; approximately $6.979718 remains. Diagnostic ledger preserved outside this commit.

## Pending acceptance

Native signed-in Dev simulator and updated Dev deployment/install remain pending. GETUP currently holds the shared simulator for full XCTest; do not interrupt it. This record is not a phone-install or native-journey PASS. No production Vercel, Capgo, Firebase rules, or real coffee record has been changed by this repair.

## Operational checks

After Dev installation, verify exact preview identity, isolated Firebase project, Dev bundle, autoUpdate false, and preserved login. Run sour → recipe view → return → different technique → comparison. Watch for `physical_grind_required`, `duplicate_alternative`, `turn_failed`, inconsistent named recipe, or wrong coffee/method. If a regression appears, keep production untouched and repair Dev before declaring ready.
