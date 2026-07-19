# 007 — ScanSheet: fade steps in instead of hard-swapping

- **Status**: TODO
- **Commit**: ec777a5
- **Severity**: LOW
- **Category**: Missed opportunities (preventing a jarring change)
- **Estimated scope**: 1 file (`src/components/ScanSheet.jsx`), ~10 lines

## Problem

The scan flow's four steps hard-swap via bare conditionals, and the error message pops in flat. The sibling flow (QuickRecipeFlow) already animates the same beats, so the two AI-scan experiences feel different for no reason.

```jsx
// src/components/ScanSheet.jsx:273 — current (same pattern at :417, :436, :443)
      {step === 'photo' && (
        <div style={{ padding: '8px 0 12px' }}>
```

```jsx
// src/components/ScanSheet.jsx:403-412 — current (error appears with no entrance)
          {scanError && (
            <div style={{
              padding: '10px 14px', borderRadius: radius.md,
              ...type.body, fontSize: 13, background: C.amberBg,
              color: C.amber, marginTop: 14,
              border: `1px solid ${C.accentLight}`,
            }}>
              {scanError}
            </div>
          )}
```

## Target

Each step's root wraps in the `fadeUp` variant (`initial {opacity: 0, y: 12}` to `{opacity: 1, y: 0}`, `duration: 0.28s`, ease `[0.22, 1, 0.36, 1]` — from `src/lib/motion.js:29-34`); the error wraps in `popIn` (`{opacity: 0, scale: 0.94}` to `{1, 1}`, `spring.snappy`). Entrance-only, no `AnimatePresence` and no `mode="wait"` — the outgoing step unmounts instantly while the new one fades up, exactly like QuickRecipeFlow. Waiting-crossfades would add latency to a flow the user is watching a spinner in; entrance-only is the deliberate choice.

## Repo conventions to follow

- Exemplar: `src/components/QuickRecipeFlow.jsx:487-488` (`{step === 'photo' && (<m.div {...fadeUp} ...>`) and `:530-532` (`{scanError && (<m.div {...popIn} ...>`).
- Import style: `import { m, fadeUp, popIn } from '../lib/motion';`.
- Reduced motion: app-wide `<MotionConfig reducedMotion="user">` covers these variants.
- ScanSheet renders inside `Modal` (a working AnimatePresence portal), so these are child entrances on an already-presented surface — the WKWebView portal concern applies to surfaces whose VISIBILITY depends on framer; here the modal is already visible and QuickRecipeFlow proves the pattern on device. Keep it consistent with that exemplar.

## Steps

1. Add the import: `import { m, fadeUp, popIn } from '../lib/motion';`.
2. Change each step root `<div>` to `<m.div {...fadeUp}>` keeping styles identical (and closing tags to `</m.div>`):
   - `photo` step (:274, `<div style={{ padding: '8px 0 12px' }}>`)
   - `scanning` step (:418, `<div style={{ textAlign: 'center' }}>`)
   - `researching` step (:437, `<div style={{ textAlign: 'center' }}>`)
   - `saving` step (:444, `<div style={{ textAlign: 'center' }}>`)
3. Change the `scanError` block root (:404) to `<m.div {...popIn}>` keeping its style object identical.

## Boundaries

- Do NOT add `AnimatePresence`, exit animations, or `mode="wait"` between steps.
- Do NOT touch scan logic, photo handling, spinners, or the Modal shell.
- Do NOT animate the photo thumbnails or buttons inside the steps.
- Do NOT add new dependencies.
- If code at a cited line does not match (drift since ec777a5), STOP and report.

## Verification

- **Mechanical**: `npm run build` passes.
- **Feel check** (web + device):
  - Run a scan end to end: photo, scanning, researching, saving — each step rises in softly; no blank frame between steps.
  - Force an error (airplane mode, then scan): the amber error pops in from 0.94 rather than blinking on.
  - Side-by-side with Quick Recipe: the two flows now share the same step rhythm.
  - Spam-switch (retake photos repeatedly): entrances never stack or lag the buttons.
  - DevTools > Rendering > prefers-reduced-motion: reduce — steps still swap with content fully visible; no stuck opacity on any step or the error block.
- **Done when**: all four steps and the error animate in with the shared variants and the flow feels identical to QuickRecipeFlow.
