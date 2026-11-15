# V60 hot, V60 iced, and Switch source-fidelity audit

Date/access date: 2026-09-07. Scope: current local source, prior plans/evaluation artifacts, and fresh primary-source verification. No application code, inventory, deployment, or persisted recipe was changed. Aiden excluded. Local evidence below is about code-generated output, not the user's current cached recipe or a tasted cup.

## Distinct equipment and mode scope

| App path | Current physical configuration | Audit disposition |
|---|---|---|
| Classic V60 hot | `v60:02:standard-paper`; 12–30g | Separate percolation recipes; no valve phases. |
| Classic V60 iced | `v60:02:standard-paper` mode iced; 12–30g | Separate flash-brew methods and ice accounting. |
| V60 Switch hot | `v60:03:standard-paper:switch:hot`; 15–30g | Separate valve-controlled brewer, not a generic V60 synonym. Source 02/unspecified/10g variants below are research candidates, not automatically compatible originals for 03. |
| Switch iced | Explicitly unsupported | Preserve boundary; researched hot Switch methods do not authorize adding an iced product path. |

Code currently excludes Switch from paired classic iced generation and cached iced reuse (`src/hooks/useHandBrew.js:212`, `:245`, `:385`), guards iced retry (`:461`), and displays an unavailable message with classic-V60 alternative (`src/components/HandBrewModal.jsx:825`–`:834`). This boundary was inspected, not newly tested. Retain tests for generation, cache, retry, and UI after recipe repair. Model, filter, valve state, and peak held volume must all be compatible before source reuse. MUGEN × SWITCH is a third configuration, not ordinary ribbed V60 Switch.

## Finding

Useful professional research exists, but source identities do not reliably constrain the complete emitted recipe. V60 has better provenance machinery than Kalita, yet introduces geometry, timing, grind, and selection changes while sometimes labeling output `original`. Switch intentionally combines parameter fragments into roast presets; its source comparison tolerances establish proximity, not reproduction. Neither recipe diversity nor named-author citations establish best-cup selection.

There is sufficient credible material for a strong, small curated library. Japanese sources provide meaningful alternatives, including low-temperature light-roast V60, fine-grind dark-roast single-pour V60, and both full-immersion and hybrid Switch. They contradict universal rules such as “light roast always needs near-boiling water,” “dark roast always needs coarse grind,” and “bloom is always 30 seconds.”

## Verified primary recipe cards

Numbers below are source facts unless explicitly marked derived or unknown. Water totals mean input water, not collected beverage mass. All timestamps are elapsed from first wetting unless the source uses a duration or leaves the anchor ambiguous. An unspecified geometry means **unspecified**, not stationary center or a prohibition on spirals. Basic recipes can be followed with ordinary pouring skill while still lacking enough specificity for an exact animation or timer claim.

### V1 — Kurasu / head roaster Kosuke: light-roast four-pour

