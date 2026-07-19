# Aiden: Legacy vs Proposed (P2) — Real Pipeline Comparison

2026-07-19. Method: the production modules (`beanResearch.js` + `aiden.js`) bundled twice — legacy exactly as on main, proposed with the P2 audit patches applied at build time (patch anchors throw on drift). Real GPT-5.4 calls, research shared per bean so the only variable is the rules. One generation per variant (model variance exists; the deterministic enforcement layer is exact). Grind bands untouched by design: grind output was identical in every pair.

P2 patches applied to "proposed": flat-default temp curves (decline optional with cause), bean-age auto-deltas removed, light-scoped ratio sanity, clean-natural defaults warmed/shortened (94-96C, 35-45s, 1:16.5-17), Kenya hard override softened to guardrails, batch pulse fallback unified at 4.

| Bean (family) | Param | Legacy | Proposed |
|---|---|---|---|
| **Gichathaini AA** (washed-kenya-clarity, in peak) | ratio | 1:17.5 | 1:17 |
| | bloom | 3x / 50s / 95.5C | 3x / 45s / 95C |
| | SS pulses | 3 @ 22s [95, 94.5, 93.5] | 3 @ 22s [95, 95, 94.5] |
| | batch | 4 @ 28s [95, 94.5, 93.5, 92.5] | 4 @ 30s [95, 95, 94.5, 94] |
| | grind | SS 3 / batch 5.1 | SS 3 / batch 5.1 (identical) |
| **El Triangulo** (washed-floral-clarity Geisha, in peak) | ratio | 1:17.5 | 1:17.5 |
| | bloom | 3x / 50s / 95C | 3x / 50s / 95.5C |
| | SS pulses | 3 @ 23s [95, 94, 93] | 3 @ 22s [95.5, 95.5, 95.5] FLAT |
| | batch | 4 @ 30s declining to 92.5 | 4 @ 28s flat 95.5 |
| | grind | SS 3.2 / batch 5.2 | identical |
| **Chelbesa Natural** (clean-natural-fruit, in peak) | ratio | 1:17.5 | 1:17 |
| | bloom | 3x / 50s / 94C | 2.5x / 40s / 95.5C |
| | SS pulses | 3 @ 26s [94, 93.5, 92.5] | 3 @ 28s [95.5, 95.5, 95] |
| | batch | 4 @ 30s declining to 92.5 | 4 @ 30s near-flat to 94.5 |
| | grind | SS 4.2 / batch 6.2 | identical |
| **Mulish** (washed-ethiopia-clarity, ~100d past peak) | ratio | 1:17.5 | 1:17.5 |
| | bloom | 3x / 50s / 95C | 3x / 50s / 95.5C |
| | SS pulses | 3 @ 22s [95, 94, 93] | 3 @ 22s [95.5, 95.5, 95] |
| | batch | 4 @ 28s [95→92] | 4 @ 28s [95.5→94.5] |
| | grind | SS 3.2 / batch 5.2 | identical |

## What actually changes in the cup
1. **Temperature: the big one.** Legacy declines every light roast ~2-3C through the brew; proposed holds flat (or near-flat), so late pulses run 1.5-2.5C hotter. Expected effect: fuller sustained extraction through the back of the brew — more sweetness and body from the same beans, which is what the 16/23-flat reference corpus and Equator's recipes do.
2. **Kenya: no more forced dilution.** Legacy's hard floor pushed Gichathaini to 1:17.5; proposed lands 1:17 and would allow an exact reference recipe like Kieni's 1:15.5 to survive.
3. **Naturals: warmer, shorter bloom.** Chelbesa moves from 94C/50s to 95.5C/40s with a 2.5x bloom, matching Equator/Fellow/BC natural examples instead of the cooler-longer legacy defaults.
4. **Age: no silent pre-compensation.** Mulish (past peak) parameters are now driven by the bean, not an unsupported +ratio/+bloom delta stack; freshness moves to the reasoning text.
5. **Grind: byte-identical in all four pairs** — the pinned FAMILY_GRIND_BANDS guarantee holds.

Saved recipes and bean.aidenGrind never change; these differences apply only when a recipe is (re)generated.

Harness: scratchpad `aiden-ab/build-and-run.mjs` (esbuild dual-bundle + fetch interceptor); raw output in `results.json` (workpapers).
