# 006 — QuickRecipeActionMenu: pop in from its trigger + row press feedback

- **Status**: TODO
- **Commit**: ec777a5
- **Severity**: MEDIUM
- **Category**: Physicality & origin
- **Estimated scope**: 1 file (`src/components/QuickRecipeActionMenu.jsx`), ~20 lines

## Problem

The long-press action menu snaps into existence with no motion connecting it to its trigger, and its rows give no tap feedback. Its sibling component does this correctly, so the app has two identical popovers that behave differently.

```jsx
// src/components/QuickRecipeActionMenu.jsx:24 — current
  if (!open) return null;
```

```jsx
// src/components/QuickRecipeActionMenu.jsx:46-72 — current (abridged)
  return (
    <div
      ref={menuRef}
      style={{
        position: 'absolute',
        top: '100%',
        right: 0,
        marginTop: 6,
        ...
      }}
    >
      <div onClick={() => choose(onQuickRecipe)} style={rowStyle}>
        <Camera size={16} color={C.accent} />
        Quick Recipe
      </div>
      ...
```

## Target

Identical presentation to `src/components/BrewMethodMenu.jsx:45-71`: `AnimatePresence` + the `popIn` variant (`initial {opacity: 0, scale: 0.94}` to `{1, 1}`, exit `{opacity: 0, scale: 0.96}`, `spring.snappy = { type: "spring", stiffness: 420, damping: 34, mass: 0.8 }`), scaling from the trigger corner. This menu opens BELOW and to the RIGHT of its trigger (`top: '100%', right: 0`), so `transformOrigin: 'top right'` (BrewMethodMenu opens above-left and correctly uses `'bottom left'` — mirror it, do not copy the string). Rows get `whileTap={{ scale: 0.97 }}`.

## Repo conventions to follow

- Exemplar to imitate structurally: `src/components/BrewMethodMenu.jsx` — `AnimatePresence` wrapping `{open && <m.div ref={menuRef} {...popIn} style={{ ..., transformOrigin: 'bottom left' }}>`, imports `{ AnimatePresence } from 'framer-motion'` and `{ m, popIn } from '../lib/motion'`.
- Row hover pattern (web) also comes from BrewMethodMenu :75-76 (`onMouseEnter/Leave` background swap) — optional to add, but the `transition: 'background 0.14s ease'` in its rowStyle (:41) is worth copying so any background change is soft.
- Reduced motion: handled by app-wide `<MotionConfig reducedMotion="user">`; nothing extra needed.

## Steps

1. Add imports: `import { AnimatePresence } from 'framer-motion';` and `import { m, popIn } from '../lib/motion';`.
2. Delete the early return at :24. Wrap the returned tree in `<AnimatePresence>{open && ( ... )}</AnimatePresence>`. Note the outside-tap `useEffect` (:9-22) already keys off `open`; it needs no change.
3. Convert the container `<div ref={menuRef} ...>` (:47) to `<m.div ref={menuRef} {...popIn} ...>` and add `transformOrigin: 'top right'` to its style object.
4. Convert both rows (:63, :68) to `<m.div whileTap={{ scale: 0.97 }} ...>` keeping `onClick` and `rowStyle`; add `transition: 'background 0.14s ease'` and `WebkitTapHighlightColor: 'transparent'` to `rowStyle` (:26-39) to match BrewMethodMenu's rowStyle (:29-43).

## Boundaries

- Do NOT change positioning values (`top: '100%'`, `right: 0`, `marginTop: 6`), z-index, or the outside-tap dismissal logic.
- Do NOT restyle rows beyond the two properties listed.
- Do NOT add new dependencies.
- If code at a cited line does not match (drift since ec777a5), STOP and report.

## Verification

- **Mechanical**: `npm run build` passes.
- **Feel check** (web + device):
  - Long-press the header CTA: the menu grows from its top-right corner (where the trigger is), not from center — verify at 10% playback in DevTools Animations panel.
  - Dismiss by tapping outside: it shrinks back toward the same corner (exit fires via AnimatePresence).
  - Tapping a row: row dips to 0.97, the action fires once, and the menu closes.
  - Compare side by side with the Brew long-press menu: the two should feel like the same component.
  - DevTools > Rendering > prefers-reduced-motion: reduce — the menu still opens and closes (instantly or gently), rows stay tappable, nothing sticks half-visible.
- **Done when**: open/close both animate from the trigger corner and rows acknowledge taps, with BrewMethodMenu parity.
