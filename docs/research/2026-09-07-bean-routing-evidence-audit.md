# Bean routing and shared recipe contracts

Audited 2026-09-07 against checkout HEAD `95cf44a` plus visible working tree. Aiden is excluded. This is an evidence and code audit, not physical brew validation. Existing unrelated Ruphus files are in progress and are not treated as released behavior.

## Verdict

The app needs independent evidence for two different claims: that a recipe reproduces an author, and that selecting or adapting that recipe is justified for a particular coffee. A correct source link alone establishes neither. Different beans may correctly receive the same foundational recipe. Variation is not an acceptance metric.

## Shared defects and limitations

| ID | Finding | Current evidence | Required correction |
|---|---|---|---|
| SH1 | Model interpretation is called research without being fresh source retrieval | `src/lib/beanResearch.js:49,119` asks the model to use its knowledge, requests density/extraction estimates, sends messages without a search tool | Preserve model inference separately from verified bag/roaster evidence. Do not change shared Aiden behavior under this audit; introduce non-Aiden interpretation boundaries where needed. |
| SH2 | Provenance is collapsed before technique selection | `src/lib/extractionIntent.js:58-65,90-100` concatenates source, stored notes, model processing/flavor/extraction/roaster text into `allGuidance`; “gentle pour” from any part can select low-agitation center | Keep field, scope, author and evidence class through selection. A gentle main pour must not prescribe a gentle bloom. Contradictory stages cannot be merged by keywords. |
| SH3 | Staged temperatures and alternative ratios can be averaged into a new number | `src/lib/extractionIntent.js:14-31` collects all Celsius values, averages them; ratio parser averages matches and clamps to 15.5–19 | Parse structured recipe stages and alternatives separately. A 90→70°C sequence is not an 80°C recipe. Reject ambiguous extraction instead of inventing a mean. |
| SH4 | Generic bounds overwrite legitimate source values | `src/lib/extractionIntent.js:125`, hot adapter bounds, legacy device ranges | Source/configuration-specific validation. Do not treat aesthetic “usual ranges” as equipment limits. Distinguish warnings, unsupported adaptations, and hard physical constraints. |
| SH5 | Bean properties are used as unsupported hard proxies | `src/lib/extractionIntent.js:67-72,87-100,117-123`; legacy `handbrew.js` families | Existing correction removed density as proof of fines from the shared flow branch, but other process/solubility/technique assumptions remain. Decaf, roast age and measured behavior need explicit representation; missing values remain unknown. |
| SH6 | Confidence of an entire recipe inherits source-object presence | `src/lib/recipeEvidence.js:46` assigns high confidence whenever normalized source insights exist | Attribute confidence per claim. A bag's tasting descriptors do not verify grind, temperature, technique or source fidelity. |
| SH7 | Numeric grinder translation is approximate | `src/lib/brewMethods.js:41-103` linear setting/micron transforms and `descriptorForMicrons` | Preserve original grinder/model/burr/zero convention when supplied. Cross-grinder output is an estimated starting point, not measured equivalence. Do not modify Aiden's shared conversions as a side effect. |
| SH8 | Fixed-interval timer cannot faithfully represent every original recipe | `src/lib/brewTimerSteps.js:67-87` requires strictly increasing fixed starts and a finite guide after final step | Support timed checkpoints, rests after completed pours, condition/manual events, and source-clock bases; never invent a timestamp merely to pass validation. |
| SH9 | Dose scaling carries technique and timing through unchanged for legacy recipes | `src/lib/recipeScaling.js:49-111` | Source-specific dose ranges and scaling policies; keep original recorded recipes intact. Changing dose need not change every time, but requires a documented policy. |
| SH10 | Entry points share generators but source display is weak | `src/components/QuickRecipeFlow.jsx` delegates to `useHandBrew`; Inventory and Chat mount the same modal; `HandBrewModal.jsx:636-670` emphasizes engine and rationale, adaptation text but no original source link in this block | Show the selected author/method and source link, plus original/adapted state. Stage instructions must remain identical in modal/timer/chat proposal projections. Review in-progress Ruphus integration separately before release. |

## Evidence ledger for selection policy

All sources below were accessed 2026-09-07. Paraphrases are deliberately scoped; these sources do not provide a universal bean-to-technique lookup table.

### BR1 — Scott Rao, How to approach brewing different coffees (2024-02-26)

https://www.scottrao.com/blog/2024/2/26/how-to-approach-brewing-different-coffees