Primary [2023 complete text recipe](https://kurasu.kyoto/blogs/recipe/kurasu-coffee-basic-recipe), published 2023-02-28. Original [2022 guide](https://kurasu.kyoto/blogs/kurasu-journal/kurasu-coffee-brew-guide-2022), published 2022-05-11, specifies Hario V60 01; 2023 text says conical dripper. Do not silently label 02 fidelity proven.

- 14g light-roast coffee, coarse grind; 200g at 91°C. Input ratio 1:14.29 (derived); no bypass.
- 0:00 +40g; 0:40 +60g to 100g; 1:10 +50g to 150g; 1:40 +50g to 200g. Each pour takes 10 seconds.
- After first pour, teaspoon agitation 2–3 times; second pour steady/aggressive; third onward gentle; final stir after last pour. Written source does not require stationary center or forbid spirals.
- Finish around 2:30; remove when water is no longer visible on bed. First stage gives approximately 30 seconds after pouring, reduced further by stirring.
- Applicability: explicitly light roast. Transfer to 02 or different dose needs named adaptation and testing. This is a concrete source-grounded alternative to near-boiling light-roast methods.

### V2 — Tetsu Kasuya / Hario: 4:6, sweetness example

Primary [Hario ambassador interview and recipe](https://www.hario-europe.com/blogs/hario-community/v60-ambassadors-tetsu-kasuya); publication date not displayed; originally HARIOLOGY booklet.

- Ceramic V60; 20g coarse coffee; 300mL, 92°C; input ratio 1:15. Page discusses Kasuya's slower-flow modified cone; recipe heading does not establish exact cone variant/size. Do not erase that distinction.
- Pour additions at 0:00/0:45/1:30/2:10/2:40: 50/70/60/60/60mL; cumulative 50/120/180/240/300. Remove at 3:30.
- Author links first-40% split to acidity/sweetness and remaining pour count to strength. These are the author's tuning claims, not proof of a bean-process classifier.
- Written instructions do not specify exact pour duration, stationary-center geometry, or no-swirl rule. Those fields need original video review before an exact geometry claim.
- Appropriate curated role: coarse pulse option with author-directed taste tuning. No evidence here that natural/anaerobic beans uniquely require it.

### V3 — James Hoffmann / Hario: Ultimate V60, 30g

Primary manufacturer-hosted [recipe/transcription with original video](https://www.hario-usa.com/blogs/recipes-and-more-from-friends/james-hoffmann-uitimate-v60-technique); date not displayed.

- 30g, medium-fine; 500mL, as hot as possible, especially lighter roasts. Input ratio 1:16.67. Text does not independently pin exact cone material/size.
- Prepare central well. 0:00 add 60g and swirl until saturated; next pour at 0:45.
- 0:45–1:15 to 300g; 1:15–1:45 more slowly to 500g; filter contact is explicitly allowed.
- At 1:45 stir once each direction; drain briefly; gentle swirl. Aim for 3:30 drawdown.
- Appropriate role: original larger batch, particularly light-roast preference. 25g adaptation is plausible but not an exact 30g recipe. Do not inject an off-paper prohibition.

### V4 — Kurasu / Kosuke: House Blend Dark, single-pour

Primary [bean-specific dark blend guide](https://kurasu.kyoto/blogs/kurasu-journal/make-your-valentine-s-day-perfect-with-our-house-blend-dark-bright-aromatic-orange-peel-and-rich-bitter-sweet-dark-chocolate), published 2023-02-08, Aya Tanaka; recipe explained by Kosuke.

- Specifically Kurasu House Blend Dark (Brazil/Guatemala/Ethiopia, natural/washed). Hario V60; size/material not stated.
- 16g **fine** coffee, 200g at 91°C; derived input ratio 1:12.5; no bypass stated.
- Pour all water in one go by 0:30; finish about 1:10–1:20. No separate bloom. Exact geometry is not specified in text.
- Author's method combines fine grind with short brew and a single pour. Excellent counterexample to universal coarse-dark routing; faithful for the named bean, a candidate adaptation for other similar developed coffees, not a guaranteed dark-roast winner.

### V5 — Scott Rao / Hario: two-stage, drainage-triggered

Primary [Hario interview](https://www.hario.co.uk/blogs/hario-ambassadors/hario-v60-recipe-interview-with-hario-ambassador-scott-rao), published 2022-05-10.

- Plastic V60 (02 linked); 20g/330mL, 97°C; 1:16.5. Grind not stated. Page's parenthetical “97°F” is a source typo; do not store it as an alternate temperature.
- Bird's nest; 60mL bloom and aggressive spin; wait 40 seconds; pour to 200mL and spin very gently (<1 second).
- **Wait until slurry is about 70% drained**, then pour to 330mL, another gentle spin. Low steady nearly vertical stream, moving across slurry evenly. Finish 4:00–4:30.
- Source says wait 40 seconds after bloom/spin rather than providing an unambiguous absolute 0:40 marker. No fixed 1:40 trigger for final pour.
- Role: higher-extraction, feedback-driven option; timer must support drainage state or explicitly label an estimated checkpoint. Missing grind prevents exact grinder reproduction.

### V6 — Heart Roasters: continuous center main pour

Primary [Heart V60 guide](https://www.heartroasters.com/pages/v60); date not displayed.

- V60 #2, 22g medium-fine, 360g water, 200–205°F (~93–96°C). 1:16.36 input.
- Add 40–50g; **stir vigorously** to saturate; allow 20 seconds degassing; slowly pour into center with low water line; at 360g stir to wash down side grounds.
- Page says pour should take 1:50–2:00 and total contact 2:20–2:30. Pour-duration versus elapsed-end language is ambiguous; do not silently resolve it into a 0:20 main-pour start.
- This validates a centered **main pour** with active saturation, not an all-center/no-stir prescription. No bean-specific high-fines recommendation is supplied.
- Role: distinct center-main-pour family after timing clarification. Existing high-fines removal of both stirs is an app experiment.

### I1 — Kurasu / Kosuke: light-roast Japanese iced V60

Primary [iced guide](https://kurasu.kyoto/blogs/recipe/japanese-brew-guide-on-iced-pour-over-coffee), published 2024-07-14.

- V60 (ceramic linked, size unspecified), 16g light roast, medium-fine; 150g at 91°C over 70g server ice. Input ratio 1:13.75 including ice; hot extraction ratio 1:9.375 (derived).
- 0:00 +40g; 0:40 +60g to 100g; 1:10 +50g to 150g; each pour 10 seconds; last pour gentle. Finish ~2:10.
- Melt recipe ice before serving over additional ice. Beverage yield remains unknown; input total 220g is not beverage mass.
- Written page does not prescribe small-radius geometry, filter avoidance, nor a bloom/final stir; teaspoon in equipment list does not establish a stirring instruction.
- Role: complete numerical light-roast iced family; geometry may stay unspecified until video verification. It is not published as a developed/high-fines rescue recipe.

### I2 — Partners Coffee: flash brew

Primary [Partners help guide](https://help.partnerscoffee.com/en-US/flash-brew-413883); page reports updated 24 days ago at access, no stable original date displayed.

- V60/carafe, size unspecified; 20g medium-fine; 200g hot water, 200–205°F (~93–96°C; instruction uses 205°F), 100g server ice. 1:15 total input; hot ratio 1:10.
- Start timer, bloom 60g and stir; at **0:40** pour to 120g; at **1:20** to 200g. Finish 2:40–3:20, gently swirl carafe, serve over ice.
- Although preceding prose says steep 40 seconds, explicit 0:40 next-step timestamp resolves it as elapsed time including pouring/stirring.
- No stationary-center/spiral prescription or exact pour durations in text. Role: documented 20g iced baseline; no source-backed bean-class superiority claimed.

### S1 — Kurasu / head barista Tsubasa: full immersion and closed-bloom hybrid

Primary [two Switch recipes](https://kurasu.kyoto/blogs/kurasu-journal/2-brewing-recipes-with-hario-immersion-dripper-switch), published 2022-06-29.

Shared setup: 10g filter grind, 160g/94°C, 1:16; Switch size unspecified in prose; ABACA filter recommended, other paper allowed. Preheat closed, discard rinse.

- Immersion: valve closed; first wet entire bed, pour all water within 15 seconds from start. At 2:00, three large spoon mixes; at 2:15 release. Drawdown duration unspecified.
- Hybrid: valve closed; 0:00 40g; open 0:20; 0:40 add 60g to 100g; 1:10 add 60g to 160g; drain. Pour geometry, later pour duration, and final finish time unspecified.
- Role: Japanese professional alternatives with different actual structures, usable as named small-dose source methods. The app's 15g minimum excludes the original 10g dose. Scaling to 20g/03 needs explicit validation, not a renamed source recipe.

### S2 — THE COFFEESHOP: medium-roast full immersion

Primary Japanese [roaster test and recommended recipe](https://www.thecoffeeshop.jp/magazine/coffeetool/hario_immersion_dripper/), published 2020-11-16. Source describes glass Switch with 02 papers.

- Their adjusted recipe: 18g medium grind, 250mL/95°C; valve closed during immersion, release after 2 minutes, finish 2:30–2:45; no agitation needed. Input ratio 1:13.89 (source rounds 1:14).
- Explicit applicability: around medium roast as sold by this roaster; adjust ratio for roast/taste. Earlier tested method starts timer with water pour and opens at 2:00; adjusted recipe says two-minute immersion without separately redefining anchor.
- Contrast: the manufacturer's 20g/240mL was tested at **roaster-chosen 95°C** because manual omitted temperature. Do not attribute 95°C to Hario.
- Role: comparatively complete professional full-immersion medium-roast option. No independent final-beverage mass or grind microns measured.

### S3 — Coffee Chronicler / Asser Christensen: 50:50 hybrid

Primary [author's recipe](https://coffeechronicler.com/hario-switch/), displayed date 2023-02-26 with later variants incorporated.

- Standard 20g/320mL; 0:00 half water valve open, close and pour remaining half at 0:45, release at 2:00; finish 2:45–3:15. Author favors light Nordic roasts; temperature/grind setting not stated numerically on this page.
- Author allows 15–26g and ratios 1:15 for entry conicals, 1:16–17 for consistent grinders. Sweet version closes 0:25 but **still opens 2:00**. Later medium example 30g/480mL closes 1:00/releases 2:30; XL 45g/720mL on 03 closes 1:30/releases 2:45.
- Role: primary-supported single-temperature *structure*, but a numeric kettle setting needs separate direct evidence or clearly labeled editorial starting point. Do not relabel timer.coffee's 92°C as verified author testimony.

### S4 — Hario SSD-200 manual: manufacturer immersion baseline

Primary [manual, page 1](https://www.hario.cc/Items/manual_pdf/SSD.pdf), document code SSD-200説明書1901 (no separate publication date displayed).

- Valve closed, 20g coffee, approximately 240mL hot water; steep about 2 minutes; open and drain. Stir optionally for strength. No numeric temperature, exact pouring geometry, or drawdown target.
- Japanese says medium-fine, English says medium; retain translation discrepancy. Uses V60 02 paper. **Finished capacity ~200mL** is the printed rating; it is not total possible hybrid throughput.
- Role: hardware/immersion baseline and example of uncertainty preservation; incomplete for a fully specified app timer without labeled assumptions.

## Existing references not promoted to freshly verified complete recipes

- Hoffmann one-cup original video `https://www.youtube.com/watch?v=1oB1oDrDkHM` resolves, but the fetch exposes no transcript. Existing 15g/250g pulses were inspected in code, not revalidated against spoken/demo content. Preserve as pending frame/transcript audit rather than pretend this pass watched it.
- Hoffmann flash video `https://www.youtube.com/watch?v=PApBycDrPo0`: existing registry path inspected; video content not verified in this pass. Its 32.5g canonical dose is outside the app's iced 30g ceiling, so every built-in emitted example is adapted/scaled anyway.
- Kasuya Switch God/Devil and Super Hybrid references remain secondary in current registry. A changed one-kettle recipe is not the original two-temperature method. Preserve versions separately; verify Kasuya's actual channel before curating an original card.
- Hario's `MUSD Recipe & Interview.pdf` is **MUGEN × SWITCH** material, according to the primary search result/title. Direct PDF retrieval failed during this pass. Current registry describing it simply as mixed Switch 02/03 should be corrected after document retrieval; do not transfer its recipes to ribbed glass V60 Switch as original.

## Concrete code defects and misleading certainty

File references are current repository-relative paths, with one-based lines.

| Priority | Evidence | Failure and correction |
|---|---|---|
| P1 | `src/lib/v60Adapter.js:244` versus `:110` | Every non-direct recipe receives global center/low/off-paper copy, including Hoffmann large-batch whose own step and source allow filter contact. Generate technique copy from stage-specific source actions; test cross-field consistency. |
| P1 | `src/lib/v60Adapter.js:115`; `src/data/v60SourceRegistry.js:34` | Kasuya emits centered pulses/no swirl and marks canonical-dose result `original`. Hario's verified text supplies quantities/times but no such geometry/prohibition. Keep unknown geometry unknown until original video is checked. |
| P1 | `src/lib/v60Adapter.js:184`; `src/lib/extractionIntent.js:125`; registry `v60SourceRegistry.js:56` | Kurasu original light recipe cannot survive hard ratio >=15, adapter temp >=92, and shared intent temp >=93. Registry retains null core fields although complete first-party 2023 text exists. Direct 14g Kurasu-shaped generation today produces 231g/96°C, versus verified 200g/91°C; this is marked adapted, but not faithful reproduction. |
| P1 | `src/lib/v60Adapter.js:133`–`:149` | Heart's source bloom rest is used as absolute timer start; high-fines branch removes vigorous bloom/final stirring and changes first interval to 30 seconds. Agitation is marked adapted, but cadence differences are not comprehensively tracked at source dose. Keep source version and experimental low-agitation derivative separate. |
| P1 | `src/lib/v60Adapter.js:128`–`:132` | Rao's second pour is drainage-triggered but placed at fixed 100s. A timer must signal conditional readiness, not command it irrespective of drainage. Source bloom remains 60g when dose changes because `source.bloomGrams || bloom` does not scale. |
| P1 | `src/lib/v60Adapter.js:78`–`:97`, `:235`–`:243` | App microns can be attributed directly to source grind language. Actual Heart 22g emits 718µm “Medium-Coarse” while source is medium-fine, labeled original; Hoffmann30 emits 762µm “Medium-Coarse,” source medium-fine. Preserve source descriptor; separate estimated grinder translation, uncertainty, and per-user calibration. |
| P1 | `src/lib/v60IcedAdapter.js:53`, `:75`–`:83` | Kurasu light-roast recipe selected for developed/high-fines inputs; at 15g, canonical sequence is replaced by 45/70/140g at 0/40/95s instead of proportionally scaling 40/100/150g at 0/40/70s. Discontinuous family behavior from changing dose by 1g is not supported as dose scaling. |
| P1 | `src/lib/v60IcedAdapter.js:85`–`:90`, `:152` | Partners exact-dose pulses add low-centered/off-paper geometry not stated by source; attribution says geometry belongs to source. Kurasu similarly adds small circles. Avoid filling gaps with global style defaults masquerading as source facts. |
| P1 | `src/data/v60SwitchConfiguration.js:18`, `:156`–`:163` | 340g cap is applied to **all input water** instead of peak held slurry. A 30g light hybrid becomes 340g (1:11.33), although water drains during phase one. Current Chronicler primary publishes 30g/480g and 45g/720g/03. Use validated stage-capacity constraints and named dose variants; don't break ratio to fit a false total-throughput constraint. |
| P1 | `src/data/v60SwitchConfiguration.js:34`–`:70`; `src/lib/v60SwitchAdapter.js:70`–`:86` | Roast presets combine ratios, phase splits, temperatures, grind offsets, and invented intervals from different structures. Copy asserts timing does Kasuya's temperature-drop job. No verified comparative evidence establishes equivalence. Label current composites experiments; originals should retain their own structure. |
| P1 | `src/lib/extractionIntent.js:67`, `:120`–`:122`; `src/data/v60SwitchConfiguration.js:78`–`:84` | Natural/honey/anaerobic/co-ferment grouped into high-solubility/body/sweetness; Switch adds universal 88–91°C, +125µm, 1:16.5–17 override for anaerobic. Current registry cites general theory/homepage fragments, not controlled Switch comparisons or bean-specific roaster recipe. Suppress automatic authoritative claims; prioritize actual coffee guidance and observations. |
| P2 | `src/lib/v60SwitchAdapter.js:96`–`:145`; configuration `:121`–`:130` | Author's sweet variant keeps final open time at 2:00 while changing close time; app independently adds/subtracts close and steep durations. These are new recipes, not a translation of that variant. Track explicit experimental derivation and taste evidence. |
| P2 | `src/data/v60SwitchConfiguration.js:105`–`:106` | Universal 100s maximum closed time at >=92°C rejects legitimate full-immersion S1/S2 (135/120s respectively). It was designed for the app hybrid and cannot become a brewer-wide extraction law. |

## What happened in the old plans and tests

The 2026-08-02 V60 plan already asks for original author, exact geometry/cadence, parameter provenance, explicit cross-source adaptation, and blind comparisons (`docs/plans/2026-08-02-001-feat-bean-specific-v60-recipes-plan.md:329`–`:344`). The 2026-08-15 Switch plan asks to verify every source before parameters exist and reject orphan numbers (`docs/plans/2026-08-15-001-feat-v60-switch-recipes-plan.md:161`–`:179`). Thus the missing requirement is **enforcement**, not another promise to gather names.

Current tests encode some disputed behavior: `scripts/v60-technique-copy.test.mjs:14` expects Heart high-fines bloom without stirring; `:26` marks Kasuya canonical output original based on dose/water/times without checking source geometry. Iced technique copy checks Kurasu's exact 16g timestamps, but not adjacent doses against a justified scaling policy. Registry validators check ID existence and numeric shape, not claim entailment.

Switch comparator (`scripts/v60-switch-recipe-compare.mjs:27`–`:55`) allows ±20s and ±10 percentage points, and compares to a secondary 92°C/1:15 Chronicler variant. The shadow report's confident “all within” is proximity to those chosen dimensions; it omits grind/agitation, and its synthetic rows use empty intent (`docs/data/v60-switch-shadow-report.md:53`). Its Kasuya temperature difference is explicitly excluded by design. This is useful deterministic engineering evidence, not faithful-source or taste validation.

`docs/data/v60-premise-trial-results.md` remains a required-24-cup notice; `docs/data/v60-iced-calibration-results.md` and `docs/data/v60-recipe-evaluation-results.md` are unfilled templates. This pass did not verify live deployment state and does not infer that old “DEV only” report text still describes current distribution.

## Curated routing policy and acceptance work

1. Preserve source originals as immutable stage recipes with model/filter, original dose, absolute timestamps, pour-duration/rest-duration distinctions, quantities, conditional readiness, geometry, agitation, and unknown fields. A source's temperature **range** is not an exact preferred midpoint.
2. Select exact bean/lot recipe from the roaster first when compatible. Next select from author's explicit roast/application class plus user's dose/equipment and desired cup. Use actual measured stall/fines feedback ahead of origin/process labels. Washed alone does not establish Rao suitability; natural alone does not establish high solubility or Kasuya superiority.
3. First practical curated set: V1 light small-dose; V3 large-batch; V4 exact dark blend/explicit adaptation; V2 coarse pulse taste tuning after geometry review; I1 light iced and I2 20g baseline iced; S1 both Japanese structures, S2 medium immersion, S3 50:50 hybrid with honest missing-temperature status. V5 conditional and V6 timing clarification follow. Keep Hoffmann one-cup once original demo verification is completed. More sources are not automatically better.
4. Each adaptation changes only justified fields and shows source original alongside the result. Do not use family-level lineage as permission to replace bloom, geometry, grind and ratio together. At noncanonical doses choose a validated sibling or explicitly named scaled adaptation.
5. Independent fixture cards should be manually transcribed from original content and reviewed against video frames for geometry. Tests must compare whole stage semantics, not merely existing registry data with its own generator. Cover 14/15/16g Kurasu, 20/22/30g V60, Switch stage volume, true 30-second rest after pouring, drainage-triggered Rao, and global-copy contradictions.
6. Add selection counterexamples: washed high-stall bean; natural without measured stall; anaerobic with direct hotter/finer roaster recipe; light Kurasu at 91°C; dark fine single pour; sparse unknown bean; same bean two doses; one coffee with contradictory research and bag recipe. Unknown inputs may legitimately share a baseline; diversity is not a pass criterion.
7. Validate physical followability first, then compare cups against **faithful named originals**, varying one thing at a time. Log grinder/burr, actual grind setting, filter, water composition, coffee/roast age, dose, water temperature, pour durations, drawdown, and preference. Code cannot prove globally best curation or best cup. A defensible quality claim is that all displayed source facts and adaptations are traceable, and selection improves measured outcomes within the tested scope.

## Work performed and remaining gaps

Freshly fetched and read the 13 principal primary pages/manuals represented in cards V1–V6/I1–I2/S1–S4 (V1 has both 2022 and 2023 pages). Executed read-only local generator probes for six representative paths; the exact outputs substantiate the Kurasu14, Heart22, Hoffmann30, Kasuya20, iced-Kurasu15, and Switch30 findings. No test suite or physical brews were run. No claim is made that every linked video was watched. Outstanding original video geometry/timing ambiguities are listed explicitly and should be closed before labels say exact/original.
