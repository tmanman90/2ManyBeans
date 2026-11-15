# Hot Kalita source fidelity audit

Date: 2026-09-07
Status: confirmed defects; repair scope, not completed implementation or sensory validation.

## Trigger and evidence boundary

Tal observed that the Kurasu video uses circular/aggressive early pours followed by a stationary center pour, whereas the app instructs centered pouring even during bloom. The YouTube URL could not be fetched by the web tool in this audit. The written primary guide was read successfully; video-only details remain user-observed until independently checked.

- Video: https://www.youtube.com/watch?v=APWXuSMW5Nk
- Written primary: https://kurasu.kyoto/blogs/kurasu-journal/how-to-brew-with-kalita-wave-2023

The written guide specifies Wave 155, 14g coffee, 200g water, 92°C, coarse grind; 30g at 0:00, another 30g at 0:40, and 140g at 1:10. The second pour is aggressive; the final pour is a thin stationary center stream with input matched to drainage. Finish guidance is 2:05–2:15. The transition between pouring styles is explicitly central to the method. It does not justify stationary low-agitation pouring throughout.

## Confirmed implementation gaps

1. `src/lib/kalitaAdapter.js` applies one technique category across stages. Low-agitation branches impose centered bloom and prohibit spirals during both main pours.
2. Every hot Kalita recipe starts its first post-bloom pour at 30 seconds, regardless of source or bean. This is an elapsed checkpoint from first water contact, not 30 seconds of rest after pouring.
3. Temperature is clamped to at least 93°C and ratio to at least 15.5. Kurasu's 92°C and 200/14 ratio cannot survive these bounds. Shared `extractionIntent.js` also clamps these values, so changing only the adapter would be insufficient.
4. Bloom volume is always three times dose, and first main-pour target is always 45% of total water. Kurasu's original three water targets cannot be reproduced.
5. The hot adapter does not consume `sourceRecipes` or carry parameter-level source attribution. Its short Markdown registry is a bibliography, not an executable source recipe collection.
6. Existing tests assert the generated center-only wording and fixed cadence. They establish consistency with implementation, not agreement with an original source.

## Bloom timing evidence

Absolute brew timestamps include the time spent pouring. A 10-second pour followed by a next step at 0:30 leaves 20 seconds without pouring; grounds begin wetting during the pour. This arithmetic does not establish that the resulting wetting/degassing is sufficient for every coffee.

- Kurasu hot 2023: first post-bloom pour at 0:40.
- Vibrant Wave 155: rapid 45g bloom across the grounds, main pour starts at 0:40. Later pour is triggered by water level, not a fixed timestamp. https://www.vibrantcoffeeroasters.com/kalitawave155
- Hario's Hoffmann V60 transcription: start timer with bloom water, next pour at 0:45. Cross-brewer timing-convention example only. https://www.hario-usa.com/blogs/recipes-and-more-from-friends/james-hoffmann-uitimate-v60-technique
- Drop Coffee: wet grounds, then wait 20–30 seconds with bubbling/freshness guidance. Preserve this as a rest/observational instruction; do not silently convert it to an absolute 0:30 start. https://www.dropcoffee.com/pages/this-is-how-we-brew-kalita-wave

## Repair sequence and acceptance criteria

1. Transcribe a bounded set of complete original hot Wave 155/185 recipes, verifying stage geometry, agitation, water targets, temperature, grind description, start/end checkpoints, rests, and drawdown conditions. Mark unspecified details unknown. Correct the Miki registry entry to Weber Bird context, not a Wave recipe.
2. Represent instructions per stage, keeping bloom saturation separate from main-pour geometry. Preserve absolute checkpoints versus rests after pouring versus water-level triggers. UI and timer must use the same stage instructions. Example: “Pour to 30g, then wait until the timer reads 0:40”; do not say “rest 40 seconds” for this source.
3. Reproduce each source at its original configuration before enabling adaptations. Kurasu 14g/200g/92°C and 0:00/0:40/1:10 are an explicit regression case. Do not manufacture exact micron values or pour durations from qualitative source descriptions.
4. Select whole recipe families using documented applicability. Label bean-based selection and numerical changes as app inference/adaptation; a generic “gentle pour” phrase must not prohibit spiral bloom wetting. Sparse evidence should select a named, documented starting recipe without claiming a uniquely optimal match.
5. Preserve configuration and timer contracts, invalidate old generated caches through versioning, and keep original versus adapted parameter provenance. Avoid collateral changes to V60 or iced engines through shared intent bounds.
6. Run source-reproduction and counterexample tests, downstream timer/cache/dose tests, and a read-only inventory evaluation with an explanation for each selection. Different outputs alone are not a quality metric. Review actual modal/timer copy and then record representative brew feedback separately from software verification.

Initial repair scope is hot Kalita plus necessary shared contracts. Other brewers require an audit before assuming that their source registries guarantee source fidelity. No application code, saved recipes, deployments, or user inventory were changed by this audit.
