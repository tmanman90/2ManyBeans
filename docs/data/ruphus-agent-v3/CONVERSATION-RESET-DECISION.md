# Conversation reset decision

## September 8 native scrolling follow-up — 08:28 PDT

Post-install regression: `node scripts/verify-ruphus-agent-ui.mjs` passes on
current source (ed35525 plus documentation), mobile and desktop, including
context-free opening, hydration toggle, injected proposal actions and keyboard
padding, with no network writes. This is rendered harness evidence, not a new
paid-provider gate or complete native fixture matrix.

On the same installed ed35525 Dev app and authenticated simulator, CUA gestures
through a localhost serve-sim mirror successfully moved the native transcript
back to the original Kalita conversation and forward to the retained permanent-
recipe request and trial card. The trial disclosure opened without invoking a
save. This closes the earlier unproven native-scroll observation for this
conversation; it is not a complete fixture or physical-device acceptance pass.
Returned to the signed-in three-jar Rotation screen. No phone operation, model
call, recipe mutation, reinstall, logout, production change or deployment.
The exact simulator mirror was stopped and its shared lease released afterward.

## September 8 installed simulator restoration fix — 08:20 PDT

After Orbit explicitly released its completed build, acquired the shared lease.
Guarded Dev copy and independent built-bundle inspection verify Dev app ID,
isolated Firebase, existing `4k1bn2ol0` preview, updater disabled, and the new
restoration label. XcodeBuildMCP incremental simulator build passed in 12.7s;
in-place install and launch process 32221 passed without deleting its container.
CUA screenshots directly showed signed-in three-jar Rotation, then the new
Restoring your conversation status, then the retained trial/Undo transcript.
This closes installed native observation of the loading-state fix on ed35525.
Final screenshot:
`/var/folders/xx/hyp761n50hq2mw2ndtfrgs8c0000gn/T/screenshot_optimized_aa738b34-167f-4d20-8887-b921ac6eb302.jpg`.
Native CUA drag still did not demonstrate transcript scrolling; do not count
that as passed. Returned to Rotation and released the lease. No phone, paid
model call, production change, Capgo upload or login change. Backend preview
still runs the previously accepted backend; no new final-code live gate claimed.

## September 8 local restoration-state fix

Owner clarified that remaining simulator-only fixes are already authorized.
ChatTab now presents an accessible restoring status instead of an empty-chat
greeting while initial transcript storage is unresolved (including an empty
local cache pending remote hydration). Existing visible conversations are not
hidden, and demo/signed-out opening remains unchanged. The diagnostic probe was
first changed to reject the premature greeting and failed on the old source;
it now passes, including 16-turn history restoration/browser scrolling and a
genuinely empty remote history reaching the normal welcome screen. Screenshot
`/tmp/ruphus-chat-restoring.png` was visually inspected. Fourteen session and
persistence tests, scoped lint, web build and diff-check pass.

This is a local UI-only change: no model, endpoint, command, authentication or
storage protocol change; no paid calls. It is not yet copied into the installed
simulator or deployed. The previous live gate still proves bdf6860, not this
new source revision. Native verification remains next; no phone use required.

## Real Chat diagnostic — delayed transcript and browser scrolling

`node scripts/probe-chat-hydration-scroll.mjs` mounts the actual ChatTab with
the existing harness providers and an injected, manually released storage
promise. It restores 16 synthetic turns; no external traffic or non-GET
request is allowed. Result: `prematureWelcomeWhileHistoryLoading:true` and
`realChatBrowserScroll:passed`, with zero page errors/network writes. A wheel
gesture moved the overflowing real log to its top and the first saved turn
was visually inspected in `/tmp/ruphus-real-chat-scroll-top.png`. This is
browser scroll evidence, not native touch or expanded-recipe-card proof.
The loading flash is reproducible: `isIntroState` renders RuphusOpening before
useChatSession finishes, without a hydration-state condition. No product
fix is applied yet; the explicit fix question remains pending. Probe lint
and diff-check pass. No paid call, login change, simulator or phone operation.

## September 7 simulator-only follow-up — 22:45–22:51 PDT

After explicit owner authorization and Orbit's shared-window release, acquired
the canonical shared lease and launched the existing Dev install in place
(process 65151, simulator `7EC6BF90-33B7-4B1A-A651-464B4AC9AA9E`). No build,
install, phone operation, logout, reset, or paid model call occurred.

Screenshot-driven native Simulator CUA verified:

- Signed-in three-jar Rotation and separate Learn / Ask Ruphus controls.
- Direct Chat hydrated its retained trial and Make this my recipe action.
  A welcome panel was visible briefly before transcript hydration; do not
  describe this as a seamless loading transition.
- Software-keyboard touch entry of the unsent text `Kalita`; composer and Send
  remained above the keyboard. Cleared only that test draft. Initial desktop
  typing did not reach the field; keyboard routing was adjusted and touch
  input proved the field works. This is not proof of every keyboard mode.
- Expanded trial details contained 14 g coffee, 42 g bloom and 215 g total
  water. Tasting → Chat retained the expanded card and save control.
- Receipt-level Make this my recipe saves directly, rather than opening a
  review dialog. This test produced Recipe updated, then Undo produced Recipe
  update undone / Change undone. Read-only Dev Firestore verification confirmed
  the promoted revision matched the trial and the Undo revision/live projection
  matched the preceding recipe. The original Dev recipe is restored.
- New chat displayed an Earlier conversation card; Continue restored the
  retained trial and Undo receipts without a model call or transcript deletion.

