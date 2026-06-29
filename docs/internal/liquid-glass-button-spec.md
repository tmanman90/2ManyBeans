# Liquid Glass Buttons — Web/CSS Emulation Spec (iOS 26 era)

Research-backed, implementation-ready spec for emulating Apple's **Liquid Glass** (WWDC 2025, iOS/iPadOS/macOS 26) on **buttons and small controls** in a React app inside an iOS Capacitor **WKWebView**. No native SwiftUI; pure CSS + framer-motion.

The app already ships one good glass button (`BeanDetailCard` "VIEW STAT SHEET" + `components/GlassButton.jsx`). This spec turns that one-off into a consistent **primary (prominent/tinted)** + **secondary (regular/clear)** system.

---

## TL;DR — what makes it read as 2025 Liquid Glass (not 2020 frosted glass)

Liquid Glass is **three stacked optical layers**, not one blur:

1. **Highlight** — a bright specular sheen on the **top edge / rim** (light catching glass).
2. **Shadow** — a soft, content-adaptive **bottom drop shadow** that floats the control above content.
3. **Illumination** — a subtle **inner glow** giving the body depth.

Plus a **tint** that is semantic (primary CTA only), an **adaptive backdrop** (`blur + saturate`), and a **press response** that **scales down + brightens + springs** (never a color swap).

The one thing CSS genuinely cannot do is true **refraction/lensing** (light bending through the glass). That needs SVG `feDisplacementMap` (Chromium-only, broken in WKWebView). On iOS we **skip lensing** and lean on the highlight + shadow + tint trio, which is where 90% of the "expensive glass" read comes from anyway.

---

## 1. What Liquid Glass actually is (for buttons)

From Apple's newsroom + HIG + WWDC25 "Meet Liquid Glass" (219) / "Build with the new design" (323):

- **A translucent dynamic material** that *"reflects and refracts surrounding content while dynamically transforming to bring focus to content."* Controls are *"crafted out of Liquid Glass and act as a distinct functional layer that sits above apps."*
- **Lensing, not scattering.** Old `UIBlurEffect`/`.ultraThinMaterial` *scatters* light → flat frosted panel. Liquid Glass *bends and concentrates* light in real time → it behaves like a physical glass lozenge. This is the headline difference.
- **Specular highlights respond to device motion.** A bright sheen rides the top/edges and shifts as you tilt the phone. (Web: we fake a static top sheen; optional gyro tilt is a stretch goal.)
- **Adaptive tint.** Color is *"informed by surrounding content and intelligently adapts between light and dark."* Tint is for **meaning** (the primary action), not decoration.
- **Concentric corners.** Control corner radius is concentric with its container / the device's rounded corners (`RoundedRectangle(cornerRadius: .containerConcentric)`). Web takeaway: pick radii that nest cleanly (inner radius = outer radius − padding).
- **Soft adaptive shadow.** A bottom shadow that deepens over busy/text content and lightens over white — it's what makes the control *float*.
- **Three material variants:**
  - `.regular` — medium translucency, full adaptivity → **secondary buttons, toolbars**.
  - `.clear` — high translucency, needs a dimming layer underneath → over photos/media.
  - `.tinted` (`.regular.tint(.color)`) — semantic color → **primary CTA**.

### vs. old frosted glass / `UIBlurEffect`
| | Old frosted (`.ultraThinMaterial`) | Liquid Glass |
|---|---|---|
| Light | Scatters (flat blur) | Bends/concentrates (lensing) |
| Edges | Plain hairline border | Bright specular **rim** + top sheen |
| Depth | None (sits flat) | Inner glow + floating bottom shadow |
| Motion | Static | Specular highlight tracks tilt; press scales/brightens/springs |
| Color | Neutral gray | Content-adaptive, semantic tint |

---

## 2. SwiftUI APIs → visual target (so the CSS matches intent)

