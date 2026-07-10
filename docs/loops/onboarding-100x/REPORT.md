# onboarding-100x — Loop Report (2026-07-09/10)

**Status: SHIPPED TO DEV — awaiting Tal's device sign-off (v5-human, the final gate).**
Dev bundle: `1.1.229-devapp.20260710034910` on Capgo `dev`. Branch: `loop/onboarding-100x` (16 commits from merge-base). No prod deploy, no main merge.

## Gate results (Definition of Done)
| Gate | Result |
|---|---|
| v1 build | PASS (green after every unit) |
| v2 verify-onboarding.mjs | PASS 14/14 scenarios, ~77s, WebKit (stable ×3 + final rerun) |
| v3 regression (7 existing verify-*) | PASS ×3 runs across the loop |
| v4 codex | PASS after revisions: P1 review (2 minors fixed), P2+3 review (2 blockers + 6 majors + 4 minors → all fixed or approved-decision), 2 re-verify rounds, scoped final audit (3 findings → all closed) |
| v6 verify-onboarding-evidence.mjs | PASS — 19 required sim frames (every screen incl. scan aha, paywall recap, redemption states, grind card) |
| v5 human | **OPEN — Tal's on-device replay** |

## What shipped (R1–R16 all built)
- **Personalization is real** (R2-R4): `palateProfile.js` seam feeds chat context, Tasting Wizard expectations, recommendations (null-safe; legacy users byte-identical). R09 assembles the user's actual palate chart in staged beats; R11 leads with one of 8 deterministic archetypes + a first-guess prediction.
- **The aha before the paywall** (R5): R10 live-scans a real bag (12s timeout, full fallback matrix, skip always visible); the held bean commits at-most-once via App.jsx's consumer AFTER the profile write, with a cross-device dedup belt.
- **Paywall as narrative** (R6-R7): page-one personalized recap (archetype headline + goal/pain/palate value rows), native sheet on CTA tap, close at t=0, inline invite-code redemption (real `redeemCode()`, real API error codes, entitlement-verified fist-pump celebration, `completedVia: 'code_redeemed'`) on R13 and R13b.
- **Craft debt paid** (R8-R13): fabricated testimonials → verifiable credibility rows; all bare-"Ruphus" and ALL user-facing em dashes fixed; chaptered progress bar (endowed start, aria); R08 "Not now"; posters + reduced-motion gating for all 19 videos; postCompleteAction intent bug fixed; 3 dead files deleted; timing constants centralized.
- **Card tweak** (R1): ACTIVE beans show GRIND (computed grinder setting) in the stat bar; sealed/finished keep Weight.
- **Unbreakable** (R14-R15): 14-scenario WebKit harness with inert-by-default injection seams; 19-frame simulator evidence gate.

## Notable catches during the loop
- Codex found 2 blockers pre-ship: a duplicate-bean race in the scan handoff and celebrations firing on unconfirmed entitlements. Both fixed and re-verified.
- Sim evidence caught a real R13 layout collision (status bar/mascot/X overlap) invisible to the DOM harness — fixed with safe-area padding + MascotStage's radial mask on the corner mascot.
- A "scan skips its loader" report was root-caused to the capture agent tapping Skip: the Playwright suite proves the real path.
- `api/gemini.js`/`src/lib/gemini.js` structured-JSON changes predate the loop (prior scan-quality work formalized by Phase 1's add -A) — provenance documented (D25).

## For Tal (v5 sign-off script)
On the dev app (relaunch twice to apply `…034910`): Settings → wipe won't be needed — replay via a fresh account, or ask me to arm the DEV onboarding replay. Walk R01→R13b per the v5 prompt in LOOP_PROMPT.md: goal acknowledgment, credibility rows, swipe deck, palate assembly, live scan of a real bag, archetype reveal, trial timeline, recap paywall, redeem `2MB2026-VIP`-style code, Maybe-later intent, Reduce Motion pass, then an ACTIVE bean's card for GRIND.

## Ledger
25 orchestrator decisions in LOOP_LOG.md. Budget: well under the 15M ceiling. Model economy held: Sonnet executed all 13 units from verbatim creative briefs; Codex reviewed 6 times; Fable orchestrated, integrated, and fixed.
