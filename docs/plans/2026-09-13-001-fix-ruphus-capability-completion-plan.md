---
title: Ruphus capability completion and evidence repair
type: fix
status: proposed
date: 2026-09-13
origin: docs/plans/2026-09-12-ruphus-conversation-completion.md
---

# Ruphus capability completion and evidence repair

September19 continuation: see `docs/plans/2026-09-19-ruphus-finish-existing-work-plan.md` for the proposed remaining-work sequence and final-candidate evidence requirements. It retains R1–R7 below while reconciling the intervening implementation/native evidence; do not restart the original baseline campaign or treat historical failures described below as proof they remain unchanged today.

## Summary

Make the entire shipped coffee-coaching conversation reliable across V60, Kalita, Switch, and Aiden, including hot/iced modes supported by the app. Repair shared source/outcome handling and demonstrated method-specific capability gaps using existing generators and native-card lifecycles rather than rebuild the agent. Acceptance must measure completed user journeys for each family, not successful requests or polite refusals.

Planning baseline: `417b6a8d876eb12326a5457bd90ebb7d521ddfe1`, `codex/ruphus-production-ota`. This document is a proposal, not implementation or release evidence. Reconcile the checkout and release state before execution.

## Problem frame: why previous completion claims failed

There is concrete evidence of a wrong acceptance boundary, not merely missing test wording. The scoped Aiden acceptance record explicitly observed Dev Jar one's absent profile, accepted a missing-profile explanation, then switched to Jar two to prove update/Save/Undo. That proved updating an existing profile; it did not fulfill the user's expectation that Chat can help with either jar without redirecting them into another workflow. See `docs/data/ruphus-agent-v3/aiden-acceptance-2026-09-12.md`.

The broader independent-consumer record contains real signed-in Dev journeys, not only mocks. Those remain valid evidence for their stated cases. They do not establish every source state or the production account's behavior. Later publication records establish deployed assets, not authenticated conversational success. Completion was communicated more broadly than these records support.

Current code has a deliberate capability gap: `api/_lib/ruphusTools.js` describes an existing Aiden profile as a prerequisite, while manual first recipes can be prepared in Chat. `src/hooks/useAidenBrew.js` can generate a first Aiden profile, but its orchestration also persists and pushes it to Fellow. Calling that hook from Chat would violate the intended authority boundary.

The current production failure's exact technical cause is **unconfirmed**. A screenshot saying “no saved profile” does not prove the model called the correct reader or that the cloud record is absent. Possible classes include wrong identity/coffee, environment/version mismatch, local-only or stale data, failed exact reads, composite evidence loss, or model misuse of evidence. More general coffee/consumer-product research cannot distinguish these.

This is not an Aiden-only repair. All families share reference binding, evidence reads, proposal gates, tool budgets, response checks, streaming, and card persistence. That establishes shared exposure, not a measured failure rate. There are also concrete non-Aiden restrictions: `read_technique_options` accepts hot V60/Kalita slots, and `propose_recipe_change` rejects non-dose edits of a `hasManualSourceProjection` recipe. A named technique card therefore does not establish that its next conversational adjustment works. Manual first-recipe creation is route-dependent, not universally available merely because one technique path supports an absent base.

## Requirements

