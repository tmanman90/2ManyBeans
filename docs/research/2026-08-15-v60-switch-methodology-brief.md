---
title: "V60 Switch methodology brief — parametric template spec"
date: 2026-08-15
status: research
---

# V60 Switch Methodology Brief

Feeds U2 (`docs/plans/2026-08-15-001-feat-v60-switch-recipes-plan.md`). Every number below cites a row of `docs/data/v60-switch-source-registry.md` inline as `[source-id]`, or is explicitly labeled `[derived/interpolated]` when it blends multiple sources, applies a general brewing-science principle, or fills a gap no source states directly. No number in this brief is invented without one of those two labels.

Citation key used below: `[Kasuya-hybrid-resolved]` = comoricoffee.com + gota.cafe (2-of-3 corroborated original hybrid, 20g:280g); `[Kasuya-super-hybrid-v2]` = roastaroma.com + timer.coffee (evolved recipe, 20g:300g); `[Chronicler-primary]` = coffeechronicler.com; `[Hoffmann-hybrid-secondary]` = unpacking.coffee; `[Hoffmann-immersion-secondary]` = beanbook.app; `[Kaldis-primary]` = kaldiscoffee.com; `[Hario-primary]` = Hario official product pages; `[Hario-booklet-manufacturer]` = global.hario.com recipe booklet (Zhang/Cheung/Inaba); `[Blind-Coffee-Roaster-theory]` = theblindcoffeeroaster.com.au; `[Coffee-Compass-theory]` = thecoffeecompass.com; `[Barista-Hustle-theory]` = drawdown lesson, reused from Kalita registry; `[World-Atlas-theory]` = `~/.claude/books/world-atlas-coffee.md` §5-6; `[home-barista-community]`, `[reddit-gut-check]` = low-confidence community sources.

---

## 1. Hardware conclusion and dose bounds

Hario ships the Switch in **two sizes**: 02 (200ml) and 03 (360ml) `[Hario-primary]`. The 03/360ml is the flagship/common size and is required by nearly every published recipe using more than ~280g water — Kasuya's both generations, Hoffmann's hybrid — while 02/200ml is a smaller-batch variant used by Coffee Chronicler's own device and Kaldi's guide `[Hario-primary]`, `[Chronicler-primary]`, `[Kaldis-primary]`. This corrects the plan's tentative "app assumption is 02" framing: **this slice targets Switch 03 (360ml) as the default configuration**, using standard V60-03 paper filters `[Hario-primary]`.

- **Configuration key:** `v60:03:standard-paper:switch:hot` (03, not 02).
- **Dose bounds:** 15g floor `[Chronicler-primary]` to 30g ceiling `[World-Atlas-theory large-batch V60 precedent + Hario-booklet-manufacturer upper range]`, i.e. the same floor/ceiling logic as classic V60 `[derived/interpolated]`.
- **Water/capacity ceiling:** hard cap liquid at **340g** — a safety margin under the 360ml glass capacity that accounts for bloom foam headroom `[Hario-primary + derived/interpolated]`. No published Switch recipe in the registry exceeds 330g `[Hoffmann-hybrid-secondary]`.
- Manufacturer does not publish a dose range; the bounds above are derived from physical capacity and observed recipe range, not a Hario spec `[Hario-primary]`.

---

## 2. Why immersion dominates extraction, and what it means for the engine

Filter coffee extraction is driven by contact time and agitation: finer grind and longer contact both increase extraction; agitation increases extraction further `[World-Atlas-theory]`. In percolation (classic V60), water constantly exits the bed, so contact time per particle is short and pour cadence is the primary strength dial. In immersion (valve closed), water stays in full contact with all grounds simultaneously, so the closed-valve duration — not the pour schedule — becomes the dominant extraction lever. The home-barista community debate (fine+short-steep vs. coarser+long-steep, both viable, no consensus winner) is itself evidence that valve-closed duration is doing the work the grind size normally does alone in a percolation-only method `[home-barista-community]`. Kasuya's own second-phase temperature drop (93°C→70°C or 90°C→70°C) exists specifically to blunt over-extraction risk during a hot immersion window `[Kasuya-hybrid-resolved]` — further confirming that closed-valve dwell time at a given temperature is the primary astringency/strength risk, not the pour count. No source gives a verbatim "X% of extraction happens during immersion" figure; any such framing in this brief or the adapter is `[derived/interpolated]` from the above, not a citation.

