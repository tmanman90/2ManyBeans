# Handoff: 2manybeans Onboarding Redesign

## Overview

This package contains a **mascot-forward redesign of the 2manybeans onboarding flow** — 14 screens (R1 → R13b) that introduce Professor Ruphus, capture brewing context, demo the bean-scan feature, and convert the user to a Pro/Ultra subscription.

The redesign's central idea: **video loops of the Ruphus mascot drive every screen.** Instead of static illustrations + text columns, the mascot occupies the upper 50%–60% of each screen as a full-bleed `<video>` loop, "speaking" via captioned bubbles, and the input controls live below in a clean white surface. Hero screens commit fully to the loop; dense interactive screens use a smaller "peek" of the mascot so controls have room to breathe.

## About the Design Files

The files in this bundle are **design references created in HTML/JSX as a single-page React prototype** — they're prototypes showing intended look and behavior, **not production code to copy directly**.

The HTML prototype was built to:
1. Render all 14 onboarding screens as iPhone-sized artboards on a pannable design canvas (`design-canvas.jsx`)
2. Wire each video loop to the existing Ruphus asset library (`assets/ruphus-*.mp4`)
3. Expose live tweaks (mascot height, peek height, paywall variant) so layout decisions can be A/B'd in-browser

Your job is to **recreate these screens inside the existing 2manybeans React + Capacitor codebase** (`Coffee-App-Build/`), reusing its theme tokens (`src/styles/theme.js`), router, RevenueCat paywall plumbing, and existing components — **not** to ship the HTML prototype as-is.

## Fidelity

**High-fidelity.** Every screen has final colors, typography, spacing, copy, and interaction states. Pricing in R13 Paywall comes from the live `subscriptionConfig.js` and `PaywallSheet.jsx` in the codebase — implement against the same RevenueCat offering keys.

The one thing intentionally left as a placeholder: **fonts.** The prototype declares `'Caveat'`, `'Playfair Display'`, `'Nunito'` because the codebase already loads those — if your codebase uses different families, swap them via the existing theme tokens.

## Where this lives in the existing codebase

The 2manybeans codebase already has an onboarding flow at `Coffee-App-Build/src/components/onboarding/screens/` with these existing screen files:

```
R1Welcome.jsx       R5Tinder.jsx          R10Scan.jsx
R2Goal.jsx          R6Personalized.jsx    R11Value.jsx
R3Pain.jsx          R7Kit.jsx             R12Trial.jsx
R4Social.jsx        R8Camera.jsx          R13Paywall.jsx
                    R9Processing.jsx      R13bNudge.jsx
```

Update each of those files to match the redesign in `screens.jsx` of this bundle. Routing, state, and the RevenueCat hook in `useOnboardingPaywall.js` should remain unchanged — only the screen render output changes.

## Design tokens

Pulled directly from `Coffee-App-Build/src/styles/theme.js` — already in the codebase, no new tokens needed.

```js
// Colors
bg:           '#FAF6F1'
cream:        '#FFF8F0'
card:         '#FFF8F0'
cardMuted:    '#EDE6DC'
text:         '#3B2417'  // primary text
textMuted:    '#8B7B6F'  // secondary text
textLight:    '#A89888'  // tertiary / fineprint
accent:       '#B07540'  // primary brand orange
accentLight:  '#C9A87C'
accentDark:   '#5C3D2E'
border:       '#E8DDD3'
borderLight:  '#F0E8DF'
amber:        '#C4943A'
amberBg:      '#FDF6E3'  // note bubble background

// Typography
title:    "'Caveat', cursive"            // hand-script accent (R1 brand line)
heading:  "'Playfair Display', serif"    // section/screen titles
body:     "'Nunito', sans-serif"         // UI + body

// Spacing scale used (in px)
4, 6, 8, 10, 12, 14, 16, 18, 20, 24

// Border radius
8 (chips) · 12 (rows/cards) · 14 (tier cards) · 18 (image cards) · 25 (pill CTA) · 999 (pills/badges)

// Shadow tokens used
soft   :  0 2px 8px rgba(92,61,46,0.06)
elev   :  0 2px 8px rgba(92,61,46,0.06), 0 12px 28px rgba(92,61,46,0.08)
ctaWarm:  0 1px 4px rgba(92,61,46,0.12), 0 4px 12px rgba(176,117,64,0.18)
ctaBig :  0 1px 4px rgba(92,61,46,0.12), 0 8px 20px rgba(176,117,64,0.25)
```

## Mascot videos

