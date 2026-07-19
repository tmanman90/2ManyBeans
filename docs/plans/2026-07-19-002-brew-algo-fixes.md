# Plan: Brew Algorithm Fixes (post-audit day run)

2026-07-19. Executes the findings of `docs/data/algo-audit-2026-07-19/` (REPORT.md + 3 addenda). Research phase is COMPLETE: internal corpus, authority methods, Brew Commons algorithm, 19 official Fellow drop profiles, and a full 1,250-coffee / 1,172-profile census of the Aiden Profiler catalog.

Ground rules (Tal-set, non-negotiable):
- Aiden FAMILY_GRIND_BANDS and deterministic grind path NEVER change (pinned by verify harness).
- P2 Aiden items execute ONLY with Tal's explicit per-item opt-in; default is skip.
- Saved recipes / bean.aidenGrind never mutate; all changes affect newly generated recipes only.
- Every phase gates on: verify harnesses green + `npm run build` + all `scripts/*regression*.test.mjs` green.

## Phase 1 — P0 defects (hand-brew only)
1. `handbrew.js` `getDeviceFamilyDefaults`: intersect family tempC band with device tempRange instead of replacing (fixes all 7 family temp bands being dead code). Dark V60 guidance becomes 92-93C-max intersect, not 92-100C.
2. `coffeeKnowledge.js` `HANDBREW_POUROVER_KNOWLEDGE`: split "Sour/weak/astringent = grind finer" into: sour = finer or hotter; weak-but-balanced = raise dose/tighten ratio (never grind); astringent = coarser or cooler.
3. Kasuya 4:6 fidelity (`handbrew.js` technique block + `FAMILY_POUROVER_DEFAULTS` notes): 93C, medium-coarse, ~30s or drain-then-pour cadence, 4-pour (strength) and 5-pour (original) variants.
4. French press `ratioRange` [13,16] -> [13,17].

## Phase 2 — P1 evidence-backed adjustments (hand-brew + prose)
5. Dark-roast family: ratio 1:17-1:18 -> 1:15.5-1:16.5; temp band 88-91C; drop "wider ratio" note. (Census median 1:15.5; external consensus 1:15-16.)
6. Clean-natural family: ratio 1:15-1:15.5 -> 1:15.5-1:16.5; temp band stays hot (census: naturals brew at 95C, same as washed).
7. Aeropress prompt: mode-specific ratio guidance (standard 1:12-18; bypass concentrate ~1:6 explicitly permitted).
8. Attribution honesty: "from James Hoffmann" -> "Hoffmann-inspired / Atlas-derived / app-adapted"; V60 Ultimate bloom described as 2x/~45s with staged pours.
9. GRINDER_KNOWLEDGE prose: distinguish recommended starts from enforcement limits.

## Phase 3 — P2 Aiden opt-in (EXECUTE ONLY ITEMS TAL APPROVES)
10. Temp-curve mandate -> "match closest reference profile's curve shape; flat when no signal; decline (0.5-1.5C) or cool-bloom only with stated cause." (Officials: 8 flat / 8 declining / 3 mixed.)
11. `isWashed()` clarity enforcement scoped to light roasts.
12. Kenya hard override -> soft floors (census: light median 1:16.5; officials top out 1:17; Kieni reference 1:15.5 currently gets rewritten).
13. Roast-age auto-deltas removed from prompt (unsupported); freshness moves to reasoning text. (Note: Aiden Profiler sells this concept as "Freshness AutoPilot" — keep as future feature idea, not silent rule.)
14. Batch pulse fallback unified (repair ?? 3 -> ?? 4, matching prompt "usually 4"; census: 4 pours dominant).
15. Clean-natural Aiden bloom defaults: 92-94C/45-50s -> 94-96C/35-45s (census + Equator + Fellow Regessa).

## Phase 4 — Verification and ship
- Extend `scripts/verify-grind-calibration.mjs` -> add `scripts/verify-brew-params.mjs`: family temp intersection live (not replaced), troubleshooting directions correct (regex), Kasuya numbers, ratio ranges per device, dark/natural family values, Aiden pin STILL green (bands + enforcement unchanged unless opted-in items landed).
- Re-run the real-pipeline A/B (`aiden-ab` harness) for the 4 test beans; diff against `aiden-ab-results.json` baselines; confirm hand-brew changes do NOT alter Aiden outputs unless P2 items were approved.
- `npm run build` + full regression suite + `node scripts/verify-grind-calibration.mjs`.
- Commit per phase; `/ship-dev` at the end; Tal device-checks (Kalita Carmen Estate at 6.0 remains the physical gate from the grind fix).

## Explicitly NOT in this run
- classifyFamilyFallback washed-Pacamara branch (deliberate for Aiden per prompt line 166).
- Aiden micron divergence vs census (750um) — logged as taste experiment, no code change.
- peakStatus/roasterProfiles freshness windows (roaster-sourced; keep).
- Aiden temp ceiling 99 vs 98.5C (needs Fellow device spec confirmation).
