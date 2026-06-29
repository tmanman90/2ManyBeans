---
title: "fix: Eliminate redundant Ruphus web research and add research loading UX"
type: fix
status: active
date: 2026-05-02
origin: docs/brainstorms/2026-04-12-ruphus-bean-enrichment-requirements.md
deepened: 2026-05-02
---

# fix: Eliminate redundant Ruphus web research and add research loading UX

## Overview

Every Professor Ruphus click fires a full Gemini web search (30-60s), even on beans that were already researched during scan. This happens because four fields the story generator needs (`roasterLocation`, `roasterDescription`, `roasterFounded`, `redditNotes`) are never persisted to the bean doc. They get researched, used once for the pre-scan story, then discarded. Ruphus has to re-research to get them back.

Fix: persist those four fields across all enrichment surfaces (scan, Ruphus, AI Fill) so Ruphus can skip research on already-enriched beans. Unify the field whitelists so `buildNewBeanData` and the merge loops all use the same source of truth. Add a clear loading message when research IS needed, since the current "preparing your lesson..." gives no indication that a 60-second web search is happening.

---

## Problem Frame

Two user-facing issues:

1. **Redundant latency**: Clicking Ruphus on any bean (even one scanned 5 minutes ago) takes 30-60s because it re-runs `researchBeanOnline()` to recover four roaster context fields that were thrown away after the scan.

2. **Silent hang**: When Ruphus does need to research (pre-existing beans, manual adds), the loading screen shows "Professor Ruphus is preparing your lesson..." with no indication that a lengthy web search is in progress. Users think the app is frozen.

One structural issue discovered during deepening:

3. **Dual field whitelists**: `buildNewBeanData` in `src/lib/beanBuilder.js` maintains its own hardcoded `enriched` array separate from `ENRICHABLE_FIELDS`. Adding fields to `ENRICHABLE_FIELDS` alone would not persist them on the ScanSheet save path, because `buildNewBeanData` silently drops any field not in its own list.

---

## Requirements Trace

- R1. Beans that already have stored roaster context must skip web research entirely when Ruphus is clicked. Story generation should use stored roaster context fields from the bean doc.
- R2. The four roaster context fields (`roasterLocation`, `roasterDescription`, `roasterFounded`, `redditNotes`) must be persisted to the bean doc during enrichment, alongside the existing 11 enrichable fields.
- R3. When Ruphus needs to do research (no `enrichedAt`), the loading UI must clearly communicate that research is happening and may take up to a minute.
- R4. When Ruphus loads from cached data (story + enrichedAt exist), behavior is unchanged: instant display.
- R5. The refresh button must force fresh web research regardless of `enrichedAt`, so "refresh" always means "get new data."
- R6. All enrichment surfaces (ScanSheet, Ruphus, AI Fill) must set `enrichedAt` on successful research and persist roaster context fields, so the first Ruphus click after any enrichment path is instant.
- R7. Pre-existing beans (enriched before this fix, have `enrichedAt` but no stored roaster fields) must still get research on their next Ruphus click to populate the missing fields. The skip-research gate must check for stored roaster context, not just `enrichedAt`.

---

## Scope Boundaries

- Not changing `researchBeanOnline()` itself or the Gemini prompt
- Not changing what Ruphus stories contain or how they render
- Not adding new research capabilities; just persisting data that already gets fetched
- Not making roaster context fields user-editable or visible in BeanCard/EditBeanModal UI (they are internal AI context for story generation only)

---

## Context & Research

### Relevant Code and Patterns

