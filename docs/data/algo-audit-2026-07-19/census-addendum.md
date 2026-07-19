# Addendum 2: Full Aiden Profiler Census (1,250 coffees / 1,172 profiles)

2026-07-19. Method: sitemap-driven curl sweep of the server-rendered coffee pages (robots.txt explicitly opens catalog routes to crawlers; ~2 req/s, zero failures). Each profile summary carries brew temp, ratio, grind microns, pour count; coffee pages carry origin/process/roast. Dataset: `fap-census-1250.jsonl.gz`. This is the complete population, superseding sampling.

## Distributions (medians, with p25-p75)

| Roast | Ratio | Temp C | Grind um | n |
|---|---|---|---|---|
| Light | 1:16.5 (16.0-17.0) | 95 (94-96) | 750 (750-750) | 314 |
| Medium-Light | 1:16.0 | 95 (93-95) | 775 | 73 |
| Medium | 1:16.0 | 94 (93-95) | 800 | 158 |
| Dark-ish | 1:15.5 (15.0-15.5) | 92 (88-94) | 825 (825-850) | 51 |

Light roast by process: washed 1:16.5 / 96C; natural 1:16.5 / 95C; honey 1:16.5 / 96C; anaerobic 1:16.5 / 94C. Pour counts: 4 pours dominate (68%), then 3 (17%), then 5 (13%).

## What this confirms for the plan
1. **Light ratio target 1:16.5, not 1:17+.** Our enforced floors (>=1:16.5 washed, >=1:17 Kenya) push output to at/above the population p75; the model then lands at 1:17.5, above ~90% of real recipes. Confirms softening the floors (P2).
2. **Dark ratio 1:15-1:15.5 median.** Confirms the hand-brew dark-roast family fix (P1): current 1:17-1:18 default has no support anywhere; census, external consensus, and Codex all land 1:15-1:16.
3. **Naturals are NOT brewed cooler.** Light naturals median 95C, same as washed. Legacy natural bloom default (92-94C) sits below population p25. Confirms warming clean-natural defaults (P1/P2).
4. **Temps by roast validate the corrected direction:** light 94-96, dark 88-94. Matches our proposed family bands once the device-override bug is fixed.
5. **Pour structure:** 3-4 pulses standard; our SS 3 / batch 4 defaults are population-normal.

## Open question (flagged, NOT in this fix run)
**Aiden grind divergence:** census median grind is 750um for light (HCG-calibrated microns, post their recalibration). Our Aiden light washed SS band (Ode 3.2 = ~470um true) is far finer. Possible explanations: their summaries may show batch-oriented values, different brew philosophies, or their community skews coarse. Tal's SS recipes at ~3.2 are dialed in and taste great, so NO change; logged for a future taste experiment (one brew at Ode ~6 SS for comparison would settle it).
