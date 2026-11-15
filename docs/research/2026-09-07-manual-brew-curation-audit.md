# Manual brew recipe curation audit

Date: 2026-09-07. Status: audit and repair plan complete; source library promotion, application repair and physical validation remain implementation work. Aiden excluded.

## Verdict

The app has useful research, but its recipes are not consistently faithful to that research. This is a system-wide provenance and execution problem, not just a bad Kalita instruction. Named sources can coexist with invented stage geometry, altered temperatures and quantities, incorrect timing, and unsubstantiated bean matching. Adding more citations without changing these behaviors would not fix it.

This audit covers **seven equipment configurations**: Kalita 155, Kalita 185, classic V60 (currently 02), Switch (currently 03), Chemex, AeroPress and French Press. All current hot/iced paths are included. Switch iced is already unsupported and remains distinct from classic iced V60. Sources for other models or sizes are research candidates, not permission to pretend they match the selected equipment.

Three research agents independently examined brewer families and primary sources; the main audit examined shared bean evidence, history and downstream contracts. Feasibility, source-fidelity and usability reviewers then challenged the repair plan. No application code, saved recipe, inventory or deployed app was changed. Local generation probes establish reproducible code behavior, not the exact cached recipe currently on Tal's device or sensory quality.

## How this happened

1. **Research was reduced to fragments.** Hot Kalita has a bibliography, but its generator does not reproduce complete source recipes. Other methods have stronger registries yet still combine source parameters with global rules.
2. **Global assumptions overruled originals.** Temperature/ratio clamps, inferred grind values, and a single pouring style change otherwise valid source instructions. A phrase such as gentle final pouring can become gentle center pouring for every stage.
3. **Validation checked the wrong thing.** Numeric validity, deterministic output and variation between beans do not prove agreement with the original brewer. Some existing assertions preserve the incorrect behavior itself.
4. **The execution model loses information.** Fixed timestamps cannot faithfully express a rest after pouring or a water-level condition. Generic iced transformations can update numbers without updating the action text.
5. **Evidence confidence was too broad.** Having a source object or model-written research is not the same as having a verified recipe or evidence for a particular bean-selection decision.

These are established implementation mechanisms. The audit does not infer an earlier agent's intent or claim that no research was performed. The initial incident and exact code failures are recorded in the [Kalita fidelity audit](../data/2026-09-07-kalita-hot-source-fidelity-audit.md); shared selection failures are in the [bean evidence audit](2026-09-07-bean-routing-evidence-audit.md).

## Coverage and source candidates

“Candidate” means an original procedure has been inspected and its limitations recorded. It does not mean the current app reproduces it or that transfers to different doses/hardware have been tested. Full factual cards, links, timing conventions and uncertainties are in the family audits.

| Equipment | Current defect | Hot source candidates | Iced coverage and qualification |
| --- | --- | --- | --- |
| Kalita 155 | Synthetic all-center stages and universal 30s checkpoint; original Kurasu parameters rejected | Kurasu 14g, Vibrant 15g, Drop 16g | Kurasu chill-after method; Yamatoya explicit 155 direct chill. Preserve their different timer origins and ice handling. |
| Kalita 185 | Same generator as 155 without complete size-specific provenance | Drop 30g; Onyx Monarch 25g; focused follow-up Onyx 20g original in family audit | Espresso Parts Wave Style/185 filter at 20g; Kurasu explicitly allows any Wave. Larger-dose and material transfers require separate evidence. |
| Classic V60 02 | Global center/off-paper copy, grind drift and fixed replacements for conditional pouring | Hoffmann larger batch; Rao conditional recipe; Heart center-main-pour; Kurasu light/dark; Kasuya coarse pulses | Kurasu light-roast iced and Partners flash brew. Several originals omit size or use 01; do not promote them as exact 02 without compatibility evidence. |
| Switch 03 | Composite roast presets and total-water cap confused with retained volume | Kurasu immersion/hybrid; THE COFFEESHOP medium immersion; Coffee Chronicler hybrid and size/dose variants | No current iced support. Kurasu's original 10g/unspecified size and THE COFFEESHOP's 02 are not automatically original 03 recipes. |
| Chemex | “Hoffmann Chemex” label over generated principles; generic iced transformation | Current Blue Bottle guide and manufacturer technique context | La Colombe original iced Chemex identified in focused follow-up. Vessel fit, pulse conditions and unspecified times must remain explicit. |
| AeroPress | Generated/normalized recipe can alter ratio claims; iced stages/prose conflict and may duplicate pressing | Hoffmann's original description; Shuichi Sasaki 2014; manufacturer-published championship variants | THE COFFEESHOP Japanese iced methods. Keep upright/inverted, original/XL and bypass separate; original hardware and manufacturer guidance matter. |
| French Press | Generated family rules can conflict with source temperature, ratio, settling and plunge behavior | Stumptown; SCAA baseline with vessel ambiguity; Hoffmann video pending content verification | THE COFFEESHOP Japanese iced methods from 2016 and 2024, with versioned quantities and ice handling. |

Detailed source ledgers:

- [Kalita 155/185 and Chemex](2026-09-07-kalita-chemex-source-audit.md)
- [Classic V60 and Switch](2026-09-07-v60-switch-source-audit.md)
- [AeroPress and French Press](2026-09-07-immersion-source-audit.md)
- [Bean matching and brewing evidence](2026-09-07-bean-routing-evidence-audit.md)

Japanese discovery includes Kurasu, LIGHT UP COFFEE, BE A GOOD NEIGHBOR, Yamatoya, THE COFFEESHOP, Hario/Kasuya and Shuichi Sasaki. Their inclusion is grounded in actual published procedures; it is not an assertion that every Japanese recipe is better. Other original sources supply useful contrasting methods and equipment coverage.

