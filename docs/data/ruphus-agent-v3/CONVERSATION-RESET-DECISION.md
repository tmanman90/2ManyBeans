# Conversation reset decision

## September 7 current gate status — not Product PASS

Owner authorized $35 cumulative testing, preserving prior spend. Current backend is Dev preview `twomanybeans-ruphus-auqzqpgbz-tmanman90s-projects.vercel.app`, source `ca78bb67a15190d8497d7c701574af021e3dcbef`. No production change.

The initial September 7 smoke (`u3-action-check-1788794154246`) was invalidated after discovering 12 earlier UI-test trials in the dedicated fixture account. They influenced method selection. The exact fixture-only cleanup preserves frozen history, refuses non-fixture profiles/foreign paths, and leaves diagnostics intact. Clean-fixture rerun `u3-action-check-1788794467920` passed 11/11 with no failures.

Manifest v3 (`f92486c57c9c0766`) appends critical AE15 for the owner's trial-return failure: recover this chat's 240 g-water trial rather than an older 235 g alternative, with a usable native save confirmation and no model write. Full cadence is now 69 conversations; the baseline classifications and thresholds remain intact. Two expanded smokes passed: `u3-action-check-1788795146440` (12/12, no failures) and `u3-action-check-1788795866318` (one ordinary AE14 regeneration, zero catastrophic). Both recovered the correct actionable trial card. A smoke from the older manifest cannot unlock this full gate.

The scored run stopped at judge calibration in `u3-action-check-1788796150945`; no candidate full-gate result is claimed. The new gold trial's visible card and trial facts were missing from judge inputs, and a no-proposal score override incorrectly inflated the premature-proposal reference. Local commit `1c4257a` fixes those evaluation inputs, versions the judge as v13, and passes 53 focused checks. Thresholds and reference wording were not weakened. Recalibration/full execution is in progress; recorded cost was $28.584878 with a $2.009 maximum outstanding reservation at this checkpoint.

Existing live typed-browser trial → reload → recovery → save → canonical readback → Undo evidence remains separately valid. Authenticated native scripted acceptance and owner unscripted acceptance remain insufficient evidence. The historical sections below are not current delivery claims.

## Current acceptance — September 6 UX follow-up

### Latest narrow end-to-end journey

Final phone installation: source `0be3e4e`, guarded Dev assets copied with the
verified `3fbme3ftj` backend and isolated Firebase configuration, then
XcodeBuildMCP build/install/launch succeeded on Tal's exact authorized iPhone,
process 13892. The final bundle independently verifies `2manybeans Dev`,
`com.talmeltzer.coffeehub.dev`, build 41, updated receipt labels, dev channel,
and autoUpdate=false. No Capgo or production changes. This is installation and
bundle evidence, not an authenticated on-phone conversation test.

`conversation-eval/u3-action-check-1788760560189/report.json` passed the
supplemental owner-reported thin/clean Kalita journey: live replies, immediate
proposal after "Ok can we update the recipe?", real authenticated browser card,
Update button, canonical recipe readback, idempotent replay, and cleanup Undo.
All three deterministic turn grades passed. The browser restored the actual
live transcript/proposal after API-driven conversation; it did not type those
three turns or prove native-phone interaction. The changed water was 250g to
225g with dose/grind preserved. This is a supplemental journey, not a replacement
for the frozen full U3 gate. C9 now recognizes an explicit recipe-update request
as agreement after substantive advice, with positive/negative regressions.

The rendered receipt exposed confusing completion copy; it now says "Recipe
updated" and "Your saved recipe is ready for your next brew." Applied proposals
say "Saved to your recipe." The component harness passed mobile/desktop with
the new receipt assertion. Focused conversation/session/artifact/action tests
passed 53/53; targeted lint, build, and diff check passed. AI spend is
$28.009070 total, reserved zero; the $30 ceiling remains unchanged.

