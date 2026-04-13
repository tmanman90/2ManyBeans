---
title: Ruphus-Triggered Silent Bean Enrichment
type: feat
status: active
date: 2026-04-12
origin: docs/brainstorms/2026-04-12-ruphus-bean-enrichment-requirements.md
---

# Ruphus-Triggered Silent Bean Enrichment

## Overview

When the user presses Professor Ruphus on a bean that has missing card fields, silently fire the existing Gemini search-grounding enrichment (`researchBeanOnline`) in parallel with the Ruphus story generation. The card fills in while Ruphus tells its story, and when the user dismisses the slide-up the fields are already there. No new button, no new prompt, no confirmation dialog. Failure is invisible.

This is a UX bridge: the user's mental model is already "Ruphus researched this bean", so the app should behave that way. The actual enrichment reuses the exact function the Add Bean flow and AI Fill already call — we are moving that function to a new trigger, not introducing new AI capability.

## Problem Statement / Motivation

The user opened a Sealed inventory card for "Momos Coffee — Ethiopia Wessi Tima" and saw `NOTES: --` alongside several missing origin fields. After running Professor Ruphus on that bean, none of Ruphus's research flowed back onto the card. The card still showed blanks when the slide-up dismissed.

Root cause: Ruphus today (`src/lib/professorRuphus.js`) uses GPT-5.4 Mini with training knowledge only and outputs narrative prose, not structured fields. Meanwhile `researchBeanOnline()` in `src/lib/gemini.js:122` already uses Gemini 2.5 Flash + Google Search grounding to return structured fields — but it is only wired to two trigger surfaces today (`AddBeanForm.jsx` post-scan auto-trigger at line 220, and the manual "AI Fill" button at line 269). Existing beans created before enrichment reached them — or beans added before the AI Fill button existed — remain under-populated until the user manually edits them.

Pressing Ruphus is the strongest signal the user cares about a specific bean. That is the moment to enrich.

## Proposed Solution

Extend `useProfessorRuphus.js` so that `handleLearn(bean)` also fires `researchBeanOnline(bean)` in parallel with `generateRuphusStory(bean)`, gated on whether any target field is missing. Merge the enrichment result onto the bean using the same "only fill empty fields" loop that `AddBeanForm.handleAiFill` (line 270) already uses, then write the merged subset to Firestore via `updateBean()`. Fail silently. Cache success via a new `enrichedAt: ISO string` field on the bean document so subsequent Ruphus presses short-circuit the enrichment call.

Two nuances surfaced by research:

1. **`researchBeanOnline` does NOT return `bagNotes`.** It returns `redditNotes` (community reviews) and the structured origin fields. The user explicitly wanted NOTES filled. Plan: when the research response includes a non-empty `redditNotes` string AND `bagNotes` is empty, run `summarizeNotes(redditNotes)` (already in `gemini.js:235`) to produce a short comma-separated tasting phrase, and write that into `bagNotes`. This matches the "NOTES: blueberry, chocolate, stone fruit" shape the UI expects.

2. **Add Bean's pre-save Ruphus call is out of scope.** `AddBeanForm.jsx` calls `generateRuphusStory` directly at lines 238 and 279 (pre-save, before the bean has a Firestore ID). We do not hook enrichment there — that surface already has AI Fill and post-scan enrichment. Ruphus enrichment only applies to the hook-based `handleLearn` path used by BeanCard across the Rotation, Inventory, Archive, and QuickRecipeFlow surfaces.

## Technical Considerations

### Architecture impacts
- One hook touched: `src/hooks/useProfessorRuphus.js`. Extend `handleLearn` and `generateStory`. No new files required, though extracting `ENRICHABLE_FIELDS` from `AddBeanForm.jsx:41` into a shared module (e.g., `src/lib/beanFields.js`) avoids duplication and lets the hook import it cleanly.
- No schema changes to the bean document beyond adding an optional `enrichedAt: string` ISO timestamp.
- No change to `researchBeanOnline` or any proxy.

### Performance implications
- Gemini search-grounding call is already in the app's normal hot path. Adding one more invocation surface does not change per-call cost.
- Because enrichment runs in parallel (not sequential) with Ruphus, the slide-up appears at the same speed it does today. The enrichment write happens whenever it resolves — usually after the user has already started reading Ruphus.
- The R4 gate ensures fully-populated beans make exactly one call (Ruphus), not two. Beans without an `id` (can happen in the Add Bean pre-save surface, which we are NOT hooking) are ignored.
- The `enrichedAt` cache prevents repeat enrichment calls on beans the user opens Ruphus on multiple times.

