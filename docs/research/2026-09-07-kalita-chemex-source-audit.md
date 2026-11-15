# Kalita and Chemex source fidelity audit

Date/access date: 2026-09-07. Scope: hot/iced Kalita and hot/iced Chemex; Aiden excluded. Status: research and read-only code/runtime audit, not an implemented repair or sensory verdict.

## Findings

The hot Kalita engine cannot reproduce the professional recipe that prompted this audit. A local, offline call with 14g, 200/14 ratio and 92°C produced **217g, 93°C, 42/98/217g cumulative targets at 0:00/0:30/1:15, all centered, and 4:00 total**. Its named-source bibliography does not drive generation. Iced Kalita has substantially better structured source data, but some records silently convert rests into absolute timestamps, turn unspecified agitation into prohibitions, and label inferred details as original. Chemex remains a model-generated recipe under a `hoffmann-chemex` label without a complete primary recipe attached.

Center pouring itself has professional precedent: Kalita's Japanese manufacturer interview with Bar Zingaro describes center pouring for its light-roasted Tim Wendelboe coffees. That is qualitative practice, not a complete numeric recipe or provenance for our particular all-center template. Kurasu hot is deliberately a mixed-agitation method. [Kalita interview](https://www.kalita.co.jp/coffee/kalitastyle.php)

The curated evidence below uses 15 substantive primary pages plus the official Chemex video index; additional discovery pages were screened when closing iced Chemex and 185/20g gaps. The entries distinguish complete procedures from missing parameters and contradictory instructions. Japanese pages were read in Japanese and paraphrased into English. No video was independently watched; Tal's early-spiral observation for [APWXuSMW5Nk](https://www.youtube.com/watch?v=APWXuSMW5Nk) remains user-observed, with the written Kurasu guide independently confirming aggressive second pouring and a stationary final pour.

## Original recipe records

All quantities below are input water unless explicitly called beverage output. `@` denotes the source's absolute brew clock, `rest` denotes time following a completed action, and a water-level trigger remains observational. Unspecified values remain unknown. Publication dates are shown where visible; otherwise unknown. No qualitative grind description is a measured particle size.

### H1 — Kurasu Kyoto 2023, hot Wave 155

