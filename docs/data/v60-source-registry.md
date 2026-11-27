# Hot V60 02 source registry (audited 2026-08-02)

Machine-readable authority: `src/data/v60SourceRegistry.js` (`v60-hot-sources-v2`). URLs and status below are the audit view of every executable source record.

| ID | Canonical URL | Status | Exact source facts | App adaptation boundary |
|---|---|---|---|---|
| `hoffmann-one-cup-v1` | [YouTube](https://www.youtube.com/watch?v=1oB1oDrDkHM) | original | V60 02, 15g/250g, freshly boiled water for light roasts, medium-fine; 50g bloom, gentle swirl, four 50g pulse pours beginning at 0:45/1:10/1:30/1:50, final gentle swirl, ~3:00 guide | Scale dose and water only through `v60-dose-scaling-v1`; bean temperature and grind adjustments remain bounded app rules |
| `hoffmann-large-batch-v1` | [Hario / James Hoffmann](https://www.hario-usa.com/blogs/recipes-and-more-from-friends/james-hoffmann-uitimate-v60-technique) | original | V60 02, 30g/500g, 60g bloom; pour from 60g to 300g during 0:45–1:15 and to 500g during 1:15–1:45; ~3:30 finish; filter contact is not prohibited; stir + gentle swirl | Dedicated large-dose profile; no invented off-paper/no-swirl rule |
| `kasuya-46-v1` | [Hario / Tetsu Kasuya](https://www.hario-europe.com/blogs/hario-community/v60-ambassadors-tetsu-kasuya) | original | V60 02, 20g, 1:15, 92C, coarse, centered pulses, no final swirl | Dose/cadence scaling is marked in lineage |
| `rao-two-stage-v1` | [Hario / Scott Rao](https://www.hario.co.uk/blogs/hario-ambassadors/hario-v60-recipe-interview-with-hario-ambassador-scott-rao) | original | V60 02, 20g/330g, 97C, 4:00–4:30; grind unspecified; aggressive bloom spin plus gentle spins after both pours | Grind is app rule, not source fact |
| `heart-continuous-v1` | [Heart](https://www.heartroasters.com/pages/v60) | original | V60 02, 22g/360g, 40–50g bloom, 93–96C, medium-fine, vigorous bloom stir, slow center pour, final stir, 2:20–2:30 | High-fines selector may remove stirs only as explicit bounded adaptation |
| `kurasu-controlled-pulses-v1` | [Kurasu](https://kurasu.kyoto/blogs/kurasu-journal/kurasu-coffee-brew-guide-2022) | adapted | V60 01, 14g, ~2:30, first/final spoon agitation; V60 02 ratio/temp/grind unsupported | Incomplete source; no executable exact V60 02 claim |
| `mameya-three-pour-observed-v1` | [Koffee Mameya](https://koffee-mameya.com/) | original | Observed in person 2026-11-27, not published: V60 02 (clear resin), 12g/180g (1:15, dose and water from the customer), three equal ~10s center pours at 0:00/0:35/1:10 with the spout just above the bed, no stir or swirl, dripper lifted off at ~1:28 with liquid still on the bed; grind estimated ~850 microns from a photo | Explicit choice only (never auto-selected). Kettle temperature not visible: 92C is an app value marked `temperature` in lineage. Larger doses keep the 6 g/s pour and 25s rest. Notes: `docs/data/mameya-v60-observation-2026-11-27.md` |

`evidenceType: 'observed'` marks a technique watched in person rather than published; it must carry `observedAt` and an observation note, and is never picked by the automatic selector.

Reddit and aggregators are discovery/gut-check evidence only. Every generated parameter retains a source or versioned rule ID.
