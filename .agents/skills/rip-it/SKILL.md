---
name: rip-it
description: Unattended feature implementation pipeline. Chains /ce:plan → /ce:deepen-plan → /ce:work → codex:rescue review → /ce:review with no approval gates, then writes a summary report. Use when the user says /rip-it, "rip it", "yolo this feature", "just build it", "walk-away mode", "rip it on this", "run rip-it on this plan/brainstorm", or wants to hand off a brainstorm/PRD and come back to a finished, reviewed feature. Also triggers when the user has just finished a brainstorm conversation in the current session and wants to send it straight into implementation. Always use this skill for hands-off feature builds — Tal explicitly designed this for leaving the computer alone.
user_invocable: true
---

# Rip It — Unattended Feature Build Pipeline

Tal kicks this off after a brainstorm or with a PRD in hand, then walks away. The entire point is no human in the loop until the end, so the pipeline never stops to ask "should I continue?" It runs to completion, then posts a single report. If a step fails hard, log the failure and keep going with whatever later steps still make sense.

## Always read first

Before running any step, read these two files and internalize their contents:

1. **`feedback.log`** — corrections and preferences Tal has given in prior runs. These override the defaults in the step files wherever they conflict. If `feedback.log` says "your NEEDS EYES bar is too noisy," apply that judgment for this run. If empty, no prior corrections exist yet.
2. **`gotchas.md`** — known failure patterns from real runs. Watch for them as you execute.

Optional: `learnings.md` (stub) will eventually summarize patterns from prior reports in `docs/rip-it-runs/`. Not wired up yet — skip it for now.

## Pipeline

### Step 1 — Resolve input
Read `resolve-input.md`. Follow its procedure. It returns **both** a path and a classification (`pre-plan` / `plan` / `deepened-plan`). The classification determines where the pipeline picks up — honor it in steps 2 and 3 below.

### Step 2 — /ce:plan (skip if input is already a plan)
**Only run if classification is `pre-plan`.**
Invoke `compound-engineering:ce-plan` with the resolved input file. After it returns, find the newest `.md` file in `docs/plans/` and capture that path as the plan file. If `/ce:plan` writes elsewhere, search for the newest `.md` file created in the last few minutes.

If classification is `plan` or `deepened-plan`, skip this step entirely — the path from step 1 is already the plan file. Log "skipped — input was already a plan" in the pipeline log.

### Step 3 — /ce:deepen-plan (skip if input is already deepened)
**Only run if classification is `pre-plan` or `plan`.**
Invoke `compound-engineering:deepen-plan` on the plan file. Capture whichever path is current after this step.

If classification is `deepened-plan`, skip this step too. Log "skipped — input was already deepened" in the pipeline log.

### Step 4 — Detect plan size
Run `scripts/count-phases.sh <deepened-plan-path>` to get a phase count.

- **1-2 phases** → single-shot mode
- **3+ phases** → phase loop mode

Be honest about the count. Don't force-fit a small plan into phase loop mode because the loop is fancier — the overhead isn't worth it for small features.

### Step 5 — Implement
- If single-shot mode: read `single-shot.md` and follow its procedure.
- If phase loop mode: read `phase-loop.md` and follow its procedure.

### Step 6 — Final /ce:review
Invoke `compound-engineering:ce-review` on the full feature diff. Run this regardless of whether per-phase / Codex reviews came back clean — phase-level reviews don't catch cross-phase integration bugs, and that's where the trickiest issues live.

### Step 7 — Summary report
Read `examples/report-template.md` for the exact report structure. Apply `blockers.md` to classify findings (blocker vs. nitpick) before filling in the NEEDS EYES section. Write the completed report to:

```
docs/rip-it-runs/<YYYY-MM-DD-HHMMSS>.md
```

Create the `docs/rip-it-runs/` directory if it doesn't exist. Never write the report anywhere else — Tal's workflow depends on that directory being the single source of truth for unattended runs.

### Final message to the user
Post one short message summarizing:
- Status (CLEAN / NEEDS EYES / FAILED)
- Path to the report file
- Branch the work landed on
- One-line "what's next" (e.g., "review and `/deploy`", or "fix the 2 NEEDS EYES items first")

That's it. No long recap — the report is the recap.