- `src/lib/beanFields.js` -- `ENRICHABLE_FIELDS` array (11 fields), `isBagNotesEmpty()`. Single source of truth for what gets persisted during enrichment merge loops.
- `src/lib/beanBuilder.js:30-31` -- `buildNewBeanData()` has its own hardcoded `enriched` array: `['altitude', 'region', 'farm', 'roastLevel', 'cupScore', 'brewingRec', 'sourcedBy', 'shelfLife', 'roastedIn']`. This is a second source of truth that diverges from `ENRICHABLE_FIELDS` (notably includes `shelfLife` which ENRICHABLE_FIELDS does not, and lacks `variety`, `process`, `producer` which are handled as top-level fields). Adding fields to `ENRICHABLE_FIELDS` without also updating this list means ScanSheet silently drops the new fields at save time.
- `src/hooks/useProfessorRuphus.js` -- `runEnrichment()` always calls `researchBeanOnline()` (line 23), even when `bean.enrichedAt` is set. The comment on line 14 explains: "Always runs web research to get roaster context for the story."
- `src/lib/professorRuphus.js:61` -- `generateRuphusStory()` uses `enrichment.roasterLocation`, `enrichment.roasterDescription`, `enrichment.roasterFounded`, `enrichment.redditNotes` in the EXTERNAL RESEARCH DATA block passed to GPT-5.4 Mini.
- `src/components/ScanSheet.jsx:146-167` -- Scan flow calls `researchBeanOnline()`, merges only `ENRICHABLE_FIELDS`, passes raw research to `generateRuphusStory()`, then saves via `buildNewBeanData()`. Never sets `enrichedAt`.
- `src/components/EditBeanModal.jsx:195-219` -- AI Fill calls `researchBeanOnline()`, merges `ENRICHABLE_FIELDS` into form state, fire-and-forgets `generateRuphusStory()` without passing `enrichment`. Never sets `enrichedAt`.
- `src/components/ProfessorRuphusSlideUp.jsx:117-124` -- Loading state shows "Professor Ruphus is preparing your lesson..." with a spinner. No distinction between cached load vs. active research.

### Data Flow (Current)

```
Scan flow:
  researchBeanOnline() -> returns 15 fields
    -> 11 ENRICHABLE_FIELDS merged into scanData
    -> buildNewBeanData() drops fields not in its own hardcoded list
    -> roasterLocation, roasterDescription, roasterFounded, redditNotes -> used once for story -> discarded
    -> enrichedAt NEVER set

Ruphus click (enrichedAt exists):
  researchBeanOnline() -> SAME 15 fields re-fetched (30-60s wasted)
    -> enriched fields skipped (already set)
    -> 4 roaster fields passed to story gen -> discarded again

Ruphus click (no enrichedAt):
  researchBeanOnline() -> 15 fields fetched
    -> 11 ENRICHABLE_FIELDS saved to bean + enrichedAt set
    -> 4 roaster fields passed to story gen -> discarded

AI Fill (EditBeanModal):
  researchBeanOnline() -> 15 fields fetched
    -> ENRICHABLE_FIELDS merged into form state
    -> generateRuphusStory() called WITHOUT enrichment context
    -> enrichedAt NEVER set
```

### Data Flow (After Fix)

```
Scan flow:
  researchBeanOnline() -> returns 15 fields
    -> ALL 15 fields (including roaster context) merged + saved via buildNewBeanData
    -> enrichedAt set on the bean doc

Ruphus click (enrichedAt + roaster fields exist):
  NO web research -> build enrichment from stored bean fields -> story gen (5-10s)

Ruphus click (enrichedAt exists but NO roaster fields, i.e. pre-existing bean):
  researchBeanOnline() -> 15 fields saved (including roaster context) -> story gen

Ruphus click (no enrichedAt):
  researchBeanOnline() -> 15 fields saved -> enrichedAt set -> story gen

Refresh (any bean):
  ALWAYS researchBeanOnline() -> fresh data -> story gen

AI Fill (EditBeanModal):
  researchBeanOnline() -> ALL fields merged into form state
  -> generateRuphusStory() called WITH enrichment context
  -> enrichedAt set on save
```

---

## Key Technical Decisions

