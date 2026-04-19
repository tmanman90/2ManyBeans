# Handoff: Recipe Share Card — text fit + chalk wordmark

## Overview

The brew-recipe share card (`RecipeShareCard` in `Coffee-App-Build/src/components/ShareCard.jsx`) has two problems:

1. **Text overflows the chalkboard.** Long bean names (e.g. *"Octavio Rueda El Mirador - 3rd Harvest Pink Bourbon"*) run off the left wooden frame of the chalkboard illustration and get clipped with an ellipsis on the right. The text zone is positioned outside the chalkboard's actual drawable area.
2. **Watermark is a plain text line that reads like a footer.** The brand wants the "2manybeans" wordmark to appear, styled like chalk writing on the chalkboard, centered at the top of the slate — using the real brand wordmark asset, not a font substitute.

This handoff describes the fix: corrected chalkboard-relative positioning, auto-fitting title, and a chalk-rendered wordmark header using the real brand logo.

## About the Design Files

The files under `reference/` are a **design reference**, not production code to copy verbatim. `Share Card Fix.html` + `sharecard-fix.jsx` run the prototype side-by-side ("Before" vs "After") using plain React + Babel in a single HTML file. Your job is to translate the layout decisions and numeric values into the existing `RecipeShareCard` React component in `Coffee-App-Build/src/components/ShareCard.jsx`, keeping that file's surrounding patterns (the `chalk` style object, `ChalkParam` subcomponent, `forwardRef`, `Capacitor` asset paths, etc.) intact.

## Fidelity

**High-fidelity.** Every numeric value in this document was measured against the real chalkboard illustration (1024×1024 source, 540px rendered) and verified visually in the prototype. Use these numbers exactly. Typography tokens come from the existing `fonts` export in `src/styles/theme.js` and are unchanged.

---

## Files to change

### 1. Add the brand logo asset

Copy `assets/2manybeans-logo-transparent.png` (in this handoff folder) to:

```
Coffee-App-Build/public/images/2manybeans-logo-transparent.png
```

- 2123×639 PNG, transparent background, dark-brown strokes (the *variantC-condensed* wordmark).
- Derived from `Coffee-App-Build/docs/brand/exploration/stage3-wordmark/variantC-condensed/attempt-1.png` by masking out the parchment. The alpha is anti-aliased so the edges stay smooth when CSS filters recolor the strokes.

### 2. Edit `Coffee-App-Build/src/components/ShareCard.jsx`

Only `RecipeShareCard` (currently at ~line 163 to ~line 303 of the file) changes. `TastingShareCard`, `captureShareCard`, the `chalk` style object, `ChalkParam`, `offScreenStyle`, constants, and the `Tina` easter egg stay exactly as they are.

Replace the "Chalkboard text zone" block and the `2manybeans` watermark at its end (current lines ~209-297) with the new text zone + header-wordmark described below. Everything else in the `return (...)` of `RecipeShareCard` — the outer wrapper, the background `<img>`, and the `Tina` easter egg — stays put.

---

## The fix, in detail

### Measured chalkboard bounding box

The dark-green slate inside the wooden frame occupies, in 540-px card coordinates:

| | value |
|---|---|
| left (L) | 67 |
| right (R) | 445 |
| top (T) | 110 |
| bottom (B) | 430 |
| width | 378 |
| height | 320 |

The chalkboard's center-X is at **256** — that's **14 px left of card-center (270)** because the wooden frame in the illustration is asymmetric. Always center content on the chalkboard, not the card.

Define these once at module scope (above `RecipeShareCard`, alongside `CARD_WIDTH`):

```js
// Measured bounding box of the chalkboard slate in 540-px card coordinates.
// Source: pixel-scan of public/images/share-card-layout-half-v2.png at 1024×1024,
// scaled by 540/1024. Center-X is 256 (14 px left of card-center 270).
const BOARD = { L: 67, R: 445, T: 110, B: 430 };
const BOARD_W = BOARD.R - BOARD.L; // 378
const BOARD_H = BOARD.B - BOARD.T; // 320
```

### Text zone — replace the current block

Current (buggy):

```jsx
<div style={{
  position: 'absolute',
  top: 40, left: 45, right: 60, bottom: 175,
  ...
}}>
```

New:

```jsx
{/* Chalkboard text zone — anchored to the measured chalkboard bbox,
    not the card. padTop reserves room for the chalk wordmark header. */}
<div style={{
  position: 'absolute',
  left:   BOARD.L + 14,                 // 14 px inset from slate edge
  top:    BOARD.T + 48,                 // room for wordmark header
  width:  BOARD_W - 28,                 // 350
  height: BOARD_H - 48 - 18,            // 254
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'flex-start',         // was 'center'
  gap: 6,
  overflow: 'hidden',
}}>
  ...
</div>
```

### Title — replace `white-space: nowrap` with an auto-shrink-to-fit wrapper

