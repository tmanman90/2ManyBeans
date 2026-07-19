# Addendum: Official Fellow Drop Profiles (Aiden Profiler scrape, 2026-07-19)

Source: fellowaidenprofiler.com catalog (Blazor SPA, harvested via Playwriter headless; profile modals are public, no auth). 19 of 23 rendered Official Fellow Drops parsed successfully. Raw dataset: `fellow-official-drops-scrape.json`. These are Fellow's own published Aiden recipes — the highest-authority external dataset available for this audit.

## Temperature curve shapes (the flat-vs-declining question)
Tally across 19 official profiles: **8 FLAT, 8 DECLINING, 3 MIXED (cool bloom then hot pours).**
Light roasts only: 6 flat, 5 declining — and of the declining lights, two are "hot bloom then flat pours" or a single late step, not a per-pulse staircase.

**Implication:** both shapes are common practice in Fellow's own recipes, so ANY mandate is wrong. The app's current MANDATORY per-pulse decline (0.5-1.5C every pulse) would mark 8 of Fellow's 19 official profiles non-compliant, including their flagship Regessa (flat 205F). This lands between the audit's original positions: not "flat is standard" (Equator) and not "decline is standard" (help-center snippet) — shape is a per-coffee choice. Confirms P2 item 10 (drop the mandate, allow both) with a softer default: prefer the closest reference profile's shape; flat when no signal.

Notable: the MIXED profiles (Painkiller 175F bloom then 205F pours; Pina Colada same pattern) are co-ferments using a COOL bloom to protect volatile aromatics, then hot pours. Our prompt currently discourages non-monotonic curves; worth allowing when a reference does it.

## Ratios
Official range: 1:14 to 1:17, median ~1:16. **Nothing at 1:17.5.** Our legacy A/B outputs ran 1:17.5 on three of four beans (pushed by the ratio-sanity floor + Kenya override). More support for P2 items 11-12: the app's enforced ratios sit above Fellow's entire official range.

## Bloom
30-45s across the board (median 35-40s), 2-3x implied. Bloom temps typically equal or above first-pour temp. Naturals span 190-205F (Regessa 205F flat; Muntasha 190F flat) — supports warming our clean-natural defaults, though the official spread is wide.

## Competitive intel (from their changelog, same session)
1. **They just shipped our exact grind fix:** "Grinder dial settings were reading too fine and now match Honest Coffee Guide's charts, so expect your numbers to shift coarser." Same diagnosis, same calibration source (HCG), same direction as commit 1abc587. Independent market validation.
2. Ode/Opus dials now step like the real dial (6, 6.1, 6.2, 7) — same as our ODE_GEN2_STEPS approach.
3. New grinders added by user request (Opus 2, Mazzer Philos, Lagom P80); grinder picker has a request flow.
4. Freshness AutoPilot: recipes auto-adjust as the bag ages ("bigger bloom while it degasses, a touch more heat once it's rested") — note this is the SAME concept as our roast-age deltas that the audit flagged as unsupported; they treat it as a premium feature. Worth watching, not copying blindly.
5. Premium: brew scheduling, multi-grinder, multi-Aiden, brew stats/streaks.
