---
title: "fix: Source-faithful recipes for every manual brewer"
type: fix
status: active
date: 2026-09-07
---

# Source-faithful recipes for every manual brewer

## Summary

Replace unsupported recipe composites with a curated collection of complete original recipes and documented adaptations. Preserve per-stage instructions, source timing conventions, brewer configuration, and the evidence used to choose a method for a bean. Repair the entire generation-to-timer path for non-Aiden recipes, using independently verified source recipes as acceptance fixtures.

This plan follows Tal's September 7 request to audit all recipes except Aiden, prioritize respected original authors including Japanese brewers, and make bean-specific curation trustworthy. It incorporates the four `docs/research/2026-09-07-*-source-audit.md` / `*-evidence-audit.md` research artifacts and the initial `docs/data/2026-09-07-kalita-hot-source-fidelity-audit.md`. The audit does not establish sensory superiority; implementation and release remain separate work.

## Problem

The app can cite a professional recipe while changing its bloom, pour geometry, temperature, ratio or clock semantics. Hot Kalita uses a synthetic template; other paths include generated recipes, source-derived composites, and generic iced transformations. The previous verification emphasized deterministic output, legal numeric ranges and variation between beans. Those checks do not establish source fidelity or explain why a recipe suits a coffee.

## Scope and requirements

- R1. Cover classic V60 (current app: 02), Switch (current app: 03), Kalita 155, Kalita 185, Chemex, AeroPress and French Press. Cover every currently exposed hot/iced route. Switch iced remains explicitly unsupported until separately curated; it must never fall through to classic V60 iced.
- R2. Every newly promoted recipe has an original author, canonical source, retrieval date/version, precise equipment, original quantities and stages, applicability evidence, and explicit unknowns. Japanese original sources receive deliberate discovery coverage; reputation and geography do not replace verification.
- R3. At the original configuration, executable output reproduces every specified source parameter and stage. Any altered field is an adaptation with a reason and evidence, never silently labeled original.
- R4. Represent geometry and agitation per stage. Distinguish stationary center, small centered circles, outward spiral, wetting, stirring and brewer swirling; summary text cannot override the stages.
- R5. Preserve absolute source checkpoints, pour durations, rests after completion, condition-triggered steps, and source timer start events. Track physical first-water contact separately when the author's clock starts later. Do not invent missing durations to fit the current timer.
- R6. Separate water through grounds, dilution/bypass water, brew ice, serving ice and measured beverage yield. Validate peak vessel occupancy rather than equating total throughput with vessel capacity.
- R7. Select methods using compatible hardware/dose/mode, exact bean guidance, accepted brew history, author-declared suitability and explicit cup goals. Weak process/roast/decaf/freshness priors remain distinguishable from observations and verified facts. Similar beans may receive the same recipe.
- R8. Preserve original recipes and accepted user revisions. Generated cache invalidation, dose adaptations, clock changes and source revisions must carry versioned lineage. Never backfill or rewrite historical brews silently.
- R9. Inventory, Quick Recipe, recipe modal, timer and executable chat adjustments must share the same validated recipe projection. Display author/source and adaptation status in understandable terms.
- R10. Validate source fidelity, bean selection, physical feasibility, runtime/presentation behavior and sensory results as separate evidence layers. No source-count or output-diversity metric substitutes for these gates.

### Boundaries and assumptions

No Aiden recipes, prompts, grinder output, generation, push behavior or existing saved Aiden data may change. Shared modules are allowed only with regression protection proving Aiden output is unchanged; use a non-Aiden wrapper when isolation is cleaner. Existing dirty Ruphus work must be preserved and integrated only at its actual supported contract, not repaired incidentally.

The implementation targets existing app-supported equipment first. V60 01/03, Switch 02, AeroPress XL and new brewers (espresso, Clever, moka, siphon) are not silently added because sources use them. Such sources remain research-only until compatible equipment and execution are supported. Chemex size and AeroPress model must become explicit when required by the selected recipe; do not assume all physical variants share capacity.

