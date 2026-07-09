# Card swipe navigation — swipe between beans in the open BeanDetailCard

type: feat
date: 2026-07-09
status: approved (Tal, in-session)

## Problem frame
The trading-card overlay (`src/components/BeanDetailCard.jsx`) shows one bean; browsing the shelf means close → tap next → reopen. Tal wants horizontal swipe on the open card to move to the next/previous bean in the surface's visible order.

## Requirements
- R1: With the card open on its FRONT face, swiping left advances to the next bean and swiping right goes to the previous bean, in the same order the surface displays them.
- R2: Works on all three mounts: InventoryTab (sealed rails order), RotationTab (jar order), ArchiveTab (display order: featured then ledger).
- R3: Existing gestures unchanged: pull-down-to-dismiss (front), flip via VIEW STAT SHEET, back-face scroll + pull-to-dismiss, flavor-note rail drag, scrim tap close.
- R4: At the first/last bean the swipe rubber-bands (no wrap).
- R5: Navigation resets card to front face, closes the insight expansion, and does NOT replay the hero morph or entrance haptic as a "new open".
- R6: `TastingDetailCard` opened from the card must show the currently displayed bean (no stale parent `detailBean`).
- R7: Motion is transform/opacity only, respects `useReducedMotion` (reduce → instant swap, no slide), haptic `selection` tick on commit.

## Key technical decisions
- **Parent-driven bean swap, no remount.** `useBeanDetail` stays the source of truth. Tabs pass two new optional props: `siblings` (ordered bean array as rendered) and `onNavigate(bean)` → calls `openDetail(bean, null)` (null rect: `morphEligible` is already false-guarded, and `morphRan` ref prevents replay). Do NOT key the card by bean id — remount would kill the slide transition and replay entrance effects.
- **Gesture:** the front card wrapper already has framer `drag="y"` + `dragDirectionLock` (`src/components/BeanDetailCard.jsx:481`). Change to `drag={flipped ? false : true}` keeping `dragDirectionLock`; constraints `{top:0,bottom:0,left:0,right:0}`, elastic y as today, x ~0.5 (rubber-band at ends: when no neighbor in that direction, elastic ~0.15). In `onDragEnd`, branch on dominant axis: y keeps today's dismiss thresholds; x commits when `|offset.x| > 90 || |velocity.x| > 500` and a neighbor exists.
- **Transition (portal-safe pattern already proven in this file):** drive a `useMotionValue` x on the card wrapper. Commit: `fmAnimate` x to ±(cardWidth + 40) with ease-out (~0.22s), then call `onNavigate(neighbor)`, then set x to ∓offset and `fmAnimate` back to 0 with `spring.soft`. A slight `rotateZ` proportional to x (±3° max, `useTransform`) gives the collectible-card feel. Opacity dips to ~0.9 mid-flight max. Reduced motion: skip both animations, just `onNavigate`.
- **State reset on `bean.id` change** (in-card `useEffect`): `flipped=false` + `flipP.set(0)` (no flip animation), `insightOpen=false`, back scroll to top. Guard the entrance haptic + morph so they fire only on mount, not on navigate (already refs/mount effects — verify).
- **Sibling order derivation** (each tab, memoized, matching exactly what's rendered):
  - InventoryTab: the flattened rail order (grouped-by-roaster arrays in render order).
  - RotationTab: the jar slot order, nulls filtered.
  - ArchiveTab: featured cups first, then ledger entries, same order as rendered.
- Front face only. When `flipped`, horizontal swipe stays disabled (back face scrolls).

## Files
- `src/components/BeanDetailCard.jsx` — gesture, transition, state reset, new props.
- `src/hooks/useBeanDetail.js` — optional convenience `navigateDetail` (or tabs just call `openDetail(bean, null)`).
- `src/tabs/InventoryTab.jsx`, `src/tabs/RotationTab.jsx`, `src/tabs/ArchiveTab.jsx` — pass `siblings` + `onNavigate`.

## Guardrails (non-negotiable)
- WKWebView portal rule: no NEW `<m.div initial/animate>` entrance-gated visibility; motion values + `fmAnimate` + drag only (the file's existing pattern).
- No `backdrop-filter` animation, no layout-property animation. ≤300ms micro-interactions.
- Additive props only; all three tabs must still work if `siblings` is omitted (card without swipe).
- Do not touch stripBg/photo logic, wizard, or chat.

## Test scenarios
1. Inventory: open first bean of first rail → swipe left cycles through the full flattened rail order; swipe right at index 0 rubber-bands.
2. Rotation: 3 jars → swipe crosses jars in slot order.
3. Archive: order = featured then ledger; restore/delete actions still act on the currently shown bean.
4. Swipe to bean B, tap a tasting → TastingDetailCard shows bean B's tasting context.
5. Flip to stat sheet → horizontal swipe does nothing; flip back → swipe works; after navigate, card is on front face.
6. Pull-down dismiss still works after the drag change (axis lock).
7. Reduced motion: navigate is instant, no slide.

## Verification
- `npm run build` clean.
- Codex adversarial review of the diff (fresh agent, given the WKWebView + motion rules).
- On-sim visual pass: Inventory Bombe Bensa → swipe both directions, screenshot evidence.
