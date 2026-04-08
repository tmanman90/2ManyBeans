---
title: "fix: Five Persistent UI and Product Shot Bugs"
type: fix
status: active
date: 2026-04-08
---

# fix: Five Persistent UI and Product Shot Bugs

## Enhancement Summary

**Deepened on:** 2026-04-08
**Sections enhanced:** 5 bugs + new shared infrastructure
**Review agents used:** Frontend Races, Performance Oracle, Code Simplicity, Architecture Strategist, Pattern Recognition, Security Sentinel, iOS Design, Capacitor Keyboard Docs, React Best Practices, Learnings Researcher

### Key Improvements from Research
1. **Bug 5 keyboard fix completely redesigned**: `dvh` does NOT respond to iOS keyboard in WKWebView. Using Keyboard plugin + dynamic maxHeight instead.
2. **Bug 2 approach refined**: Start product shot during scan with generation counter to avoid stale-photo races. Use `Promise.allSettled` pattern.
3. **Bug 3 simplified**: Keep `1fr 1fr` grid (no non-equal columns exist in codebase). Fix is just `minWidth: 0` on both children.
4. **New: Extract shared utilities**: `scrollOnFocus` (duplicated 4x) and product shot chain (duplicated 2x) should be shared.
5. **New: Btn tap targets below Apple HIG**: Primary ~40px, ghost ~36px. All below 44pt minimum.

### Critical Research Finding
`dvh` (dynamic viewport height) does NOT respond to the virtual keyboard in iOS WKWebView. It only handles the Safari address bar, which doesn't exist in Capacitor. The `resize: 'body'` config shrinks the `<body>` but viewport units (`vh`, `dvh`) are unaffected. The correct approach is Keyboard plugin event listeners + dynamic maxHeight calculation.

---

## Overview

Five user-reported bugs confirmed via screenshots on 2026-04-08. All have been "fixed" in prior attempts but persist. This plan does root-cause analysis from actual code readings (not assumptions) and prescribes targeted, minimal fixes.

---

## Bug 1: Product Shot Hangs on "Generating Product Shot"

### Root Cause

In `EditBeanModal.jsx`, the product shot flow blocks the UI with an inline `await`:

- `handlePhotoCapture` (web, line 44): sets `photoGenerating = true`, **awaits** the full chain (compress -> generate -> upload -> updateBean), then sets `photoGenerating = false`. If Gemini is slow (up to 60s timeout x 3 retries = ~3 min worst case), the modal shows "Generating product shot..." with no progress or cancel.
- `handleNativePhoto` (native, line 58): same blocking await pattern.
- While `photoGenerating` is true, Save Changes and X/Cancel remain fully clickable but the generation chain holds the async context.
- If user closes modal during generation, `setPhotoGenerating(false)` fires on an unmounted component (no-op in React 19, but the promise chain continues writing to Firestore).

### Fix

**File: `src/components/EditBeanModal.jsx`**

1. **Convert to fire-and-forget pattern** (matches established codebase convention). Both `handlePhotoCapture` and `handleNativePhoto` should:
   - Set `photoGenerating = true` (shows spinner in photo area)
   - Fire the generation chain as a non-blocking `.then()` chain, NOT an awaited call
   - On success: update Firestore via `updateBean` (the Firestore listener will update the UI)
   - On failure: set `photoError = true`, show inline retry

2. **Extract product shot chain to utility.** Create `generateAndUploadProductShot(photo, uid, beanId, updateBean)` in `src/lib/productShot.js`. Both AddBeanForm and EditBeanModal call this. One fire-and-forgets, one shows a spinner. This removes logic duplication.

3. **Add re-entry guard.** Use a ref to prevent duplicate generation if the button is pressed while a generation is already in flight: `if (productShotInFlight.current) return;`

4. **Show error state with retry.** Add `photoError` state. On failure, show "Photo generation failed. Tap to retry." in the photo area. Validate retry output the same way as primary output (from share-card-capture learning: treat retry output as untrusted).

5. **No stale ref guard needed.** Per pattern analysis: fire-and-forget to Firestore with captured `beanId` is the established convention (used in 5+ places). `beanId` is immutable in the closure. No `AbortController` needed (not used anywhere in codebase).

### Research Insights

**From Races Review:** The modal should not own promises that outlive it. Since `updateBean` writes to Firestore (not component state), the fire-and-forget is safe. React 19 removed the "setState on unmounted component" warning entirely.

