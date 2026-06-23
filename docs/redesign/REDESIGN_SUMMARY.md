# Coffee Hub Visual Redesign — Summary

Branch: `redesign` (based on `codex/feat-pamphlet-source-insights`, v1.1.229).
Scope: complete visual reskin. **Zero** changes to features, data model, Firebase, `api/*`, RevenueCat, auth, or any logic (verified by diff audit).

## What changed (64 files, ~7.2k lines, all visual)
- **Design system** (`theme.js`, `global.css`): "Modern Coffee Editorial" — deeper warm paper, near-white elevated cards, near-black espresso text, richer caramel; added glass / type-scale / motion / elevation token groups (all existing token keys kept for backward-compat). Fraunces added as the display serif; Caveat script demoted to wordmark + rare accents.
- **Motion** (`lib/motion.js` + framer-motion): spring presses, staggered list entrances, fluid nav indicator, Modal spring presentation, page-level transitions via per-tab remount stagger. Honors `prefers-reduced-motion`.
- **Shaders** (`components/visual/`): WebGL `SteamGradient` hero (Rotation header + Sign-in), `GrainOverlay` film grain. Both with reduced-motion / context-loss / DPR / offscreen-pause safeguards.
- **App shell** (`App.jsx`): frosted glass tab bar + sticky header, fluid spring active indicator, steam hero replacing the stock illustration.
- **Shared components**: BeanCard, Badge, StarRating, SpiderChart, Btn, BrewButton, Modal, Toast, DoseStepperCard, Wordmark, etc. — elevated, tactile, Fraunces names, pill chips.
- **All 5 tabs**: editorial titles (no script), refined cards/segmented controls/search, premium chat bubbles + glass input, magazine Archive.
- **All modals/sheets**: glass sheets, premium forms, BrewTimer hero ring, premium PaywallSheet, Settings grouped cards.
- **Onboarding** (shell + R01–R13b): premium speech bubbles, selectable option cards, gorgeous flavor-swipe cards (drag logic untouched), Fraunces headlines.

## Verification
- `npm run build` (web) ✓, `npm run build:ios` (native) ✓, `npm run lint` ✓.
- Headless Chrome screenshots at iPhone resolution (390×844 @3x) of all 5 tabs, sign-in, settings, onboarding flow — no console/page errors.
- Diff audit: no API/Firebase/data-hook/context/logic files touched.
- iOS WebKit: added `-webkit-backdrop-filter` to all inline glass styles.
- Codex adversarial review pass.

## On-device note
Full iOS simulator capture was not run because the app's Capgo autoUpdate overrides
local simulator builds with the production bundle on launch (documented blocker).
Recommended final check: `/ship-dev` to push the redesign to the Capgo **dev** channel
(reaches only Tal's device) and review on real hardware before `/ship` to production.

## Rollback
`main` and production are untouched. Baseline WIP preserved in `git stash` on
`codex/fix-onboarding-scan-skip`. To ship: merge `redesign` when approved.