Simulator automation architecture was diagnosed: the installed Homebrew CLI
embeds an x86_64 Node runtime. Invoking its CLI with the installed ARM Node and
an isolated daemon socket restored semantic home-screen snapshots. Build/run of
the current Dev native assets succeeded on the iPhone 17 Pro simulator, process
41601, and screenshot confirmed the normal sign-in screen. The app's WebView
still exposes no actionable semantic targets in that snapshot, and no supported
fixture login was completed there. Do not claim native authenticated acceptance.

### Session-write correction — approved and deployed to isolated Dev

After explicit owner approval, the narrow chatSessions rules correction was
deployed only to `twomanybeans-ruphus-dev`. The previous live rules were verified
byte-identical to the local baseline, ruleset
`f6d7b983-f131-49a3-8b52-ba662cbd6559`, before deployment. The change accepts
normalized Agent metadata and nullable context, preserves the legacy message
limit, and retains ownership and server-only recipe/action authority.
Deployed ruleset `820f23bc-c375-4a93-a48c-f03198fa6542` was independently read
back and matched the emulator-tested source exactly.

The local Firestore emulator executed the actual normalized-session and New chat
payloads successfully, including server readback. Negative probes rejected other
users, anonymous access, non-active session writes, malformed fields, and forged
proposal/revision/attempt/action/receipt writes. Focused source tests: 9/9 passed;
targeted lint and diff check passed. A temporary ARM Java runtime was used for
the emulator. This is actual emulator execution, not a source-text-only check.

After deployment, the real authenticated Dev browser pressed New chat, confirmed
it, and verified its boundary through server readback: `saved:true`, report
`conversation-eval/u3-action-check-1788760032385/report.json`. This closes the
session-write rejection below. Production was not changed. No AI spending was
needed for this rules/session check.

### Historical session-write failure (now closed)

Authenticated New chat persistence is FAIL. After accepting the native browser
confirmation, server readback did not contain the new boundary. A direct standard
Firebase SDK write of the app's `startNewChat` payload also returned
`permission-denied`, independently confirming the rejected payload rather than
only a rendering/timing symptom. Final report:
`conversation-eval/u3-action-check-1788759366448/report.json`.
The checked-in `chatSessions` allowlist excludes normalized Agent session fields
including ledger, boundaryIndex, lastActivityAt, launchContext, launchHintConsumed,
and historyWidened. At the time, rule deployment was outside authority; no
rule change or deployment was attempted. The missing approval was for a narrowly scoped
isolated-Dev rules correction, with owner checks and server-only action/proposal
records preserved. Java was unavailable in that check, so Firestore emulator
execution had not yet been established. Script lint/diff checks passed; no AI call occurred.

### Latest authenticated saved-proposal result

Latest native follow-up: source `51e38e4` was copied through `cap:copy:dev`
with managed isolated Firebase values and the verified `3fbme3ftj` preview.
XcodeBuildMCP device build-and-run succeeded on the exact authorized phone
`A34D2908-AC86-59E1-8172-A69FBE33FCFC`, launching process 13580. The built app
was independently checked as `com.talmeltzer.coffeehub.dev`, `2manybeans Dev`,
build 41, containing the isolated web Firebase project, preview URL, Ruphus and
Update labels, updater autoUpdate=false and channel=dev. The native
GoogleService-Info.plist is not present in the built bundle; the checked Firebase
identity is the embedded web configuration. This is compile/install/launch and
bundle proof only, not physical-device conversation acceptance. No Capgo
upload or production operation was performed. Live spend remained $28.000296.

After explicit owner approval to continue, the saved-proposal browser check
passed: `conversation-eval/u3-action-check-1788758703256/report.json`.
The real authenticated app restored an existing proposal, rendered its Update
control, dispatched the real Dev recipe command, displayed the success receipt,
and matched canonical saved-recipe readback. Cleanup Undo restored the original
recipe and readback matched. This replays an existing proposal's presentation
and a scripted user/reply pair; it is **not** a new live-model conversation or
native-phone proof. No model requests were made.

