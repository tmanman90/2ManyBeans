# V60 Switch shadow report — 2026-08-15 (Revised 2026-08-16)

**Revision note:** Regenerated after the 2026-08-16 single-temperature mandate (`docs/research/2026-08-15-v60-switch-methodology-brief.md` "Revision 2026-08-16 — single-temperature mandate"). `temp_phase2` is gone; the comparator's named-recipe reproduction section was restructured: **Coffee Chronicler is now the primary, fully-graded target** (the medium preset's single 92°C kettle temperature matches Chronicler's own stated constant temperature exactly), and **Kasuya's resolved hybrid is demoted to a structure-only comparison** (its own recipe is still dual-temp, so its temperature dimension is marked not-applicable-by-design rather than graded pass/fail — see `docs/data/v60-switch-source-registry.md`'s 2026-08-16 addendum and `scripts/v60-switch-recipe-compare.mjs`'s `mode` field on each target). The structural audit (§b) and determinism (§c) sections are otherwise unchanged in method, regenerated against the new adapter output. Everything below reflects `v60-switch-engine-v1` / `v60-switch-rules-v2-single-temp`.

Produced by `scripts/v60-switch-recipe-compare.mjs` (offline, deterministic, no network, no Firestore). Run with `node scripts/v60-switch-recipe-compare.mjs` for the human-readable form, or `--json` for the raw report object. Companion to `docs/data/kalita-recipe-shadow-report.md`'s format, expanded per U5's task spec (named-recipe reproduction, structural audit, determinism, cutover criteria).

## Decision: candidate stays behind the `v60Variant` toggle, DEV-reachable only, no production cutover

Per U3, `v60Variant` defaults to `'classic'` and the Switch adapter is only reachable via an explicit user toggle in `HandBrewModal`. This report is the evidence gate for **when that toggle becomes safe to leave on by default** (or, longer term, ship without a toggle) — it is not itself a cutover.

## a. Named-recipe reproduction (medium preset, dose=20g, washed)

Adapter output: **ratio 1:15, single kettle temperature 92°C, total 170s (2:50)**.

### vs Coffee Chronicler — PRIMARY target, mode: full

| Dimension | Adapter | Target | Diff | Tolerance | Result |
|---|---|---|---|---|---|
| ratio | 1:15 | 1:15 | 0 | ±0.7 | **within (exact)** |
| tempC | 92°C | 92°C | 0°C | ±3°C | **within (exact)** |
| valveCloseSeconds | 40s | 45s | -5s | ±20s | within |
| valveOpenSeconds | 115s | 120s | -5s | ±20s | within |
| phase1WaterPct | 43pp | 50pp | -7pp | ±10pp | within |

**Zero dimensions outside tolerance, zero wildly off.** This is the direct payoff of the single-temperature revision: because the medium preset's single kettle temperature (92°C) is Chronicler's own stated constant temperature rather than a Kasuya/Chronicler blend, ratio and temperature now match exactly, and every timing dimension sits comfortably inside tolerance. Chronicler is graded on every stated dimension (no "not stated by source" gaps — this revision's research pass confirmed Chronicler's 92°C constant directly, unlike the original dual-temp-era registry entry which had no numeric temperature at all).

### vs Kasuya resolved hybrid — STRUCTURE-ONLY since Revision 2026-08-16, mode: structural-only

| Dimension | Adapter | Target | Diff | Tolerance | Result |
|---|---|---|---|---|---|
| ratio | 1:15 | 1:14 | +1.0 | ±0.7 | OUTSIDE (informational) |
| tempC | 92°C | — | — | — | **not applicable by design** |
| valveCloseSeconds | 40s | 75s | -35s | ±20s | OUTSIDE (informational) |
| valveOpenSeconds | 115s | 105s | +10s | ±20s | within |
| phase1WaterPct | 43pp | 42.9pp | +0.1pp | ±10pp | within |