Evidence: screenshot
`/var/folders/xx/hyp761n50hq2mw2ndtfrgs8c0000gn/T/screenshot_optimized_16756ebe-add1-4292-9411-e783a1363607.jpg`
shows the restored receipts. Runtime log for process 65151 had zero matches for
the explicit Uncaught Error/TypeError/ReferenceError and Unhandled Promise
Rejection scan; this limited scan is not a claim of exhaustive error absence.
AXe snapshot failed with the existing CoreSimulator architecture error. Native
CUA drag/wheel attempts did not establish manual long-card scrolling, so that
check remains insufficient evidence; tab return did position the action visibly.
No new conversational switching, retry, or full seeded-fixture matrix claim.

Left the app signed in on Rotation and released the lease to Orbit. Cumulative
testing remains $42.533545, reserved $0. These additional simulator checks do
not establish physical-device or R29 owner-unscripted acceptance.

## Current acceptance summary — September 7 final live gate PASS

Final product source `bdf686024cd692f48c734a1bf7d6127b527757e7` passes the unchanged full live gate in `conversation-eval/u3-action-check-1788840130579/report.json`: 69 conversations, 66 deterministic-clean, zero catastrophic failures, calibrated different-family judge, all per-run judge/pairwise criteria passing, and all latency budgets passing. Checked replies: p50 3.39s, p90 5.02s; read rounds p90 230ms. Three ordinary findings remain preserved: AE01-2 and AE07-3 unmatched clarification branches, AE14-3 regeneration before a correct V60 reply. These are not erased or relabeled. Prerequisite same-source smokes `1788839408184` and `1788839610207` each passed with zero findings. Fresh CLI token lifetime was verified at 59 minutes immediately before this full run.

Cumulative paid testing is **$42.533545 of the authorized $45 total**, with **$0 reserved** and **$2.466455 remaining**. No additional paid run is active. Source/test proof is 102 focused contract/runner/runtime/endpoint tests, scoped lint, web build and diff-check. Latest Dev preview and matching simulator install are recorded below. The signed-in native core journey has independently proven proposal → trial → cold return → natural permanent-save request → promotion → Undo, plus running/paused timer cold recovery and Stop cleanup. This is not a claim that every critical fixture was scripted through native UI.

**Product PASS remains unproven.** The complete critical-fixture simulator click-through, scripted physical Dev-device category, and R29's five owner-unscripted physical conversations across three surfaces including tasting are not collectively proven by the core simulator journey or live endpoint gate. Latest owner instructions prohibit phone operations, so no physical action is taken or implied. No supported fixture-auth native backdoor was introduced. Owner verdicts cannot be fabricated or inferred. U5 remains explicitly deferred. Production, Capgo, real cloud coffee data, push/PR/merge remain untouched; diagnostic ledgers and report directories stay unstaged and preserved.

## September 7 tasting-link classifier correction

Final candidate `bdf686024cd692f48c734a1bf7d6127b527757e7` is READY at `https://twomanybeans-ruphus-4k1bn2ol0-tmanman90s-projects.vercel.app` (`dpl_8gB22Q2YKp8MBwjDWVRW1MfHLexR`). Smokes `u3-action-check-1788839408184` and `u3-action-check-1788839610207` both pass with zero findings. Spend $41.042350, no reservation. Guarded native copy, incremental build9s, in-place install and launch41321 pass. Initial install failed because the simulator was Shutdown; booting that same simulator and retrying succeeded without erase/uninstall. Built bundle verifies exact preview, isolated Firebase, Dev identity/display name, Ask label, updater false and Dev channel. Screenshot `screenshot_optimized_5946779d-50f2-408b-a0a0-a8efeb7ca83e.jpg` confirms signed-in three-jar Rotation. Shared window released. Full gate remains pending; no physical/owner acceptance claim.

11e977a smoke `u3-action-check-1788838834823` passes with AE07 unexpected clarification retained; second smoke `u3-action-check-1788838998653` fails with AE06 evidence-scope and AE14 unexpected clarification. Exact AE06 text says an older tasting exists but no tasting is linked to the recent cup. The classifier misses “no linked tasting for it” / “no tasting tied to that cup”, conflating link absence with all-history absence. Test-first correction recognizes only these cup-link forms after the unavailable-source guard; unavailable tasting sources and unqualified coffee-history absence still fail. Focused 102-test matrix and source/test lint pass. AE14's unmatched question is not reclassified or removed. No fixture, prompt, threshold, source diagnostics or command authority changes. Spend $40.982385, no reservation. New smoke cadence required.

## September 7 exact-sizing classifier follow-up

Prior-code full `u3-action-check-1788837385072` completed 69 conversations and FAILS: AE05-2/3 C5 flags violate the per-fixture clean threshold; AE10-3 additionally retains a history-before-evidence finding. Zero catastrophic findings, calibrated judge, all judge/pairwise cases and latency budgets pass (checked reply p50 3.37s/p90 5.24s, read p90 213ms). Original reports remain unchanged; cumulative spend $40.924064, reserved $0. New candidate's smoke/full cadence is required, not a retrospective rewriting of this result.

Candidate `11e977a` is READY at isolated preview `https://twomanybeans-ruphus-36gjfgjb0-tmanman90s-projects.vercel.app`, deployment `dpl_9XTPD8pRxzqATJKRxSUbBcf7QahB`. Guarded native copy verifies isolated Firebase, owner controls, updater false and Dev channel. After GETUP explicitly released the shared window, XcodeBuildMCP incremental build (10.4s), in-place install and launch 37026 passed. Built bundle independently verifies Dev identity/display name, exact preview, Firebase project and Ask label. Screenshot `screenshot_optimized_b9b78c86-1628-4c14-b841-e2593b20152b.jpg` shows signed-in three-jar Rotation and visible Ask Ruphus. Window released; no phone, logout, reset or Capgo operation. These are native installation/login checks, not the new candidate's live full-gate proof.