Root cause of the earlier consent loop was proven by Firestore snapshots:
consent became true with pending writes, then rolled back to false. Historical
fixture-only root fields violated the existing profile keys allowlist. The
seeder now keeps setup in preferences, uses the existing server-owned
subscription.source fixture marker, and emits valid displayName/username fields.
Only the guarded fake Dev profile was repaired; no rules were changed/deployed.
The successful run observed consent true with pending=false. Earlier timeout
attribution to timing alone was incomplete. Unique failure screenshot paths now
prevent accidental reuse of an older capture. Seeder regressions passed 6/6;
script lint and diff checks passed. Prior failure reports remain preserved.

Screenshots: `/tmp/ruphus-authenticated-proposal.png` and
`/tmp/ruphus-authenticated-saved.png`. The replayed example changes Kalita grind
4.2 to 4.1, not the owner's original thin-cup water adjustment. That entire live
conversation and the latest installed-device journey remain unproven.

**Product PASS remains false. The final-code full gate is incomplete.**

Runtime commit `78f2e6d` is deployed to the isolated Dev preview
`https://twomanybeans-ruphus-3fbme3ftj-tmanman90s-projects.vercel.app`.
Two consecutive eleven-conversation smokes passed on that exact deployed
commit, with no recorded ordinary or catastrophic failures:
`conversation-eval/u3-action-check-1788752703926/report.json` and
`conversation-eval/u3-action-check-1788752855414/report.json`.

The different-family judge calibrated successfully before the full stage.
That stage stopped at the cumulative cost guard after 28 completed run
artifacts; it is not a full-gate PASS. One completed run recorded an unexpected
clarification branch. The stop is preserved in
`conversation-eval/u3-action-check-1788753013356/report.json`.
Actual cumulative spend is $28.000296 of the authorized $30. The next judge
dispatch required a $2.009 maximum reservation, so it was refused before
dispatch. No ceiling was raised or reservation discarded.

Live proposal creation, explicit Apply, canonical saved-recipe readback,
idempotent replay, and Undo/readback passed on the earlier `2f93a8c` preview:
`conversation-eval/u3-action-check-1788751177982/report.json`. This is backend
evidence, not a native tap-through claim. The latest local U3 suite passed
56 tests. Earlier failed smoke artifacts remain unchanged.

Native scripted acceptance remains unproven: a fresh XcodeBuildMCP simulator
snapshot still fails because AXe cannot load CoreSimulator for the current
architecture. Following owner approval for another no-model repair pass, the
real-app localhost browser check passed authenticated Agent entry through the
standard Firebase SDK and visible consent button. Fresh screenshot inspection
corrects the earlier blank-viewport interpretation: the failed check was on
the privacy-consent screen, with no JavaScript errors. The test raced profile
hydration and now handles the consent gate after navigation as well.
`conversation-eval/u3-action-check-1788757218419/report.json` records the entry
PASS at 390×844; `/tmp/ruphus-authenticated-chat.png` shows the four-coffee
opening, starter prompts, and composer. Model/command routes were blocked;
there were no AI dispatches. This is browser entry only, not a conversation,
recipe-update, or installed-native acceptance PASS. Prior failed reports are
preserved. The required owner unscripted device conversations remain open.

The subsequent no-model continuation reproduced a separate local product bug:
Chat display hydration dropped `turnId` and `artifacts`, turning restored Agent
replies into text-only messages. The display mapper now retains both, with an
executable save/inflate/display regression and a ChatTab wiring assertion.
Focused session/artifact tests passed 21/21; source/test lint and web build
passed. The mobile/desktop component harness passed using the already installed
Chrome via `RUPHUS_UI_BROWSER_PATH` (the default Playwright browser binary was
absent). This proves local restoration data and component behavior, not an
authenticated saved-update flow, deployment, or phone verification. No AI calls
were made in this continuation.

The no-model saved-proposal browser check remains FAIL. It selects an existing
compatible owner-scoped proposal, reconstructs only its presentation envelope,
and prepares a fixture session; only the real Dev command endpoint may Apply.
The first lookup used UI fields absent from repository records and was corrected.
The next two attempts timed out at `restored_proposal_card`, with the privacy
consent screen in the failure capture and no page errors. No Apply or Undo was
reached. Final report: `conversation-eval/u3-action-check-1788758015806/report.json`.
The three-attempt repair pass stops under the MSW fuse; authenticated card/action
acceptance remains open. Focused action/session/artifact tests passed 38/38 and
script lint/diff checks passed, but are not substitutes for this failed UI check.