- **R1 — Correct source:** preserve the selected coffee and brewer through clarification, correction, and navigation. Distinguish verified absence from failed reads, malformed sources, stale revisions, and unsynced cache.
- **R2 — Fulfillment:** an actionable recipe request returns a brief explanation plus a complete, named, matching native recipe preview in the same response when enough information is available. No extra ceremonial “yes.” Information-only questions do not force cards or actions.
- **R3 — Per-family capability parity:** existing recipes can be reviewed/changed and genuinely absent supported recipes drafted in Chat across the inventory below. Preserve brewer, mode, variant and size. Never claim to adjust a prior brew whose exact recipe is unknown. A missing capability already offered by the native Brew experience is an open engineering gap, not silently reclassified as unsupported.
- **R4 — Coherent journey:** review before brewing, appropriate dose scaling for manual methods, full Aiden profile semantics, persistent trial/Save/Undo state, and truthful receipts. Explicit native actions own saved-content changes and Fellow preparation.
- **R5 — Useful coaching:** ratio-first for strength adjustments, valid physical grinder settings, evidence-aware advice, and only discriminating questions. “Muted” is not a deterministic diagnosis. Use details already supplied instead of repeating a sensory questionnaire.
- **R6 — Honest recovery:** retain the user's message, request/action identity, and valid existing card. A failed read must not become “no recipe,” and an unfulfilled request must not become product PASS because its fallback sounds safe.
- **R7 — Ordinary conversation:** inventory/equipment/history questions, uncertainty, coffee comparisons, short replies, corrections, and “another one” remain natural conversation. Do not force a recipe card or sensory decision tree onto every message. Preserve existing supported Chat entry points; do not invent new inventory mutations or hardware autonomy.

## Cross-family capability inventory

U1 reconciles this inventory against the current UI, validated generators, source registry, tools and native actions. Track read/explain, first recipe, adjustment, named alternative, review, trial, Save and Undo for each row. A working path in Brew defaults to an expected Chat capability; any exception requires an explicit reason and remains an open gap unless the owner excludes it. A specific unresearched technique is different from a missing ordinary recipe capability.

| Family/mode | Stored identity and important boundaries | Planning evidence, not a new passing test |
| --- | --- | --- |
| Hot V60 | `v60_hot`, classic variant, supported size/dose ranges | Shares source-control restriction on named-source recipes |
| Iced V60 | `v60_iced`; preserve brew water, ice and total ratio | Ordinary generator/adjustment must be checked separately from the hot-only technique discovery route |
| Hot Kalita | `kalita_hot`; 155 versus 185 | Named alternative and later adjustment are separate capabilities |
| Iced Kalita | `kalita_iced`; size, ice and water constraints | Cannot infer first-recipe or technique support from hot Kalita success |
| Switch | `v60_hot`, Switch variant and supported sizes | Existing hot options path exists; it is not classic V60, and variant changes require exact validation |
| Aiden | `aiden`; complete single/batch machine profile | Existing-profile update proof exists; first-profile Chat capability is missing |

Inventory-based limits are about real equipment/source constraints, not whatever the current model happened to decline. Unsupported combinations such as a technique absent from the registry must receive a useful explanation and closest valid option without pretending the original request succeeded. No new espresso or unresearched technique expansion is implied.

## Assumptions proposed for approval

1. Chat may create a **new, unsaved Aiden profile** using the app's existing generator and validator. This explicitly supersedes the earlier existing-profile-only restriction. When necessary, distinguish “reconstruct what I brewed” from “make me a new starting recipe” with one useful question.
2. Engineering acceptance uses the already-signed-in Dev simulator, preserving login and data. Isolated Dev fixtures cover destructive/error states. The owner's phone and subjective verdict are not blockers for this engineering work.
3. Read-only, narrowly scoped production diagnosis is permissible; no production writes, new deployment, Firebase-rule changes, account migration, or Fellow operations are authorized by this planning request. Those remain separately gated.
4. Supported changes to named manual recipes may produce **clearly labeled adapted derivatives**, preserving the original source and using validated domain transformations. They must not be mislabeled as the author's exact recipe. Approval of this plan includes this behavior; no unrestricted model-generated schedules are proposed.

## Implementation order and closure evidence

### U1 — Correlate the failing path before choosing a data repair

First map the cross-family capabilities above and establish deterministic source-state/control fixtures using the existing suites. This identifies failures beyond the reported Aiden example before narrowing repairs. Derive the supported behavior from UI/generator contracts, not from a model's response. Tests run during implementation, not during this planning review.