The fresh full attempt's AE05 repetitions 2 and 3 reproduce C5 false positives despite explicit Ode 4.2→4.1 advice. The checker fails to link a preceding comparative recommendation to “from Ode 4.2 to 4.1” in the next sentence, and treats “that small grind change should increase extraction” as a second unsized action. Test-first remediation recognizes the explicitly named grinder adjustment and normalizes the referential outcome subject before the existing predicted-outcome check. Both exact transcripts pass; extra unsized water, bloom-time and hotter-water instructions still fail. The 101-test contract/runner/runtime/endpoint suite and scoped lint pass. No model prompt, fixture, judge, threshold, original report or recipe-command authority changed. Current live attempt continues on original deployed code and cannot prove this local correction.

## September 7 method-guard remediation

Full attempt `u3-action-check-1788835966450` was interrupted after 65 persisted conversations by HTTP 401 from the Dev administrative request path. A presence-only expiry check confirmed the Firebase CLI OAuth token was expired; the app's signed-in session was not changed. Completed cases contain zero catastrophic and four ordinary findings (AE01-2/AE05-5/AE09-2 C5 sizing and AE06-3 evidence scope); these are not a full PASS. The harness does not persist successful calibration state before terminal aggregate creation, so resuming its partial artifacts cannot establish the complete gate. All reports remain untouched. Cumulative spend is $39.438815 with no reservation. Firebase CLI refresh succeeded, with 59 minutes remaining before the identical fresh full attempt; no source, fixture, judge or threshold change.

Final method-guard candidate `5b5b435fc7726c2beb5b2e3d0240b186aae642f6` is READY only at `https://twomanybeans-ruphus-llh1wvevj-tmanman90s-projects.vercel.app` (`dpl_7Qg9frupdrnVoiL66P5ComvcNV5z`). Both prerequisite smokes (`u3-action-check-1788835616787`, `u3-action-check-1788835796133`) passed with zero findings. Full run is in progress; no final pass yet. Guarded Dev copy, XcodeBuildMCP build (10.6s), in-place install and launch 25098 passed. Final bundle verifies Dev identity/display name, exact preview, isolated Firebase, updater false, Dev channel and Ask label. Screenshots show preserved signed-in three-jar Rotation and retained trial card with Make this my recipe. Returned to Rotation and explicitly released simulator/build lease. No phone, production, Capgo, logout or reset. Spend before full: $37.997214.

Full candidate 957083a report `u3-action-check-1788834093351` completed but FAILS: AE14 repetitions 2/4/5 required regeneration. Read-only isolated-fixture telemetry confirms `RT6_METHOD_CONTRADICTION` for each, with no second failure. Delivered replies correctly use V60; discarded draft text is not retained, so its exact wording is unknown. A concrete local reproducer shows the guard rejects the valid correction “Got it—V60, not Kalita” solely because it counts a negated method mention as a contradiction. Minimal correction excludes directly rejected method mentions (“not”, “rather than”, “instead of”) from the output guard, preserving default method parsing and blocking affirmative wrong-brewer advice. Tests cover negated correction, mixed wrong-brewer advice, uncertainty, and iced/hot mismatch; orchestrator proof uses one provider call with no retry for the valid correction. Expanded suite 107/107 passes. This proves the guard defect, not the exact discarded live draft; new live evidence remains necessary. Failed reports are preserved; spend $37.939250, reserved $0.

## September 7 classifier correction — final candidate 957083a

Candidate `957083a923007c5d950cf3a9be48bc2a922e4446` is READY on isolated preview `https://twomanybeans-ruphus-5sz2j6i1c-tmanman90s-projects.vercel.app`, deployment `dpl_4XhJRT6muKSEP2qLbme6W8qPduaS`. The earlier same-source preview `900yjwzyw` used abbreviated commit metadata and was not used for acceptance. Guarded native copy, XcodeBuildMCP build (22 seconds), in-place install and launch 17095 passed. Screenshot checks show preserved three-jar login, retained trial card, and “Make this my recipe”; returned to Rotation and released build/simulator lease. No phone/Capgo/production change. First smoke `u3-action-check-1788833737630` passes with one retained AE14 regeneration finding. Second smoke and full gate pending. Spend $36.424726.

## September 7 final timer recovery — simulator PASS

Full rerun `u3-action-check-1788832016928` completed all 69 cases but FAILS the unchanged per-fixture gate. All conversational judge scores/pairwise results and latency checks passed; no catastrophic finding. Ordinary findings: AE01-2 C5 sizing, AE11-1 evidence scope, AE11-3 history-before-evidence. Exact AE11 transcripts reproduce two deterministic classifier bugs: “I don’t have Moon Base among your saved coffees ... match a recipe” misses the singular-only inventory exemption; “I won’t invent its ... tasting history” misses the refusal recognizer. Test-first two-line remediation adds plural inventory and explicit “won’t invent”; 47 contract/runner tests pass, including a separate following factual history claim that must still fail. No fixture, judgment, calibration threshold, or original report changed. Final-code live verification must account for this correction. Cumulative spend $36.394594, reserved $0.

