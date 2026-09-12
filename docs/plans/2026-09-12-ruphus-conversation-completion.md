# Ruphus conversational task completion

Status: engineering acceptance complete, September 12. Authority: Tal's September 12 approval of the conversation-completion checklist. This is the current engineering acceptance contract, not a claim of universal perfection. See [observed acceptance and limitations](../qa/2026-09-12-ruphus-conversation-completion.md). Owner subjective verdict remains pending.

## Diagnosis and approach

The September 12 native replay established authenticated response delivery, not recipe-request fulfillment. It returned prose without a recipe card. Source inspection shows preview readiness still depends on phrase recognition although creating a preview does not change the saved recipe. Make semantic task intent available through the existing model/tool contract, while retaining server-owned target, source, equipment, permissions and save boundaries. Reuse the existing preview/action/persistence system; do not rebuild it or add a second agent framework.

Product direction follows the September 6 Coach Max acceptance document and the prior consumer-agent research: trusted context before advice, brief useful conversation, native outputs/actions, bounded visible continuity, discriminating clarification and truthful recovery. This is not a claim about competitors' private implementations.

## Required units and acceptance

1. **Recipe request completion.** Ordinary requests, not magic phrases, deliver an appropriate named source-backed card in the same response. Preserve information-only answers, real ambiguity, unsupported equipment and unavailable-source distinctions. Test paraphrases, new/empty recipe slots, and a model that stops at prose after reading options. Selection remains model judgment; exact source and target validation remain server-owned.
2. **Conversation continuity and usable preview.** Verify coffee switch, brewer correction, another technique, sensory follow-up, ratio-first strength advice, physical grinder clicks, full source instructions and dose scaling. Preview precedes timer. Do not invent a saved base or source precision.
3. **Persistent action and recovery journey.** In the signed-in Dev simulator: preview → changed dose → trial → leave/relaunch → recover trial → explicit Save → canonical readback → Undo. Verify failed reply remains recoverable across relaunch. Reuse focused action/idempotency/stale-state tests; restore all test recipe changes and preserve login.
4. **Acceptance and delivery.** Focused deterministic integration, rendered mobile/narrow/keyboard checks, signed-in native real-provider conversation journeys using varied language. Record actual outputs and failures, not only status codes. A known unmet requirement prevents completion. Owner subjective verdict remains separate.

## Boundaries

Continue in the existing isolated `codex/ruphus-technique-exploration` worktree. No phone, production app/backend/Firebase/Capgo changes, authentication backdoor, login wipe, unrelated plist edits, or deletion/staging of diagnostic ledgers/reports. Use existing supported Dev authentication. Cumulative paid testing ceiling remains $55; inspect settled spend and reservations before calls. No new research tournament or broad rewrite. Completion requires coherent merge-ready changes and a factual acceptance record; no production merge or release is authorized.
