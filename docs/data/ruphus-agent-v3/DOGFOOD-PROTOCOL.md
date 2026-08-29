# Ruphus Agent v3 dogfood protocol

Status: scenario IDs and decision rules frozen from the approved [Ruphus Agent v3 plan](../../plans/2026-08-29-001-feat-ruphus-agent-v3-plan.md). No dogfood evidence has been collected by this document. Trace collection is blocked until the owner records an exact retention period; the plan requires a bounded period but does not authorize a value.

This is a staged product proof, not a new model tournament. M1 runs before writer cutover. M2 and the learning loop run only after M1 passes and the plan's writer-migration/cutover preconditions are satisfied. Fellow preparation requires separate authorization. A later stage cannot compensate for a failed earlier safety gate.

## Evidence record

Each executed scenario records only the fields applicable to the proof level being claimed:

- scenario ID, date, tester, commit/build identity, environment, and proof level;
- bound coffee/method/slot plus canonical context, proposal, revision, attempt, tasting, action, and receipt IDs or hashes where applicable;
- provider and exact model configuration, provider request ID, selected tool names, proposal validation result, retry/recovery result, token usage, and cost;
- cold latency, time to first frame, and total turn latency;
- approval source and UI state, including screenshots or recordings for rendered/device claims;
- exact before/after recipe identity, command result, timer/Aiden handoff identity, and provenance chain for mutation claims;
- usefulness, explanation/action-boundary trust, cup outcome (`improved`, `neutral`, or `confounded`), follow-up usefulness, and willingness to continue for real learning loops;
- the weakest observed Fellow preparation/open result, with physical-brew status kept separate;
- redaction check: no credentials, unnecessary raw prompt/tasting prose, or raw identifiers in aggregate metrics.

Missing fields needed to prove a scenario make that scenario insufficient evidence. They are not inferred from another proof level.

## Preflight and stop conditions

Do not begin evidence collection until the scenario inputs are frozen, the exact trace-retention period is owner-approved, redaction is enabled, and account deletion covers owner-scoped Agent traces and records.

Do not enable M2 actions for any dogfood user until every recipe-field writer enumerated by the plan has moved through the canonical command and compatible clients have been deployed. Protected-field rules require the plan's 14-day client-version census; this exact window is authorized by U2. If the census cannot be produced, keep the rules permissive and run M2 with source-drift detection only.

Stop the stage immediately and preserve evidence if any zero-tolerance failure occurs. Stop or redesign before writer cutover if M1 advice is not grounded, understandable, and useful enough to pass its frozen gate. Do not proceed from `fail` or `insufficient_evidence` as though it were a pass. Production model, production mutation, Fellow writes, deployment, and release each remain separate decisions outside this protocol.

## M1 read/propose

The five representative flows below are required by the plan's M1 gate. Additional observations do not replace any of them and are not a pass requirement.

| Scenario ID | Frozen case | Required evidence |
|---|---|---|
| `M1-RP-01` | Current recipe | Owner-scoped canonical read; displayed recipe identity/values; explanation assessment |
| `M1-RP-02` | Tasting diagnosis | Bound tasting/attempt evidence when available; diagnosis and one-variable proposal; production-validator result; explanation assessment |
| `M1-RP-03` | Missing evidence | Typed `data_gap`; no guessed canonical fact; no executable proposal when evidence is insufficient |
| `M1-RP-04` | Unsupported method | Advisory-only result; zero executable recipe artifact or command path |
| `M1-RP-05` | Interrupted recovery | Partial turn remains incomplete; explicit retry or return-to-production-chat recovery; no hidden write or silent provider replay |

Zero-tolerance failures: cross-owner read, fabricated canonical fact, executable unsupported-method proposal, or hidden write.

Pass: all five flows complete; every executable proposal passes production validators; Tal judges at least 4 of 5 explanations grounded and useful enough to continue. Fail: valid complete evidence misses that condition or shows a zero-tolerance failure. Insufficient evidence: any required flow or proof is missing, invalid, ambiguous, or cannot be attributed.

Passing M1 authorizes proposal dogfood only.

## M2 mutation

Run the seven actions required by the plan's M2 gate across supported methods and the applicable plan-defined UI states: checking, proposed, applying, applied, brewing, attempt tasted, promoted, prepared, kept, stale, superseded, validation rejected, interrupted, failed, undone, and unavailable. Do not manufacture a method allocation beyond what the approved plan specifies.

