# Onboarding 100x — Creative Spec (contract law)

This document is the EXACT creative direction for every screen. The orchestrator (Fable) excerpts
the relevant section into each implementation unit's prompt. The executor (Sonnet) implements it
verbatim: zero creative latitude. Any deviation, substitution, or "improvement" requires an
explicit orchestrator decision recorded in the loop log. Codex reviews the diff AGAINST THIS SPEC,
not against generic taste.

## 0. Design system (applies to every screen)

- **Tokens**: use the app's existing theme (`src/styles/theme.js` — C.* colors, fonts, radius,
  shadows). NO new hexes, NO new fonts. Warm paper ground, ink text, ONE accent (the app's
  existing accent), hairline borders `1px C.hairline`.
- **Type scale** (from existing screens): serif display (`fonts.title`) for headlines 32-38px,
  tracking -0.02em; grotesk body 15-17px/1.5; uppercase eyebrows 11px/700/0.14em tracking, gray.
  Numbers always `tabular-nums`.
- **Layout skeleton** (unchanged from OnboardingPrimitives): OnboardingTopBar (progress + back,
  44pt) → MascotStage hero video → content block → OnboardingCtaBar sticky bottom with safe-area
  padding. Content max-width stays as today; CTA is the existing GlassButton/primary pattern
  (Liquid Glass per docs/internal/liquid-glass-button-spec.md — tint gradients are approved
  material).
- **Motion law**: entrances = CSS keyframes only (opacity + translateY 8-12px, 240ms,
  cubic-bezier(0.22,1,0.36,1), stagger 60ms per item, max 5 staggered items); interactions =
  framer whileTap scale 0.96 / layoutId slides only; NO framer mount animations, NO animated
  backdrop-filter, NO width/height animation. Everything reduce-gated: under
  prefers-reduced-motion all keyframes render final-state instantly and videos show poster frames.
- **Haptics**: selection() on every choice/CTA; medium() reserved for the three landmark beats
  (scan result lands, palate chart completes, redemption success).
- **Copy voice**: Professor Ruphus speaks in first person, warm-professor, short sentences, no
  hype words, no em dashes, never bare "Ruphus". Screen headlines are outcomes, not features
  ("Brew coffee you're proud of", never "AI-powered scanning").
- **Video → screen map** (all served from /images/ruphus-animations/ via assetUrl CDN rewrite;
  poster frames extracted at build prep as <name>-poster.jpg, same folder):
  R01 welcome-v2 · R02 thinking · R03 listening · R04 reading-book · R05 sniffing-beans ·
  R06 presenting · R07 holding-grinder · R08 magnifying-glass · R09 examining-v3 (UPGRADE from
  celebrating: examining = "working on your profile") · R10-scan first-bean (NEW use: Ruphus
  meets your first bean) · R11 cupping · R12 thumbs-up · R13 confident (NEW use: paywall backdrop
  quiet confidence) · R13b waving · redemption-success fist-pump (NEW use) · post-purchase
  brew-complete (NEW use, only if purchase path shows celebration beat) ·
  OnboardingErrorBoundary empty-cup (NEW use: the reset screen gains the mascot, h200, with the
  corrected "Professor Ruphus needs a quick reset" copy).
  All six new-use videos were frame-verified against their beats on 2026-07-09 (orchestrator
  review). Note: R08 magnifying-glass and R09 examining-v3 are both "inspection" poses
  back-to-back — acceptable because R08 inspects a BAG and R09 inspects BEANS; the executor
  must not swap them.

## 1. Progress system (U9)

Three chapters rendered as segmented bar: [You] [Your taste] [Your plan] — R01-R04 = You,
R05-R09 = Your taste, R10-R13b = Your plan. Bar = 3 pill segments (height 3px, radius 999px,
gap 6px), each fills left-to-right within its chapter (scaleX transform, 200ms ease-out).
Endowed start: segment 1 renders 15% filled on R01. Above the bar, 10px right of the back
button: the CURRENT chapter label only, eyebrow style, cross-fades 160ms on chapter change.
role="progressbar" aria-valuemin=0 aria-valuemax=13 aria-valuenow=<step index>,
aria-label="Setup progress". Kill the dead `step` prop strings; the chapter map lives in
OnboardingFlow constants.

