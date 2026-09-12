# Finish the recipe request in chat

Status: implemented and verified in the signed-in isolated Dev simulator. Owner subjective verdict remains separate; no phone or production release.

## September 12 morning: authentication-resume regression

The earlier bounded recipe-flow acceptance did not establish overnight session-resume reliability. Tal's first morning question, “Can you suggest a unique v60 recipe for jar 2,” failed before provider dispatch: the preview logged three POST 401s at 14:31 UTC. Native logs show Secure Token `QUOTA_EXCEEDED` and Firebase Auth `auth/quota-exceeded`; monitoring reports over 300 token exchanges around wake. The Dev account was not disabled or revoked, and no billing or quota configuration was changed.

Client repair `6958edd` makes native initial loading and periodic polling use the existing single-flight refetch path. Previously the poll checked the in-flight ref but never claimed it, permitting suspended requests to accumulate. Token failures now stop the request instead of becoming anonymous requests; rejected credentials are not retried with identical headers; Chat surfaces the authentication-specific cause rather than claiming an AI connection failure. No sign-out, credential replacement, authentication bypass, or provider/prompt modification.

Evidence and limits:

- Executable production-hook test: initial load plus 360 stalled polling ticks produces only one beans/tastings fetch pair; later refresh still works and hidden ticks do not fetch. Auth tests cover quota failure with zero HTTP dispatch, same-user subsequent recovery, one-call 401/403/400, and retained transient 503 retries: 3/3 tests. This is a simulated backlog, not an actual second overnight wake cycle.
- Stream parser checks and 4 protocol tests passed. Targeted source/test ESLint, mobile/desktop rendered harness, failed-turn retry/restore harness, Dev asset build, native build/install/launch, and diff-check passed. No newly manufactured live token expiration or destructive login reset was used.
- Installed client SHA-256 `af658b7b18e91836497f81ab41e6b6609ff7ec15dc5fe51c0951e3f9fa97f491`; source and installed assets match. Bundle `com.talmeltzer.coffeehub.dev`, display `2manybeans Dev`, isolated Firebase, updater disabled, and dev channel verified. Backend remains the unchanged verified `qeas4wfu3` preview above; no Vercel/Capgo/production deployment in this repair.
- Real signed-in native replay at 15:19 UTC: the exact Jar 2 question succeeded with a named Tetsu Kasuya 4:6 recommendation. One provider request, no failure code, cost $0.002915; cumulative $48.171978 of $55, reservation settled. Screenshot: `/var/folders/xx/hyp761n50hq2mw2ndtfrgs8c0000gn/T/screenshot_optimized_14f8239d-409d-4496-9a85-bc90e0fd2ea0.jpg`. This proves the authenticated conversational response, not a new full recipe-card/action journey.
- Login preserved; read-only recipe comparison remains 57→57, restored=true, changedSlots=[]. The original failed morning bubble was not present after rehydration; its survival across the real failed-auth/relaunch boundary is not claimed by the local retry harness. The replay was entered again explicitly in the retained conversation.
- Simulator automation itself required running the installed XcodeBuildMCP CLI through ARM64 Node on an isolated socket: its Homebrew launcher embeds an Intel Node runtime, which caused CoreSimulator architecture failures. No global Xcode selection, tool installation, or phone change. Temporary keyboard capture is released after testing.

Do not extrapolate this repair into an all-conversations or overnight-resume completion claim. The exact failure is diagnosed and the ordinary request now succeeds; real overnight-resume and failed-auth transcript reconciliation remain distinct coverage gaps.

## Acceptance record

Candidate `8053a6d` is deployed only to the isolated Dev preview `https://twomanybeans-ruphus-ibzgs7chy-tmanman90s-projects.vercel.app` and installed over the existing signed-in Dev simulator app. Built and installed web assets match SHA-256 `38325083373b8384793914f4837f6552495adf82c63e11b4bd9f7cd78ef92589`; Dev bundle/name, isolated Firebase, preview URL, dev channel, and updater disabled were checked. No phone, production, or Capgo upload.

