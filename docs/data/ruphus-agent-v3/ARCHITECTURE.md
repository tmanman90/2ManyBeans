# Ruphus Agent v3 architecture

Status: design contract for dogfood implementation. This note records no source-test, build, browser, simulator, physical-device, live-provider, Firebase, Fellow, deployment, or release evidence.

Authority: the approved [Ruphus Agent v3 plan](../../plans/2026-08-29-001-feat-ruphus-agent-v3-plan.md), especially D1-D8, U2-U8, System-Wide Impact, Rollout and Verification Strategy, and Documentation.

## Trust boundary and flow

1. The client supplies authenticated intent and a stable context reference. Transcript prose, local caches, model output, and legacy markers are never mutation authority.
2. The Agent v3 endpoint authenticates, checks entitlement, rate limit, and `agent_v3_access`, then injects the authenticated UID into owner-scoped reads. The provider can read and construct a candidate proposal only.
3. Coffee validates model output against the fixed artifact registry and production recipe validators. The orchestrator may persist a non-authoritative proposal; response loss may leave that proposal, but not an active recipe, attempt, receipt, or external action.
4. Only an explicit tap on a validated native artifact can call the canonical server command. The command rechecks owner, entitlement, feature gate, proposal/revision/hash, dose or grind drift, recipe validity, and stable action identity before a transaction or external preparation begins. Conversational approval can focus the card but cannot commit.
5. Manual timer, tasting, and Aiden preparation receive a server-resolved attempt ID and immutable recipe snapshot. They do not regenerate or re-resolve a recipe. Fellow observations are handoff evidence only and never prove a machine update or physical brew.

## Ownership and authority

The exact Firestore collection paths remain an implementation decision; this note names only the server-managed record classes required by the plan.

| Record | Writer and authority | Client behavior |
|---|---|---|
| Active chat session | Existing owner-scoped continuity record, evolved with versioned turns and safe references | Local-first display and owner read; never mutation authority |
| Proposal | Coffee orchestrator after validation | Owner read/hydration; no client write; remains non-authoritative until a command succeeds |
| Recipe revision | Canonical command transaction | Immutable owner-readable snapshot; one active revision per compatibility slot |
| Brew attempt | Canonical command; attempt ID is the timer `sessionId` | Client carries only the ID and observed local events across authority boundaries |
| Action and receipt | Canonical command, keyed by stable action ID and request fingerprint | Terminal receipt is the only source of action success; retry reuses the same identity |
| Agent-linked tasting provenance | `api/ruphus-tasting.js`, copied from the owner-scoped attempt | Client cannot create or edit `agentProvenance` |
| Bean recipe projection | Canonical command mirrors the active revision into legacy-compatible bean fields | Existing readers may consume it; protected fields are not client authority |

Executable compatibility slots are `aiden`, `v60_hot`, `v60_iced`, `kalita_hot`, and `kalita_iced`; V60 classic and Switch share `v60_hot`. Executable methods are Aiden, V60, V60 Switch, V60 iced, Kalita, and Kalita iced. Other methods remain advisory-only. These sets come from plan D5 and U1.

## Artifacts and commands

Model-selectable, validated artifacts are `coffee_context`, `current_recipe`, `recipe_proposal`, `brew_comparison`, `brew_history_chart`, and `data_gap`. Coffee alone constructs `action_receipt`, `fellow_handoff_result`, and `undo_receipt` from command results. Arbitrary HTML, Markdown actions, URLs, component code, unregistered JSON, and model-imitation receipts are inert or rejected.

The canonical command boundary owns `replace_active_recipe`, `apply_proposal`, `brew_once`, `keep_current`, `start_attempt`, `prepare_attempt`, `promote_attempt`, `set_dose`, `set_aiden_grind`, and `undo_revision`. The model can call none of them. `agent_v3_mutation` gates only proposal- and attempt-derived modes: `apply_proposal`, `brew_once`, `keep_current`, `start_attempt`, `prepare_attempt`, `promote_attempt`, and `undo_revision`. Ordinary app commands remain under their existing entitlements.

## Flags and safe rollback

- `agent_v3_access` is enforced after authentication from comma-separated Firebase UIDs in `RUPHUS_AGENT_V3_UIDS`.
- `agent_v3_mutation` is enforced separately from `RUPHUS_AGENT_V3_MUTATION_UIDS`.
- A development build (`__APP_VARIANT__ === 'dev'`) may request Agent v3; it cannot grant access. Missing configuration means off, production defaults to the legacy Sonnet route with mutation off, and demo mode never requests Agent v3.
- Turning off mutation disables Agent-derived commands without disabling normal recipe generation, dose, or Aiden-grind commands. Turning off access returns new chat use to the unchanged legacy route. An interrupted Agent v3 turn offers an explicit return to production chat; it is never silently replayed through another provider.
- Rollback does not delete or reinterpret proposals, revisions, attempts, receipts, provenance, or readable transcript history. Hydrated server state remains canonical and incomplete actions remain recoverable or unavailable according to their recorded state.

## Retention, deletion, and migration

- The active chat keeps the existing 50-message display bound. Open proposals are limited to one per `(coffeeId, slotKey)` and no more than 8 exempt turns per session; the 9th closes the oldest as `archived`. These exact limits are plan-authoritative in D8 and U2.
- Redacted turn/action traces must have an owner-approved bounded retention period before dogfood. The plan provides no duration, so no duration is defined here and trace collection must not begin until the owner records one. Account deletion removes owner-scoped traces and Agent records; aggregates retain no raw prompts or record identifiers.
- There is no broad recipe backfill. The first executable proposal transactionally binds a valid slot-specific legacy recipe as its base revision. Agent tasting provenance is written only for new Agent v3 attempts; legacy and unknown tastings remain unmodified and render without invented provenance.

## Proof levels

Claims must be reported independently at the level actually observed:

1. Contract proof: pure runtime, projection, artifact, and command tests.
2. Server proof: auth, tool surface, transaction, idempotency, provider normalization, and Firestore rules with fakes or emulators.
3. Client integration proof: framed streaming, hydration, navigation, exact action handoff, and tasting provenance tests.
4. Rendered proof: browser or iOS simulator capture of required UI states.
5. Physical-device proof: development-build keyboard, safe-area, background/relaunch, and explicit action behavior.
6. Live-service proof: separately authorized Luna, development Firebase, or Fellow activity, each identified separately.
7. Delivery proof: dev OTA or TestFlight as applicable; production deployment and release remain separately authorized.

Evidence at one level never implies a higher level. See [DOGFOOD-PROTOCOL.md](DOGFOOD-PROTOCOL.md) for the frozen scenario and decision rules.
