---
date: 2026-08-01
topic: bean-brew-timing-memory
---

# Bean-Specific Brew Timing Memory

## Summary

Add a quiet memory for timer-based hand brews that records how long each bean actually took. The next recipe can show one relevant prior result and, once comparable history exists, make its expected finish time more personal without turning the recipe into an analytics dashboard.

---

## Problem Frame

The hand-brew timer currently guides the user toward a generated finish time, but it does not provide an intentional way to finish early or remember the actual elapsed time. That makes a successful 3:00 brew look like it missed a 4:00 target, and it forces the user to remember timing manually.

Timing is coffee-specific. Different beans can drain differently, and a 15g Wave 155 brew should not be treated as equivalent to a 20g brew or generalized into a single “your Kalitas usually take…” statistic.

---

## Actors

- A1. Brewer: follows the hand-brew timer, finishes the brew, and uses the remembered result on a later brew.
- A2. Recipe and timer experience: records the intentional finish and presents bean-specific timing context.

---

## Key Flows

- F1. Finish and remember a hand brew
  - **Trigger:** A hand-brew timer is running or paused and the brewer finishes before the generated guide end, or the timer reaches its guide end.
  - **Actors:** A1, A2
  - **Steps:** The brewer taps Finish Brew, the timer stops, the app shows the actual elapsed time, and the result is saved to the current bean. Automatic guide completion records the same kind of result.
  - **Outcome:** The bean has a timing record tied to the brew configuration; closing an unfinished timer does not create a completed-brew record.
  - **Covered by:** R1, R2, R5

- F2. Use timing context on the next recipe
  - **Trigger:** A recipe is opened for a bean with at least one prior hand-brew timing record.
  - **Actors:** A1, A2
  - **Steps:** The recipe identifies the most relevant prior record by bean, brewer, size, and dose; shows a compact prior-brew hint; and keeps the generated guide visible for the current configuration. If comparable repeated history exists, the hint may include a personal expected range.
  - **Outcome:** The brewer gets useful memory without a global statistic or an unexplained recipe rewrite.
  - **Covered by:** R3, R4, R5

---

## Requirements

**Timing capture**

- R1. A timer-based hand brew must offer an explicit Finish Brew action while running or paused so the brewer can intentionally record an early finish.
- R2. A completed timing record must retain the bean identity, hand-brew device, Kalita size when applicable, coffee dose, actual elapsed brew time, generated guide finish, and whether completion was intentional or automatic.
- R3. Closing or abandoning a running/paused timer must not save a completed timing record.

**Contextual memory**

- R4. When a bean has timing history, the recipe view must show at most one compact, relevant prior-brew summary by default, including the prior actual time and its dose/size context.
- R5. Timing history must be scoped to the same bean and narrowed by brewer/device, Kalita size, and dose; the product must not present a global Kalita average.
- R6. When there is not an exact dose match, the UI must label the prior dose clearly and keep the current recipe’s generated guide as the primary expectation rather than pretending the prior time is directly comparable.
- R7. After enough comparable records exist for the same bean/configuration, the product may show a personal expected range derived from that history, but timing alone must not silently change grind, temperature, ratio, or technique.

**Progressive disclosure**

- R8. The primary recipe flow must remain lightweight: detailed history is secondary and not shown as a dashboard in the main recipe steps.
- R9. The design must leave room for a later bean-detail history view and tasting linkage without requiring that work for the initial timing-memory release.

---

## Acceptance Examples

- AE1. **Covers R1, R2, R3.** Given a Bombe Bensa Wave 155 brew at 15g, when the brewer taps Finish Brew at 3:02, the completion screen shows 3:02 and one timing record is saved to Bombe Bensa; if the brewer closes the timer instead, no completed record is saved.
- AE2. **Covers R4, R5, R6.** Given Bombe Bensa has a prior Wave 155 / 15g result of 3:02 and the current recipe is Wave 155 / 20g, the recipe shows “last brew: 3:02 at 15g” and keeps the current 20g guide finish as the expectation.
- AE3. **Covers R7.** Given a bean has multiple completed Wave 155 / 15g records clustered around a different duration than the generated guide, the recipe may show a bean-specific expected range, but it does not rewrite the grind, temperature, ratio, or technique solely from timing.
- AE4. **Covers R5, R8.** Given two different beans have different timing histories, opening one bean never displays the other bean’s brew times and the main recipe remains a compact flow.

---

## Success Criteria

- The brewer can intentionally finish early and later see the actual time for that specific bean and configuration.
- The next recipe makes the 15g-versus-20g context visible without implying that timing generalizes across coffees.
- The main brew flow remains as calm and scannable as it is today; history adds context rather than clutter.
- The implementation preserves current recipe parameters and timer behavior unless a later, separately validated tasting-feedback feature changes them.

---

## Scope Boundaries

- No global “your Kalitas usually take…” metric.
- No automatic Aiden timing capture; the app does not observe when an Aiden machine actually brews.
- No full analytics dashboard in the primary recipe flow.
- No automatic grind, temperature, ratio, or technique changes from timing alone.
- No tasting-history linkage is required for the initial timing-memory release; it remains a follow-up capability.

---

## Key Decisions

- **Use explicit completion as the user-owned event:** a close/abandon action is not evidence that a brew finished, while Finish Brew is.
- **Scope by bean first, then configuration:** the coffee’s behavior is more meaningful than a global brewer average; size and dose prevent false comparisons.
- **Progressive disclosure:** show one useful prior result in the recipe and reserve detailed history for a later secondary surface.
- **Keep timing advisory:** actual elapsed time can personalize expectations, but it cannot silently alter a recipe’s extraction controls.

---

## Dependencies / Assumptions

- The existing timer owns elapsed-time state for hand-brew recipes and can expose an intentional completion event.
- Existing per-bean persistence and offline synchronization can carry a small bounded timing history without creating a new top-level workflow.
- The initial release can use deterministic matching of bean, device, size, and dose; any richer prediction model is deferred until real brew data exists.

---

## Outstanding Questions

### Deferred to Planning

- [Affects R2][Technical] Which existing per-bean persistence surface best supports a small bounded history while preserving offline/native refresh behavior?
- [Affects R4, R7][Technical] What minimum comparable sample count and range calculation should qualify as “enough history” for a personal expected range?
- [Affects R1, R2][Needs research] How should manual Finish Brew and automatic guide completion share one idempotent save path?