- Local: 11 new conversation tests, 93 integrated conversation/UI tests, 44 independent source-state/action tests passed; rendered source-card/preview harness and build passed. Worker separately reports 56 persistence tests. Counts overlap and are not summed.
- Live native: repeated the exact “Actually I mean the 185” in the retained conversation that previously refused. Received an Onyx Monarch Wave 185 card, with the real saved Kalita 155 identified as unchanged until Save.
- Preview: opened full 185 source schedule without timer. Changed 25 g/400 g to 26 g/416 g; all six water targets scaled. Explicit Start brew opened the same source guide at 26 g/416 g, ready for first pour. No real brew or tasting recorded. Read-only comparison confirmed all 57 saved recipe hashes unchanged at this point.
- Returned via Rotation to Chat: trial receipt persisted. “Save that trial” recovered the 185 trial with 416 g and 1:16; explicit Make this my recipe saved Kalita 185 at 26 g. Read-only Dev inventory confirmed the intended slot only. Undo still pending when another GETUP task took the simulator foreground; paused UI to coordinate ownership rather than operating on the other app.
- Paid native requests so far: $0.001913 + $0.001692; cumulative settled $48.151621 of $55. No outstanding reservation.

The other task stopped; Coffee acquired the shared cross-project lease with its long-lived operator PID. Save receipt survived backgrounding. Native Undo restored all 57 raw recipe hashes exactly, including Jar 1 Kalita 155 at 13 g.

Further native results on `8053a6d`:

- “Show me another one” after Undo produced Onyx Ecuador La Soledad Sidra Wave 185. It stayed on the requested 185 even though the saved recipe had correctly returned to 155.
- New chat, “Make a v60 02 recipe for jar two”: James Hoffmann One Cup V60 draft for Dehong Yuan Yi Yuan, whose V60 slot was truly empty. Preview adjusted 15 g/250 g to 20 g/333 g, retained the ratio and scaled pours. Explicit Start timer then Stop did not save or log a real brew. Chat recovered the trial; explicit Save added only that V60 slot (57→58 recipes); Undo restored true absence and all 57 original hashes exactly.
- The empty-slot receipt wording incorrectly implied an existing recipe. `96b8c83` distinguishes “nothing saved” and “new recipe removed” from replacement/restore; rendered regressions pass.
- “Make a switch recipe for jar one” correctly asked 02/03. Answering “03” failed on `8053a6d`. Read-only reconstruction proved supported source options were available; live telemetry showed only resolve_coffee/read_coffee_evidence, no source read, then a method-contradiction regeneration. `96b8c83` binds the immediate equipment answer and loads its options before model dispatch, preserving the original user turn and paired tool protocol. Native-shaped regression and 88 focused tests pass; unsupported 02 remains reference-only. This failure is not counted as accepted.
- Latest cumulative settled cost is $48.160283 of $55; no outstanding reservation. All 57 saved recipes restored. Simulator lease was voluntarily handed to GETUP during source work and reacquired after its bounded gate.

At that checkpoint, the remaining work was to install `96b8c83`, repeat the real Switch clarification, verify its full source preview, compare saved data and release the lease. That checkpoint was not a native completion claim.

The `96b8c83` native repeat exposed the client/server persistence race: ChatTab persists the current user message before request dispatch, so the latest stored message can already be “03,” not the assistant question. `c6876d0` recognizes an identical trailing current turn before interpreting the immediately preceding equipment question. The native-shaped test now includes this persisted answer. Read-only reconstruction using the actual stored transcript binds Jar 1 / Switch 03 and returns the two executable Switch03 source options; no provider or data writes in that probe. All 88 focused tests pass after the correction. The failed live turn cost $0.001119 (preceding clarification $0.001007); cumulative $48.162409, settled. No success claimed for that failed repeat.

## Final native acceptance — September 12

`1610ec4` carries equipment named before “Which size?” rather than requiring it inside that same question clause. A simulator input race then submitted only `0` instead of the intended `03`; the assistant asked a follow-up confirmation and the corrected answer fell back to classic V60 options. That failed interaction is retained, not counted as success. `5d7e13a` also accepts immediate size-confirmation questions (not only “which/what” wording), while keeping the constrained numeric-answer and equipment-context checks. Before the final repeat, the complete composed message was visually verified before each Send.

Final source candidate: `5d7e13a66735fc23306314e2fcfc11b9bfa09206`. Dev-only preview: `https://twomanybeans-ruphus-qeas4wfu3-tmanman90s-projects.vercel.app`, deployment `dpl_9qw6kbNyfhFdkNPhFVUUHdfAwutB`, READY / preview, not production. Built and installed JavaScript SHA-256 both `9faf3891a30a6651d8c7069ecfaa6c816d4a564caf55607c35fb115993e737b2`. Verified bundle `com.talmeltzer.coffeehub.dev`, display name `2manybeans Dev`, isolated Firebase `twomanybeans-ruphus-dev`, exact preview backend, Ask label, updater disabled and dev channel. Installed over the existing signed-in simulator app; no uninstall or login reset.