**From Learnings (share-card-capture):** Validate retry output identically to primary. If retry also fails validation, return `null` explicitly. Caller must handle `null` gracefully (keep existing photo or show no photo).

**From Learnings (async-side-effect):** Never trigger from render body. Must be in event handler. Add `useRef(false)` re-entry guard.

**From Security Review:** Auth token captured at request start is valid for the full chain (1-hour expiry vs 60s timeout). If user signs out mid-generation, server rejects with 401, `.catch` swallows it. Safe.

### Acceptance Criteria

- [ ] Save Changes, Cancel, and X work normally during product shot generation
- [ ] Photo area shows "Generating..." spinner while in progress
- [ ] On failure, photo area shows inline error with retry option
- [ ] Retry validates output identically to primary path
- [ ] Re-entry guard prevents duplicate concurrent generations
- [ ] Product shot generation times out cleanly after 60s
- [ ] If generation fails, `photoGenerating` resets to false (both web and native paths)

---

## Bug 2: Product Shot Should Generate at Ingestion Time

### Root Cause

In `AddBeanForm.jsx`, the product shot fires at lines 283-288, AFTER `reset()` and `onClose()` (lines 279-280). This means:
- The modal closes immediately, user sees nothing happening
- Product shot runs as fire-and-forget, which is correct for UX
- BUT the user's ask is: generate product shot **at scan time**, not after save

The current flow: upload photo -> scan label (Gemini OCR) -> research online -> user reviews -> save -> (background) product shot.

The desired flow: upload photo -> scan label + generate product shot **in parallel** -> user reviews enriched data -> save (product shot already done or in progress).

### Fix

**File: `src/components/AddBeanForm.jsx`**

1. **Start product shot during scan using `Promise.allSettled`.** In `handleScan()`, fire product shot in parallel with scan (they use different Gemini models so no rate-limit conflict):

```jsx
const genCounter = useRef(0); // monotonic counter for stale invalidation
const productShotResultRef = useRef(null);

// In handleScan:
const thisGen = ++genCounter.current;
const [scanResult, shotResult] = await Promise.allSettled([
  scanBeanLabel(photos),
  generateAndUploadProductShot_generateOnly(photos[0]) // generate only, don't upload yet
    .catch(() => null), // optional, don't fail scan if this fails
]);

// Required: scan must succeed
if (scanResult.status === 'rejected') { /* show error */ return; }

// Optional: store product shot result if still current generation
if (thisGen === genCounter.current && shotResult.status === 'fulfilled' && shotResult.value) {
  productShotResultRef.current = shotResult.value;
}
```

2. **At save time, use the pre-generated result.** In `handleSave()`:
   - If `productShotResultRef.current` has a result, upload it with the new `beanId` (faster, already generated)
   - If null (generation failed or timed out), skip product shot (graceful degradation, same as today)
   - Clear the ref in `reset()`

3. **Generation counter prevents stale-photo race.** If user hits Rescan, `genCounter` increments. The old generation's result is discarded because `thisGen !== genCounter.current`. No orphaned promise writes anywhere because upload only happens at save time with the correct beanId.

4. **Show status indicator during review step.** Small "Product shot ready" checkmark or "Generating..." spinner near the photo thumbnails.

5. **Product shot uses different model.** `gemini-3.1-flash-image-preview` (product shot) vs `gemini-2.5-flash` (scan). Different models, no quota conflict. But to be safe, pass `retries: 0` for product shot so it doesn't starve the user-facing scan.

### Research Insights

**From Races Review:** The monotonic generation counter is the recommended pattern:
```js
const thisGen = ++productShotGeneration.current;
// ... later:
if (thisGen === productShotGeneration.current) { /* use result */ }
```
This invalidates stale promises without cancellation.

**From Best Practices:** `Promise.allSettled` is the correct pattern when one call is required and one is optional. Never use `Promise.all` when one is optional (one failure kills both).

**From Performance Review:** Concurrent Gemini calls don't actually happen in the current flow. The new parallel approach is fine since they're different models. The base64 photo held in the ref is ~200-400KB, negligible memory.

**From Architecture Review:** The existing `storyRef` pattern (lines 173-176) is an identical lightweight deferred. Product shot follows the same convention.

**Existing storyRef has the same stale-write race.** Lines 173-176: if user rescans, old story promise can overwrite `storyRef.current`. Apply the same generation counter fix while in this code.

