---
title: "feat: Apothecary Share Card with Autoresearch Design Loop"
type: feat
status: active
date: 2026-04-06
---

# feat: Apothecary Share Card with Autoresearch Design Loop

## Overview

Replace the flat cream background on `RecipeShareCard` with the Ruphus apothecary illustration (`share-card-layout-half.png`). Recipe data renders as chalk-style white text on the chalkboard area. Use a Karpathy autoresearch loop (render, capture, Gemini vision score, adjust, repeat) to iterate the text overlay design to perfection without manual eyeballing.

## Problem Statement / Motivation

The current share card is a generic cream card with text. The apothecary illustration with Ruphus behind a coffee counter and a big chalkboard gives the share card real brand identity and personality. The chalkboard is a natural text zone for recipe data. The autoresearch loop lets us dial in typography, positioning, and spacing programmatically rather than guessing.

## Proposed Solution

### Phase 1: RecipeShareCard Background + Chalk Text Layout

Update `src/components/ShareCard.jsx` to:

1. **Fixed square card**: Lock `RecipeShareCard` to 540x540 CSS (1080x1080 at 2x capture) to match the 1:1 source image. This prevents the chalkboard/Ruphus boundary from shifting with content length.

2. **Background image via `<img>` tag** (not CSS `background-image`): Position an `<img>` absolutely behind all text content with `crossOrigin="anonymous"`. This ensures `domToPng` can capture it on both web and iOS WKWebView. CSS `background-image` inside `foreignObject` is unreliable cross-platform.

3. **Chalk text region**: Define the chalkboard zone as the upper ~55% of the card (roughly y: 60px to y: 320px, accounting for the wooden frame). All recipe text renders inside this zone.

4. **Typography**:
   - Bean name: `Caveat`, ~28px, white, bold (top of chalkboard)
   - Recipe title: `Caveat`, ~22px, white, italic (subtitle)
   - Recipe params (ratio, bloom, grind): `Caveat`, ~20px, white, arranged in a clean grid or list
   - Temperature profiles: `Caveat`, ~16px, rgba(255,255,255,0.8) (secondary)
   - "2manybeans" watermark: `Caveat`, ~14px, rgba(255,255,255,0.5) (bottom of chalkboard area, replaces CardFooter)

5. **Remove CardFooter** from RecipeShareCard only (Ruphus is baked into the background). Keep it on TastingShareCard.

6. **Fallback `backgroundColor`**: Change from `#FAF6F1` (cream) to `#2B5B4E` (dark green matching chalkboard) in `captureShareCard` when capturing a recipe card. If the background image fails to load, white chalk text on dark green is still legible.

### Phase 2: Test Route + Autoresearch Harness

Build a development-time test page and autoresearch script:

1. **Test route** (`src/pages/TestShareCard.jsx`):
   - Renders `RecipeShareCard` with hardcoded sample data (3 variants: full recipe, minimal recipe, long bean name)
   - Accessible at `/test-share-card` in dev mode only
   - Includes a "Capture" button that runs `captureShareCard` and displays the result inline
   - Add route to `App.jsx` gated behind `import.meta.env.DEV`

2. **Autoresearch script** (`scripts/share-card-autoresearch.mjs`):
   - Uses Playwright to navigate to `http://localhost:5173/test-share-card`
   - For each sample card variant:
     a. Screenshot the rendered card (or run `domToPng` via `page.evaluate()`)
     b. Send the screenshot to Gemini 2.5 Flash vision via the existing `api/gemini.js` proxy pattern
     c. Score against a binary checklist (see Scoring Rubric below)
     d. If any criterion fails, Gemini suggests specific CSS adjustments
     e. Script applies adjustments to a config object, re-renders, re-scores
     f. Loop until all pass or max 10 iterations reached
   - Outputs: final config values, score history log, best screenshot saved to `public/images/share-card-final-preview.png`

3. **Scoring Rubric** (Gemini prompt):
   ```
   Score this share card image. Answer YES or NO for each:
   1. LEGIBILITY: Can you read all text clearly against the chalkboard?
   2. BOUNDS: Is all text within the chalkboard area (not overlapping the wooden frame or Ruphus)?
   3. HIERARCHY: Is the bean name the most prominent text, with recipe details secondary?
   4. SPACING: Is there adequate spacing between text elements (no cramping, no excessive gaps)?
   5. BALANCE: Does the overall composition look intentional and aesthetically pleasing?
   
   For any NO answer, suggest a specific fix (e.g., "increase font size by 2px", "move text up 10px", "add 8px gap between lines").
   ```
   Pass threshold: 5/5 YES across all 3 sample variants.

### Phase 3: Run the Loop + Finalize

1. Start Vite dev server
2. Run the autoresearch script
3. Review Gemini's final scores and the preview screenshots
4. Manually verify on iOS simulator (the cross-origin spike from SpecFlow analysis)
5. Lock in the final CSS values
6. Remove the test route and script (or keep gated behind DEV)

## Technical Considerations

### Background Image in domToPng