**Engine implication:** valve actions (`Close valve` / `Open valve`) must be first-class timed steps with exact timestamps and phase labels (`percolation` / `immersion` / `drawdown`), per R4. Grind offset must be computed primarily against **total valve-closed duration**, per R6 — not total brew time, not pour count — because that duration is the actual extraction dial the physical device exposes.

---

## 3. Parametric template (owner-preferred default, R3)

One template, parameterized, not one recipe per roast:

```
percolate (valve OPEN)  →  close + pour to full water (valve CLOSED, steep)  →  open + drain
```

Parameters: `bloom_pct`, `phase1_water_pct`, `temp_phase1`, `temp_phase2` (nullable — no drop for light roasts), `valve_close_time`, `steep_duration`, `grind_offset` (vs. classic V60 target for the same dose/grinder), plus `drawdown_budget_seconds` (not user-set, a guardrail).

This shape is closest to **Coffee Chronicler's structure** (open pour 1 at 0:00 → close + pour 2 at 0:45 → open/drain at 2:00, total 2:45-3:15) `[Chronicler-primary]`, which R3 already identifies as the nearest published match. It differs from Kasuya's God/Devil hybrid, which has the same open-first/close/open ordering but a much shorter steep window (close 1:15 → open 1:45 = only ~30s of closed dwell before the second pour is topped up and drained) `[Kasuya-hybrid-resolved]` — Kasuya's structure is closer to "pour 2 with the valve briefly closed" than a true extended steep. The medium-roast preset below reproduces Kasuya's temperature-drop signature at Chronicler's fuller steep-window shape; this blend is explicitly `[derived/interpolated]` where it combines the two.

Hoffmann's immersion-first structure (valve closed from the very start, opens only near the end) `[Hoffmann-hybrid-secondary]`, `[Hoffmann-immersion-secondary]` and Kaldi's long-closed-bloom-then-drip structure `[Kaldis-primary]` are **registry evidence, not generated templates** in this slice, per the plan's Key Technical Decisions — they inform guardrail bounds (e.g. Kaldi's roast-dependent temperature split) but are not reproduced as their own preset path.

---

## 4. Roast preset table

All times are `mm:ss` from pour start. `grind_offset` is relative to this app's existing classic-V60 micron target for the same dose/grinder (computed via `GRINDER_MICRON_SCALES` / `odeStepToMicrons`, no new formula — R6).

| Parameter | Light | Medium | Dark |
| --- | --- | --- | --- |
| Ratio | 1:16.5 `[Hoffmann-hybrid-secondary, Chronicler-primary upper band]` | 1:15 `[Kasuya-hybrid-resolved 1:14, widened to R5's 1:15-1:16 band — derived/interpolated]` | 1:13.5 `[R5 band 1:13-1:14, midpoint — derived/interpolated]` |
| `phase1_water_pct` | 50% `[Chronicler-primary]` | 43% `[Kasuya-hybrid-resolved: 120g/280g]` | 40% `[derived/interpolated — smaller percolation phase, more immersion-forward per R5]` |
| `temp_phase1` | 95°C `[Hoffmann-hybrid-secondary]` | 92°C `[Kasuya-hybrid-resolved: midpoint of comoricoffee 90°C / honestcoffeeguide-outlier 93°C — derived/interpolated averaging]` | 89°C `[Kaldis-primary dark-roast band 91-93°C, shaded down toward Blind-Coffee-Roaster-theory's 88-91°C process-agnostic dark/low-temp guidance — derived/interpolated]` |
| `temp_phase2` | 95°C — **no drop** `[derived/interpolated per plan Key Technical Decision: "light roasts may run both phases hot"]` | 70°C `[Kasuya-hybrid-resolved]` | 72°C `[derived/interpolated — extends Kasuya's drop pattern, held slightly higher than medium since dark roasts already start cooler]` |
| `valve_close_time` | 0:45 `[Chronicler-primary]` | 1:00 `[derived/interpolated — earlier than Kasuya's 1:15 to lengthen the steep phase per R3's "immersion steep" shape rather than Kasuya's brief top-up]` | 0:50 `[derived/interpolated]` |
| `steep_duration` | 75s (close 0:45 → open 2:00) `[Chronicler-primary]` | 70s (close 1:00 → open 2:10) `[derived/interpolated blend]` | 110s (close 0:50 → open 2:40) `[derived/interpolated — "immersion-forward long steep" per R5]` |
| `grind_offset` vs. classic V60 | +0 steps `[derived — R6 rule: coarsening triggers past ~60-90s closed time; light preset's 75s sits at the threshold, so app keeps offset at 0 and lets the contract's closed-bloom guardrail be the binding constraint]` | +1 step `[derived — R6 rule, 70s closed time crosses the ~60-90s threshold]` | +1 to +2 steps `[derived — R6 rule (110s closed time) plus World-Atlas-theory: darker roasts give up flavor more easily and need a coarser/faster extraction to avoid ashy over-extraction]` |
| `total_time` | 2:45-3:15 `[Chronicler-primary]` | ~3:00-3:15 (open 2:10 + 50-65s drawdown) `[derived/interpolated]` | ~3:30-4:00 (open 2:40 + 50-80s drawdown) `[derived/interpolated]` |