Product defaults inferred for this plan: present one recommended starting recipe with its source and a compact explanation; make genuinely applicable alternatives discoverable without forcing a catalog decision before brewing. No new required preference questionnaire. In-app source attribution is part of the repair; a public marketplace or globally exhaustive library is not.

## Key decisions

1. **Original first, adaptation second.** Keep the canonical record immutable by source revision. A generated recipe links to its original plus a field-level adaptation record. A bibliography entry cannot satisfy this contract.
2. **Extend existing registries and adapters.** Reuse V60/iced registry and generation patterns after correcting their deficiencies. Add small missing method adapters; avoid a generic recipe language or a universal scoring framework.
3. **Separate validity from convention.** Equipment constraints and finite/mass-consistent data are hard checks. Popular temperature/ratio bands are not hard limits capable of overwriting a verified source recipe.
4. **Preserve conditional recipes.** Event-based stages are legitimate executable behavior. For an unspecified detail, use a manual instruction or a clearly declared adaptation; do not fabricate seconds or grams-per-second.
5. **Selection is explainable, not falsely precise.** No numeric confidence score derived from author prestige. Each decision records the relevant evidence and alternatives ruled out. Origin/flavor keywords cannot dictate technique alone. Feedback adjustments require compatible recipe lineage.
6. **Fallback is a curated starting recipe.** For methods migrated under this plan, failed interpretation falls back to a compatible canonical baseline with a truthful explanation. Failed source validation never silently returns to free-form generated recipes. Unsupported configurations remain viewable but cannot masquerade as validated timer recipes.
7. **Sources may evolve.** Retrieval date and a minimal factual source snapshot/checksum identify what was implemented. Retain brief evidence excerpts and factual transcriptions, not whole articles/video assets. Reverification is required when a cited source changes; it does not automatically mutate saved recipes.

## Implementation units

- U1. **Establish canonical source records and evidence fixtures**

  **Requirements:** R1–R3, R10. **Dependencies:** none.

  **Files:** existing `src/data/*SourceRegistry.js`; new `src/data/kalitaSourceRegistry.js`, `src/data/chemexSourceRegistry.js`, `src/data/aeropressSourceRegistry.js`, `src/data/frenchPressSourceRegistry.js`; corresponding `docs/data/*-source-registry.md`; new `scripts/fixtures/manual-brew-source-cases.json`, `scripts/manual-brew-source-fidelity.test.mjs`.

  **Approach:** Promote only verified compatible source methods from the audit. Record original dose/ratio/water/temp/grind description, stage water, stage geometry/agitation, source clock, flow/level triggers, post-brew steps, specified versus unknown detail. Quarantine attribution conflicts and incomplete video transcriptions. Retain a coverage table for each configuration and mode, including unresolved gaps rather than filling them with inventions. Each promoted record needs an eligibility row with source equipment/dose, app equipment/dose, compatibility evidence, and transfer status: exact configuration, author-supported transfer, or app-tested adaptation. An unspecified model is not a wildcard, and capacity alone does not prove equivalent extraction.

  Preserve native grinder model, burr and setting exactly where specified. Store qualitative grind separately from any estimated micron target or cross-grinder starting setting. Unknown calibration and unknown grinder generation remain unknown; changing either is never source-original fidelity.

  Admission rule: harmless omissions stay neutral (unspecified geometry becomes “Pour to 100g”); clear observable conditions need no invented duration. Conflicting quantities, unresolved equipment fit or an ambiguous required sequence block executable promotion until resolved. Original-source records may remain available as research without becoming recommended recipes. If an editorial choice resolves a gap, it requires adaptation status and the corresponding verification.

  **Tests:** Kurasu Kalita 14g/200g/92°C and 0:00/0:40/1:10; original Kasuya pour amounts; original Japanese AeroPress recipe below the old 80°C clamp; contradictory author/URL; missing bloom geometry must stay unknown; a source for 155 does not silently authorize 185.

  **Verification:** Canonical fixtures independently reviewed against originals, including any video-only stages. Record reviewer, directly inspected source/version, text location or video timestamp, and unresolved disagreement. The reviewer must inspect the original rather than using this audit's transcription as the oracle. Each selected record has complete required execution semantics or explicitly remains non-executable. Follow existing versioned registry tests, but assert source facts rather than current implementation strings. Mutating bloom geometry or a timing anchor must fail those fixtures. Exercise eligibility at actual app defaults and supported dose boundaries as well as original doses.