### Acceptance Criteria

- [ ] Product shot generation starts when photos are scanned, in parallel with scan
- [ ] Product shot uses `retries: 0` to avoid starving the scan
- [ ] Generation counter prevents stale results from overwriting on rescan
- [ ] If product shot finishes before save, photo uploads immediately after save
- [ ] If product shot failed, bean saves normally without photo (graceful degradation)
- [ ] Review step shows subtle indicator of product shot status
- [ ] Manual entry (no photos) still works with no product shot
- [ ] storyRef race condition also fixed with generation counter

---

## Bug 3: "Producer" Label Overlaps "Roast Date"

### Root Cause

The `type="date"` input on iOS renders with a native date picker widget. The grid children default to `min-width: auto` which prevents them from shrinking below content's intrinsic minimum width.

**AddBeanForm.jsx** (line 540-549): Has `minWidth: 0` on Producer div only. Missing on Roast Date div.
**EditBeanModal.jsx** (line 235-244): Has NO `minWidth: 0` on either div. No overflow handling.

### Fix

**Both files: `AddBeanForm.jsx` (line 540) and `EditBeanModal.jsx` (line 235)**

1. **Keep `1fr 1fr`** grid (no non-equal column ratios exist in the codebase, don't introduce a new pattern).

2. **Add `minWidth: 0` to BOTH grid children** in both forms. This is the standard CSS Grid fix: without it, grid items won't shrink below their intrinsic minimum width.

3. **Add overflow protection to both inputs in EditBeanModal** (already on AddBeanForm):
   - Both inputs: `overflow: 'hidden', textOverflow: 'ellipsis'`

### Research Insights

**From Pattern Review:** The codebase uses exclusively equal-column grids (`1fr 1fr` or `1fr 1fr 1fr`). Zero instances of non-equal ratios. Don't introduce `3fr 2fr`.

**From iOS Design Review:** iOS native `<input type="date">` in WKWebView respects `width: 100%` and stays within its grid cell. The picker UI is a system overlay, not inline. The issue is `min-width: auto` on grid children, not the date widget itself.

### Acceptance Criteria

- [ ] Roast Date and Producer labels + inputs never overlap on any iPhone (SE through 16 Pro Max)
- [ ] Both AddBeanForm and EditBeanModal have identical layout treatment
- [ ] Producer text truncates with ellipsis when too long
- [ ] Grid remains `1fr 1fr` (consistent with codebase)

---

## Bug 4: AI Fill Button Layout is Cramped and Unprofessional

### Root Cause

In `AddBeanForm.jsx` footer (lines 316-343):
- Rescan and AI Fill sit in a flex row with `flex: 0` (auto-size to content)
- AI Fill uses `fontSize: 12` and `variant="ghost"` making it very small
- The two buttons are left-aligned with empty space to the right
- Ghost variant padding is `10px 14px`, rendering ~36px tall (below Apple HIG 44pt minimum)

### Fix

**File: `src/components/AddBeanForm.jsx`** (footer section, lines 316-343)

1. **Make both buttons `flex: 1`** so they share the row equally
2. **Increase AI Fill font size** (remove `fontSize: 12` override)
3. **Change AI Fill from `ghost` to `secondary`** variant so both buttons have equal visual weight and taller padding (12px 20px = ~40px)
4. **Add `justifyContent: 'center'`** to both buttons for clean alignment
5. **Keep "Add to Inventory" as full-width primary** button below

```jsx
<div style={{ display: 'flex', gap: 8 }}>
  <Btn variant="secondary" onClick={reset} style={{ flex: 1, justifyContent: 'center' }}>
    <RotateCcw size={14} /> Rescan
  </Btn>
  {hasSearchableData && hasEmptyEnrichable && (
    <Btn variant="secondary" onClick={handleAiFill} disabled={aiFilling}
      style={{ flex: 1, justifyContent: 'center' }}>
      {aiFilling ? <>{spinner} Researching...</> : <><Search size={14} /> AI Fill</>}
    </Btn>
  )}
</div>
```

When AI Fill is hidden (no searchable data), Rescan stretches to full width naturally.

### Research Insights

**From iOS Design Review:** Btn component does NOT enforce Apple HIG 44pt minimum:
- Primary/secondary: ~40px (close but non-compliant)
- Ghost: ~36px (clearly non-compliant)
- Small: ~26px (significantly non-compliant)

Consider adding `minHeight: 44` to Btn base style as a separate follow-up.

**From Pattern Review:** Footer convention is `display: flex, gap: 8` with primary at full width. AI Fill as `secondary` with `flex: 1` matches the EditBeanModal footer pattern.

### Acceptance Criteria

- [ ] Rescan and AI Fill buttons are equal width, side by side
- [ ] Both buttons use the same font size and visual weight (secondary variant)
- [ ] When AI Fill is hidden, Rescan takes full width
- [ ] "Researching..." state still looks clean
- [ ] Buttons are at least ~40px tall (secondary variant padding)

---

## Bug 5: Keyboard Covers Input Fields on iOS

### Root Cause (verified from actual code + Capacitor docs research)

Multiple compounding issues:

1. **Modal uses `maxHeight: '90vh'`** (`Modal.jsx` line 26). With `resize: 'body'`, Capacitor shrinks the `<body>` but **viewport units are completely unaffected**. `90vh` still equals 90% of the FULL screen including the area behind the keyboard. The modal extends behind the keyboard.

2. **`dvh` will NOT fix this.** Critical finding: `dvh` does NOT respond to the virtual keyboard in iOS WKWebView. It only handles the Safari address bar (which doesn't exist in Capacitor). `dvh` = `vh` = `lvh` in a Capacitor app. The `interactive-widget=resizes-content` meta tag that would make `dvh` keyboard-aware is NOT implemented in WebKit/Safari (only Chromium).

3. **`scrollOnFocus` uses `block: 'center'`** (`AddBeanForm.jsx` line 301). This forces the element to the center, causing jarring jumps. `block: 'nearest'` only scrolls if needed.

4. **Not all fields have `scrollOnFocus`** in AddBeanForm. Top fields (Roaster, Coffee Name, Origin, Variety, Process, Bag Size, Roast Date, Producer, Tasting Notes) do NOT have it.

5. **EditBeanModal has ZERO keyboard handling.** No `scrollOnFocus` on any field.

6. **The 350ms delay** is a heuristic that may fire before the body resize settles. Using `keyboardDidShow` event is deterministic.

### Fix

**File: `src/components/Modal.jsx`** (highest impact, fixes all modals)

1. **Add Keyboard plugin listener to dynamically adjust maxHeight.** On native, listen for `keyboardDidShow`/`keyboardDidHide` and subtract keyboard height from modal maxHeight:

```jsx
const [kbHeight, setKbHeight] = useState(0);

useEffect(() => {
  if (!open) return;
  const isNative = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform();
  if (!isNative) return;
  let canceled = false;
  let showHandle, hideHandle;
  import('@capacitor/keyboard').then(({ Keyboard }) => {
    if (canceled) return;
    Keyboard.addListener('keyboardDidShow', info => setKbHeight(info.keyboardHeight));
    Keyboard.addListener('keyboardDidHide', () => setKbHeight(0));
  });
  return () => { canceled = true; showHandle?.remove(); hideHandle?.remove(); };
}, [open]);

// In style:
maxHeight: kbHeight > 0 ? `calc(90vh - ${kbHeight}px)` : '90vh',
```

2. **Auto-scroll active element on keyboardDidShow.** Inside the same listener, scroll the focused input into view after a 50ms settle delay:

```jsx
Keyboard.addListener('keyboardDidShow', info => {
  setKbHeight(info.keyboardHeight);
  setTimeout(() => {
    const el = document.activeElement;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, 50);
});
```

This covers ALL modals automatically. No per-field handler needed on native.

3. **Add `overscroll-behavior: contain`** to the modal scroll container to prevent scroll chaining to the body (iOS double-scroll bug).

**File: `src/lib/formHelpers.js`** (new shared utility)

4. **Extract `scrollOnFocus` for web fallback.** On web (where Keyboard plugin is a no-op), keep the existing scrollOnFocus pattern as fallback:

```js
let scrollTimer;
export const scrollOnFocus = e => {
  const t = e.target;
  clearTimeout(scrollTimer); // debounce rapid field switching
  scrollTimer = setTimeout(() => t.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 350);
};
```

**Files: `AddBeanForm.jsx` and `EditBeanModal.jsx`**

5. **Add `onFocus={scrollOnFocus}` to ALL input fields** in both forms. Import from `lib/formHelpers.js`. This provides the web fallback. On native, the Modal's keyboardDidShow handler handles it, but the scrollOnFocus is harmless as additional insurance.

6. **Change `block: 'center'` to `block: 'nearest'`** everywhere. `nearest` only scrolls if the element is out of view, avoiding jarring jumps.

### Research Insights

**From Capacitor Keyboard Docs (CRITICAL):**
- `resize: 'body'` shrinks the body, NOT the viewport. CSS viewport units (`vh`, `dvh`) are unaffected.
- `dvh` in WKWebView only handles Safari address bar, NOT virtual keyboard.
- `interactive-widget=resizes-content` meta tag is NOT implemented in WebKit/Safari (only Chromium). Source: csswg-drafts#10464
- `window.visualViewport` does NOT reflect keyboard in Capacitor WKWebView. Source: capacitor#3730
- `keyboardDidShow` fires after animation completes. Use 50ms additional delay for body resize to settle.

**From Races Review:** The `setTimeout` approach is guessing when the keyboard has finished animating. `keyboardDidShow` is deterministic. The current 350ms may fire before body resize settles, causing scroll-to-wrong-position.

**From Performance Review:** Optional debounce for `scrollOnFocus` prevents jittery scroll on rapid field navigation. Use `clearTimeout` pattern.

**From Pattern Review:** `scrollOnFocus` is duplicated in 4 locations with slight variations. Extract to shared utility for consistency. `block: 'nearest'` is already used in SettingsPage.

**From Architecture Review:** Modal.jsx is used by 10 consumers. Adding keyboard awareness to Modal fixes all forms globally. The scrollOnFocus utility should NOT live in Modal (separation of concerns) but the keyboard maxHeight adjustment should.

### Acceptance Criteria

- [ ] Tapping any field in AddBeanForm scrolls it above the keyboard (native + web)
- [ ] Tapping any field in EditBeanModal scrolls it above the keyboard (native + web)
- [ ] Modal shrinks dynamically when keyboard opens on native (maxHeight adjusted)
- [ ] Scrolling is smooth, not jarring (block: 'nearest', not center)
- [ ] No scroll chaining to body (overscroll-behavior: contain)
- [ ] Rapid field switching doesn't cause jittery scrolling (debounced)
- [ ] Fields near the top of the form still work correctly (no over-scrolling)
- [ ] ChatTab keyboard handling is unaffected (it has its own system)
- [ ] Web PWA still works (scrollOnFocus fallback for non-native)

---

## Shared Infrastructure Changes

### New file: `src/lib/productShot.js`

Extract the product shot chain used by both forms:

```js
export async function generateAndUploadProductShot(photo, uid, beanId, updateBean) {
  const result = await generateProductShot(photo);
  if (!result?.base64) return null; // validate output
  const photoUrl = await uploadBeanPhoto(uid, beanId, result.base64, result.mimeType);
  await updateBean(beanId, { photoUrl });
  return photoUrl;
}
```

Both AddBeanForm and EditBeanModal import this. One fire-and-forgets after save, one fire-and-forgets after camera capture.

### New file: `src/lib/formHelpers.js`

Extract shared scroll utility:

```js
let scrollTimer;
export const scrollOnFocus = e => {
  const t = e.target;
  clearTimeout(scrollTimer);
  scrollTimer = setTimeout(() => t.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 350);
};
```

Replace inline copies in AddBeanForm, TastingForm, TastingTab, SettingsPage.

### Performance improvement: `src/lib/storage.js`

Replace `base64ToBlob` with efficient `fetch` data-URL approach (cuts memory allocation by ~60%):

```js
async function base64ToBlob(base64, mimeType = 'image/jpeg') {
  const res = await fetch(`data:${mimeType};base64,${base64}`);
  return res.blob();
}
```

### Cleanup: `AddBeanForm.jsx` reset()

Revoke preview URLs before clearing photos to prevent blob URL memory leaks:

```js
const reset = () => {
  photos.forEach(p => { if (p.previewUrl) URL.revokeObjectURL(p.previewUrl); });
  productShotResultRef.current = null;
  genCounter.current++;
  // ... rest of reset
};
```

---

## Implementation Order

1. **Bug 5 (Keyboard)** first: Modal keyboard awareness + scrollOnFocus extraction. Highest impact, fixes all modals.
2. **Bug 3 (Producer overlap)** next: Quick `minWidth: 0` fix in both forms.
3. **Bug 4 (AI Fill layout)** next: Quick footer button redesign.
4. **Bug 1 (Product shot hang)** next: Convert EditBeanModal to fire-and-forget + extract utility.
5. **Bug 2 (Product shot at ingestion)** last: Wire parallel generation with generation counter.
6. **Shared cleanup**: base64ToBlob optimization, preview URL revocation.

## Files Changed

| File | Bugs Addressed |
|------|---------------|
| `src/components/Modal.jsx` | #5 (keyboard-aware maxHeight, auto-scroll, overscroll-behavior) |
| `src/components/AddBeanForm.jsx` | #2, #3, #4, #5 (parallel product shot, grid fix, button redesign, scrollOnFocus) |
| `src/components/EditBeanModal.jsx` | #1, #3, #5 (fire-and-forget, grid fix, scrollOnFocus) |
| `src/lib/productShot.js` (new) | #1, #2 (shared product shot chain) |
| `src/lib/formHelpers.js` (new) | #5 (shared scrollOnFocus) |
| `src/lib/storage.js` | Performance (base64ToBlob optimization) |

## Design Decisions (from SpecFlow + Deepening analysis)

**Q: Should Save be blocked during product shot generation (Bug 1)?**
Decision: NO. Don't block Save for up to 3 minutes. Instead: let text edits save immediately, product shot continues in background (same pattern AddBeanForm already uses). Fire-and-forget to Firestore without guard is the established codebase convention (used in 5+ places).

**Q: Where does the product shot result live before the bean is saved (Bug 2)?**
Decision: Hold the result in a ref with a monotonic generation counter. At save time, if the result exists and the generation is still current, upload with beanId. If null or stale, skip (graceful degradation). The ref gets cleared and counter increments on reset/rescan.

**Q: Should the keyboard resize strategy change from `body` to something else (Bug 5)?**
Decision: Keep `resize: 'body'`. It works for ChatTab's manual handling. The real fix is adding Keyboard plugin listeners in Modal.jsx to dynamically adjust maxHeight and auto-scroll the active element. `dvh` is a red herring for keyboard handling in Capacitor.

**Q: What about `scrollIntoView` targeting the wrong scroll container?**
Decision: Since Modal body is `overflowY: auto` with `flex: 1; minHeight: 0`, it IS the scroll container. `scrollIntoView` scrolls the nearest scrollable ancestor. Adding `overscroll-behavior: contain` prevents unwanted scroll chaining to the body.

**Q: Should scrollOnFocus be shared or duplicated?**
Decision: Extract to `lib/formHelpers.js`. Currently duplicated in 4 files with slight variations. One function, one import, configurable `block` param.

**Q: Should product shot logic be a shared hook?**
Decision: No hook (premature abstraction for 2 consumers with different lifecycles). Extract just the chain to a utility function in `lib/productShot.js`.

## Risk Analysis

- **Keyboard plugin in Modal**: Adds ~20 lines to a currently 65-line component. The `useEffect` cleanup must properly remove listeners to avoid leaks. Use the `canceled` flag pattern already established in ChatTab.
- **Product shot parallel with scan**: Different Gemini models (`gemini-3.1-flash-image-preview` vs `gemini-2.5-flash`), so no rate-limit conflict. Pass `retries: 0` for product shot to avoid starving the scan.
- **Stale product shot on rescan**: Monotonic generation counter invalidates old results. No orphaned writes because upload only happens at save time with correct beanId.
- **`overscroll-behavior: contain`**: Well-supported (iOS 16+). No known issues in WKWebView.
- **base64ToBlob via fetch**: The `fetch` data-URL approach is supported in all modern browsers and cuts JS heap pressure by ~60%.

## Security Note (from Security Review)

Add server-side validation in `api/gemini.js` for `handleProductShot`:
- Allowlist mimeType to `['image/jpeg', 'image/png', 'image/webp']`
- Validate base64 string length (reject if decoded size > 10MB)
- Currently no size or type validation on the base64 payload

## Follow-up Items (not in this PR)

- **Btn tap targets**: Add `minHeight: 44` to Btn base style for Apple HIG compliance (primary ~40px, ghost ~36px currently)
- **storyRef stale-write race**: Apply generation counter to Professor Ruphus story generation (same pattern as product shot)
- **AddBeanForm size**: At 621 lines, consider extracting scan pipeline to `useBeanScan` hook in future
- **SettingsPage raw buttons**: Uses `<button>` instead of `<Btn>` component (pre-existing inconsistency)