| SwiftUI | Visual you must reproduce in CSS |
|---|---|
| `.glassEffect(.regular, in: .capsule)` | Translucent body, backdrop blur+saturate, bright rim, top sheen, soft drop shadow, capsule/concentric radius |
| `.glassEffect(.clear)` | Same but **much more transparent** body — only works with a dim/scrim underneath |
| `.glassEffect(.regular.tint(.blue))` | Body gets a saturated semantic gradient tint; sheen + rim stay white |
| `.buttonStyle(.glass)` | **Secondary**: translucent, low-tint, subtle |
| `.buttonStyle(.glassProminent)` | **Primary**: opaque-ish tinted glass, strongest shadow + sheen |
| `.glassEffect(.regular.interactive())` | Press: **scale down slightly, brighten, spring/bounce, shimmer from touch point** |
| `GlassEffectContainer(spacing:)` | Glass can't sample other glass → group adjacent glass in one container so they share a sampling region and morph consistently. Web analog: don't stack independently-blurred buttons touching each other; give grouped controls a single shared blurred parent and render the buttons as lighter overlays inside it |
| `.glassEffectID(_:in:)` | Fluid morph between glass shapes (web: framer-motion `layoutId`) |

Precise visual cues to hit: **corner concentricity**, **bright top edge**, **soft bottom shadow**, **inner highlight**, and **slight scale + brighten on press**.

---

## 3. CSS emulation recipes (the deliverable)

Two tokens first, then drop-in components. Values are tuned for this app's **warm caramel** system; swap the tint gradient for any semantic color.

### Shared tokens

```css
:root {
  /* Backdrop: blur + saturate is the heart of the material. 12–16px reads as glass;
     >20px reads as a modal scrim. Saturate 160–180% keeps refracted color lively. */
  --glass-backdrop: blur(14px) saturate(170%);

  /* The 3-layer shadow stack: rim highlight (inset top) + inner shade (inset bottom)
     + contact shadow (tight) + float shadow (wide, soft). This is the whole effect. */
  --glass-shadow-secondary:
    inset 0 1px 0 rgba(255,255,255,0.45),      /* bright top rim */
    inset 0 -2px 6px rgba(20,12,6,0.22),        /* inner bottom shade */
    0 1px 2px rgba(60,38,22,0.16),              /* contact shadow */
    0 8px 22px rgba(60,38,22,0.22);             /* float shadow */

  --glass-shadow-primary:
    inset 0 1px 0 rgba(255,255,255,0.55),
    inset 0 -2px 7px rgba(40,20,8,0.34),
    0 1px 2px rgba(70,41,26,0.22),
    0 12px 30px rgba(120,70,34,0.38);

  --glass-rim: 1px solid rgba(255,255,255,0.30);
}
```

### Primary — prominent / tinted glass (the CTA)

```css
.glass-btn--primary {
  position: relative;
  isolation: isolate;            /* keep pseudo sheen layers contained */
  overflow: hidden;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;

  min-height: 44px;              /* HIG tap target */
  padding: 15px 22px;
  border-radius: 17px;           /* inner radius = container radius − padding for concentricity */
  border: var(--glass-rim);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;

  /* Semantic tint gradient = the "tinted glass" body. Light→dark vertically reads as a lens. */
  background: linear-gradient(176deg,
    rgba(184,120,70,0.94) 0%,
    rgba(150,90,48,0.95) 45%,
    rgba(74,47,30,0.96) 100%);

  -webkit-backdrop-filter: var(--glass-backdrop);   /* REQUIRED prefix on WKWebView */
          backdrop-filter: var(--glass-backdrop);

  box-shadow: var(--glass-shadow-primary);

  color: #FFF7EE;
  font: 700 15px/1 var(--font-body, system-ui);
  letter-spacing: 0.01em;
  text-shadow: 0 1px 2px rgba(40,20,8,0.32);

  transition: box-shadow .18s ease, filter .12s ease; /* NOT backdrop-filter — see §4 */
}

/* Specular top sheen — the single biggest "it's glass" tell. */
.glass-btn--primary::before {
  content: "";
  position: absolute;
  inset: 0 0 auto 0;
  height: 52%;
  border-radius: inherit;
  background: linear-gradient(180deg,
    rgba(255,255,255,0.38) 0%,
    rgba(255,255,255,0.04) 100%);
  pointer-events: none;
  z-index: 0;
}

/* Inner illumination — warm corner glow gives the body depth. */
.glass-btn--primary::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: radial-gradient(130% 90% at 16% -10%,
    rgba(255,238,214,0.26), transparent 58%);
  pointer-events: none;
  z-index: 0;
}
.glass-btn--primary > * { position: relative; z-index: 1; }

/* Press: scale + brighten (cheap, GPU). Never change the tint. */
.glass-btn--primary:active {
  filter: brightness(1.08);
}
```