[Primary guide](https://kurasu.kyoto/blogs/kurasu-journal/how-to-brew-with-kalita-wave-2023), staffkurasu, 2023-03-13. Original: 14g, 200g, 92°C, coarse; light roast, featuring Guatemala Mauricio Rosales; Wave/filter 155.

- Rinse without collapsing pleats, preheat and discard rinse.
- @0:00: 30g; @0:40: +30g, cumulative 60g; @1:10: +140g, cumulative 200g.
- Second pour aggressively across bed. Final pour: one thin stationary center stream, matching incoming/outgoing flow; keep below the coffee line left by the second pour.
- Finish approximately 2:05–2:15. Individual pour durations and exact bloom geometry are not specified in text. No source-wide ban on swirling.
- Author explicitly permits doubling coffee/water and using coarser grind for two cups; resulting size and timing are not specified. Do not silently equate that with a validated 185 recipe.

Candidate role: verified original for matching 155 dose/light-roast context, with video geometry still to reconcile before calling the first stage video-faithful.

### H2 — Vibrant Coffee Roasters, hot Wave 155

[Primary guide](https://www.vibrantcoffeeroasters.com/kalitawave155), date unknown. 15g/250g, 210–211°F (~98.9–99.4°C), medium-fine/table-salt grind, Wave/filter 155; specialty coffee, no process-specific assignment.

- Rinse/preheat, discard; flatten bed.
- @0:00: quickly distribute 45g by spiraling or zig-zagging over all grounds. Optional spoon excavation to break dry clumps; pouring is intentionally vigorous enough to saturate.
- @0:40: circular/spiral pour to 150g by 1:01 (~5g/s).
- When approximately one inch of water remains above slurry: pour to 250g at 4–5g/s.
- Gently swirl brewer afterward to wash grounds down and settle channels. No fixed final drawdown target; use taste, finer for sour/weak, coarser for harsh/astringent.

Candidate role: a distinct whole recipe with an observational second-pour trigger. Must not rewrite into fixed 0:30/1:15 pulses or remove its agitation merely because coffee is floral/washed.

### H3 — Drop Coffee, hot Wave 155/185

[Primary guide](https://www.dropcoffee.com/pages/this-is-how-we-brew-kalita-wave), date unknown.

| Size | Coffee/water | Temperature | Bloom | Subsequent cumulative targets | Finish |
| --- | --- | --- | --- | --- | --- |
| 155 | 16g/260g | 92–96°C | 40–50g, saturate | 100g after bloom; @1:00 150g; @1:30 200g; @2:00 260g | 2:45–3:00 |
| 185 | 30g/500g | 92–96°C | 70–80g, saturate | 200g after bloom; @1:00 300g; @1:30 400g; @2:00 500g | 3:45–4:00 |

After bloom water, rest 20–30s depending on freshness/bubbling; next pour when bubbling stops. Later clock entries are scheduled. Never let bed dry out between pours; include all grounds, avoid sides. Original grind, spiral radius, stream height, pour duration and independent stirring/swirl instructions are unspecified. Coarser if bitter, finer if sour. Preserve ranges rather than inventing one uniquely sourced value.

Candidate role: original size-specific multipulse family, particularly useful for 185/30g. No documented universal natural/washed routing.

### H4 — LIGHT UP COFFEE, Japanese hot Wave

[Primary guide](https://lightupcoffee.live/blogs/brew-guide/drip-kalitawave), date unknown. 15g/240g/~90°C; Wave size unspecified.

- Rinse/preheat/discard, level bed. @0:00 to 35g; @0:30 to 90g; @1:00 to 140g; @1:30 to 190g; @1:50 to 240g.
- Bloom gently over all grounds; no spoon mixing necessary. Later pours circular, roughly ten seconds each, gently laying water onto bed. After final water, lightly move brewer to level grounds.
- Grind for 2:30–3:00 drawdown. Published native starts include Varia VS3 10.5, TIMEMORE C3S 18 clicks, Lagom P64 5.5; other listed grinders have revolution-specific instructions that must be preserved if transcribed.
- Recommends its own coffees around 2–3 weeks after roast. Prose says wait 30s after bloom but explicit table schedules next pour @0:30; keep the documented absolute schedule and annotate wording ambiguity.

Candidate role: Japanese circular-pulse alternative, pending physical size confirmation. Neither a center-only method nor a reason to assume all light roasts require very hot water.

### H5 — BE A GOOD NEIGHBOR COFFEE KIOSK, Japanese hot Wave

[Primary guide](https://beagoodneighbor.net/pages/coffee-brewguide-kalitawave-dripper), date unknown. 15g/250g/93°C, medium grind, Wave size unspecified.

- Preheat equipment, set filter, add/level coffee.
- @0:00: add 30g in 15s, gently circling over all grounds.
- @0:30: +120g (150g total) in 15s, spiral from outside inward.
- @1:00: +50g (200g total) in 15s, same motion.
- @1:30: +50g (250g total) in 15s, broader circle to wash adhering grounds.
- Drain completely by 2:30–3:00 and remove dripper. The final written instruction says to rotate the dripper for mixing after removal; likely vessel wording error, unresolved. Do not silently convert it into a slurry swirl.

This is direct professional evidence that some recipes intentionally include a 15s pour within a 30s bloom stage. It does not validate a universal 30s bloom. Bean scope is unspecified. Candidate pending size/post-brew clarification.

### H6 — Onyx Coffee Lab Monarch, hot Wave 185

[Primary bean-specific guide](https://onyxcoffeelab.com/products/monarch?variant=31861823176802), date unknown. Explicit Wave 185; 25g/400g/200°F (~93.3°C), source lists 600µm. Monarch is a developed blend; preserve its named-coffee applicability rather than declaring this the recipe for all dark or processed coffees.

- @0:00 bloom to 50g; @0:30 heavy spiral to 160g; @0:45 spiral to 220g; @1:05 spiral to 280g; @1:30 spiral to 340g; @2:00 spiral to 400g. Drain @3:30.
- Primary interactive timer repeats cumulative targets, removing ambiguity about increments. Bloom geometry, individual pour-end times, exact spiral radius and separate swirl/stir steps are not specified in the written recipe.
- Grind number is author-provided, but its distribution/measurement protocol and equivalence to the user's grinder remain unknown. Do not equate the source's 600µm with a guaranteed native grinder setting.

Candidate 185 family at 25g with actual bean-specific provenance and vigorous second pouring despite developed roast. This supplies a useful counterexample to simplistic dark-roast/all-gentle routing.

### H7 — Onyx EU Ecuador La Soledad Sidra, hot Wave 185 at 20g

[Primary Onyx EU brew archive](https://onyxcoffeelab.eu/pages/brew-guides), named entry “EU: Ecuador La Soledad Sidra,” publication date unknown; archived coffee, accessed 2026-09-07. Explicit dripper **Kalita Wave**, filter **Kalita Wave 185**; 20g/310g/208°F (~97.8°C); author lists 750µm, measurement/native-grinder equivalence unknown. Coffee classified by source as washed, ultra light, Ecuador.

- @0:00: bloom to 60g.
- @0:45: spiral-to-center pour to 160g cumulative.
- @1:30: center-to-spiral pour to 310g cumulative.
- Drain target @2:45.
- Bloom geometry, individual pour duration/flow rate, separate stirring/swirl and precise spiral radius are unspecified in written record. Generic rinse/level setup would need separate manufacturer guidance, not a claim that this source specified it.

This closes an explicit **185 at current default dose** coverage gap for the stated bean context; using it for unrelated beans remains selection inference. Nearby Onyx entries say **Origami & Kalita Wave 185**, which means a different dripper with a Wave filter and were deliberately excluded from Kalita-original coverage. No comparably precise Japanese/manufacturer 185/20g original was established in the bounded search; Japanese examples must not be relabeled by assumption.

### I1 — Kurasu / Runatsu, iced after brewing

[Primary guide](https://kurasu.kyoto/blogs/recipe/new-kalita-wave-iced-coffee-recipe), 2024-11-18 (page also misspells author Runastu). Any Wave, 16g/150g hot water at 90°C, 140g ice added to glass afterward; medium-coarse, FELLOW Ode 8.2 (generation not stated). Recommends light-roast single origin.

- Rinse and discard. All pours slow, consistent small circles around center; avoid spiral.
- Cumulative 50g @0:00, 100g @0:30, 150g @1:00; fully drain approximately 1:37–1:40.
- Brew hot into server; add ice to glass afterward, pour coffee over ice, stir until cold. Complete melt is not required.
- Prose says wait 30s but table provides absolute stage starts; use table and retain ambiguity. No specific slurry-swirl prohibition or separate agitation step.

Preserve this whole chilling sequence. Ice mass is not proof of melted dilution or final beverage yield.

### I2 — Yamatoya / deepresso, iced directly over ice

[Primary Japanese guide](https://deepresso.yamato-ya.jp/2024/08/5946/), deepresso editorial team, 2024-08-07. Wave 155, 20g medium-fine; 180g water actually poured, 80g server ice. Equipment list prepares 240ml water; it is not the recipe's poured target. Temperature and final drawdown time unspecified. Featured bean: Fruit Basket, Brazil with yeast-added fermentation.

- Level bed, put ice in server. From ~3–5cm over grounds, slowly pour a thin stream in a 100-yen-coin-sized center circle to 30g.
- **Then start timer and rest about 30s.** Pour to 100g, rest another ~30s; same center-circle pour to 180g, aiming to finish pouring around 1:30.
- Once fully drained, remove dripper and figure-eight stir until ice fully melts; serve over fresh ice.
- The published final-pour target and two rests require a timer origin that the app must preserve, not replace with first-water 0:00/0:30/1:00. Pour durations are unknown.

Candidate direct-chill recipe with important timer semantics; featured fermentation is an example, not validation across all processed beans.

### I3 — Espresso Parts, iced Wave Style 185

[Primary tutorial](https://www.espressoparts.com/blogs/news/kalita-wave-iced-coffee-tutorial), Espresso Parts, 2024-06-27. Wave Style brewer/185 paper; 20g, 160g hot, 160g server ice; 195–205°F (~90.6–96.1°C); medium/sea-salt grind.

- Rinse/preheat/discard, add ice, level grounds.
- Saturate with roughly 60g, wait ~30s, then gently pour continuously in controlled circles to 160g. No exact main-pour timestamp or pour duration stated; bloom time origin unspecified.
- Fully drain in 1:30–2:00; discard grounds/filter and serve over fresh ice. No complete-melt requirement and no written server-swirl step.
- Author suggests trying input ratios 1:15–1:17 according to coffee/grinder/taste. No fixed bean-class selector.

Candidate must keep temperature as a source range, disclose any chosen point, and distinguish Wave Style geometry from unrestricted equivalence to every 185 material.

### I4 — Frothy Monkey, larger iced Wave

[Primary guide](https://frothymonkey.com/blog/iced-kalita-wave-brewing-guide/), date unknown. 33g, 300g hot, 200g server ice, 195–205 (context Fahrenheit), medium-fine; text does not explicitly specify 185 size.

- Preheat/rinse/discard, ice in server, level grounds. Start timer and saturate with 70g (summary 65–70g).
- **Source conflict:** bloom narrative says until @0:30, summary says 40s, next step explicitly starts @0:40. At @0:40 add ~130g (200g cumulative), uniform outward spirals.
- Continue ~50g spiral pours about every 15s to 300g; aim to finish pouring by 2:00. Exact start/end of each later pulse unspecified.
- At slow dripping around 2:30–3:00 remove brewer; swirl server and allow recipe ice to fully melt, then serve over fresh ice.

Hold exact-copy status until contradictory bloom wording, pulse timing and size are resolved; a 40s editorial choice may be labeled an adaptation. Source does not prohibit slurry swirl/stir.

### C1 — CHEMEX manufacturer procedure

[Official written instructions on ChemAer product](https://chemexcoffeemaker.com/products/eight-cup-chemaer-chemex), date unknown; [official general video index](https://chemexcoffeemaker.com/pages/how-to-brew-with-chemex) checked but videos not watched.

Manufacturer's written brewing baseline: medium-coarse; bonded filter with triple layer over spout; one rounded tablespoon (~5.3–5.5g) per 5oz cup, more for strength; boil water then wait for vigorous bubbling to stop. Wet grounds with a small circular pour, wait about 30s, then slowly add remaining water in circles or back-and-forth to saturate evenly; maintain at least quarter-inch headroom. Remove spent filter after desired amount is brewed.

This is a usable manual procedure with unspecified metric input ratio, temperature point, bloom grams, timed pour schedule and final drawdown. ChemAer-specific post-brew aeration is not a generic Chemex slurry step. Treat as manufacturer technique context, not an invented exact 30g/500g recipe. Do not reproduce marketing claims that filtration eliminates all acidity/bitterness as established brewing science.

### C2 — Blue Bottle Coffee, current Chemex guide

[Primary current guide](https://bluebottlecoffee.com/us/eng/brew-guides/chemex), date unknown. 36–46g/600g, 200–210°F (~93.3–98.9°C), medium-coarse; temperature lower for darker roasts, higher for lighter; slightly finer optional for blends. Specific vessel capacity unspecified.

- Triple filter layers toward spout, rinse/preheat/discard, level bed.
- @0:00 bloom to 80g, slow spiral beginning center, ~10g/s.
- @0:45 spiral to 300g, aim finish @1:00; @1:20 to 400g by 1:30; @1:50 to 500g by 2:00; @2:20 to 600g by 2:30.
- Spiral outward and inward, rinsing wall grounds as necessary. Fully drain 4:30–5:30, then remove filter and serve. No separate slurry-swirl requirement.
- No exact coffee dose within range is prescribed; a 40g app baseline must be identified as a chosen point. Do not substitute an older 50g/700g version without a separate historical source record.

Candidate precise modern cafe family; broad origin/density drawdown claims on page remain author guidance, not deterministic origin classifiers.

### C3 — La Colombe, actual iced Chemex original

[Primary roaster article](https://blog.lacolombe.com/2015/09/17/7733/amp/), La Colombe / 1335 Frankford, 2015-09-17. Chemex with Chemex filter; capacity unspecified. 30g coffee, medium-fine/table-salt consistency, 335g hot water at 204°F (~95.6°C; original says 204 degrees in US context), 175g ice in carafe; 510g total water input, 1:17. Featured Ethiopian YirgZ, selected for bright peach/vanilla character.

- Rinse filter and add coffee; put measured ice in the Chemex before brewing.
- Pour 60g over grounds, bloom 30s, then add remaining 275g in pulses while maintaining roughly constant slurry water level.
- Once fully drained, remove filter; swirl Chemex to help melt ice and serve over additional ice.
- Source supplies **no absolute pour timestamps, pulse sizes/count, geometry, pour-end durations, final drawdown target or unambiguous bloom-clock origin**. Preserve procedure and observational level guidance instead of manufacturing a timed three-pour schedule. Does not explicitly require every gram of ice to melt.

Candidate for a guided, completion-driven iced Chemex recipe. Any selected clock, vessel capacity or exact grinder translation is app adaptation. The source's wording about avoiding dilution is not evidence that ice adds no dilution; input ratio already includes ice. It is not a generic 60/40 hot-recipe transformation.

## Concrete implementation defects and boundaries

Line references describe the checked working tree, not an asserted production deployment.

| Severity | Evidence | Defect and consequence |
| --- | --- | --- |
| P1 | `src/lib/kalitaAdapter.js:33`, `:89`, `:107` | Selects a single global geometry then always builds three stages from formulas. Source-specific mixed technique, water targets and bloom semantics cannot survive. Unknown intent defaults to low-agitation/no-swirl at line 44. |
| P1 | `src/lib/kalitaAdapter.js:63`, `:80`, `:87`; `src/lib/extractionIntent.js:125` | 93°C floor and 15.5 ratio floor reject H1 and H4 original configurations; validation codifies the same rejection. |
| P1 | `src/lib/kalitaAdapter.js:92`, `:94` | Fixed 30s next-pour start and synthetic duration do not reproduce source clock or observational triggers. Offline H1 request emitted 4:00 instead of original finish guidance. |
| P1 | `src/data/kalitaIcedSourceRegistry.js:55`; `src/lib/kalitaIcedAdapter.js:114`, `:129`, `:185` | I2's rests become absolute 0/30/60s. Runtime copy says “then pause for 30 seconds” but timer advances only 30s after start of previous pour. Cadence provenance still says original source. |
| P1 | `src/lib/handbrew.js:102`, `:563`, `:521` | Chemex has only “Hoffmann Chemex” option and a short adapted-principles prompt, no source recipe or parameter lineage in output. A respected person's name substitutes for attributable original procedure. |
| P1 | `src/lib/flashBrewTransform.js:94`, `:104` | Iced Chemex scales cumulative numeric water to 60% but spreads original step action text unchanged; a “pour to 300g” hot instruction can accompany a 180g iced target. Source-independent transformation can create internally contradictory brewing instructions. |
| P2 | `src/lib/flashBrewTransform.js:8`, `:24`, `:98`, `:114`, `:151` | Iced Chemex uses blanket 40% ice/60% hot, adds 1°C (cap 99), requests 1.5-step finer shift and inserts 10s timed ice setup. C3 is 335/175, not that split, and places ice before first-water clock. String grinder settings are not shifted; numeric settings use Ode step logic regardless of source calibration. |
| P2 | `src/lib/handbrew.js:98`, `:99`, `:351`, `:359` | Chemex 15–17 ratio and 96–100°C constraints prevent portions of C2's actual range; model generation and post-repair can both distort source originals. |
| P2 | `src/data/kalitaIcedSourceRegistry.js:25`, `:31`, `:91`, `:120` | “No separate agitation specified” becomes “do not swirl/stir,” sometimes even in bloom; I1 Ode 8.2 upgraded to Gen2 without primary confirmation. Omission is not prohibition. |
| P2 | `src/data/kalitaIcedSourceRegistry.js:113`, `:122`; `src/lib/kalitaIcedAdapter.js:169`, `:185` | I4 94°C chosen from range is attributed to source rather than adaptation (temperature adaptation exception only covers Espresso Parts). 55s/70s pulse starts are an interpretation; conflict and pour-complete target absent. |
| P2 | `src/data/kalitaIcedSourceRegistry.js:94` | I3 adds server swirling without the primary written instruction; may be reasonable app advice, but must not carry original-source provenance. |
| P2 | `src/lib/kalitaIcedAdapter.js:159` | `finalBeverageWaterTargetGrams = hotWater + recipeIce` is total water input after complete melt, not measured final beverage water/yield; grounds retain water. Naming/consumer text must not imply exact output volume. |
| P2 | `src/lib/kalitaIcedAdapter.js:60`, `:97`, `:162` | Selection primarily uses size/chilling preference/dose, with explicit flow-risk guard; bean-tailored claim is limited. Qualitative grinds become invented 650/620/680µm points; ±2s per gram guide shift is app interpolation, not recipe-specific validation. |
| P2 | `src/lib/extractionIntent.js:67`, `:83`, `:90`, `:93`, `:121` | Natural/anaerobic/honey/co-ferment collapsed; gentle pouring becomes all-center technique; family names influence recipe ratio/geometry. These are app priors, not source-authorized recipes for every bean. Current high-fines branch appropriately requires explicit trusted flow evidence; do not revive earlier process=fines assumptions. |
| P2 | `docs/data/kalita-source-registry.md:7`; `docs/plans/2026-08-01-001-feat-bean-specific-kalita-recipes-plan.md:194` | Hot bibliography omits promised full source parameter records and mislabels Miki's brewer. Historical audit records Weber Bird. Registry presence cannot count as source fidelity. |

Existing I1/I2/I4 ice-placement and complete-melt flags substantially preserve important source distinctions. Keep that improvement; correct the affected parameters and provenance rather than treating the iced engine as entirely unsourced.

## Wave 155 versus 185 coverage and unsupported edges

The application currently accepts **155: 12–20g (default 15g)** and **185: 15–36g (default 20g)** in both hot/iced normalization (`src/data/kalitaConfiguration.js:2`, `src/lib/kalitaIcedAdapter.js:39`). Those are software bounds, not primary-source proof of equal brew quality throughout.

| Configuration | Verified original recipe coverage | Open applicability boundary |
| --- | --- | --- |
| Hot 155 | H1 14g; H2 15g; H3 16g | 12–13g and 17–20g have no original-dose representative in this selected corpus. Scaling requires disclosed adaptation and physical verification. |
| Hot 185 | H7 20g; H6 25g; H3 30g | Supported 15–19g/21–24g/26–29g/31–36g lack original-dose coverage here. H7 closes the default-dose gap for an ultra-light washed example, not every bean. H1's doubling note is not an explicit 185 assignment. |
| Iced 155, chill after | I1 16g, explicitly any Wave | Other doses are scaling; source compatibility with the size does not validate 12–20g timing scaling. |
| Iced 155, direct | I2 20g with explicit 155 | Smaller dose adaptation must preserve actual post-pour rests. |
| Iced 185, chill after | I1 16g, explicitly any Wave | At 20–36g this is a dose adaptation, not exact original. |
| Iced 185, direct | I3 20g in Wave Style using 185 filter | I4 33g is a larger Wave recipe but text size unspecified. Current app treats it as 185; record this inference and confirm physically. 15g/36g edge coverage is unverified. |

H4/H5 do not name a size in text; hold size-specific source admission until verified, rather than assigning them both sizes from their doses. Filter size, dripper size, dripper material/model and dose should be separate compatibility fields. Same filter shape or a selectable size is not evidence that source flow/timing survives a dripper change. No representative physical tests were run in this audit.

## What bean-aware curation can honestly assert

Use equipment and brew mode as hard compatibility gates, then source-stated coffee scope, then actual roaster/bean instructions, then user taste feedback. Origin/process/roast labels can supply disclosed starting hypotheses; they cannot prove fines production, unique optimal geometry, or a mandatory agitation ban. Specific source beans are examples, not controlled trials across an entire process class.

For matching light-roast 155 configurations H1 and H2 are documented alternatives with very different energy/geometry. Source-supported low-temperature H4 shows why a global minimum cannot be a quality standard. I1 explicitly recommends light single origins; I2 supplies a fermented Brazilian example, not a rule to route every anaerobic coffee there. C2 offers actual roast-linked temperature direction. Preserve each original first and explain separately why the app selected it and what changed.

The minimal initial curated set should include H1, H2, H3 in both sizes, H6, H7, I1, I2, I3, C2 and C3, with C1 as manufacturer setup context. C3 needs completion-driven guidance rather than invented exact clock cues. H4/H5 add valuable Japanese diversity after size/wording checks; I4 remains adapted/qualified until source conflicts are resolved. Do not hold the entire audit hostage to expanding an endless catalog; use explicit evidence gaps as admission gates. “Best resource” needs trustworthy provenance and useful outcomes, not the most named recipes or the largest list of citations.

## Repair contract and source-reproduction checks

1. Store immutable originals separately from selected/adapted recipes. Source URL, author, visible date/access date, equipment/filter/size, actual featured coffee, all original ranges, stage motion, independent agitation, pour endpoints, time origin, rests, observational triggers, finish conditions, ice placement/melt and unknowns must remain retrievable. Unknown size cannot become silently universal.
2. Introduce stage-specific actions with separate pour-start, optional pour-end, rest-after-completion, absolute-time and water-level trigger semantics. Recipe view, guided timer and spoken instructions must all use the same stage model. Retain source inconsistencies as notes; a chosen interpretation changes provenance.
3. Before adapting, verify original-dose H1 numerics and mixed second/final styles; H2 optional bloom spoon plus final swirl and water-level trigger; both H3 dose/time profiles; H7 185/20g and opposite main-pour transitions; I1 ice after complete drainage; I2 timer start after first pour plus two real rests; I3 range-point disclosure; C2 five-stage cumulative weights; C3 original hot/ice split, 60g bloom and completion-driven pulses with no invented absolute clock. Verify source omissions never become prohibitions and source ranges are not clamped away. Assert iced Chemex text quantities equal numeric targets.
4. Counterexamples: unknown bean must receive named baseline with low selection confidence; generic “gentle pour” must not prohibit bloom saturation motion; negative “does not clog” must not activate flow guard; natural/honey/anaerobic labels must not alone trigger high-fines claims; different beans may legitimately receive the same unchanged original recipe.
5. Scale only through recipe-specific rules labeled app adaptations. User dose change must not preserve an exact-source label for cadence or guide. Avoid invented precise microns; retain native source grinder/burr calibration if known and call conversions estimates. Expose total input water separately from beverage yield.
6. Verify modal/timer/cache/grinder/configuration paths offline and on Dev after implementation, version stale generated recipes, and keep UI-copy fidelity separate from sensory evaluation. Representative repeated blind brews should record actual equipment, water, roast age, drawdown, beverage mass and user taste; no software test can prove a universal best cup.

## Verification performed

Read current adapters/registry/shared intent/legacy Chemex prompt and earlier hot fidelity audit, plus April handbrew and August Kalita plans. Ran two offline module calls, without network/model/private inventory access: H1 attempted original configuration and I2 exact-dose direct chill. H1 differences are in Findings; I2 output had absolute 0/30/60 cadence while declaring `parameterSources.cadence = yamatoya-wave-155-direct-v1`, despite only temperature/guide/technique/grind appearing in changed fields. No app code, saved recipe, deployment or sensory test was changed/run. Primary-page retrieval is current; inaccessible guessed Chemex URLs were replaced by verified official navigation. No relevant memory evidence was used.

Follow-up gap closure added H7 and C3 and a third offline module probe of the existing Chemex iced transform using a synthetic 30g/1:17 hot fixture. It returned 306g hot/204g ice, with `waterTotal: 36` next to “Bloom with 60g water,” `waterTotal: 180` next to “Pour to 300g,” and `waterTotal: 306` next to “Finish at 510g.” This is an internal consistency failure proven independently of sensory preference. It does not claim that this synthetic fixture was a saved user recipe. The manufacturer iced PDF URL was discoverable but not retrievable; no parameters from its third-party OCR were admitted. Additional Japanese 185/20g discovery did not establish a complete numeric original; H7 supplies explicit brewer/dose evidence from Onyx instead.
