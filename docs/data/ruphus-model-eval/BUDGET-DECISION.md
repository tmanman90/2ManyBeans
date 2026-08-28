# Ruphus evaluation budget checkpoint

Status: blocked pending an explicit budget/scope decision. U1 was accepted at
`04aeedf021d844bc9e8e2052f841b704758e7025` (current branch tip at this
checkpoint). No paid provider request has been made.

## Reproduced envelope

The figures below come from `estimateSchedule()` with the frozen U1 defaults:

| Input | Value |
|---|---:|
| Arms | 6 exact arms, one each |
| Decision cases × repeats | 60 × 3 = 180 runs per arm |
| Canaries | 2 per arm |
| Tool/model turns | 5 per run |
| Retries | 1 bounded retry per turn |
| Finalist lifecycle | 2 finalists × 20 cases × 3 repeats × 5 turns |
| Optional warm telemetry | 2 finalists × 20 cases × 5 turns, including creation/read economics |
| Hard cap | $75.00 |

Command:

```sh
node -e "import('./scripts/ruphus-eval/models.mjs').then(({estimateSchedule}) => console.log(JSON.stringify(estimateSchedule(), null, 2)))"
```

Reproduced result:

```text
initial   $228.44640000000004
lifecycle $37.92
warm      $11.799
total     $278.16540000000003
feasible  false
```

The initial component is six arms × `(180 runs + 2 canaries)` × 5 model
turns × 2 attempts. Lifecycle is the worst-priced finalist envelope for
`2 × 20 × 3 × 5 × 2` turns. Warm telemetry includes one cache-creation price
and subsequent cache-read prices, with the bounded retry multiplier. These are
hard maxima for reservation, not an expected-spend forecast.

Pricing provenance is frozen in
[`api/_lib/modelPricing.js`](../../../api/_lib/modelPricing.js), including the
[OpenAI model pricing pages](https://developers.openai.com/api/docs/models) and
[Anthropic pricing page](https://platform.claude.com/docs/en/about-claude/pricing).

## Decision required

**Option A — raise the hard cap to $325.** Preserve the complete approved
protocol and all six arms. This leaves `$46.83459999999997` of headroom over
the reproduced conservative maximum. `$325` is a hard reservation ceiling,
not an expected spend target; all U1 preflight, identity, retention, isolation,
and per-phase reservation gates still apply.

**Option B — retain the $75 cap.** Require a separately reviewed and approved
plan amendment defining a weaker or reduced protocol. No cases, repeats, arms,
turns, retries, finalists, cache regime, or other denominator may be shrunk
implicitly by the runner, and no paid call may occur until that amendment and
its new feasibility proof are accepted.

Until A or B is explicitly resolved, R17 requires paid work to remain locked.
There is no implicit shrink, no paid provider call, and no use of production or
unverified credentials.

## Evidence and blockers

- Source evidence: U1 code, deterministic offline tests, and pricing sources
  linked above.
- Test evidence: `node scripts/model-pricing.test.mjs` (10/10),
  `node scripts/ruphus-eval-budget.test.mjs` (5/5), and
  `node scripts/ruphus-eval-preflight.test.mjs` (5/5).
- Build evidence: `npm run build` passes with existing Vite/Browserslist
  warnings.
- Existing unrelated gap: the full recipe-engine chain reaches an existing
  `verify-kalita-iced-ui.mjs` locator timeout waiting for `Iced pour over this
  coffee`; this does not authorize weakening the budget gate.
- Provider evidence is absent: no dedicated evaluation project/workspace
  identity, credential fingerprint, quota-evidence identifier, or provider
  credentials are currently available. U1 preflight therefore remains
  fail-closed even if a budget option is selected.
