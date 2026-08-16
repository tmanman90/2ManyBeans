# V60 Switch shadow report — 2026-08-15

Produced by `scripts/v60-switch-recipe-compare.mjs` (offline, deterministic, no network, no Firestore). Run with `node scripts/v60-switch-recipe-compare.mjs` for the human-readable form, or `--json` for the raw report object. Companion to `docs/data/kalita-recipe-shadow-report.md`'s format, expanded per U5's task spec (named-recipe reproduction, structural audit, determinism, cutover criteria).

## Decision: candidate stays behind the `v60Variant` toggle, DEV-reachable only, no production cutover

Per U3, `v60Variant` defaults to `'classic'` and the Switch adapter is only reachable via an explicit user toggle in `HandBrewModal`. This report is the evidence gate for **when that toggle becomes safe to leave on by default** (or, longer term, ship without a toggle) — it is not itself a cutover.

## a. Named-recipe reproduction (medium preset, dose=20g, washed)

Adapter output: **ratio 1:15, temp 92°C → 70°C, total 185s (3:05)**.

| Target | Dimension | Adapter | Target | Diff | Tolerance | Result |
|---|---|---|---|---|---|---|
| Kasuya resolved hybrid | ratio | 1:15 | 1:14 | +1.0 | ±0.7 | **OUTSIDE** |
| Kasuya resolved hybrid | tempPhase1C | 92°C | 90°C | +2°C | ±3°C | within |
| Kasuya resolved hybrid | tempPhase2C | 70°C | 70°C | 0°C | ±3°C | **within (exact)** |
| Kasuya resolved hybrid | valveCloseSeconds | 60s | 75s | -15s | ±20s | within |
| Kasuya resolved hybrid | valveOpenSeconds | 130s | 105s | +25s | ±20s | **OUTSIDE** |
| Kasuya resolved hybrid | phase1WaterPct | 43pp | 42.9pp | +0.1pp | ±10pp | within |
| Coffee Chronicler | ratio | 1:15 | 1:16 | -1.0 | ±0.7 | **OUTSIDE** |
| Coffee Chronicler | tempPhase1C | 92°C | not stated | n/a | — | not applicable |
| Coffee Chronicler | tempPhase2C | 70°C | not stated | n/a | — | not applicable |
| Coffee Chronicler | valveCloseSeconds | 60s | 45s | +15s | ±20s | within |
| Coffee Chronicler | valveOpenSeconds | 130s | 120s | +10s | ±20s | within |
| Coffee Chronicler | phase1WaterPct | 43pp | 50pp | -7pp | ±10pp | within |

**Read honestly, this is exactly what the design predicts, not a failure.** The methodology brief (§3) states up front that the medium preset is a deliberate Chronicler-steep-window × Kasuya-temp-split blend, not a reproduction of either recipe. The two "OUTSIDE" findings are both explained by that blend:

- **Ratio** sits at 1:15, one full point off both Kasuya's 1:14 and Chronicler's 1:16, because 1:15 is R5's band midpoint, not either source's number. Neither miss is "wildly off" (>2x tolerance) — both are exactly the width of a single deliberate interpolation step.
- **valveOpenSeconds** (130s) misses Kasuya's 105s by 25s (5s past the ±20s band) because the adapter intentionally lengthens Kasuya's ~30s top-up-then-drain window into a full Chronicler-shaped steep (per brief §3's explicit statement that Kasuya's structure is "closer to a pour 2 with the valve briefly closed than a true extended steep"). This is the one dimension worth a human sanity-check before cutover, not because it's a bug, but because it's the largest single miss in the table.

**The two dimensions each named recipe was specifically chosen to validate both land inside tolerance:** Kasuya's signature temperature-drop (`tempPhase2C`) reproduces exactly (0°C diff), and Chronicler's steep-window shape (`phase1WaterPct`) reproduces within 0.1pp of the Kasuya number and within tolerance of Chronicler's. That is the strongest evidence the blend is doing what it was designed to do.

### Secondary reference points (informational only, not tolerance-graded)

- **Kasuya Super Hybrid v2** (20g:300g, 1:15, 90°C→70-80°C): closed-bloom-first structure, not directly time-comparable to the shipped open-first template. Ratio (1:15) happens to match the adapter's medium ratio exactly — coincidental, not designed.
- **Hario booklet — Zhang everyday** (16g:240g, 1:15, 92°C single-temp): single-source manufacturer booklet, no independent corroboration. Ratio and `tempPhase1` both land close to the adapter's medium preset; not scored, dose differs.

## b. Structural audit

69 rows total: 9 from `docs/data/v60-switch-recipe-evaluation-beans.json`, 60 from a synthetic `{light,medium,dark} x {15,18,20,25,30}g x {washed,anaerobic} x {fellow-ode-gen2,comandante-c40}` grid built specifically to cover the dose floor (15g), dose ceiling (30g), every roast/process pairing, and a second grinder, beyond what the evaluation-bean matrix guarantees.