- U2. **Preserve stage, water and clock semantics through the timer**

  **Requirements:** R3–R6, R8–R9. **Dependencies:** U1.

  **Files:** `src/lib/brewTimerSteps.js`, `src/hooks/useBrewTimer.js`, `src/components/BrewTimer.jsx`, `src/components/HandBrewModal.jsx`, `src/lib/brewTimingMemory.js`, `src/hooks/useAppData.js`; new `src/lib/manualRecipeContract.js`; tests `scripts/manual-recipe-contract.test.mjs`, `scripts/manual-recipe-timing.test.mjs`, existing timer tests.

  **Approach:** Introduce only the stage distinctions needed by curated sources: absolute checkpoint, elapsed duration after an event, and condition/manual continuation. A pour completion or water-level observation anchors its subsequent rest. Keep the app's physical elapsed brew duration independent of an author's later timer origin. Source finish ranges are guides; manual finish remains authoritative. Multiple simultaneous actions such as valve open and pour at the same time belong in a single stage, not artificial five-second offsets.

  | Contract concern | Required behavior |
  | --- | --- |
  | Recipe version dispatch | Preserve the existing v1 reader. Route new manual recipes explicitly to v2. Only absent versions use documented legacy inference; unknown future versions remain viewable with timer disabled. |
  | Absolute checkpoint | Measured against the source's named clock origin, which can differ from first water contact. |
  | Rest after action | Anchored to an explicit, idempotent user confirmation of the named action completing. Navigation does not confirm a pour. |
  | Condition stage | Wait for the named observation and explicit continuation; do not insert a fictitious duration. |
  | Back/forward/background | Never reset established event anchors or fabricate action completion. Persist actual event timestamps across backgrounding. |
  | Missed source checkpoint | Preserve original guidance; do not automatically catch up, skip pours, or silently retime. Show that the checkpoint passed, require deliberate continuation, and store the actual deviation separately. |
  | Timing persistence | New versioned timing records allow `targetMs: null`. Actual duration is extraction elapsed; retain source-clock origin and recipe/source/adaptation/clock identity separately. Existing fixed-target records retain their interpretation. |

  Timer interaction: show the current action and one actionable countdown prominently. Use “Pour finished” to start a post-pour rest, “Ready” for the specified drainage observation, and “Finish brew” when no fixed end is prescribed. Physical elapsed time is secondary. A mistaken confirmation can be undone before the next physical action; record the correction rather than hiding it or automatically skipping a stage. A late confirmation starts the full required rest and follows the missed-checkpoint policy above. Keep source/adaptation explanations before brewing or on demand; active instructions contain resolved actions.

  **Tests:** a 12-second pour followed by 30-second rest advances at 42 seconds; Kurasu's absolute 0:40 is unchanged by a ten-second bloom pour; water-level step does not auto-advance; pause/background/late completion cannot shorten rests; no fixed total source time is required for condition-based execution and its actual timing can still be saved; post-brew dilution is excluded from extraction duration; invalid mass or stage occupancy fails. Cover a condition finishing after one and multiple later absolute checkpoints, repeated confirmation, back/forward navigation, unknown contract version, and saving through `useAppData`.

  **Verification:** Modal and timer show consistent instructions and source clocks; VoiceOver announces condition/confirmation clearly; legacy records remain readable and ambiguous legacy timing stays explicitly unsupported rather than rewritten. Aiden regressions are unchanged.

