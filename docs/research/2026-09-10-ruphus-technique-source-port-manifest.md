# Ruphus technique source-port manifest

Checked 2026-09-10 against source-foundation commit `9f1b547` (`codex/manual-brew-source-foundation`). This is the bounded U2 source-contract port for Kalita, Switch and classic V60 records. It is a source-fidelity and readiness manifest, not evidence of a physical brew, sensory quality, or a live-provider/device run.

## Ported closure

| Path | Role | Provenance and boundary |
|---|---|---|
| `src/data/manualSources/kalita.js` | 12 scoped Kalita records | Ported from source-foundation `9f1b547`; includes Kurasu/Vibrant/Drop 155, Drop/Onyx/Ozone 185, existing iced records, and the explicit Ozone 155 proportional adapter. |
| `src/data/manualSources/switch.js` | 8 scoped Switch records | Ported from source-foundation `9f1b547`; includes the HARIO/Matt Winton Switch 03 hybrid, the official HARIO SSD-360 Switch 03 immersion manual, unresolved-size Kurasu leads, 02 references, and corrected HARIO/Partners revision 2. |
| `src/data/manualSources/v60.js` | 10 scoped classic V60 records | Ported from source-foundation `9f1b547`; no Switch/MUGEN records are reclassified as classic V60. |
| `src/lib/manualRecipeContract.js` | Pure structural source-record validation and immutable source freezing | Selective port from `9f1b547`; no registry, persistence, UI, or legacy recipe conversion. |
| `src/lib/manualGuidance.js` | Pure guided-timing readiness check | Selective port from `9f1b547`; observation-based intermediate steps remain unready for a timer. |
| `src/lib/manualSourceTiming.js` | Pure event-anchored source-clock semantics | Selective port from `9f1b547`; timing record version is `2`; user confirmation is not treated as a physical valve action. |
| `src/lib/manualSourceProjection.js` | Pure exact-identity projection, native typed quantities, readiness and adaptation ledger | New bounded projection; source snapshots and prose remain intact, with no recipe-engine or provider imports. |
| `scripts/fixtures/ruphus-techniques/primary-cases.json` | Independent source-fact assertions | Authored separately from the implementation registry; records source URLs, locators, boundaries and expected readiness. |
| `scripts/ruphus-technique-source-fidelity.test.mjs` | Independent contract/fidelity proof | Focused Node tests for identity, units, readiness, event clocks, source gaps, dose adaptation and prose preservation. |

The pure closure intentionally excludes `manualBrewSourceRegistry.js`, `manualSourceAdapter.js`, `kalitaSourceAdapter.js`, legacy Kalita/V60/Switch generators, React timers, persistence, authentication, deployment, and provider code. Those imports either widen the port beyond the approved families or can regenerate a generic schedule over a named source schedule.

## Inventory and readiness

The port contains 30 records: 12 Kalita, 8 Switch and 10 classic V60. Twelve records have `admission.status: "ready"`; eleven are timer-ready after the independent timed-guidance check. A source-admitted record with a condition-based intermediate step is retained as a readable reference and is not included in the timer-ready list.

| Exact configuration reviewed | Records in scoped inventory | Source-admitted | Timer-ready | Current boundary |
|---|---:|---:|---:|---|
| Kalita Wave 155, hot | 4 | 2 | 1 | Kurasu is executable; Vibrant remains observation-only at the last pour; Drop lacks a confirmed clock; Ozone 155 is an explicit proportional starting point without 155 timing. |
| Kalita Wave 185, hot | 4 | 3 | 3 | Onyx Monarch, Onyx EU La Soledad/Sidra and Ozone 185 have timed schedules; Drop remains a clock-gap reference. |
| Kalita Wave 155, iced | 2 | 2 | 2 | Kurasu is after-brew chilling; Yamatoya is a 155 server-ice route; these are not collapsed into hot recipes. |
| Kalita Wave 185, iced | 3 | 2 | 2 | Kurasu and Little Waves are timed; Espresso Parts remains research-only. |
| HARIO V60 Switch 03, hot | 8 Switch records reviewed | 2 exact 03 | 2 | HARIO/Matt Winton is the exact 03 hybrid; the official HARIO SSD-360 manual is the exact 03 immersion. Kurasu and Partners do not identify 03 hardware; 02 records do not transfer. |
| Classic V60 02, hot | 10 V60 records reviewed | 1 exact 02 | 1 | Kurasu classic 02 is executable; other V60 records remain references where size/filter/timing is incomplete or a different brewer is named. |
| Classic V60 02, iced | 10 V60 records reviewed | 1 exact 02 | 1 | BeanRock is executable; Kasuya-specific hardware and other incomplete iced records remain separate references. |

## Source facts and explicit adapters

### Kalita

- Kurasu Wave 155 retains 14g coffee, 200g brew water, 92°C, first-water clock, 30g/60g/200g cumulative checkpoints at 0:00/0:40/1:10, and a 2:05–2:15 finish range.
- Ozone Wave 185 retains 25g, 400g, 93°C, medium filter grind, 50g/160g/220g/280g/340g/400g checkpoints at 0:00/0:30/0:45/1:00/1:15/1:45, and its approximately 3:00 finish is represented as a 180-second finish target.
- Ozone’s page gives an approximately 15g/240g smaller Wave FAQ starting point but does not publish a 155 timing schedule. `ozone-wave-155-scaled-from-185-2026` therefore has no clock, is `research-only`, and records the 185-to-155 quantity choice as an explicit adapter. No 185 checkpoint is silently presented as a 155 timer anchor.
- Vibrant’s final pour remains a water-level condition. The record is admitted as source material but `manualGuidanceReadiness` blocks guided execution; no invented seconds are added.