### Secondary — regular / clear glass

```css
.glass-btn--secondary {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;

  min-height: 44px;
  padding: 13px 18px;
  border-radius: 14px;
  border: 1px solid rgba(255,255,255,0.40);   /* slightly brighter rim — it's the main definition here */
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;

  /* Near-clear body: mostly the backdrop shows through, faint white fill for body. */
  background: linear-gradient(180deg,
    rgba(255,255,255,0.18) 0%,
    rgba(255,255,255,0.08) 100%);

  -webkit-backdrop-filter: var(--glass-backdrop);
          backdrop-filter: var(--glass-backdrop);

  box-shadow: var(--glass-shadow-secondary);

  color: var(--ink, #3A2417);
  font: 600 14px/1 var(--font-body, system-ui);
  letter-spacing: 0.01em;
  text-shadow: 0 1px 1px rgba(255,255,255,0.45);

  transition: box-shadow .18s ease, filter .12s ease;
}
.glass-btn--secondary::before {        /* lighter top sheen */
  content: "";
  position: absolute; inset: 0 0 auto 0; height: 50%;
  border-radius: inherit;
  background: linear-gradient(180deg, rgba(255,255,255,0.30), rgba(255,255,255,0.02));
  pointer-events: none; z-index: 0;
}
.glass-btn--secondary > * { position: relative; z-index: 1; }
.glass-btn--secondary:active { filter: brightness(1.06); }
```

> **Clear variant over media:** for `.clear` glass over a photo/map, keep the same recipe but lower body alpha to `rgba(255,255,255,0.06)` and **put a dimming scrim behind it** (`rgba(0,0,0,0.18)` on the container), exactly as `.clear` requires a dim layer in SwiftUI.

### framer-motion press (this app uses `m.button` + `spring.snappy`)

Match `.interactive()` — scale + spring, brightness via CSS `:active`:

```jsx
<m.button
  className="glass-btn--primary"
  whileTap={disabled ? undefined : { scale: 0.97 }}
  transition={spring.snappy}   // stiffness ~700, damping ~30, mass ~0.6
  {...rest}
>
  <span>{children}</span>
</m.button>
```

Keep `whileTap` on **scale only** (transform = GPU). Let `:active { filter: brightness() }` do the brighten. This reproduces the SwiftUI "scale + brighten + spring" press exactly without touching `backdrop-filter`.

---

## 4. WKWebView gotchas