## Concrete failures reproduced

| Case | Source or coherent behavior | Observed local behavior |
| --- | --- | --- |
| Kurasu hot Kalita | 14g/200g/92°C; 30/60/200g cumulative at 0:00/0:40/1:10; aggressive second pour, stationary final stream | 217g/93°C; 42/98/217g at 0:00/0:30/1:15; all centered; 4:00 finish |
| Kurasu hot V60-shaped input | 14g/200g/91°C | 231g/96°C |
| Heart V60 grind | Medium-fine source description | 718µm and “Medium-Coarse,” with original attribution |
| Switch hybrid at 30g | Separate total throughput from held volume during closed phases | Total water capped at 340g, producing 1:11.33; cited author publishes a 30g/480g variant |
| Iced AeroPress transformation | One consistent set of stage quantities and action instructions | One probe: headline 119g hot, stages 120g, prose still 200g; duplicate pressing and contradictory temperature representations |

Exact probe conditions and code anchors are in the family audits. These are offline helper/generator probes. No full test suite, live inventory evaluation, device acceptance or physical brews were run during this documentation audit.

## Center pouring and bloom timing

Professional center pouring exists. Kalita's own [Bar Zingaro interview](https://www.kalita.co.jp/coffee/kalitastyle.php) describes centered pouring with Wave equipment for Tim Wendelboe light-roasted coffees. It does **not** publish a complete numeric procedure establishing our all-center template. Heart also publishes a center-main-pour V60 method that includes stirring. Neither justifies deleting source bloom agitation.

The [Kurasu Wave 2023 written guide](https://kurasu.kyoto/blogs/kurasu-journal/how-to-brew-with-kalita-wave-2023) independently confirms aggressive second pouring followed by a stationary center finish. Tal's video observation adds spiral bloom geometry; that video-only detail remains user-observed until independently checked. Do not claim the audit watched it.

A source checkpoint at 0:30 includes pouring time when the timer starts with first water. A 10s pour then leaves 20s before that checkpoint. This is legitimate in some published methods: BE A GOOD NEIGHBOR explicitly allocates 15s to its first pour and begins the next at 0:30. It is not a universal adequacy rule. Kurasu Wave uses 0:40; other sources specify a rest after pouring or an observation. The app must say which it means and execute that convention.

## Bean-specific selection that evidence supports

Select a complete compatible method first. Apply the following order, preserving the reason for any adaptation:

1. Equipment, filter, mode, dose and physical fit.
2. A verified recipe for the exact bean/lot, or accepted user feedback for a compatible recipe revision.
3. The author's stated roast/application context and the user's cup preference.
4. Limited, disclosed starting assumptions when stronger evidence is absent; then taste and observed flow to refine.

| Bean information | Defensible use | Unsupported shortcut to remove |
| --- | --- | --- |
| Light roast | Offer original light-roast methods such as Kurasu or Hoffmann according to dose, method and preference | All light beans must use near-boiling water |
| Developed/dark | Preserve actual methods such as Onyx Monarch or Kurasu's named dark blend | All dark beans need coarse grind and gentle pouring throughout |
| Natural/honey/anaerobic/co-ferment | Retain the stated process; use an exact roaster recipe when available | Treat all as one measured high-solubility class with universal cooler/coarser overrides |
| Washed/origin/altitude | Descriptive context and author-supported suitability | Infer fines, density, extraction difficulty or a winning recipe from country alone |
| Decaf | Preserve decaf status; tune from actual flow/taste and direct guidance | Assume every decaf clogs or requires the same technique |
| Freshness | Use known roast date and observed bloom within the author's method | Invent roast age or force 30s for every coffee |
| Repeated stall or astringency | Compare compatible brew records and adjust a justified variable | Treat a flavor note or “no stall” as affirmative measured clogging evidence |
| Sparse/conflicting evidence | Use a named compatible baseline with an honest explanation | Manufacture confidence or force different recipes merely to show personalization |

Similar coffees may receive the same method. Scott Rao's [discussion of approaching different coffees](https://www.scottrao.com/blog/2024/2/26/how-to-approach-brewing-different-coffees) supports a stable foundation with deliberate adjustments, rather than compulsory method changes by origin. It does not validate every current app heuristic.

## Repair and acceptance

The [implementation plan](../plans/2026-09-07-001-fix-source-faithful-brew-recipes-plan.md) specifies eight units: source records, timer semantics, bean evidence, Kalita, V60/Switch, remaining manual methods, UI/history integration, and evaluation. First implement original source records plus the timing contract; prove the Kurasu 155 case and a separate 185 case end to end, then migrate the other families and their iced paths. Aiden remains unchanged, including shared-module behavior.

The quality standard is measurable:

- Every promoted method has a directly inspected original source, version, author and equipment eligibility record.
- Every specified original parameter survives at the original configuration; each change has explicit adaptation lineage.
- Unknowns stay unknown. An omitted swirl instruction is not a no-swirl instruction; qualitative grind is not an exact micron measurement.
- Every current configuration/mode has a coverage verdict and a supported curated path before full migration is declared complete.
- The recipe, instructions, timer, saved revision and chat adjustment agree on the same method.
- Original fixture checks are independently reviewed against the actual sources, not generated from the registry under test.
- Physical execution/capacity and sensory preference have separate evidence. Source fidelity can be verified; “best cup” and “best app” cannot be established by this desk audit.

Open research gates include video-only instructions, conflicting published timing, unspecified equipment, and transfers to unsupported original doses. Each is named in its source card. Research completeness for an audit means those gaps are visible; it does not turn provisional cards into validated recommendations. A staged Dev build can support testing, but full validated curation requires the implementation and physical checks described in the plan.
