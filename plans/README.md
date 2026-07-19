# Animation Improvement Plans

Written by the `improve-animations` skill from the 2026-07-18 opportunity sweep (all seven findings passed the frequency/purpose/speed/function gate). Each plan is self-contained: an executor needs no other context. Repo feature plans live separately in `docs/plans/`.

Stamped at commit `ec777a5`. If the codebase has drifted, executors must stop and report per each plan's Boundaries section.

| # | Plan | Severity | Status |
| --- | --- | --- | --- |
| 001 | [Settings sheet presentation](001-settings-sheet-presentation.md) | HIGH | DONE (device pending) |
| 002 | [Scan-save arrival (haptic + cascade)](002-scan-save-arrival.md) | MEDIUM | TODO |
| 003 | [Success feedback wiring (haptics + toasts)](003-success-feedback-wiring.md) | MEDIUM | TODO |
| 004 | [Card press feedback](004-card-press-feedback.md) | MEDIUM | TODO |
| 005 | [Ruphus slide-up symmetric exit](005-ruphus-slideup-exit.md) | MEDIUM | TODO |
| 006 | [Quick Recipe menu pop-in](006-quick-recipe-menu-popin.md) | MEDIUM | TODO |
| 007 | [ScanSheet step transitions](007-scan-sheet-step-transitions.md) | LOW | TODO |

## Recommended execution order

1. **001** — highest leverage, isolated to one file.
2. **004**, **006**, **005** — small, independent, each one file (005 also touches global.css).
3. **007** then **002** — BOTH touch `src/components/ScanSheet.jsx`; do 007 (render tree) before 002 (save handler + other files) or execute them together to avoid line-number drift between plans.
4. **003** — five files of tiny insertions; do last so its line references drift least.

## Dependencies and conflicts

- 002 and 007 overlap in `ScanSheet.jsx` (different regions: 002 edits the save handler at :239, 007 edits the render tree :273-447). Sequential execution required; whichever runs second must re-verify its cited lines.
- 002 and 005 both append to `src/styles/global.css` (different blocks; trivial).
- No plan depends on another's outcome.

## Verification note (all plans)

Haptic changes (002, 003) and WKWebView behavior (001, 005) can only be truly verified on Tal's device via `/ship-dev`. Web `npm run dev` covers the visual feel checks. Per repo rule: CSS keyframes for entrance/visibility on portalled surfaces, framer for interaction; plans 001 and 007 deliberately follow the device-proven Modal/QuickRecipeFlow exemplars.