Final-candidate smokes `u3-action-check-1788831144299` and `u3-action-check-1788831653538` passed; the second retains one ordinary regeneration finding. Full attempt `u3-action-check-1788831812402` stopped before candidate scoring because judge calibration failed: all gold examples passed, but known-bad AE15 scored 2.625 against the unchanged 2.5 ceiling. The rationale correctly identified missing native save confirmation, but its dimension average exceeded calibration tolerance. Original failed report and calibration artifact `u3-1788831825352-calibration-failed-376a096ec42c457d009292e857356bda38f1d4ae` remain preserved. No grader, threshold, fixture, prompt, or app change was made. An identical fresh full attempt is running; its eventual result does not erase this calibration instability. Spend at failed calibration: $34.910954, reserved $0.

Product candidate `376a096ec42c457d009292e857356bda38f1d4ae` is deployed only to `https://twomanybeans-ruphus-i6xyvjqt2-tmanman90s-projects.vercel.app` (`dpl_JEF9c6Kg32saagoxbNymBaypbtS5`). Test-only follow-up `231cc48` makes the hook probe independent of Vite optimizer cache filenames; no subsequent product-source change. The finalized native build log `C55C7464-DADA-469C-9140-C95A931A344D` reports success, zero errors/warnings. In-place simulator install preserved login and three-jar inventory. Bundle checks confirm the exact preview, Ask Professor Ruphus, attempt clock checkpoint code, updater disabled and Dev channel.

Scripted native owner-Dev test: fresh conversation → “I brewed jar one with kalita and it tasted thin but sweet what should I change” → correct hot Kalita 13g→14g advice → “Ok can we update the recipe” → actionable proposal → Try for one brew. Running process 6832 was stopped/relaunched as 7368; the clock continued to 0:33 and caught up to step 2, without restarting countdown. Paused at 0:38, then stopped/relaunched as 7540: it remained paused at exactly 0:38. Explicit Stop, modal close, and third restart as 7709 returned to signed-in Rotation with no resurrected timer. No physical brew or permanent recipe update was performed in this pass. Simulator lease released afterward; phone untouched.

Two native model turns cost $0.002332; cumulative spend after them $34.636230 of authorized $45, zero outstanding reservations. First final-candidate smoke `u3-action-check-1788831144299` passed with zero recorded findings. Second smoke/full cadence remains pending; prior b240 full evidence below is historical, not substituted for final-candidate proof. Physical scripted and owner-unscripted acceptance remain distinct and unclaimed.

## September 7 native action loop and cold-timer finding

On installed b240d06 assets/preview, scripted owner-Dev simulator testing passed: touch-typed jar 1 Kalita thin/sweet prompt → concrete 13g→14g advice (not Aiden) → “Ok can we update the recipe” → one actionable proposal → Try for one brew → matching timer → process stop/relaunch → stop trial → return Chat with persisted card → “Can you make that trial recipe permanent” → recovered exact trial → Make this my recipe → visible saved confirmation → Undo. Read-only canonical verification independently proved promotion snapshot equals trial snapshot, Undo equals pre-promotion recipe, and legacy projection equals restored canonical snapshot. Three native AI turns cost $0.00314; cumulative testing **$34.545014**, no outstanding reservation. Login and three-jar inventory preserved; no phone or production operation. Native process after cold launch: 99167. Proposal screenshot `screenshot_optimized_8afb4a6a-73b2-4848-aa23-489c2b194d23.jpg`; save screenshot `screenshot_optimized_6b279b10-7b07-4391-80e3-d1a8a1da8c49.jpg` in XcodeBuildMCP's returned temporary screenshot directory.

This pass also exposed a distinct native defect: the restored trial timer reran its countdown and reset elapsed time. Local remediation adds attempt-scoped clock anchors, including pause/step state, with Stop/Finish cleanup and attempt-identity isolation. A real-hook browser regression first reproduced failed cold recovery, then passed running/paused restart, rewind/resume, Stop/Finish, different attempts, and corrupt/unavailable storage. Existing lifecycle contract, 21 action/session/U6 tests, targeted lint, diff check, and web build pass. **The timer correction is not yet installed/native-verified**; Orbit's physical compilation/final unit gate holds the shared build queue. Product PASS remains unclaimed.

## September 7 final-candidate live gate — PASS; native acceptance continuing

Follow-up: authenticated browser trial journey `u3-action-check-1788828980687` passed against this preview: live conversation → proposal → Try for one brew → reload/return → natural permanent-save request → recovered trial review → Make this my recipe → canonical readback → New chat retaining eight messages with boundary 8 and empty evidence. Cleanup Undo readback passed. Cumulative spend $34.541874. Earlier browser report `u3-action-check-1788828777552` remains failed at the boundary assertion; read-only verification showed all eight messages and boundary 8 subsequently persisted. The test now waits up to 15 seconds for the app's queued read-before-write transaction, retaining all prior assertions; no app behavior or live conversation criteria changed. Targeted test lint and diff check passed. The rendered mobile/desktop harness also passed.

After Orbit released the simulator, XcodeBuildMCP installed the already-built matching Dev app **in place**, then launched process 94973. Screenshot-driven checks confirmed the existing signed-in three-jar Rotation, separate Learn/Ask Ruphus controls, restored Chat trial disclosure/details and Undo receipts, and loaded Tasting surface. Returned to Rotation and released the simulator for Orbit's focused regression. No native model call, recipe mutation, logout, reinstall-by-uninstall, reset, or phone operation. This closes matching-install/login/navigation evidence, not the full native scripted fixture set.