The current title truncates with ellipsis. Replace it with a component that wraps to 2 lines and shrinks 24 → 14 px until the box fits:

```jsx
// Place this helper above RecipeShareCard (or co-locate in the module).
// Resets to maxSize on text change, then shrinks 1px at a time until scrollHeight
// fits the 2-line budget. Uses useLayoutEffect so the shrink happens before paint.
function FitTitle({ text, maxSize = 26, minSize = 14, maxLines = 2, style }) {
  const ref = React.useRef(null);
  const [size, setSize] = React.useState(maxSize);

  React.useLayoutEffect(() => {
    let s = maxSize;
    setSize(s);
    const el = ref.current;
    if (!el) return;
    let raf;
    const check = () => {
      const lineHeight = 1.15;
      const maxH = Math.ceil(s * lineHeight * maxLines) + 2;
      if (el.scrollHeight > maxH && s > minSize) {
        s -= 1;
        setSize(s);
        raf = requestAnimationFrame(check);
      }
    };
    raf = requestAnimationFrame(check);
    return () => cancelAnimationFrame(raf);
  }, [text, maxSize, minSize, maxLines]);

  return (
    <div ref={ref} style={{
      ...style,
      fontSize: size,
      lineHeight: 1.15,
      textAlign: 'center',
      wordBreak: 'break-word',
      overflowWrap: 'anywhere',
      hyphens: 'auto',
      display: '-webkit-box',
      WebkitLineClamp: maxLines,
      WebkitBoxOrient: 'vertical',
      overflow: 'hidden',
    }}>{text}</div>
  );
}
```

Then in `RecipeShareCard`:

```jsx
<FitTitle
  text={name}
  maxSize={26}
  minSize={14}
  maxLines={2}
  style={{ ...chalk.beanName, width: '100%' }}
/>
```

### Subtitle and bag notes — tighten wrapping rules

