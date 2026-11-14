# Recipe-first coaching acceptance

Plan: `docs/plans/2026-09-08-001-feat-ruphus-recipe-first-coaching-plan.md`.

## Current result

**Engineering acceptance PASS.** All four integrated native journeys passed
on `d7a3e3d`; final `b4968e9` passed field-specific native confirmation of the
technique caption and New-chat boundary corrections. Those corrections change
no action or timer execution path. Required engineering work is complete;
the owner's personal feel verdict remains pending, not inferred from tests.
The original conversation-reset evidence remains separate; it does not prove
these new interactions.

## Authority

- Worktree/branch: `codex/ruphus-recipe-first`, based on `386e42b`.
- Dev only: Firebase `twomanybeans-ruphus-dev`; native bundle
  `com.talmeltzer.coffeehub.dev`, displayed as `2manybeans Dev`.
- Use the already-signed-in Dev simulator account. Preserve login and data;
  never uninstall, erase, seed/reset this account, or inject authentication.
- Capture original recipe state before test changes and verify Undo restores it.
- Do not operate the phone, production services, production app, or Fellow.
- Keep seeded backend evidence distinct from native owner-account evidence.
- Owner feel verdict may remain pending without blocking engineering acceptance.
- Cumulative paid-testing ceiling remains **$55**. The authoritative ledger is
  the existing `feat-ruphus-agent-v3` worktree's
  `docs/data/ruphus-agent-v3/conversation-eval/live-cost-ledger.json`.
  At implementation start it recorded $47.994262 spent and $0 reserved.
  Read and reserve against that same ledger before any new paid dispatch;
  the new worktree's tracked copy must not reset prior spend.
- Preserve all diagnostic ledgers and report directories. Do not stage them.

## Required integrated journeys

| Journey | Required observation | Current evidence |
| --- | --- | --- |
| Ratio-first Kalita | Thin/sweet diagnosis produces ratio advice and a recipe card. Open, change 13 g to 20 g with coherent quantities, close without saving or starting, reopen with draft intact, explicitly Start, return to the retained trial, save and Undo to the original. | PASS d7a3e3d: 1:15.5, 20 g / 310 g, 60 g bloom; one attempt, Save/Undo and all 48 hashes restored. |
| Different V60 technique | Suggest an eligible different family with source/adaptation distinction; review and scale it without changing family; explicitly start, return, save and Undo. Aiden stays unchanged. | PASS d7a3e3d: Hoffmann large-batch experiment, 21 g / 350 g / 42 g bloom, exact timer, Save/Undo. Final b4968e9 native caption and New-chat check also PASS. |
| Relaunch recovery | Preview/trial, dose, chat history and receipts survive relaunch without losing login. | PASS d7a3e3d: Kalita draft and V60 lost-response draft/attempt recovered after full stop/launch; login/transcript/receipts retained. |
| Failure and stale state | Network loss, double taps and a changed canonical recipe produce truthful recovery, no duplicate attempt, no wrong dose/target and no false save/start. | PASS d7a3e3d: one real successful command response discarded; truthful failure, relaunch/repeated Start recovered attempt 15 without duplicate. Stale Kalita blocked with visible recovery control. |

## Evidence separation

| Layer | Current result |
| --- | --- |
| Calculation | Focused local tests passed; supported dose profiles and ratio copy agree. |
| Preview preparation | Actual injected handler and repository checks passed, including a changed proposal, canonical no-write behavior and replay identity. |
| Technique generator | Local source eligibility, explicit-family generation and reviewed-setting tests passed. |
| Rendered application | Both root-run mobile/desktop harnesses passed, including production recipe-page 13→20 g, close/reopen, explicit Start and mobile stale recovery. |
| Live Dev backend | Required Kalita and V60 native turns passed. Final cumulative spend $48.011302, reserved $0; $0.017040 incremental for this plan. Historical failed probes remain recorded below. |
| Signed-in native Dev simulator | All four required native journeys plus final caption/session corrections passed; 48 original saved recipe hashes restored, login preserved. |
| Owner personal verdict | Pending; not an engineering blocker. |

Final evidence must identify the exact commit and Dev preview tested, rendered
viewports/screenshots, native installed bundle identity, original-state
restoration, test commands/results and final cumulative spend. No production or
physical-brew claim is implied.

## Local integration checkpoints

- `c26cd2e`: actual injected `handleRecipePreview` + command-service Kalita and
  selected Kasuya V60 journeys pass: dose scaling, immutable trial, promotion,
  Undo, canonical no-write preparation, and unrelated Aiden preservation.
