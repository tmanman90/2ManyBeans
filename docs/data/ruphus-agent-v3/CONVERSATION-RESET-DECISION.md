# Conversation reset decision

## Current acceptance — September 6 UX follow-up

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