- Final native conversation: “Make a switch recipe for jar one” → one 02/03 question → “03” → **HARIO Switch 03 Matt Winton bloom hybrid** card for Columbia Risaralda Milan. No additional approval question, classic-V60 substitution, missing-base refusal, or navigation instructions.
- View recipe opened the complete 24 g / 360 mL / 93°C source preview, including preparation and five explicit valve/pour/drain stages. Only pressing Start brew opened its source guide, still at 0:00 and “Ready when you are,” with the correct 50 g / valve-open first stage. Closed without starting a pour, finishing a brew, or recording a tasting.
- Earlier native saved155→185 and emptyV60→trial→laterSave→Undo journeys remain the independent mutation proof above; the latest fixes concern equipment-answer interpretation only. Final read-only comparison after the Switch journey: **57 original recipes, 57 current recipes, restored=true, changedSlots=[]**.
- Final deterministic command: `node --test scripts/ruphus-create-recipe-chat.test.mjs scripts/ruphus-provider-contract.test.mjs scripts/ruphus-context.test.mjs scripts/ruphus-method-resolution.test.mjs scripts/ruphus-agent-endpoint.test.mjs scripts/ruphus-runtime-contracts.test.mjs scripts/ruphus-conversation-contract.test.mjs` → **88/88**. Source and focused test ESLint passed; build passed with existing warnings; diff-check passed. Prior rendered mobile/desktop/320px-large-text and reduced-motion harness remains applicable to unchanged UI code. These deterministic/rendered results are not substituted for the live journeys.
- Native screenshot evidence: `/var/folders/xx/hyp761n50hq2mw2ndtfrgs8c0000gn/T/screenshot_optimized_154589d0-d203-4399-b66d-48919de453c7.jpg` (Switch card); `/var/folders/xx/hyp761n50hq2mw2ndtfrgs8c0000gn/T/screenshot_optimized_ad37a631-879d-4c11-a49c-c8d4b762e495.jpg` (explicit source-guide handoff). Screenshots are temporary local evidence, not repository assets.
- Paid testing settled at **$48.169063 of $55**, with no outstanding reservation. This follow-up used **$0.021047** of live-provider calls, including failed cases. No phone, production, Capgo, real brewing, or hardware-success claim. Login, saved data, unrelated iOS plist edits, and diagnostic ledgers/reports are preserved.

The bounded engineering goal is complete. Unsupported hardware/source configurations remain explicitly unsupported rather than receiving invented executable schedules; an owner verdict on overall conversational quality is not represented as having passed.

Authority: Tal's September 11 follow-up rejects the Kalita 155 → 185 navigation/refusal as the agent experience. This supersedes the September 10 plan's missing-base restriction for already-supported, source-backed hot manual configurations. It does not authorize new hardware, production changes, invented schedules, or automatic saving.

## Outcome

“Actually I mean the 185” continues the current recipe request with a named 185 draft and View recipe card. It does not require a saved 185 recipe. The existing 155 remains the real before-state. A truly empty slot has no before recipe, not a fabricated baseline. New equipment and saved recipe lineage are separate concepts.

## Required journeys

- Saved 155 → requested 185 → source recipe card → another 185 alternative, without reverting to 155.
- Empty hot Kalita or V60 slot → exact supported source draft → preview and dose review → Try without saving → later Save → Undo restores absence.
- Classic V60 → explicitly requested Switch 03 → Switch source draft. A genuinely missing Switch size earns one short clarification; its answer continues the request. Unsupported Switch 02 remains reference-only under existing scope.
- Recipe preview opens before any timer; card, dose, attempt, later save and receipt identify the same canonical recipe.
- Existing saved state changes between read/preview/action: reject the stale action, preserve newer data. Missing, malformed and unavailable are different states. Owner boundaries and idempotency remain enforced.
- Information-only equipment questions do not create unsolicited cards. Unsupported sources remain useful discussion, not fictional timer-ready recipes.

## Implementation and proof

Reuse existing source catalogs, proposal/attempt collections, preview UI and command service. Extend lineage with explicit absent-state identity rather than initializing a fake recipe. Keep exact configuration visible and replacement consequences explicit in the card.

Root owns tools, conversation, UI and integrated acceptance. Bounded Luna max worker owns source-state repository/command changes and deterministic transaction tests. Preserve unrelated iOS plist and all diagnostic ledgers/reports.

Run focused deterministic source/runtime/transaction tests, rendered preview/action tests, then bounded real-provider and signed-in Dev simulator journeys. Preserve account/login; restore test changes through supported Undo. No phone use or production mutation. Cumulative testing cap remains $55; reread authoritative ledger before spending. Seeded/backend, mocked/rendered and native/live evidence are reported separately. No new claim that a refusal or navigation handoff completes an executable supported request.