### Switch

- The HARIO/Matt Winton source is the exact Switch 03 hybrid record used for guided execution: 24g coffee, 360mL brew target, 93°C, open bloom, valve-close/release cues, and a qualitative drawdown rather than a fabricated fixed finish timestamp.
- The HARIO product page separately establishes Switch 03 hardware identity and a 360mL practical/finished-capacity context. That figure does not turn the manual’s 440mL input into a hard 360mL raw-input ceiling or permit adding another 360mL to an occupied bowl.
- The official [HARIO SSD-360 instruction manual](https://www.hario.com/product/SSD-360.pdf) is an exact Switch 03 immersion original: 36g medium-ground coffee, approximately 440mL hot water, the Switch closed during the pour and approximately two minutes of steeping, then open to drip. Its finished-capacity figure of approximately 360mL is retained as output/context and is not used as a hard raw-input cap. Numeric temperature and final drawdown time remain unspecified.
- Kurasu’s immersion and hybrid recipes retain their source valve actions and timed steps but remain unresolved for exact Switch size; they cannot satisfy a Switch 03 request.
- HARIO/Partners is corrected to revision 2 from the primary page: 15g/240g, open 0:00 bloom and 0:40 pour, close at 1:15, open at 2:30, remove at 4:00. Size, filter model and numeric temperature remain unknown, so it is reference-only. The old 16g/256g/90-second row is not retained as active source data.

### Classic V60

The classic V60 records are imported as a separate family. The port does not infer a classic V60 schedule from Switch records, transfer a Kasuya/MUGEN hardware identity, or make an incomplete source timer-ready merely because its quantities are numeric.

## Projection contract for root integration

`projectManualSource(record, configuration)` accepts exact device/variant/size/model/filter/material/mode identity and an optional exact `dose`. It returns:

- `projectionVersion: "ruphus-manual-source-projection-v1"` and source record version;
- immutable `sourceSnapshot` (original record) and `sourceExecution` (only explicitly authorized typed quantity adaptation);
- exact `sourceId`, `sourceRevision`, `sourceLineage`, equipment and `configurationKey`;
- native typed water fields, e.g. `{ value: 360, unit: "mL" }` and `{ value: 50, unit: "g" }`, without mL↔g conversion;
- source clock, native stages, valve states, finish and source prose;
- `readiness`/`timerReady` and an adaptation ledger with source-dose basis, typed changes, timing status and disclosure.

`listManualSourceRecords(records, configuration)` returns only compatible timer-ready choices by default. `{ includeReferenceOnly: true }` includes structurally valid compatible references without making them executable. Unknown source size/model/filter/material never grants a transfer to named hardware. A changed dose requires `allowDoseAdaptation: true`; numeric water fields may be scaled in their source-native units, stage durations are cleared, source prose is kept verbatim, and timer readiness is false until an explicit caller validates timing/capacity. Ranged source doses stay ranges; a caller must use the supported `sourceDoseSelection` field before selecting an exact basis.

The root integration must route named source schedules through this projection and bypass generic `recipePreview` regeneration when it would select an old Kalita/Switch heuristic. The projection is pure and does not persist, start a timer, open a valve, or claim that any physical event occurred.

## Proof and remaining blockers

The focused proof is:

```text
node --test scripts/ruphus-technique-source-fidelity.test.mjs
8 passed, 0 failed
```

It covers independent fixture facts, exact identity, native units, readiness, explicit dose adaptation, source-prose preservation, ranged-dose handling, incompatible hardware, source-clock anchors and condition waits. ESLint passes for the ported source/contract/timing/projection modules. This is deterministic source-contract evidence only; no live provider, physical device, deployment, or sensory claim is included.

Remaining factual blockers are intentionally visible:

1. Ozone’s 155 quantity suggestion has no original 155 timing schedule; it remains a research-only adapter.
2. Kurasu immersion/hybrid and HARIO/Partners do not identify exact Switch 03 hardware; they remain reference-only.
3. The official HARIO SSD-360 immersion original is source-ready at its published 36g/approximately 440mL example. Smaller doses still require an explicit app adaptation policy; no smaller author-provided alternative is claimed.

## Primary source links

- [Kurasu Kalita Wave 2023](https://kurasu.kyoto/blogs/kurasu-journal/how-to-brew-with-kalita-wave-2023)
- [Ozone Kalita Wave guide](https://ozonecoffee.co.uk/pages/kalita-wave-brew-guide)
- [HARIO V60 Switch 03 product page](https://www.hario.co.uk/collections/hario-v60-immersion-drippers/products/hario-v60-switch-immersion-dripper-size-03)
- [HARIO SSD-360 instruction manual](https://www.hario.com/product/SSD-360.pdf)
- [HARIO/Partners V60 Switch recipe](https://www.hario-usa.com/blogs/recipes-and-more-from-friends/v60-switch-recipe-with-partners-coffee)
- [Kurasu Switch immersion and hybrid recipes](https://kurasu.kyoto/blogs/kurasu-journal/2-brewing-recipes-with-hario-immersion-dripper-switch)
