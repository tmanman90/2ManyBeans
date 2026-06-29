# Hero Shelf→Card Morph (matchedGeometryEffect for web)

## Summary
Make the bean **bag photo physically travel** from the small Rotation shelf card into the full
trading card (BeanDetailCard) when tapped — a continuous shared-element morph, not a fade-in. This
is the "Moment A" headline animation from the animation research: the user's eye never loses the
object as the detail view opens. Built with framer-motion `layoutId` (FLIP), the web-faithful
equivalent of SwiftUI `matchedGeometryEffect`.

## Problem Frame
Today, tapping a shelf card mounts `BeanDetailCard` in a `createPortal` overlay that scales/fades in
(`spring.soft`). The bag in the shelf hero and the bag on the trading card are two unrelated
elements — one disappears, the other appears. That discontinuity is the difference between "premium"
and "a modal popped up." Every other card surface is now flagship-grade; this is the one signature
moment still missing.

## Requirements
- **R1** — Tapping a shelf card animates the **bag photo continuously** from its shelf-hero position/size to its trading-card position/size (a single traveling element; no fade-in or teleport of the bag).
- **R2** — The morph is **GPU-safe**: only `transform`/`opacity` animate during the morph (no width/height/top layout thrash), so it holds frame rate on device (target 60fps on A14+).
- **R3** — **Closing** the card reverses gracefully — the bag morphs back toward the originating shelf card (or, if that card is offscreen, a clean scale/fade exit; never a janky snap).
- **R4** — The **scrim/backdrop** fades independently (its own `AnimatePresence`); only the hero element(s) morph. The scrim never participates in the FLIP.
- **R5** — **No regression** to existing BeanDetailCard behavior: flip to stat sheet, note rail, pull-to-dismiss (front + back), stat sheet scroll, bag float, peak badge.
- **R6** — **Reduced-motion**: with `prefers-reduced-motion`, the morph is disabled and the card uses the current scale/fade present (`useReducedMotion()` gate).
- **R7** — **Builds clean**: `npx vite build` exits 0; the standalone shelf+detail harness renders both states with **zero console errors**.
- **R8** — The morph does not fight the **bag float** (`m.div y:[0,-5,0]`) or **FitText** (`useLayoutEffect` resize) — no mid-animation jump from a competing transform or a font reflow during FLIP.
- **R9** — **Production-safe**: no Firebase data/schema/feature changes; ships to the Capgo **dev** channel only; main/prod untouched.

## Key Technical Decisions
- **KTD1 — framer-motion `layoutId` (FLIP), not SVG/Canvas.** The app already runs framer-motion; `layoutId` gives matchedGeometryEffect-style morphs using transforms only. SVG `feDisplacementMap`/manual FLIP are rejected (WKWebView-broken / reinventing the engine).
- **KTD2 — Shared `LayoutGroup` spanning the shelf and the portal.** `BeanDetailCard` renders via `createPortal(node, document.body)`, but the portal is still a React child of `RotationTab`. Wrapping the shelf carousel **and** the detail render in one `<LayoutGroup>` lets `layoutId` match across the portal boundary.
- **KTD3 — Morph the bag only (v1).** The bag is the hero object and the clearest continuity cue. Name/peak-badge morphs are deferred (KTD-defer) — more layoutId surface = more FitText/flip timing risk for marginal gain. Revisit after the bag morph is solid.
- **KTD4 — `borderRadius`/`boxShadow`/`overflow` as inline style on the morphing element.** framer FLIP distorts these if they live in CSS classes; the research flagged this explicitly. The morphing bag wrapper carries them inline.
- **KTD5 — Freeze FitText + park the float during the morph.** The bag float (`y:[0,-5,0]`) and any `useLayoutEffect` font resize must not run mid-FLIP. Gate the float to start `onLayoutAnimationComplete`; the bag name FitText is not a layoutId target in v1 (KTD3), sidestepping its reflow.
- **KTD6 — heroSpring `{type:'spring', stiffness: 380, damping: 36, mass: 1, restDelta: 0.001}`.** Snappy arrival with a hair of overshoot (Things-3 energy); tuned per research, adjustable at the verify gate.
- **KTD7 — Scrim stays in its own `AnimatePresence`; the morphing bag is rendered so it is mounted/unmounted naturally for `layoutId` handoff** (not gated by exit animations that would block the FLIP).