- `c6d2ea3`: recipe-page handoff and owner-scoped draft/prepared-action recovery;
  focused draft/card/U6 checks pass (12 tests).
- U4/U5 integrated in `213856e`, with canonical Apply identity/request-language
  correction `efd0b03`. Independent C9 checks use real production evidence
  envelopes and distinguish missing cards from premature cards.
- Combined deterministic matrix: **169 passed, 0 failed**. Changed production
  JS/JSX ESLint passed. Browser build passed (existing dynamic-import and stale
  Browserslist warnings). Locked dependencies installed locally for native SPM.
- Reproducible production-component visual verifier added in `d6eede2`:
  `node scripts/verify-ruphus-recipe-first-ui.mjs`. Mobile and desktop, reduced
  motion, 13→20 g at 1:15 = 300 g, close/reopen, one explicit Start, zero Save
  callbacks and zero network writes. Root inspected compact-card/footer images.
- Dev preview **READY**: `https://twomanybeans-ruphus-lex1qthaw-tmanman90s-projects.vercel.app`,
  deployment `dpl_BZx3dZ4ve51R5iPPbWmNLWuasD3N`, project
  `prj_puSGDxI5uv7x98v0NRLz0Yk8KNus`, target null (not production).
  Source HEAD: `d6eede232a914445b97d3ff3f7d3bd126e04abbc` (deployment metadata
  explicitly contains the short form `d6eede2`).
- Native web assets built with verified isolated Firebase client configuration
  and that preview URL. Copied config reports Dev bundle/display name, channel
  dev and autoUpdate false; bundled Ask Professor Ruphus and View recipe labels
  present. Native `xcodebuildmcp simulator build-and-run` succeeded on
  `7EC6BF90-33B7-4B1A-A651-464B4AC9AA9E`, iPhone 17 Pro / iOS 26.4,
  Debug / signing disabled, installed `com.talmeltzer.coffeehub.dev`, PID 97396.
  CUA observed the new app launch directly into signed-in Rotation with the
  existing Jar 1 inventory and Ask Ruphus entry. This is launch evidence, not
  completion of the native recipe journeys.
- Shared simulator lease acquired after nutrition-widget task released it.
  CUA observed the existing Dev owner signed in with inventory; the operator
  captured 48 original recipe hashes through read-only isolated Firebase APIs.
  No new paid dispatch has occurred for this plan.
- Simulator was voluntarily released at the pre-journey safe checkpoint for
  the owner's GETUP release tests. Native recipe journeys resume after that
  task releases it; no phone dependency was introduced.
- After the shared lease returned, the first actual native Kalita turn on
  `d6eede2` failed with `tool_round_limit` after `read_coffee_evidence` and
  `read_recipe`. The exact prompt supplied the hot Kalita 155, Jar 1, and
  thin/sweet/clean/not-sour symptom in one sentence. No recipe mutation occurred.
  Reported provider cost was $0.001442; authoritative cumulative spend became
  $47.995704 with $0 reserved. This is a failed native gate, not Product PASS.
- Existing Safari Web Inspector attached to the simulator's Debug WKWebView;
  read-only DOM metadata confirmed `capacitor:`, Agent enabled `true`, and chat
  hydration `hydrated`. No authentication was injected or inspected.

## Native acceptance continuation

- `cca0fb6` corrected production-shaped manual-recipe slot recognition and
  readiness for a complete thin/sweet/clean symptom. The same native prompt
  then produced the correct Jar 1 hot Kalita proposal and compact card. This
  live call cost $0.001460; cumulative spend is $47.997164, reserved $0.
- On native `cca0fb6`, View recipe opened the recipe page without starting a
  timer. Changing 13 g to 20 g preserved the proposed 1:15.5 ratio and scaled
  water to 310 g. Close/reopen and a full app stop/launch retained the 20 g
  draft, transcript, card, login and inventory. Actual touch dragging scrolled
  the native recipe to separate Start brew and Save recipe controls.
- Read-only comparison after those interactions confirmed all 48 original
  recipe hashes unchanged. Owner brew-attempt count remained 10.
- Native Start brew after relaunch failed with the visible DOM alert
  `proposal is not bound to this coffee, slot, or session`. The alert was
  above the scrolled action area, so the button appeared to reset silently.
  Both binding recovery and action-local error visibility are open engineering
  blockers. A one-shot response-loss probe did not fire because no brew command
  was reached; it was removed. No response-loss acceptance is claimed.
