# Ruphus evaluation budget checkpoint

Status: paused pending dedicated provider identity/access evidence. U1 was
accepted at implementation tip `04aeedf021d844bc9e8e2052f841b704758e7025`.
The earlier `$75.00` checkpoint was recorded at `fdb87c4`; the amended budget
implementation and this checkpoint are in `3f23de79016479784e700b50bcbeea2859330ea2`.
No paid provider request has been made.

## Approved $30.00 sequential protocol

The user-approved hard ceiling is `$30.00`. All six exact arms receive the same
blind calibration and qualification before at most two finalists receive deeper
decision, lifecycle, and tool-loop testing. This is a reduced sequential
denominator; it cannot claim the original 60-case × 3-repeat full-factorial
rigor.

The full frozen decision corpus may still contain at least 60 cases for coverage,
but the amended paid schedule dispatches only the sealed 20-case common
qualification partition and the sealed 24-case finalist decision partition.
Qualification and finalist partitions are disjoint, sealed before dispatch, and
interleaved fairly across arms. Proposal-level qualification and deeper decision
turns use injected evidence and are one model call with no retrieval continuation;
the separate shipping-prompt baseline is offline-only and makes no paid model
request.

| Phase | Frozen maximum |
|---|---:|
| Capability/preflight | 1 full-envelope call per arm |
| Calibration | Up to 2 passes × 6 cases per arm |
| Strict tool-loop canary | 5 turns per arm |
| Qualification | 20 common cases × 2 repeats per arm |
| Finalist decision | At most 2 × 24 cases × 2 repeats |
| Finalist lifecycle canary | At most 2 × 5 turns |
| Finalist lifecycle | At most 2 × 12 cases × 2 repeats × 5 turns |
| Warm telemetry | At most 2 × 8 cases × 5 turns |
| Retry reserve | 25% of the base schedule |
| Contingency reserve | 10% of the base schedule |

The warm phase is optional but reserves its full 80 turns up front. It may be
authorized only when the preregistered measured finalist cost delta is at most
`$0.01` per successful task; warm telemetry never merges with cold quality
scores, releases its reserve, or changes a quality gate. SDK retries are disabled:
the 25% retry reserve is one hard global cost pool, consumed fairly in the
interleaved schedule. Exhaustion stops dispatch and yields insufficient evidence.
At most two six-case calibration passes are permitted; a third pass fails closed.
The 10% contingency and the `$2.20` headroom are non-dispatchable.

The estimator uses frozen input/output ceilings of 5,000/1,800 tokens and the
worst eligible arm for finalist phases. Current per-turn cold costs are derived
from the dated registry: Luna `$0.00316`, Terra `$0.03160`, and Sonnet
`$0.02800`.

```text
capability       $0.13   (machine: 0.12552)
calibration      $1.51   (machine: 1.50624)
tool canary      $0.63   (machine: 0.6276)
qualification    $5.02   (machine: 5.020800000000001)
finalist decision $3.03  (machine: 3.0336000000000003)
lifecycle canary $0.32   (machine: 0.31600000000000006)
lifecycle        $7.58   (machine: 7.5840000000000005)
warm             $2.38   (machine: 2.3775)
base            $20.59   (machine: 20.591260000000005)
retry reserve    $5.15   (machine: 5.147815000000001)
contingency      $2.06   (machine: 2.0591260000000005)
total           $27.80   (machine: 27.798201000000006)
headroom         $2.20   (machine: 2.201798999999994)
feasible         true
```

The exact machine formula is:

```text
base = capability + calibration + toolCanary + qualification + finalistDecision
       + finalistLifecycleCanary + lifecycle + warm
     = 20.591260000000005
retry = base × 0.25 = 5.147815000000001
contingency = base × 0.10 = 2.0591260000000005
total = base + retry + contingency = 27.798201000000006
headroom = 30.00 − total = 2.201798999999994
```

Reproduce with:

```sh
node -e "import('./scripts/ruphus-eval/models.mjs').then(({estimateSchedule}) => console.log(JSON.stringify(estimateSchedule(), null, 2)))"
```

The implementation reserves every listed phase before dispatch: qualification
is `(20 cases × 2 repeats × 1 turn)` per arm, finalist decision is
`(2 × 24 × 2 × 1)`, lifecycle canary is `(2 × 5)`, lifecycle is
`(2 × 12 × 2 × 5)`, and warm is `(2 × 8 × 5)` calls. Capability, calibration,
and strict canary reserves are included separately. Retry and contingency
reserves are explicit. It must not silently shrink cases, repeats, arms,
turns, retries, finalist count, or warm telemetry. A missing arm, failed
preflight, unavailable identity evidence, budget reservation failure, or
incomplete immutable evidence produces an explicit `insufficient evidence`
outcome rather than a winner. This reduced sequential protocol cannot claim the
original full-factorial rigor.

Outcome mapping is fixed: zero eligible arms after complete semantic evidence is
`no-pass`; missing or unmeterable arms, invalid batches, retry/budget stops,
unresolved finalist cutoffs (including a tie of more than two), unlocked blind
review, and incomplete physical evidence are `insufficient evidence`/revise.
Lifecycle requires 23 of 24 attempts (22 fails), 100% exact recall and committed
validity, and zero critical failures. Grading, reporting, and physical-trial
packs are offline-only.

Pricing provenance is frozen in
[`api/_lib/modelPricing.js`](../../../api/_lib/modelPricing.js), including the
[OpenAI model pricing pages](https://developers.openai.com/api/docs/models) and
[Anthropic pricing page](https://platform.claude.com/docs/en/about-claude/pricing).

## Evidence and blockers

- Source evidence: U1 implementation, deterministic offline tests, and the
  official pricing sources linked above.
- Test evidence: `node scripts/model-pricing.test.mjs` (10/10),
  `node scripts/ruphus-eval-budget.test.mjs` (5/5), and
  `node scripts/ruphus-eval-preflight.test.mjs` (5/5).
- Build evidence: `npm run build` passes with existing Vite/Browserslist
  warnings.
- Existing unrelated gap: the full recipe-engine chain reaches an existing
  `verify-kalita-iced-ui.mjs` locator timeout waiting for `Iced pour over this
  coffee`.
- Provider evidence is absent: no dedicated evaluation project/workspace
  identity, credential fingerprint, quota-evidence identifier, or provider
  credentials are currently available. Preflight and all paid work remain
  fail-closed.
