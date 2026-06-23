# Coffee Hub — Visual Redesign Direction

Branch: `redesign` (based off `codex/feat-pamphlet-source-insights`, v1.1.229).
Goal: a complete visual redesign that looks top-1%-designer / Apple-Design-Award caliber, while keeping **every feature, flow, data model, Firebase call, and API proxy byte-for-byte unchanged.** This is a reskin + motion layer, not a refactor.

## Non-negotiable constraints (read before every edit)
- **Visual only.** No changes to data flow, state logic, props, Firestore reads/writes, `api/*`, RevenueCat, auth, or feature behavior.
- **Keep token NAMES backward-compatible.** Every key currently exported from `src/styles/theme.js` (`C.*`, `fonts.*`, `shadows.*`, `radius.*`, `cardBase`, `journalCard`) must keep existing. Upgrade VALUES, ADD new tokens. Same for `.btnp-*` class names in `global.css`.
- **Keep all 5 tabs, all screens, all modals, all navigation.** Same information shown. Restyle composition/hierarchy/motion, do not remove features or reorganize flows.
- **iOS first.** Follow `.claude/rules/ios-layout.md`: `env(safe-area-inset-*)`, 16px+ inputs, 44px tap targets, `100dvh`, `transform`/`opacity` for animation, avoid `box-shadow` on scrolling lists (use it on cards, not list containers).

## Design concept: "Modern Coffee Editorial"
Keep the warm coffee-journal soul. Remove what reads as AI-slop: overused script font, flat depth, literal stock illustration, loose spacing, generic nav. Add: true elevation, frosted liquid-glass chrome, disciplined editorial typography, spring motion, surgical shader hero moments.

### Principles
1. **Depth & material.** Near-white warm cards on a slightly deeper paper, soft layered warm shadows, frosted-glass floating chrome (tab bar, sticky headers, sheets).
2. **Typographic discipline.** Script (Caveat) is reserved for the wordmark + rare 1-word delight accents (e.g. "Aiden") ONLY. Display serif = Fraunces (warm, optical). UI = Nunito. Strong modular scale, generous line-height, tight optical alignment.
3. **Crisp contrast.** Near-black espresso text. One confident caramel accent. Muted, sophisticated status colors.
4. **Motion is the product.** Spring-based, GPU-only (transform/opacity). Tactile press states, sheet/page springs, shared-element transitions, staggered list entrances, bouncy gestures. Respect `prefers-reduced-motion`.
5. **Surgical delight.** WebGL shader hero moments where they earn their keep (warm animated steam/gradient behind the Rotation header & sign-in; subtle app-wide grain; delightful chat token-streaming). Never gratuitous; must stay 60fps on device.

## Token spec (target values for `src/styles/theme.js`)
Upgrade values; keep keys. Add the NEW token groups below.