**Read honestly, this is not a failure — it's the expected consequence of the revision, and it is not scored as one.** Kasuya's own published recipe is still dual-temp (90°C→70°C); the adapter no longer has a dual-temp concept to compare against it, so `tempC` is explicitly marked not-applicable rather than silently defaulted to a pass or forced into a false comparison. The two OUTSIDE dimensions (`ratio`, `valveCloseSeconds`) are recorded for visibility only — `scripts/v60-switch-recipe-compare.mjs`'s exit-code check does not read them, and `docs/data/v60-switch-shadow-report.md`'s cutover criteria (below) do not gate on them. The `phase1WaterPct` dimension — the "phase split" half of "valve ordering + phase split" that this structure-only comparison is actually meant to validate — still lands within 0.1pp of Kasuya's own number, and the valve-open timing is within tolerance too, so the shipped template's *structure* (percolation-first, open→close→open) still tracks Kasuya's shape even though the numeric temperature and close-timing no longer chase it.

### Secondary reference points (informational only, not tolerance-graded)

- **Kasuya Super Hybrid v2** (20g:300g, 1:15, 90°C→70-80°C): closed-bloom-first structure, not directly time-comparable to the shipped open-first template. Also the source of this revision's "+1 coarser than the old dual-temp preset" grind-offset instruction for the medium preset (`[kasuya-super-hybrid-v2]`).
- **Hario booklet — Zhang everyday** (16g:240g, 1:15, 92°C single-temp): single-source manufacturer booklet, no independent corroboration. Notably already single-temperature — this secondary target required no revision under the single-temp mandate.

## b. Structural audit

69 rows total: 9 from `docs/data/v60-switch-recipe-evaluation-beans.json`, 60 from a synthetic `{light,medium,dark} x {15,18,20,25,30}g x {washed,anaerobic} x {fellow-ode-gen2,comandante-c40}` grid built specifically to cover the dose floor (15g), dose ceiling (30g), every roast/process pairing, and a second grinder, beyond what the evaluation-bean matrix guarantees.

- **0 error rows.** Every configuration — including the deliberately sparse/malformed entries in the evaluation-bean matrix (`sparse-switch-unknown` with a null dose, `contradictory-switch-source` with a "washed natural" process string, `unknown-profile-switch` with an unrecognized roast/grinder) — resolved to a valid, contract-passing recipe via the adapter's documented defaulting, not a silent crash or a stale cached value.
- **20 roast-differentiation groups checked** (same dose/grinder/process, comparing light vs. medium vs. dark). **0 unexplained anomalies.** The same two convergence patterns documented in the original (dual-temp-era) report still occur, unchanged in mechanism — they are properties of the capacity cap and the anaerobic override, not of the temperature model that changed:
  - **Expected process-override convergence (6 groups, no capacity cap involved):** at 15g/18g/20g doses under the anaerobic override, light, medium, and dark all converge on ratio 1:16.5 (the anaerobic ratio floor). Temperature convergence under anaerobic is unchanged in mechanism (still a `clamp` into the 88-91°C band), just now clamping a single temperature instead of two.
  - **Expected capacity-cap collisions (8 groups, at 25g/30g doses):** the 340g Switch-03 water cap clamps water for two or three roast presets to the same value at higher doses, recomputing their effective ratios to the same number.
- **30 anaerobic-override pairs checked** (same dose/roast/grinder, washed vs. anaerobic). All pass: anaerobic temp always lands in the 88-91°C band, grind always coarsens vs. the same-roast washed baseline, and `SWITCH_ANAEROBIC_OVERRIDE` is always present.
- **New since this revision (not yet a separate gate column, verified manually against this run):** every roast-differentiation row's reason codes were spot-checked for the bean-driven valve-timing modulation codes (`SWITCH_LATE_CLOSE_CLARITY`/`SWITCH_STEEP_SHORTENED_CLARITY`, `SWITCH_EARLY_CLOSE_SWEETNESS`/`SWITCH_STEEP_EXTENDED_BODY`, or the low-confidence/neutral baseline codes) — every row in this structural audit is generated with `intent = {}` (no extraction-intent object passed), so all 69 rows correctly carry `SWITCH_VALVE_TIMING_BASELINE_LOW_CONFIDENCE` and show baseline close/steep timing. The modulation's actual differentiation behavior is covered by `scripts/v60-switch-adapter.test.mjs`'s dedicated modulation section (two same-roast beans with different `extractionIntent` output produce different valve-close timestamps), not by this comparator, which intentionally isolates the roast/process/capacity axes from the bean-evidence axis.