- **Use `<img>` with `crossOrigin="anonymous"`**, not CSS `background-image`. The `foreignObject` serialization in `modern-screenshot` handles `<img>` tags more reliably than CSS backgrounds, especially on iOS WKWebView.
- The image is local (`/images/share-card-layout-half.png`), which resolves to `capacitor://localhost/images/...` on native. This origin is trusted by WKWebView, but the `crossOrigin` attribute ensures the canvas isn't tainted.

### Card Dimension Lock

- Current `RecipeShareCard` has no fixed height (grows with content). Locking to 540x540 CSS means content must fit. With the chalkboard zone being ~280px tall, this constrains how much recipe data can display.
- If a recipe has many temperature steps, the text may need to truncate or use smaller font. The autoresearch loop will catch this via the BOUNDS criterion.

### Font Loading

- `Caveat` is already loaded via Google Fonts in the app. No new font needed.
- The existing `document.fonts.ready` wait (web) and skip (native, fonts from disk) pattern applies unchanged.

### PWA Precache

- The background image (`share-card-layout-half.png`) is 2.57MB, under the 3MB precache limit but close. If it grows during iteration, compress or convert to WebP.
- The captured share card PNG is generated at share time, not precached. No impact.

### Avoid These (from learnings)

- No `backdrop-filter` on any share card element (not captured by DOM-to-image libs)
- Validate retry output identically to primary path (already implemented)
- Gate `document.fonts.ready` with `Capacitor.isNativePlatform()` (already implemented)

## System-Wide Impact

- **RecipeShareCard only**: TastingShareCard keeps its current cream design. No changes to tasting share flow.
- **AidenModal**: No changes needed. It already passes the right data to RecipeShareCard.
- **share.js**: No changes. The capture output is still a PNG data URL.
- **Background image added to PWA precache**: Vite build will include it. Watch file size.

## Acceptance Criteria

- [ ] RecipeShareCard renders with apothecary background image (Ruphus + chalkboard)
- [ ] Recipe text (bean name, title, ratio, bloom, grind) displays as white chalk-style text on the chalkboard area
- [ ] All text is legible and within chalkboard bounds on all 3 sample variants
- [ ] Card captures correctly via `domToPng` on both web and iOS
- [ ] Autoresearch script runs and converges (5/5 pass on all variants within 10 iterations)
- [ ] Fallback: white text on dark green background if image fails to load
- [ ] CardFooter removed from RecipeShareCard (Ruphus is in background), retained on TastingShareCard
- [ ] Background image file size stays under 3MB (PWA precache limit)
- [ ] No visual regression on TastingShareCard

## Success Metrics

- Gemini vision scores 5/5 on all 3 sample card variants
- Share card captures successfully on iOS simulator (manual verification)
- Share card file size < 500KB (captured PNG output)

## Dependencies & Risks

| Risk | Mitigation |
|------|-----------|
| `domToPng` can't capture the `<img>` background on iOS WKWebView | Spike test on simulator before building the autoresearch loop. Fallback: inline the image as base64 data URI. |
| Gemini scoring is inconsistent between runs | Use binary (yes/no) criteria, not subjective 1-10 scales. Run each score check twice and require agreement. |
| Autoresearch loop doesn't converge | Cap at 10 iterations. If stuck, surface the best-scoring iteration for manual tweaking. |
| Background image too large for PWA cache | Compress to WebP or reduce resolution. The card captures at 1080x1080, so a 1024x1024 source is sufficient. |
| Chalk text hard to read on certain chalkboard regions (light spots, frame edges) | Add subtle text shadow (`0 0 4px rgba(0,0,0,0.3)`) for contrast. The autoresearch loop's LEGIBILITY criterion catches this. |

## Implementation Phases

### Phase 1: Background + Layout (~30 min)
- Update `RecipeShareCard` in `src/components/ShareCard.jsx`
- Add background `<img>`, fix card to 540x540, position chalk text zone
- Remove CardFooter from recipe card
- Update fallback backgroundColor

### Phase 2: Autoresearch Harness (~45 min)
- Create `src/pages/TestShareCard.jsx` (dev-only test route)
- Create `scripts/share-card-autoresearch.mjs`
- Define Gemini scoring prompt and config object
- Wire Playwright capture + Gemini vision evaluation loop

### Phase 3: Run Loop + Finalize (~20 min)
- Execute autoresearch iterations
- Verify on iOS simulator
- Lock final values, clean up

## Sources & References

- Existing share card implementation: `src/components/ShareCard.jsx`
- Share utility: `src/lib/share.js`
- AidenModal share wiring: `src/components/AidenModal.jsx:279-288`
- Existing autoresearch pattern: `scripts/aiden-autoresearch.mjs`
- Capture bug learnings: `docs/solutions/logic-errors/share-card-capture-retry-null-safety.md`
- Original share card plan: `docs/plans/2026-04-05-011-feat-share-cards-and-brew-toggle-plan.md`
- Background image: `public/images/share-card-layout-half.png`