| Scenario ID | Frozen case | Required evidence |
|---|---|---|
| `M2-MU-01` | Manual Apply | Native-card approval; one revision/receipt; exact compatibility projection; no attempt from Apply alone |
| `M2-MU-02` | Brew once | One attempt from the proposal snapshot; unchanged active recipe; exact timer or Aiden handoff identity |
| `M2-MU-03` | Promote after a Brew once tasting | Server-linked tasted attempt; one promoted revision/receipt; exact attempt snapshot becomes active |
| `M2-MU-04` | Stale rejection | Changed source, dose, or grind is rejected; prior recipe remains unchanged; refresh recovery is visible |
| `M2-MU-05` | Supersede | New same-coffee/same-slot proposal closes the older proposal; only the newest remains actionable |
| `M2-MU-06` | Response-loss/duplicate replay | Stable action ID/fingerprint returns the original record identities and receipt; zero duplicate writes |
| `M2-MU-07` | Safe Undo | Undo succeeds only while the target revision remains active in its compatibility slot; restored hashes/receipt match |

Zero-tolerance failures: hidden or duplicate write, stale overwrite, wrong snapshot in timer/Aiden, approval inferred from model/prose, or irreconcilable projection drift.

Pass: every scheduled action reaches its expected receipt/state and the exact revision/attempt identity survives card to command to brew path. Fail: valid complete evidence misses that condition or shows a zero-tolerance failure. Insufficient evidence: any scheduled action or identity chain is missing, invalid, ambiguous, or cannot be attributed.

Passing M2 authorizes mutation dogfood only.

## Learning loop

Run at least three real proposal to brew to tasting to Professor Ruphus follow-up loops, including manual and Aiden when Aiden is available. The count and method condition are plan-authoritative.

| Scenario ID | Frozen case | Required evidence |
|---|---|---|
| `LL-01` | Real learning loop | Exact proposal/revision/attempt/tasting chain plus product assessment fields |
| `LL-02` | Real learning loop | Exact proposal/revision/attempt/tasting chain plus product assessment fields |
| `LL-03` | Real learning loop | Exact proposal/revision/attempt/tasting chain plus product assessment fields |

Zero-tolerance failures: fabricated tasting provenance, repeated recommendation after contradictory evidence, or unsupported physical-success claim.

Pass: all loops retain exact provenance; Tal rates at least 2 of 3 follow-ups useful and would continue using the feature; neutral or confounded cups remain neutral/confounded rather than being scored as success. Fail: valid complete evidence misses that condition or shows a zero-tolerance failure. Insufficient evidence: fewer than three valid attributable loops or missing required product/provenance evidence.

## Fellow preparation

This gate runs only with separate authorization on the dogfood identity.

| Scenario ID | Frozen case | Required evidence |
|---|---|---|
| `FP-01` | One authorized Aiden preparation | Exact owner-scoped attempt profile prepared once; receipt reports only observed preparation/open status |
| `FP-02` | One injected uncertain-response recovery | Unique attempt-derived title; reconciliation reuses observed external identity; no automatic recreate/share |

Zero-tolerance failures: duplicate external profile/share, or a machine-update/physical-brew claim without direct evidence.

Pass: the exact attempt profile is prepared once, uncertain retry reconciles, and the receipt uses only the weakest observed status. Fail: valid complete evidence misses that condition or shows a zero-tolerance failure. Insufficient evidence: authorization, preparation identity, injected recovery proof, or truthful receipt evidence is missing or ambiguous.

M2 alone is not evidence for a production mutation decision. U8 also requires the Aiden preparation receipt in this separately authorized gate before such a decision.

## Proof levels

Report every claim under one of these separate plan-authoritative levels:

1. Contract proof: pure runtime, recipe projection, artifact, and command tests.
2. Server proof: auth, tool surface, transaction, idempotency, provider normalization, and Firestore rules tests with injected fakes or emulators.
3. Client integration proof: framed streaming, hydration, contextual navigation, exact action handoff, and tasting provenance tests.
4. Rendered proof: browser or iOS simulator capture of the required interaction states.
5. Physical-device proof: development-build keyboard, safe-area, background/relaunch, and explicit Apply/Brew once behavior.
6. Live-service proof: separately authorized Luna turns, development Firebase records, and Fellow preparation, each reported independently.
7. Delivery proof: dev OTA or TestFlight as appropriate; production remains unchanged until explicitly approved.

Source tests do not prove a build. A build does not prove rendered, device, live-provider, Firebase, or Fellow behavior. Simulator proof does not prove a physical device. Fellow preparation does not prove a physical brew. Deployment does not prove release or adoption.

## Stage decision record

For each gate, record one of:

- `pass`: every required scenario is valid and attributable, the frozen pass condition is met, and no zero-tolerance failure occurred;
- `fail`: complete valid evidence shows a zero-tolerance failure or misses the frozen pass condition;
- `insufficient_evidence`: required evidence is missing, invalid, ambiguous, unavailable, or belongs only to a lower proof level.

Do not create `LAUNCH-DECISION.md` until dogfood evidence exists. Do not change `FINAL-MODEL-DECISION.md` unless separately authorized live evidence genuinely changes that decision.