- `477557d` fixes grams-first deterministic handoff copy to lead with ratio.
  Its Dev preview is READY at
  `https://twomanybeans-ruphus-gl08n6usi-tmanman90s-projects.vercel.app`, with
  exact source metadata `477557dfe5595fa2c0321263d901eba7d06c5388`. It is not
  yet the installed native build. U2/technique focused tests: 43/43 pass.
- `9a33ca4` emits trusted proposal session identity, restores legacy cards from
  exact owner-scoped proposal records even without a current session context,
  and prepares previews with their original binding. Strict wrong-session
  rejection remains. Preview errors now appear immediately above Start/Save;
  the 390×844 rendered test verifies the alert remains in the viewport after
  failure without post-error scrolling. Root checks: 41 focused tests passed,
  recipe-first rendered verifier passed, targeted ESLint and diff check passed.
  Native continuation on this fix remains pending.
- Native `9a33ca4` / preview
  `https://twomanybeans-ruphus-h8etmabp0-tmanman90s-projects.vercel.app`
  (`dpl_5AtMif3kMyFz75wrD33k6pjXmgur`, READY, non-production) recovered the
  existing sessionless legacy card and retained 20 g / 310 g at 1:15.5.
  XcodeBuildMCP build/install/launch succeeded; Dev bundle, display name,
  isolated Firebase, exact preview, dev channel and autoUpdate false verified.
- A one-shot inspector probe discarded exactly one successful brew_once
  response. Attempt count changed from 10 to 11, the visible action-local
  alert reported no confirmed start, and no timer opened. After full relaunch,
  the 20 g draft remained; double-tapping Start recovered the same attempt
  (count still 11) and opened the Kalita timer with the reviewed 60 g bloom
  and 4:45 drawdown. The test timer was stopped, not completed as a physical
  brew. The probe was automatically removed and then cleared by relaunch.
- Return to Chat retained Brew once ready / Make this my recipe; another full
  relaunch retained that receipt and login. Explicit promotion changed exactly
  one canonical slot to hot Kalita 20 g / 310 g / 1:15.5. Aiden was unchanged.
  Opening the older proposal and pressing Start rejected stale source; attempt
  count stayed 11. Undo restored all 48 original recipe hashes.
- Stale rejection currently exposes technical copy and leaves retry controls
  enabled. A bounded action-state UX correction is underway; no silent rebase
  or stale mutation occurred. Simulator touch automation intermittently failed
  to deliver move events, so existing Safari inspector DOM scrolling positioned
  some controls. Button presses and all recipe execution were native UI actions.
- `c04cf3b` replaces stale technical errors with an explicit explanation, blocks
  Start/Save and offers Back to chat without promising a silently refreshed
  recipe. Production-component rendered stale checks, targeted ESLint and
  diff check passed. Native verification remains pending.
- The first native V60 technique request on `9a33ca4` read recipe and technique
  options, then failed `invalid_proposal` before presenting a card. Paid cost
  $0.001706; cumulative $47.998870, reserved $0. Read-only inspection confirms
  the actual active V60 revision retains `method: pour-over`, which fails the
  proposal snapshot validator even though the legacy projection normalizes to
  V60. The generated source-lineage metadata also contains an undefined optional
  field rejected by Firestore serialization. These are open engineering fixes;
  no blind live retry has been dispatched.
- `3960bc0` fixes legacy-revision proposal normalization without changing stored
  source identity and omits undefined optional lineage fields. Actual Firestore
  serializer and legacy active-revision persistence regressions passed. Native
  build/install succeeded against READY Dev preview
  `https://twomanybeans-ruphus-piec3erch-tmanman90s-projects.vercel.app`
  (`dpl_Bw38ZaNZjZWM2H99SUg7V9v19aMi`). All expected Dev asset identities checked.
- Native V60 retry on `3960bc0` produced the different Kasuya coarse-pulse family
  in a separate compact recipe card. Recipe page showed published Kasuya/Hario
  source, 20 g / 300 g / 1:15; changing to 21 g produced 315 g and 53 g first
  pour, preserving the family. Start persisted that exact 21 g / 315 g snapshot
  and increased attempt count once (11 to 12), without changing saved recipes.
  The displayed timer incorrectly rescaled back to the bean's 20 g preference;
  this remains a native blocker until the attempt-authoritative timer fix is
  installed and checked. No physical brew was recorded.
