# Single-shot mode

Use this path when `scripts/count-phases.sh` reported 1-2 phases. The plan is small enough that phase looping would be overhead without benefit — run it as one implementation pass, review once, done.

## Procedure

1. **Implement** — invoke `compound-engineering:ce-work` once with the deepened plan. Let it run to completion. When it returns, capture:
   - Files changed (`git status` + `git diff --stat`)
   - Any failures or skipped tasks it reported
   - Current branch state

2. **Review** — run `codex:rescue` in review mode against the full diff. Capture its findings. Use `blockers.md` to classify each finding as blocker vs. nitpick.

3. **Fix-retry loop (autoresearch)** —
   - If Codex reports no blockers → done, advance to step 6 (final `/ce:review`) of the orchestrator.
   - If Codex reports blockers → feed the blocker findings back into `/ce:work` as a fix prompt. Then re-run step 2 (Codex review) on the new diff.
   - **Hard cap: 3 fix-retry cycles.** After 3 failed cycles, log what's still broken, mark the implementation `NEEDS EYES` for the final report, and advance to step 6 anyway. Never spin forever on a stuck fix.

4. **Return** — hand control back to the orchestrator with the implementation state and any unresolved blockers for the report.

## Why this is simpler than phase loop mode

No per-phase compounding, no Ralph Wiggum completion guard, no cross-phase lesson carry. A 1-2 phase feature doesn't have enough inter-phase surface area for those mechanics to earn their cost. The single final `/ce:review` in step 6 does the integration-level checking.

## Retry cap philosophy
The 3-cycle cap is load-bearing. It's not "try harder" — after 3 fixes fail, something the skill can't see is wrong, and Tal should see it before more changes pile up. Respect the cap.
