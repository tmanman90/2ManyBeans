# Contributing to /rip-it

Guide for maintaining and extending this skill. Written for future-Tal and any AI agent updating it.

## Folder layout

```
~/.claude/skills/rip-it/
├── SKILL.md                    # Orchestrator only. No rules, no templates, no examples.
├── resolve-input.md             # Step 1 — 3 invocation modes
├── single-shot.md               # Step 5 — implementation path for 1-2 phase plans
├── phase-loop.md                # Step 5 — implementation path for 3+ phase plans (autoresearch loop)
├── blockers.md                  # Blocker vs. nitpick classification rules
├── gotchas.md                   # Failure patterns from real runs (append-only)
├── learnings.md                 # Stub for future prior-run pattern surfacing
├── feedback.log                 # Tal's corrections — read first, append on correction
├── CONTRIBUTING.md              # This file
├── examples/
│   └── report-template.md       # Summary report structure (step 7)
└── scripts/
    └── count-phases.sh          # Phase counter for step 4
```

## Where new content goes

| Adding... | Put it in... |
|---|---|
| A new failure pattern hit in a real run | `gotchas.md` |
| A correction from Tal during a run ("your NEEDS EYES bar is too noisy") | `feedback.log` |
| A new blocker classification example | `blockers.md` (examples table) |
| A new invocation mode | `resolve-input.md` + update SKILL.md step 1 (minimal) |
| A new implementation strategy (beyond single-shot / phase loop) | New file `<strategy>.md`, plus add branch in SKILL.md step 5 + update `scripts/count-phases.sh` or add a detector |
| A change to the report format | `examples/report-template.md` only — never inline in SKILL.md |
| A new "step" in the pipeline | SKILL.md + new step file if the step has substance; inline if <5 lines |

## Principles

1. **Orchestrator stays rule-free.** `SKILL.md` is a pure workflow: "read this file, follow its procedure." If you find yourself adding rules or templates to the orchestrator, put them in a step file or example file instead.
2. **Progressive disclosure.** `single-shot.md` and `phase-loop.md` are conditional — only one is read per run. Keep mode-specific content scoped to its mode file.
3. **Explain the why.** Don't write rigid MUSTs without a reason. If a retry cap matters, say why it matters ("after 3 fails, something the skill can't see is wrong"). Future maintainers need to be able to judge edge cases.
4. **Compound over accumulate.** Don't keep adding rules on top of rules. When `feedback.log` captures a correction, that correction should eventually get folded into the relevant step file so it becomes the new default — then you can clear the log entry. Otherwise `feedback.log` becomes infinitely long and the step files drift from reality.
5. **Retry caps are load-bearing.** The 3-cycle caps in single-shot and phase-loop are not "try harder" — they're a signal to the human. Don't raise them without a reason. Don't remove them.

## Keeping it honest

After every ~5-10 runs, re-read `feedback.log` and `gotchas.md` together. If a correction appears 3+ times, it's no longer a correction — it's the new default. Fold it into the relevant step file and clear the log entry. Same for recurring gotchas — if a failure pattern keeps showing up, maybe the step file needs to change to prevent it, not just warn about it.

## Auditing

Run `/skill-audit rip-it` after any substantial change to re-check against Anthropic's best practices scorecard.
