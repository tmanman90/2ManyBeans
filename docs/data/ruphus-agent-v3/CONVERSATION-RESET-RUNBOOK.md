# Professor Ruphus Dev dogfood runbook

This runbook governs the conversation-reset live gate and installed-app proof.
It is Dev-only. A missing identity check, an ambiguous target, or a failed
preflight stops the run; it never falls back to production.

## Authority and hard boundaries

- Use only a separate Firebase Dev project. Never use `manybeans-7893c`.
- Deploy only a Vercel preview. Never pass `--prod`.
- Use only the native Dev app `com.talmeltzer.coffeehub.dev`, displayed as
  `2manybeans Dev`. Never install over or upload to `com.talmeltzer.coffeehub`.
- Keep Capgo auto-update disabled for installed-build evidence. Do not publish
  a production Capgo bundle or move the production channel.
- Keep model behavior read/proposal-only. For the approved Dev owner only,
  native Apply, Brew once, and Keep taps may use the existing app-owned recipe
  command boundary when both access and mutation allowlists pass. Do not add
  autonomous commands, prepare Fellow, or claim a physical brew.
- Do not deploy Firebase rules and do not read or mutate cloud coffee data
  outside the dedicated Dev fixture account.
- Never print, persist, screenshot, or commit authentication tokens or provider
  keys. Inject credentials non-printingly and obtain fresh deployment
  credentials for the run.
- Redacted diagnostic artifacts expire after 30 days. User-visible
  conversation history is product data and is not diagnostic telemetry.
- The authorized live-testing budget is **$30 total across all stages and
  providers combined**. The persistent runner ledger reserves maximum cost
  before every candidate, judge, and pairwise dispatch and refuses a dispatch
  that could exceed the remaining total.

## Required identities before any live call

Record identifiers, never secrets, in the decision document:

| Identity | Required proof |
| --- | --- |
| Source | Exact clean commit under test |
| Firebase | Separate Dev project ID; explicitly not `manybeans-7893c` |
| Account | Dedicated Dev fixture UID allowlisted for Agent access and the three approved native proposal actions |
| Backend | Unique Vercel preview origin selected by the Dev native build |
| App | `com.talmeltzer.coffeehub.dev` and display name `2manybeans Dev` |
| Updater | `CapacitorUpdater.autoUpdate` is `false` in the verified Dev bundle |
| Mutation | Client and server allowlists contain only the approved Dev UID; rollout tests prove only Apply, Brew once, and Keep are exposed from a proposal |
| Budget | One cumulative ledger with authorized cap `$30`, starting spend, and remaining amount |

Stop immediately if any identity is missing, if the preview redirects to an
unverified host, if deployment-protection query parameters are lost, or if a
Dev request reaches a production backend.

## Environment preflight

1. Confirm the working tree and preserve unrelated owner changes.
2. Confirm a separate Firebase Dev project has been explicitly authorized and
   selected. Do not infer safety from the Firebase CLI's current project.
3. Inject the six `VITE_FIREBASE_*` client values, `VITE_RUPHUS_API_BASE`,
   `VITE_RUPHUS_AGENT_V3_MUTATION_UIDS`, the matching server-side access and
   mutation allowlists, the Dev fixture UID/auth input, and provider/judge
   credentials without printing their values.
4. Run `node --test scripts/ios-build-env.test.mjs`.
5. Run the native Dev build only through `npm run build:ios:dev`; its preflight
   must execute before Vite and fail on every missing required variable without
   echoing values.
6. Seed the frozen fixture only into the verified Dev project and read it back
   through the production Firestore readers before admitting a live stage.
7. Deploy with the `source-command-ship-dev` workflow: Vercel preview only and,
   when required for the Dev app, the guarded Dev-app Capgo path only. Never
   substitute raw deployment commands.

## Conversation gate order

All stages use the same persistent cumulative-cost ledger.

1. Run live smoke 1 on the current commit: one run of each critical fixture.
2. Calibrate the different-family blind judge with the exact frozen gold and
   known-bad packets. Calibration is never a PASS by itself.
3. Run live smoke 2 on the same commit. Both smokes must be clean before full.
4. Run the 64-conversation full gate exactly once when prerequisites hold.
5. After U4, run the named post-surface targeted fixtures at full cadence plus
   one smoke, and separately verify the AE7/AE12 rendered opening, hydration,
   boundary, and Continue assertions.
6. On the final code, run the final 64-conversation gate once. Any later source
   change restarts the cycle at a smoke.

Record stage, commit, candidate model, judge model family, run counts,
catastrophic and ordinary failures, fixture cadence, judge calibration,
pairwise results, latency, stage spend, cumulative spend, and artifact expiry.
Never describe the injected runner as live-provider evidence.

## Scripted installed-app scenarios

Run each scenario separately on Simulator and on the physical Dev device
against the seeded fixture account. Record `pass`, `fail`, or
`insufficient_evidence` independently for each platform:

- Direct opening with data already loaded and with delayed hydration.
- Stale return, non-destructive New Chat, then Continue previous.
- Interrupted request and working Try again without a duplicate user bubble.
- Jar-number switch and coffee-name switch without stale launch anchoring.
- Watery Kalita diagnosis and a natural follow-up exchange.
- Recipe launch hint followed by an explicit V60 correction.
- Topic change after a proposal without changing its target, followed by one
  explicit native Apply, Brew once, or Keep tap against disposable Dev fixture
  data; verify the canonical receipt and that a repeat tap cannot duplicate it.
- No C6a machine token, JSON/markup dump, mode-switch language, or placeholder
  action appears on screen.

Installed-app evidence counts only when the inspected bundle proves the Dev
bundle ID/name, preview backend, and updater-disabled state. Simulator proof,
physical-device scripted proof, and owner conversation proof remain separate.

## Owner unscripted conversation log

The product owner must personally complete at least five unscripted
conversations on the physical Dev device across at least three surfaces,
including at least one tasting surface. At least one earned proposal must use
an available native action or record why no action was appropriate. Use this
table in the decision record:

| # | Date | Surface | What the owner naturally asked | Failures observed | Verdict | Derived fixture |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Not run |  |  |  |  |  |
| 2 | Not run |  |  |  |  |  |
| 3 | Not run |  |  |  |  |  |
| 4 | Not run |  |  |  |  |  |
| 5 | Not run |  |  |  |  |  |

Allowed verdicts are `good`, `acceptable`, and `bad`. Every observed failure
becomes AE15 or later with a manifest-version bump and must pass its full
cadence on the final commit. Any `bad` verdict or any unpassed derived fixture
returns the work to smoke and blocks Dev-dogfood-ready.

## Decision semantics

Report these categories independently: source/deterministic tests,
live-provider gate, rendered harness, Simulator, physical Dev-device scripted
pass, owner unscripted conversations, preview deployment, and production.
Unrun or ambiguous categories are `insufficient_evidence`.

The U3 label, when earned, is **Backend conversation checkpoint PASS** and is
not Product PASS. **Product PASS (Dev-dogfood-ready)** requires the final full
gate on the final commit, post-surface AE7/AE12 harness evidence, proven Dev
environment identity, scripted device evidence, five qualifying owner
conversations with zero bad verdicts, and every derived fixture passed at full
cadence. Production remains untouched and unclaimed.
