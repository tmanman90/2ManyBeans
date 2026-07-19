# 004 — Press feedback on the three primary cards (ShelfCard, ArchiveEntry, CupCardSmall)

- **Status**: TODO
- **Commit**: ec777a5
- **Severity**: MEDIUM
- **Category**: Physicality & origin (press feedback)
- **Estimated scope**: 2 files (`src/components/ShelfCard.jsx`, `src/tabs/ArchiveTab.jsx`), ~10 lines

## Problem

The most-tapped cards in the app give no press acknowledgment, while nearly every other tap target presses. Frequency is tens of times per day, so the correct motion is the subtle tier only: scale 0.985, nothing louder.

```jsx
// src/components/ShelfCard.jsx:35 — current (primary card body, Rotation + Inventory carousels)
      <div onClick={openDetail} style={{ cursor: 'pointer', WebkitTapHighlightColor: 'transparent', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
```

```jsx
// src/tabs/ArchiveTab.jsx:201-202 — current (main archive ledger row)
      <div role="button" tabIndex={0} onClick={open} onKeyDown={onKey}
        style={{ display: 'flex', gap: 14, padding: 14, minHeight: 44, background: C.cream, ... }}>
```

```jsx
// src/tabs/ArchiveTab.jsx:168-169 — current (small fav-cup card; its sibling FeaturedCup at :138-140 DOES press)
    <button onClick={() => onOpen(bean, bagRef.current?.getBoundingClientRect())}
      style={{ flexShrink: 0, width: 150, textAlign: 'left', padding: 12, cursor: 'pointer', ... }}>
```

## Target

All three use the repo's card-press value: `whileTap={{ scale: 0.985 }}` with `spring.soft` (`{ type: "spring", stiffness: 260, damping: 30, mass: 0.9 }`). This is interaction-only framer motion (`whileTap`), which is explicitly allowed in WKWebView portals per this repo's motion rule; no entrance animation is added.

## Repo conventions to follow

- Exemplar to copy exactly: `FeaturedCup` at `src/tabs/ArchiveTab.jsx:138-140`:
  ```jsx
  <m.button
    onClick={() => onOpen(bean, bagRef.current?.getBoundingClientRect())}
    whileTap={reduce ? undefined : { scale: 0.985 }} transition={motionTokens.spring.soft}
  ```
- ArchiveTab components already receive a `reduce` prop and gate motion on it — preserve that pattern.
- ShelfCard has no framer import yet; use `import { m, spring } from '../lib/motion';` (the `cardPress` variant in `src/lib/motion.js:23-26` uses scale 0.985 + `spring.soft`; spreading `{...cardPress}` is equivalent and also acceptable).

## Steps

1. `src/components/ShelfCard.jsx`: add `import { m, cardPress } from '../lib/motion';`. Change the tappable body at :35 from `<div onClick={openDetail} ...>` to `<m.div onClick={openDetail} {...cardPress} ...>` keeping the style object identical (closing tag becomes `</m.div>`).
2. `src/tabs/ArchiveTab.jsx`, `ArchiveEntry` (:201): change the inner `<div role="button" ...>` to `<m.div role="button" whileTap={reduce ? undefined : { scale: 0.985 }} transition={motionTokens.spring.soft} ...>` keeping `tabIndex`, `onClick`, `onKeyDown`, and the style object identical. (`m` and `motionTokens` are already imported in this file.)
3. `src/tabs/ArchiveTab.jsx`, `CupCardSmall` (:168): change `<button ...>` to `<m.button whileTap={reduce ? undefined : { scale: 0.985 }} transition={motionTokens.spring.soft} ...>` keeping everything else identical, mirroring FeaturedCup at :138-140.

## Boundaries

- Scale 0.985 only — do NOT use 0.97 or add opacity/shadow changes (these cards carry heavy imagery; louder press reads as lag).
- Do NOT touch the hero-morph open animation, ParallaxBag, scroll-reveal (`whileInView`), or any layout.
- Do NOT add press to any other element in these files.
- Do NOT add new dependencies.
- If code at a cited line does not match (drift since ec777a5), STOP and report.

## Verification

- **Mechanical**: `npm run build` passes.
- **Feel check** (web + device):
  - Press and hold a Rotation shelf card: it settles to 98.5% and springs back on release; the flip-open morph still fires normally on tap.
  - Same for an archive ledger row and a small fav-cup card; FeaturedCup and CupCardSmall now feel identical.
  - iOS Reduce Motion ON: ArchiveTab cards stop pressing (reduce prop), app-wide MotionConfig covers ShelfCard.
  - Scroll the archive list with a finger resting on a row: scrolling does not trigger the press scale in a distracting way (whileTap only fires on actual taps; confirm by eye).
- **Done when**: all three cards acknowledge touch at 0.985 with the soft spring and nothing else changed.