- Native V60 trial promotion saved exactly the selected V60 slot at 21 g /
  315 g / 1:15 / kasuya-coarse-pulses. Aiden remained unchanged. Opening the old
  proposal and pressing Start displayed the new stale explanation and Back to
  chat action; read-only rendered DOM confirmed both Start and Save disabled,
  and attempt count stayed 12. Native Undo restored all 48 original hashes.
  Provider cost for this V60 turn: $0.001442; cumulative $48.000312, reserved $0.

## Final integration continuation

- `868a3b6` makes immutable attempt snapshots authoritative for timer quantities
  and local dose state. Four focused timer/U6 regressions passed; the integrated
  recipe-first matrix passed 104/104 and both rendered harnesses passed.
- Native V60 on `868a3b6` selected the different Hoffmann one-cup family.
  Preview changed 20 g / 333 g to 21 g / 350 g and a 70 g bloom. Explicit
  Start created exactly one attempt (12→13) whose canonical snapshot was
  21 g / 350 g / 70 g bloom. The actual native timer displayed that 70 g bloom;
  Stop returned to the same 21 g / 350 g recipe. No physical completion was
  recorded. All 48 original saved recipe hashes remained unchanged.
- The Mac locked during acceptance. The existing authenticated simulator was
  mirrored through scoped serve-sim; actual native software-keyboard taps and
  touches continued without the phone, another sign-in, or authentication
  injection. Native semantic AX remains unavailable under this Xcode beta.
- One native Kalita wording probe on `868a3b6` exposed an ordinal/negation
  boundary: `jar one ... not sour with the hot kalita` lost explicit method
  binding and returned grams-only prose without a card. This failed call cost
  $0.003140. `d7a3e3d` recognizes spoken jar ordinals and restricts method
  negation to method grammar. Root reran 54/54 reference/method/runtime tests
  and targeted ESLint; all passed. Native confirmation remains pending.
- The successful V60 timer probe cost $0.001765. Current cumulative ledger:
  $48.005217 spent, $0 reserved, $6.994783 remaining under the existing $55 cap.
- Final corrective Dev preview READY for `d7a3e3d`:
  `https://twomanybeans-ruphus-lv08rhpgv-tmanman90s-projects.vercel.app`,
  deployment `dpl_1ceUKeXWMj6JvuuvgGoUA3c8zrkF`, target null. Client preflight
  verified exact commit/preview and isolated Firebase before building Dev
  assets. Native installation is underway. No Capgo or production changes.
- Native `d7a3e3d` build/install/launch passed, PID 59217; final app assets
  verified Dev bundle/display name, isolated Firebase, exact `lv08rhpgv`
  preview, dev channel, autoUpdate false and both Ask/View recipe labels.
  Existing inventory/login and V60 trial receipt survived. Promotion saved
  exactly V60 21 g / 350 g / Hoffmann-small-pulses; Undo restored all 48 hashes.
- The exact natural Kalita wording now produced same-turn ratio-first advice
  (`1:15.5 instead of 1:16.5`) and a separate compact Kalita card. View recipe
  opened 13 g / 202 g; seven dose taps yielded 20 g / 310 g at the same ratio.
  Close caused no saved-recipe or attempt writes; full stop/launch retained
  login, transcript/card and the 20 g draft. Explicit repeated Start taps
  created one attempt (13→14), with canonical 20 g / 310 g / 60 g bloom.
  Native timer displayed the same 60 g bloom and 4:45 drawdown.
- The test timer was stopped without physical completion. Return retained the
  trial; explicit promotion changed exactly Kalita 20 g / 310 g / 1:15.5.
  Opening the original card and pressing Start displayed the stale explanation
  with Back to chat, without increasing attempts. Native Undo restored all 48
  hashes and Aiden remained unchanged. Provider cost $0.001393; cumulative
  $48.006610, reserved $0 before the separately reserved final response-loss run.
- Final native screenshots are retained in the thread-owned visualization
  directory: `recipe-first-native-kalita-card.jpg` and
  `recipe-first-native-kalita-timer.jpg`. The mirror's native WebKit target
  became available after explicitly opening its DevTools pane; this permits
  the final-build one-shot response-loss probe without Mac unlock/auth changes.

## Final-build response-loss journey

- On `d7a3e3d`, a fresh native request for a different hot V60 technique
  produced the Hoffmann large-batch experiment, distinct from the saved
  technique. Its native preview changed 20 g / 333 g to 21 g / 350 g with
  a 42 g bloom, without starting or saving.