Production and the Dev Capgo channel remain untouched. The historical
checkpoint below applies only to its named older commit, not the current UX
follow-up.

## Historical backend conversation checkpoint

**Status: PASS — the final live U3 gate passed on `efe58d9`.**

Two clean live smokes were recorded on the same code commit. The calibrated,
different-family blind judge then accepted the final 64-conversation gate:
64/64 scheduled conversations completed with no fixture failures, no ordinary
failures, and no catastrophic failures. Checked-reply latency passed its
budgets at 3.80 seconds p50 and 5.74 seconds p90; read-round latency was 0.23
seconds p90. The authoritative redacted report is
`conversation-eval/u3-1788268886090/report.json` and expires after 30 days.

The final full stage cost $1.343333. Cumulative authorized live-testing spend
is **$27.082879 / $30**, leaving **$2.917121**. No further model dispatch is
authorized beyond that remaining cumulative ceiling.

This is exactly **Backend conversation checkpoint PASS**. It is not Product
PASS. The current Dev build is now installed and running on the physical phone,
but product acceptance still requires authenticated conversation evidence and
five qualifying owner-run unscripted conversations on the physical Dev device,
including a tasting surface.

## September 6 typed-UI remediation

Supplemental real Dev browser report `conversation-eval/u3-action-check-1788761866814/report.json` passes an actually typed three-turn thin/clean Kalita conversation, one proposal card, explicit Update, canonical saved-recipe readback, New chat history retention, and cleanup Undo readback. This supersedes API-plus-restored-transcript proof for that scenario, not the full final gate. Earlier failed typed reports are retained: they exposed UI session overwrites that erased server evidence and a duplicate transient proposal card.

Ordinary Agent UI persistence now merges transcript fields without replacing server evidence or lifecycle state; all generic Chat saves retain Agent protocol. Explicit New chat uses the current conversation, and completed transient artifacts clear after persistence. Empty introductory bubbles are hidden. Final focused tests pass 42/42, scoped source/test ESLint and build pass, and the actual Firestore emulator verifies merge preservation plus negative authority cases. Testing spend after the typed live pass is $28.023517 of the $30 total cap. Browser routing buffers real endpoint frames, so this is not native transport or streaming-latency evidence. Installed-app and owner gates remain outstanding for this revision.

Native delivery for `175acce`: XcodeBuildMCP compiled and installed the signed Dev app on exact device `A34D2908-AC86-59E1-8172-A69FBE33FCFC`. Launch was denied by iOS with `FBSOpenApplicationErrorDomain` code 7, `Locked`; this is not a successful native launch or a crash observation. The built artifact verifies `com.talmeltzer.coffeehub.dev`, `2manybeans Dev`, build 41, isolated Firebase, current preview `https://twomanybeans-ruphus-3fbme3ftj-tmanman90s-projects.vercel.app`, Ask label, session-reset fix, autoUpdate false, and channel dev. Capgo remains unchanged. Final rendered harness passes mobile and desktop after the empty-intro cleanup.

Follow-up native check: current `175acce` assets compile/install/launch successfully in the iPhone 17 Pro simulator (process 50218). Screenshot inspection confirms the normal Apple/Google sign-in screen, not authenticated fixture acceptance. A second exact-device launch remains denied as Locked. No extra provider spend; ledger is $28.023517 spent, $0 reserved. Final full-gate and owner requirements remain unchanged.

## Evidence ledger