Professional primary opinion: use a successful foundation for similarly roasted coffees and normally dial grind first. Rao names some high-fines Ethiopians/decafs as possible exceptions, not every coffee in those categories. He also warns against precise grinder-setting predictions across equipment. This challenges the old “six unique fingerprints” success criterion. It is one respected approach, not consensus that different source recipes are useless.

### BR2 — Barista Hustle, P 1.05 Blooming (publication date not displayed)

https://www.baristahustle.com/lesson/p-1-05-blooming/

Primary education: bloom wetting and gas release are linked to freshness and roast. Surface extraction begins when water contacts grounds. This supports distinguishing elapsed bloom time from rest after pouring. It does not establish a universal 30-, 40-, or 45-second optimum or justify natural-process→short-bloom rules.

### BR3 — Barista Hustle, Blooming Marvellous; Stirring Strikes Back (2021)

https://www.baristahustle.com/blooming-marvellous/
https://www.baristahustle.com/stirring-strikes-back/

Primary experiments reported limited and initially surprising results around bloom agitation, followed by requests for more data. They do not support universal always-stir or never-stir rules. Preserve each author's actual method and mark app deviations rather than extrapolating one experiment across all filters, doses and grinders.

### BR4 — SCA/UC Davis interview, Brewing Temperature and the Sensory Profile of Brewed Coffee

https://sca.coffee/sca-news/read/just-published-brewing-temperature-and-the-sensory-profile-of-brewed-coffee-37dt6

Researcher interview on a controlled study: at fixed strength and extraction, temperature had little sensory effect over the tested 87/90/93°C range, using a wet-processed Honduran coffee on a commercial brewer. Temperature still affects extraction rate. Do not generalize this to all temperatures, all coffees, or a claim that temperature does not matter.

### BR5 — Jonathan Gagné, The Physics of Fines Migration (2020-02-01)

https://coffeeadastra.com/2020/02/01/the-physics-of-fines-migration/

Primary technical exposition discusses migration, clogging, and flow/extraction unevenness while acknowledging complications translating granular physics to wet coffee. Supports observing actual drawdown and grinder/filter interactions; does not establish that every high-altitude washed coffee requires a no-swirl center pour.

### BR6 — SCA, Water and Coffee Acidity (25 Magazine, issue 9)

https://sca.coffee/sca-news/25/issue-9/english/water-and-coffee-acidity-how-to-adapt-your-water-for-different-extraction-methods-25-magazine-issue-9-pxjby

Primary industry education separates hardness, alkalinity and pH and explains their differing implications. Water is part of recipe context and brew validation. A generic sour/bitter diagnosis without considering water can misattribute a cup outcome solely to grind or technique. No new universal water numbers are imposed here.

## Proposed routing order

1. Filter by actual brewer/model/size/filter, mode, capacity during each stage, dose envelope, and equipment the user has.
2. Prefer verified guidance for the exact coffee and compatible setup, preserving the complete original recipe.
3. Consider recorded successful brews for this bean and compatible configuration. Keep the user's accepted recipe stable; new curation must not silently rewrite it.
4. Apply author-declared applicability (roast, dose, iced service, strength goal). Preserve conflicting respectable methods as alternatives.
5. Where evidence is sparse, choose a documented general starting method. Use roast/process/variety/decaf/freshness as explicitly weak priors only where a corresponding rule is supported. No forced variation by country or tasting descriptor.
6. Adapt one meaningful control based on observed taste/flow or an explicit cup goal. Store the original, changed fields, evidence and rationale. Interdependent water/dose fields must remain mathematically consistent.

## Acceptance examples

- Two similarly roasted washed beans with no contradictory evidence may get the same original method; this passes.
- “Light roast; no stalling; gentle final pour” cannot activate a universal high-fines or no-spiral bloom rule.
- A 90°C percolation followed by 70°C immersion source retains both temperatures and its transition.
- A decaf without flow observations is not automatically classified as clogged; a recorded stall can justify a documented change.
- A recipe requiring a 30-second rest after a 12-second pour cannot advance the next step at absolute 0:30.
- Source timer starting after filling is preserved as an event; physical first-contact duration remains separately measurable without shortening the original wait.
- An unsupported dose/filter cannot silently retain an “original recipe” label after adaptation.
- A model-only claim with a credible-looking author name is not promoted to verified provenance.

## Quality bar

All promoted recipes must pass source reproduction, implementation contract, presentation parity and applicability review. Sensory improvement requires recorded brew feedback; greater numbers of recipes, citations, tests, or distinct outputs cannot substitute. “Best resource on any app” is a product ambition; this audit establishes measurable curation standards, not a verified global ranking.