- U3. **Repair bean evidence and method selection**

  **Requirements:** R2–R3, R7–R8. **Dependencies:** U1.

  **Files:** `src/lib/recipeEvidence.js`, `src/lib/extractionIntent.js`, `src/lib/sourceInsights.js`, source-specific selector functions; a non-Aiden wrapper around shared bean interpretation if needed; tests `scripts/manual-brew-selection.test.mjs`, `scripts/extraction-intent.test.mjs`, `scripts/recipe-evidence.test.mjs`.

  **Approach:** Preserve claim-level provenance and stage scope. Stop averaging temperature sequences or alternate recipes. Retain unknown roast age/decaf/process facts; do not infer measurements from altitude. Filter hard compatibility first, then exact guidance/accepted history, author suitability, explicit cup goal, and conservative supported priors. Resolve contradictory evidence without changing facts. Keep explanations tied to the exact decision, including a shared baseline when appropriate.

  Grinder translation is a separate non-Aiden estimate, with its calibration basis and uncertainty. Source grind wording remains visible; an estimated native setting must not silently replace medium-fine with medium-coarse or acquire source attribution. Test unspecified Ode generation versus verified Gen2 and qualitative grind versus invented microns.

  **Tests:** same roast and evidence may select same recipe; “no stall” never triggers high-fines; gentle final pour never suppresses bloom agitation; washed country change alone does not reroute; decaf without observed clogging stays uncertain; exact low-temperature source remains unmodified; source/model conflict preserves authoritative source; source description containing two recipes remains two alternatives.

  **Verification:** Each fixture's selection has a defensible source/app-inference trail. Aiden's shared research contract is unchanged. Follow current evidence hashing and explicit conflict patterns, without inheriting coarse confidence or keyword-routing defects.

- U4. **Replace hot Kalita composites and repair both iced configurations**

  **Requirements:** R1–R8. **Dependencies:** U1–U3.

  **Files:** `src/lib/kalitaAdapter.js`, `src/lib/kalitaIcedAdapter.js`, `src/data/kalitaConfiguration.js`, associated source registries; tests `scripts/kalita-adapter.test.mjs`, `scripts/kalita-iced-adapter.test.mjs`, `scripts/kalita-source-reproduction.test.mjs`.

  **Approach:** Distinct 155/185 eligibility. Implement verified whole hot methods including Kurasu stage transition and appropriate larger-dose sources. Correct iced rest/clock semantics and avoid interpreting omitted swirl as forbidden swirl. Dose scaling requires source support or explicit tested adaptation.

  **Tests:** source-mode exact Kurasu fixture passes through emitted recipe and timer; stationary final pour does not infect bloom; 155 and 185 source coverage remains separate; Yamatoya rest timing starts after its specified event; chilling alternatives preserve separate ice handling; unsupported dose never silently converts to an ungrounded recipe.

  **Verification:** Each migrated branch has source-reproduction proof, valid physical quantities, and a displayed author/adaptation status. Existing hot and iced failures remain independently recoverable.

- U5. **Repair V60 and Switch independently**

  **Requirements:** R1–R8. **Dependencies:** U1–U3.

  **Files:** `src/lib/v60Adapter.js`, `src/lib/v60IcedAdapter.js`, `src/lib/v60SwitchAdapter.js`, corresponding source/configuration registries; existing V60/Switch tests plus `scripts/v60-source-reproduction.test.mjs`, `scripts/switch-source-reproduction.test.mjs`.

  **Approach:** Remove global technique overlays that contradict canonical stages. Keep stage temperatures and valve transitions faithful. Retain exact-source branches only if every represented original field is faithful. Differentiate maximum retained water with valve closed from total recipe throughput. Classic V60 and Switch caches, sources and iced availability stay distinct.

  **Tests:** Hoffmann filter-contact guidance agrees across callout and steps; no deletion of Heart stirring without adaptation lineage; Kasuya water schedule matches its source; light-roast iced source is not described as author-recommended for dark beans without evidence; Switch source clock/valve events match; high-throughput hybrid never fails merely because total water exceeds vessel volume, while excessive closed-valve occupancy fails; Switch iced remains unavailable.

  **Verification:** All hot V60, iced V60 and Switch fixtures pass original reproduction and counterexample selection separately. Shared changes do not alter approved Kalita outputs.