- **`-webkit-backdrop-filter` is mandatory.** iOS WKWebView still needs the prefix; unprefixed alone renders a transparent (non-blurred) box. Always declare both (the app's `global.css` and existing buttons already do this — keep it).
- **Never animate `backdrop-filter`.** Each backdrop element forces extra render passes; animating blur/saturate causes re-sampling every frame and stutters badly on device. Animate **`transform` and `opacity`** (and cheap `filter: brightness`) only. This is in the project's iOS layout rules too.
- **Budget your blurred elements.** Backdrop-filter is per-element expensive. Don't put 6 independently-blurred buttons in a scrolling list. Mirror `GlassEffectContainer`: give a **group** of controls **one** shared blurred parent and render the buttons as lightweight tinted overlays inside it (no per-button backdrop-filter). Reserve real backdrop-filter for hero/primary actions and chrome.
- **Avoid `mix-blend-mode` for the sheen on iOS 26.** There is an active WebKit regression (iOS 26.x) where `mix-blend-mode` combined with `filter`/`backdrop-filter` renders incorrectly (ignores the blend). Use plain layered gradients (as above) for the highlight, **not** `mix-blend-mode: overlay/screen`.
- **No true refraction/lensing.** `feDisplacementMap` SVG displacement (the only way to fake real lensing) does not reliably compose with `backdrop-filter` outside Chromium and is broken/absent in WKWebView. **Don't ship SVG-displacement glass on iOS** — it'll look fine in a Chrome demo and break on the actual device. The highlight+shadow+tint stack is the faithful path here.
- **`overflow: hidden` + `isolation: isolate`** on the button keeps the `::before/::after` sheen clipped to the radius and prevents z-index bleed. Required for clean corners.
- **Avoid heavy box-shadow on scrolling lists** (project rule). For glass buttons inside scrollers, drop the wide float shadow to a single tighter shadow while scrolling, or pre-flatten.

---

## 5. Do / Don't checklist

**Do**
- Stack all three layers: **top sheen + inner glow + (contact + float) shadow**. Missing any one = flat frosted look.
- Keep blur **12–16px**, saturate **160–180%**. That window reads as crisp glass.
- Use a **bright top rim** (`inset 0 1px 0 rgba(255,255,255,.45–.55)`) — the strongest single cue.
- Make corners **concentric** (inner radius derived from container).
- Reserve **tint for the primary action only** (semantic color), keep secondary near-clear.
- Press = **scale down (~0.97) + brighten (~1.06–1.08) + spring**. Transform/opacity/filter only.
- Always pair `-webkit-backdrop-filter` with `backdrop-filter`.

**Don't**
- Don't ship a lone `backdrop-filter: blur()` with a flat border — that's 2020 glassmorphism / AI-slop.
- Don't animate `backdrop-filter`, blur radius, or saturate.
- Don't use `mix-blend-mode` for highlights on iOS 26 (WebKit regression).
- Don't chase SVG `feDisplacementMap` refraction for iOS — broken in WKWebView.
- Don't tint everything; multiple competing tinted glass buttons kill the "functional layer" read.
- Don't go blur >20px on buttons (that's modal-scrim territory, not a control).
- Don't stack many independently-blurred buttons in lists — share one blurred parent.
- Don't swap colors on press; keep the material identity, just brighten.

---

## Sources
- [Apple Newsroom — Liquid Glass intro](https://www.apple.com/newsroom/2025/06/apple-introduces-a-delightful-and-elegant-new-software-design/)
- [WWDC25 219 — Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/)
- [WWDC25 323 — Build a SwiftUI app with the new design](https://developer.apple.com/videos/play/wwdc2025/323/)
- [conorluddy/LiquidGlassReference (Swift/SwiftUI reference)](https://github.com/conorluddy/LiquidGlassReference)
- [SwiftUI Liquid Glass complete guide](https://www.atelier-socle.com/en/articles/swiftui-liquid-glass-guide)
- [Recreating Liquid Glass with pure CSS (dev.to/kevinbism)](https://dev.to/kevinbism/recreating-apples-liquid-glass-effect-with-pure-css-3gpl)
- [Getting Clarity on Apple's Liquid Glass (CSS-Tricks)](https://css-tricks.com/getting-clarity-on-apples-liquid-glass/)
- [How to create Liquid Glass effects with CSS and SVG (LogRocket)](https://blog.logrocket.com/how-create-liquid-glass-effects-css-and-svg/)
- [WebKit Features in Safari 26.0](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/)
- [Introducing Backdrop Filters (WebKit)](https://webkit.org/blog/3632/introducing-backdrop-filters/)
- [mix-blend-mode + backdrop-filter WebKit bug](https://bugs.webkit.org/show_bug.cgi?id=176830)