Owner authorized **$45 cumulative testing**, preserving prior spend. Candidate `b240d06f328f4e2e46780c01bb4c7236b9cc99d0` is READY on isolated Dev preview `https://twomanybeans-ruphus-76moyqb93-tmanman90s-projects.vercel.app` (`dpl_GuMDWAkm1r4MJfXAsdHHVDH6dDck`). Prerequisite smokes `u3-action-check-1788826742008` and `u3-action-check-1788826903440` each passed 12 conversations with zero recorded findings. Full report `u3-action-check-1788827050713/report.json` passed the unchanged gate: 69 conversations, 65 deterministic-clean, zero catastrophic findings; calibrated judge and latency gates passed. Four ordinary findings remain retained: AE01-5 and AE05-5 `C5_DIRECTION_SIZE`, AE10-2 `U3_EVIDENCE_BEFORE_HISTORY`, AE14-1 `U3_REGENERATION_OR_REPLACEMENT`. Checked reply p50 3.23s / p90 5.06s; read-round p90 231ms. Cumulative spend **$34.533775**, outstanding reservation **$0**. No threshold relaxation or diagnostic deletion/staging.

The matching simulator app was copied and built successfully, with independently inspected bundle `com.talmeltzer.coffeehub.dev`, display name `2manybeans Dev`, build 41, the preview above, isolated Firebase `twomanybeans-ruphus-dev`, Ask Professor Ruphus label, `autoUpdate:false`, and channel `dev`. Installation/login/navigation subsequently passed as recorded above; the longer scripted native pass is next, coordinated with Orbit's lease. No further build is needed. No phone, production, or Capgo operation. Full scripted native/device and R29 owner unscripted acceptance remain unproven; **not Product PASS**.

## September 7 owner-account regression repair — not Product PASS

September 7, 14:37 PDT: after Orbit explicitly released the canonical simulator, XcodeBuildMCP launched the existing Dev app in place (process 34913). Screenshot-driven navigation confirmed signed-in three-jar Rotation, separate Learn / Ask Ruphus controls, loaded Tasting surface, restored Chat trial disclosure, expandable recipe details, and “Recipe update undone” / “Change undone” receipts. Returned to Rotation and released UI back to Orbit. No install, login change, model call, recipe mutation, or phone operation. This tests the existing simulator assets, not the latest undeployed C5 correction and not the full scripted fixture set.

Read-only isolated Dev telemetry for the interrupted full-run AE14 window showed two `RT6_METHOD_CONTRADICTION` regenerations at 21:30:02Z and 21:30:18Z, each with empty `secondFailure`. Original draft wording is not retained, so it is not possible to distinguish incorrect advice from a mention of the prior method. The guard remains unchanged; these are not dismissed as false positives. Acceptance audit still requires final-code live cadence, complete scripted native/device evidence, and R29 owner conversations. The latest instruction prohibits phone operations until explicitly requested again. No acceptance category is substituted for another.

Full run `u3-action-check-1788815403257` on f482399 terminated before dispatch at the cumulative budget guard: $32.998109 spent, $0 reserved, $35 authorized. The next maximum reservation would exceed the ceiling. Its 56 saved case reports are partial evidence only: no recorded catastrophic findings, two C5 sizing flags (AE03-2 and AE05-3), and two regeneration findings (AE14-4/5). The full gate is **incomplete / not passed**; all original reports and ledgers remain unchanged. No more paid calls were made. Local test-first correction covers the two exact C5 replies: explanatory “finer grinding” after a bounded adjustment and an explicit from/to adjustment in the following sentence. Historical settings alone and unsized extra controls remain failures. Contract/runner tests 46/46, targeted source/test lint, diff check, and web build pass (existing dynamic-import/Browserslist warnings). This local correction is not deployed or live-proven; regeneration findings and remaining native/owner gates remain open. Phone and existing logins untouched.

Current evaluation candidate f482399 is READY on isolated Dev preview `https://twomanybeans-ruphus-fxsgscf5j-tmanman90s-projects.vercel.app`, deployment `dpl_2khuSikn5xZCps1x27wTpRPzoeur`. Prerequisite smokes `u3-action-check-1788815095840` (12 runs, no findings) and `u3-action-check-1788815245510` (12 runs, one AE14 regeneration, zero catastrophic) passed under unchanged rules. Cumulative spend after them: $31.673605. Full scoring has started with the primary app's existing local Anthropic key injected only in process memory; no credential copied to the worktree or managed environment, and no result is yet claimed. Native simulator still uses n4dc9fn3w (prior candidate); phone remains untouched. Retain all original diagnostics.

Latest live smoke `u3-action-check-1788814696683` on 9152c3e failed: zero catastrophic, three ordinary runs (AE03/AE09 C5 sizing; AE14 regeneration). Spend is $31.613195, no outstanding reservation. Exact AE03/AE09 replies exposed two deterministic false positives: noun phrase “for this test” was treated as an imperative, and “one small Ode grind step” was not recognized as a size. Added exact-reply and genuinely unsized-control regressions; 45 contract/runner tests plus targeted lint/diff checks pass after narrow grammar fixes. Original report remains failed and unchanged; no full-gate claim or threshold relaxation. Existing app ANTHROPIC_API_KEY is available in primary local configuration for nonprinting evaluator injection; no managed production settings were changed. Simulator process 15396 now uses n4dc9fn3w preview, with signed-in Rotation visually confirmed and UI released to Orbit. Phone untouched.