**Owner-requested pre-implementation consumer gate:** The owner subsequently requested baseline smoke work before application implementation. Follow `docs/qa/2026-09-13-ruphus-consumer-baseline.md`: ten visible independent consumer cases and six private wording holdouts from Luna/Sonnet. Execute visible conversations against the verified unchanged Dev app/backend, with existing auth, budget reservation and reversible data protections, before U2/U3/U4/U6 application edits. Treat this as baseline characterization, not a fix. Existing mocked tests do not satisfy it; the initial local 49/49 baseline is component evidence only. Record PASS/FAIL/NOT RUN by semantic/tool, storage and native layers. One proven failure class can stop redundant discovery repetitions, but unrun cases never become PASS. Keep the six-family positive journey floor so adversarial missing-entity cases do not dominate coverage. Freeze corrected criteria before running; independent reviewers, not case designers, grade results. Holdout wording stays outside implementation context until post-fix acceptance. No production/phone action or auth backdoor is authorized by this gate.

Inspect existing records/logs first. Correlate installed/native-OTA identity, backend revision/project, authenticated account equality, Jar binding, requested slot, source path/revision/hash, actual tool outcomes, and final response for the affected journey. Use equality checks and redacted shape/state summaries; do not dump whole account documents, tokens, or credentials. Read only the exact relevant bean/revisions. Account for frontend cache separately.

Relevant paths: `api/ruphus-agent.js` (`firestoreReaders`), `api/_lib/ruphusTurnBinder.js`, `src/lib/ruphus/legacyRecipeResolver.js`, `src/lib/ruphus/recipeSourceState.js`, `src/hooks/useAppData.js`, `src/hooks/useAidenBrew.js`.

Do not replay the production Chat endpoint as a supposedly read-only probe: session/proposal handling can write. If an existing trace is unavailable, reproduce de-identified, shape-faithful states through isolated Dev seams and retain the production-cause uncertainty. Add minimal server-side correlated outcome diagnostics only if existing evidence cannot distinguish the paths; no broad telemetry project or public identifiers.

Exit with demonstrated defect classes and reproducing fixtures, plus explicit unresolved hypotheses. Each unresolved hypothesis must state why it does not block the in-scope journeys; otherwise it remains a blocking investigation item, not a closed cause. Repair only classes required by this plan's journeys; multiple demonstrated blockers are not arbitrarily reduced to one. Unrelated findings are deferred. No speculative migration or blanket resolver rewrite.

### U2 — Repair source discrepancies without breaking offline Brew

Extend existing source-state machinery; do not introduce a parallel recipe authority. Exact and composite readers must retain the difference between absent, unavailable, invalid, and stale source states. Composite reads currently filter missing active revisions, while exact reads surface an error; test and reconcile that semantic difference. Choose the minimal reconciliation from U1 fixture evidence, preserving those distinctions whichever representation is selected. Model-visible outcomes must preserve actionable state without exposing internal IDs.

If U1 proves a persistence, target, or environment defect, fix that specific boundary and reproduce the original failure shape. Preserve legitimate cache/offline behavior. A failed sync must not look like a successful cloud save; a malformed active revision must not authorize generation over an apparently empty slot. Any real-data repair/backfill requires separate approval and before-state protection.

Primary files: existing readers/resolvers above, `api/_lib/ruphusTools.js`, and the proven persistence boundary only. Extend `scripts/ruphus-recipe-source-absence.test.mjs`, `scripts/ruphus-agent-endpoint.test.mjs`, and related focused source tests.

Exit: equivalent authoritative source states yield equivalent recipe availability in Brew and Chat, or an explicit recoverable synchronization distinction. Wrong-owner/slot sources fail closed.

### U3 — Enforce task outcomes in the existing conversation loop

Extend current typed intent/result handling in `api/_lib/ruphusOrchestrator.js`, `api/_lib/ruphusTools.js`, and `api/_lib/ruphusPrompt.js`. Inspect existing guards first; do not bolt on a second dispatcher or expand keyword lists for each reported phrase.

Before a requested recipe is treated as fulfilled, require a validated artifact for the current coffee/method and intended change. Ask at most one discriminating clarification per turn, only if the answer changes the advice or available action; do not repeat answered questions. A necessary clarification is an intermediate state, not completion. A truthful blocked state is failure recovery, not successful recipe delivery. Information-only replies remain normal conversation.

