---
date: 2026-04-21
topic: bug-fixes-spring-cleanup
---

# Bug Fixes: Spring Cleanup

## Problem Frame
Four user-facing bugs affecting daily use of 2ManyBeans. These range from missing data options to broken async flows and uninformed AI output. Each is independently scoped and can be fixed without cross-dependencies.

## Requirements

### B1. Expand process types to top 15

**Current state:** 9 process types + Other. Missing "Anaerobic Washed" and several common specialty processes.

**Updated process list (15 + Other):**
1. Washed
2. Natural
3. Honey
4. Black Honey
5. White Honey
6. Anaerobic Washed
7. Anaerobic Natural
8. Anaerobic Honey
9. Anaerobic White Honey
10. Advanced Natural
11. Carbonic Maceration
12. Lactic Fermentation
13. Double Washed
14. Wet-Hulled
15. Infused / Co-Fermented

- B1a. Update the process dropdown in both `AddBeanForm.jsx` and `EditBeanModal.jsx`.
- B1b. No changes needed elsewhere: Aiden family classifier already handles "anaerobic" keyword routing to `processed-clarity`. Professor Ruphus and enrichment pass process as a string, not from a fixed enum.

### B2. Product shot survives save/navigate

**Current state:** If you add a photo, press "Product Shot", then save changes or leave the edit screen before generation completes, the photo is removed entirely. Forces re-adding the photo and re-generating. Wastes API calls.

**Supersedes:** Extends the Apr 9 product shot UX doc (which fixed spinner/feedback). This addresses data loss, not just UX feedback.

- B2a. The original photo (manually added) must be persisted to the bean document immediately when added, BEFORE product shot generation starts. This is the safety net: if anything fails, the user keeps their original photo.
- B2b. Product shot generation must be decoupled from the EditBeanModal lifecycle. If the user saves or navigates away, generation continues server-side and writes the result to Firestore when complete.
- B2c. "Save Changes" must never overwrite `photoUrl` with null or stale data if a product shot is in flight. The server-side write from the product shot API is the authoritative source.
- B2d. If the user is still on the edit page when the product shot completes, the product shot replaces the original photo in the UI (live update via Firestore listener or direct callback).
- B2e. If product shot generation fails, the original photo remains on the bean. No photo loss on failure.

### B3. Shelf-life override in Edit Bean

**Current state:** Peak window values (peakStart, peakEnd, degasMin) are set when the bean is added from the roaster profile and cannot be edited. If the roaster is unknown or the profile defaults are wrong, the user is stuck.

- B3a. Add a "Shelf life (days)" or "Best by" input field in EditBeanModal.
- B3b. When set, this value overrides `peakEnd` for the bean (the code already supports `shelfDays > peakEnd` logic in AddBeanForm).
- B3c. Display the updated peak timeline immediately after the value is changed.
- B3d. If the user clears the field, revert to the roaster profile default.

### B4. Enrich before story: fix Professor Ruphus roaster knowledge

**Current state:** Professor Ruphus generates stories using GPT training knowledge only (no web search). The silent enrichment (Gemini + Google Search) runs in parallel but its results never feed into the story. Result: Ruphus says "I can't reliably add more" about well-known roasters like Manhattan Coffee Roasters (Netherlands-based, easily found via Google).

**Modifies:** The Apr 12 Ruphus enrichment doc intentionally kept enrichment parallel with the story. This requirement changes the sequencing to: enrichment first, then story, so the story is informed by web research.

- B4a. When the user presses Professor Ruphus, run Gemini search-grounded enrichment FIRST.
- B4b. Feed enrichment results (roaster info, origin details, community reviews) into the GPT story generation as context.
- B4c. The GPT system prompt should be updated to USE enrichment data when available (especially roaster details like location, founding, style) rather than relying solely on training knowledge.
- B4d. Enrichment failure is non-blocking: if enrichment fails or times out, fall back to the current behavior (story from training data only). The user should never be blocked from seeing a Ruphus story.
- B4e. Expected latency increase: ~2-3 seconds. Acceptable tradeoff for dramatically better story quality.
- B4f. The existing parallel enrichment that populates bean card fields (R1-R8 from the Apr 12 doc) can be folded into this sequential flow. One enrichment call, two consumers: story generation + card field population.

## Success Criteria

- A bean with process "Anaerobic Washed" can be added and edited without using "Other"
- Product shot can be triggered, user can save and leave, photo appears on bean card when generation completes (original photo visible in the meantime)
- User can set a custom shelf life on any bean and see the peak timeline update
- Professor Ruphus can describe Manhattan Coffee Roasters as Netherlands-based (or any roaster findable via Google Search)

## Scope Boundaries

- NOT reducing Gemini product shot generation time (30-40s is model speed)
- NOT changing the product shot image generation pipeline (server-side works correctly)
- NOT adding editable peakStart/degasMin fields (shelf-life override covers the need)
- NOT changing the Ruphus story persona or output format (intro/roaster/coffee/process/lookFor/flavorProfile stays the same)
- NOT expanding the roaster profile database in this doc (that's a feature, covered in the features brainstorm)

## Key Decisions

- **Process types: curated list of 15, not free-text.** Free-text would create inconsistencies. A curated list covers 95%+ of specialty coffee; Other handles the rest.
- **Product shot: persist original photo first, then generate.** The original photo is the safety net. Product shot is an enhancement, not a replacement of the upload step.
- **Peak editing: shelf-life override, not direct peakStart/peakEnd fields.** Simpler UX, matches how roasters communicate (bag says "best within 30 days"), and the code already supports the override logic.
- **Ruphus: sequential enrichment, not parallel.** The ~2-3s latency cost is worth the dramatic improvement in story quality. Users press Ruphus expecting research, and this delivers on that expectation.
- **Ruphus: one enrichment call serves both story and card fields.** No need for two separate enrichment calls. Run once, use for both purposes.

## Dependencies / Assumptions

- The Gemini search-grounding enrichment returns roaster-level information (location, founding, style). If it currently only returns bean-level data, the enrichment prompt may need to be extended during planning.
- The product shot API (`api/product-shot.js`) already writes directly to Firestore. The fix is primarily client-side: ensuring the modal doesn't interfere with this server-side write.

## Outstanding Questions

### Resolve Before Planning
_None. All product decisions are locked._

### Deferred to Planning
- [Affects B2a][Technical] What is the exact race condition? Does "Save Changes" overwrite photoUrl, or does the modal unmount cancel the API call before it fires? Needs code trace.
- [Affects B2c][Technical] Should the client set a `productShotPending: true` flag on the bean doc so other writers know not to overwrite photoUrl?
- [Affects B3b][Technical] Should shelf-life override be stored as `shelfDays` (number) matching the existing AddBeanForm field, or as a direct `peakEnd` override?
- [Affects B4a][Needs research] What is the actual latency of the Gemini enrichment call? If it's consistently >5s, consider a timeout with fallback to parallel mode.
- [Affects B4b][Technical] What enrichment fields should be injected into the GPT story prompt? At minimum: roaster location, roaster description, sourcing details.
- [Affects B4f][Technical] Confirm the existing enrichment hook (`useProfessorRuphus.runSilentEnrichment`) can be refactored from fire-and-forget parallel to awaited sequential without breaking the Ruphus slide-up animation.

## Next Steps

-> `/ce:plan` for structured implementation planning