- A temporary native WebKit console probe discarded exactly one successful
  `brew_once` response after the real server command completed. The probe
  neither accessed nor changed authentication and restored the original fetch
  immediately. Native UI showed a local failure, not a false timer or save.
  Canonical readback showed one new attempt (14→15), at 21 g / 350 g / 42 g.
- Full app stop/launch removed the temporary probe. The signed-in account,
  transcript, proposal and 21 g draft survived. Repeated Start taps recovered
  that same attempt (count stayed 15); the native timer displayed 42 g.
- Stopping the test timer did not record physical completion. The retained
  receipt promoted exactly the V60 21 g / 350 g Hoffmann-large-batch recipe.
  Native Undo restored all 48 original saved recipe hashes; Aiden unchanged.
  The recovered timer screenshot is retained as
  `recipe-first-native-v60-recovered-timer.jpg` in the thread visualization
  directory. No phone, authentication injection, or production write occurred.
- This live turn cost $0.001135. Cumulative paid spend became $48.007745,
  reserved $0; this plan's incremental spend was $0.013483 at this checkpoint.
- The only remaining field mismatch was explanation/caption text retaining
  the generator default and original example dose. `f321b0a` corrects explicit
  family reasoning and preview dose captions without changing recipe quantities,
  timing, eligibility or command behavior. Root focused preview/options/draft
  tests passed (6 Node subtests, including assertion-script suites); targeted
  ESLint and diff checks passed. Closed action journeys are not repeated for
  this copy-only change; its changed fields receive native inspection below.
- The final `f321b0a` build installed successfully with the correct isolated
  preview and native identity. Two caption-verification requests instead
  exposed an exhausted-choice state: New chat replayed archived proposal
  artifacts into technique exclusions. Named and generic V60 requests returned
  no alternative, so neither is counted as a passing caption check. Costs
  $0.001154 and $0.001102; cumulative $48.010001, reserved $0.
- `b4968e9` fixes that exact leak by slicing technique replay at the existing
  session boundary, like normal conversation and trial receipt replay. It does
  not delete historical messages or change current-session exclusion, source
  eligibility, recipes or actions. Root runtime/endpoint/session tests passed
  39/39; targeted ESLint and diff checks passed. Fresh-chat native confirmation
  and the original caption inspection remain the final open checks.
- Final candidate `b4968e9` is READY at
  `https://twomanybeans-ruphus-8qu8ndiav-tmanman90s-projects.vercel.app`,
  deployment `dpl_C7a6m9ap7uSeBhK52Y5U98yKcTpz`, target null. Exact commit and
  Dev project identity were checked before copying assets. XcodeBuildMCP
  build/install/launch succeeded in 15.533 s, PID 48934, no native diagnostics.
  Actual installed assets verified `com.talmeltzer.coffeehub.dev`,
  `2manybeans Dev`, isolated Firebase, exact 8qu8ndiav backend, dev channel,
  autoUpdate false, Ask Professor Ruphus and View recipe labels. Native launch
  retained signed-in Rotation/inventory and the prior conversation history.
- Native New chat on `b4968e9`, followed by the same named Hoffmann request,
  now produced the correct separate review card immediately. View recipe showed
  the selected large-batch explanation (not a default small-dose rationale).
  Changing 20 g to 21 g updated water 333→350 g, bloom 40→42 g, preparation
  dose and published-method caption to "scaled to 21g", retaining the family,
  grind and temperature. No Start or Save was needed for this field check.
  Provider cost $0.001301; final cumulative $48.011302 spent, $0 reserved,
  $6.988698 remaining. This plan added $0.017040 of live-provider testing.

## Closeout

- Final product commit: `b4968e9`; Dev preview and installed native identity
  recorded above. Documentation-only closeout may follow without changing the
  tested product. Feature branch remains isolated and ready for integration;
  no main merge, production release or Capgo channel change is claimed.
- Root independently confirmed implementation, focused integration, rendered
  mobile/desktop and the signed-in native journeys. The verbatim MSW Kernel
  was propagated to Luna execution agents; Astra retained design/orchestration
  and acceptance. No unrelated polish or global test/lint cleanup was admitted.
- All 48 original saved recipe hashes are restored. Test conversation/proposal,
  attempt and Undo receipts remain as truthful Dev history; no physical brew
  or tasting was falsely recorded. Login was never reset or injected.
- Preserved generated Dev plist changes and historical diagnostic ledgers/report
  directories are not included in source commits. Seeded backend results remain
  separate from native owner-account evidence. Phone/production/Fellow and the
  owner's unscripted satisfaction verdict are not claimed.