Use available exact evidence instead of repeating reads; make bounded corrective tool execution possible within existing cost/latency controls. If bounded recovery cannot fulfill the request, preserve it and expose a truthful retry path. Do not endlessly regenerate prose or erase an already-published valid artifact. Test that continuation consumes the clarification answer rather than starting the same questionnaire again.

This applies to every brewer and ordinary non-recipe dialogue. Preserve internal distinctions among transport/auth/quota, read failure, model/tool-planning failure, validation failure and genuinely unsupported capability through `src/lib/ruphus/streamAgent.js`, `src/lib/fetchWithRetry.js`, and `src/tabs/ChatTab.jsx`. Do not label tool/read budget exhaustion as unsupported equipment or a connection outage. Surface real capability constraints before proposal; repair bounded model/tool missteps without relaxing ownership, stale-source or machine validation. Never add blind retries to save/preparation operations. Extend `scripts/ruphus-response-recovery.test.mjs`, `scripts/ruphus-stream-protocol.test.mjs`, and `scripts/ruphus-chat-retry-restore.test.mjs` alongside the conversation tests.

Exit: requests cannot pass the functional gate through prose-only promises, misleading absence, or repeated clarifications. Extend existing conversation/source-completion/recovery tests, including negative assertions for those outcomes.

### U6 — Close non-Aiden capability gaps across existing recipe families

Depends on U1–U3; execute before U5, alongside or before U4 without overlapping ownership. Stable unit numbering is retained. Advances R2–R7.

Extend the existing typed proposal route to distinguish an exact source recipe from a supported adapted derivative. The current non-dose source restriction cannot be fixed by prompt wording or simply adding a retry code. Expose allowable controls before the model acts, then support ratio, temperature and physical-grind adaptations where existing domain rules can validate them. Preserve original source identity, record the adaptation, and render the actual execution schedule. Do not mechanically scale timings, discard Switch valve events, mix mL/g aliases, or invent validated timing/capacity after a dose change. Unsupported domain transformations need an actionable valid alternative, not an invalid recipe or false fulfillment.

Audit ordinary first-recipe routes separately from alternative-technique discovery for each family/mode. Reuse the validated family generator when no saved source exists. Do not merely widen the hot-technique allowlist to iced modes. Protect classic V60 versus Switch, hot versus iced, and Kalita sizes through discovery, proposal, preview, Save and reload.

Primary files: `api/_lib/ruphusTools.js`, `src/lib/manualSourceProjection.js`, `src/lib/ruphus/contracts.js`, existing family adapters, and proposal persistence/rendering only where the derivative contract requires it. Extend `scripts/ruphus-source-completion.test.mjs`, `scripts/ruphus-source-journey.test.mjs`, `scripts/ruphus-create-recipe-chat.test.mjs`, `scripts/ruphus-technique-source-fidelity.test.mjs`, and family-specific technique/preview tests.

Exit: a named recipe can be followed by a supported adjustment and a usable labeled preview; ordinary first-recipe requests work for the supported inventory; source fidelity and unsupported-size/mode boundaries remain truthful. A code restriction is not evidence that the user asked an invalid question. Any missing promised capability remains a failing scope item, even if the UI offers an alternative.

### U4 — Bring first Aiden drafts into the native preview lifecycle

First-draft creation is gated on the user's approval of Assumption 1 as part of this plan; do not implement that capability before approval.

Reuse/extract the generation and validation core from `src/lib/aiden.js` and the existing API path; do not invoke `useAidenBrew`'s automatic save/push flow. Preserve authentication, entitlement/quota accounting, model budget, source provenance, and the full machine profile constraints. Inspect the current generation endpoint before deciding the minimal sharing boundary.

Verified absence permits a new unsaved draft. Invalid/unavailable/stale data does not. An existing source yields an exact-source proposal. Full bloom, enabled single/batch temperature curves, pulse schedules, ratios, and machine constraints must validate; manual pour-over grams are not substituted for an Aiden profile.

