# Tasting Hero Frames

This folder contains a five-frame UI/UX direction for making tasting feel like the MVP hero of the app.

## Files

- `index.html`: reviewable gallery with five deterministic product frames.
- `audit.mjs`: Playwright + Sharp verifier for screenshots, image loading, tap targets, panel radius discipline, source-pattern checks, and nonblank captures.
- `screenshots/`: generated verification captures for each frame and the full gallery.
- `generated-concepts/`: raw Image 2 explorations used for composition and emotional tone.

## Direction

The core idea is not "Duolingo skin for coffee." It is a guided tasting loop with tiny wins:

1. Entry quest: tasting is positioned as today's palate-training mission.
2. Prediction: Ruphus gives a hypothesis before the user starts, so the session has stakes.
3. Active input: flavor selection updates a live taste fingerprint while Ruphus reacts.
4. Reveal: the user sees found vs expected notes and gets one coachable insight.
5. Saved payoff: the tasting becomes a journal receipt, streak progress, and a sharper fingerprint.

## Product Rules

- Ruphus is the emotional engine, but the coffee evidence stays readable.
- The palette stays in warm paper, espresso, clay, sage, and scarce caramel.
- Text is exact HTML, not generated-image lettering.
- Cards and chips use 8px radius; larger rounding is reserved for the phone shell and circular controls.
- The flow should feel premium, coach-led, and lightly game-like without adding toy UI.
