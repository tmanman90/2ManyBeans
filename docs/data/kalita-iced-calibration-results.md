# Kalita iced calibration results

## Automated evidence

- Full application test suite, lint, production build, and diff hygiene: passing.
- Exact Kurasu, Espresso Parts, and Frothy Monkey source contracts: passing.
- Size/dose boundaries, melt semantics, technique copy, deterministic cutover, and ordered persistence: passing.
- Committed browser flow: Wave 155 and Wave 185 both passed at 320×568 with 200% text scaling through iced entry, every timer step, manual Finish Brew, source-correct chill instruction, Coffee chilled, and completion. Active-step copy remained inside the viewport.
- Persistence regressions cover independent hot-cache reuse, recipe-owned iced retry identity, per-bean serialization, cross-bean independence, and modal-close safety.

## Live inventory evidence

Read-only Firebase evaluation completed on 2026-08-02:

- Beans read: 39
- Recipes evaluated: 156
- Configurations: Wave 155 at 15g and 20g; Wave 185 at 20g and 33g
- Valid candidates: 156/156
- Reachable families: Kurasu ice-after, Espresso Parts direct-over-ice, Frothy Monkey large direct-over-ice
- Bean-specific safety adjustments: 0. None of the current normalized records contains the high-confidence explicit stall/fines evidence required by the v1 allowlist, so the UI correctly uses configuration-only source-backed language.
- Output was aggregate and redacted; no bean names, IDs, roasters, email, UID, or credential data was recorded.

## Physical brew evidence

Not yet performed. Production requires user acceptance of at least one Wave 155 ice-after brew and one Wave 185 direct-over-ice brew.
