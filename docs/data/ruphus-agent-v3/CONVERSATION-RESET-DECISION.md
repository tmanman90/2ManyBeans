# Conversation reset decision

## Backend conversation checkpoint

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
PASS. Product acceptance still requires an authenticated scripted installed-app
pass and five qualifying owner-run unscripted conversations on the physical Dev
device, including a tasting surface.

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
| Physical Dev-device install | FAIL/blocked: Tal's exact phone is connected, but the Mac login keychain refused embedded-framework signing with `errSecInternalComponent`; the unsigned bundle was correctly rejected by iOS. | `efe58d9` assets |
| Physical Dev-device scripted pass | `insufficient_evidence`: installation did not complete, so no scripted conversation pass is claimed. | Not run |
| Owner unscripted conversations | `insufficient_evidence`: required five conversations across three surfaces, including tasting, remain owner-run. | Not run |
| Preview deployment | READY on isolated project `twomanybeans-ruphus-dev`: `https://twomanybeans-ruphus-ofdmim8ac-tmanman90s-projects.vercel.app`. | `efe58d9` |
| Dev Capgo channel | Unchanged. Guarded upload correctly aborted because social-login and RevenueCat native packages differ from the currently installed Dev native baseline. Current Dev bundle remains `1.1.243-devapp.d20260817.t003437`; a newly signed native Dev install is required. | No channel change |
| Production | Untouched and unclaimed: no production Vercel, Capgo, Firebase rules, app, or coffee data changes. | Out of scope |

## Remaining acceptance work

1. Unlock the Mac login keychain so the existing Apple Development private key
   can sign the Capacitor and Cordova frameworks.
2. Rebuild, install, and launch the Dev bundle on Tal's exact phone; verify the
   installed bundle identity before any conversation evidence is accepted.
3. Authenticate only the isolated fake Dev fixture and run the scripted
   installed-app scenarios from the runbook. Do not add a test-login backdoor.
4. Have the product owner complete the five unscripted physical-device
   conversations and record verdicts. Any bad verdict becomes a new fixture and
   returns the code through the live smoke/full-gate sequence within the
   remaining budget.

No production data, Firebase rules, production Vercel, or production Capgo was
changed. Diagnostic ledgers and 30-day redacted reports were preserved. Product
PASS remains false until the remaining installed-app and owner gates pass.
