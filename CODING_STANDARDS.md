<!-- Copy of the Hub page coding/CODING_STANDARDS.md. Edit the Hub page, then copy it here. -->
# Coding Standards (all of Tal's apps)

The one standard for GETUP, 2ManyBeans, Doxin and any new app. Tal is not an engineer: the goal is apps that stay simple, with no dead code and nothing built "for later".

This page lives in the Hub (`coding/CODING_STANDARDS.md`). Each app keeps a copy at its root so reviews and cloud sessions can see it. Edit the Hub page, then copy it out. An app's own CLAUDE.md or AGENTS.md may add app-specific rules; where an app rule names something explicitly, the app rule wins.

## The 8 rules

1. **Build the simplest thing that works.** No layers, settings or abstractions "for later". Add them when a real need shows up.
2. **Delete what you replace.** No dead, commented-out or unused code, files, flags or assets left behind.
3. **Search for an existing helper before writing a new one.** Reuse what the app already has.
4. **One way to do each job.** One network client, one date formatter, one place each decision lives.
5. **Fix the root cause, not the symptom.** No retries, sleeps or special cases that hide a bug.
6. **Every bug fix ships with a test that would have caught it.** If the path cannot be tested (real mic, real device), say "unverified" until Tal has tried it.
7. **No new library without a one-line reason.** Write the reason in the PR.
8. **Small changes, each explained in plain English for Tal.** What changed, why, and what he should see.

## Smell baseline (judgement calls, after the 8 rules)

From Fowler's *Refactoring* (ch. 3), as carried by Matt Pocock's `/code-review`. Each is a hint, never a hard violation. A documented rule above or in the app wins.

- **Mysterious Name**: the name doesn't say what it does. Rename it.
- **Duplicated Code**: the same logic in two places. Share one copy.
- **Feature Envy**: a method that works mostly on another object's data. Move it there.
- **Data Clumps**: the same few values always travel together. Make them one type.
- **Primitive Obsession**: a string or number standing in for a real concept. Give it a small type.
- **Repeated Switches**: the same switch or if-chain in several places. Keep one map or one type.
- **Shotgun Surgery**: one change needs edits in many files. Gather what changes together.
- **Divergent Change**: one file edited for unrelated reasons. Split it.
- **Speculative Generality**: options or hooks nobody asked for. Delete them.
- **Message Chains**: long `a.b().c().d()` walks. Hide the walk behind one call.
- **Middle Man**: code that only passes calls along. Call the real target.
- **Refused Bequest**: a subclass that ignores most of what it inherits. Use composition.

## Dead-code check

Swift apps: Periphery (`periphery scan`, installed on the laptop) on request, report only. It wrongly flags SwiftUI previews, Codable members and protocol conformances, so every finding is checked by hand and nothing is deleted automatically.

## Lessons

Before building, grep `coding/lessons/` in the Hub for the task's topic. After a painful fix, follow the sort rule in `coding/README.md`.
