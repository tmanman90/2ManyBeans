# Full Algorithm Audit — 2026-07-19

Every recipe-generating parameter in Coffee Hub, audited against Tal's research corpus, published authority methods, and competitor tools. Grind dial/micron calibration was audited and FIXED separately earlier today (commit 1abc587, guarded by `scripts/verify-grind-calibration.mjs`) and is out of scope here.

## Method
- **Wave 1 (Sonnet extractors):** `params-inventory.md` (every app parameter, 5 source files read in full), `internal-claims.md` (51 claims from 5 Last30Days research files + World Atlas book intake), `external-evidence.md` (Fellow official/Brew Talks, Equator Coffees, Honest Coffee Guide, Kasuya 4:6, Hoffmann methods, Aiden Profiler competitor, Brew Commons competitor algorithm).
- **Wave 2 (Codex gpt-5.6-sol, effort high, read-only):** three domain audits — `verdict-aiden.md` (52 rows), `verdict-handbrew.md` (40 rows), `verdict-knowledge.md` (51 rows, closes the standing "Hoffmann Knowledge Audit" TODO).
- **Wave 3 (Fable):** adjudication below. Where I overrode a Codex verdict, it is marked OVERRIDE with rationale.

## Fable adjudications (overrides of Codex verdicts)
1. **Apollon's Gold peak windows (Codex: CONFLICTING/HIGH) -> KEEP, no action.** The 35-45d degas / 60-90d peak windows come from the roaster's own bag guidance (Japanese ultra-light long-rest school). Roaster-specific instruction beats the generic "use within one month" book guidance Codex weighed against it. Same logic covers the other style buckets: they encode roaster guidance, not universal claims.
2. **Grinder numeric claims in GRINDER_KNOWLEDGE (Codex: UNVERIFIED x6) -> VALIDATED.** The knowledge auditor's evidence pack predated today's calibration work. Every number was validated this morning against Honest Coffee Guide measured pages + real-world anchors; see `~/Documents/Last30Days/kalita-wave-grind-settings-fellow-ode-gen-2-raw-v3.md` and the verify harness.
3. **Declining-temp mandate (Codex: ADJUST/HIGH) -> ACCEPT, but P2 opt-in.** Codex's evidence is strong (16 of 23 explicitly-light reference profiles in our own corpus are FLAT) and its thermodynamic argument is sound. But this changes the Aiden path, which Tal considers dialed in, so it ships only with his explicit go.
4. **Aiden schema clamp ranges (Codex: UNVERIFIED x5) -> no action.** They are guardrails, not recommendations; loose bounds are the correct design. One exception noted in P3 (99C vs Aiden Profiler's claimed 98.5C device max).

## Prioritized fix list

### P0 — real defects, hand-brew only, no Aiden impact
1. **`handbrew.js:206-208` family temp bands are dead code.** `getDeviceFamilyDefaults` unconditionally replaces family `tempC` with the device's full `tempRange`, so all 7 family temperature bands (including dark-roast 88-93C) never reach the prompt; a dark roast on V60 gets 92-100C guidance. Fix: intersect family band with device range.
2. **`HANDBREW_POUROVER_KNOWLEDGE` troubleshooting line is wrong.** "Sour/weak/astringent = grind finer" — astringency is an over-extraction symptom (needs coarser) and weak-but-balanced is a dose/ratio problem (internal claim: strength is ratio, not grind). Split into three correct directions. Note: `BREW_TROUBLESHOOTING_RULES` (chat) is already correct; only the hand-brew block misroutes.
3. **Kasuya 4:6 technique block is unfaithful.** Published method: 93C, medium-coarse, ~30s or drain-then-pour intervals, 4-pour (strength) and 5-pour (original) variants. App hardcodes 5 pours at 45s.
4. **French press `ratioRange` [13,16] excludes Hoffmann's own 60g/L (~1:16.7).** Widen to [13,17].

### P1 — evidence-backed adjustments, hand-brew
5. Dark-roast family: ratio 1:17-1:18 -> **1:15.5-1:16.5**, temp band 88-91C (external consensus + Fellow dark recipes; current value has zero supporting evidence). Drop "wider ratio" from notes.
6. Clean-natural family ratio 1:15-1:15.5 -> **1:15.5-1:16.5** (Equator 1:16.5, consensus 1:16-17).
7. AeroPress: make ratio guidance mode-specific in the prompt (standard 1:12-18; bypass concentrate ~1:6 currently impossible despite the app recommending bypass).
8. Attribution honesty in `coffeeKnowledge.js`: label blocks "Hoffmann-inspired / Atlas-derived / app-adapted" instead of blanket "from James Hoffmann"; the V60 Ultimate bloom is 2x/~45s with staged pours, not 2x/30s single pour.
9. Clarify prose vs enforcement ranges (GRINDER_KNOWLEDGE says Ode pour-over "4-6", enforcement allows 4-8): present starts vs limits distinctly.

### P2 — Aiden path, OPT-IN ONLY (changes newly generated recipes; saved recipes/aidenGrind never change)
10. **Declining-temp mandate -> flat default, decline optional** (16/23 light references are flat; Equator states constant temps; decline stays as a tuning tool for late harshness).
11. **`isWashed()` enforcement ignores roast level** — dark/medium washed beans inherit light-clarity constraints (ratio >= 16.5, 20-25s intervals) against dark consensus 1:15-15.5. Scope to light washed clarity families.
12. **Kenya hard override rewrites exact reference profiles** (Kieni 1:15.5 gets forced to >= 1:17). Make overrides defaults that yield to exact sourced recipes.
13. **Roast-age auto-deltas unsupported** (late-peak +0.5 ratio; fading/stale + bloom/temp shifts have no quantitative evidence). Remove or downgrade to prompt suggestions.
14. Batch pulse source-of-truth: prompt says "usually 4", repair fallback is 3. Unify.
15. Clean-natural Aiden bloom: 92-94C/45-50s -> 94-96C/35-45s (Equator, Fellow Regessa, BC all agree).

### P3 — noted, no action
- Aiden temp ceiling 99C vs Aiden Profiler's claimed 98.5C device max (verify against Fellow spec someday; several app reference profiles use 99C).
- Chemex/Aeropress timing windows UNVERIFIED but plausible; no counter-evidence.
- Iced flash-brew +1C bump and 1-1.5-step finer shift: direction supported, magnitude uncorroborated; working fine in practice.
- Iced Aiden `ratio: 14`: neither hot ratio (1:10) nor total (1:16.8); the water/ice math itself is VALIDATED, so the field is cosmetic. Rename or document.
- `peakStatus` degas boundary semantics (status flips at degasMin while guidance shows degasMin-degasMax): cosmetic wording; check before touching.

## Scoreboard
143 parameters/rules audited: 46 VALIDATED, 30 ADJUST, 16 CONFLICTING-EVIDENCE, 51 UNVERIFIED (mostly harmless guardrails or plausible-but-uncorroborated). Two genuine code defects found (P0 items 1 and 2). Nothing audited today changes any saved recipe or Tal's dialed-in Aiden setup without explicit opt-in.

## Workpapers
`params-inventory.md`, `internal-claims.md`, `external-evidence.md`, `verdict-aiden.md`, `verdict-handbrew.md`, `verdict-knowledge.md` (this directory).