Kasuya's Super Hybrid v2 (closed bloom first, then open-close-open at 2:10/2:55, 20g:300g) `[Kasuya-super-hybrid-v2]` and the Hario-booklet competition recipes `[Hario-booklet-manufacturer]` are recorded as alternate valid parameter points within this same template shape (different `bloom_pct`/`phase1_water_pct`/timing combinations), not separate templates — useful as U5 shadow-comparison targets to confirm the adapter's parametric space can reproduce named recipes within tolerance.

---

## 5. Process override layer (natural / anaerobic)

Applies on top of the roast preset, regardless of roast level, per R5:

- **Temperature cap: 88-91°C** `[Blind-Coffee-Roaster-theory]`, corroborated directionally by Coffee Compass's "below standard, ~93°C vs. their 96°C baseline" `[Coffee-Compass-theory]`. Blind Coffee Roaster is more numerically complete and is the authoritative number; Coffee Compass is secondary corroboration of direction only.
- **Grind coarsened +100-150µm** (Blind Coffee Roaster's own figures are 750-800µm target vs. ~600µm baseline, i.e. +150-200µm; banded conservatively to +100-150µm to stay inside the app's existing micron-step granularity) `[Blind-Coffee-Roaster-theory, banded — derived/interpolated]`.
- **Ratio lengthened to 1:16.5-1:17** `[Blind-Coffee-Roaster-theory]`. Coffee Compass's "stronger ratios" recommendation is directionally opposite (implies a tighter, not looser, ratio) and gives no exact number `[Coffee-Compass-theory]` — this brief follows Blind Coffee Roaster as the more complete and more Switch-relevant source, and flags the Coffee Compass disagreement rather than silently dropping it.
- **Steep duration:** no source gives an anaerobic-specific steep number for the Switch. The roast preset's steep duration is kept, with the temperature/grind/ratio overrides applied on top `[derived/interpolated]`.
- Perfect Daily Grind's anaerobic article was checked and excluded — it is roasting-focused with no brewing parameters, and must not be cited for any brewing guardrail `[registry: excluded]`.

---

## 6. Guardrails

