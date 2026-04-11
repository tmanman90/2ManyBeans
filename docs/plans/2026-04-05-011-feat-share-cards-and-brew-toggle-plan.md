---
title: "feat: Share cards for recipes/tastings + long-press brew toggle"
type: feat
status: active
date: 2026-04-05
origin: docs/brainstorms/2026-04-05-share-cards-and-brew-toggle-requirements.md
---

# feat: Share Cards + Brew Method Toggle

## Enhancement Summary

**Deepened on:** 2026-04-05
**Research agents used:** security-sentinel, performance-oracle, share card design research, modern-screenshot iOS research

### Key Improvements
1. **Share card dimensions**: 1080x1920 (IG story) and 1080x1080 (square). 160px safe zones for story format.
2. **modern-screenshot iOS fixes**: Use `drawImageInterval: 200`, PNG only (JPEG is blurry on iOS), pre-convert Firebase images to base64 via `fetchFn`, add `crossorigin` to Google Fonts link tag.
3. **Performance**: Pre-cache bean photos as blob URLs on load. Guard against concurrent captures. Use single filename `share-card.png` to prevent cache accumulation.
4. **Security**: Explicit field allow-list for share cards (no UID, no API keys). Pin modern-screenshot version. Sanitize filenames.
5. **Typography specs**: Hero text 56-72px Playfair, big numbers 120-160px, body 36-40px Nunito, never below 28px at 1080px width.

### New Considerations Discovered
- Safari `foreignObject` can produce blank images on first render. May need retry or increased `drawImageInterval`.
- `backdrop-filter` is NOT captured by any DOM-to-image library. Avoid on share card elements.
- Google Fonts `<link>` tag needs `crossorigin` attribute for font embedding to work.
- Firebase Storage images are cross-origin and will render blank without pre-conversion.
- Long-press must handle `touchcancel` and clear timer on unmount to prevent React warnings.

---

## Overview

Add branded share cards for Aiden recipes and tasting reviews, plus a long-press gesture on the Brew button to access the alternative brew method. Share cards include bean photo, recipe/tasting data, Professor Ruphus illustration, and 2manybeans branding. (see origin)

## Proposed Solution

Three features sharing common infrastructure:

1. **Share utility** (`src/lib/share.js`): Renders a hidden React component to image via `modern-screenshot`, saves to cache via Capacitor Filesystem, shares via Capacitor Share plugin. Web fallback: Web Share API or clipboard.
2. **Share card components**: Branded cards rendered off-screen, captured as images. Warm cream palette, Ghibli-clean aesthetic, Professor Ruphus illustration.
3. **Long-press brew toggle**: Custom `useLongPress` hook on the Brew button. Shows a small action menu with both brew method options.

## Technical Approach

### Dependencies to Install

```bash
npm install modern-screenshot @capacitor/share @capacitor/filesystem
npx cap sync
```

**Note**: Adding `@capacitor/share` and `@capacitor/filesystem` are native plugin changes. This requires a **TestFlight build**, not just Capgo OTA. (from learnings: Capgo rejects native plugin changes)

### Phase 1: Share Infrastructure

**Files to create:**

#### `src/lib/share.js` (new)
Share utility following the `haptics.js` pattern (async, platform-gated):

```javascript
// Flow: render card -> capture as image -> save to cache -> native share
import { Capacitor } from '@capacitor/core';

export async function shareImage(dataUrl, text) {
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
    const fileName = `share-${Date.now()}.png`;
    const saved = await Filesystem.writeFile({
      path: fileName, data: base64, directory: Directory.Cache,
    });
    await Share.share({ text, files: [saved.uri] });
  } else if (navigator.share) {
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], 'share.png', { type: 'image/png' });
    await navigator.share({ text, files: [file] });
  } else {
    await navigator.clipboard.writeText(text);
  }
}
```

#### `src/hooks/useLongPress.js` (new)
Custom hook for long-press detection on touch devices:

- `onTouchStart`: start 400ms timer
- `onTouchEnd`: if timer hasn't fired, call onClick; if it has, it's a long press
- `onTouchMove`: cancel (prevents scroll from triggering long press)
- `onContextMenu`: preventDefault (suppress iOS native context menu)
- Haptic feedback (medium) on long press trigger

### Phase 2: Share Card Components

**Files to create:**

#### `src/components/ShareCard.jsx` (new)
Reusable branded card component rendered off-screen (hidden div), captured by `modern-screenshot`:

**Recipe share card layout:**
```
[Bean Photo (contain, 200px)]
[Bean Name - Playfair Display]
[Roaster - Origin - Process]
[2x2 Recipe Grid: Ratio, Bloom, Grind SS, Grind Batch]
[Professor Ruphus illustration]  [2manybeans logo]
```

