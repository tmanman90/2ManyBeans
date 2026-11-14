# Sensory follow-up repair — September 9, 2026

Implementation: `327c062`, `4618ac2`.

## Reproduced failure

The owner answered the assistant's Kalita sensory clarification with “Tasted sour.” Dev telemetry reported `tool_round_limit` after evidence and recipe reads. Both readiness paths rejected this natural answer while accepting “Thin.” The new regression reproduced the interrupted turn before the fix.

## Correction

- Share sensory-answer recognition between endpoint and tool readiness; a review is not a saved change.
- Preserve negation, uncertainty, missing evidence, exact target, and mutation safeguards.
- An unready same-target review at the read limit uses the existing bounded, tools-disabled conversational recovery instead of aborting the reply. No increased read budget.
- An existing connection-error placeholder does not hide the preceding sensory question on retry.

## Evidence

- 72 endpoint/runtime/provider/stream/sensory tests pass. The new tests failed before implementation, including the exact `tool_round_limit` reproduction and retry regression.
- Targeted source/test ESLint and diff check pass.
- Mobile/desktop rendered browser harness passes; this uses injected responses, not native/live backend acceptance.
- Web and Dev-native asset builds pass. Signed physical build succeeds and install is confirmed for `com.talmeltzer.coffeehub.dev` / `2manybeans Dev`.
- Actual app assets contain Dev Firebase, preview below, Ask Professor Ruphus, disabled automatic OTA, and dev channel.
- A real-provider local replay using synthetic coffee/recipe data and the remembered coffee/method completes `read_coffee_evidence → read_recipe → propose_recipe_change`: one review card, three model calls, no saved-recipe writes. Reply: “Prepared: change the grind from 5.8 to 5.6. Dose, water, and temperature stay the same. Review it before applying.” This is not authenticated deployed-endpoint proof.
- Two earlier real-provider replays omitted remembered focus: both answered rather than interrupted, but produced no card. They were not counted as card-flow passes. A rejected credential setup attempt produced no generation.
- Real-provider replay spend: $0.004737 total. Existing cumulative ledger: $48.016039 spent, $0 reserved, $6.983961 remaining under $55 authorization. Diagnostics retained outside this worktree and never staged.

## Deployment and remaining boundary

Isolated Dev backend READY: https://twomanybeans-ruphus-6x6pittwh-tmanman90s-projects.vercel.app (source `4618ac29ae64cafb136269f441e37db0fcfffa11`).

Installed Dev build: `20260909T152510Z-4618ac29ae64`.

Physical automatic launch was rejected because the iPhone was locked. No claim of a newly completed authenticated physical chat journey. No uninstall, container reset, login manipulation, production deployment, production Capgo update, Firebase rule change, or saved coffee-data mutation was performed.