- U6. **Migrate Chemex, AeroPress and French Press from generated templates**

  **Requirements:** R1–R8. **Dependencies:** U1–U3.

  **Files:** new `src/lib/chemexAdapter.js`, `src/lib/aeropressAdapter.js`, `src/lib/frenchPressAdapter.js` and method generation helpers; `src/lib/handbrew.js`, `src/lib/flashBrewTransform.js`; new `scripts/chemex-source-reproduction.test.mjs`, `scripts/aeropress-source-reproduction.test.mjs`, `scripts/french-press-source-reproduction.test.mjs`.

  **Approach:** Dedicated source-based hot and iced methods, using the minimal shared contract. Upright/inverted/bypass AeroPress are separate methods with equipment/manufacturer context. No generic 60/40 transformation inherited as an original recipe. Preserve French Press settle/press semantics. Complete missing primary-source work and compatibility validation for every currently exposed iced mode before its migration. An unresolved gap holds that family's cutover; this plan does not authorize removing existing modes to obtain a passing coverage report.

  **Tests:** canonical Japanese AeroPress low temp survives; original brew-water versus dilution math; no duplicated pressing in iced output; manufacturer's current inverted guidance is represented; Chemex filter/model and bloom copied faithfully; French Press crust break, settling and actual plunge behavior preserved; no false Hoffmann attribution for a generic Chemex recipe.

  **Verification:** All currently exposed methods have verified curated support before full implementation is declared complete. Existing unsupported Switch iced remains unsupported. Any later proposal to retire a currently exposed mode requires a separate product decision. Method-level behavior is not silently substituted under a familiar title.

- U7. **Integrate source attribution, alternatives and recipe lifecycle**

  **Requirements:** R8–R9. **Dependencies:** U2–U6.

  **Files:** `src/hooks/useHandBrew.js`, `src/lib/handBrewCachePolicy.js`, `src/lib/recipeScaling.js`, `src/lib/brewTimingMemory.js`, `src/components/HandBrewModal.jsx`, `src/components/QuickRecipeFlow.jsx`, `src/tabs/InventoryTab.jsx`, `src/tabs/ChatTab.jsx`; actual executable chat projection contract once current parallel work is integrated; tests `scripts/manual-brew-entrypoint-parity.test.mjs`, `scripts/manual-brew-lineage.test.mjs`, existing cache/timing tests.

  **Approach:** Source author/method link and compact adaptation note replace claims based on engine labels. Offer applicable alternatives without requiring an up-front decision. Switching recipe/mode/dose/size shows the new selection and preserves saved history. Bump configuration/source/clock versions; regenerated candidates replace disposable caches only. Chat may propose documented adaptations but cannot retain an original label on changed instructions. Preserve request cancellation/latest-write protections.

  Introduce a bounded non-Aiden storage contract instead of treating all existing `handBrewRecipes.<device>` records as disposable. Use `manualRecipeCandidates.<configurationKey>` for generated candidates and immutable `manualRecipeRevisions.<revisionId>` for protected snapshots, with `manualRecipeSelections.<configurationKey>` pointing to the explicitly accepted revision. Each has `recordVersion`, `recipeRevisionId`, `sourceRevisionId`, `adaptationRevisionId` where applicable, and `acceptanceState`. Confirm backend write limits before choosing snapshot size; do not duplicate whole source documents per bean.

  | Record class | Write rule |
  | --- | --- |
  | Disposable generated candidate | Generation/regeneration writes only the candidate slot; never changes an accepted selection. |
  | Explicitly accepted revision | User acceptance creates an immutable snapshot and updates the selection pointer. A subsequent edit creates a new revision. |
  | Unclassified existing recipe | Treat as protected; retain original fields until explicit replacement. Before replacement, preserve a versioned legacy snapshot with unresolved provenance rather than guessing acceptance or rewriting history. |

  Quick Recipe, Inventory and the actual supported chat writer must use the same rules. Existing Aiden slots remain untouched. Display source grind and estimated user-grinder starting setting as different facts; no technical registry/version labels are required in the brewing flow.

  When compatibility requires missing equipment detail, show an inline model/size selector and persist the user's choice. If no compatible recipe exists, keep the bean and requested dose, explain the mismatch, and offer concrete supported dose/method choices. Never change dose or hardware silently. Keep the existing recipe readable; disable validated timer launch until a compatible choice is made.

  **Tests:** Quick Recipe and Inventory produce identical source/stages for equal inputs; timer callouts agree with stage data; stale cache cannot keep prior prohibition; accepted saved recipe survives curation update; proposed chat change marks adaptation and conserves quantities; wrong device/filter source rejected; source link works on web/iOS; pending regeneration disables stale timer launch.

  **Verification:** Source attribution and all changed stage interactions receive iOS visual/accessibility acceptance, with Astra owning design review. Rebase/integrate against the real Ruphus contract; do not guess absent files or modify unrelated in-progress endpoints.