## 2. Screen-by-screen

**R01 Welcome** — unchanged layout. Copy tightening only: keep "Brew coffee / you're proud of"
(accent second line), keep NoteBubble intro. CTA "Get started".

**R02 Goal / R03 Pain** — unchanged structure (auto-advance chips). Chip spec: existing
OnboardingOptionList; selected state = ink border 1.5px + haptic, NOT color fill. New: after
selection, the NEXT screen's NoteBubble acknowledges the choice by name (e.g. R03 bubble when
goal=V60: "V60. A brewer after my own heart. Now, what's getting in the way?"). Acknowledgment
strings are a fixed 6-entry map per goal (write all 6 in the unit, no runtime generation).

**R04 Credibility (replaces SocialProof)** — headline "What I'm trained on." Eyebrow "YOUR
COACH". Video reading-book stays. Three hairline-bordered rows (NOT cards-in-cards): each is
icon (18px, ink) + title (15px/700) + one line (14px gray). Row 1 "The Hoffmann tasting method
/ Smell, slurp, structure. The same arc pros use, one beat at a time." Row 2 "The SCA flavor
wheel / Every note you'll ever taste, organized the way judges do it." Row 3 "Your actual
shelf / I read your bags, your roasters, your grinder. Advice about YOUR coffee, not coffee in
general." NO invented humans, NO star ratings, NO laurels we don't have. CTA "Continue".
Rows stagger-enter per motion law.

**R05 Palate deck** — mechanics unchanged (swipe deck, 5 cards, own dots). Card face refinement:
card = paper surface, radius 20, layered shadow (existing shadows.e2), prompt set in serif
display 24px centered, small eyebrow "SOUNDS LIKE YOU?" at top. The ✕/♥ buttons become 44pt
circular hairline buttons labeled "Not me" / "That's me" (12px caps below icons). Swipe rotation
follows existing pointer math; on 5th swipe, haptic.medium and 300ms hold before advancing.

**R09 Profile assembly (the real-labor beat)** — video examining-v3. Headline "Reading your
palate." The centerpiece: the ACTUAL OnboardingPalateChart assembling — axes draw in one at a
time (600ms apart, stroke-dashoffset or clip-path reveal via CSS), each axis label fading in
with its computed value, sequenced by a single CSS animation-delay chain. NoteBubble lines
change WITH the axes ("Sweetness first... you lean bright... body says medium..."), driven by
the same timing constants, referencing the user's real swipe results via the palate lib's axis
labels. Total ~3.2s, then auto-advance. Reduced motion: chart renders complete immediately,
single caption, 800ms dwell. NO fake percent counters, NO spinner.

