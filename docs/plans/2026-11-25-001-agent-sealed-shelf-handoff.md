# Handoff: Professor Ruphus agent can see sealed bags

Written 2026-11-25 for a Claude Code session on the Mac Studio, running unattended while Tal flies. Tal asked for this, so it is approved work. He cannot answer questions mid-flight. When a call is yours, make it, and record it under Results.

## The bug Tal hit

On the dev app, Tal asked the agent chat "what bean should I open?". It answered that it can only see his rotation, not his inventory.

Cause: `buildRotationSnapshot` in `api/_lib/ruphusEvidence.js` (about line 182) drops every bag with status `SEALED` or `FINISHED`. It also keeps at most 3 jars. `api/_lib/ruphusContext.js` (line 166) already loads the whole inventory through `readers.listCoffees({ uid })`, so the data is on the server. The model just never sees sealed bags. Today a sealed bag reaches the agent only when Tal names it (the tool path in `api/_lib/ruphusTools.js` around line 1396 resolves named references).

The same gap exists in production. Do not fix it there. See Hard limits.

## Goal

The agent knows Tal's sealed bags well enough to answer "what should I open next?" with a specific, reasoned pick. Example of a good answer: "Open the Kafiex Colombia next. It's 12 days off roast and enters its peak this week. The Fritz can wait, it's only 5 days off roast."

## What to build

1. **A sealed shelf in the snapshot.** In `buildRotationSnapshot`, add a separate `sealedShelf` list next to `coffees`. Keep the 3-jar rotation exactly as it is.
   - Per bag: a ref key (same `c<hash>` scheme, added to `refs`), name, roaster, origin, process, roast date, days off roast, and peak state (before, in, or past peak, with days).
   - Use the app's existing peak logic (`src/lib/peakStatus.js`, which has `getPeakStatus`, `daysSinceRoast`, `effectivePeakEnd`) if it imports cleanly server-side. Do not write a second peak formula.
   - Cap the list at 8 bags, ordered by who needs opening soonest. Add a line for any extras ("+N more sealed bags").
   - Give the sealed lines their own character budget, so they never squeeze out the rotation lines (`MAX_SNAPSHOT_CHARS` today).
2. **Mark them as unopened, everywhere.** The text line should read like "Sealed shelf (not opened yet): ...". The agent must never give a dial-in or brew adjustment for a sealed bag as if it were open. It may suggest a starting recipe if Tal asks.
3. **Prompt guidance.** In `api/_lib/ruphusPrompt.js`, tell the agent how to answer "what should I open next": weigh peak timing first, then rest days, then variety against what is already in the jars. Recommend one bag and give the reason in one or two sentences.
4. **Saves stay safe.** The save tools (`save_espresso_recipe` and the recipe tools) must keep their current guards. Adding sealed refs must not let a save land on the wrong bag. If sealed refs reach the tools, add a test proving a save still targets the exact bag named.

## Tests (all must pass)

- Extend `scripts/ruphus-evidence.test.mjs` and `scripts/ruphus-context.test.mjs`:
  - sealed bags appear in `sealedShelf`, with refs
  - FINISHED bags never appear
  - rotation output is unchanged when there are no sealed bags (compare to the current output)
  - the cap and "+N more" line work
  - the budget never truncates rotation lines
  - the "not opened yet" marker is present
- Run the full `npm test` in the worktree. It must exit 0. Also run `npx vite build`.
- Run one or two real agent conversations through the existing harness (`scripts/ruphus-conversation-runner.mjs`, with fixtures) asking "what bean should I open next?". Paste the answers under Results. Spend under $5 on model calls in total.
- Get a cross-model review (`/sol-review` or a fresh Codex agent) of the diff. Fix the real findings. Record what you skipped and why.

## Ship it to the dev backend only

The change is server-side, so the dev app needs no rebuild. The dev app calls the fixed address `https://twomanybeans-swaps-api.vercel.app`.

1. `git archive HEAD` of the worktree into an empty temp folder.
2. In that folder, write `.vercel/project.json` = `{"orgId":"team_b2otPdLE8X2H2q8OzB9UiqET","projectId":"prj_9T0rAE9Cs9Ia7qUDsf7HFPAgSAJy"}` (project `twomanybeans-swaps-dev`).
3. Run `npx vercel deploy --yes --target=preview` there. Its Preview environment already holds every production setting. Never add, read or print settings.
4. Probe the new deployment URL: `POST /api/ruphus-agent` with `Origin: capacitor://localhost` and `Authorization: Bearer x.y.z`. Expect `401 {"error":"Invalid or expired token"}`. Any 500 means stop: do not move the alias.
5. Move the alias: `npx vercel alias set <new-deployment-host> twomanybeans-swaps-api.vercel.app --scope tmanman90s-projects`. Probe the alias the same way.
6. If anything goes wrong after the alias moves, point it back at `twomanybeans-swaps-lrw9yo0ir-tmanman90s-projects.vercel.app`. That is the last known good backend.

## Hard limits

- App Review for 1.1 is in progress. Nothing goes to production: no `vercel --prod` on the `2manybeans` project, no Capgo production channel, no merge to `main`.
- Work in a separate worktree on branch `feat/model-swaps-2026-11` (for example `~/dev/coffee-model-swaps`). Do not touch the main checkout at `~/Documents/VIBE CODING/Coffee-App-Build`. Another session uses it for releases.
- Never read `.env` files or print secret values. Never change Vercel settings, protection or env vars.
- Do not change the model the agent uses. Model choice is a separate decision.
- Follow `CODING_STANDARDS.md` and `.claude/rules/`. Add a `lessons.md` line only if something bites.

## Setup on the Studio

```
cd "$HOME/Documents/VIBE CODING/Coffee-App-Build" && git fetch origin feat/model-swaps-2026-11
git worktree add ~/dev/coffee-model-swaps origin/feat/model-swaps-2026-11 -b feat/model-swaps-2026-11
cd ~/dev/coffee-model-swaps && npm install
```

`git fetch` and `git worktree add` leave the main checkout's files alone. If the worktree path exists, pick another.

## When done

Commit on the branch (one commit per logical step is fine), push the branch, then fill in Results below and push again. Tal reads this file when he lands. Write Results short and plain: no em dashes, lead with Done or Blocked, sentences under 25 words.

## Results

(filled in by the Studio session)