### Security considerations
- `researchBeanOnline` already sanitizes its search-context fields via the JSON-output contract and prompt-injection hardening in `gemini.js`. We are not introducing new user-controlled input into any prompt.
- No new API surface exposed to the client.
- The Firestore update touches only fields that were previously empty on the same bean the user was already viewing — no cross-document writes, no permission escalation.

### Quota and metering
- `researchBeanOnline` accepts a `metered` flag. The AI Fill button passes `metered: true` because it is the user-initiated chargeable action. The post-scan auto-trigger passes `metered: false` because it is chained behind the scan action. **Ruphus-triggered enrichment should pass `metered: false`** — it is a silent background convenience, not a user-initiated research action, and surfacing a quota error on a Ruphus press would violate R7 (silent failure).

## System-Wide Impact

- **Interaction graph:** `BeanCard onLearn` (line 125) → `useProfessorRuphus.handleLearn` → two parallel promises:
  1. `generateRuphusStory(bean)` → on resolve → `updateBean(bean.id, { story })` (existing)
  2. `researchBeanOnline(bean)` → on resolve → optional `summarizeNotes(research.redditNotes)` → `updateBean(bean.id, { ...fillEmptyFields, bagNotes?, enrichedAt })` (new)

  Firestore `updateDoc` triggers the real-time listener on web (`onSnapshot` via `useAppData.js`) or the polling refetch on native (Capacitor), which re-renders BeanCard with the filled fields.

- **Error propagation:** Both promises use independent try/catches. Ruphus errors are already handled by `useProfessorRuphus` (toast on failure). Enrichment errors are swallowed silently (`console.log` only, no toast, no UI state change). If both fail, only Ruphus's error surfaces. This matches R7.

- **State lifecycle risks:** Two concurrent `updateBean` calls (one for `story`, one for enrichment fields) on the same bean doc. Firestore `updateDoc` merges field-by-field, so they do not collide. The only real risk is a user editing a target field in the edit sheet while enrichment is in-flight — covered in the race section below.

- **API surface parity:** The "enrich a bean that is already saved" pattern does not exist today. If we ever add a Settings-level "Re-scan all my beans" action or a long-press quick-enrich, both should call the same helper introduced here. Planning note: structure the enrichment logic as an exported helper (`runBeanEnrichment(bean)`) inside `useProfessorRuphus.js` or a new `src/lib/beanEnrichment.js`, so future triggers can reuse it without duplication.