| Category | Result | Commit |
| --- | --- | --- |
| Source and deterministic tests | PASS for the final ambiguity/evaluator change: focused suite 75/75; scoped ESLint, web build, iOS environment preflight, and diff checks passed. Broad Ruphus glob was 335/336; the sole failure is the unchanged frozen U4 evaluator-manifest tools-hash mismatch, so broad-suite green is not claimed. | `efe58d9` |
| Injected runner | PASS: 14 fixtures, zero catastrophic and ordinary failures. This is deterministic plumbing proof, never live-provider proof. | `efe58d9` |
| Live provider and Dev Firestore | PASS against isolated Dev fixture: two clean same-commit smokes, calibrated judge, targeted AE04 5/5 plus appended smoke, and final 64/64 full gate. Cumulative spend $27.082879 / $30. | `efe58d9` |
| U3 backend checkpoint | **PASS**: final redacted report `u3-1788268886090`; calibration valid, all latency budgets passed, and no result failures. | `efe58d9` |
| U4 implementation | Source and native proposal/action surfaces implemented. Product acceptance still waits on installed-app and owner evidence below. | Included in final branch |
| Rendered harness | PASS mobile and desktop for launch entries, context-free opening, delayed hydration, proposal actions, Agent frames/artifact, legacy route, keyboard padding, and zero network writes. | `efe58d9` |
| Native Dev bundle identity | PASS locally: `com.talmeltzer.coffeehub.dev`, display name `2manybeans Dev`, updater auto-update false, channel `dev`, final preview URL, Ruphus label, and isolated Firebase project embedded. | `efe58d9` assets |
| Simulator compile/install/launch | PASS on iPhone 17 Pro / iOS 26.4; visual sign-in screen confirmed. | `efe58d9` assets |
| Simulator authenticated scripted conversation pass | `insufficient_evidence`: Xcode 27 beta CoreSimulator could not provide the accessibility hierarchy, and an official Web Inspector attempt did not establish fake-fixture authentication. No product backdoor was added. | Not completed |
| Physical Dev-device install | **PASS after remediation** on Tal's exact iPhone `A34D2908-AC86-59E1-8172-A69FBE33FCFC`. The first installed build crashed on iOS 27 with `UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption`; crash reports proved the missing scene lifecycle. `f55b54e` adds a durable generated-iOS migration and regression guard. The rebuilt signed Dev app survived three launches, remained present in the device process list, and produced no additional crash report. Device/bundle identity remains `2manybeans Dev`, `com.talmeltzer.coffeehub.dev`, build 41, with the final preview URL, isolated Dev Firebase identifier, Ruphus label, updater auto-update false, and `dev` channel. | `f55b54e` |
| Physical Dev-device scripted pass | `insufficient_evidence`: the app launches successfully, but no supported seam established fake-fixture authentication or reliable physical-screen automation. iPhone Mirroring did not reflect the launched process reliably, so no visual or scripted conversation PASS is claimed. No login backdoor was added. | Not completed |
| Owner unscripted conversations | `insufficient_evidence`: required five conversations across three surfaces, including tasting, remain owner-run. | Not run |
| Preview deployment | READY on isolated project `twomanybeans-ruphus-dev`: `https://twomanybeans-ruphus-ofdmim8ac-tmanman90s-projects.vercel.app`. | `efe58d9` |
| Dev Capgo channel | Unchanged. Guarded upload correctly aborted because social-login and RevenueCat native packages differ from the channel's prior native baseline. The current native Dev build was installed directly on Tal's phone; no unsafe OTA upload was forced. | No channel change |
| Production | Untouched and unclaimed: no production Vercel, Capgo, Firebase rules, app, or coffee data changes. | Out of scope |

## Remaining acceptance work

1. Authenticate only the isolated fake Dev fixture through an existing
   supported seam, if one becomes available, and run the scripted installed-app
   scenarios from the runbook. Do not add a test-login backdoor.
2. Have the product owner complete the five unscripted physical-device
   conversations and record verdicts. Any bad verdict becomes a new fixture and
   returns the code through the live smoke/full-gate sequence within the
   remaining budget.

No production data, Firebase rules, production Vercel, or production Capgo was
changed. Diagnostic ledgers and 30-day redacted reports were preserved. Product
PASS remains false until the remaining installed-app and owner gates pass.
