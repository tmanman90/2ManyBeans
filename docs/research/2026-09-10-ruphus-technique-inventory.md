# Ruphus technique inventory and research gaps

Checked 2026-09-10. Read-only audit of active Ruphus `f603631` and separate source-foundation `9f1b547`, plus primary web sources. No source records were changed or newly admitted in this audit.

## What already exists

Active `src/lib/ruphus/techniqueOptions.js` exposes four hot classic V60 families: Hoffmann One-Cup, Hoffmann Large-Batch, Kasuya 4:6 and Heart Continuous Pour. This is code availability, not four newly source-verified originals. Its read tool rejects Kalita, Switch and iced exploration. Existing Kalita pattern enums are heuristic schedules, not named author coverage.

Source-foundation's `src/data/manualSources/{kalita,v60,switch}.js`, `manualRecipeContract.js`, `manualGuidance.js`, `manualSourceTiming.js` and independent `scripts/fixtures/manualSources/` cases are the reuse candidates. Its latest `docs/data/2026-09-07-guided-timing-correction.md` supersedes `2026-09-07-all-manual-source-integration-status.md`: the branch reports 45 research records, 19 source-admitted, 16 timed guides across 13 manual routes. Those totals include unrelated brewers and must not be marketed as chat alternatives. Vibrant is source-admitted but not guided-ready.

## Candidate matrix

| Route/source | Evidence and status | Required treatment |
|---|---|---|
| Kalita155 Kurasu 2023 | Existing admitted timed original; [primary page](https://kurasu.kyoto/blogs/kurasu-journal/how-to-brew-with-kalita-wave-2023) rechecked | Preserve 14g/200g/92°C and 0:00/0:40/1:10 starts; second wetting and final centre stream are distinct. Scaling is not permission to invent timing. |
| Kalita155 Vibrant | [Primary](https://www.vibrantcoffeeroasters.com/kalitawave155) rechecked | Later pour depends on water level. Keep readable reference, not invented seconds, under the owner's timed-intermediate requirement. |
| Kalita155 Anomalous | [Primary](https://anomalouscoffee.com/blogs/brew-methods/kalita-wave-155) checked | Also depends on water falling toward the bed; reference candidate, not a way around the timing gate. |
| Kalita185/155 Ozone | [Primary guide](https://ozonecoffee.co.uk/pages/kalita-wave-brew-guide) checked; new lead | 185 recipe 25g/400g/93°C, cumulative targets 50/160/220/280/340/400 at 0:00/0:30/0:45/1:00/1:15/1:45. Author explicitly suggests 15g/240g proportional 155 version. Transcribe independently, preserve scaled-version labeling and verify practical pour/dose bounds before admission. |
| Kalita185 Onyx Monarch and La Soledad | Existing detailed source-foundation records with named-coffee context | Reverify archived primary recipe/fixtures. Current [Monarch page](https://onyxcoffeelab.com/products/monarch?variant=31861823176802) exposes coffee information to web extraction but not the recorded 400g recipe; don't claim this run reverified its full schedule. [Onyx EU guides](https://onyxcoffeelab.eu/pages/brew-guides) are a recorded lead. |
| Kalita155/185 Drop | Existing original research | Clock origin unresolved. Preserve blocker, not aggregator-supplied timings. |
| Kalita iced | Existing Kurasu/Yamatoya/Little Waves records and older Espresso Parts/Frothy records | Use latest admission/readiness rules, not older “four executable” prose. Preserve after-brew vs server ice and event clock differences; no cross-size assumptions. |
| Switch03 HARIO/Matt Winton hybrid | Existing primary-video transcription; [official video](https://www.youtube.com/watch?v=g9diFrEkn3M), 03 chapter 08:07 | Reuse fixture with explicit native units and 03 hardware. This audit located original video, but did not independently replay/transcribe every frame. [Manufacturer](https://www.hario.co.uk/collections/hario-v60-immersion-drippers/products/hario-v60-switch-immersion-dripper-size-03) confirms 03 and 360mL practical capacity; retained phase volume is a separate calculation. |
| Switch Kurasu immersion/hybrid | Existing [primary-source records](https://kurasu.kyoto/blogs/kurasu-journal/2-brewing-recipes-with-hario-immersion-dripper-switch) | Size and some pour wording unresolved; verify video/hardware before 03 adaptation. Useful leads for distinct immersion coverage, not already-enabled options. |
| Switch Coffee Chronicler 50:50 | [Author's page](https://coffeechronicler.com/hario-switch/) rechecked | Open first half, close/add second half at 0:45, release at 2:00. No numeric temperature on page. Existing record is02; source's large03 variant and any smaller03 transfer need separate treatment. Do not add a temperature from an aggregator as an author fact. |
| Switch Partners/Cary Wong | [HARIO primary page](https://www.hario-usa.com/blogs/recipes-and-more-from-friends/v60-switch-recipe-with-partners-coffee) rechecked | Existing active registry conflicts with original: source is 15g/240g, open bloom then another open pour, close at1:15, open2:30; no numeric temperature. Correct stale16g/256g/90-second locked-bloom attribution; confirm size separately. |
| Switch full immersion, additional hybrids | HARIO video full-immersion chapter; Kurasu; THE COFFEESHOP existing records | Required research lane. Different timing or sweet variant within one structure is not automatically another family. Preserve single-temperature product scope. |
| Switch iced, MUGEN, V60 Kasuya-model | Research exists, including [MUGEN manufacturer booklet](https://global.hario.com/MUSD%20Recipe%20%26%20Interview.pdf) | Different hardware/mode. Reference only in this plan; no silent transfer to ribbed Switch03 or classicV6002. |

## Integration findings

- Active `recipePreview.js` regenerates Kalita/Switch through old engines on some dose/config changes; this would erase a newly selected source unless explicitly version-dispatched.
- Slot alone is insufficient identity. Both standard V60 and Switch can use `v60_hot`; Wave sizes share `kalita_hot`.
- Active source registry has stale Partners details, and old generic Kalita temperature bounds exclude a verified 92°C original. Source-specific validation is required, not globally weakening unrelated recipes.
- Source-foundation introduced its own accepted-source history and timer. Reuse schedule/timing semantics while retaining Ruphus's existing proposal/revision/attempt authority. Do not create two save systems.
- Existing card copy labels every technique as dose-adapted, including possible unchanged originals. Derive provenance wording from actual differences.
- Same-turn cards were already a September8 requirement. This follow-up repairs that delivery gap, not a newly invented feature.

## Admission checklist

Each selectable entry needs primary locator, exact hardware/filter, source revision, named family, original quantities/units, explicit timing anchors, valve/geometry/agitation where provided, qualitative unknowns, source dose and permitted adaptation bounds, readiness reason, and an independent fidelity fixture. Verify arithmetic and practical phase capacity separately from source transcription. Never equate theoretical arithmetic correctness with sensory validation.

Do not assert that a personal coffee requires a technique merely because origin/process/roast keywords match. Explain why trying it may be useful, keep the author's original coffee context visible, and let actual taste feedback guide subsequent adjustments.