All 15 loops live in `assets/` of this bundle. Copy them into the codebase's existing video asset directory (likely `Coffee-App-Build/public/videos/` or similar). Each loop is silent, near-white background, mascot anchored to the bottom edge.

| File | Used on | Pose |
|---|---|---|
| `ruphus-welcome.mp4` | R1 | Waving in coffee lab, both arms |
| `ruphus-thinking.mp4` | R2 | Chin tap, considering |
| `ruphus-listening.mp4` | R3 | Ear cupped forward |
| `ruphus-reading-book.mp4` | R4 | Holding book, impressed expression |
| `ruphus-sniffing-beans.mp4` | R5 | Nose to a bean cup |
| `ruphus-presenting.mp4` | R6 | Whiteboard "ta-da" gesture |
| `ruphus-holding-grinder.mp4` | R7 | Holding a grinder up |
| `ruphus-magnifying-glass.mp4` | R8 | Looking through magnifier |
| `ruphus-processing-celebrating.mp4` | R9 | Pour-over held overhead |
| `ruphus-celebrating.mp4` | (alt for R9) | Generic celebration |
| `ruphus-writing-notes.mp4` | R10 | Clipboard + pen |
| `ruphus-cupping.mp4` | R11 | Cupping a bowl |
| `ruphus-thumbs-up.mp4` | R12 | Thumbs-up |
| `ruphus-confident.mp4` | R13 | Arms crossed, confident |
| `ruphus-waving.mp4` | R13b | Single-arm wave |

## The MascotStage primitive

A single helper renders every video. **Build this as a shared component in the codebase** and import it from each screen:

```jsx
function MascotStage({ src, height = 460, poster }) {
  return (
    <div style={{
      width: '100%',
      height,
      background: '#FFFFFF',
      flexShrink: 0,
      overflow: 'hidden',
      position: 'relative',
    }}>
      <video
        src={src}
        poster={poster}
        autoPlay muted loop playsInline preload="auto"
        style={{
          width: '100%', height: '100%',
          objectFit: 'contain',
          objectPosition: 'center bottom',
          display: 'block',
        }}
      />
    </div>
  );
}
```

Critical rules:
- `objectFit: 'contain'` + `objectPosition: 'center bottom'` — never crop the head; let extra width be white margin.
- **No `mix-blend-mode`, no borders, no shadows.** Backgrounds are pure `#FFFFFF` and the video's near-white background blends seamlessly.
- Two heights: **hero** (~390–460px on a 390×844 phone) and **peek** (~240–300px). Wire these as props.

### R1-only soft mask

R1 (Welcome) wraps the MascotStage in an additional radial-fade mask so the video edges feather into the page. **Do not apply this to other screens** — it was a per-screen ask.

```jsx
<div style={{
  WebkitMaskImage: 'radial-gradient(ellipse 95% 92% at 50% 42%, #000 55%, rgba(0,0,0,0.85) 70%, rgba(0,0,0,0) 100%)',
          maskImage: 'radial-gradient(ellipse 95% 92% at 50% 42%, #000 55%, rgba(0,0,0,0.85) 70%, rgba(0,0,0,0) 100%)',
}}>
  <MascotStage src="…ruphus-welcome.mp4" height={mascotHeight} />
</div>
```

## Layout system

Two screen archetypes; commit to one per screen:

### Hero archetype
*Used by:* R1, R4, R6, R8, R9, R11, R13b
- Mascot height ≈ 390–460
- Single short headline (Playfair) + 1-line subline
- Optional NoteBubble (Caveat or italic body in `amberBg`)
- Single CTA in a sticky bottom bar

### Peek archetype
*Used by:* R5, R7, R10, R12, R13 sheet
- Mascot height ≈ 240–300 (just head + shoulders visible)
- Mascot acts as ornament, not focus
- Below: dense controls — chip grids, swipe cards, form rows, toggles
- Sticky CTA bar at bottom

Both archetypes share:
- TopBar at top: back chevron (left) + step pill (center, e.g. "R5 · TASTE")
- White (`#FFFFFF`) backgrounds, no gradients
- 18–24px horizontal padding for content; bottom CTA always full-width with 12px radius (or 25px pill on R13 immersive)

## Screen-by-screen specs

Reference the JSX in `screens.jsx` of this bundle for exact pixel values. Each screen below describes its purpose, layout, and any non-obvious details.