The subtitle and bag-notes divs should wrap (they currently don't). Use these two variants:

```jsx
{subtitle && (
  <div style={{
    ...chalk.recipeTitle,
    fontSize: 15,                        // was 18 — tighter for 2-line-title case
    textAlign: 'center',
    lineHeight: 1.25,
    width: '100%',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    wordBreak: 'break-word',
  }}>
    {subtitle}
  </div>
)}

{bagNotes && bagNotes !== '(not logged)' && (
  <div style={{
    fontFamily: fonts.title,
    fontSize: 12,
    fontStyle: 'italic',
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
    width: '92%',
    lineHeight: 1.4,
    overflow: 'hidden',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    letterSpacing: 0.3,
    marginTop: 2,
  }}>
    {bagNotes}
  </div>
)}
```

### Divider + params grid — use the new constrained sizes

```jsx
<div style={{ width: 54, height: 1, background: 'rgba(255,255,255,0.32)', margin: '6px 0 2px' }} />

<div style={{
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  columnGap: 12,
  rowGap: 8,
  width: '100%',
}}>
  <ChalkParam label="Ratio"         value={ratio}            />
  <ChalkParam label="Bloom"         value={bloom}            />
  <ChalkParam label="Grind (SS)"    value={grindSingleShot}  />
  <ChalkParam label="Grind (Batch)" value={grindBatch}       />
</div>
```

And inside `ChalkParam` (override the existing label/value font sizes at the call site, or shrink the defaults in the `chalk` token):

- `chalk.paramLabel` — change `fontSize: 13 → 11`, keep everything else
- `chalk.paramValue` — change `fontSize: 18 → 17`, keep everything else

Alternatively, keep `chalk` untouched and pass size overrides via props — pick whichever fits the team's pattern better. The 11/17 sizes ensure the 2×2 grid fits comfortably when the title took 2 lines.

### Remove the current text watermark

Delete the existing `<div>2manybeans</div>` that sits at the bottom of the text zone. The brand mark moves to a new header element below.

### Chalk wordmark header — new element

Add this **after** the closing tag of the text-zone div, as a sibling inside the outer `<div ref={ref}>`. Keep it outside the text zone so it isn't affected by the text zone's overflow/layout.

```jsx
{/* Chalk wordmark header — sits at top-center of the CHALKBOARD (not the card).
    The chalkboard is offset 14px left of card-center because of the wooden-frame
    asymmetry in the illustration, so we position absolutely relative to the
    measured bbox instead of using `left: 50%`. */}
<img
  src="/images/2manybeans-logo-transparent.png"
  alt="2manybeans"
  crossOrigin="anonymous"
  style={{
    position: 'absolute',
    top: BOARD.T + 2,                                // 112 — right at the slate's top edge
    left: BOARD.L + BOARD_W / 2,                     // 256 — slate's true center
    transform: 'translateX(-50%) rotate(-1deg)',     // -1deg = feels hand-written, not stamped
    width: 135,                                      // ~36% of slate width — subtle header
    height: 'auto',
    // Chalk-on-slate treatment: recolor dark strokes to white, soft glow, subtle shadow.
    filter: `
      brightness(0) invert(1)
      drop-shadow(0 0 0.5px rgba(255,255,255,0.8))
      drop-shadow(0 1px 1px rgba(0,0,0,0.25))
    `,
    opacity: 0.82,                                    // reads as chalk, not paint
    pointerEvents: 'none',
  }}
/>
```

**Why these values:**

- `top: BOARD.T + 2` (112) — hugs the top edge of the slate; any lower feels floaty.
- `left: BOARD.L + BOARD_W / 2` (256) — the slate's true center. Using `left: '50%'` pulls the mark 14 px right because of the wood-frame asymmetry; that was visibly off in testing.
- `width: 135` — tried 170 first; too dominant. 135 reads as a subtle header, still legible at 270 px (2× export).
- `rotate(-1deg)` — enough to break the "stamp" feeling. -3deg starts looking crooked.
- The filter stack: `brightness(0) invert(1)` turns the dark brown strokes to white; the two `drop-shadow`s add a soft white glow and a tiny dark offset so the chalk lifts off the slate. `opacity: 0.82` keeps it from looking like painted-on enamel.

---

## Capture behaviour

`captureShareCard()` in the same file dynamic-imports `modern-screenshot` and calls `domToPng` at `scale: 2`. No changes needed — the new `<img>` captures correctly because:

1. It has `crossOrigin="anonymous"`, matching the background image.
2. `modern-screenshot` serializes CSS filters via the foreignObject path; `brightness`, `invert`, and `drop-shadow` are all supported.
3. `domToPng` already bypasses cache and uses a `placeholderImage` fallback.

**One thing to verify on device:** Safari/WKWebView has historically been inconsistent about `filter: drop-shadow()` on nested images. If the exported PNG shows the wordmark dark-brown instead of white, pre-process the PNG: generate a pure-white version of the logo (alpha from the original, RGB set to `#FFFFFF`) and drop the `brightness(0) invert(1)` part of the filter. The `run_script` that produced the transparent PNG from `variantC-condensed/attempt-1.png` already masks to alpha; adding a 3-line pass that sets RGB to white gives you a pre-whitened asset. Keep the `drop-shadow` filters — those render reliably.

## Testing

Add or update the dev test page at `Coffee-App-Build/src/pages/TestShareCard.jsx` to include at least these four preset bean names, to stress the title fitter:

| preset | name | expected |
|---|---|---|
| long | *Octavio Rueda El Mirador - 3rd Harvest Pink Bourbon* | 2 lines, auto-shrunk to ~18-20 px |
| short | *Guji Natural* | 1 line at max size (26 px) |
| medium | *Finca La Esmeralda Geisha* | 1-2 lines depending on viewport |
| extreme | long 80+ char name | 2 lines at min size 14 px, word-broken |

For each: capture the share card via `captureShareCard` and verify the resulting PNG has no letters outside the chalkboard slate, the wordmark is visible at the top, and Ruphus is unobstructed at the bottom.

---

## Design tokens (for reference)

From the existing `src/styles/theme.js` — unchanged, listed here so you don't need to cross-check:

| token | value |
|---|---|
| `fonts.title` | `'Caveat', cursive` |
| `fonts.heading` | `'Playfair Display', serif` |
| `fonts.body` | `'Nunito', sans-serif` |
| `RECIPE_CARD_BG` | `#2B5B4E` (chalkboard fallback) |
| `CARD_WIDTH` | `540` (CSS px → 1080 px at scale 2) |
| `CARD_HEIGHT` | `540` |

Watermark-specific values introduced by this change:

| token | value |
|---|---|
| wordmark width | `135` px |
| wordmark top | `BOARD.T + 2` (= 112) |
| wordmark center-X | `BOARD.L + BOARD_W / 2` (= 256) |
| wordmark rotation | `-1deg` |
| wordmark opacity | `0.82` |
| wordmark filter | `brightness(0) invert(1) drop-shadow(0 0 0.5px rgba(255,255,255,0.8)) drop-shadow(0 1px 1px rgba(0,0,0,0.25))` |
| text-zone top pad | `48` (room for wordmark) |
| text-zone side pad | `14` each side (no text kisses wood frame) |
| text-zone bottom pad | `18` |

---

## Reference files in this bundle

- `reference/Share Card Fix.html` — the harness; open in a browser to see Before / After side by side.
- `reference/sharecard-fix.jsx` — the React prototype that the harness renders. The `AfterCard` function is the exact structure to port.
- `reference/share-card-layout-half-v2.png` — copy of the chalkboard illustration the card sits on (already in `Coffee-App-Build/public/images/`, included here so you can open the harness locally without the full project).
- `assets/2manybeans-logo-transparent.png` — the brand wordmark with the parchment masked out; ship this to `Coffee-App-Build/public/images/2manybeans-logo-transparent.png`.