- **0 error rows.** Every configuration — including the deliberately sparse/malformed entries in the evaluation-bean matrix (`sparse-switch-unknown` with a null dose, `contradictory-switch-source` with a "washed natural" process string, `unknown-profile-switch` with an unrecognized roast/grinder) — resolved to a valid, contract-passing recipe via the adapter's documented defaulting (`normalizeSwitchDose`, `normalizeSwitchRoast`, unmatched-grinder fallback to `fellow-ode-gen2`'s micron scale), not a silent crash or a stale cached value.
- **20 roast-differentiation groups checked** (same dose/grinder/process, comparing light vs. medium vs. dark). **0 unexplained anomalies.** Two genuinely real convergence patterns were found and are reported by the comparator separately from the anomaly count (not silently dropped, not treated as script bugs):
  - **Expected process-override convergence (6 groups, no capacity cap involved):** at 15g/18g/20g doses under the **anaerobic override**, light, medium, and dark all converge on **ratio 1:16.5**; light and medium (but not dark) also converge on **tempPhase1 91°C**. Root cause, verified directly against `V60_SWITCH_PROCESS_OVERRIDE` in `src/data/v60SwitchConfiguration.js`: the anaerobic override applies a ratio floor (`clamp(max(presetRatio, 16.5), 16.5, 17)`) and a temperature ceiling (`clamp(presetTempPhase1, 88, 91)`) on top of the roast preset, "regardless of roast level" by design (brief §5, R5). Light's own baseline ratio (16.5) and dark/medium's baselines (13.5/15) all sit at or below the floor, so all three land on 16.5; light's 95°C and medium's 92°C both exceed the 91°C ceiling and land on the same clamped 91°C, while dark's 89°C already sits inside the band and stays distinct. Grind offset and total brew time still differ by roast under anaerobic (the override doesn't touch those), so the three recipes remain distinct overall, just on two of six dimensions. **Worth a taster's attention in the blind trials below** — it means the roast preset table effectively stops differentiating on ratio/temp specifically for naturally/anaerobically processed beans, which is a legitimate design tradeoff, not a bug, but one Tal should taste through before signing off.
  - **Expected capacity-cap collisions (8 groups, at 25g/30g doses):** the 340g Switch-03 water cap (`resolveSwitchWater`) clamps water for two or three roast presets to the same value at these higher doses, recomputing their effective ratios to the same number; it also independently makes the anaerobic ratio floor unreachable at these doses (the requested anaerobic ratio would exceed 340g, so it clamps back down below 16.5). Both are the documented, intentional behavior of `resolveSwitchWater`'s doc comment. Every affected row carries `SWITCH_WATER_CAP_APPLIED`, so the app-side UI has a hook to explain the clamp to Tal if he doses a Switch brew above ~23g on a lighter/higher-ratio roast.
- **30 anaerobic-override pairs checked** (same dose/roast/grinder, washed vs. anaerobic). All pass: anaerobic temp always lands in the 88-91°C band, grind always coarsens vs. the same-roast washed baseline, and `SWITCH_ANAEROBIC_OVERRIDE` is always present.

## c. Determinism

- **Per-config byte-equivalence:** pass — 5 representative configs (each roast, plus an anaerobic and a capped-dose variant) generate byte-identical JSON across two calls.
- **Whole-report byte-equivalence:** pass — the named-recipe section and structural-audit section serialize identically across two independent report builds.
- **Comparator test (`scripts/v60-switch-recipe-compare.test.mjs`):** asserts the comparator runs end to end, `buildReport()` is `deepEqual` across repeated calls, malformed adapter output (a synthetically broken recipe object, and an out-of-bounds-dose config) is reported as an `error` state rather than silently passing, and that "not stated by source" target dimensions (e.g., Chronicler's unstated temperature) are excluded from the applicable/tolerance count rather than defaulting to a false "within tolerance".

## Cutover criteria (what must be true to flip `v60Variant` default to Switch-available in prod)

All of the following, not any subset:

1. **Structural/offline gates green:** `npm run test:recipe-engine` full chain passes (includes `v60-switch-adapter.test.mjs`, `v60-switch-recipe-contract.test.mjs`, `v60-switch-runtime-contract.test.mjs`, `handbrew-v60-switch-integration.test.mjs`, and this comparator's test) plus `scripts/verify-brew-params.mjs` and `scripts/verify-grind-calibration.mjs`.
2. **This comparator stays green** on every subsequent adapter change: 0 error rows, determinism pass, and no *new* named-recipe dimension outside tolerance beyond the two already-documented and explained above (ratio and `valveOpenSeconds` vs. Kasuya). A new outside-tolerance dimension appearing without a design explanation in this file is a stop-ship signal, not a number to quietly widen a tolerance around.
3. **Blind trials completed and reviewed** across at least the three profiles in `docs/data/v60-switch-blind-trial-protocol.md` (light washed, natural, medium/dark) on Tal's actual physical Switch — see that document for the full protocol and green-light/revision criteria.
4. **No structural gate regression** in the trial cups: every trial recipe must pass the runtime contract (valid timer sequence, drawdown completes inside budget, valve close/open steps present) before sensory preference is even considered, per the blind-trial protocol.
5. **Tal's explicit sign-off** after reviewing this report and the trial log, per house workflow (device sign-off before production channel).

If all five hold, the recommended next step is flipping `v60Variant`'s **default** value in `useUserProfile.jsx` from `'classic'` to `'switch'` for new users only (existing users' persisted preference is untouched — this is additive, matching the Kalita precedent's "existing keyed and legacy hand-brew recipes remain readable" invariant). Full unconditional cutover (removing the toggle) is out of scope for this report and should get its own future evidence pass after real-world Switch usage data exists.

## Rollback

The variant selector ships **defaulted to classic** (`v60Variant: 'classic'` in `useUserProfile.jsx`), and Switch generation is only reachable through an explicit per-user toggle in `HandBrewModal`. There is therefore no "cutover to roll back from" in the traditional sense yet — **"rollback" here means the preference default**: if a problem surfaces after the criteria above are met and the default is flipped, the fix is reverting that one default value (or, for an individual user, toggling their own `v60Variant` preference back to classic in the app), not a deploy rollback. Legacy classic-keyed cached and saved recipes are unaffected either way (variant is additive metadata, per U3).
