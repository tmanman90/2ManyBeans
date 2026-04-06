---
title: "fix: Six iOS UI bugs round 2 (chat placeholder, archive images, keyboard, settings alignment, inventory sticky header)"
type: fix
status: active
date: 2026-04-06
supersedes: docs/plans/2026-04-05-010-fix-five-ui-bugs-plan.md
deepened: 2026-04-06
---

# fix: Six iOS UI Bugs (Round 2)

Yesterday's plan (010) was created but never implemented. This plan supersedes it with deeper root-cause analysis and research-grounded fixes.

## Enhancement Summary

**Deepened on:** 2026-04-06
**Research agents used:** best-practices-researcher, framework-docs-researcher, architecture-strategist, performance-oracle, julik-frontend-races-reviewer, code-simplicity-reviewer, pattern-recognition-specialist, learnings-researcher

### Key Improvements from Research
1. **Simplified approach**: Dropped BeanImage component extraction and useKeyboardAware hook. Both were premature abstractions for a bug fix batch. Inline fixes only.
2. **Sticky header strategy changed**: `position: sticky` inside `overflow: auto` is unreliable in WKWebView. Use flex column sibling pattern instead (header above scroll container).
3. **Keyboard scroll race conditions identified**: Don't scroll on focus. Use `scrollIntoView` gated on `keyboardDidShow` or a reliable timeout with `block: 'nearest'` (not `center`).
4. **Shimmer flash for cached images**: Pre-check `img.complete` to skip shimmer on cached images.
5. **Bonus bug found**: TastingTab chat input (line 276) has zero keyboard handling.

### Simplicity Principle Applied
Per CLAUDE.md: "Make every change as simple as possible. Touch minimal code." and "Three similar lines of code is better than a premature abstraction." All fixes are inline, no new files, no new abstractions.

---

## Overview

Six UI polish bugs affecting iOS and web:
1. Chat tab placeholder text cut off
2. Archive tab bean images look worse than inventory
3. Keyboard covers low-screen inputs (app-wide)
4. Settings select/value alignment inconsistent
5. Inventory tab header should be sticky (search + add bean always visible)
6. Settings row audit for any other misalignment

---

## Phase 1: Quick CSS Wins (Bugs 1, 4, 6)

### Bug 1: Chat Placeholder Text Cut Off

**File:** `src/tabs/ChatTab.jsx` (lines ~449-459)

**Root cause:** The input has `flex: 1` but no `minWidth: 0`. In flexbox, items have `min-width: auto` by default, which resolves to `min-content` size. The flex algorithm refuses to shrink items below their content width. The container loses ~144px to fixed buttons (44px each) + padding + gaps, leaving ~176px on iPhone SE. The placeholder text overflows rather than truncating.

**Current placeholder:** `'Ask about your brew...'` (without photos) / `'Add a note or just send...'` (with photos).

> Note: The user sees "Ask professor ruphus about..." which is NOT in the current code. This may be a different persona mode placeholder or an older version. Scope this fix to the current placeholders only, but add `minWidth: 0` so ANY future placeholder gracefully truncates.

**Fix:**
```jsx
// In the input style object, add:
minWidth: 0,
```

### Research Insights (Bug 1)

**Why `minWidth: 0` works:** CSS Flexbox Level 1 spec, section 4.5: "automatic minimum size" for flex items on the main axis is `min-content`. Setting `minWidth: 0` overrides this, allowing the flex algorithm to shrink the item below its content width. Input placeholders will then truncate naturally (WebKit/Safari truncates placeholder text natively when the input is narrower than the text).

**Do NOT add `text-overflow: ellipsis` to the input element.** On `<input>` elements, `text-overflow` only applies to the typed value, not placeholder text. WebKit handles placeholder truncation natively. Adding `overflow: hidden` + `whiteSpace: nowrap` to an input is unnecessary and can interfere with text selection.

**Also check:** The ChatTab input is missing `boxSizing: 'border-box'` (unlike all other inputs in the app which include it via `inputStyle`). Add it to prevent width overflow from padding.

