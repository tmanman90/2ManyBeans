# Report template

This is the exact structure for the summary report written at step 7 of the pipeline. Fill in the placeholders and write the result to `docs/rip-it-runs/<YYYY-MM-DD-HHMMSS>.md`.

## Status values
- **CLEAN ✅** — reviewers came back clean, nothing flagged as a blocker per `blockers.md`
- **NEEDS EYES ⚠️** — feature built, but at least one reviewer flagged a blocker Tal needs to look at before merging
- **FAILED ❌** — pipeline broke partway through (e.g., `/ce:work` couldn't complete the implementation)

## Template

```markdown
# Rip It Run — <feature name from input doc>

**Status:** <CLEAN ✅ | NEEDS EYES ⚠️ | FAILED ❌>
**Mode:** <single-shot | phase-loop (N phases)>
**Started from:** <input doc path>
**Plan:** <plan doc path>
**Branch:** <git branch>
**Run finished:** <ISO timestamp>

<!-- Include this section ONLY if there are real blockers per blockers.md. -->
<!-- If reviewers came back clean, omit the section entirely and mark status CLEAN. -->
## ⚠️ NEEDS EYES
- [reviewer: codex | ce:review] [phase N if applicable] — one-line summary of the blocker
- [reviewer: ...] — ...

## What got built
<2-4 sentence summary of the feature, paraphrased from the plan. Focus on what the user will see/experience, not implementation details.>

## Files changed
<output of `git diff --stat` against the branch base, or a plain list of changed files>

<!-- Include this section ONLY in phase-loop mode. -->
## Phase log
- **Phase 1 — <phase name>**: <CLEAN ✅ | NEEDS EYES ⚠️ | INCOMPLETE ❌>
  - Completion-guard attempts: <X>/3
  - Fix-retry cycles: <Y>/3
  - Codex findings: <one-line summary, or "none">
  - Lessons compounded: <one-line summary of what /ce:compound captured, or "none">
- **Phase 2 — ...**: ...

## Final /ce:review findings
<paste or summarize the cross-feature review, organized by reviewer agent (security, performance, patterns, simplicity, etc.). Apply blockers.md classification — mark blockers with ⚠️, nitpicks with a plain bullet.>

## Pipeline log
- Step 1 (resolve input): <mode A/B/C, resolved path>
- Step 2 (/ce:plan): <plan path, any notes>
- Step 3 (/ce:deepen-plan): <deepened plan path, any notes>
- Step 4 (detect plan size): <single-shot | phase-loop, N phases detected>
- Step 5 (implement): <mode, success/failure/retry summary>
- Step 6 (final /ce:review): <ok / brief findings summary>
```