```
C = {
  // Surfaces (deeper paper so near-white cards gain real elevation)
  bg: "#F3EDE4",          // warm paper
  bgDeep: "#EBE3D7",      // NEW: recessed wells / grouped-table bg
  cream: "#FFFDFA",       // near-white warm — cards
  card: "#FFFDFA",
  cardMuted: "#ECE3D8",
  // Text (near-black espresso for premium crispness)
  text: "#2A1A10",
  textMuted: "#7A6A5C",
  textLight: "#A18F7E",
  // Accent (richer caramel)
  accent: "#A86A38",
  accentLight: "#D8B68A",
  accentDark: "#4A2F1E",
  accentSoft: "#F3E4D2",  // NEW: tint fills, selected chips
  // Borders (hairlines)
  border: "#E7DBCD",
  borderLight: "#F1E9DE",
  hairline: "rgba(74,47,30,0.10)", // NEW
  // Status (muted/sophisticated) — keep keys
  green: "#5C8A66", greenBg: "#E9F1EB",
  amber: "#B98A33", amberBg: "#FBF3E1",
  red: "#B65C45",   redBg: "#FBEDE7",
  purple: "#6B5B95", purpleBg: "#F0EDF5",
  blue: "#3B7BD6",  blueBg: "#E5EEFB",
  // Navigation — keep keys
  navBg: "rgba(255,253,250,0.72)", navText: "#7A6A5C", navActive: "#A86A38",
}

// NEW: glass material tokens
glass = {
  chrome: "rgba(252,249,244,0.72)",   // tab bar / sticky header fill
  chromeBorder: "rgba(74,47,30,0.08)",
  blur: "saturate(180%) blur(20px)",
  sheet: "rgba(255,253,250,0.86)",
}

// NEW: type scale (px) + roles
fonts = {
  title: "'Caveat', cursive",            // wordmark + rare accent ONLY
  heading: "'Fraunces', 'Playfair Display', serif", // display + bean names
  body: "'Nunito', sans-serif",          // all UI
}
type = { // NEW size/weight/leading scale
  display: { size: 34, weight: 600, lh: 1.05, ls: '-0.02em' },
  h1: { size: 26, weight: 600, lh: 1.1,  ls: '-0.01em' },
  h2: { size: 20, weight: 600, lh: 1.15 },
  h3: { size: 17, weight: 700, lh: 1.2 },
  bodyL: { size: 16, weight: 500, lh: 1.45 },
  body: { size: 14, weight: 500, lh: 1.45 },
  label: { size: 12, weight: 700, lh: 1.2, ls: '0.06em', upper: true }, // section eyebrows
  caption: { size: 11, weight: 600, lh: 1.3 },
}

// Elevation (warm, layered, soft) — keep `card`,`button`,`modal`,`navActive`; add levels
shadows = {
  e0: 'none',
  e1: '0 1px 2px rgba(74,47,30,0.05), 0 2px 6px rgba(74,47,30,0.04)',
  e2: '0 2px 4px rgba(74,47,30,0.06), 0 8px 20px rgba(74,47,30,0.06)',
  e3: '0 6px 16px rgba(74,47,30,0.10), 0 18px 40px rgba(74,47,30,0.10)',
  card: <= e2, button: '0 1px 3px rgba(74,47,30,0.14)',
  modal: '0 -8px 40px rgba(74,47,30,0.14)', navActive: '0 4px 14px rgba(168,106,56,0.28)',
}

radius = { xs:8, sm:10, md:14, lg:18, xl:24, pill:999 } // keep sm/md/lg/xl, add xs/pill

// NEW: motion tokens
motion = {
  spring: { soft:{type:'spring',stiffness:260,damping:30}, snappy:{type:'spring',stiffness:420,damping:34}, bouncy:{type:'spring',stiffness:500,damping:24} },
  dur: { fast:0.16, base:0.28, slow:0.5 },
  ease: { out:[0.22,1,0.36,1], inOut:[0.65,0,0.35,1] },
}
```

### Component patterns
- **Card:** `cream` fill, `radius.lg`, `shadows.e2`, hairline border. Press → scale 0.985 + shadow drop (spring). Bean name in Fraunces.
- **Eyebrow labels:** the `type.label` style (uppercase, tracked, `textMuted`) replaces script section titles. Page titles in Fraunces display.
- **Buttons (`.btnp-*`):** keep classes. Primary = caramel with refined gradient + spring press; secondary = glass/outline; refine radii to 14. Add subtle scale-on-press via framer where wrapped.
- **Chips/badges:** `accentSoft` fill for selected, hairline outline otherwise, `radius.pill`, comfortable padding (min 24px height, never cramped).
- **Floating chrome (tab bar, sticky header):** glass fill + `backdrop-filter: glass.blur` + hairline top/bottom border. Active tab = fluid caramel pill/indicator that springs between tabs (shared layout animation), not a static circle.
- **Sheets/modals:** glass sheet fill, `radius.xl` top corners, grabber handle, spring presentation, backdrop blur fade.

### Motion library
Add `framer-motion` (React 19 compatible). Use `motion.*`, `AnimatePresence`, `layoutId` for shared-element & tab-indicator transitions, springs from `motion` tokens. Wrap with a `MotionConfig` honoring reduced-motion. Provide a tiny `src/lib/motion.js` exporting the token-driven variants/springs so screens stay consistent.

### Shaders (surgical, WebGL)
Small self-contained components in `src/components/visual/`:
- `SteamGradient` — animated warm caramel/espresso flow-field behind Rotation header + sign-in (replaces stock illustration). Pause when offscreen; cap DPR; static fallback on reduced-motion / context-loss.
- `GrainOverlay` — subtle fixed grain for tactile warmth (CSS/SVG noise acceptable if cheaper than WebGL).
- Chat token-streaming: shimmer/ink-bloom on incoming tokens (CSS/canvas, lightweight).

## Verification loop
- Fast loop: Vite dev server + `scratchpad/shot.mjs` (headless Chrome, iPhone 390x844 @3x, demo mode) → screenshot all tabs, inspect, iterate. Watch console errors (script reports them).
- Final loop: nvm 22 → `cap:sync` → iOS simulator (XcodeBuildMCP) → screenshot + frame-level transition inspection on key flows.
- Codex review pass before declaring done.
- Confirm zero diffs to `api/*`, `firebase.js`, data hooks, feature logic.

## Phase order
0 Foundation (done) · 1 Design system (theme.js/global.css/motion/shaders scaffold) · 2 Shared components · 3 Tabs · 4 Modals/sheets · 5 Onboarding · 6 Motion+shader hero polish · 7 Verify+codex.
