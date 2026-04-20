---
title: "feat: Archive Detail UX Improvements"
type: feat
status: active
date: 2026-04-19
origin: docs/brainstorms/2026-04-19-archive-detail-ux-requirements.md
---

# feat: Archive Detail UX Improvements

## Enhancement Summary

**Deepened on:** 2026-04-19
**Agents used:** 7 (frontend races, performance oracle, architecture strategist, code simplicity, pattern recognition, learnings researcher, best practices)

### Key Improvements from Deepening
1. **R3 simplified: close-and-reopen replaces modal-over-sheet** -- eliminates z-index override, stale data mitigation, and extra prop threading
2. **SwipeDownHandle rewritten with refs + rAF** -- fixes a real race condition (stale `dy` in onTouchEnd) and eliminates 60 re-renders/sec during gesture
3. **closingRef guard** added to prevent double-dismiss race condition
4. **React.lazy() at module scope** -- critical gotcha from project learnings that prevents state destruction
5. **Bonus fix: memoize totalCups** -- existing O(T*F) scan found during review

### New Considerations Discovered
- ArchiveTab's `openBean` snapshot is the only detail view in the codebase that uses stale state (all others derive live). Fix: store ID, derive bean.
- `handleUseOriginal` in EditBeanModal is not guarded by `photoInFlight` -- race between original upload and product shot generation
- maxHeight 300px creates dead transition time when content is only ~150px tall

---

## Overview

The archive experience has several friction points that make it feel less polished than inventory. The detail sheet's drag handle is cosmetic-only (no swipe-to-dismiss), archive cards lack the inline "Show details" expand that inventory BeanCards have, the bean photo in the detail sheet isn't tappable for editing (the only place in the app where you can't edit a bean's photo), and the search bar placeholder text gets truncated by the Filter button.

Four requirements from origin doc (see origin: `docs/brainstorms/2026-04-19-archive-detail-ux-requirements.md`):
- **R1**: Swipe-to-dismiss on detail sheet
- **R2**: "Show details" expand on archive timeline cards
- **R3**: Tappable photo in archive detail sheet
- **R4**: Fix search placeholder truncation

## Proposed Solution

Reuse existing proven patterns from the codebase rather than building new abstractions:

1. **Extract `SwipeDownHandle`** from TastingTab into a shared component, rewrite with refs + rAF for smooth gesture tracking, wire into ArchiveDetailSheet
2. **Replicate BeanCard expand pattern** in TimelineRow with the same `maxHeight` transition and detail fields
3. **Close-and-reopen for photo editing** -- tapping the photo closes the detail sheet, then opens EditBeanModal at the ArchiveTab level (no modal stacking)
4. **Fix flex layout** on the archive search bar and shorten placeholder

## Technical Considerations

### R1: SwipeDownHandle -- Refs + rAF Rewrite

The existing SwipeDownHandle in TastingTab (lines 32-63) has two bugs:

**Bug 1: Stale `dy` in onTouchEnd.** `dy` is read from React state closure. If a fast swipe completes within one React batch, `onTouchMove` calls `setDy(120)` but `onTouchEnd` still sees `dy === 0` from the last committed render. The swipe looks decisive but the handle snaps back. Fix: read the final delta from `e.changedTouches[0].clientY` directly, not from batched state.

**Bug 2: 60 re-renders/sec during drag.** Every `onTouchMove` calls `setDy()`, triggering a full React reconciliation pass per frame. The R05Tinder component solved this correctly with refs + rAF + direct DOM mutation. Fix: track `dy` in a ref, coalesce updates via `requestAnimationFrame`, apply transform via `el.style.transform` directly.

Reference implementation pattern (from `src/components/onboarding/screens/R05Tinder.jsx`):
```jsx
const dyRef = useRef(0);
const rafRef = useRef(null);
const pillRef = useRef(null);

const applyTransform = () => {
  rafRef.current = null;
  if (pillRef.current) {
    pillRef.current.style.transform = dyRef.current
      ? `translateY(${dyRef.current * 0.25}px)` : 'none';
  }
};

onTouchMove={e => {
  if (startY.current == null) return;
  const delta = e.touches[0].clientY - startY.current;
  if (delta > 0) dyRef.current = Math.min(delta, 200);
  if (!rafRef.current) rafRef.current = requestAnimationFrame(applyTransform);
}}

onTouchEnd={e => {
  if (startY.current == null) return;
  const finalDy = (e.changedTouches[0]?.clientY ?? 0) - startY.current;
  if (finalDy > 70) onClose?.();
  else {
    dyRef.current = 0;
    if (pillRef.current) {
      pillRef.current.style.transition = 'transform 0.18s';
      pillRef.current.style.transform = 'none';
    }
  }
  startY.current = null;
}}
```

