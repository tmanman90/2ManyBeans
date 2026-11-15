# AeroPress and French Press: source-fidelity audit

Date: 2026-09-07. Scope: current hot, iced, scaled, saved and Quick Recipe paths for `aeropress` and `french-press`. Aiden excluded. Read-only application audit; this document is the only file authored for this subtask. No live recipes generated, private bean records queried, deployments or taste trials performed.

## Verdict

The app has credible brewing influences but neither immersion method currently selects a complete, versioned original recipe. Both still ask a model to compose a recipe from general method and bean-family guidance, then repair it with app-defined bounds. The iced path is a generic arithmetic transform rather than a curated original iced recipe. This is the same category of fidelity gap as Kalita, with additional bypass, vessel-capacity and clock problems.

Good originals are available, including a Japanese world champion's **upright** AeroPress recipe and Japanese roaster recipes explicitly designed for iced immersion. Japanese provenance is a useful curation preference, not a scientific bean-routing rule. Championship success establishes a worthwhile recipe to reproduce; it does not establish that recipe as best for every coffee.

## Primary-source ledger

All sources accessed 2026-09-07. A publication date is reported only when shown. No recipe aggregators or Reddit posts were used as recipe evidence.

| ID | Author / original resource | Publication / verification |
|---|---|---|
| A1 | James Hoffmann, [The Ultimate AeroPress Technique, episode 3](https://www.youtube.com/watch?v=j6VlT_jUVPc) | Original channel; original public video description extracted from YouTube HTML because web opening failed. Video publication date not independently extracted. Written recipe and roast note verified; audiovisual execution not verified. |
| A2 | AeroPress, [official WAC recipe archive](https://aeropress.com/pages/wac-recipes) | 2014 and 2019 championship editions; archive revision date unstated. Manufacturer publication of competitors' recipes. |
| A3 | World AeroPress Championship, [2014 World Final](https://worldaeropresschampionship.com/pages/2014-world-final) | Official confirmation of Shuichi Sasaki of Japan as winner; not a complete recipe. |
| F1 | Stumptown, [French Press brew guide](https://www.stumptowncoffee.com/pages/brew-guide-french-press) | Current first-party written guide, undated. |
| F2 | SCAA Technical Standards Committee, [Three Cup French Press best practice](https://scagermany.coffee/wp-content/uploads/2021/02/best-practices-three-cup-french-press.pdf) | Revised 2016-04-02, two-page association document hosted by its German chapter. Main sca.coffee copy failed to fetch. |
| F3 | James Hoffmann, [The Ultimate French Press Technique](https://www.youtube.com/watch?v=st571DYYTR8) | 2016-10-02. Original video identity and description verified. Description contains no recipe. Public caption track metadata was available but caption fetch returned empty content. Detailed execution remains unverified in this audit. |
| I1 | THE COFFEESHOP, [AeroPress iced recipe](https://www.thecoffeeshop.jp/magazine/brewguide/エアロプレス-美味しいアイスコーヒー-作り方/) | 2016-06-12. Original Japanese written recipe. |
| I2 | THE COFFEESHOP, [French Press iced recipe](https://www.thecoffeeshop.jp/how-to-brew/フレンチプレス-アイスコーヒー-作り方/) | 2016-06-05. Original Japanese written recipe. |
| I3 | THE COFFEESHOP / roaster Hagiwara, [2024 iced brewing guide](https://www.thecoffeeshop.jp/magazine/brewguide/icedcoffee/) | 2024-04-30. Separate newer versions of both iced methods; not interchangeable with 2016. |
| E1 | AeroPress, [manufacturer FAQ](https://aeropress.com/pages/faq) | Current live guidance, undated. Manufacturer strongly discourages inversion because of instability and hot-liquid burn risk; recommends compatible flow-control caps for drip control. |
| E2 | AeroPress, [Original product and comparison specifications](https://aeropress.com/products/aeropress-coffee-maker) | Current live specification: Original 10 oz; Original XL 20 oz. These are advertised capacities, not validated maximum coffee-plus-water slurry loads. |

### Retrieval evidence that changes the timer design

A1's original description was obtained by reading the public `shortDescription` field on the linked YouTube page, using Python `urllib.request` and JSON decoding on 2026-09-07. It puts adding the water before this instruction: **“Start a timer, and immediately place the piston piece into the top of the brewer”**. This 17-word excerpt is intentionally small. The subsequent two-minute wait belongs to that source-defined event, not automatically to first water contact. Preserve a physical first-contact timestamp separately if desired; do not silently shorten the author's wait by the pour duration. Video-vs-description timing reconciliation remains an explicit check before shipping an audiovisual attribution.

## Curated recipe candidates

### Three meaningfully different hot AeroPress recipes

**A1 — Hoffmann everyday upright cup.** 11g coffee / 200g just-boiled water; finer end of medium for light roast. Paper filter, no rinse/preheat. Wet all grounds with the pour, then start the source clock and seat the piston about 1cm. Wait 2:00, swirl gently, wait another 0:30, press gently fully. No separate bloom or bypass. Press duration and beverage output mass are unstated; do not invent a fixed 30-second press. Description does not name an exact model or capacity. It explicitly permits increasing dose and coarsening grind for darker roasts, without numeric increments. Implementation status: written-source recipe ready to model with event-based press completion; video clock reconciliation pending.

**A2a — Shuichi Sasaki, Japan, 2014 WAC winner.** Upright/paper; 16.5g / 250g soft mineral water at 78°C; EK43 9.5. Rinse paper; 40g initial water, 25-second bloom and five stirs, then 210g and one stir. Press slowly for 75 seconds, leaving 45g slurry. Listed total 1:40; pour durations and their fit into that total are ambiguous. No bypass; measured beverage output/model revision absent. Preserve ambiguity before building a fully timed version.

**A2b — Wendelien van Bunnik, 2019 WAC winner.** Inverted, rinsed Aesir paper; 30g/coarse 7-of-10; 100g, 92°C, Spa Blauw 30ppm. Pour 0–10s; twenty firm stirs over 10s; cap/expel air; flip/press at 40s, listed finish 60s. About 60g concentrate; add 100g then adjust, author's dilution 120g. Cool to about 60°C. This is a costly competition concentrate, not an everyday 1:15 cup. Output after author's dilution is approximately 180g, calculated; model revision and coffee-specific routing absent. E1's inversion warning applies.

The two A2 records together are deliberately brief; original archive details remain at their primary link. Neither source provides permission to change inversion to upright while retaining the unqualified original attribution. A flow-control version would need its own adaptation record and verification.

### French Press: two fully written alternatives plus the Hoffmann verification queue

**F1 — Stumptown four-minute, full-plunge method.** 56g coffee, coarse/breadcrumb-like, 850g water just off boil/about 205°F. Uses an **8-cup** French Press; exact brand/model and numeric vessel capacity unstated. Preheat/discard. Timer begins with first water: add 450g and cover without pressing; at 1:00 stir, add to 850g, replace lid; at 4:00 plunge fully after moving off the scale, serve/decant. No separate bloom, bypass or settling phase. Pour/stir/plunge durations and measured output unstated. Author presents a general heavy-bodied cup, not a process/origin selector. This is a legitimate coarse-grind method; the app should not imply all reputable French Press recipes require Hoffmann's medium grind and extended settling.

**F2 — SCAA staged saturation and skimming.** Source specifies a **three-cup (22 ounce)** French Press, 36g medium-coarse coffee / 660g water at 93.5°C (200°F). Preheat/discard; start timer and pour 540g, lid without plunging; at 2:00 stir gently and add 120g; skim floating material, replace lid; at 4:00 press slowly to bottom and decant. No bypass; output and action durations unstated. Preserve the source's vessel wording, but resolve its stated ounces vs fill-volume/headspace before certifying equipment fit. Its explanatory claim that skimming stops extraction is not adopted as a universal scientific rule. The exact ratio is 660/36, not an app-rounded 1:17.

**F3 — Hoffmann settling/no-full-plunge method: incomplete verification.** App/old plan states medium grind, four-minute steep, stir/break crust, scoop foam, five-to-eight-minute settling, avoid full plunge. These are **current app claims**, not newly verified original video facts. The original author/video was located, but no transcript or audiovisual inspection was obtained. Do not stamp the numerical dose, water, temperature, exact settling bounds, model or clock basis as verified by this audit. Complete that verification before treating the current named technique as faithful. F1 and F2 provide independent, fully written originals in the meantime.

### Iced immersion: preserve versioned originals

**I1 — THE COFFEESHOP 2016 AeroPress.** 18g; 120g at 80°C; 100g server ice plus three serving-glass cubes. Inverted; paper medium grind / metal medium-coarse. Add 50g, stir with paddle, add 70g; cap within the 1:30 extraction stage; at 1:30 flip and press directly onto ice for 30s, finish 2:00; mix to melt server ice, serve over fresh cubes. Pour/stir durations unstated. Brewer revision unstated; recommends server >=500ml. Text claims 1:13, but specified brew water plus weighed server ice is 220/18; serving cubes are unweighed. Store that distinction instead of forcing a reconciled total. Author says usual specialty beans work, not only dark roasts. E1 warning applies.

**I2 — THE COFFEESHOP 2016 French Press.** 24g coarse, 200g boiling water, 100g server ice; author allocates another 60g to serving ice for total input ratio 1:15. Start a four-minute timer; 100g initial water with 30-second bloom, add remaining 100g; at four minutes plunge gently, slowly pour a thin stream onto server ice and mix until melted; serve over glass ice. Bloom pour-duration convention needs video reconciliation; no fixed plunge/pour duration. French Press model unstated, server >=500ml. Same usual-specialty-bean suitability claim as I1.

**I3 — THE COFFEESHOP 2024 versions, separate recipe IDs.** AeroPress: 24g medium-fine to medium, 190g/94°C, about 130g server ice; inverted, start timer, 100g and ten stirs, add 90g/cap, at 1:00 flip and press 30s. French Press: 24g coarse, 200g/94°C, about 130g ice; start timer, 100g for 30s, add remaining water, plunge at 4:00, pour onto ice/mix. Exact models, outputs, pour durations and serving-ice mass absent. Hagiwara explicitly welcomes different specialty origins; described cup outcomes refer to the shop's iced blend, not guaranteed results for every bean. Prefer these as newer source candidates while preserving 2016 variants; new dates alone do not prove better taste.

The app exposes iced transformations for both methods, not a dedicated cold-water immersion method in the audited registry. A separate cold-brew pack recipe on I3 is not an AeroPress/French Press source and was not imported.

## Current implementation findings

| Priority | Current evidence | Failure / consequence |
|---|---|---|
| P1 | `src/hooks/useHandBrew.js:401`; `src/lib/handbrew.js:498`, `:521`, `:575` | Both methods reach GPT composition; output has technique/reasoning but no original recipe ID, author URL/version, adaptation ledger, physical model, or separate bypass/output fields. Family guidance is not complete-recipe provenance. |
| P1 | `src/lib/handbrew.js:112`, `:125`, `:347` | Ratio clamps alter `ratio` text without reconciling dose/water/stages. Exact Hoffmann input ratio exceeds AeroPress's 18 ceiling; F2 exceeds French Press's 17 ceiling. Later scaling uses the clamped label for headline water but actual old quantities for stages. |
| P1 | `src/lib/handbrew.js:113`, `:126`, `:356` | 80°C AeroPress floor changes the Japanese champion's 78°C source; 95°C French Press floor changes F2. These are not established physical constraints and cannot silently override an original. |
| P1 | `src/lib/flashBrewTransform.js:158`–`:201` | Generic 60/40 split retains hot action text, scales only structured cumulative water, and appends a new press/pour after the old hot press. This is neither I1 nor I3. Bypass water is not separately represented, so concentration/dilution transforms are unsafe to interpret. |
| P1 | `src/lib/recipeScaling.js:62`–`:104`; `src/lib/brewMethods.js:204` | Scaling accepts any positive dose with no brewer model/chamber load check; keeps time, grind and technique. Larger upright all-water recipes may exceed Original capacity. Neither multiplying through nor relabeling as XL is source fidelity. |
| P1 | `src/lib/handbrew.js:546`; `src/lib/brewMethods.js:237`, `:268`; `src/lib/handbrew.js:389`–`:430` | Prompt adds timed prep, range parser takes midpoint, overlapping actions get +5s, and missing/final-equal totals gain average intervals. These are timer-repair inventions, not author timings. A range such as `0:00–0:10` is a pour interval, not an event at 0:05. |
| P2 | `src/lib/brewTimerSteps.js:24`, `:45`, `:67` | Legacy timer finds first water by text and subtracts its timestamp; total only subtracts prep with a flag. Source clock start and first contact are not explicit. A1 requires preserving a wait tied to its author-defined clock. |
| P2 | `src/lib/handbrew.js:117`, `:185`, `:200`, `:565` | Default AeroPress standard/inverted/bypass categories and generic no-bloom override flatten legitimate source differences. Inversion appears as a routine option without source equipment guidance. Family/roast/process starting rules persist despite absence of source-specific bean-selection evidence. |
| P2 | `src/lib/flashBrewTransform.js:24`, `:38`, `:198` | Temperature bump can lower boiling water to 99°C while raising 212°F to 214°F. Grind shift acts only on numeric settings, assumes Ode notation and leaves microns stale; GPT emits string settings. This is incoherent parameter display, not validated iced tuning. |

`QuickRecipeFlow.jsx:64`–`:67` uses the same handbrew hook, and `HandBrewModal.jsx:450`–`:473` scales and transforms the display recipe. Quick Recipe does not have an independently researched immersion engine. Saved recipes are rendered through these shared helpers too; preserving stored JSON alone does not guarantee unchanged user-visible instructions.

### Executed pure-function reproduction

Ran Node imports of the existing scaling and immersion-transform helpers, using synthetic source-shaped data only. Input: 11g, actual 200g water, repaired ratio label `1:18`, 100°C/212°F, hot pour and press stages.

- Iced result: headline 119g water, structured stage 120g, action still says `Pour 200g water`, old press remains plus appended press/ice step; temperature reads 99°C/214°F.
- Scale to 40g: headline 720g water while action/cumulative stage say 727g; source time remains unchanged. This demonstrates lack of reconciliation and equipment validation, not a recommendation to brew that volume.

No app build or live-provider test was run; those would not prove source or taste fidelity.

## Bean suitability: evidence versus inference

| Dimension | Author evidence from this set | Permissible curation behavior |
|---|---|---|
| Roast | A1 explicitly starts with light roast and allows coarser grind/increased dose for darker roast. | Preserve qualitative permission; exact numbers require a separately justified adaptation. |
| Processing / origin / cultivar | These selected source recipes do not provide comparative routing across washed/natural/anaerobic/geography. | Record a recipe's original coffee context when known. Do not turn Japanese authorship or a championship bean into universal process suitability. |
| Iced suitability | I1/I2/I3 say usual specialty beans work iced; I3 blend tasting notes are contextual. | Offer these recipes across suitable specialty coffees with clear expected style, not guaranteed flavor. |
| Decaf | No source-specific decaf recipe or validated adaptation recovered. | Mark unsupported/needs research or taste validation. Do not invent automatic time/temp changes. |
| Freshness / degassing | No numeric age-to-bloom algorithm supported by these originals. | Preserve original timing first; annotate any later freshness adjustment as app testing/inference. |
| Preference | Source methods differ in concentration, body, clarity, workflow and coffee consumption. | Select by desired cup/workflow plus equipment before unsupported bean taxonomy. Use tasting feedback to validate preferences. |

## Ranked repair actions and source-fidelity acceptance

1. **Add source recipe records for complete methods before new selection logic.** Separate author facts, missing fields, equipment, author-clock basis, optional steps and app adaptations. Do not mark F3 or ambiguous A2a timing as fully verified. Keep read-only source versions when guides change.
2. **Make water accounting explicit.** Distinguish water contacting coffee, bypass, brew ice, serving ice, and beverage output. Reject contradictory input rather than clamping only the ratio label. No fabricated extraction-loss or ice-melt certainty.
3. **Implement event/duration timing.** Capture pour intervals and rest durations independently, preserve source-clock anchoring, treat unknown press completion as user completion, and move prep/post-brew outside a falsely precise timer. A1's two-minute wait must survive a slower initial pour.
4. **Constrain adaptation by actual equipment and source permission.** Record Original vs XL, paper/metal/Aesir and French Press vessel; verify load/headspace and intended dose. Neither manufacturer advertised capacity nor a proportional equation independently validates a scaled recipe. Keep historic inverted methods attributed and show the relevant manufacturer guidance at selection; do not make a converted method masquerade as the original.
5. **Replace iced arithmetic with complete I1/I2/I3 candidates.** Preserve their own agitation, clock, temperature and ice accounting, not inherited hot actions. Then add any tested adaptations as distinct versions.
6. **Add bean-routing evidence and taste verification.** Start with author-supported dimensions, expose confidence/missing data, test alternative recipes with representative actual beans, and distinguish software fidelity passes from better-tasting cups. No defensible audit can certify “best on any app” without that comparison.

Acceptance cases:

- Reproduce each verified original at its stated dose without changing temperature, grind description, quantities, sequence, placement or author wait basis. Unknown timings remain unknown.
- Preserve original exact input ratio while rendering a rounded label; scaling must use a single coherent water basis. Test source values outside the old global bands.
- A bypass recipe never pours total dilution water into the chamber. Estimated beverage output is never mislabeled input water.
- Iced instructions, numeric stages, headline hot water and ice agree; one press operation, correct source recipient/ice location. Brew and serving ice remain distinct.
- Author-clock and physical-contact clock test with varied initial pour durations; no midpoint or overlap-nudge mutation of source events; uncertain source schedule does not become an invented precise timer.
- Original/XL and French Press model mismatch produces an equipment/dose choice or a named validated adaptation, not an overflowing instruction.
- Unknown roast/process/decaf/freshness produces transparent source selection uncertainty, not fabricated bean-specific confidence. Japanese-author preference changes curation ordering, never asserts geography-based extraction science.
- Inventory, saved recipe, Quick Recipe, scaled display, hot/iced toggle and timer use the same selected source version and adaptation ledger.

## Earlier-work provenance

Reviewed `docs/plans/2026-04-22-002-feat-brew-methods-expansion-roaster-intelligence-plan.md`, `docs/data/japanese-iced-pour-over-research.md`, and the July 19 audit verdicts. The expansion plan both proposed a coarse French Press offset and later emphasized Hoffmann medium grind; it explicitly sought authoritative parameter tables but proposed only small immersion config overrides. July already marked AeroPress timing/no-bloom behavior unverified. The iced research captured an older Japanese recipe, then generalized into 60/40 arithmetic and preferred inversion. That is where full originals became broad rules. The current source comparison demonstrates why neither broad configuration nor names alone suffice.