## High-Level Technical Design
```
RotationTab
└─ <LayoutGroup id="bean-hero">            ← KTD2: one group spans both
   ├─ shelf carousel
   │   └─ ShelfCard
   │       └─ <m.div layoutId={`bag-${bean.id}`} style={{borderRadius, overflow:'hidden'}}>  ← origin
   │             <img src={bagSrc}/>
   └─ {detailBean && createPortal(
         <BeanDetailCard>
           <AnimatePresence> scrim (fade only, R4) </AnimatePresence>
           …card…
             <m.div layoutId={`bag-${bean.id}`} style={{borderRadius, overflow:'hidden'}}>   ← destination
                <img src={bagSrc}/>            (float starts onLayoutAnimationComplete, KTD5)
       , document.body)}
```
FLIP sequence on open: detail mounts → framer reads both boxes for the shared `layoutId` → animates
the bag from shelf rect → card rect with `heroSpring` (transform only). On close: AnimatePresence
removes the detail; framer morphs the bag back to the still-mounted shelf `layoutId`.

## Scope Boundaries
- Do **NOT** change Firebase reads/writes, the bean data model, or any feature behavior — visual/animation only.
- Do **NOT** touch other tabs (Inventory / Tasting / Chat / Archive) or onboarding.
- Do **NOT** restructure the trading card's content or the shelf card's content — only introduce the shared morph wrapper around the existing bag image.
- Do **NOT** morph name/peak-badge in v1 (KTD3 defer).
- Do **NOT** deploy to production / merge to main — Capgo dev channel only (R9).
- Do **NOT** animate `backdrop-filter`, blur, or any non-transform/opacity property during the morph (R2).

## Implementation Units
- **U1** — Wrap the shelf carousel and the `BeanDetailCard` portal render in a single `<LayoutGroup id="bean-hero">` in `RotationTab.jsx`. No visual change yet; confirm build + harness still render. (R7, R9)
- **U2** — In `ShelfCard.jsx`, wrap the hero `<img>` in `<m.div layoutId={`bag-${bean.id}`}>` carrying `borderRadius`/`overflow:'hidden'` inline (KTD4). (R1)
- **U3** — In `BeanDetailCard.jsx`, wrap the front-face bag in the matching `<m.div layoutId={`bag-${bean.id}`}>` (inline radius/overflow), with `transition={heroSpring}` (KTD6). Replace the bag's float so it is parked until `onLayoutAnimationComplete` (KTD5). (R1, R6, R8)
- **U4** — Split presentation: keep the **scrim** in its own `AnimatePresence` (fade), and ensure the card body's open/close present does not gate the morphing bag's mount (KTD7, R4). Remove/မreconcile the card-level scale/fade so it doesn't double up with the morph (the morph carries the entrance for the bag; the rest of the card can still fade).
- **U5** — Wire **exit**: on close, the bag morphs back to the shelf `layoutId`. Handle the offscreen-origin case with a clean fallback (R3).
- **U6** — Gate the whole morph behind `useReducedMotion()`; reduced-motion path renders the current scale/fade with the bag simply present (R6).
- **U7** — Regression pass + verification: confirm flip, note rail, pull-dismiss (front/back), stat-sheet scroll, peak badge, bag float all still work (R5); `vite build` clean; shelf+detail Playwright harness renders both states with zero console errors and frame-capture shows the bag rect interpolating shelf→card (R1, R2, R7).

## Requirements Trace
- **R1** (bag morphs continuously) → U2+U3 wire the shared `layoutId`; verified by harness frame-capture asserting the bag bounding-box interpolates between the shelf rect and the card rect (not a jump), + human device sign-off.
- **R2** (GPU-safe 60fps) → judge review confirms only transform/opacity animate (no layout props in the morph path); human confirms smoothness on device.
- **R3** (graceful close/reverse) → U5; human sign-off on close behavior incl. offscreen-origin case.
- **R4** (scrim fades independently) → U4; judge confirms scrim is outside the FLIP and in its own AnimatePresence.
- **R5** (no regression) → U7; programmatic harness renders flip/notes/dismiss without error + judge review of diff for behavior preservation + human spot-check.
- **R6** (reduced-motion) → U6; programmatic harness with `prefers-reduced-motion` emulated shows no morph + judge confirms the gate.
- **R7** (clean build / no console errors) → programmatic: `npx vite build` exit 0 and Playwright harness console-error count == 0.
- **R8** (no float/FitText fight) → U3; judge confirms float is gated to `onLayoutAnimationComplete` and FitText is not a FLIP target; human confirms no mid-morph jump.
- **R9** (production-safe) → judge confirms diff touches no Firebase/feature code and only RotationTab/ShelfCard/BeanDetailCard; deploy is dev-channel only (manual).

## Open Questions
- None blocking. (Name/peak-badge morph is explicitly deferred, not open.)
