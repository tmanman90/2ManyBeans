# 001 — Give SettingsPage a real sheet presentation (enter, exit, scrim)

- **Status**: TODO
- **Commit**: ec777a5
- **Severity**: HIGH
- **Category**: Missed opportunities / Purpose & frequency
- **Estimated scope**: 1 file (`src/components/SettingsPage.jsx`), ~40 lines changed

## Problem

SettingsPage is styled as a draggable bottom sheet (grabber handle, rounded top corners, `alignItems: 'flex-end'`) but it is the only sheet in the app with zero presentation motion. It pops in instantly, hard-cuts on close, and the scrim never fades. It also declares a `transition` that can never fire (no transform value ever changes), which is dead code.

```jsx
// src/components/SettingsPage.jsx:611-637 — current
if (!open) return null;

return createPortal(
  <div
    data-settings-page
    style={{
    position: 'fixed', inset: 0,
    background: glass.scrim,
    backdropFilter: glass.blur,
    WebkitBackdropFilter: glass.blur,
    zIndex: 1000,
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
  }}>
    <div
      style={{
        background: C.bgDeep,
        borderRadius: `${radius.xl}px ${radius.xl}px 0 0`,
        width: '100%',
        maxWidth: 480,
        maxHeight: '95dvh',
        boxShadow: shadows.modal,
        display: 'flex',
        flexDirection: 'column',
        transition: `transform ${motionTokens.dur.base}s ${motionTokens.cssOut}`,  // dead — nothing ever changes transform
      }}
      onClick={e => e.stopPropagation()}
    >
```

Two inner dialogs teleport the same way:

```jsx
// src/components/SettingsPage.jsx:1426-1440 — current (Delete Account dialog)
{deleteStep && (
  <div
    style={{
      position: 'fixed', inset: 0, zIndex: 1200,
      background: glass.scrim, ...
```

```jsx
// src/components/SettingsPage.jsx:1620-1628 — current (canister confirm)
{canisterConfirm && (
  <div style={{
    position: 'fixed', inset: 0, zIndex: 1100,
    background: glass.scrim, ...
```

## Target

The exact presentation `src/components/Modal.jsx:62-99` already ships (AnimatePresence in a portal, scrim opacity fade, sheet slide with `spring.soft`), applied to SettingsPage:

- Scrim: `initial {opacity: 0}` to `{opacity: 1}`, exit `{opacity: 0}`, `transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] }`.
- Sheet: `initial { y: '100%' }` to `{ y: 0 }`, exit `{ y: '100%' }`, `transition: spring.soft` (`{ type: "spring", stiffness: 260, damping: 30, mass: 0.9 }` from `src/styles/theme.js:133`).
- Inner dialogs: scrim fade as above; card uses the `popIn` variant from `src/lib/motion.js:37-42` (`opacity 0, scale 0.94` to `1 / 1`, exit `scale 0.96`, `spring.snappy`).
- The dead `transition` line at :636 removed.

## Repo conventions to follow

- Exemplar to imitate line-for-line: `src/components/Modal.jsx:62-99` (AnimatePresence wrapping `{open && ...}` inside `createPortal`, `m.div` scrim, `m.div` sheet with `spring.soft`). PaywallSheet does the same with the named `scrim`/`sheet` variants.
- Motion primitives come from `src/lib/motion.js`: `import { m, spring, scrim, sheet, popIn } from '../lib/motion';` plus `import { AnimatePresence } from 'framer-motion';`.
- Reduced motion is handled app-wide by `<MotionConfig reducedMotion="user">` in `src/main.jsx` — no extra work needed for framer variants.
- WKWebView caveat: this repo has seen framer entrance animations fail inside portals (see lessons.md), but `Modal.jsx` uses this exact AnimatePresence-in-portal pattern and is device-verified across every sheet in the app. Mirror Modal.jsx exactly; do not invent a new pattern. If on-device testing shows the sheet stuck invisible, STOP and report (the fallback is the CSS-keyframe pattern used in plan 005).

## Steps

1. In `src/components/SettingsPage.jsx`, add imports: `AnimatePresence` from `framer-motion`, and `m, spring, scrim, sheet, popIn` from `../lib/motion`.
2. Delete the early return at :611 (`if (!open) return null;`). Change the `createPortal` call to render `<AnimatePresence>{open && ( ...existing tree... )}</AnimatePresence>` into `document.body` (the portal target is unchanged).
3. Convert the outer scrim `<div>` (:614) to `<m.div {...scrim}>` keeping `data-settings-page` and every existing style property.
4. Convert the sheet `<div>` (:626) to `<m.div {...sheet}>`, keeping all styles except the dead `transition` line (:636) — delete it.
5. Wrap the Delete Account dialog: change `{deleteStep && (` (:1426) to render inside its own `<AnimatePresence>`; the fixed scrim div becomes `<m.div {...scrim}>`, the inner card div (:1440) becomes `<m.div {...popIn}>`. Keep all styles and click handlers.
6. Same treatment for the canister confirm dialog (:1620): `<AnimatePresence>` + `<m.div {...scrim}>` + card as `<m.div {...popIn}>`.

## Boundaries

- Do NOT add drag-to-dismiss on the grabber. Presentation motion only.
- Do NOT touch the sticky header, toggle switches, redeem row, or any settings logic.
- Do NOT change z-index values, portal target, or `data-settings-page` (harness scripts may query it).
- Do NOT add new dependencies.
- If the code at a cited line does not match the excerpt (drift since ec777a5), STOP and report.

## Verification

- **Mechanical**: `npm run build` completes with no errors.
- **Feel check** (web `npm run dev`, then on-device via `/ship-dev`):
  - Tapping the settings gear: scrim fades in while the sheet slides up from the bottom edge with a soft spring (no bounce past its resting point worth noticing).
  - Closing: sheet slides back DOWN the same edge while the scrim fades — never an instant vanish.
  - Open the Delete Account flow: dialog scales in from 0.94, never from nothing; dismiss animates out.
  - iOS Settings > Accessibility > Motion > Reduce Motion ON: presentation still appears/disappears without slide (MotionConfig handles it), nothing gets stuck invisible.
  - CRITICAL device check (WKWebView portal risk): confirm the sheet is fully visible after opening 5 times in a row on the real device.
- **Done when**: SettingsPage enters and exits like Modal.jsx sheets do, both inner dialogs animate in/out, and the dead transition line is gone.