- **Integration test scenarios:**
  1. Bean with no `id` (pre-save Add Bean ephemeral bean) → Ruphus opens, enrichment path short-circuits without error, story still generates.
  2. Bean with all target fields already populated → Ruphus opens, zero enrichment API call, story generates normally, no spurious Firestore write.
  3. Bean missing `bagNotes` only → Ruphus opens, enrichment runs, `redditNotes` arrives, `summarizeNotes` produces a phrase, `bagNotes` fills, all origin fields stay untouched.
  4. Enrichment throws (e.g., `searchParts.length < 2` at `gemini.js:125`) → Ruphus story still renders, no toast, console log only.
  5. User opens Ruphus, closes before enrichment resolves, reopens on same bean → `enrichedAt` now set → second open skips enrichment.
  6. User opens Ruphus on bean A, immediately switches to bean B — in-flight enrichment for A must not overwrite B (this is already handled because the `updateBean` call targets A's id by closure capture).

## Race Condition Handling

The brainstorm flagged a concurrent-edit race as a deferred question. Resolution: **before writing the merged enrichment payload to Firestore, re-read the bean from the `beans` state array by id and skip any field the user has filled in during the in-flight window.** This means:

1. Capture `bean.id` at `handleLearn` time.
2. When enrichment resolves, look up the current bean snapshot: `const current = beans.find(b => b.id === bean.id)`.
3. If `current` is missing (bean was deleted mid-flight), abort the write entirely.
4. Build the update object by iterating over the result fields and including each only if `!current[field]` at write time (not at call time).
5. Pass that filtered object to `updateBean(bean.id, updates)`.

This avoids clobbering a value the user manually typed while the Ruphus slide-up was open. It also naturally handles the case where the Ruphus story write lands between the original fetch and the enrichment resolve.

## Empty-Field Detection

Target fields and their empty checks:

| Field | Empty check | Source |
|---|---|---|
| `bagNotes` | `!bean.bagNotes \|\| bean.bagNotes === '(not logged)'` | Sentinel used in `BeanCard.jsx:32` and `gemini.js:236` |
| `altitude`, `region`, `farm`, `variety`, `producer` | `!bean[field]` | Plain falsy check matches `BeanCard.jsx:36` and `AddBeanForm.jsx:224` |

The enrichment gate (R4) fires if ANY of the target fields above is empty. If all five origin fields and `bagNotes` are populated, enrichment is skipped.

Reuse the existing `ENRICHABLE_FIELDS` constant from `AddBeanForm.jsx:41` by extracting it. That constant covers the broader set (`altitude, region, farm, roastLevel, cupScore, brewingRec, sourcedBy, variety, process, producer, roastedIn`). For THIS feature we only gate on a narrower "target subset" per R2 (`bagNotes, altitude, region, farm, variety, producer`), but the merge loop itself should still iterate `ENRICHABLE_FIELDS` so any other missing field the research happens to return also gets filled opportunistically. This matches the AI Fill behavior exactly.

## Acceptance Criteria

- [ ] **R1**: Pressing the Ruphus button on a bean with at least one missing target field from R2 fires `researchBeanOnline(bean)` in parallel with `generateRuphusStory(bean)`. Verified by console log or network inspector showing two Gemini/OpenAI calls in flight simultaneously.
- [ ] **R2**: Target fields are exactly `bagNotes`, `altitude`, `region`, `farm`, `variety`, `producer`. Gate checks these six.
- [ ] **R3**: Enrichment merge never overwrites a field that is already non-empty at write time (not just call time — see race handling).
- [ ] **R4**: If every target field is populated at call time AND `bean.enrichedAt` is set, enrichment is skipped entirely. Verified by a bean with all fields filled producing exactly ONE API call on Ruphus press.
- [ ] **R5**: Ruphus story latency is unchanged vs. current behavior. Parallel execution verified.
- [ ] **R6**: No toast, no banner, no inline Ruphus mention of enrichment. Silent UX.
- [ ] **R7**: Enrichment failure (`searchParts.length < 2`, network error, JSON parse error, Firestore write error) does not block Ruphus story display and does not show any error UI. Console logging only.
- [ ] **R8**: Successful enrichment writes `enrichedAt: <ISO string>` to the bean document. Subsequent Ruphus presses on the same bean see `enrichedAt` set and skip the enrichment call. Failed enrichment does NOT write `enrichedAt`, so the next press retries.
- [ ] **bagNotes nuance**: When `bagNotes` is empty and `researchBeanOnline` returns a non-empty `redditNotes`, call `summarizeNotes(redditNotes)` and write the result into `bagNotes`. If `summarizeNotes` returns null, leave `bagNotes` alone and do not retry it on future Ruphus presses for this bean (the `enrichedAt` cache handles this).
- [ ] **Race safety**: Re-read bean state at enrichment resolve time. Any target field the user has manually filled during the in-flight window is skipped.
- [ ] **`metered: false`**: Ruphus-triggered enrichment does NOT decrement the free-tier `aiScans` quota. Verified by free-tier user at quota cap pressing Ruphus on an under-populated bean and seeing the story render without triggering the paywall.
- [ ] **Pre-save beans ignored**: Opening Ruphus from `AddBeanForm.jsx` (pre-save, bean has no `id`) does not attempt enrichment and does not throw. Existing behavior preserved.
- [ ] **Cross-platform**: Works on web (Firestore `onSnapshot` listener) and native iOS (polling refetch). Verified by pressing Ruphus on both, dismissing, and observing the card update.
- [ ] No regressions in existing Ruphus flow: story still persists via `updateBean(id, { story })`, slide-up still opens and dismisses correctly.

## Success Metrics

- **User-visible**: On the original Momos Ethiopia Wessi Tima bean from the screenshot, pressing Ruphus once and dismissing results in a populated NOTES field and populated origin context on the card.
- **API cost**: Fully-populated beans make zero extra calls (R4 gate holds). First-time enrichment makes exactly one extra Gemini call per bean, ever.
- **Silent failure**: Zero user-facing error states introduced. Ruphus error rate unchanged.
- **No regressions**: Existing `/ios-qa` run passes on Rotation, Inventory, Archive tabs.

## Dependencies & Risks

### Dependencies
- `researchBeanOnline` in `src/lib/gemini.js:122` — confirmed stateless, safe to call with any bean-shaped object.
- `summarizeNotes` in `src/lib/gemini.js:235` — confirmed returns null on failure, already hardened for silent use.
- `updateBean` in `src/hooks/useAppData.js:213` — confirmed shallow-merges partial updates via Firestore `updateDoc` with `updatedAt: serverTimestamp()`.
- `beans` state array from `useAppData.js` must be available inside `useProfessorRuphus` for the race-safety re-read. Currently the hook receives `updateBean` as a prop — it may also need `beans`, or a getter `getBeanById(id)` exposed from `useAppData`.
- `ENRICHABLE_FIELDS` currently private to `AddBeanForm.jsx:41` — extract to `src/lib/beanFields.js` and import from both sites.

### Risks
- **Gemini rate limits / transient 5xx**: Already handled by `callGemini` retry logic. Silent failure per R7 covers the residual case.
- **`redditNotes` quality drift**: If Gemini starts returning irrelevant or very long `redditNotes`, `summarizeNotes` truncates to 40 chars. Acceptable cap.
- **StrictMode double-fire in dev**: React dev StrictMode can fire effects twice. Mitigation: the trigger is an event handler, not an effect, so this should not apply. But `handleLearn` itself can be called twice if the user double-taps the Ruphus button. Mitigation: the `enrichedAt` gate + the in-flight guard (already present in `useProfessorRuphus` for the story path) should cover repeat calls. Verify during implementation.
- **Race with user deletion**: If the user deletes a bean mid-enrichment, `updateBean` will fail silently because the doc no longer exists. Acceptable — caught by the enrichment try/catch.
- **iOS polling delay**: On native, Firestore uses polling not `onSnapshot`. The card may update a beat later than on web. This is consistent with existing Ruphus story writes and not a regression.

## Implementation Sketch (pseudo-code for planning, not final code)

### `src/lib/beanFields.js` (NEW)

```js
// Single source of truth for enrichable fields. Used by AddBeanForm and
// useProfessorRuphus.
export const ENRICHABLE_FIELDS = [
  'altitude', 'region', 'farm', 'roastLevel', 'cupScore', 'brewingRec',
  'sourcedBy', 'variety', 'process', 'producer', 'roastedIn',
];

// Subset that gates Ruphus-triggered enrichment. bagNotes handled separately
// because it uses a sentinel and comes from summarizeNotes(redditNotes).
export const RUPHUS_ENRICH_GATE_FIELDS = [
  'altitude', 'region', 'farm', 'variety', 'producer',
];

export function isBagNotesEmpty(bean) {
  return !bean.bagNotes || bean.bagNotes === '(not logged)';
}

export function beanNeedsRuphusEnrichment(bean) {
  if (bean.enrichedAt) return false;
  if (isBagNotesEmpty(bean)) return true;
  return RUPHUS_ENRICH_GATE_FIELDS.some(f => !bean[f]);
}
```

### `src/hooks/useProfessorRuphus.js` (MODIFIED)

```js
// Inside handleLearn(bean), after the existing story path kicks off:
import { researchBeanOnline, summarizeNotes } from '../lib/gemini';
import {
  ENRICHABLE_FIELDS,
  isBagNotesEmpty,
  beanNeedsRuphusEnrichment,
} from '../lib/beanFields';

async function runSilentEnrichment(bean, getCurrentBean, updateBean) {
  if (!bean.id) return;                      // pre-save Add Bean path
  if (!beanNeedsRuphusEnrichment(bean)) return;

  try {
    const research = await researchBeanOnline(bean, { metered: false });

    const current = getCurrentBean(bean.id);
    if (!current) return;                    // bean deleted mid-flight

    const updates = {};
    for (const field of ENRICHABLE_FIELDS) {
      if (!current[field] && research[field]) {
        updates[field] = research[field];
      }
    }

    if (isBagNotesEmpty(current) && research.redditNotes) {
      const summary = await summarizeNotes(research.redditNotes);
      if (summary) updates.bagNotes = summary;
    }

    updates.enrichedAt = new Date().toISOString();

    // Only write if something actually changed beyond enrichedAt.
    if (Object.keys(updates).length > 1) {
      await updateBean(bean.id, updates);
    }
  } catch (err) {
    console.log('Silent enrichment skipped:', err.message);
    // R7: swallow silently. Do NOT write enrichedAt on failure so next press retries.
  }
}

// In handleLearn:
//   runSilentEnrichment(bean, getBeanById, updateBean);  // fire-and-forget
//   generateStory(bean, true);                            // existing path
```

### `src/hooks/useAppData.js` (MODIFIED)

Expose a `getBeanById(id)` getter or thread the `beans` array into `useProfessorRuphus` via props, whichever is cleaner in the existing hook composition. Prefer a stable callback to avoid re-render churn.

### `src/components/AddBeanForm.jsx` (MODIFIED)

Replace the local `ENRICHABLE_FIELDS` constant at line 41 with an import from `src/lib/beanFields.js`. No behavioral change.

## Alternative Approaches Considered

1. **Make Ruphus itself return structured fields** — Rejected. Ruphus uses GPT-5.4 Mini training knowledge only, which is the wrong tool for facts about specific beans. Gemini search-grounding is the proven path. See origin doc Key Decisions.

2. **Add a separate "Research this bean" button on under-populated cards** — Rejected in brainstorm. Adds UI noise, splits a single user intent across two buttons, and reduces the "magic" quality the feature is designed to deliver.

3. **Auto-enrich every manually-added bean on creation** — Rejected in brainstorm. Would fire Gemini calls against beans the user may never open, inflating cost. Also harder to handle failure at creation time when the user is mid-flow.

4. **Run enrichment sequentially before Ruphus** — Rejected. Would noticeably delay the Ruphus slide-up. Ruphus story quality does not improve meaningfully from one extra enrichment pass (training knowledge covers the educational angles already).

## Sources & References

### Origin

- **Origin document:** [docs/brainstorms/2026-04-12-ruphus-bean-enrichment-requirements.md](../brainstorms/2026-04-12-ruphus-bean-enrichment-requirements.md)
  - Key decisions carried forward: piggyback on Ruphus press (not a separate button), reuse `researchBeanOnline` (not Ruphus training knowledge), only-fill-empty merge with no confirmation, parallel execution, silent on success and failure.

### Internal References

- `src/lib/gemini.js:122` — `researchBeanOnline(extractedData, { metered })` — returns `altitude, region, farm, roastLevel, cupScore, brewingRec, variety, process, sourcedBy, producer, roastedIn, redditNotes`. Does NOT return `bagNotes`.
- `src/lib/gemini.js:235` — `summarizeNotes(bagNotes)` — safe fallback to `null`, 40-char cap, handles `'(not logged)'` sentinel.
- `src/hooks/useProfessorRuphus.js:29` — `handleLearn(bean)` — single entry point for opening the slide-up. Primary file to modify.
- `src/hooks/useProfessorRuphus.js:12-20` — `generateStory` — existing pattern for writing AI output back to Firestore via `updateBean(id, { story })`.
- `src/hooks/useAppData.js:213` — `updateBean(beanId, updates)` — shallow-merge via Firestore `updateDoc`, auto-adds `updatedAt: serverTimestamp()`.
- `src/components/BeanCard.jsx:32,125,276` — BeanCard's Ruphus button, `bagNotes` sentinel check, "Full Notes" expandable row.
- `src/components/AddBeanForm.jsx:41` — `ENRICHABLE_FIELDS` — canonical list to extract.
- `src/components/AddBeanForm.jsx:256-290` — `handleAiFill` — reference implementation of the only-fill-empty merge pattern.
- `src/components/AddBeanForm.jsx:220` — post-scan auto-enrichment — reference for the `metered: false` chaining pattern.
- `docs/solutions/database-issues/firestore-settings-phase2-write-patterns.md` — One logical change = one Firestore write. Merge enrichment fields and `enrichedAt` into a single `updateBean` call.
- `docs/solutions/runtime-errors/async-side-effect-during-react-render.md` — StrictMode double-fire protection. Feature uses event handler not effect, so mostly N/A, but worth verifying.
- `docs/solutions/logic-errors/share-card-capture-retry-null-safety.md` — Treat "empty success" responses the same as failure. Informs the `if (Object.keys(updates).length > 1)` guard before writing.
- `lessons.md` (line 42) — BeanCard icon buttons stay compact. N/A to this feature (no UI change) but good to remember since we're near BeanCard.

### External References

- None. Feature is entirely internal reuse; no external library or API changes.

### Related Work

- `docs/plans/2026-04-12-005-feat-beancard-info-redesign-plan.md` — May touch BeanCard field rendering. Worth checking for overlap before implementing. This plan does not touch BeanCard itself, so the two should compose, but verify order of merge.
- `docs/plans/2026-04-12-004-feat-plain-photo-upload-for-beans-plan.md` — Adds another Add Bean surface. Shared `ENRICHABLE_FIELDS` extraction should happen before or as part of whichever plan lands first.
