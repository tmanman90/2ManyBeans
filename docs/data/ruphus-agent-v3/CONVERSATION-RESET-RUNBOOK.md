# Professor Ruphus Dev dogfood runbook

This runbook governs the conversation-reset live gate and installed-app proof.
It is Dev-only. A missing identity check, an ambiguous target, or a failed
preflight stops the run; it never falls back to production.

## Current continuation boundary

### September 9 recipe-first implementation closeout

The approved recipe-first plan is engineering-complete on isolated branch
`codex/ruphus-recipe-first`, product `b4968e9`. See
[`RECIPE-FIRST-ACCEPTANCE.md`](RECIPE-FIRST-ACCEPTANCE.md) for exact integrated
native journeys, corrective builds, original-state restoration and screenshots.
The currently installed **Dev simulator**, not the phone, uses preview
`https://twomanybeans-ruphus-8qu8ndiav-tmanman90s-projects.vercel.app` and isolated
Firebase `twomanybeans-ruphus-dev`; autoUpdate is false, channel dev. Ratio-first
cards, adjustable recipe-before-timer, V60 experiments, relaunch/lost-response
recovery and Save/Undo have native evidence. All 48 original saved recipes were
restored and the owner login preserved. No physical brew or production release.
Cumulative spend is $48.011302, reserved $0 of the existing $55 cap; this plan's
increment was $0.017040. No additional paid engineering check remains necessary.
Owner personal verdict remains pending. The older conversation-reset evidence
below is historical and separate; it is not re-run or promoted to new proof.

### September 8 conversation-reset closeout

September 8 owner amendment supersedes conflicting account/device/verdict rules
below: native acceptance uses the already-signed-in Dev simulator owner account.
Preserve its login and existing data. Never seed/reset it or inject authentication.
Capture exact recipe values before test commands and verify Undo restores them.
Seeded backend tests remain separate. Phone testing is deferred; personal R29
verdicts remain pending without blocking engineering work or Engineering PASS.
The current cumulative ceiling is **$55**, increased from $45 by the owner.
Read the live ledger before dispatch; all prior spend remains counted.
Latest product `f086e1c` is on preview `a9dccf36i`; its two same-commit smokes
passed. The signed-in native proposal/trial/save/Undo journey and final-build
restoration checks passed; canonical readback verifies the original recipe.
The first full run stopped after 46 cases because the operator OAuth expired;
that failed report is retained. The rerun `u3-action-check-1788896138333` passed
the final gate: 69 runs, zero catastrophic findings and two retained ordinary
flags, passing calibrated quality and latency criteria. Engineering PASS is
recorded in the decision file under the controlling owner amendment. Personal
verdicts remain pending. Accounted spend $47.994262, reserved $0 of $55; no paid
run remains active. Do not restart paid testing without a concrete new need.

Before a long seeded run, verify the existing Firebase CLI operator credential
has at least 45 minutes of validity, renewing it through its standard refresh
flow when needed. A successful projects-list call alone does not establish this.
Report only remaining lifetime, never token values. This credential is separate
from the native signed-in account; do not change native authentication.

### Historical boundary (superseded by the amendment above)

The final live gate already passed on product source `bdf686024cd692f48c734a1bf7d6127b527757e7`;
see the current acceptance summary in `CONVERSATION-RESET-DECISION.md` for the
exact report and remaining evidence. Do not restart the paid cadence merely
because this runbook lists it below. The cumulative ledger currently records
$42.533545 spent, $0 reserved, and a $45 authorized ceiling; read the ledger
again before any future paid dispatch.

Phone operations are not currently authorized. Preserve the existing native
login: no sign-out, uninstall, reset, or container clearing. Native app auth
currently supports Google/Apple, while the seeded fixture runner authenticates
through a custom-token API path that is not exposed in the native app. Do not
inject that token into native storage or add a login backdoor to bridge the gap.
The complete native fixture matrix needs a supported fixture sign-in path;
the physical category needs renewed device-operation authority, and R29 needs
the owner's actual unscripted conversations and verdicts. None is inferred
from the passing endpoint gate or the already-proven core simulator journey.

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
- Do not deploy Firebase rules or touch production coffee data. Seed/reset only
  the dedicated Dev fixture account. Separately, use the owner's existing Dev
  simulator data for authorized native journeys, with recipe changes undone.
- Never print, persist, screenshot, or commit authentication tokens or provider
  keys. Inject credentials non-printingly and obtain fresh deployment
  credentials for the run.
- Redacted diagnostic artifacts expire after 30 days. User-visible
  conversation history is product data and is not diagnostic telemetry.
- The authorized live-testing budget is **$55 total across all stages and
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
| Budget | One cumulative ledger with authorized cap `$45`, starting spend, and remaining amount |

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