**Tasting share card layout:**
```
[Bean Photo (contain, 200px)]
[Bean Name - Playfair Display]
[Star Rating]
[One-word score - large Caveat]
[Flavor tags]
[Professor Ruphus illustration]  [2manybeans logo]
```

**Styling:**
- Background: `C.bg` (#FAF6F1 warm cream)
- Card: 375px wide (iPhone-optimized), auto height
- Fonts: Caveat (title), Playfair Display (heading), Nunito (body)
- Must call `await document.fonts.ready` before capture
- Professor Ruphus: use existing `public/images/professor-ruphus.png`
- 2manybeans branding: small text at bottom

**Card dimensions** (from design research):
- Story format: 1080x1920 (9:16). 160px safe zones top/bottom for IG UI overlay.
- Square format: 1080x1080 (1:1). 60px padding all sides.
- Render at CSS 540px wide with `scale: 2` to get 1080px output.
- Border radius: 40px at 1080px resolution.
- Keep content to 3-5 data points max per card (Spotify Wrapped pattern).

**Typography at 1080px canvas** (from design research):
- Card title (Caveat): 64px, weight 700
- Bean name (Playfair Display): 56-72px, weight 700
- Big scores (Playfair Display): 120-160px, weight 700
- Tasting notes (Nunito): 36-40px, weight 600
- Secondary data (Nunito): 32px, weight 400
- CTA/watermark (Nunito): 28px, weight 400 (never smaller)

**Professor Ruphus**: Small illustration (~120x120px), corner placement like a stamp. Not the focal element.

**Capture function** (with iOS-safe settings from research):
```javascript
import { domToPng } from 'modern-screenshot';

export async function captureShareCard(ref) {
  await document.fonts.ready;
  await new Promise(r => setTimeout(r, 100)); // WKWebView paint delay
  return domToPng(ref.current, {
    scale: 2,
    backgroundColor: '#FAF6F1',
    drawImageInterval: 200,  // iOS needs more time for image rendering
    fetch: {
      bypassingCache: true,  // avoid Chromium CORS cache bug
      placeholderImage: 'data:image/png;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
    },
    font: { preferredFormat: 'woff2' },
  });
}
```

**Cross-origin image handling** (critical for iOS):
Firebase Storage images are cross-origin. Pre-convert bean photos to blob URLs when loading from Firestore, cache in a Map. At capture time, the share card uses same-origin blob URLs instead of Firebase URLs. Fallback: use `fetchFn` option in modern-screenshot to convert on the fly.

**Google Fonts**: Add `crossorigin` attribute to the `<link>` tag in `index.html` for font embedding to work in the SVG foreignObject approach.

### Phase 3: Recipe Share Button

**Files to modify:**

#### `src/components/AidenModal.jsx`
- Add "Share Recipe" button below "Open in Fellow" (when result exists)
- On tap: render RecipeShareCard off-screen, capture, share via `shareImage()`
- Share text includes the brew.link URL

#### Share card data needed from AidenModal:
- `recipe`: ratio, bloom, grind, pulses (already available)
- `bean`: name, roaster, origin, process, photoUrl (need to pass `aidenBean` from hook)
- `result.link`: brew.link URL

### Phase 4: Tasting Share Button

**Files to modify:**

#### `src/tabs/TastingTab.jsx`
- Add Share icon (Share2 from lucide-react) next to edit/delete buttons on each tasting card
- On tap: render TastingShareCard off-screen, capture, share
- Follows existing icon button pattern: 44x44 touch target, compact padding

#### Share card data needed:
- Tasting: rating, oneWord, notes, aroma, acidity, body, finish, sweetness
- Bean: name, roaster, origin, process, photoUrl (resolve from `beanId`)

### Phase 5: Long-Press Brew Toggle

**Files to modify:**

#### `src/tabs/RotationTab.jsx`, `src/tabs/InventoryTab.jsx`
- Replace `onClick` on Brew button with `useLongPress` bindings
- **Tap** (< 400ms): default brew method (current behavior)
- **Long press** (>= 400ms): show a small floating menu with two options:
  - "Aiden Recipe" (coffee machine icon)
  - "Hand Brew Recipe" (pour-over icon)
- Menu appears near the button, dismisses on selection or outside tap
- Haptic feedback (medium) on long press
- **Do NOT use onClick on the same element** (touch events handle both tap and long press)

#### Floating menu component:
Small inline menu, not a modal. Two rows, appears above the button. Matches app styling. Dismiss on outside tap.

## Acceptance Criteria

### Share Infrastructure
- [ ] `shareImage()` works on iOS native (share sheet with image + text)
- [ ] Web fallback works (Web Share API or clipboard)
- [ ] No permissions prompts needed (uses Cache directory)

### Recipe Share
- [ ] Share button visible below "Open in Fellow" in AidenModal
- [ ] Generated image includes: bean photo, bean info, recipe params, Professor Ruphus, branding
- [ ] Share text includes brew.link URL
- [ ] Image looks polished at 2x scale

### Tasting Share
- [ ] Share icon on each tasting card (next to edit/delete)
- [ ] Generated image includes: bean photo, bean info, star rating, one-word score, flavor tags
- [ ] Share works via iMessage, IG stories

### Brew Toggle
- [ ] Tap on Brew button triggers default method (no change)
- [ ] Long press shows two-option menu (Aiden / Hand Brew)
- [ ] Haptic feedback on long press
- [ ] Works on RotationTab and InventoryTab
- [ ] No regression to existing brew flow

## Performance Considerations (from deepening)

- **Capture latency**: 150-400ms on modern iPhone, up to 800ms on older devices. Acceptable.
- **Peak memory**: 10-15MB per capture at 2x scale. Guard against concurrent captures (disable share button while capturing).
- **Image prep is the bottleneck**: Cross-origin Firebase images take 50-820ms to convert. Pre-cache as blob URLs on bean load to eliminate this at share time.
- **Use single filename** `share-card.png` to prevent cache directory bloat. Overwrite each share.
- **Skip `document.fonts.ready` on Capacitor** builds where fonts are loaded from disk. Keep for web PWA.
- **Release data URLs immediately** after Filesystem write. Don't hold in React state.

## Security Notes (from deepening)

- **Explicit field allow-list**: Only render `name`, `roaster`, `origin`, `variety`, `process`, `photoUrl`, recipe params, tasting scores. Never spread `{...bean}`.
- **No sensitive data on cards**: No UID, email, API keys, or Firestore document IDs.
- **Pin `modern-screenshot` version** exactly (no `^`). Run `npm audit` after install.
- **Sanitize filenames**: Never include user input (bean names) in cache file paths.
- **Long-press handler**: Handle `touchcancel` + `touchmove` to cancel timer. Clear timer on unmount via `useEffect` cleanup. Store timer in ref, not state.

## Dependencies & Risks

| Dependency | Risk | Mitigation |
|-----------|------|------------|
| `modern-screenshot` in WKWebView | Blank images on first render (Safari foreignObject bug) | Use `drawImageInterval: 200`, retry once if blank |
| Firebase images cross-origin | Blank rectangles in captured card | Pre-convert to blob URLs on bean load |
| Google Fonts in SVG foreignObject | Fonts fall back to system fonts | Add `crossorigin` attr to font `<link>` tag |
| New Capacitor plugins | Requires TestFlight build | Plan for TestFlight deploy after implementation |
| `backdrop-filter` not captured | Blur effects won't appear on cards | Don't use backdrop-filter on share card elements |
| Professor Ruphus asset resolution | 22x22 icon may be too small at 120x120 on card | Check actual image dimensions, may need higher-res |

## Institutional Learnings Applied

- BeanCard icon buttons: NO minWidth/minHeight (from lessons.md)
- Modal overlays: warm brown rgba(44,24,16,0.4) + blur(4px) (from lessons.md)
- New Capacitor plugins require TestFlight, not Capgo OTA (from capgo-ota solution)
- Verify plugin has Package.swift for Capacitor 8 (from lessons.md)
- Never trigger async side effects in render body (from async-side-effect solution)
- React.lazy at module scope only (from react-lazy solution)
- Generated images < 2MB for PWA cache (from lessons.md)

## Sources & References

### Origin
- **Origin document:** [docs/brainstorms/2026-04-05-share-cards-and-brew-toggle-requirements.md](docs/brainstorms/2026-04-05-share-cards-and-brew-toggle-requirements.md). Key decisions: image card + brew.link (both), Professor Ruphus on cards, long press for alt brew, canvas-based client-side generation.

### Internal References
- AidenModal: `src/components/AidenModal.jsx`
- HandBrewModal: `src/components/HandBrewModal.jsx`
- TastingTab: `src/tabs/TastingTab.jsx`
- BeanCard: `src/components/BeanCard.jsx`
- RotationTab: `src/tabs/RotationTab.jsx` (brew button at line 138)
- InventoryTab: `src/tabs/InventoryTab.jsx`
- Theme: `src/styles/theme.js`
- Haptics pattern: `src/lib/haptics.js`
- Canvas pattern: `src/lib/claude.js:17` (compressImage)
- Professor Ruphus asset: `public/images/professor-ruphus.png`

### External References
- [modern-screenshot](https://github.com/niclasvanneste/modern-screenshot) - DOM to image
- [@capacitor/share docs](https://capacitorjs.com/docs/apis/share)
- [@capacitor/filesystem docs](https://capacitorjs.com/docs/apis/filesystem)
