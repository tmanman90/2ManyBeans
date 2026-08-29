# Ruphus model evaluation: terminal decision

Status: `insufficient-evidence`.

The completed six-arm screen and replacement finalist run do not satisfy the
pre-registered finalist gate. No model is selected, the shipping chat remains
unchanged, and Agent v3 remains locked.

## Bound evidence

- Six-arm screen: 60/60 complete; eligible arms were `luna-medium` and
  `terra-medium`; evidence hash
  `1258027e127e7bb29c4f1ecbcd314a2e08f980ee185e8f1d04923056816f8a93`;
  artifact-metered spend `$0.24` (`0.24293` machine value); zero retries.
- The locked blind screen preference was Luna medium over Terra medium. Score
  lock hash: `c352f3deb9123ad440962607afb51bf0ead06b58d85f179ab45514a139605dd1`.
  Screen decision hash:
  `caf59d1c5d7216f9b5964fc3583f6dca5bc56bc02553e4ed840c716197e8ac7e`.
- Replacement finalist run:
  `ruphus-finalist-replacement-1787998472445`, evaluation hash
  `a12ada5e4fc13e8b8b02956216ae06cd9001a2f4fb603222a787500f4764a398`,
  24/24 attempts; regrade evidence hash
  `724abc2fc65810a98ee54c8d2a3a0edf69e486d035f086cb511e7f914113af93`;
  artifact-metered spend `$0.05` (`0.049846999999999995` machine value); zero
  retries.
- The detailed regrade is retained outside the repository at
  `/Users/talmeltzer/Library/Application Support/RuphusEval/ruphus-finalist-replacement-1787998472445-2adA5v/finalist-regrade-4f33712.json`.
  It is named as a source only; no raw provider content is copied here.

## Finalist gate

The frozen rule requires at least one valid attempt in each of the six
workflows for each finalist. Both arms covered read, tasting diagnosis,
pending recipe proposal, stale-revision refusal, and Coffee-side/fake-Fellow
preparation. Neither arm covered approval-bound apply: each had 0/2 valid
attempts, so neither satisfies the gate.

| arm | valid | invalid | approval-bound apply | other critical evidence |
| --- | ---: | ---: | ---: | --- |
| Luna medium | 10/12 | 2 | 0/2 | no unsupported physical claim |
| Terra medium | 9/12 | 3 | 0/2 | Fellow preparation 1/2; one positive physical claim |

Luna finalist spend was `$0.01` (`0.0052569999999999995`) with aggregate
latency `39.44s` (`39444.22525100001ms`). Terra finalist spend was `$0.04`
(`0.04459`) with aggregate latency `37.70s` (`37696.17762500001ms`). These are
artifact-metered values, not an invoice total.

## Terminal result

The machine-readable redacted decision is
[`ruphus-final-model-decision.json`](runs/ruphus-final-model-decision.json).
Its terminal classification is `insufficient-evidence`: no production model
switch, no production Agent v3 unlock, and no change to the shipping chat.
The missing approval-bound apply evidence is not repaired by counting a
proposal or a stale-revision refusal as a commit.

The prior calibration-only terminal report remains historical evidence at
[`ruphus-2026-08-28-e5acab4d-calibration-outcome.json`](runs/ruphus-2026-08-28-e5acab4d-calibration-outcome.json).
It is superseded as the current report by this screen-plus-finalist result.

## Practical development recommendation

This is separate from terminal selection and does not approve production
mutation: `luna-medium` is the preferred development candidate because it won
the locked blind quality preference, had 10 versus Terra's 9 valid attempts,
and was approximately 8.48x cheaper in finalist artifact-metered spend.
Before any production model selection, make approval-to-commit deterministic
and app-owned (or an explicit new-turn state), then run only a bounded apply
confirmation under a separately approved evaluation contract.

## Spend and evidence limits

Known artifact-metered spend across historical calibration (`0.37037899999999985`),
replacement smoke (`0.016222`), composite screen (`0.24293`), invalid first
finalist (`0.057152`), and replacement finalist
(`0.049846999999999995`) is `$0.74`
(`0.7365299999999998` machine value). Capability probes and unmetered failures
are not exactly billable from artifacts, so this is not an exact provider
invoice total. The previously proven conservative bound remained below the
`$30.00` hard cap; no further calls are authorized by this terminal result.

No Firebase, production, real Fellow, deployment, or model-switch writes were
made.