Reuse the proposal repository, renderer, and app-owned commands. Creating a preview may write documented proposal/base-revision metadata; it must not silently change saved recipe contents or contact Fellow. Lifecycle writes must remain attributable to request/proposal IDs. Retries are idempotent; an explicitly requested alternative may create a distinct draft. Save and Prepare remain separate native actions. Revalidate the source on Save and protect concurrent changes. Undo of a newly created profile restores true prior absence, not an invented base.

Exit: existing and absent Aiden journeys produce usable cards; ordinary Brew remains usable; Save/Undo and retry do not duplicate operations. Generation failures stay truthful and recoverable. Extend existing Aiden conversation, profile validation, repository transaction, preparation, and modal-render tests.

### U5 — Verify varied journeys and the actual delivery separately

Run cheap deterministic tests first, then a small native conversation set. Cover slot × variant × source state × control with valid-boundary and failure fixtures; avoid an expensive live Cartesian product. Use hold-out consumer wording not supplied to implementation as fixed matching strings. Evaluate actual answers and rendered actions, not only grader scores. Reuse existing harnesses; no new model tournament.

Native minimum: **one completed multi-turn journey for each of the six family/mode rows above**, with a correct rendered card, review and applicable native action. Exercise saved and absent sources deterministically for every family, plus real-provider/native representatives of distinct creation routes. Include one cross-size correction natively; all supported Kalita/Switch size boundaries receive deterministic coverage. Verify Save/Undo per distinct persistence route, with persisted recipe identity/content readback across families. A card-only test is not a full journey. Record per-family results; do not hide a missing family inside a pooled total.

| Case | Required evidence |
| --- | --- |
| Existing Aiden; dull/uncertain symptom; natural short follow-up | Correct coffee/method retained; useful coaching; requested preview contains exact full profile and supported change |
| No saved Aiden; asks for help/new recipe | Clearly new complete draft in Chat, no invented history or workflow redirect; Save then Undo restores absence |
| Legacy, canonical, missing-active, malformed, unavailable, unsynced cache | Deterministic fixtures preserve distinctions; no false absence, cross-slot fallback, or overwrite |
| Kalita conversation → “actually Aidan” (intentional user-spelling variant of Aiden) → another jar | Explicit correction overrides stale focus; requested source/card follows new target |
| Hot V60 named technique → “make this stronger” | Labeled, validated ratio adaptation rather than source-control rejection; source remains intact |
| Iced V60 ordinary recipe → serving-size change | Valid iced recipe and consistent ice/brew-water/total ratios, not a hot technique substituted |
| Hot Kalita → “actually the 185” → change temperature | Correct size/source and validated preview through review and native action |
| Iced Kalita first recipe → short contextual follow-up | Correct size/mode, full cold recipe, useful continuation without repeating context |
| Switch technique → classic V60 correction or vice versa | Variant and valve schedule stay correct; cannot silently reuse the other variant's recipe |
| Inventory/history/equipment Q&A, uncertainty and information-only requests | Trusted context when relevant; no fabricated history, forced diagnosis or unwanted recipe card |
| Preview → trial → return → relaunch → permanent → Undo | Card/action state and login survive; saved content changes only when chosen; restored fields match before-state |
| Double tap, retry, stale save, cancel, outage | No duplicate save/preparation; preserved message/card; real recovery and honest failure status |
| Ordinary Aiden Brew screen | Profile opens, exits, and remains usable; no null-provenance crash; no unsolicited machine call from Chat |

Inspect small-screen layout, scrolling, full-profile expansion, disabled/pending states, readable controls, and return navigation. For manual recipes verify scaling preserves ratios and schedule totals. For Aiden verify machine-profile controls instead.

Use the signed-in Dev account for non-destructive native journeys and owner-authorized reversible edits, capturing a minimal before-state and verifying field-for-field restoration. Use isolated Dev fixtures for absent/error-state mutations. Never clear app data or reset authentication. Reconcile simulator ownership before UI control; do not hijack the user's keyboard. Actual Fellow delivery remains a distinct external-operation gate; do not claim physical brewing from adapter tests.

