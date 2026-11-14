---
title: "fix: Personalize named recipes through the existing brew flow"
type: fix
status: completed
date: 2026-09-19
---

# Personalize named recipes through the existing brew flow

## Summary

Use named recipes as technique templates, reuse existing bean/grinder adjustment logic, and present them through the ordinary recipe screen, timer, finish and tasting journey. Do not introduce a second recipe engine or parallel consumer experience.

This is a bounded follow-up to `docs/plans/2026-09-19-ruphus-finish-existing-work-plan.md`. Fable researched the code through authenticated Claude Max CLI and drafted the approach; the parent condensed it and flagged the grind-baseline decision below. No implementation or execution proof is claimed.

---

## Requirements

- R1. Preserve the named technique: pour pattern/proportions, timing anchors, ratio, agitation, valve order, units and finish guidance. Adjusting grind must not silently replace the method.
- R2. Apply existing bean adjustment and grinder quantization logic, including valid Ode whole/.2/.6 settings. Identical inputs may legitimately produce identical settings; do not manufacture personalization.
- R3. Use the existing recipe screen and full brew/finish/tasting/return flow, including normal dose adjustment and save actions. No separate source timer UI.
- R4. Keep original source information and explain adaptations without claiming an estimated grind is dialed in or source-author verified.
- R5. Card, preview, immutable attempt, saved recipe and timer agree on the reviewed settings and water targets.
- R6. Preserve login/data, ownership, stale-state checks, source integrity and existing ordinary/Aiden behavior.

---

## Research and decisions

Fable found:

- `HandBrewModal` mounts `SourceProjectionPreview` and `ManualSourceBrewTimer` separately from the ordinary flow. This explains the user's parity complaint.
- `manualSourceGrindGuidance` in `src/lib/manualSourceProjection.js` translates source microns plus grinder preferences; it does not receive bean evidence.
- `src/lib/extractionIntent.js` already produces bean-driven grind deltas from density, guidance and process. The adapters quantize grinder settings. This is not learned tasting-history personalization.
- `src/lib/v60Adapter.js` already combines technique-specific grind baselines with bounded bean deltas. `src/lib/kalitaAdapter.js` combines its own baseline with fines/solubility and grind adjustments. Parent independently inspected these functions.
- Fable reports the server's ordinary generation path currently supplies empty intent, unlike `src/hooks/useHandBrew.js`. Trace and reuse the actual evidence normalization/buildExtractionIntent path; never claim bean adaptation from empty intent.
- Source projection hash validation in `api/ruphus-preview.js` means personalized fields belong on the recipe envelope, not in the immutable original source projection. Preserve the allowlisted selected grinder during reconstruction.
- Source timing persistence requires valid completion semantics and an event ledger; starting the timer alone does not prove that finishing saves successfully.
- Existing sources include elapsed, event-relative, condition and manual triggers. These cannot all be flattened to guessed timestamps.

Local precedent is sufficient; no new external research is proposed. Relevant learning: `docs/solutions/logic-errors/grind-size-display-toggle-unwired.md` calls for reusing the normal grind display and preference toggle.

### Grind decision confirmed by review

**Fable proposed fully replacing source grind with the ordinary brewer engine's output. Parent review rejects treating that as settled:** a generic Kalita baseline can contradict a technique designed around a finer or coarser grind. The user's requirement is still *their recipe*, tailored to the bean.

Preserve a technique-appropriate baseline and reuse existing bounded bean adjustments and physical grinder conversion around it, following the existing named-V60 pattern. Do not introduce a new adjustment formula or promise a particular numeric result such as 6 instead of 4.6. A source micron measurement remains approximate across grinders. Where no trustworthy baseline exists, use a clearly labeled existing method estimate or qualitative guidance, not invented calibration. Fable's second review agrees this follows Tal's explicit instruction and needs no repeated product question. Apply existing deltas in micron coordinates before physical-step quantization, as the current adapters do; never treat Ode display decimals as evenly spaced dial steps.

