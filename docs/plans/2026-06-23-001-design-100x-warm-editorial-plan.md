# Design 100x — "Warm Editorial, Elevated"

Status: ACTIVE · Branch: `redesign` · Owner: Opus (orchestrator)
Goal: Take Coffee Hub's UI from "looks like the old version / AI slop" to top-1%,
Apple-Design-Award-tier craft. Verified on the iOS simulator, reviewed by Codex.

## Hard constraints (do NOT violate)
- NO Firebase schema / data-model changes. Production app reads the same Firestore.
- NO feature changes. Behavior, flows, and data stay identical. UI/UX only.
- Keep all token KEYS in `styles/theme.js` (consumed across ~60 files); values may change, keys stay backward-compatible.
- iOS first: safe areas, 44pt targets, 16px+ inputs, transform/opacity motion only.

## Aesthetic North Star
Warm editorial, elevated. Kinfolk magazine meets iOS. Warm paper / espresso / caramel
soul kept; serif character kept (Fraunces); executed at magazine + Apple bar:
imagery integrated with gradients + depth, real material/light, flawless typography,
SwiftUI-grade choreographed motion (matchedGeometry shared-element morphs, spring physics).

## Slop kill-list (acceptance criteria — every one must be gone)
- [ ] No casual SCRIPT font (Caveat) in any functional UI text. Wordmark logo asset may remain; nothing else.
- [ ] No off-palette colors (e.g., powder-blue "Iced flash brew"). One coherent warm system + status hues only.
- [ ] No flat/depthless full-bleed buttons. Real material, press states, optical alignment.
- [ ] No hard image→content seams. Hero + product imagery integrated with gradient/parallax.
- [ ] No cramped/illegible icon clusters. Clear hierarchy, breathing room, legible affordances.
- [ ] No debug artifacts in UI (e.g., "R1"/"R5" labels leaking on screen).
- [ ] No awkward line wraps / orphaned slashes in headings.
- [ ] No foggy low-contrast body text. WCAG-sane contrast on warm paper.
- [ ] Consistent vertical rhythm + grid across every screen. No dead, intentionless space.
- [ ] Motion on every meaningful state change; nothing "snaps" without choreography.

## Work breakdown (Sequence A: foundation + flagship, then sweep)
1. FOUNDATION — `styles/theme.js` + `styles/global.css`: type system (purge script, tune
   serif/sans pairing + scale), unified palette, material/elevation/light rules, motion system.
2. PRIMITIVES — Btn, Card, tab bar, sheet/modal, badges/chips, speech bubble, Wordmark treatment.
3. FLAGSHIP — Rotation home (App header + tab bar chrome + RotationTab + BeanCard). → SHOW TAL on iOS sim.
4. (checkpoint: Tal confirms the bar)
5. SWEEP — Tasting, Inventory, Chat, Archive to the same bar.
6. SWEEP — Onboarding 13 screens (R01–R13b).
7. iOS sim verification pass across all screens; Codex review pass.

## Orchestration
- Opus: design system, flagship, specs, integration, final taste calls.
- Sonnet subagents: audits, research, mechanical propagation against specs. One task each.
- Codex (`codex:rescue`): review each substantive diff before "done".
- Verify: iOS sim screenshots at each checkpoint, scored against the kill-list above.

## Trading-Card evolution — acceptance gates (verify each on the iOS sim, real account)
- [ ] G1 FRONT = the coffee bag as a premium "card face," bag centered; name/origin/gauge present.
- [ ] G2 BACK is COMPLETE — every field present in EditBeanModal must appear: origin, variety, process,
      roast date, producer, region, farm, altitude, roast level, cup score, sourced by, brewing rec,
      shelf life, roast style, weight, grind doses — PLUS the peak-timeline graphic, source insight,
      and tasting history. Nothing in edit may be missing from the back.
- [ ] G3 All shelf cards are the SAME height regardless of content.
- [ ] G4 Animations: smooth 3D trading-card flip; carousel focal scale/parallax; choreographed entrance; no jank (transform/opacity only, WKWebView-safe, prefers-reduced-motion honored).
- [ ] G5 No regressions: Codex clean; brew/taste/finish/freeze/return/edit/learn all work; NO Firebase/data changes.
- [ ] G6 Verified on the real account on the iOS simulator with screenshots reviewed against G1–G4.

## Status log
- 2026-06-23 (cont.): Tal logged into real account on sim. Feedback: detail-card BACK missing fields vs
  edit (brewing rec, shelf life, roast style, peak graphic, source insight, doses); surface the peak
  graphic; evolve to TRADING-CARD design (front=bag centered, back=stat sheet); uniform card heights;
  premium SwiftUI-grade animations. Gates G1–G6 above.
- 2026-06-23: Plan created. Direction + sequence confirmed by Tal via AskUserQuestion.
  Grounded in current code + onboarding screenshots. Launching audit + animation-catalog agents.