### R1: Double-Dismiss Guard

ArchiveDetailSheet's `close()` (line 125) can be called multiple times via backdrop click, Escape key, or action buttons. Each call schedules a separate `setTimeout(220ms)`, causing `onClose` to fire twice.

Fix: add a `closingRef` guard:
```jsx
const closingRef = useRef(false);

const close = () => {
  if (closingRef.current) return;
  closingRef.current = true;
  setClosing(true);
  setTimeout(() => {
    setMounted(false);
    setClosing(false);
    closingRef.current = false;
    onClose?.();
  }, 220);
};
```
Reset `closingRef.current = false` in the useEffect that detects `bean` going null.

### R2: TimelineRow Element Restructure

`TimelineRow` wraps everything in a `<button>` (ArchiveTab.jsx line 261). Adding a nested "Show details" `<button>` inside is invalid HTML and creates click propagation issues.

Fix: convert to `<div role="button" tabIndex={0}>`. The existing `handleKey` function (line 239) already implements Enter/Space, showing the original author anticipated this.

BeanCard avoids this problem because its root is already a `<div>`, not a `<button>`. TimelineRow is the only component in the codebase that needs this restructure.

### R3: Close-and-Reopen Pattern (Simplified from Original Plan)

**Original plan:** Open EditBeanModal stacked over ArchiveDetailSheet (modal-over-sheet). This required:
- Threading `updateBean` + `uid` through 2 extra component layers
- Adding a `zIndex` override prop to Modal.jsx (new paradigm, no precedent in codebase)
- Deriving `liveBean` from beans array to handle stale data
- Managing orphan modal state if sheet closes while modal is open

**Simplified approach (recommended by 4/6 reviewers):** Close the detail sheet, then open EditBeanModal at the ArchiveTab level. This eliminates all four concerns above.

Flow:
1. User taps photo in ArchiveDetailSheet
2. Sheet calls `onEditPhoto(bean)` callback (same pattern as `onRestore`, `onDelete`)
3. ArchiveTab receives the callback: closes the detail sheet, sets `editBean` state
4. EditBeanModal opens standalone (z-index 1000, no conflict)
5. On save/close, user returns to the archive list with updated data

Benefits:
- No z-index changes to Modal.jsx (avoids introducing a new paradigm)
- No stale data problem (EditBeanModal gets the bean fresh from the parent)
- No prop threading through extra layers (ArchiveTab already has `updateBean` and `uid`)
- No orphan modal risk (only one overlay on screen at a time)
- 220ms close animation makes the transition feel intentional

### R3: Stale openBean Fix (Independent of Photo Editing)

ArchiveTab's `openBean` snapshot is the only detail view in the codebase that uses stale state. TastingTab, RotationTab, and InventoryTab all derive live data. Fix this regardless of the photo editing approach:

```jsx
// Store ID, not object
const [openBeanId, setOpenBeanId] = useState(null);

// Derive live bean
const openBean = useMemo(
  () => openBeanId ? beans.find(b => b.id === openBeanId) ?? null : null,
  [beans, openBeanId]
);

// If bean was deleted elsewhere, close the sheet
useEffect(() => {
  if (openBeanId && !openBean) setOpenBeanId(null);
}, [openBeanId, openBean]);
```

Do NOT fall back to the stale snapshot (`|| openBean`). If the bean vanishes from Firestore, close the sheet. The user should not interact with a phantom.

### R3: Lazy-Load EditBeanModal

EditBeanModal is 746 lines / 36KB source. Dynamic import on user tap, matching existing project patterns (Camera, Storage, Haptics all lazy-load):

```jsx
// CORRECT: at module scope (per react-lazy-inside-render-destroys-state.md)
const EditBeanModalLazy = lazy(() => import('./EditBeanModal').then(m => ({ default: m.EditBeanModal })));
```

Critical gotcha from project learnings: `React.lazy()` MUST be at module scope, never inside the render function. Defining it inside render creates a new component identity every render, destroying all modal state (form inputs, pending photo, upload progress).

### R4: Search Placeholder

The input already has `minWidth: 0` (line 709). The truncation is caused by the parent flex container (line 688) which defaults to `min-width: auto`. Fix the wrapper div, not the input.

## System-Wide Impact