**References:**
- [Understanding automatic minimum size of flex items](https://www.bigbinary.com/blog/understanding-the-automatic-minimum-size-of-flex-items)
- [Using flexbox and text ellipsis together](https://leonardofaria.net/2020/07/18/using-flexbox-and-text-ellipsis-together)

---

### Bug 4: Settings Select Alignment

**File:** `src/components/SettingsPage.jsx` (lines ~74-89)

**Root cause:** `<select>` elements with `appearance: none` auto-size to their content. "Fellow Ode Gen 2" is much wider than "Microns" or "Aiden Brew". The ChevronRight icon after each select creates visual dancing. No consistent width on the value side.

**Fix:**
```jsx
// Update selectStyle to constrain width:
const selectStyle = {
  appearance: 'none',
  WebkitAppearance: 'none',
  background: 'transparent',
  border: 'none',
  color: 'inherit',
  fontSize: 'inherit',
  fontFamily: 'inherit',
  textAlign: 'right',
  paddingRight: 0,
  paddingLeft: 8,       // Space from label
  cursor: 'pointer',
  maxWidth: '55%',      // Prevent long values from pushing labels off-screen
};

// Update rowValueStyle to prevent compression:
const rowValueStyle = {
  color: C.textMuted,
  fontSize: 16,
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  flexShrink: 0,        // Don't let values compress
};
```

### Research Insights (Bug 4)

**Pattern recognition finding:** The select+ChevronRight pattern is used consistently across all 4 equipment rows. The pattern is intentionally different from form selects (which use native dropdown arrows). This iOS grouped-table aesthetic is correct, the alignment is the only issue.

**Tap target concern:** The ChevronRight icon sits outside the `<select>` element's clickable area. Users tapping the chevron miss the select. Consider wrapping the select+chevron in a `<label>` or making the entire row clickable.

**Edge case:** On iPhone SE (320pt), `maxWidth: 55%` gives ~176px for values. "Fellow Ode Gen 2" is ~150px at 16px font, so it fits. "Timemore C3 ESP MAX" would be ~170px, borderline. If this becomes an issue, switch to `maxWidth: 60%` or use `text-overflow: ellipsis` on the select.

---

### Bug 6: Settings Row Audit

**File:** `src/components/SettingsPage.jsx`

**Scope:** After fixing Bug 4's select alignment, visually audit all settings rows:
- Equipment: Grinder, Brew Method, Grind Size Display, Coffee Jars
- Fellow Aiden section (connect/disconnect toggle)
- Profile section (username row)

**Pattern recognition finding:** All equipment rows use the exact same `rowStyle` + `rowValueStyle` + `selectStyle` pattern. No outliers within SettingsPage. The username row also uses `rowStyle`. The Fellow section uses a different layout (connect button vs select) but follows the same `rowStyle` container.

**Completion criteria:** All right-side values in Settings are visually right-aligned at the same x-position, with ChevronRight icons forming a clean vertical column.

---

## Phase 2: Archive Image Polish (Bug 2)

### Bug 2: Archive Tab Bean Images Cut Off

**File:** `src/tabs/ArchiveTab.jsx` (lines ~39-48)
**Reference:** `src/components/BeanCard.jsx` (lines ~31-73)

**Root cause:** ArchiveTab builds its own image markup instead of using BeanCard's polished image treatment. Missing: gradient edge overlays, shimmer loading state, proper wrapper div with overflow hidden.

**Approach (simplified):** Inline the BeanCard image treatment directly into ArchiveTab. Do NOT extract a shared BeanImage component. Two consumers doesn't justify a new abstraction per CLAUDE.md: "Three similar lines of code is better than a premature abstraction."

**Changes to `src/tabs/ArchiveTab.jsx`:**
1. Wrap the `<img>` in a container div with `position: relative; overflow: hidden; height: 160`
2. Add `imgLoaded` state with pre-check for cached images (see research insight)
3. Add the 3 gradient overlay divs (left, right, bottom) from BeanCard
4. Add opacity transition on image load

```jsx
// Pre-check for cached images to avoid shimmer flash
const [imgLoaded, setImgLoaded] = useState(() => {
  if (!bean.photoUrl) return false;
  const img = new Image();
  img.src = bean.photoUrl;
  return img.complete; // true if browser-cached
});
```

### Research Insights (Bug 2)

**Shimmer flash race condition (from races reviewer):** When the image is browser-cached, `onLoad` fires synchronously during the same microtask as `<img>` mount, but `setImgLoaded(true)` batches. Result: shimmer shows for one frame (16ms), then a 300ms fade-in of an already-available image. That's 316ms of ceremony for an instant load.

**Fix:** Pre-check `img.complete` in the initial state. Cached images skip shimmer entirely. Also reduce fade duration from 300ms to ~50ms for uncached images (one-frame transition is sufficient to avoid hard pop-in).

**Performance note:** At 50+ archive cards with `loading="lazy"`, image decode is the bottleneck, not DOM nodes. The shimmer animation should use `transform: translateX()` on a pseudo-element instead of animating `background-position` (compositor thread vs CPU repaint). However, this is a pre-existing BeanCard issue and can be fixed separately.

**Also found:** `EditBeanModal.jsx` (line 166) uses `objectFit: 'cover'` while BeanCard and ArchiveTab use `contain`. Same photo looks different in edit mode vs card view. Not in scope but worth noting.

---

## Phase 3: Keyboard Handling (Bug 3)

### Bug 3: Keyboard Covers Low-Screen Inputs

**Files affected:**
- `src/tabs/ChatTab.jsx` (already has Keyboard plugin handling, lines 72-98)
- `src/components/TastingForm.jsx` (has partial `scrollIntoView` workaround, lines 70-73)
- `src/components/SettingsPage.jsx` (NO keyboard handling)
- `src/tabs/TastingTab.jsx` (line 276 chat input, NO keyboard handling -- bonus bug found by pattern scanner)

**Root cause:** No app-wide keyboard management. ChatTab built its own. TastingForm has a fragile 300ms setTimeout scrollIntoView. SettingsPage and TastingTab have nothing.

**Approach (simplified):** Do NOT create a `useKeyboardAware` hook. That's a refactor disguised as a bug fix. Instead:

1. **TastingForm + TastingTab:** Improve the existing `scrollIntoView` pattern
2. **SettingsPage:** Add `scrollIntoView` to the few inputs that need it
3. **ChatTab:** Leave as-is (already works), but fix the listener cleanup bug

### Specific fixes:

**TastingForm.jsx** (and any other form inputs):
```jsx
// Replace the fragile 300ms timeout + block:'center' with:
onFocus={e => {
  const target = e.target;
  // 350ms covers iOS keyboard animation (~250ms + buffer)
  // block:'nearest' only scrolls if element is not already visible
  setTimeout(() => {
    target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 350);
}}
```

**SettingsPage.jsx** -- Add same `onFocus` handler to:
- Fellow email input (line ~571)
- Fellow password input (line ~583)
- Custom grinder name input (line ~468)
- Username input (line ~414, likely fine since it's near top, but check)

**TastingTab.jsx** -- Add `onFocus` handler to the chat input (line ~276)

**ChatTab.jsx** -- Fix pre-existing listener cleanup bug:
```jsx
// Current code can leak listeners if component unmounts before
// the dynamic import('@capacitor/keyboard') resolves.
// Add a 'canceled' flag:
useEffect(() => {
  if (!Capacitor.isNativePlatform()) return;
  let canceled = false;
  let cleanup;
  import('@capacitor/keyboard').then(({ Keyboard }) => {
    if (canceled) return; // Component already unmounted
    // ... existing listener setup ...
  });
  return () => {
    canceled = true;
    if (cleanup) cleanup();
  };
}, []);
```

### Research Insights (Bug 3)

**Critical race conditions identified by frontend races reviewer:**

1. **Race: Focus fires before keyboard is ready.** Browser fires `focus` synchronously. Capacitor's `keyboardWillShow` fires asynchronously after the native layer begins the keyboard animation. If you scroll on focus, `keyboardHeight` is still 0 and the scroll target is wrong. The `setTimeout(350)` approach sidesteps this by waiting for the keyboard to be mostly open before scrolling.

2. **Race: Rapid input switching.** User taps input A, then immediately taps input B. Two `scrollIntoView` calls race, causing viewport yo-yo. Mitigation: `block: 'nearest'` (not `center`) minimizes unnecessary scrolling. If the second input is already visible, `nearest` is a no-op.

3. **Race: Keyboard dismissal during scroll animation.** User opens keyboard, smooth scroll starts, user taps "Done". Don't try to counter-scroll. Let the browser's native reflow handle it.

4. **SettingsPage modal specifics:** SettingsPage is `position: fixed` with its own scroll container. `scrollIntoView` inside a modal scrolls the modal's scroll container, which is correct. Do NOT add keyboard-height padding to the modal (that causes double-shift since the viewport already adjusts via `resize: 'body'` in capacitor.config).

**`block: 'nearest'` vs `block: 'center'`:** Use `nearest`. It only scrolls if the element is not already visible, avoiding unnecessary jumps. `center` can overshoot on short scrollable areas, causing rubber-band bounce.

**iOS design skill confirms:** "Input fields MUST be 16px+ font-size or iOS will zoom the viewport on focus." All current inputs use 16px, so this is fine.

**Pre-existing bug found:** ChatTab's keyboard listener setup (lines 72-98) uses dynamic `import()` with `.then()`. If the component unmounts before the import resolves, listeners leak. Add a `canceled` flag guard.

**References:**
- [Capacitor Keyboard Plugin API](https://capacitorjs.com/docs/apis/keyboard) -- `keyboardWillShow` payload: `{ keyboardHeight: number }` in CSS pixels
- `.claude/rules/ios-layout.md` -- "`position: fixed; bottom: 0` is unreliable with iOS keyboards"

---

## Phase 4: Inventory Sticky Header (Bug 5)

### Bug 5: Inventory Header Not Sticking

**File:** `src/tabs/InventoryTab.jsx` (lines ~82-115)
**Parent:** `src/App.jsx` (line ~122, scroll container)

**Current state:** The sticky header code already exists (`position: sticky, top: 0, zIndex: 10`). The parent content div uses `flex: 1; overflowY: auto` which creates a scroll container.

### Research Insights (Bug 5) -- STRATEGY CHANGED

**Best practices research found that `position: sticky` inside `overflow: auto` is unreliable in Safari/WKWebView.** Known issues:
- Safari has longstanding bugs where it fails to recalculate sticky offset during certain scroll events in flex containers
- `flex: 1` makes the containing block height flex-derived, which Safari sometimes miscalculates
- iOS 26 beta introduced a regression where fixed elements move during scroll direction changes (WebKit bug 297779)

**Recommended approach: Flex column sibling pattern.** Instead of making the header sticky inside the scroll container, lift it above the scroll container as a sibling:

```
Before (current, unreliable):
<div style="overflow-y: auto">     ← scroll container
  <div style="position: sticky">  ← tries to stick inside scroll
    Header / Search / Add Bean
  </div>
  <div>Bean cards...</div>
</div>

After (reliable):
<div style="display: flex; flex-direction: column; height: 100%">
  <div style="flex-shrink: 0">    ← always visible, not in scroll flow
    Header / Search / Add Bean
  </div>
  <div style="flex: 1; overflow-y: auto">  ← only cards scroll
    <div>Bean cards...</div>
  </div>
</div>
```

**Implementation:** This requires changes to how InventoryTab renders its content. The tab currently returns a single `<div>` with the header and cards as siblings inside the App.jsx scroll container. The fix needs to either:

**Option A (preferred, minimal):** Move the header outside the scroll container within InventoryTab itself. InventoryTab returns a flex column with the header as a non-scrolling sibling.

**Option B (more invasive):** Change App.jsx's content area to not be the scroll container when InventoryTab is active, letting InventoryTab manage its own scroll.

Go with Option A. The negative margin hack (`marginLeft: -20, marginRight: -20`) should be removed in favor of the parent removing its horizontal padding for the sticky section, or using `width: calc(100% + 40px)`.

**Conditional search bar edge case (from races reviewer):** The search bar only renders when `sealed.length > 5`. If a Firestore real-time update changes bean count from 6 to 5 during scroll, the header height changes by ~40px, causing a jarring content jump. Consider always showing the search bar regardless of count. A search bar on 5 items doesn't hurt.

**Verify first:** Before implementing, build on iOS simulator and confirm the current sticky behavior is actually broken. If it works, just clean up the negative margin hack.

**References:**
- [CSS position: sticky failures in Safari](https://www.designcise.com/web/tutorial/how-to-fix-issues-with-css-position-sticky-not-working)
- [overflow: clip vs overflow: hidden for sticky](https://www.terluinwebdesign.nl/en/blog/position-sticky-not-working-try-overflow-clip-not-overflow-hidden/)
- [WebKit Bug 297779](https://bugs.webkit.org/show_bug.cgi?id=297779)

---

## Implementation Order

1. **Phase 1** (Bugs 1, 4, 6) -- CSS-only fixes, lowest risk, ship first
2. **Phase 2** (Bug 2) -- Inline image polish in ArchiveTab, moderate change
3. **Phase 3** (Bug 3) -- Add scrollIntoView to affected inputs, fix ChatTab cleanup bug
4. **Phase 4** (Bug 5) -- Verify on device first, then implement flex column sibling pattern if needed

Each phase can be committed independently.

## Acceptance Criteria

- [ ] Chat placeholder fully visible on iPhone SE width (320pt)
- [ ] Chat input has `boxSizing: 'border-box'`
- [ ] Archive images show full bean bag with soft gradient edges (matching inventory style)
- [ ] Cached archive images skip shimmer, load instantly
- [ ] Keyboard doesn't cover focused inputs in TastingForm, SettingsPage, or TastingTab
- [ ] ChatTab keyboard listener cleanup handles early unmount (no listener leak)
- [ ] All Settings select values right-aligned consistently (Fellow Ode Gen 2, Microns, Aiden Brew all line up)
- [ ] ChevronRight icons in Settings form a clean vertical column
- [ ] Inventory header (title + Add Bean + search bar) stays visible while scrolling sealed beans
- [ ] No regressions on iPhone SE through iPhone 15 Pro Max widths
- [ ] No regressions in web PWA mode

## Open Questions

1. **"Ask professor ruphus about..." placeholder** -- not found in current code. Is this from a persona mode or older version? Defaulting to fix current placeholders only.
2. **Inventory sticky header** -- needs device verification before coding. The flex column approach is ready if sticky is confirmed broken.
3. **Search bar conditional rendering** -- should we always show it regardless of bean count to prevent height jumps?

## Key Files

| File | Bugs | Changes |
|------|------|---------|
| `src/tabs/ChatTab.jsx` | 1, 3 | Add `minWidth: 0` + `boxSizing` to input; fix listener cleanup |
| `src/tabs/ArchiveTab.jsx` | 2 | Inline gradient overlays + shimmer + cached image check |
| `src/tabs/InventoryTab.jsx` | 5 | Flex column sibling pattern (if sticky confirmed broken) |
| `src/tabs/TastingTab.jsx` | 3 | Add scrollIntoView to chat input (bonus bug) |
| `src/components/SettingsPage.jsx` | 3, 4, 6 | Fix select alignment; add scrollIntoView to low inputs |
| `src/components/TastingForm.jsx` | 3 | Improve scrollIntoView (block: nearest, 350ms) |
| `src/App.jsx` | 5 | May need scroll container adjustment for InventoryTab |

**No new files created.** All fixes are inline.

## Sources

- **Supersedes:** [docs/plans/2026-04-05-010-fix-five-ui-bugs-plan.md](../plans/2026-04-05-010-fix-five-ui-bugs-plan.md)
- iOS layout rules: `.claude/rules/ios-layout.md`
- BeanCard icon sizing lesson: `lessons.md` line 39 (never add minWidth to icon buttons)
- [Capacitor Keyboard Plugin API](https://capacitorjs.com/docs/apis/keyboard)
- [CSS position: sticky failures](https://www.designcise.com/web/tutorial/how-to-fix-issues-with-css-position-sticky-not-working)
- [Flexbox min-width: 0 explained](https://www.bigbinary.com/blog/understanding-the-automatic-minimum-size-of-flex-items)
- [WebKit Bug 297779](https://bugs.webkit.org/show_bug.cgi?id=297779)