- **Unify field lists**: Have `buildNewBeanData` import and iterate `ENRICHABLE_FIELDS` instead of maintaining its own hardcoded `enriched` array. This prevents the current class of bug (adding a field to one list but not the other) from recurring. `shelfLife` (in beanBuilder's list but not ENRICHABLE_FIELDS) is already handled as a top-level field by `buildNewBeanData`, so it doesn't need to be in the enriched loop.
- **Store `redditNotes` as-is on the bean doc**: The raw text is capped at ~500 chars by the story generator's `sanitizeField()`. Storing it raw preserves the option to re-summarize or use it for other features later. Both raw (`redditNotes`) and summarized (`bagNotes`) versions may coexist on a bean; this is intentional, not redundant, as they serve different purposes.
- **Skip-research gate checks roaster fields, not just `enrichedAt`**: Checking only `enrichedAt` would cause a regression for pre-existing beans that were enriched before this fix (they have `enrichedAt` but no stored roaster fields). The gate should check that at least one roaster context field is populated.
- **Refresh always forces fresh research**: The refresh button bypasses the skip-research gate entirely and always calls `researchBeanOnline()`. This ensures "refresh" means "get new data," and also serves as a self-healing mechanism for beans with stale or missing roaster context.
- **Two-tier loading message**: "Researching" when web search is needed, "Preparing" for story-gen-only loads. Simple prop-driven distinction.

---

## Implementation Units

- U1. **Expand ENRICHABLE_FIELDS and unify with beanBuilder**

**Goal:** Add the four roaster context fields to the shared constant and eliminate the duplicate field list in `buildNewBeanData`, so all enrichment surfaces persist roaster context automatically.

**Requirements:** R2, R6

**Dependencies:** None

**Files:**
- Modify: `src/lib/beanFields.js`
- Modify: `src/lib/beanBuilder.js`

**Approach:**
- Add `roasterLocation`, `roasterDescription`, `roasterFounded`, `redditNotes` to the `ENRICHABLE_FIELDS` array in `beanFields.js`
- In `beanBuilder.js`, replace the hardcoded `enriched` array (line 30-31) with an import of `ENRICHABLE_FIELDS` from `beanFields.js`. The existing `shelfLife` is already handled as a top-level field (line 6, `parseShelfLifeDays`), so removing it from the enriched loop is safe.
- All consumers of `ENRICHABLE_FIELDS` (ScanSheet, useProfessorRuphus, EditBeanModal, QuickRecipeFlow) automatically pick up the new fields with zero changes

**Patterns to follow:**
- Existing `ENRICHABLE_FIELDS` usage in `ScanSheet.jsx:150` and `useProfessorRuphus.js:29`

**Test scenarios:**
- Happy path: After scanning a bean, Firestore doc includes `roasterLocation`, `roasterDescription`, `roasterFounded`, `redditNotes` fields (when research found them)
- Edge case: Research returns empty strings for roaster fields -> fields are not written (existing `if (!merged[field] && research[field])` guard handles this)
- Edge case: `buildNewBeanData` called with no enrichment data -> roaster fields simply absent from doc (same as today for other optional enriched fields)

**Verification:**
- Inspect Firestore doc for a newly scanned bean: roaster context fields present when research found them
- `buildNewBeanData` no longer has its own hardcoded enriched array

---

- U4. **Set enrichedAt on ScanSheet and AI Fill paths**

**Goal:** Mark beans as enriched at creation time (ScanSheet) and after AI Fill (EditBeanModal), so the first Ruphus click after either path skips research.

**Requirements:** R6

**Dependencies:** U1

**Files:**
- Modify: `src/components/ScanSheet.jsx`
- Modify: `src/components/EditBeanModal.jsx`

**Approach:**
- **ScanSheet**: After the research merge loop succeeds (line 148, `researchResult` is non-null), add `enrichedAt: new Date().toISOString()` to `enrichedData` before passing to `buildNewBeanData()`. This flows through to the saved bean doc.
- **EditBeanModal AI Fill**: After the merge loop (line 208), add `enrichedAt` to the merged form state. Also pass `enrichment: research` to the `generateRuphusStory()` call (line 209) so the background story includes roaster context. On save, `enrichedAt` will be included in the changes written to Firestore.
- Both paths already have try/catch around the research call. `enrichedAt` is only set on success, matching the existing Ruphus enrichment behavior.

**Patterns to follow:**
- Existing `enrichedAt` write in `useProfessorRuphus.js:41`

**Test scenarios:**
- Happy path: Scan a bean -> bean doc has `enrichedAt` set -> clicking Ruphus shows story instantly (no research)
- Happy path: AI Fill on a manual bean -> bean doc has `enrichedAt` after save -> clicking Ruphus shows story instantly
- Error path: Research fails during scan -> `enrichedAt` NOT set -> Ruphus click will research as fallback
- Error path: Research fails during AI Fill -> `enrichedAt` NOT set -> same fallback

**Verification:**
- Newly scanned bean has `enrichedAt` in Firestore
- AI-Filled bean has `enrichedAt` in Firestore after save
- First Ruphus click on either bean type completes in under 15s

---

- U2. **Skip web research when bean has stored roaster context**

**Goal:** When a bean has stored roaster context fields, construct the enrichment context from stored fields and skip the expensive `researchBeanOnline()` call entirely. Refresh always forces fresh research.

**Requirements:** R1, R5, R7

**Dependencies:** U1, U4

**Files:**
- Modify: `src/hooks/useProfessorRuphus.js`

**Approach:**
- In `runEnrichment()`, add a gate that checks for stored roaster context: if `bean.enrichedAt` AND at least one of `bean.roasterLocation`, `bean.roasterDescription`, `bean.roasterFounded`, `bean.redditNotes` is truthy, skip `researchBeanOnline()` and return a synthetic enrichment object built from the bean's stored fields.
- If `bean.enrichedAt` is set but ALL four roaster fields are empty (pre-existing bean enriched before this fix), fall through to `researchBeanOnline()` as today. This re-enriches the bean with the now-persisted roaster fields, self-healing on first use.
- For `handleRefresh`: ensure it bypasses the skip-research gate entirely. The simplest approach is to pass a `forceResearch` flag through `enrichAndGenerate` down to `runEnrichment`, or have `handleRefresh` clear the `enrichedAt` gate locally before calling `enrichAndGenerate`.
- The synthetic enrichment object shape: `{ roasterLocation: bean.roasterLocation, roasterDescription: bean.roasterDescription, roasterFounded: bean.roasterFounded, redditNotes: bean.redditNotes }`

**Patterns to follow:**
- Existing `enrichedAt` gate at line 25 of `useProfessorRuphus.js`

**Test scenarios:**
- Happy path: Bean with `enrichedAt` and `roasterLocation` populated clicks Ruphus -> no `researchBeanOnline()` call, story generates using stored fields, completes in ~5-10s
- Happy path: Bean WITHOUT `enrichedAt` clicks Ruphus -> `researchBeanOnline()` fires, fields saved, story generates
- Edge case: Bean with `enrichedAt` but all four roaster fields empty (pre-existing bean) -> `researchBeanOnline()` fires to populate them, fields saved, story generates. Next Ruphus click is instant.
- Edge case: Bean with `enrichedAt` and only `redditNotes` populated (partial context) -> skips research, passes partial enrichment to story gen, story generates with whatever context is available
- Happy path: Refresh button on any bean (enriched or not) -> ALWAYS calls `researchBeanOnline()`, gets fresh data, regenerates story
- Edge case: Double-tap Ruphus button -> `inflightEnrichmentIds` guard prevents concurrent calls (existing behavior preserved)

**Verification:**
- Clicking Ruphus on a previously-scanned bean completes in under 15 seconds
- Network inspector shows zero Gemini calls on Ruphus click for beans with stored roaster context
- Refresh button always fires a Gemini call regardless of enrichment state
- Pre-existing beans without roaster fields self-heal on first Ruphus click

---

- U3. **Add research-aware loading message**

**Goal:** When Ruphus is doing web research, show a message that communicates the expected wait time so users don't think the app is frozen.

**Requirements:** R3, R4

**Dependencies:** U2 (needs to know whether research is happening)

**Files:**
- Modify: `src/hooks/useProfessorRuphus.js`
- Modify: `src/components/ProfessorRuphusSlideUp.jsx`

**Approach:**
- Add a `researching` boolean state to `useProfessorRuphus` that is true only when `researchBeanOnline()` is actively running (set true before the call, false after resolve/reject). Expose it in `ruphusProps`.
- In `ProfessorRuphusSlideUp`, when `loading && researching`, show: "Professor Ruphus is researching your coffee... this may take up to a minute." When `loading && !researching`, keep the existing "Professor Ruphus is preparing your lesson..." message.
- Keep the same layout, spinner, and Ruphus avatar. Only the text copy changes.

**Patterns to follow:**
- Existing loading state pattern in `ProfessorRuphusSlideUp.jsx:117-124`
- Existing state management pattern in `useProfessorRuphus.js`

**Test scenarios:**
- Happy path: Bean without `enrichedAt` clicks Ruphus -> loading screen shows "researching your coffee... may take up to a minute" while web search runs, then transitions to story display
- Happy path: Bean with stored roaster context clicks Ruphus -> loading screen briefly shows "preparing your lesson..." (5-10s story gen), then shows story. User never sees the "researching" message.
- Happy path: Cached bean (story + enrichedAt + roaster fields) -> no loading screen at all, instant story display (existing behavior preserved)
- Happy path: Refresh button on enriched bean -> shows "researching" message since refresh forces fresh research

**Verification:**
- On a non-enriched bean, the slide-up clearly communicates that research is happening and sets expectations for timing
- On an enriched bean, the loading message is the short "preparing" variant or not shown at all
- No layout shift or visual regression in the loading state

---

## System-Wide Impact

- **Interaction graph:** Core changes are in `useProfessorRuphus`, `ProfessorRuphusSlideUp`, `beanFields.js`, and `beanBuilder.js`. ScanSheet and EditBeanModal get small additions (enrichedAt). All five `ENRICHABLE_FIELDS` consumers (ScanSheet, useProfessorRuphus, EditBeanModal, QuickRecipeFlow, beanBuilder) automatically gain the four new fields.
- **QuickRecipeFlow:** Merges the new fields into a local object that is never persisted (ephemeral brew flow). Harmless dead data, no breakage.
- **BeanCard display:** BeanCard uses explicit per-field conditionals, not `ENRICHABLE_FIELDS`. The four new fields will be stored but NOT displayed in BeanCard. This is correct: they are internal AI context for story generation, not user-facing data.
- **EditBeanModal display:** The form initializes and saves fields via hardcoded lists, not `ENRICHABLE_FIELDS`. The roaster fields will not appear in the edit form and are not user-editable. AI Fill will populate them in component state, but they flow through to Firestore only because `enrichedAt` and the enriched fields are written on save.
- **Bean doc size:** Four new optional string fields per bean. `redditNotes` can be up to ~500 chars raw. Well within Firestore's 1MB doc limit and 100-field cap (~25-30 fields currently).
- **Firestore rules:** Bean subcollection uses a field count cap (`size() <= 100`), no field name whitelist. No rule changes needed.
- **Data coexistence:** Beans may have both `redditNotes` (raw Reddit text for story generation) and `bagNotes` (summarized tasting phrase for card display). These serve different purposes and are not redundant.
- **Story quality:** Unchanged. The same data reaches `generateRuphusStory()`, just sourced from stored fields instead of fresh research. Refresh always gets fresh data.
- **Unchanged invariants:** `researchBeanOnline()` is not modified. `generateRuphusStory()` is not modified. The Ruphus slide-up layout and sections are unchanged. Enrichment metering behavior is unchanged.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Pre-existing beans (enriched before this fix) have `enrichedAt` but no stored roaster fields | Skip-research gate checks for stored roaster context, not just `enrichedAt`. These beans fall through to research on next Ruphus click, which populates the fields. Self-healing on first use. |
| `buildNewBeanData`'s `shelfLife` was in the old hardcoded list but not in `ENRICHABLE_FIELDS` | `shelfLife` is already handled as a top-level field in `buildNewBeanData` (via `parseShelfLifeDays`). Removing it from the enriched loop does not drop it. Verify during implementation. |
| `redditNotes` could be stale for long-held beans | Refresh always forces fresh research. Reddit notes are supplementary context, not authoritative data. |
| EditBeanModal `handleSave` has its own field whitelist | The `enrichedAt` field and roaster context fields need to be included in the save path. Verify that `handleSave` writes them through to Firestore (it may need a small addition to its changes object). |
| Concurrent `enrichedAt` writes from multiple surfaces | Not a real risk in practice: enrichment surfaces are mutually exclusive (user is either scanning, AI-filling, or clicking Ruphus, never two at once). Firestore field-level merge is last-write-wins regardless. |

---

## Sources & References

- **Origin document:** [docs/brainstorms/2026-04-12-ruphus-bean-enrichment-requirements.md](../brainstorms/2026-04-12-ruphus-bean-enrichment-requirements.md)
- **Original implementation plan:** [docs/plans/2026-04-12-007-feat-ruphus-triggered-bean-enrichment-plan.md](2026-04-12-007-feat-ruphus-triggered-bean-enrichment-plan.md)
- Related code: `src/lib/beanFields.js`, `src/lib/beanBuilder.js`, `src/hooks/useProfessorRuphus.js`, `src/lib/professorRuphus.js`, `src/components/ProfessorRuphusSlideUp.jsx`, `src/components/ScanSheet.jsx`, `src/components/EditBeanModal.jsx`