## c. Determinism

- **Per-config byte-equivalence:** pass — 5 representative configs (each roast, plus an anaerobic and a capped-dose variant) generate byte-identical JSON across two calls.
- **Whole-report byte-equivalence:** pass — the named-recipe section and structural-audit section serialize identically across two independent report builds.
- **Comparator test (`scripts/v60-switch-recipe-compare.test.mjs`):** asserts the comparator runs end to end, `buildReport()` is `deepEqual` across repeated calls, malformed adapter output is reported as an `error` state rather than silently passing, Chronicler's `mode: 'full'` grades its stated temperature exactly, and Kasuya's `mode: 'structural-only'` correctly marks its temperature dimension not-applicable rather than defaulting to a false "within tolerance".

## Cutover criteria (what must be true to flip `v60Variant` default to Switch-available in prod)

All of the following, not any subset:

1. **Structural/offline gates green:** `npm run test:recipe-engine` full chain passes (includes `v60-switch-adapter.test.mjs`, `v60-switch-recipe-contract.test.mjs`, `v60-switch-runtime-contract.test.mjs`, `handbrew-v60-switch-integration.test.mjs`, and this comparator's test) plus `scripts/verify-brew-params.mjs` and `scripts/verify-grind-calibration.mjs`.
2. **This comparator stays green** on every subsequent adapter change: 0 error rows, determinism pass, and no *new* Chronicler (full-mode) dimension outside tolerance. Kasuya's structure-only comparison is informational and does not gate — a new Kasuya outside-tolerance dimension is worth a human glance but is not a stop-ship signal by itself, per its mode. A new Chronicler outside-tolerance dimension appearing without a design explanation in this file is a stop-ship signal.
3. **Blind trials completed and reviewed** across at least the three profiles in `docs/data/v60-switch-blind-trial-protocol.md` (light washed, natural, medium/dark) on Tal's actual physical Switch — see that document for the full protocol and green-light/revision criteria. The blind-trial protocol should specifically taste through the single-temperature revision's premise (does the one-kettle recipe actually simplify home brewing without a quality regression vs. the old dual-temp candidate) and the bean-driven valve-timing differentiation (do a washed and a natural at the same roast level actually taste and feel different when brewed per their different valve schedules).
4. **No structural gate regression** in the trial cups: every trial recipe must pass the runtime contract (valid timer sequence, drawdown completes inside budget, valve close/open steps present) before sensory preference is even considered, per the blind-trial protocol.
5. **Tal's explicit sign-off** after reviewing this report and the trial log, per house workflow (device sign-off before production channel).

If all five hold, the recommended next step is flipping `v60Variant`'s **default** value in `useUserProfile.jsx` from `'classic'` to `'switch'` for new users only (existing users' persisted preference is untouched — this is additive, matching the Kalita precedent's "existing keyed and legacy hand-brew recipes remain readable" invariant). Full unconditional cutover (removing the toggle) is out of scope for this report and should get its own future evidence pass after real-world Switch usage data exists.

## Rollback

The variant selector ships **defaulted to classic** (`v60Variant: 'classic'` in `useUserProfile.jsx`), and Switch generation is only reachable through an explicit per-user toggle in `HandBrewModal`. There is therefore no "cutover to roll back from" in the traditional sense yet — **"rollback" here means the preference default**: if a problem surfaces after the criteria above are met and the default is flipped, the fix is reverting that one default value (or, for an individual user, toggling their own `v60Variant` preference back to classic in the app), not a deploy rollback. Legacy classic-keyed cached and saved recipes are unaffected either way (variant is additive metadata, per U3). The `V60_SWITCH_RULES_VERSION` bump to `v60-switch-rules-v2-single-temp` (this revision) additionally invalidates any cached dual-temp Switch candidate from before 2026-08-16 — those regenerate under the single-temp rules on next read, they are not silently served stale.
