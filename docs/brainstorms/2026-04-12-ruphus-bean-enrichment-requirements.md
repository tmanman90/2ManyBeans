---
date: 2026-04-12
topic: ruphus-bean-enrichment
---

# Auto-Enrich Bean Card Fields When Ruphus Runs

## Problem Frame
When a user presses Professor Ruphus on a bean with missing card fields (notes, origin context), Ruphus generates a rich educational story but none of that information flows back onto the bean card. The user dismisses Ruphus and the card still shows `NOTES: --` and blank origin fields. This is most visible on manually-added beans and beans where the original Gemini photo scan came up light. The user's mental model is "Ruphus did research on this bean, so the card should reflect what he found."

Important technical reality: Ruphus today (`src/lib/professorRuphus.js`) uses GPT-5.4 Mini with training knowledge only and outputs narrative prose, not structured fields. The actual search-grounded enrichment lives in the Add Bean flow (Gemini + search grounding). So the design reuses that existing enrichment path rather than making Ruphus itself produce structured fields.

## Requirements

- **R1.** When a user presses Ruphus on a bean with at least one missing target field (see R2), the app silently triggers the existing Gemini search-grounding enrichment in parallel with the Ruphus story call. No extra button, no extra user action.
- **R2.** Target fields for enrichment: `bagNotes` (the NOTES shown on the card), plus origin context fields `altitude`, `region`, `farm`, `variety`, `producer`.
- **R3.** Enrichment only fills fields that are currently empty on the bean. Any field with an existing value (manual edit, prior scan) is never overwritten, regardless of what enrichment returns.
- **R4.** The gate for triggering enrichment: enrichment runs only if at least one target field from R2 is empty. If every target field is already populated, enrichment is skipped and only the Ruphus story call fires.
- **R5.** Enrichment and Ruphus run in parallel, non-blocking. The user sees the Ruphus slide-up at normal speed. Card updates whenever enrichment returns, regardless of whether Ruphus has finished.
- **R6.** Enrichment runs silently. No toast, no banner, no inline message from Ruphus. When the user dismisses the Ruphus slide-up, they see the updated card as if it had always been that way.
- **R7.** Enrichment failure is silent. If the enrichment call errors, times out, or returns nothing useful, Ruphus still displays normally and no error is shown. Enrichment is a best-effort side-effect.
- **R8.** If enrichment fails, nothing is cached on the bean, so the next Ruphus press will attempt enrichment again. Successful enrichment does not need to re-run on subsequent Ruphus presses for the same bean (the R4 gate naturally handles this since target fields are now populated).

## Success Criteria
- A bean that had `NOTES: --` and blank origin fields before pressing Ruphus shows populated `NOTES` and populated origin context after dismissing Ruphus, assuming the search-grounded enrichment found anything.
- Manually-edited field values are never lost after a Ruphus press.
- Ruphus story latency is unchanged vs. today (parallel execution, not sequential).
- A fully-populated bean pressing Ruphus makes exactly one API call (Ruphus), not two.
- Enrichment failures are invisible to the user — no error UI, no broken Ruphus experience.

## Scope Boundaries
- **Not building a new enrichment pipeline.** This reuses the existing Gemini search-grounding enrichment from the Add Bean flow. No new model, no new prompt authoring. If the existing path returns bagNotes today, great. If it doesn't, that's a precondition gap worth noting in planning.
- **Not changing what Ruphus generates.** Ruphus still outputs the same story shape (intro/roaster/coffee/process/lookFor/flavorProfile). We are not teaching Ruphus to emit structured fields.
- **Not adding a standalone "Research this bean" button.** The only trigger is a Ruphus press.
- **Not running enrichment on bean creation.** Manually-added beans do not auto-enrich at creation time; they enrich the first time the user presses Ruphus on them.
- **Not adding a diff/confirm UI.** Merge is silent, empty-only, never shown to the user.
- **Not touching** `roastLevel`, `cupScore`, `sourcedBy`, `brewingRec`. These can be revisited later if needed but are out of scope for this change.
- **Not caching enrichment results separately.** The bean document itself is the cache — if target fields are filled, the R4 gate naturally skips re-running.

## Key Decisions

- **Piggyback on Ruphus press instead of a separate action or background job.** Rationale: the user's mental model is already "Ruphus is researching this bean." Adding a second button would feel redundant, and background enrichment-on-create would fire for beans the user may never look at. Piggybacking ties the compute to actual user intent.
- **Reuse the Add Bean search-grounding path, not Ruphus's training-knowledge output.** Rationale: Ruphus runs on GPT-5.4 Mini training knowledge only and cannot reliably produce structured field values without hallucinating. The Gemini search-grounding path is already proven and web-grounded.
- **Only-fill-empty merge, no confirmation.** Rationale: it matches user expectation ("magic"), preserves manual edits, and avoids an unnecessary review step for low-risk data.
- **Parallel execution.** Rationale: Ruphus today doesn't benefit from richer fields in-session anyway (its quality is already acceptable), and latency matters for the slide-up experience. Sequential would make the first press noticeably slower.
- **Silent on success and silent on failure.** Rationale: this is a quality-of-life side effect, not a core action. Any UI noise would defeat the "magic" framing.

## Dependencies / Assumptions
- The existing Gemini search-grounding enrichment path (`src/lib/gemini.js` / the Add Bean "AI Fill" flow) can be invoked programmatically against an existing bean and returns at least `bagNotes` + the origin context fields. If it does not currently return all of R2, that gap should be addressed during planning — either by extending the existing prompt or by using a complementary call (e.g., `researchBean()`).
- The Firestore bean update path already supports partial updates — writing only the newly-filled fields should be safe with the existing hooks (`useAppData`).
- Ruphus press is the only trigger for now; if users later want enrichment from another surface, this logic should be extractable into a reusable helper so it can be wired in elsewhere without duplication.

## Outstanding Questions

### Resolve Before Planning
_None. All product decisions are locked._

### Deferred to Planning
- **[Affects R2][Technical]** Does the existing Gemini search-grounding enrichment currently return `bagNotes` and all five origin context fields? If not, planning needs to decide whether to extend the existing prompt or add a small second pass.
- **[Affects R5][Technical]** Where does the enrichment trigger live — in the Ruphus component (`ProfessorRuphusSlideUp`) or in a shared helper called by whichever surface opens Ruphus? Should it be idempotent in case the user opens and closes Ruphus repeatedly in a row?
- **[Affects R3][Technical]** How are "empty" fields detected? Is it strict `!bean.field`, or does it also treat sentinel values like `'(not logged)'` and whitespace-only strings as empty? Confirm against existing bean schema conventions.
- **[Affects R8][Needs research]** Is there any risk of a race condition if enrichment completes and writes to Firestore while the user is simultaneously editing the same bean (e.g., in the edit sheet)? Planning should confirm the write pattern is last-write-wins-per-field or merge-safe.

## Next Steps
→ `/ce:plan` for structured implementation planning