- **Interaction graph**: R3 close-and-reopen keeps a clean single-overlay model. Photo save calls `updateBean` which writes to Firestore, fires the snapshot listener in `useAppData`, updates `beans` in App.jsx, which flows down to ArchiveTab.
- **State lifecycle risks**: Stale `openBean` snapshot fixed by storing ID and deriving. No orphan risk with close-and-reopen.
- **API surface parity**: After R3, all three contexts (rotation, inventory, archive) support photo editing. Consistent.

## Acceptance Criteria

### R1: Swipe-to-Dismiss
- [ ] Extract `SwipeDownHandle` from `src/tabs/TastingTab.jsx:32-63` into `src/components/SwipeDownHandle.jsx`
- [ ] Rewrite with refs + rAF: track `dy` in `useRef`, coalesce via `requestAnimationFrame`, apply transform via direct DOM mutation (not setState)
- [ ] Read final delta from `e.changedTouches[0].clientY` in onTouchEnd (not from batched React state)
- [ ] Accept `onClose` prop; invoke with `?.()` optional chaining (per share-card-capture-retry lesson)
- [ ] Accept optional `color` prop (default to theme token) to normalize handle colors across consumers
- [ ] Update TastingTab to import from shared component (verify no behavior regression)
- [ ] Wire into `ArchiveDetailSheet` replacing the visual-only drag handle (lines 187-189)
- [ ] Add `closingRef` guard to `ArchiveDetailSheet.close()` to prevent double-dismiss
- [ ] Pass the internal `close()` function as `onClose` prop to SwipeDownHandle
- [ ] Hybrid dismiss threshold: distance > 70px OR velocity > 0.3 px/ms (fast flick dismisses even at short distance, feels more native)
- [ ] Below both thresholds: snap back with 0.18s ease transition
- [ ] Tap on handle also dismisses
- [ ] Sheet scrolling unaffected (`touchAction: 'none'` on handle)
- [ ] Add `role="dialog"` and `aria-modal="true"` to ArchiveDetailSheet's sheet container (currently missing, other sheets like PaywallSheet have it)
- [ ] After extraction, grep for phantom refs in TastingTab (per closure-rename lesson)

### R2: Archive Card Expand
- [ ] Restructure `TimelineRow` outer element from `<button>` to `<div role="button" tabIndex={0}>`
- [ ] Keep existing `onClick={onOpen}` and `onKeyDown={handleKey}` on the outer div
- [ ] Add `expanded` state and "Show details" / "Hide details" toggle button below existing card content
- [ ] Add `e.stopPropagation()` on expand toggle to prevent opening detail sheet
- [ ] Only show expand toggle when bean has enriched fields beyond what's already visible (variety, region, farm, altitude, roastLevel, cupScore)
- [ ] Expanded section uses `maxHeight` transition: 0 to **180px** (not 300px, avoids dead transition time), 0.25s ease-out, opacity fade
- [ ] Show fields: variety, region, farm, altitude, roast level, cup score (conditional rendering)
- [ ] Add `aria-expanded` attribute for accessibility
- [ ] Do NOT add minWidth/minHeight to any buttons (per lessons.md guardrail)

### R3: Tappable Photo (Close-and-Reopen)
- [ ] Add visual affordance on BeanThumb in ArchiveDetailSheet: small camera/edit icon overlay (bottom-right corner, semi-transparent background, 44x44pt tap target)
- [ ] When bean has no photo (SVG placeholder): show camera "+" icon overlay
- [ ] When bean has photo: show pencil/edit icon overlay
- [ ] On tap, call new `onEditPhoto(bean)` callback prop (same pattern as `onRestore`, `onDelete`)
- [ ] In ArchiveTab: handle `onEditPhoto` by closing the detail sheet, then setting `editBean` state
- [ ] Render `EditBeanModalLazy` when `editBean` is set, with `updateBean`, `uid`, `onClose` props
- [ ] Lazy-load EditBeanModal at module scope (not inside render -- per react-lazy-inside-render lesson)
- [ ] Do NOT pass `deleteBean` to EditBeanModal in this context
- [ ] Fix stale `openBean`: store `openBeanId` in state, derive live bean from `beans.find()`
- [ ] If bean deleted elsewhere while sheet is open, close the sheet (no phantom fallback)
- [ ] Add `uid` to `ArchiveTab`'s destructured props (line 344, currently ignored despite being passed by App.jsx)

### R4: Search Placeholder
- [ ] Add `minWidth: 0` to the search pill wrapper `<div>` at ArchiveTab.jsx line 688 (the flex parent, not the input which already has it at line 709)
- [ ] Shorten placeholder from `"Search beans, roasters, notes..."` to `"Search beans, roasters..."` for safety on iPhone SE
- [ ] Verify placeholder is fully visible on iPhone SE (320px) through 16 Pro Max