Before any live call, reconcile existing cost ledgers/reservations and nominal CLI spending against the remaining authorized budget. Reserve the chosen small run in advance. Do not run another large evaluation campaign or silently increase the cap.

## Release and completion rules

- Report **implemented**, **deterministic tests**, **authenticated native journeys**, **production delivery**, and **unverified** separately, with commit/environment identity.
- Every required happy-path journey must fulfill its task. Correct error handling can pass a failure-injection test, but cannot replace a successful happy path. Known engineering failures stay open; unrelated defects are explicitly scoped out, never hidden in human acceptance.
- One family's passing journey never certifies another. Report the six family/mode rows individually, including ordinary creation versus named techniques and original-source versus adapted recipes. General conversation and shared error recovery are separate acceptance rows, not assumed from card tests.
- Production publication, if later approved, uses the tested source with reviewed environment differences, existing native compatibility guards, and read-only identity/source checks. Channel publication is not proof the phone activated the bundle. Do not claim authenticated production acceptance without observing it.
- All test recipe changes must be restored; retained revision/proposal metadata must be disclosed. Preserve diagnostic ledgers, reports, and existing worktrees.
- No amount of model agreement proves a perfect chatbot. Completion means the specified capabilities and failure recovery have the listed evidence, with no observed unmet requirement in scope.

## Scope boundaries

No agent rewrite, framework migration, new coffee-research corpus, keyword patch campaign, wholesale data migration, subscription SDK change, design rollback, or automatic hardware control. Previously researched embedded-coach principles remain requirements, not a reason to restart market research. Production deployment and real-account repairs require separate approval.

## Debate decisions and references

Astra and `claude-fable-5` challenged source causality, capability scope, native verification, offline behavior, and confirmation authority. Astra withdrew a presumed resolver rewrite before evidence. Fable withdrew screenshot-derived causality, the claim that prior tests were only seeded, a compulsory ratio-first diagnostic ladder, and exact-phone-replay acceptance. Both rejected replacing the dead end with nicer prose.

Final review: **Fable APPROVE; Astra agrees**, after three substantive exchanges and one unusable CLI response/retry. Four non-blocking clarifications were incorporated: explicit first-draft approval gate, intentional spelling-variant labeling, evidence-driven reader reconciliation, and unresolved-hypothesis closure criteria. CLI-reported nominal cost across all four calls: **$1.459213**; this is not a claim about subscription billing. No application code, deployment, live account data, or authentication was changed during planning. Agreement endorses the plan, not product completion.

Whole-chat scope follow-up: the owner challenged Aiden-centric emphasis. Fable agreed the original plan underspecified other families and approved broadening to the shipped-slot/variant inventory, source-derived adjustments, ordinary first recipes, shared error outcomes and six-family native acceptance. Astra corrected Fable's mistaken suggestion that Switch lacked an options route; the inventory preserves the actual hot-options route and leaves its boundary behavior to verification. Final amended-document verdict: **Fable APPROVE; Astra agrees; no material planning blockers**. Two additional debate calls reported **$0.592522** nominal usage (**$2.051735** total across the six planning calls). Planning did not run new application tests or measure current cross-family failure rates. App, account data, authentication and deployment remain unchanged.

Consumer-baseline follow-up: independently generated 16 cases, protected six holdouts, and reran 49 deterministic baseline tests (all pass; no new consumer/live PASS). Fable reviewed the proposed pre-implementation gate and grading corrections. Sonnet design plus this Fable review reported **$0.185492** additional CLI nominal usage. Luna agent usage is not included in that CLI figure. New live consumer baseline remains **NOT RUN**, so it is an open prerequisite, not evidence of readiness. See the baseline record for exact cases, assumptions, provenance and test-layer limits.

Evidence: origin plan above; `docs/qa/2026-09-12-ruphus-independent-consumers.md`; `docs/data/ruphus-agent-v3/aiden-acceptance-2026-09-12.md`; `docs/qa/2026-09-12-ruphus-production-1.1.245.md`; `docs/qa/2026-09-12-ruphus-production-1.1.246.md`; current source paths cited in each unit. These are historical scope records, not current cloud-state proof.
