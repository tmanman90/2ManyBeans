# Resolve input

Figure out which invocation mode applies, then produce a single resolved path that the rest of the pipeline will use as its spec document.

## Mode A — Path passed as argument
`/rip-it docs/prds/dark-mode.md` or `/rip-it docs/plans/2026-04-12-feat-foo-plan.md`

Use that file as-is. Resolve relative paths from the current working directory. But you also need to classify what *kind* of input it is so the orchestrator knows which pipeline step to start at — feeding a finished plan into `/ce:plan` would re-plan a plan, which is wasteful and confusing.

Classify using the path first, content as a tiebreaker:

| Lives in… | Treat as… | Orchestrator starts at… |
|---|---|---|
| `docs/brainstorms/` | Pre-plan spec | Step 2 (`/ce:plan`) |
| `docs/prds/` | Pre-plan spec | Step 2 (`/ce:plan`) |
| `docs/plans/` (filename doesn't mention "deepened") | Plan, not yet deepened | **Skip step 2.** Start at Step 3 (`/ce:deepen-plan`) |
| `docs/plans/` (filename contains "deepened" or file contains `## Research` / `## References` sections from deepen-plan) | Already deepened | **Skip steps 2 and 3.** Start at Step 4 (detect plan size) |
| Anywhere else | Use content: if it has `## Phase` headings or a task list with checkboxes, treat as a plan; otherwise a pre-plan spec | Based on classification |

Return **both** the path and the classification (pre-plan / plan / deepened-plan) so the orchestrator knows where to pick up.

## Mode B — In-session brainstorm (no file written yet)
The user just finished brainstorming in the current chat (often via `/ce:brainstorm`) and said something like "ok cool let's run /rip-it on this plan" or "rip it on this." The spec lives in the conversation, not on disk.

Before going further, write the brainstorm to disk so the rest of the pipeline has something to point at:

1. Synthesize the brainstorm conversation into a clean spec doc. Capture: feature name, problem statement, the approach the user agreed to, key requirements, any constraints they called out, and any open questions they explicitly punted on. Don't editorialize or add scope — only capture what was actually discussed and agreed to.
2. Write it to `docs/brainstorms/<YYYY-MM-DD>-<short-feature-slug>.md`. Create the directory if it doesn't exist. The slug should be 2-5 words, kebab-case, derived from the feature.
3. Return that path.

Do this silently. No need to ask "does this look right?" — the user already said go. The one exception: if the brainstorm was genuinely too thin to synthesize (no clear approach was agreed on, or the conversation was mostly exploration with no commitment), stop and ask before writing the file. This is the only acceptable pause in the whole pipeline before the final report.

## Mode C — No argument, no in-session brainstorm
`/rip-it` with no arg and nothing brainstormed in this session → find the most recent file in `docs/brainstorms/` by modification time:

```bash
ls -t docs/brainstorms/*.md 2>/dev/null | head -1
```

If `docs/brainstorms/` doesn't exist or is empty, stop and tell the user — there is nothing to plan from. This is the only other acceptable early-exit point in the pipeline.

## Output
1. A single path to the resolved document
2. A classification: `pre-plan` | `plan` | `deepened-plan`

Mode B always returns `pre-plan` (because the brainstorm synthesis is a spec, not a plan). Mode C is almost always `pre-plan` since it pulls from `docs/brainstorms/`. Mode A uses the classification table above.

The orchestrator reads the classification and jumps the pipeline forward accordingly:
- `pre-plan` → start at Step 2 (`/ce:plan`)
- `plan` → start at Step 3 (`/ce:deepen-plan`)
- `deepened-plan` → start at Step 4 (detect plan size)

Skipping steps is a feature, not a bug — if the user already did the planning work, don't redo it.