**R10 First scan (the aha)** — two variants:
(a) camera granted: video first-bean. Headline "Let's read your first bag." Body "Grab any bag
from your shelf. Back label toward me." Primary CTA "Scan my bag" opens the existing native
camera flow; while scanning, reuse the RuphusThinking liquid-glass dots pill (existing
component) with captions "Reading the label…" / "Finding the roaster…" / "Almost got it…".
Result = a compact bean card: paper surface, radius 20, roaster eyebrow, name in serif 24px,
origin·process line, up to 3 note chips (existing chip pattern) — assembled with the standard
stagger. Below it NoteBubble: "A {origin} {process}. {one-line reaction from prediction lib}.
I'll keep the full breakdown for your shelf." CTA "Keep going". Secondary text button "Skip
for now" (always visible, 15px gray, 44pt target).
(b) fallback (denied/skip/timeout/error): headline "Here's what I'd say about a bag." — the
SAME bean card layout filled with a canned exemplar (one fixed Ethiopian washed example,
labeled "SAMPLE" eyebrow so it's honest), same NoteBubble shape. Never an error state on
screen; errors route silently to (b) with a soft toast only if a scan was attempted ("Couldn't
read that one. I'll get the next one on your shelf.").

**R11 Your coffee profile** — video cupping. Eyebrow "YOUR COFFEE PROFILE". Headline is the
palate archetype, serif 34px (a fixed 8-entry archetype map derived from dominant axes in
onboardingPalate.js, e.g. "The Bright Side", "Syrup & Structure" — write all 8 with one-line
subtitles). Chart renders complete (it already assembled in R09 — do not re-animate; 240ms
fade only). Below: ONE prediction row (18px serif italic): "First guess: you'll love {style} —
{two-word flavor cue}." Then the two feature rows tied to goal/pain (keep existing map, trim to
2). CTA label logic unchanged ("Scan my first bag" only when no scan happened yet and camera
granted, else "Continue").

**R12 Trial timeline** — keep the vertical stepper exactly (it's the Blinkist pattern) but
restyle to spec: timeline spine = 2px hairline with 3 nodes (10px ink dots), each row = day
eyebrow + 15px body. Copy: "Today / Everything unlocked. Scan, taste, brew with me at full
power." · "Day 5 / I'll remind you before anything happens. No surprises." · "Day 7 / Trial
ends. Cancel any time before and you pay nothing." Consent checkbox unchanged. CTA "See my
options". This screen and R13 must feel like ONE sequence: identical background, identical
type positions, so the transition reads as a page-turn not a context switch.

**R13 Paywall** — video confident, small (h180), top-right quiet. Page-one recap (before the
native sheet): eyebrow "YOUR PLAN IS READY". Headline "{archetype}, meet your coach." Three
value rows PERSONALIZED from answers (fixed template map: goal row, pain row, palate row —
e.g. pain=freshness: "Peak-window tracking so you never drink a stale cup again"). Then the
two plan cards (Pro / Ultra "RECOMMENDED" tag in accent) — hairline cards, NO gradient fills,
prices stay in the native sheet (unchanged mechanic), footnote line kept. Primary CTA "Start
my 7-day free trial" opens the native sheet. Below it, same visual weight as the footnote:
"Have an invite code?" text button → expands INLINE (height auto via grid-template-rows trick
or measured max-height, 200ms) to: 16px monospace input (uppercase-transform, placeholder
"2MANY-XXXXX", paste-friendly, autocorrect/autocapitalize off) + "Redeem" GlassButton +
inline error line (red-ink 13px, shake 2px×3 160ms on failure). Success: input collapses,
fist-pump video swaps into the MascotStage slot, headline crossfades to "You're in, brewer."
haptic.medium, 900ms dwell, then finish() → app. Close (X, 44pt, top-left) visible from t=0.
Skip path text unchanged ("Maybe later" native dismiss → R13b).

**R13b Nudge** — keep structure; the caveat-script "One more tiny thing" 38px heading stays
(it's charming and established). Primary CTA reflects held state: if a scan already happened in
R10 → "Take me to my shelf" (bean is waiting); else the existing scan/manual fork. "Maybe
later" NEVER downgrades a held scan (R8 fix).

**Card grind cell (U1)** — third StatBarItem: ACTIVE beans → icon = existing grinder glyph
style (match Flame/Leaf 20px ink line weight; if no grinder lucide icon matches the set, use
Settings2), label "Grind", value = grindText verbatim (FitText 13→8). SEALED/FINISHED or null
grindText → today's Weight cell byte-identical.

## 3. Asset production list (build-prep, not runtime)
- ffmpeg poster frames for all 16 mapped videos → same folder, `<name>-poster.jpg`, quality 80,
  first non-black frame. Wire into MascotStage as poster + reduced-motion swap.
- NO new generated images/videos. If a beat proves uncoverable by the existing library, STOP
  and surface to Tal (Higgsfield/image-gen is a Tal-approval decision, not a loop decision).

## 4. Copy bank rule
Every user-facing string in the diff must appear in the unit prompt (written by the
orchestrator) or in this spec. Sonnet writes NO copy of its own invention.

## Appendix A — Copy bank (orchestrator-authored, 2026-07-09; executors use verbatim)

### A1. R03 goal acknowledgments (NoteBubble opening, keyed by goal)
- Fellow Aiden: "The Aiden. Precision brewing, meet precision coaching. Now, what's getting in the way?"
- V60 / Pour Over: "V60. A brewer after my own heart. Now, what's getting in the way?"
- Aeropress: "The Aeropress. Small brewer, huge ceiling. Now, what's getting in the way?"
- French Press: "French press. Honest, full-bodied brewing. Now, what's getting in the way?"
- Espresso: "Espresso. The deep end. I like it. Now, what's getting in the way?"
- All of them: "All of them. A true generalist. Now, what's getting in the way?"

### A2. Palate archetypes (R11 headline + subtitle). Selection is DETERMINISTIC:
take the two axes with the largest |value| in fixed axis order (sweetness, acidity, body,
clean_funky, fruit_nutty) breaking ties by that order; match the first rule that applies,
top to bottom; all-zero chart or no match falls through to 8.
1. acidity>0 AND fruit_nutty<0 → "The Bright Side" / "Bright, fruity, alive in the cup."
2. sweetness>0 AND body>0 → "Syrup & Structure" / "Sweet, heavy, dessert in a mug."
3. fruit_nutty>0 AND body>0 → "The Comfort Classic" / "Chocolate, nuts, and a proper backbone."
4. clean_funky>0 AND acidity>0 → "The Purist" / "Washed, precise, nothing to hide."
5. clean_funky<0 → "The Wild Card" / "Naturals, ferments, the fun stuff."
6. sweetness>0 AND acidity>0 → "Candy Apple" / "Sweetness riding on bright fruit."
7. body<0 AND acidity>0 → "Tea & Light" / "Delicate, tea-like, floral-leaning."
8. fallback → "The Open Palate" / "Still mapping. Every cup teaches me more."

### A3. R11 prediction line ("First guess: you'll love {X}."), keyed by archetype number
1 "washed Ethiopians: lemon and florals" · 2 "natural Brazils: caramel and body" ·
3 "washed Colombians: cocoa and balance" · 4 "washed Kenyans: blackcurrant clarity" ·
5 "anaerobic naturals: wild and jammy" · 6 "juicy naturals: berries and sweetness" ·
7 "high-grown washed Geshas: jasmine and tea" · 8 "a washed Ethiopian: the perfect first test"

### A4. R13 personalized value rows (exactly three, in this order)
Goal row (by goal): Fellow Aiden "Aiden profiles tuned to every bag you scan" · V60 "Pour-over
recipes dialed to your grinder" · Aeropress "Aeropress recipes dialed to your grinder" ·
French Press "Immersion recipes dialed to your grinder" · Espresso "Dial-in guidance for every
new bag" · All of them "Recipes for every brewer on your bench".
Pain row (by pain): inconsistent "Step-by-step brews so every cup repeats" · forget-fresh
"Peak-window tracking so you never drink a stale cup" · 2manybeans "Every bag, jar, and roast
date on one shelf" · actually-taste "Guided tastings that train your palate cup by cup" ·
brew-like-pro "Professor Ruphus coaching you from bag to cup".
Palate row: "A coach who already knows your taste: {first phrase of palateSummaryLine}".
Null-safety: missing goal/pain/palate → substitute the generic rows, in order: "Recipes tuned
to how you actually brew" / "Peak-window tracking so you never drink a stale cup" / "A tasting
coach that learns your palate".

### A5. R10 scan-fallback sample card (fixed exemplar, eyebrow "SAMPLE")
Roaster "MOVING COFFEE" · name "Bombe Bensa" · line "Ethiopia · Natural" · chips: "Apricot",
"Lemon zest", "Rainier cherry" · NoteBubble: "A natural Ethiopian. Bright fruit, big
sweetness. When you scan a real bag, I'll do this for yours."
R10 scan-error toast copy: "Couldn't read that one. I'll get the next one on your shelf."

### A6. Redemption strings (R13)
Affordance: "Have an invite code?" · placeholder "2MANY-XXXXX" · button "Redeem" · success
headline "You're in, brewer." · error line by RedeemError code: invalid "That code doesn't
look right. Check it and try again." · already_redeemed "That code's already been used." ·
expired "That code has expired." · network/other "Couldn't reach the cafe. Try again in a
moment."
NO em dashes anywhere in UI copy (house rule).