- **Closed bloom ≤60s.** No single source states this exact threshold as a rule; it synthesizes the home-barista grind/steep debate's implicit boundary (short-steep camp stays under ~2min total closed time, with bloom being a small fraction of that) and general bed-clog/drawdown theory `[home-barista-community + Barista-Hustle-theory — derived/interpolated]`. Enforced as a hard rule with a reason code (`SWITCH_CLOSED_BLOOM_CAPPED`), not a soft suggestion, because the failure mode (bed clog, multi-minute drawdown) was explicitly searched for on Reddit and not found as a dated citation — the app cannot verify severity empirically, so it defaults conservative.
- **Steep/temperature astringency bound.** Closed-valve dwell at ≥90°C should not exceed ~90-120s without a temperature drop; Kasuya's own second-phase drop to 70°C exists specifically to permit a longer closed window without over-extracting `[Kasuya-hybrid-resolved]`. The medium and dark presets above encode this by pairing longer steep durations with lower `temp_phase2` values, never a long steep at full phase-1 temperature.
- **Drawdown budget: 45s-1:15+, budgeted into `totalBrewTimeSeconds`.** Range is observed across Chronicler (45-75s: 2:00→2:45-3:15) `[Chronicler-primary]`, Kasuya (45-75s: 1:45→2:30-3:00 depending on generation) `[Kasuya-hybrid-resolved]`, and Kaldi's (60-120s+: 2:00→3:00-4:00) `[Kaldis-primary]`, generalized via bed-depth/fines/agitation theory `[Barista-Hustle-theory]`. The adapter must not silently truncate `totalBrewTimeSeconds` before drawdown completes.
- **Dose/water contract bound:** 15-30g dose, ≤340g water, per §1 above.

---

## 7. Open items carried to U2/U3 (not resolved by research, by design)

- Whether `temp_phase2` renders as a modal/timer instruction step or structured metadata is a UI decision deferred to U3 per the plan.
- Zhang/Inaba competition recipe numbers are single-source (Hario booklet, no independent corroboration found) — usable as U5 shadow-comparison targets, not as adapter defaults.
- honestcoffeeguide.com's Kasuya timestamps (close 1:30/open 2:20) remain an unresolved outlier vs. the 2-of-3-corroborated comoricoffee/gota.cafe timing (close 1:15/open 1:45) used above. If a future pass reaches Kasuya's own YouTube description text directly, re-verify against it.

---

## Revision 2026-08-16 — single-temperature mandate

**Status of §§1-7 above: SUPERSEDED for the `temp_phase2` dimension only.** Sections 1, 2, 5, 6, and the structural template in §3 remain valid and are not re-litigated here. The roast preset table in §4 is superseded in full by the table below and is kept in place, unedited, for provenance — it is what the engine shipped as `v60-switch-engine-v1`/`v60-switch-rules-v1-phase1`. This revision documents `v60-switch-engine-v1`/`v60-switch-rules-v2-single-temp` (bump rationale: §"Engine/rules version bump" below).

### Owner decision + rationale

Owner review of the shipped dual-temp preset table found two problems that research alone could not have caught, because they are about *use*, not about *sourcing*:

1. **The Kasuya-style 92°C → 70°C drop is unrealistic for a home brewer without a second kettle or an active-cooling method.** The shipped adapter's `prepSteps` already hedged this ("heat a second kettle, or let part of your first kettle cool") — that hedge is itself evidence the structure assumes equipment or a mid-brew wait most home setups don't have. A single kettle at a single set temperature is the actual home workflow.
2. **Recipes felt identical across beans.** The dual-temp table's only per-bean lever was the roast-preset lookup (light/medium/dark) plus the anaerobic override — both roast/process classifications, not bean-specific evidence. A washed high-clarity Kenyan and a soft natural at the same roast level produced the same valve schedule. The engine has an extraction-intent layer (`src/lib/extractionIntent.js`) carrying per-bean signals — cup-direction (clarity/body/sweetness), solubility/fines risk, energy/temperature tendency, confidence — that the Switch adapter was not consuming at all for timing. Kalita and classic V60 both use this layer for real differentiation; the Switch adapter should too.

Both problems point to the same fix, independently confirmed by new research (below): **the valve-close timestamp and steep duration are themselves the extraction dial, not the temperature drop.** Coffee Chronicler's own "sweet version" moves acidity/smoothness by moving the close time (0:45 → 0:25), not by adding a temperature phase. Brian Quan explicitly runs a single kettle temperature end to end and dials strength/acidity via steep length. This is the mainstream single-kettle Switch approach, not an outlier.

### New sources (2026-08-16 verified web research pass)

Added to `docs/data/v60-switch-source-registry.md` and `src/data/v60SwitchSourceRegistry.js` as first-class rows:

- **`[hario-partners-manufacturer]`** — Hario USA official, with Partners Coffee (hario-usa.com/blogs/brewing-demos-and-recipes/v60-switch-recipe-with-partners-coffee). 16g:256g (1:16), locked bloom 0:00-1:30 → open. **Roast-banded single temperature**: 96-100°C light/medium, 90.5-93°C dark. Manufacturer tier — the strongest-provenance single-temp source in the registry, and the direct source for this revision's light/dark temperature bands.
- **`[chronicler-primary]`** (existing row, new finding added) — coffeechronicler.com + timer.coffee. 92°C constant, 20g:300g (1:15), open 0:00 pour 150g → close 0:45 → pour remainder → open 2:00, total 2:45-3:15. **The "sweet version" closes at 0:25 instead of 0:45 specifically to reduce acidity** — this is the documented proof that valve-close timing is the acidity/smoothness lever that the temperature drop used to be assigned to. This single fact is the direct source for the bean-driven modulation design below.
- **`[quan-secondary]`** — Brian Quan (beanbook.app/recipes/196cd89b-1c9e-4dae-976b-3b5085dc5adb), original author via an aggregator platform (evidence tier: secondary). 15g:240g (1:16), 94°C single temperature, 90-94°C band stated as the working range. Explicitly frames **steep time as the dial**: shorter steep = more acidity, longer steep = smoother/rounder. Independent corroboration of Chronicler's close-time-as-dial finding from a different author.
- **`[kaldis-primary]`** (existing row, re-cited) — 13g:200g (1:15.4), closed 30-40s bloom → open. Re-cited here as additional single-temp-compatible structural evidence (Kaldi's was already single-temp per source — it never had a `temp_phase2`).
- **`[home-barista-community]`** (existing row, new finding added) — home-barista.com Kasuya thread (t85637). The dual-temp verdict in that thread is **positive-but-qualified, bean-dependent**, and one poster explicitly notes they "don't love the minor fuss of the temp drop." No controlled A/B exists in the thread. This directly corroborates the owner's "unrealistic for home use" rationale from within the same community evidence this brief already leaned on for the closed-bloom guardrail.
- **`[kasuya-super-hybrid-v2]`** (existing row, new finding added) — roastaroma.com. The Super Hybrid v2 uses a **coarser grind than the original God/Devil recipe**. This is the source for this revision's "+1 coarser than the old dual-temp preset" instruction on the medium preset below — precedent that simplifying/hardening the Switch recipe (in v2's case: adding the closed-bloom-first step; in this revision's case: dropping the temperature phase) pairs with a coarser grind, not a finer one.

### Revised preset table (single temperature, `temp_phase2` removed)

All times `mm:ss` from pour start. `grind_offset` is relative to the same classic-V60 micron baseline as before (R6, no new formula).

| Parameter | Light | Medium | Dark |
| --- | --- | --- | --- |
| Ratio | 1:16.5 (unchanged) | 1:15 (unchanged) | 1:13.5 (unchanged) |
| `temp` (single) | 94°C `[hario-partners-manufacturer 96-100 band, shaded to Hoffmann's 95 and conservative — derived]` | 92°C `[chronicler-primary]` — now an **exact** match, not a Kasuya/Chronicler blend, because there is no second temperature to average against | 88°C `[hario-partners-manufacturer dark floor 90.5, extrapolated down with a typical 2-5°C dark-roast offset — derived/interpolated]` |
| `valve_close_time` | 0:45 (unchanged) `[chronicler-primary]` | 0:40 `[derived — 5s earlier than the old dual-temp preset's 1:00, shortening the pre-steep percolation slightly now that a single 92°C temperature runs the whole steep]` | 0:50 (unchanged) |
| `steep_duration` (baseline, before per-bean modulation) | 75s (unchanged) | 70-80s baseline, engine default 75s (open ≈ 1:55, inside the owner-specified 1:50-2:00 window) | ~100s baseline (open ≈ 2:30) — **shorter than the old dual-temp preset's 110s**, because there is no cool second-phase temperature protecting the long steep from over-extraction; the astringency guardrail (below) does that job instead |
| `grind_offset` | +0 (unchanged) | **+1 step coarser than the old dual-temp preset** (was ~1 step past the closed-time threshold; now 2 steps total) `[kasuya-super-hybrid-v2 coarser-grind precedent — derived]` | +1 to +2 steps (unchanged band, numeric value nudged up slightly within the same band to pair with the shorter, hotter, unprotected steep) |

Per-bean valve-timing modulation (below) applies on top of this table; the numbers here are the deterministic baseline before any bean-driven adjustment.

### Bean-driven modulation spec (differentiation fix)

Implemented in `src/lib/v60SwitchAdapter.js` as a pure function over the existing `extractionIntent` output (`cupDirection.clarity/body/sweetness`, `solubilityRisk`, `finesRisk`, `energyTendency`, `confidence`) — no new evidence format, no new intent fields.

- **Clarity-leaning / high-acidity-desired bean** (`cupDirection.clarity === 'high'`): steep is **shortened** (Quan's dial: shorter steep → more acidity/clarity), bounded −20 to −30s off the baseline steep, reason code `SWITCH_STEEP_SHORTENED_CLARITY`; valve close is **delayed** (more percolation before the immersion phase begins), bounded +10 to +15s, reason code `SWITCH_LATE_CLOSE_CLARITY`.
- **Body/sweetness-leaning bean, or high fines/solubility risk** (`cupDirection.body === 'supported'` or `cupDirection.sweetness === 'high'` without high clarity, or `finesRisk`/`solubilityRisk === 'high'`): valve close is **earlier** (Chronicler's sweet-variant logic: 0:45 → 0:25), bounded −10 to −15s, reason code `SWITCH_EARLY_CLOSE_SWEETNESS`; when fines/solubility risk is specifically high, steep is also **extended** within the astringency guardrail, bounded +20 to +30s, reason code `SWITCH_STEEP_EXTENDED_BODY`.
- **Low-confidence intent** (`confidence === 'low'`, i.e. no real source/stored/research guidance behind the bean): **no modulation** — baseline preset values only, reason code `SWITCH_VALVE_TIMING_BASELINE_LOW_CONFIDENCE` records that this was a deliberate conservative default, not a missed signal.
- Modulations are additive on independent axes (close-time and steep-time), each clamped to its own bound before being applied, so a dense high-clarity washed bean and a soft high-sweetness natural at the *same roast preset* produce visibly different close/steep timestamps — this is the direct fix for "recipes feel identical across beans."

### Astringency guardrail, adjusted for the single-temp world

The old guardrail ("closed-valve dwell at ≥90°C should not exceed ~90-120s without a temperature drop") assumed a temperature drop was available as the release valve. With `temp_phase2` gone, the guardrail is restated directly in terms of the single temperature actually in effect:

- **Closed-valve dwell at ≥92°C is capped at ~90-100s**, full stop — this now binds the medium preset (92°C) hard, including after modulation: `SWITCH_HOT_STEEP_CAPPED` fires if a clarity-leaning shortened steep were somehow combined with a body-leaning extension request (should not happen given the modulation rules are mutually exclusive per bean, but the guardrail is checked unconditionally, not trusted to the modulation logic).
- **Longer steeps (up to the dark preset's ~100-130s modulated range) are only permitted at ≤90°C.** This is why the dark preset's temperature (88°C) sits below the threshold and the medium preset's (92°C) sits above it — the temperature band chosen per roast now directly gates how long that roast's steep is allowed to run, since there is no second cooler phase to fall back on mid-brew.

### Engine/rules version bump

`V60_SWITCH_ENGINE_VERSION` stays `'v60-switch-engine-v1'` (the template shape — percolate → close+steep → open+drain — is unchanged). `V60_SWITCH_RULES_VERSION` bumps from `'v60-switch-rules-v1-phase1'` to `'v60-switch-rules-v2-single-temp'` so every previously-cached dual-temp candidate (which carries a non-null `waterTemp2` and the old rules version) is invalidated and regenerated under the new rules on next read, per R8's "engine/rules versions are Switch-specific" invariant.
