# AI work after 1.1 clears review (2026-11-24)

Status: approved by Tal on 2026-11-24. Nothing here ships while 1.1 is in App Review. Ship step 1 before 2026-12-01, when Google reroutes `gemini-2.5-flash`.

Sources:
- Model eval: `~/dev/coffee-model-eval-2026-11-24/PLAN.md`, section "Measured results" ($26.70, blind judges from 3 labs, 1-10 scale).
- Agent plan: `docs/plans/2026-11-24-001-feat-ruphus-agent-for-all-plan.md` (section 0 holds every decision).

## Step 1. Model swaps (one release, right after review)

| # | Job | Today | New | Score today -> new | $ per call | Parameter trap |
|---|---|---|---|---|---|---|
| 1 | webResearch | gemini-2.5-flash | gemini-4-hydrogen, thinking low | 1.1 -> 8.0 | 0.0051 -> 0.0073 + search fee past 5,000 a month | Today's replies are cut off 7 of 7: thinking eats `maxOutputTokens` in `api/gemini.js` |
| 2 | imageAnalysis (also the agent's only way to see photos) | gemini-2.5-flash | gemini-4-hydrogen, thinking low | 1.0 -> 9.4 | 0.0021 -> 0.0077 | Same cut-off bug, 6 of 6 |
| 3 | productShot | gemini-3.1-flash-image-preview | gpt-image-2.6-sunburst, quality medium | Tal rejected 3 of 6 -> 0 of 6 | 0.0686 -> 0.0508 | New provider path in `api/product-shot.js`; 14 s vs 8.7 s |
| 4 | tastingCoach | claude-haiku-4-5 | gpt-6-luna, effort low | 5.3 -> 8.6 | 0.00045 -> 0.00003 | Raise the 110-token cap; effort counts against it |
| 5 | handBrewRecipe | gpt-5.4-mini | gpt-6.1-terra, effort none | 5.7 -> 9.1 | 0.0036 -> 0.0035 | 9.9 s vs 4.7 s |
| 6 | beanResearch | gpt-5.4-mini | gpt-6-luna, effort low | 6.8 -> 8.3 | 0.0030 -> 0.0004 | Raise the 600-token cap |
| 7 | beanStory | gpt-5.4-mini | claude-sonnet-5-5, no thinking | 6.4 -> 8.7 | 0.0022 -> 0.0112 | Sonnet 5.5 rejects `thinking: disabled`; use `between_tools` |
| 8 | recommendation | claude-haiku-4-5 | gpt-6.1-terra, effort low | 5.5 -> 8.8 | 0.0016 -> 0.0011 | Only 2 test cases |
| 9 | beanScan | gemini-2.5-flash | gpt-6.2-sol, effort low | 5.3 -> 8.3, field accuracy 0.98 both | 0.0033 -> 0.0083 | Gemini 3.5 Flash Lite (the Dec 1 reroute) invented a field on 1 of 3 photos |
| 10 | chatSearch | gemini-2.5-flash | gpt-6.1-terra, effort low | 3.0 -> 9.5 | 0.0022 -> 0.0214 | Only 2 test cases. Folds into agent web search later |
| 11 | regular chat (becomes the agent's fallback) | claude-sonnet-5 | claude-sonnet-5-5, no thinking | 5.6 -> 6.8 | 0.0158 -> 0.0159 | `buildClaudeParams` special-cases only `claude-sonnet-5` |
| 12 | Haiku 4.5 server fallback | claude-haiku-4-5 | claude-haiku-5-5 | not scored | cheaper | Haiku 4.5 retirement notice can come any time |

Keep as they are: Aiden recipes and score extraction (gpt-5.4-mini), note summaries.
Housekeeping in the same release: add every new model and the image models to `api/_lib/modelPricing.js`, delete `gemini-2.5-flash-preview-05-20` from the `api/gemini.js` allowlist.
Cost per user per month (assumed volumes): Pro $1.04 -> $1.06, Ultra $2.39 -> $2.49. Free, once: $0.22 -> $0.18.

## Step 2. Professor Ruphus agent for everyone (phases A to D, about 26 to 32 build days)

| Phase | What | Gate |
|---|---|---|
| A | Fix the guards that end turns (refusals no longer kill the turn), then the model rematch: 13 setups, about $18, hard cap $30 | Chosen model fails at most 1 of 30 conversations, zero catastrophic codes |
| B | Parity: full context, general chat, web search, photos, access switch, silent fallback, telemetry, "Professor Ruphus" copy fixes | At or above regular chat on 12 general cases, search 4 of 4, p95 at or under 12 s, 7 days of Tal's own use |
| C | Recipe changes for everyone (Tal, then all users) | M1, M2, learning loop and Fellow gates pass, 7-day soak at or under 3% failed turns |
| D | Other app actions: start a brew, guided tasting, open into a jar, finish, quick tasting, Aiden push, freeze, fix bean facts | Zero writes before a tap, stale refusal, exact undo |

## Step 3. Follow-ups

- Pro and Ultra setting "Make product shots automatically", off by default: the shot starts in the background after a scan saves a bean. Free users keep the 3-shot button.
