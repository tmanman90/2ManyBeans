# Blocker classification

Use these rules to decide what goes in the final report's `⚠️ NEEDS EYES` section and what gets demoted to a nitpick. This is judgment work — feedback.log may override the defaults here over time.

## Definitions

**Blocker** — surface it under NEEDS EYES. Would break the feature, introduce a security hole, ship broken UX, drop data, fail in production, or contradict a hard requirement from the original spec.

**Nitpick** — do not surface. Stylistic preference, "could be cleaner," missing a comment, opportunity for further refactor, naming preference, minor DRY violation, test coverage gap in a non-critical area.

## When in doubt
Escalate to NEEDS EYES. Tal would rather glance at a non-issue than miss a real one. The cost of a false positive is a few seconds of reading; the cost of a false negative is shipping a bug.

## What not to do
Do not invent blockers to fill the NEEDS EYES section. If both reviewers came back clean, mark the report CLEAN ✅ and move on. The section should be empty when nothing is broken.

## Examples

| Reviewer finding | Classification | Why |
|---|---|---|
| "This function doesn't handle null input" on a user-facing form | **Blocker** | Would crash in production |
| "The variable name `data` could be more descriptive" | Nitpick | Cosmetic |
| "Firestore rules allow any authenticated user to write arbitrary fields" | **Blocker** | Security |
| "This component re-renders more than necessary" | Nitpick | Performance nitpick unless it's breaking UX |
| "The plan asked for a dark mode toggle; I only implemented dark mode without the toggle" | **Blocker** | Contradicts spec |
| "Consider extracting this into a hook" | Nitpick | Refactor opportunity |
| "Drops user input on keyboard dismiss" (iOS) | **Blocker** | Data loss / broken UX |
| "Missing JSDoc" | Nitpick | Documentation gap, not a failure |

These are starting examples. Over time, `feedback.log` will teach the skill where Tal's actual line sits — his calibration may be tighter or looser than the defaults here.