### Bonus: Existing Bug Fixes
- [ ] Memoize `totalCups` in ArchiveTab (line 461): wrap in `useMemo` with a `Set` for O(T+F) instead of current O(T*F) nested scan
- [ ] Guard `handleUseOriginal` in EditBeanModal against `photoInFlight.current` (prevents race between original upload and product shot generation)

## Implementation

All four requirements are independent and small (estimated ~80 lines total). Ship in a single pass, single commit.

### Files Touched

**`src/components/SwipeDownHandle.jsx`** (new):
- Extracted + rewritten SwipeDownHandle with refs + rAF

**`src/tabs/TastingTab.jsx`**:
- Remove inline SwipeDownHandle (lines 32-63)
- Import from shared component
- Grep for phantom refs after extraction

**`src/components/ArchiveDetailSheet.jsx`**:
- Import `SwipeDownHandle`, replace visual-only handle (lines 187-189)
- Add `closingRef` guard to `close()` function
- Add `onEditPhoto` callback prop
- Add tappable wrapper + icon overlay on BeanThumb in hero section
- Wire photo tap to `onEditPhoto(bean)`

**`src/tabs/ArchiveTab.jsx`**:
- Add `uid` to destructured props (line 344)
- Change `openBean` state to `openBeanId` + derived `openBean` via `useMemo`
- Add `useEffect` to close sheet if bean deleted externally
- Add `editBean` state for photo editing flow
- Handle `onEditPhoto`: close sheet, set `editBean`
- Render `EditBeanModalLazy` when `editBean` is set
- Lazy import at module scope
- Add `minWidth: 0` to search pill wrapper (line 688)
- Shorten search placeholder (line 699)
- Add expand/collapse to TimelineRow: restructure to `div role="button"`, add toggle, expanded section
- Memoize `totalCups` (line 461)

**`src/components/EditBeanModal.jsx`** (bonus fix):
- Guard `handleUseOriginal` against `photoInFlight.current`

## Dependencies & Risks

- **EditBeanModal coupling**: EditBeanModal expects specific props and manages its own complex state. Opening it for an archived (FINISHED) bean might surface conditional UI differences. Verify the edit modal looks right for archived beans (e.g., no "finish" button, status display makes sense).
- **SwipeDownHandle color normalization**: Existing handles use `C.cardMuted`, `C.borderLight`, and hardcoded `#D9CBB8`. The extracted component should accept a `color` prop or standardize on one theme token.
- **Performance at scale**: Per-row `useState` and `beans.find()` are both fine at current data volumes (19-100 beans). If archive grows past 500 beans, consider virtualization for the timeline list.

## Sources & References

- **Origin document:** [docs/brainstorms/2026-04-19-archive-detail-ux-requirements.md](docs/brainstorms/2026-04-19-archive-detail-ux-requirements.md) -- four requirements (R1-R4), key decisions: both inline expand AND detail sheet fixes, reuse existing photo pipeline, handle-only swipe
- **SwipeDownHandle reference**: `src/tabs/TastingTab.jsx:32-63`
- **rAF gesture reference**: `src/components/onboarding/screens/R05Tinder.jsx:148-279`
- **BeanCard expand reference**: `src/components/BeanCard.jsx:256-309`
- **Photo pipeline reference**: `src/components/EditBeanModal.jsx:179-284` + `src/lib/storage.js:14-54`
- **Modal z-index**: `src/components/Modal.jsx:70`
- **ArchiveTab props from App.jsx**: `src/App.jsx:271`
- **Learnings applied**: `react-lazy-inside-render-destroys-state.md` (R3), `closure-rename-missed-body-references.md` (R1), `share-card-capture-retry-null-safety.md` (R1), `async-side-effect-during-react-render.md` (R3)

### Review Agent Findings Applied
- **Frontend races**: closingRef guard, changedTouches in onTouchEnd, handleUseOriginal photoInFlight guard, no phantom fallback on liveBean
- **Performance**: refs + rAF for gesture, dynamic import for EditBeanModal, maxHeight 180px not 300px, memoize totalCups
- **Architecture**: prop threading is fine (4 levels acceptable), no generic zIndex prop on Modal, beans.find() derivation is sound
- **Simplicity**: close-and-reopen eliminates 3 complexity items (z-index override, liveBean derivation for stacking, extra prop threading), single commit not phased
- **Pattern recognition**: SwipeDownHandle extraction aligns (3 existing visual handles), expand duplication is idiomatic (2 consumers), openBean snapshot is the codebase outlier
- **Learnings**: React.lazy at module scope, grep phantom refs after extraction, optional chaining on callbacks