Integration checkpoint: 81 combined hydration/dismissal/session/persistence/endpoint/action/artifact/U6/routing tests pass on source 9152c3e. Isolated Dev preview `https://twomanybeans-ruphus-n4dc9fn3w-tmanman90s-projects.vercel.app` is READY, deployment `dpl_AuuHiLyVdCXn13KCmhthVAYUVUCR`, project `prj_puSGDxI5uv7x98v0NRLz0Yk8KNus`, target null, source `9152c3eecb7ef3651e7176a7c7f5ccde7a7959a8`. This brings shared session fixes to the backend but is deployment evidence only: no new live smoke/full scoring. Final judge remains unavailable. Installed phone and simulator still point to the prior 1159y8ie2 preview; neither was updated during this deployment. No production/Capgo change or model spend.

Native follow-up September 7, 13:50 PDT: after waiting for Orbit's explicit simulator release, XcodeBuildMCP installed/started 716aafb in place on 7EC6BF90-33B7-4B1A-A651-464B4AC9AA9E, process 11348. Screenshot inspection showed the signed-in three-jar Rotation, no first-bean overlay, and visible separate Learn / Ask Ruphus controls. Chat then restored the existing trial and undone-recipe receipts without reauthentication. This supports the cold-start regression fix alongside the source-executed tests; it is not a full fixture-set pass. Simulator was released back to Orbit promptly. No phone operation or model call.

Cold-start celebration correction: the new early App mount exposed an inherited zero-to-nonzero bean-count effect that mistook initial cache/Firestore hydration for adding a first bean. The effect now establishes an owner-scoped baseline only after dataLoaded. Source-executed regressions failed for existing-inventory hydration and owner transition before the change; all three pass afterward, including a real empty-loaded-to-first-add control. Related artifact/dismissal matrix passes 20/20; targeted source/test lint, build and diff checks pass. This source correction has not yet had a native cold-launch recheck. No phone interaction, auth changes, provider calls or cloud writes.

Simulator-only follow-up (September 7, 13:38 PDT): owner requested no further phone launches/updates; phone work is paused until explicitly requested again. During a coordinated simulator interval, XcodeBuildMCP installed current client 6865446 in place and launched process 7517. Google login survived. Native on-screen keyboard entered `Test`; it was removed without sending. New chat showed the entire greeting above the scroll boundary alongside Continue; Continue restored existing trial/Undo cards and the empty composer. Actual authenticated browser additionally verifies sequential typing after Continue and after Rotation → Chat, restores its original draft, and makes zero model/recipe requests. Targeted browser-script lint and diff checks pass. Simulator UI was released back to Orbit; no phone calls, no AI spend. This is narrow native/browser acceptance, not all critical fixtures or Product PASS.

Opening recovery repair (September 7, 13:35 PDT): intro-state scroll effects now keep the greeting at the top rather than scrolling it like a new conversation reply. The actual authenticated Dev browser reproduced the clipped greeting before the change; the same opening/Continue geometry check passed afterward and restored the existing transcript before asserting. Screenshot `/tmp/ruphus-opening-recovery.png` was visually inspected: greeting and Continue are fully visible at 390×844. The 27 artifact/session tests, rendered mobile/desktop harness, targeted lint, guarded Dev build/copy and diff checks pass. XcodeBuildMCP installed in place and launched only the exact phone's Dev app, process 19918. No uninstall, sign-out or data clearing; phone visual/auth acceptance of this change remains unverified. Simulator UI was left to the concurrent Orbit task. Zero model calls or recipe commands for this repair; cumulative spend remains $31.583579. Full final gate and owner unscripted acceptance remain open.

Phone follow-up at 13:26 PDT: the Continue repair was installed in place on the exact Dev phone, but launch was denied by iOS because the device was locked. XcodeBuildMCP completed installation then returned Locked at launch; no physical UI acceptance is claimed. No uninstall or data clearing occurred.

Recent archive Continue repair (September 7, 13:25 PDT): sessionPresentation now offers Continue when New chat has archived all messages, regardless of age. Explicit Continue resets that archived boundary and clears stale evidence without deleting messages. Regression failed before the change; 34 endpoint/session/persistence tests, targeted lint, rendered browser harness, guarded Dev asset build/copy and diff checks pass. Native simulator 99368 showed Continue, resumed the transcript and retained it after Rotation → Chat. Read-only isolated Dev metadata changed from 19 messages / boundary 19 to 19 messages / boundary 0 after the UI tap. Google login remained intact. Simulator UI was coordinated with the concurrent Orbit task and released afterward; do not use its UI without coordinating. The opening scroll position when Continue appears still clips the top of the greeting; visual polish remains open. No AI spend, no Product PASS.

Follow-up Undo display repair (September 7, 13:19 PDT): native inspection showed a stale Recipe updated / Undo control after successful Undo. Session save and both hydration paths now retire controls for the exact undone revision, including older Firestore receipts with revision identity but no coffee/slot fields; the prior card says Recipe update undone. Regression initially failed; final session/persistence/action suite 32/32, targeted lint, rendered harness, guarded Dev copy/build and diff checks pass. Signed-in simulator process 97083 visibly restored the existing owner chat with corrected card and no stale Undo. Exact phone A34D2908-AC86-59E1-8172-A69FBE33FCFC became connected; XcodeBuildMCP in-place Dev build/install/launch succeeded, process 19789. No uninstall or auth clearing; physical UI/auth not inspected, so this is installation evidence only. Further native New chat test exposed missing Continue for a recently archived conversation: sessionPresentation currently offers it only for stale age. This is an open S4 acceptance failure; no Product PASS. No new model calls or spend.

