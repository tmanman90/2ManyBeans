# Espresso implementation completion contract

Status: local implementation complete with documented baseline exceptions. Native goal registered: **true**. Owner: `01a130db-9e69-7e50-bb9c-2b0fae73f4ad`.

Final outcome: [acceptance index](acceptance-index.json), [independent verdict](review-final-acceptance.md), and [structured implementation return](implementation-return.json). All U1–U4 local behavior gates are verified; three broad regressions fail identically on the starting source and whole lint retains unchanged errors. The worktree remains for user review. No release, native-device, or physical cup-quality acceptance is claimed.

Registration used the exposed `tools.create_goal` via `functions.exec`; subsequent exposed `tools.get_goal` returned the same thread, objective and active state. [Supported-tool state receipt](native-goal-receipt.json). No hidden application database was inspected or edited.

Plan: [R1–R9 / U1–U4](../../plans/2026-10-12-0920-feat-barista-express-espresso-plan.md). Current execution handoff supersedes that decision document's historical planning-only hold; the plan body is preserved.

Worktree: `/Users/talmeltzer/.codex/worktrees/espresso-recipes/Coffee-App-Build`; branch `codex/espresso-recipes`. Base `58d1643581c3a46aab797f8208989f16fd96162d` records reviewed Ruphus 1.1.255; actual deployed runtime source was `15f927350a4aabe0d5041e393ea255c7d250f600`. Release receipt is `docs/releases/ruphus-brew-evidence/release.md`. This is local receipt verification, not a fresh production inspection.

Primary writer: native agent `/root/espresso_writer` (Bohr), requested `gpt-5.6-luna`, high. Dispatch accepted; no independent served-model attestation. Root owns canonical verification, review, commits and goal closure. Independent review uses Sol medium/high. Workflow: goal-babysitter with ce-work return-to-caller; sequential units, one writer.

## Required outcome

- U1: independent espresso machine/grinder/basket preferences and correct existing brew entry routes.
- U2: researched source-labeled recipes, direct edits, persistence, bounds, cache and stale-response safeguards.
- U3: real contextual Ruphus advice and requested authenticated recipe mutations, truthful receipts, idempotency, revisions and guarded Undo.
- U4: existing eight-step tasting with espresso/milk cues, preserved cup context and immutable history, unaffected V60/Aiden flows.
- Acceptance: focused tests plus plan regression/lint checks; real desktop/mobile browser flow and accessibility review; independent correctness/security/design review with fixes verified.
- Live acceptance: all 12 scenarios × 3 natural-language variants through actual endpoint/model/context/tools, nonproduction persistence only; transcripts, initial/final states, tool traces and versioned results. Deterministic target/owner/revision/idempotency/Undo assertions. Scripted preview or mocked provider proof cannot satisfy this gate.

No completion until root independently accepts required evidence. Missing live credentials or external capability remains an explicit incomplete gate, never a passing result. Human espresso cup quality is not established by software tests.

## Boundaries

No publication, push, PR, merge, deployment, TestFlight, production/live-user writes, access/security changes or connected schema/config changes. Preserve all primary and other-worktree dirt, archives and research evidence. No storage pruning. Root serializes heavy jobs with shared machine lock and fresh CPU idle gate; writer initially limited to reads/edits and small serial tests. No external messages.

See `admission.json` for copied offered file hashes, original prework inventory and exclusions. Progress and results belong here, outside the immutable plan.