**Source baseline inventory:** In `src/data/manualSources/kalita.js`, Onyx Monarch and Onyx Sidra supply numeric references (600 and 750 microns), usable only as approximate technique baselines. Art of Brew supplies K-Plus clicks; Kurasu iced supplies an Ode setting with unspecified generation: neither is an exact Ode Gen 2 calibration. Kurasu/Vibrant/Foundation/Yamatoya/Espresso Parts/Little Waves/Ozone supply qualitative descriptions; Fuglen and Drop omit grind. In `v60.js`, named Hoffmann/Kasuya/Rao families have existing app technique baselines; Kurasu classic EK and Bean Rock native settings require compatibility checking, not direct cross-grinder substitution. Other V60 sources are qualitative. Switch records are qualitative or unspecified. Reuse an existing compatible technique baseline where available; otherwise label the existing method estimate and retain the source descriptor. If that estimate contradicts the descriptor, retain qualitative guidance pending a justified mapping rather than guessing a new number. Admission/readiness remains independent of this inventory.

Do not blend generic and source grind numerically without an existing justified rule. Evidence-to-intent plumbing and supported baseline mapping are planning prerequisites, not something to hide behind neutral-copy fallback at completion.

### Other boundaries

- Source temperature remains the default; preserve existing explicit supported temperature edits. No new automatic temperature policy.
- No new history-learning, catalog, calibration, chatbot router, migration or release project.
- Preserve original source hash, dose bounds, g/mL distinctions and explicit confirmations for persistence.
- Old source components may remain unmounted initially; deleting dead code is not required for product parity.
- Planning authorizes no deployment, phone/simulator interaction or account writes. Dirty Dev shipping files and diagnostic ledgers are outside scope.

---

## Implementation units

- U1. **Reuse bean adjustment and produce a consistent recipe envelope**

**Requirements:** R1, R2, R4, R5. **Dependencies:** none.

**Files:** `src/lib/extractionIntent.js`, `src/lib/v60Adapter.js`, `src/lib/kalitaAdapter.js`, `src/lib/ruphus/techniqueOptions.js`, `src/lib/ruphus/recipePreview.js`, `src/lib/manualSourceProjection.js`, `api/_lib/ruphusTools.js`, `api/ruphus-preview.js`. Extract a small shared adapter only if needed; do not fork the adjustment algorithm. Tests: `scripts/ruphus-source-journey.test.mjs`, `scripts/ruphus-source-backend.test.mjs`, `scripts/ruphus-recipe-preview.test.mjs`; add focused adapter coverage if no existing test owns it.

**Approach:** First correct the source server path's empty intent by threading trusted bean evidence through the existing normalization/intent builder, with a focused test proving non-default evidence reaches recipe preparation. Carry the selected grinder through preview reconstruction. Reuse existing intent/delta logic with the chosen technique baseline. Store personalized grind and its basis outside the source projection. Preserve reviewed grind on dose edits; explicit grinder changes re-resolve safely. Handle legacy proposals without mutating stored immutable snapshots during rendering. Existing one-click follow-ups must honor R2's physical-step requirement.

**Scenarios:** Same technique with evidence producing distinct existing intent deltas reflects those deltas after quantization; identical/low-information evidence need not differ. Unknown grinder never receives a fake Ode dial label. A technique intended coarse is not silently reset to generic Kalita. One-click finer uses a valid physical step and survives dose edit, save and reload. Server and client agree; source hash stays unchanged. Sparse evidence yields an honestly labeled starting point, not a bean-specific claim.

**Verification:** Trace each visible grind to existing adjustment logic plus declared baseline and actual evidence. Characterize current source hashes/targets before changes.

- U2. **Present source recipes in the ordinary recipe screen**

**Requirements:** R1, R3–R5. **Dependencies:** U1.

**Files:** `src/components/HandBrewModal.jsx`, existing source projection/view helpers, `src/lib/brewTimerSteps.js`. Tests: `scripts/ruphus-source-timer-ui.test.mjs`, `scripts/verify-ruphus-source-timer-ui.mjs`, `scripts/brew-timer-recipe.test.mjs`.