Follow-up native cancellation repair (September 7, 13:12 PDT): continued navigation exposed an actual stopped-trial timer restart on Rotation remount. The per-mount launch guard reset while the durable outbox still had stage `brew`. Timer dismissal now persists stage `dismissed`, retains the snapshot/provenance, and removes only automatic launch eligibility; explicit new handoff can restart it. Two new regression tests failed before the fix and pass after it; five dismissal/U6 tests plus 31 action/session/persistence tests, targeted source/test lint, rendered mobile/desktop harness, guarded Dev asset build/copy and diff checks pass. XcodeBuildMCP in-place simulator build/install/launch succeeded (92754); native Stop → close recipe → Chat → Rotation no longer restarted the timer. A full process stop/launch (93003) also retained Google login and did not restart the timer. No uninstall, sign-out, auth clearing, paid AI call, production or Capgo change. Simulator remains signed in on Rotation. Cold launch additionally showed an inappropriate “Your first bean” celebration for the existing three-jar account; dismissed visually, not yet fixed. This is a remaining UX issue, not Product PASS.

Authenticated native simulator milestone (September 7, approximately 12:55–13:01 PDT): owner completed normal Google login in Simulator; login was preserved without uninstall, data clearing, or sign-out. Current client `84c57bc` built/installed/launched via XcodeBuildMCP on simulator `7EC6BF90-33B7-4B1A-A651-464B4AC9AA9E`, process 87469. CUA screenshot-guided touch typing exercised five live turns: jar-one watery complaint (iOS autocorrected Kalita to Lakota), explicit brewer correction, thin/sweet/clean clarification, update request, and natural permanent-save request. Observed recovery to hot Kalita, a 13→14 g native proposal, Try for one brew opening the Kalita timer, stopped timer without claiming a physical brew, return to Chat retaining the trial, recovered native permanent-save card, UI promotion, visible Recipe updated + Undo, and UI Undo. Read-only Dev revision-chain verification returned ownerOriginalRecipeRestored, persistedPromotionProven, persistedUndoProven, and liveProjectionMatchesOriginal all true. Five per-turn maximum reservations were reconciled against exactly one new owner telemetry trace each; spend increased by $0.005505 to $31.583579, with no outstanding reservation. This proves this native simulator core journey, not all plan scenarios, physical-device acceptance, full current judge gate, or owner unscripted acceptance. Signed-in simulator remains open in Chat.

Current backend `32493302f2adeb46c447b8a7f69ee8b90c84f289` now has two passing prerequisite live smokes: `conversation-eval/u3-action-check-1788805317777/report.json` and `conversation-eval/u3-action-check-1788805499149/report.json`. The first has 12 conversations with zero catastrophic/ordinary findings and checked-reply p50 3.19s/p90 5.66s. Cumulative spend after both is $31.578074. Full evaluation attempt `u3-action-check-1788805652552` stopped before scoring because the independent judge credential was unavailable: metadata-only lookup found no ANTHROPIC/JUDGE environment entry in this Dev Vercel project and no process judge token. No full PASS or judge spend is claimed. The exact phone is still disconnected. Do not replace the judge or weaken the gate to get a pass.

Continuation `84c57bc` fixes a further confirmed history defect: a second New chat could discard the earlier archived prefix. Both remote transactional resets and the local cache now preserve it; explicit Continue retains its active boundary instead of archiving the resumed conversation. Proof: 13 session/persistence tests, the actual local Firestore rules test (no skipped test; positive transactional reset/read-back plus negative owner/authority cases), mobile/desktop rendered harness, targeted source/test lint, build, and diff checks passed. No paid calls or cloud rules changes. Guarded Dev copy and XcodeBuildMCP device build passed with the current preview, owner controls, isolated Firebase, disabled updater and Dev channel. The exact phone remained disconnected at the fresh device check; this source is built but not installed. Current full live and authenticated native gates remain unproven. Cumulative testing spend remains $31.519053.

The owner explicitly authorized signing into the isolated Dev account and testing its real conversation/action journey. Source repairs `bde0a4c`, `561925b`, and `3249330` address confirmed defects: active-only transcript writes broke the retained New-chat boundary; provider replay ignored that boundary; late hydration could replace an active conversation; server transcript persistence omitted delivered cards; and the App shell let the chat log expand beyond the viewport. The previous native build also omitted the owner's client mutation allowlist. These are confirmed defects, not proof of which route produced the owner's quoted Aiden answer.

Current backend preview is `https://twomanybeans-ruphus-1159y8ie2-tmanman90s-projects.vercel.app`, deployment `dpl_GhJJM7rJhofihTB5tCf8JSE64LTr`, source `3249330`, READY and non-production. Focused endpoint/runtime/session tests passed 61/61; targeted lint and rendered mobile/desktop harness passed. The prior full live gate below belongs to an older source and is not current full-gate proof.

Actual owner Dev browser journey passed: four typed live turns, native proposal card, Brew once, reload and trial restoration, natural-language permanent-save request, recovered trial card, UI promotion, canonical read-back matching the trial, and Undo restoring the original recipe. No physical brew was claimed. Earlier operator assertion failures were not counted as passes; their save/Undo state was independently read back before the clean rerun. Browser assertions now wait for hydration, the actual dispatched reply, turn completion, and server persistence; existing messages can no longer stand in for a newly completed turn. Recorded spend after the clean run was $31.510423 of the cumulative $35 cap.

