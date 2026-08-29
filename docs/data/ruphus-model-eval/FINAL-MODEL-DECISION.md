# Ruphus model evaluation: final decision

Status: insufficient evidence — calibration incomplete.

The two authorized calibration passes for run `ruphus-2026-08-28-e5acab4d`
completed 72/72 attributed calls across all six exact arms. The final frozen
response contract accepted 0/36 responses in each pass, so calibration did not
establish evidence that can enter qualification. The redacted machine record
and its checksum-bound derivation are
[ruphus-2026-08-28-e5acab4d-calibration-outcome.json](runs/ruphus-2026-08-28-e5acab4d-calibration-outcome.json).

## Bound evidence

- Current manifest evaluation hash: `a12ada5e4fc13e8b8b02956216ae06cd9001a2f4fb603222a787500f4764a398`.
- Calibration evaluation hashes: `e5acab4da495a04e5444d0c07829eec769b9704f47b739c7439a36bdd4c2c221` and `a12ada5e4fc13e8b8b02956216ae06cd9001a2f4fb603222a787500f4764a398`.
- Sorted identity-bound checksum-set hash for all 72 immutable artifacts: `d2a5e18378a8bc7e996ace8f6ebe566faa20b7a24af736aa269c41bc5114aca7`.
- Artifact-metered calibration spend: `$0.37` (`0.37037899999999985` machine value); retries: `$0.00` and 0 retry attempts. Capability probes are not persisted in attempt artifacts, so exact all-provider billed spend is not derivable from this ledger.
- Frozen dispatch reservation: `$27.80` (`27.798201000000006` machine value) within the `$30.00` provider cap; the remaining `$2.20` headroom is non-dispatchable.
- The conservative bound remains below the cap: `$0.75` (`0.746939` machine value) = `$0.37` artifact-metered calibration plus three visible live capability-set reserves at `$0.13` each (`0.12552` machine value). This is an upper bound, not a claim of exact probe billing.

Each pass completed 36 calls: six calibration cases per arm for each of the
six arms. Per-arm counts are 6/6 completed and 0/6 accepted under the final
contract in both passes. The first pass had 20/24 OpenAI transport envelopes
parse before the final schema correction and 0/12 Anthropic envelopes; the
second pass had 0/36 final-contract acceptances. These counts are metadata
only; no provider response body, reasoning, header, or credential is included
in the committed record.

## Terminal decision

Incomplete calibration evidence means the result is `insufficient-evidence`:

- leave the current shipping chat unchanged;
- select no model;
- keep Agent v3 locked;
- revise and rerun the calibration contract before any scored phase.

No qualification, tool-canary, blind review, finalist decision, lifecycle,
warm, or physical-brew evidence exists: those phases were never dispatched.
There is therefore no finalist cutoff or human score lock to interpret.

A third calibration pass is forbidden by R6 and the frozen manifest’s maximum
of two complete passes. This is not permission to shrink the denominator or
reinterpret failed calibration as qualification evidence.

## Reproducibility and evidence levels

Run the focused proof with:

```sh
node scripts/ruphus-eval-calibration-outcome.test.mjs
```

When the owner-only immutable artifact directory is available, the second
test verifies every JSON checksum, run/evaluation/arm/case/repeat identity,
per-pass and per-arm denominator, metered cost, and the identity-bound
checksum-set hash. Without that directory, the first test still verifies the
committed redacted terminal contract; raw provider content is intentionally
not copied into the repository.

The calibration tier is real-provider metadata plus metered immutable artifact
checksums. Qualification/finalist evidence, blind-human evidence, and physical
evidence are all absent. The separate shipping product baseline is not part of
this evaluation and made no paid call.

The exact frozen budget and phase contract remain in
[BUDGET-DECISION.md](BUDGET-DECISION.md), and the current schedule/hash
inputs remain in [manifest.json](../../../scripts/fixtures/ruphus-eval/manifest.json).