**Approach:** Adapt source data into the shared display path; reuse normal grind display, prep, timeline, dose controls, temperature, attribution and Start/Save controls. Preserve source-specific bounds and native units. Do not let ordinary regeneration replace the source technique. Keep source metadata, not a second consumer layout.

**Scenarios:** Onyx 23g retains six starts at 0/30/45/65/90/120 seconds and rounded cumulative targets 46/147/202/258/313/368g; changing dose keeps final target equal to total. Switch mL quantities and bloom g remain correctly labeled. Existing non-source screens stay visually/functionally unchanged. Legacy source cards reopen; stale previews disable actions with normal recovery copy.

**Verification:** Compare source and ordinary recipes side by side in the rendered shared screen, not merely component-name tests.

- U3. **Run every supported source through the shared timer and complete the journey**

**Requirements:** R1, R3, R5, R6. **Dependencies:** U2. No partial release between U2 and U3.

**Files:** `src/components/BrewTimer.jsx`, `src/hooks/useBrewTimer.js`, `src/lib/brewTimerSteps.js`, `src/components/HandBrewModal.jsx`; inspect `src/lib/brewTimingMemory.js` and existing attempt/tasting callbacks. Tests: `scripts/brew-timer-lifecycle.test.mjs`, `scripts/brew-timer-recovery.test.mjs`, `scripts/ruphus-source-timer.test.mjs`, `scripts/handbrew-timing-memory-integration.test.mjs`, existing rendered journey harness.

**Approach:** Use the existing timer shell and lifecycle. Add only event-relative/confirmed advancement and open-ended finish semantics needed by admitted sources. Reuse source event semantics behind the shared UI where possible. Never guess pour durations, merge away meaningful valve events, or infer drained conditions from elapsed time. Preserve event anchors and elapsed clocks through pause/relaunch. Unmount the separate preview/timer path only after supported records are covered.

**Scenarios:** Onyx completes through normal finish, successful timing save, tasting and return to intact chat card. Save/reopen/Undo preserve the reviewed recipe and prior content. Switch valve order and units survive. Event-relative waits begin at the actual confirmation; a condition step holds until confirmation. Pause/relaunch in a hold and a non-first-water clock retain anchors. Open-ended finish saves without invented target. Legacy in-progress source attempts resume safely or expose deliberate recovery, never silently restart. Existing ordinary timer behavior remains unchanged.

**Verification:** Every currently startable admitted source remains supported in the shared flow. An unexpected unsupported record is an engineering gap, not permission to downgrade it to read-only and call completion. If timer changes prove broader than expected, report the concrete conflict before expanding scope.

---

## Acceptance and risk controls

Use a small purposeful matrix: one elapsed Kalita end-to-end journey, one event/valve Switch or V60 journey, one ordinary recipe parity check, plus cheap contract coverage across admitted source records. Verify dose, settings, timer stages, actual timing persistence, tasting, chat return, Save/reopen/Undo and relaunch. Native acceptance uses the existing signed-in Dev simulator when separately authorized; preserve login and undo test recipe mutations. Do not run another broad paid consumer campaign.

The shared timer is the highest-risk change. Characterize ordinary behavior first; activate new semantics only for explicit source event requirements. Preserve accepted source hashes and selected settings across server reconstruction and old cards. A new snapshot may be needed for legacy adaptation; never silently overwrite its action authority.

## Review status

Plan ready for user review; implementation has not started. Fable supplied the source investigation and three-unit architecture. Parent coherence/feasibility/product review identified two necessary corrections: do not replace technique intent with generic grind, and do not count loss of currently startable source recipes as acceptable completion. Fable's second bounded review accepted both and requested explicit micron-before-quantization semantics, baseline inventory and a server-intent test; these were incorporated. This is planning evidence only, not tests, native execution or product approval.

Background: `docs/qa/2026-09-19-ruphus-reconciliation.md`, `docs/qa/2026-09-19-ruphus-final-candidate.md`. This plan supersedes source-only grind presentation and separate timer UX, not their integrity and persistence safeguards.
