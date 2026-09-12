# Ruphus conversational task completion

Status: **engineering acceptance complete for the bounded contract**, September 12, source `b52abb2`. Earlier readiness claims were reopened rather than relied upon. Fresh independently worded native journeys, observed failures and their reruns are recorded in [the consumer acceptance log](../qa/2026-09-12-ruphus-independent-consumers.md). All five gates below now have explicit evidence; this is not a guarantee of perfect answers or a production/phone release. Owner subjective verdict remains pending and separate.

## Diagnosis and approach

The September 12 native replay established authenticated response delivery, not recipe-request fulfillment. It returned prose without a recipe card. Source inspection shows preview readiness still depends on phrase recognition although creating a preview does not change the saved recipe. Make semantic task intent available through the existing model/tool contract, while retaining server-owned target, source, equipment, permissions and save boundaries. Reuse the existing preview/action/persistence system; do not rebuild it or add a second agent framework.

Product direction follows the September 6 Coach Max acceptance document and the prior consumer-agent research: trusted context before advice, brief useful conversation, native outputs/actions, bounded visible continuity, discriminating clarification and truthful recovery. This is not a claim about competitors' private implementations.

## Required units and acceptance

1. **Recipe request completion.** Ordinary requests, not magic phrases, deliver an appropriate named source-backed card in the same response. Preserve information-only answers, real ambiguity, unsupported equipment and unavailable-source distinctions. Test paraphrases, new/empty recipe slots, and a model that stops at prose after reading options. Selection remains model judgment; exact source and target validation remain server-owned.
2. **Conversation continuity and usable preview.** Verify coffee switch, brewer correction, another technique, sensory follow-up, ratio-first strength advice, physical grinder clicks, full source instructions and dose scaling. Preview precedes timer. Do not invent a saved base or source precision.
3. **Persistent action and recovery journey.** In the signed-in Dev simulator: preview → changed dose → trial → leave/relaunch → recover trial → explicit Save → canonical readback → Undo. Verify failed reply remains recoverable across relaunch. Reuse focused action/idempotency/stale-state tests; restore all test recipe changes and preserve login.
4. **Acceptance and delivery.** Focused deterministic integration, rendered mobile/narrow/keyboard checks, signed-in native real-provider conversation journeys using varied language. Record actual outputs and failures, not only status codes. A known unmet requirement prevents completion. Owner subjective verdict remains separate.

## Reopened acceptance procedure

Reuse the four units above; do not redefine the task around the latest example.
An independent cheaper consumer agent chooses fresh language and next steps from
actual responses, without reading implementation. Root operates the existing
signed-in Dev simulator serially, verifies rendered output and canonical state,
and evaluates each whole journey. Role-play is supplementary evidence, not a claim
of real human acceptance. One Luna execution worker investigates and implements
confirmed shared causes; no parallel simulator control or speculative rewrites.

Five current gates: (1) independently worded novice coaching and scaling,
(2) enthusiast recipes/corrections/another/coffees, (3) trial-return-relaunch-save-
Undo with complete readback/restoration, (4) ambiguity/information-only/failure
recovery, (5) targeted regressions and independent final transcript/visual review.
Record every observed failure, fix, and rerun; do not count historical passes as
new gates. Retain old transcripts and diagnostic ledgers. Keep one progress view
based on these gates, not time or test counts. Stop widening the exercise once
the unchanged requirements have evidence; this is not a new evaluation tournament.

### Operational limits

Continue in the existing isolated `codex/ruphus-technique-exploration` worktree. No phone, production app/backend/Firebase/Capgo changes, authentication backdoor, login wipe, unrelated plist edits, or deletion/staging of diagnostic ledgers/reports. Use existing supported Dev authentication. Cumulative paid testing ceiling remains $55; inspect settled spend and reservations before calls. No new research tournament or broad rewrite. Completion requires coherent merge-ready changes and a factual acceptance record; no production merge or release is authorized.
