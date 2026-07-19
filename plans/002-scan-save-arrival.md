# 002 — Celebrate the scan-save arrival (haptic + staggered research reveal)

- **Status**: TODO
- **Commit**: ec777a5
- **Severity**: MEDIUM
- **Category**: Missed opportunities (delight budget)
- **Estimated scope**: 3 files (`src/components/ScanSheet.jsx`, `src/components/EditBeanModal.jsx`, `src/styles/global.css`), ~30 lines

## Problem

The app's biggest magic moment lands flat. After Gemini reads the bag label, researches the bean online, and saves it, the user is silently dropped into a plain edit form. No haptic, no reveal.

```jsx
// src/components/ScanSheet.jsx:239-240 — current (end of handleScan success path)
      reset();
      onBeanCreated(beanId, savedBean);
```

```jsx
// src/tabs/InventoryTab.jsx:82-86 — current (the handoff)
  const handleBeanCreated = (beanId, beanData) => {
    setScanOpen(false);
    setManualOpen(false);
    setNewBeanEntry(beanData);
  };
```

The review form the user lands in (`EditBeanModal` with `isNewBean`, mounted at `src/tabs/InventoryTab.jsx:489`) renders all AI-filled chapters at once with no motion. Its body is a sequence of top-level blocks inside the Modal body (`src/components/EditBeanModal.jsx`): photo section (:521-653), ChapterHeader 1 Identity (:655) + rows (:656-681), ChapterHeader 2 Origin Story (:683) + grids (:684-711), ChapterHeader 3 On the Shelf (:713) + card (:714-747), ChapterHeader 4 Tasting Notes (:749) + blocks (:750-800).

## Target

Frequency tier is rare (a new bag), so the delight budget applies — but the moment should still be quick and physical, not showy:

1. `haptic.success()` fires the instant the bean is saved (before `onBeanCreated`).
2. When `isNewBean` is true, the review form's blocks cascade in so the user watches the research land: each top-level block plays the existing `fadeInUp` keyframes (`src/styles/global.css:114-117`) at `300ms cubic-bezier(0.22,1,0.36,1)` with `animation-delay: calc(var(--i) * 50ms)` and `animation-fill-mode: both`, indexed 0..9 top to bottom. Total sequence under 800ms, non-blocking (fields remain interactive immediately).
3. CSS only for this entrance — this modal is portalled and this repo's rule is CSS keyframes for entrance/visibility in portals (framer entrance animations have died in WKWebView portals before; see lessons.md).

## Repo conventions to follow

- Haptics: `import { haptic } from '../lib/haptics';` — exemplar `src/components/BrewTimer.jsx:77` (`haptic.success()` on brew completion).
- Keyframes already exist: `fadeInUp` at `src/styles/global.css:114-117`. Add only the utility class, next to the `.wiz-*` block (:201-220), following its reduced-motion guard style.
- The global reduce rule (`src/styles/global.css:127-133`) already collapses all animations to 0.001ms; add the explicit `animation: none` guard anyway to match the `.wiz-*` convention.

## Steps

1. `src/components/ScanSheet.jsx`: add `import { haptic } from '../lib/haptics';` and change :239-240 to:
   ```jsx
      reset();
      haptic.success();
      onBeanCreated(beanId, savedBean);
   ```
2. `src/styles/global.css`: after the `.wiz-pop` block (:217-220), add:
   ```css
   /* New-bean review reveal — research cascades in. Fill-mode "both" + visible-by-default
      parent means content stays visible if the animation never runs (WKWebView safety). */
   .nb-reveal { animation: fadeInUp 300ms cubic-bezier(0.22, 1, 0.36, 1) both; animation-delay: calc(var(--nb-i, 0) * 50ms); }
   @media (prefers-reduced-motion: reduce) { .nb-reveal { animation: none; } }
   ```
3. `src/components/EditBeanModal.jsx`: define once near the top of the component render (after :519):
   ```jsx
   let nbIndex = 0;
   const nbReveal = () => (isNewBean ? { className: 'nb-reveal', style: undefined, ['--nb-i']: nbIndex++ } : {});
   ```
   Then apply to each top-level block by adding `className={isNewBean ? 'nb-reveal' : undefined}` and `style={{ ...existingStyle, ['--nb-i']: N }}` with N assigned in order: photo section div (:521) N=0, ChapterHeader 1 (:655) N=1, its two rows (:656, :661) N=2, the conditional AI-fill block (:666) N=2 (same beat), ChapterHeader 2 (:683) N=3, grids (:684, :695) N=4, ChapterHeader 3 (:713) N=5, shelf card (:714) N=6, ChapterHeader 4 (:749) N=7, notes blocks (:750, :768, :784) N=8. Blocks below (:802 onward: Deeper Details, Grind Settings, delete) get no class — they are below the fold.
   Note: if the ChapterHeader component does not accept `className`/`style` passthrough, wrap each ChapterHeader in a plain `<div className="nb-reveal" style={{ ['--nb-i']: N }}>` instead of modifying ChapterHeader.
   If the inline helper from this step conflicts with how the file is structured, hand-assigning the props per block (no helper) is equally acceptable — the observable result is what matters.

## Boundaries

- Do NOT animate anything when `isNewBean` is false (routine edits are frequent; no entrance).
- Do NOT use framer-motion for this entrance (portalled modal; CSS only).
- Do NOT touch save logic, enrichment, photo handling, or the footer progress bar.
- Do NOT add new dependencies.
- If code at a cited line does not match (drift since ec777a5), STOP and report.

## Verification

- **Mechanical**: `npm run build` passes.
- **Feel check** (web first, then device via `/ship-dev` — haptics are a no-op on web):
  - Scan a bag: on save you land in "New Bean" and the sections cascade top to bottom in under a second; typing into a field immediately during the cascade works.
  - Open EDIT on an existing bean: no cascade, instant form.
  - DevTools > Rendering > prefers-reduced-motion: reduce — form appears fully, no animation, nothing invisible.
  - On device: a success "thud" lands the moment the save completes.
- **Done when**: new-bean review cascades once, existing-bean edit does not, device haptic fires on scan-save.