Final client follow-up `d69190f` closes the expanded trial review after promotion and attaches the confirmation to the latest recovered trial, not the older proposal. The owner-account journey passed again, including an assertion that the save confirmation is above the composer and a screenshot inspection. Evidence: `conversation-eval/u3-owner-browser-1788804487000/report.json`, with proposal/save screenshots. Final recorded spend is $31.519053, zero outstanding reservations. The 61 focused tests, rendered harness, targeted lint, and diff checks passed after the final source edits.

Guarded Dev assets include the owner-only client mutation access, isolated Firebase, current preview, Ask Professor Ruphus, `autoUpdate:false`, and channel `dev`. XcodeBuildMCP built, installed, and launched only `com.talmeltzer.coffeehub.dev` on the exact authorized phone, process 18241 for source `3249330`. Final client `d69190f` copied and built, but installation failed with Apple `kAMDRemoteConnectError`; a fresh device listing confirmed the exact phone disconnected. The final review-collapse/confirmation-location UI polish is therefore not claimed installed. This is not physical scripted UI proof. iPhone Mirroring still requests the Mac login password; it was not bypassed. Production and Capgo remain unchanged; diagnostic ledgers/reports remain unstaged and preserved.

## Prior September 7 full gate status — historical, not Product PASS

Full live conversation gate **PASS**: `conversation-eval/u3-action-check-1788799282598/report.json`, source `805c3478f7f95dbdb44379e4e8f307037cf5a96d`, manifest v3 `f92486c57c9c0766`, on isolated Dev preview `https://twomanybeans-ruphus-b0f2m7is1-tmanman90s-projects.vercel.app`. Both prerequisite same-build smokes completed clean (`u3-action-check-1788798438416` and `u3-action-check-1788798943949`). All 69 scheduled conversations completed; 67 were deterministic-clean, zero catastrophic failures. The two ordinary failures remain recorded: AE02 repetition 3 asked an undeclared open-ended question; AE14 repetition 2 required regeneration before a correct V60 response. One AE05 repetition received a below-threshold judge score; the full set still met the approved per-fixture cadence threshold. Checked reply p50 3.64s/p90 5.85s; read round p90 219ms. Cumulative recorded testing spend: **$31.487331 of $35**.

This is backend conversation evidence, not Product PASS. Authenticated simulator and physical-device scripted acceptance and the required owner unscripted conversation log remain unproven. The live evaluation itself did not update the phone. Production, Capgo, and diagnostic history were not changed. The prior failed full gate remains preserved below as historical evidence.

Native follow-up: guarded `cap:copy:dev` completed with the passing preview and isolated Firebase `twomanybeans-ruphus-dev`. Copied assets verified the Ask Professor Ruphus label, preview URL, `autoUpdate:false`, and channel `dev`. XcodeBuildMCP built and installed only `com.talmeltzer.coffeehub.dev` on exact phone `A34D2908-AC86-59E1-8172-A69FBE33FCFC`; launch was denied explicitly because the phone was locked. Built bundle verifies display name `2manybeans Dev`, build 41, and the Dev updater settings. Simulator build/install/launch succeeded, process 49967, on `7EC6BF90-33B7-4B1A-A651-464B4AC9AA9E`. Screenshot inspection shows the normal Apple/Google sign-in screen, not an authenticated fixture journey. The ARM XcodeBuildMCP path works around the default AX architecture error but exposes no actionable WebView targets in that snapshot. Existing native authentication uses Apple/Google credentials; no fixture login backdoor was added. Do not infer scripted chat or owner acceptance from installation or the sign-in screen.

Subsequent explicit Dev-only launch succeeded on the exact phone, process **17526**. The earlier lock denial is resolved; authenticated scripted interaction and owner conversation evidence are still missing.

### Prior September 7 checkpoints (historical)

Remediation preview `https://twomanybeans-ruphus-b0f2m7is1-tmanman90s-projects.vercel.app` is READY, target non-production, source `805c3478f7f95dbdb44379e4e8f307037cf5a96d`. It contains trial-pronoun binding, launch-clue wording that does not claim an actual brew, and evaluator corrections for explanatory effects and equivalent sensory wording. The focused source set passed 77 checks; build/lint/diff checks passed. First smoke `conversation-eval/u3-action-check-1788798438416/report.json` passed 12/12 without deterministic failures, including AE15 exact actionable trial recovery; checked-reply p50 3.35s/p90 5.83s. Cumulative spend $29.927121. Second same-build smoke is running. The full gate below remains FAIL until new proof replaces it; neither Capgo nor the installed native app was changed.

The completed 69-conversation run `conversation-eval/u3-action-check-1788796415608/report.json` is **FAIL**, at $29.896213 cumulative spend. Judge v13 calibration passed. Original reports and ledgers remain unchanged by remediation. AE15 repetition 1 failed to recover the chat's trial card and asked an unnecessary coffee-identification question; later repetitions recovered it. Source tracing showed the trusted binder recognizes "that coffee" but not "that Kalita trial recipe", leaving the latter to probabilistic resolution. A local reference-binding correction now passes 30 reference/endpoint/trial tests, including first-provider-request identity and no-current-coffee/explicit-other-coffee controls. It is not yet deployed or live-proven.

Other open gate findings: two AE09 C5 sizing flags on explanatory contact-time prose after explicit 4.2→4.1 recommendations; AE14 initial launch-method evidence missing, one regeneration, and an undeclared sensory-question wording. These remain recorded failures, not silently reclassified passes. Current native simulator recheck shows the normal Apple/Google sign-in screen; exact owner iPhone remains connected. No authenticated native acceptance is claimed.

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