### R1 — Welcome (hero)
- **Purpose:** First impression. Establish Ruphus as guide.
- **Mascot:** `ruphus-welcome.mp4`, height 390–410
- **Soft mask:** YES (radial fade — see above)
- **Type:** Caveat title `Brew coffee you're proud of` (38px, accent color, centered, leading 1.0). Sub: Nunito 15 muted "Let me show you around."
- **NoteBubble:** "I'm Professor Ruphus. Glad you're here. Give me a minute to learn how you brew — I'll take good care of you."
- **CTA:** "Get started"

### R2 — Brew Goal (peek)
- **Mascot:** `ruphus-thinking.mp4`, peek height 290
- **Headline:** "How are you brewing today?"
- **Selection:** 6 brew methods as horizontal chip rows (Fellow Aiden, V60, Chemex, AeroPress, French Press, "Other / Just exploring"). Each row: icon left, label right. Selected gets `amberBg` fill + accent border.
- **Auto-advance** on selection (no CTA)

### R3 — Pain Point (peek)
- **Mascot:** `ruphus-listening.mp4`, peek 290
- **Headline:** "What feels off when you brew?"
- **Options:** Single-select rows — `taste_more` (Tastes inconsistent), `dialed_in` (Hard to dial in), `recipe` (Don't know which recipe), `gear` (Gear feels random), `learn_more` (I just want to learn).
- **Auto-advance**

### R4 — Social Proof (hero)
- **Mascot:** `ruphus-reading-book.mp4`, hero 410
- **Headline:** "30,000+ home brewers improving daily."
- **Body:** 3 short testimonial bubbles stacked, each in `amberBg` with author + city.
- **CTA:** "Keep going"

### R5 — Palate Tinder (peek)
- **Mascot:** `ruphus-sniffing-beans.mp4`, peek 240
- **Mechanic:** Tinder-style swipe cards. 4 flavor cards (chocolate / fruit-forward / floral / nutty). Card has hero image placeholder + bold flavor name + 1-line description.
- **Buttons under card:** "Skip" (left, outlined) and "Love it" (right, accent fill).
- **Progress dots** above the card (1/4, 2/4, …)
- **Cards array** lives at `R5_CARDS` in `screens.jsx`

### R6 — Personalized (hero)
- **Mascot:** `ruphus-presenting.mp4`, hero 410
- **Headline:** "Your starting palate is locked in."
- **Body:** "Now I know what you like. Let's get you set up to scan beans, get recipes, and tune as you go."
- **CTA:** "Set up my kit"

### R7 — Kit Setup (peek)
- **Mascot:** `ruphus-holding-grinder.mp4`, peek 240
- **3 form rows:**
  1. Display name input (text)
  2. Grinder picker — radio list (Fellow Ode Gen 2 / Comandante C40 / Baratza Encore / 1Zpresso JX / "Other / no grinder")
  3. Brew method picker — V60 / Chemex / AeroPress / French Press / Other
- **CTA:** "Save kit"

### R8 — Camera Permission (hero)
- **Mascot:** `ruphus-magnifying-glass.mp4`, hero 410
- **Headline:** "Quick — let me see your beans."
- **Body:** "I'll use your camera to read bag labels, freshness dates, and notes. Photos stay on your device."
- **CTA:** "Allow camera"
- **Secondary link:** "Maybe later"

### R9 — Processing (hero)
- **Mascot:** `ruphus-processing-celebrating.mp4`, hero 410
- **Progress bar** (60% by default), accent fill, 8px height, `cardMuted` track, `borderLight` border, 999 radius
- **Quip line below bar:** "Studying your palate…" (rotates: "Calibrating recipes…", "Reading the bag…")
- **No CTA** — auto-advances when done

### R10 — Scan Demo (peek)
- **Mascot:** `ruphus-writing-notes.mp4`, peek 240
- **Demo card** showing a fake bean-bag scan: 16:10 image area with sweeping accent beam (CSS animation, top-to-bottom, infinite, 2.5s). Below, 3 "detected" rows fade in: producer, varietal, roast date.
- **CTA:** "Scan my first bag"

### R11 — Value Delivery (hero)
- **Mascot:** `ruphus-cupping.mp4`, hero 410
- **Custom element:** 5-axis palate spider chart (SVG). Axes: Sweetness, Acidity, Body, Aroma, Aftertaste. Three concentric pentagons (`borderLight`, 1px stroke). User's profile drawn as filled accent polygon at varying ratios.
- **CTA:** "See my recipes"

### R12 — Trial Timeline (peek)
- **Mascot:** `ruphus-thumbs-up.mp4`, peek 240
- **Vertical timeline** (3 nodes):
  1. **Today** — "Unlock everything"
  2. **Day 5** — "Reminder that your trial ends in 2 days"
  3. **Day 7** — "Trial ends — cancel anytime in Settings"
- Each node: amber circle (32×32, `amberBg` + `#E8D5A0` border), connecting line (2px wide, `borderLight`)
- **Consent toggle:** "Notify me before I'm charged" (default ON)
- **CTA:** "Start free trial"

### R13 — Paywall (peek, sheet variant) ★
- **Mascot:** `ruphus-confident.mp4`, peek 240
- **Headline:** Playfair 24, centered "Want me to guide you all the way?"
- **Sub:** "Unlimited scans, the tasting coach, Aiden recipes — this is where we shake on it."
- **2 tier cards** in a 2-col grid (Pro / Ultra). Ultra card has "BEST VALUE" badge centered above (accent pill, 9px white text on accent).
- **Each tier card contains:**
  - Tier name (11px, 1.5px tracking, accent if selected, muted if not)
  - **Annual price button** — fills accent when selected, shows price (`$39.99/yr` / `$79.99/yr`) + "Save 17%" sub
  - Divider line
  - **Monthly price button** — fills accent when selected (`$4.99/mo` / `$9.99/mo`)
  - Feature list — 4 features per tier, each separated by a 1px `borderLight` divider
- **Selected tier:** white bg + 2px accent border. Unselected: `amberBg` + 1px `#F0E2C8` border.
- **Pro features:** AI tasting coach with guided scoring · Unlimited bean scanning · Personalized hand brew recipes · Coffee chat with expert knowledge
- **Ultra features:** Everything in Pro, unlimited · Push recipes directly to Fellow Aiden · Multi-brewer support (V60, Chemex, AeroPress) · Priority model routing
- **CTA:** Dynamic — `Start 3-day free trial → Pro Annual` (or matching tier+cycle), 12px radius, accent fill, ctaWarm shadow
- **Fineprint:** `3-day free trial, then $39.99/year. Cancel anytime.`
- **Footer links:** Terms · Privacy · Restore Purchases (underlined, 11px, `textLight`, separated by `borderLight` middle dots)

### R13 — Paywall (immersive variant) ★ **PREFERRED**

The user explicitly chose this layout. Implement this one as primary; keep `sheet` available behind a feature flag if needed.

- **Background:** `ruphus-confident.mp4` runs **full-bleed** as a `position: absolute; inset: 0; object-fit: cover; object-position: center 30%;`. This is the only screen where the video covers the whole viewport.
- **White-fade overlay** at the bottom 74% (radial gradient `linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.92) 22%, #FFFFFF 50%)`) so content reads cleanly without covering the mascot.
- **Top chrome:**
  - Left: Glass pill `✦ 2MANYBEANS · PRO` — `rgba(255,255,255,0.85)` bg, `backdrop-filter: blur(8px)`, `borderLight` border, accent text, 11px 1px-tracking
  - Right: Round dark close button (36×36, `rgba(0,0,0,0.45)` bg, white ×)
- **Headline:** Playfair 26, leading 1.08, weight 800: "Brew like you mean it."
- **Feature list (7 rows)** — this is the differentiator from the screenshot reference:
  - 4 Pro features get a filled accent **`✓`** glyph (18×18 circle)
  - 3 Ultra-only features get an outlined accent **`✦`** sparkle glyph (18×18 circle, 1.5px accent border, transparent fill) **AND** a small `ULTRA` pill on the right (9px 800 weight, accent text on `rgba(176,117,64,0.12)` bg, 999 radius)
  - Feature copy:
    - Unlimited bean scans · no daily cap *(Pro)*
    - AI tasting coach with guided scoring *(Pro)*
    - Personalized hand brew recipes *(Pro)*
    - Coffee chat with expert knowledge *(Pro)*
    - Recipes pushed straight to Fellow Aiden **ULTRA**
    - Multi-brewer support · V60, Chemex, AeroPress **ULTRA**
    - Priority model routing **ULTRA**
- **Plan rows** (stacked vertically, full width) — selected row goes black (`#1A0F08`) on white, unselected stays white with `borderLight` border:
  - Left: Radio bullet (16×16, 2px border, white fill + dark center dot when selected)
  - Then: Tier name (13/800) + optional `BEST VALUE` pill, with subtitle "$39.99/yr · Save 17%"
  - Right: Monthly price echo ("$4.99/mo")
- **Primary CTA:** Pill (25px radius), accent fill, ctaBig shadow: "Start 3-day free trial →"
- **Fineprint:** Centered, 10px, muted: "$39.99/year after trial. Cancel anytime."
- **Footer links:** Restore · Terms · Privacy

### R13b — Nudge (hero)
- **Mascot:** `ruphus-waving.mp4`, hero 410
- **Headline:** "Sure I can't guide you?"
- **Body:** "I'll be in the app whenever you need me. You can always come back to this from Settings."
- **CTAs (dual):** Primary `Try free for 3 days` (accent fill) + secondary `Continue without` (outlined, muted text)

## Interactions & state

State variables (preserve from existing onboarding store):

| Variable | Type | Set on |
|---|---|---|
| `goal` | enum | R2 selection |
| `painPoint` | enum | R3 selection |
| `palateProfile` | array of {flavor, liked} | R5 swipes |
| `displayName` | string | R7 |
| `grinder` | enum | R7 |
| `brewMethod` | enum | R7 |
| `cameraPermission` | bool | R8 system prompt result |
| `trialConsent` | bool | R12 toggle |
| `selectedPlan` | `pro_annual` \| `pro_monthly` \| `ultra_annual` \| `ultra_monthly` | R13 |

Animations / transitions:
- **Mascot loops:** native `<video autoplay muted loop>`. No JS needed.
- **R5 swipe cards:** transform-translateX on drag, snap with 200ms ease-out on release; off-screen card fades opacity over 150ms before unmount.
- **R10 scanning beam:** CSS `@keyframes` translateY 0% → 100%, 2.5s linear infinite.
- **R9 progress bar:** width transition over the actual processing duration; quip text rotates every 1.5s.
- **R13 plan-row selection:** background and color cross-fade over 150ms.
- **Screen-to-screen:** use the existing onboarding router's slide-left transition. Do not add new transitions.

## RevenueCat / Paywall integration

R13 must read prices live from `Purchases.getOfferings()` — **do not hardcode** the `$39.99` / `$79.99` / `$4.99` / `$9.99` strings shown in the design. The codebase already does this in `src/components/PaywallSheet.jsx`; reuse that data-fetch logic.

Match packages by StoreKit product identifier suffix:
- `pro.monthly`, `pro.annual`, `ultra.monthly`, `ultra.annual`

Free-trial label only shows when `package.product.introPrice` is present and `priceString === '$0.00'`. Use the existing `introTrialLabel()` helper.

## Files in this bundle

| File | What it is |
|---|---|
| `Onboarding Redesign.html` | Top-level prototype — boots React + Babel, mounts the design canvas with all 14 artboards |
| `screens.jsx` | **All 14 screen components** + shared primitives (MascotStage, TopBar, NoteBubble, CtaBar, PeekScreen, IntroScreen, FeatureGlyph, TierCard) — your primary reference |
| `design-canvas.jsx` | Pan/zoom canvas frame for laying out artboards — **prototype-only, do not port** |
| `tweaks-panel.jsx` | Live tweaks UI — **prototype-only, do not port** |
| `icons.jsx` | Inline SVG icons used by R2/R3/R7 chip rows — port these into the codebase's icon system |
| `ios-frame.jsx` | iPhone bezel chrome for the prototype — **prototype-only, do not port** |
| `assets/ruphus-*.mp4` | All 15 mascot loops |

## Implementation checklist

- [ ] Copy all 15 `ruphus-*.mp4` files into the codebase's video assets dir; update import paths
- [ ] Create `MascotStage` shared component (and the R1 mask wrapper)
- [ ] Update each `R*.jsx` in `Coffee-App-Build/src/components/onboarding/screens/` to match `screens.jsx`
- [ ] Verify R13 still wires through `useOnboardingPaywall.js` and `PaywallSheet`'s purchase flow — only the visual layer changed
- [ ] Confirm R11 spider chart SVG renders at all phone widths (350–430)
- [ ] QA: cycle every screen on a real iOS device — videos must autoplay (require `playsInline` + `muted`)
- [ ] QA: confirm Pro/Ultra cards on R13 show live prices from RevenueCat, not the hardcoded ones in the prototype

## Open questions for the developer

- **R10 scan beam direction:** prototype uses top-to-bottom; product team may want diagonal to better mimic native scan UX.
- **R5 card content:** prototype uses placeholder flavor descriptors; the existing `coffeeKnowledge.js` may have canonical flavor copy worth pulling in.
- **R9 quips:** prototype rotates 3 strings; consider 6+ for a 5-second processing window.