- U8. **Evaluate curation and prepare staged Dev acceptance**

  **Requirements:** R1–R10. **Dependencies:** U4–U7.

  **Files:** new `scripts/manual-brew-evaluate-inventory.mjs`, `scripts/manual-brew-evaluate-inventory.test.mjs`, `docs/data/manual-brew-curation-evaluation.md`, `docs/data/manual-brew-dev-acceptance.md`.

  **Approach:** Run an explicitly read-only inventory evaluation after implementation; no live generation may save recipes during evaluation. Report coverage by bean profile, hardware, mode and source family, decisions and unsupported cases. Include synthetic controls where inventory lacks dark/light/decaf/processed/fresh/unknown/conflicting examples. Use expected selections and justified adaptations, not a unique-recipe count. Stage Dev by completed method family; do not mark incomplete families done because one method is ready.

  **Tests:** zero beans/read failures are unknown rather than pass; no private identifiers in shareable report; each exposed configuration has a case; misattributed source fails despite valid numeric output; missing sensory observations remain untested.

  **Verification:** Focused source/contract tests, full recipe integration suite, lint/build and iOS modal/timer behavior establish code readiness. A Dev build may be prepared for physical testing with its untested status explicit. Before validated curation promotion, perform physical execution/capacity checks for each materially different supported hardware/stage pattern and each promoted dose-transfer boundary lacking author support. Record the finite case matrix before testing; human brewing is a named external dependency, not a test an agent can claim to have performed. Sensory comparison is separate and required for claims of improved cups, not for factual source attribution. Dev shipping and production shipping use their respective release workflows and explicit scope; neither is implied by this audit document.

## Curation acceptance and sequencing

First source/contract tranche: canonical hot Kurasu Kalita 155 with correct early agitation, second-pour checkpoint and center finish, plus a source suitable for 185. Then V60/Switch repairs, followed by legacy methods and iced parity. Source research and U3 can proceed alongside U2; individual method implementation depends on the common contracts it actually uses.

Promotion gates: (1) original source verified, (2) original configuration faithfully reproduced, (3) each adaptation justified and marked, (4) hardware compatibility and physical execution/capacity checks from U8 pass, (5) selection counterexamples pass, (6) modal/timer agree, (7) Dev behavior accepted. Sensory records are a separate gate for claims of improved cups. Code-ready, physically validated and sensory-tested are distinct statuses. The audit is complete when all exposed paths have a verdict and source gaps; the implementation is complete only after all currently exposed paths pass their relevant gates, with pending physical work reported explicitly.

## Risks and alternatives

- Merely adding links preserves today's defect. Rejected.
- Replacing everything with Kurasu would erase legitimate method and equipment differences. Rejected.
- A universal ranking system trained on inferred tasting notes risks fabricating precision. Start with explicit compatibility/applicability rules and feedback.
- Capacity, grind equivalence and source clock ambiguities require their own evidence, not generic clamps.
- Some source pages/videos are inaccessible or internally inconsistent. Keep those methods provisional; continue targeted verification or use an accessible alternative. Do not label secondary transcriptions primary.
- Scope is broad; shared contract fixes come before independent method migrations, with Aiden protected and unrelated dirty work preserved.

## Deferred

Automatic continuous source monitoring, additional brewer models, public community publishing, global competitor ranking, and training a learned selector. None is required to repair source fidelity. New cross-method tasting infrastructure is deferred if the existing recipe lineage suffices.
