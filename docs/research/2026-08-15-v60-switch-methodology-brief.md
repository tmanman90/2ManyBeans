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
