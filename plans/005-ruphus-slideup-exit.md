# 005 — Give ProfessorRuphusSlideUp a symmetric exit

- **Status**: TODO
- **Commit**: ec777a5
- **Severity**: MEDIUM
- **Category**: Physicality & origin (spatial consistency)
- **Estimated scope**: 2 files (`src/components/ProfessorRuphusSlideUp.jsx`, `src/styles/global.css`), ~25 lines

## Problem

The full-screen lesson sheet slides up on open (CSS keyframes) but hard-cuts to nothing on close — the classic slides-in-teleports-out asymmetry.

```jsx
// src/components/ProfessorRuphusSlideUp.jsx:72-73 — current
export const ProfessorRuphusSlideUp = ({ open, onClose, bean, story, loading, researching, error, onRetry, onRefresh, tastingScores }) => {
  if (!open) return null;
```

```jsx
// src/components/ProfessorRuphusSlideUp.jsx:82 and :97 — current entrances (keep these)
        animation: 'ruphusFadeIn 0.2s ease-out',
        ...
        animation: 'ruphusSlideUp 0.3s ease-out',
```

This component is portalled (`createPortal` at :75) and uses CSS keyframes for its entrance, which is this repo's safe pattern for portalled surfaces. The exit must therefore also be CSS (a closing-state class), not AnimatePresence.

## Target

- Exit is the mirror of the entrance: sheet slides DOWN (`translateY(0)` to `translateY(100%)`) over 250ms `cubic-bezier(0.22,1,0.36,1)` with `forwards` fill; scrim fades out over 200ms. Unmount happens on `animationend` of the sheet.
- Exit slightly faster than entrance (250ms vs 300ms) — dismissals should feel snappier than presentations.
- Percentage translate (`translateY(100%)` = the element's own height), never pixel offsets.

## Repo conventions to follow

- Existing keyframes live in `src/styles/global.css`: `ruphusSlideUp` (:78-81), `ruphusFadeIn` (:83-86). Add the two exit keyframes next to them, same naming style.
- The closing-class pattern with an explicit reduced-motion `animation: none` guard follows the `.wiz-*` convention (`src/styles/global.css:201-220`). The exemplar for "CSS class + forwards + reduced-motion fallback that still ends hidden" is `.ruphus-coach-out` (:246-248).
- Easing token: `cubic-bezier(0.22,1,0.36,1)` is the repo's `cssOut` (`src/styles/theme.js:141`).

## Steps

1. `src/styles/global.css`: after `ruphusFadeIn` (:86), add:
   ```css
   @keyframes ruphusSlideDown {
     from { transform: translateY(0); }
     to { transform: translateY(100%); }
   }
   @keyframes ruphusFadeOut {
     from { opacity: 1; }
     to { opacity: 0; }
   }
   .ruphus-sheet-out { animation: ruphusSlideDown 250ms cubic-bezier(0.22, 1, 0.36, 1) forwards !important; }
   .ruphus-scrim-out { animation: ruphusFadeOut 200ms ease-out forwards !important; }
   @media (prefers-reduced-motion: reduce) {
     .ruphus-sheet-out, .ruphus-scrim-out { animation: none !important; opacity: 0; }
   }
   ```
   (`!important` is needed because the entrance animation is set as an inline style on the same elements.)
2. `src/components/ProfessorRuphusSlideUp.jsx`: add `import { useState } from 'react';` (extend the existing react import). Inside the component:
   ```jsx
   const [closing, setClosing] = useState(false);
   const startClose = () => { if (!closing) setClosing(true); };
   const finishClose = () => { setClosing(false); onClose(); };
   ```
3. Keep the early return but reset stale state: change :73 to `if (!open) { if (closing) setClosing(false); return null; }` — or equivalently guard with a `useEffect` that clears `closing` when `open` flips false. Either is fine; state must not leak into the next open.
4. Replace every internal call to `onClose` with `startClose`: the scrim `onClick` (:84), the header close button (:143), and the `ResearchLoadingScreen onClose` prop (:104).
5. Apply the exit classes and completion handler:
   - Scrim div (:76): add `className={closing ? 'ruphus-scrim-out' : undefined}`.
   - Sheet div (:86): add `className={closing ? 'ruphus-sheet-out' : undefined}` and `onAnimationEnd={(e) => { if (closing && e.target === e.currentTarget) finishClose(); }}`.
6. Reduced-motion edge: with `animation: none` the sheet's `onAnimationEnd` never fires. Add a fallback timeout in `startClose`: `setTimeout(finishClose, 300)` stored in a ref and cleared in `finishClose` (double-invocation is harmless since `finishClose` is idempotent after the state flip, but clear the timer to be clean).

## Boundaries

- Do NOT convert this component to framer/AnimatePresence (portalled surface; CSS is the rule here).
- Do NOT change the entrance timings (:82, :97) or any lesson content/logic.
- Do NOT touch ResearchLoadingScreen internals — only the prop it receives.
- Do NOT add new dependencies.
- If code at a cited line does not match (drift since ec777a5), STOP and report.

## Verification

- **Mechanical**: `npm run build` passes.
- **Feel check** (web, then device):
  - Open a Professor Ruphus lesson, tap X: the sheet slides down its own edge while the scrim fades; nothing hard-cuts. Tap the scrim: same exit.
  - Spam-tap X during the exit: no double-fire, no reopen, no stuck scrim.
  - Close during the loading state: exits cleanly too.
  - DevTools > Rendering > prefers-reduced-motion: reduce — closing still dismisses (via the timeout fallback) within ~300ms.
  - Reopen after closing: entrance plays fresh; the exit class is not stuck on either element.
- **Done when**: enter and exit are symmetric, every close path animates, and rapid open/close cycles never wedge the component.
