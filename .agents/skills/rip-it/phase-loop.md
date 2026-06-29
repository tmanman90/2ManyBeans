# Phase loop mode

Use this path when `scripts/count-phases.sh` reported 3+ phases. The loop implements the feature phase-by-phase, reviews each phase as it lands, captures lessons forward, and never lets one stuck phase block the rest of the pipeline.

This is the autoresearch pattern applied to coding (try → evaluate → retain or discard → compound → next) with a Ralph Wiggum completion guard baked into the inner loop.

## Procedure — for each phase, in order

### 1. Implement the phase
Invoke `compound-engineering:ce-work` scoped to just this phase. Pass it the phase name/section from the plan so it knows where to focus. Don't let it drift into later phases.

### 2. Completion guard (Ralph Wiggum loop)
After `/ce:work` returns, check whether the phase's tasks are actually done:
- Look at the plan's task list for this phase
- Compare against the diff
- Watch for "skipped" or "TODO" notes in `/ce:work`'s output

If tasks remain, re-invoke `/ce:work` with "continue the remaining tasks in <phase name>." Cap at **3 completion-guard attempts per phase**. After 3 attempts, mark the phase incomplete in the phase log and proceed to the review step anyway — reviewing partial work still surfaces useful feedback, and the final report will flag it.

### 3. Review the phase
Invoke `codex:rescue` in review mode, scoped to this phase's diff. Codex is the per-phase reviewer because it's fast, independent (different model, catches what Claude misses), and cheap. Save the heavy `compound-engineering:ce-review` for the final cross-phase pass in step 6 of the orchestrator.

Use `blockers.md` to classify each Codex finding as blocker vs. nitpick.

### 4. Evaluate — autoresearch retain/discard
- **No blockers?** → retain this phase. Go to step 5.
- **Blockers?** → discard the "done" verdict. Feed the blocker findings back into `/ce:work` as a fix prompt. Loop back to step 3 (re-review the new diff).

**Hard cap: 3 fix-retry cycles per phase.** After 3 failed cycles, mark the phase `NEEDS EYES` with the unresolved blockers in the phase log, and advance to step 5 anyway. A stuck phase must never block the rest of the pipeline — Tal would rather come back to one phase needing eyes than a stalled run.

### 5. Compound the lessons
Invoke `compound-engineering:ce-compound` to capture what was learned from this phase: problems hit, fixes applied, patterns to reuse. This step is load-bearing — it's the entire reason the phase loop earns its overhead.

Without `/ce:compound` between phases, you're just doing chunked work. With it, phase N+1 is implemented by an agent that's absorbed everything from phases 1..N — the loop actually compounds. Do not skip it.

### 6. Advance
Move to the next phase. Repeat until all phases are processed (either retained clean or marked NEEDS EYES). Keep a running phase log with status, retry counts, Codex findings, and lessons compounded — the orchestrator will use it to populate the final report.

## Retry cap philosophy
The 3-cycle cap is load-bearing. It's not "try harder" — after 3 fixes fail, something the skill can't see is wrong, and Tal should see it before the loop piles more changes on top. Respect the cap. Same goes for the completion guard's 3-attempt limit: if `/ce:work` truly can't finish a phase in 3 passes, Tal needs to know.
