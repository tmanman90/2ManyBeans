> Historical evaluation report. The final reviewed candidate and current validation are documented in [the independent review handoff](../reviews/ruphus-brew-evidence/review.md).

# Ruphus completed-brew evidence — review and counterfactual

Prepared October 12, 2026. **Implemented locally; not deployed.** The original migration checkout and its existing work were preserved. The isolated checkout is `.worktrees/ruphus-brew-evidence`, detached from verified production commit `5ce7f2d3b53479e49259097b191e0b5d4eabd9c4` (app 1.1.254, branch `codex/timer-production-release`). Production was verified before implementation; this is not a claim about later deployments.

## Finding and implementation

The completed FRUKT Casa Almeida Barreto / Kalita 185 trial stored the executed **18 g / 279 g, 1:15.5, 93°C, Ode 6.2** recipe in its snapshot. The attempt’s top-level 24 g dose describes source binding, not the resized execution. Its matching timing event records **203,813 ms (about 3:24)**; the five-minute recipe target was not a measurement. “Better but still kind of thin” was conversational feedback, not a saved tasting. The later 1:14.5 proposal was untried.

- Read-time projection gives the executed snapshot priority, joins only matching usable timing and explicitly linked tasting feedback, sorts recent brews before truncation, and distinguishes completed attempts. Historical records are untouched.
- Both recipe/evidence tools expose completed snapshots separately from saved recipes and untried reviews, with owner-scoped opaque brew references. Measured and planned timing are explicit separate fields; conflicting/missing measurements stay unknown.
- A proposal must choose a completed-brew, current-review, or saved-recipe baseline when eligible completed brews are available. Completed-brew references are scoped to the coffee, slot and equipment. A grind experiment on the completed trial preserves its dose, water, temperature and pours; a concurrent dose resize is rejected.
- Saved-source hashes and persistence/rollback semantics remain tied to the canonical saved recipe. The displayed experiment’s before/after comparison uses the chosen executed baseline. No migrations or historical rewrites were introduced.
- Prompt guidance requires reassessing partial/failed experiments and clarifying uncertain cup identity. It does not mandate finer grind for thinness or force a target duration. Exact neighboring Ode clicks and the pre-existing 280-character explanation limit are exposed to the provider.

## Bounded live comparison

Existing authorized provider access succeeded. Model `gpt-5.6-luna`, reasoning `medium`, 900 output-token cap, 4,096-byte dynamic evidence cap and configured 1,000,000 input-token limit were retained. Requests were additionally capped at 200,000 bytes and 24 total provider calls. There was no model fallback, new credential, account change or production endpoint call. Tool reads were fixture readers and all proposals stayed in memory.

The fixture reconstructs the verified case’s numbers, source-dose conflict, completed status, measured timing, relevant conversation and untried draft with synthetic IDs. It uses the production recipe generator for full executable snapshots; it is **not a byte-for-byte historical prompt or record replay**. Pour wording and the shortened action receipt are reconstructed. Original production tools/prompt and corrected tools/prompt are compared together, so the experiment does not isolate which individual change caused the behavioral difference.

| Scenario | Original arm | Most recent corrected observation |
| --- | --- | --- |
| Partial improvement | Proposed 24 g / 360 g at 1:15, incorrectly based on saved 1:16.5 rather than the tasted trial | Asked whether it was thin but sweet/clean or sour/sharp; no new recipe was fabricated |
| Finer-grind challenge | Proposed 6.2 → 5.6 on the untried 24 g / 348 g, 1:14.5 draft | Proposed **6.2 → 6 on 18 g / 279 g, 1:15.5**, preserving temperature and pours; cited measured 3:24 |
| Ambiguous cup, two completed recipes | Asked a taste question without first identifying the cup | Asked whether the thin cup was 24 g / 396 g or 18 g / 279 g, correctly identifying only the latter as measured 3:24 |

The first corrected sample still repeated the ratio test and miscounted an Ode click. The next corrected sample improved those but confused planned and measured durations. Those findings led to exact neighboring-click guidance, explicit timing provenance and one targeted recheck each. All intermediate results are retained, rather than selecting only favorable samples:

- [Initial six-turn comparison](ruphus-brew-counterfactual.json): 14 provider calls.
- [Three corrected follow-ups](ruphus-brew-counterfactual-final.json): 6 calls.
- [Measured-time ambiguity recheck](ruphus-brew-counterfactual-timing.json): 2 calls.
- [Final grind recheck](ruphus-brew-counterfactual-grind.json): 2 calls.

This is a small, adaptive diagnostic evaluation, not a reliability benchmark or independent holdout. There is one observation per arm/case, followed by targeted fixes; no broad statistical claim is justified. The final grind answer’s statement that a sharper cup “points away from more extraction” is questionable brewing advice. Numerical continuity and timing attribution improved; consistently expert sensory reasoning is **not proven**. The final partial-improvement and ambiguity cases were not rerun after the final explanation-schema-only change.

## Validation and remaining limits

**110 focused tests pass**, including eight new regressions covering snapshot authority, timing joins, feedback provenance, completed versus untried baselines, one-variable preservation, ordering, stable references, equipment/owner scope and resize rejection. `git diff --check` passes.

A broader run before the final narrow refinements returned 704 passing and 14 failing tests. Eight failures were reproduced with the untouched production implementations: attempt-dismissal wiring, four frozen eval-corpus expectations, an eval-report grind fixture, shared timer legacy restoration, and technique-runtime ratio expectation. Six browser tests initially could not bind localhost; after retrying with access they were blocked by the missing installed Playwright Chromium executable. No browser installation was performed. The whole app was not built or deployed.

Recipe reads now perform bounded supplementary history reads. The production proposal write path itself was not exercised live; existing repository transaction tests pass. New baseline selection intentionally requires an explicit choice where completed history is available; correct conversational identification still depends on model reasoning. A larger independent evaluation and local browser verification remain appropriate before release.

Reproduce focused validation:

```sh
node --test scripts/ruphus-brew-evidence.test.mjs scripts/ruphus-evidence.test.mjs scripts/ruphus-physical-grind.test.mjs scripts/ruphus-proposal-continuity.test.mjs scripts/ruphus-trial-recovery.test.mjs scripts/ruphus-provider-contract.test.mjs scripts/ruphus-sensory-followup.test.mjs scripts/ruphus-repository-transaction.test.mjs scripts/ruphus-context.test.mjs scripts/ruphus-u3-runtime.test.mjs scripts/ruphus-source-backend.test.mjs
```

The optional live harness is `scripts/ruphus-brew-counterfactual.mjs`. It requires an existing authorized `OPENAI_API_KEY` supplied by its caller; it never fetches credentials. It must not be included in ordinary tests. Reports preserve model text, tool results, proposals and usage. No provider key or real account/document identifier is stored in the fixture or reports.

Recorded usage across all comparisons: **24 provider calls**, estimated **$0.03656** using the repository pricing registry (not a billing reconciliation).

Final implementation SHA-256 hashes:

- `api/_lib/ruphusBrewEvidence.js`: `40b69596a7d961938b2956d6481ed8fed244a387fb4498fcb1058aba3e11447d`
- `api/_lib/ruphusEvidence.js`: `faa1870f920b66bd697858f3ed51cccc64dbda282bb63e78e64676d8deb22a36`
- `api/_lib/ruphusTools.js`: `37c5bc43701d66e0d0284fa9eb0bc6696b46b80f084453ee68050e0d620f6f19`
- `api/_lib/ruphusPrompt.js`: `621394b5e0a25ea862f491a5fed88e178dc8b0bf2e2f048c3200d8466a16810c`
