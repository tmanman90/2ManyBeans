# Independent consumer acceptance — observed results

Status: bounded engineering acceptance complete on source `b52abb2`; owner subjective verdict pending. No production-readiness, phone delivery or universal answer-quality claim. Intermediate failures below are deliberately preserved, followed by their actual reruns.

Root operates the existing signed-in Dev simulator. A separate Sol consumer agent,
without implementation or fixture access, chooses ordinary next turns from actual
responses. Luna handles bounded implementation. Simulated consumers supplement,
not replace, real human judgment. Screens and saved state are independently reviewed
by root. No phone or production interaction; preserve login and undo test mutations.

## Starting identity and preservation

- HEAD 75e7e7e; preview `dpl_GixaGh5yscZvGiBMRaSJZZdA14jF`, non-production READY.
- Backend https://twomanybeans-ruphus-ki9i72ue5-tmanman90s-projects.vercel.app
- Exact simulator 7EC6BF90-33B7-4B1A-A651-464B4AC9AA9E; bundle com.talmeltzer.coffeehub.dev, display 2manybeans Dev, isolated Firebase twomanybeans-ruphus-dev, dev channel, autoUpdate false.
- Installed/built JS hash 8dbfcc6cacc0a5dd8452d7262c13e4e92f5e3d09d01fab10692dfc475b6cfcaf.
- Fresh read-only baseline: 57 canonical recipe projections. No mutation yet.
- Starting cumulative provider spend $48.208051 / $55, no outstanding reservation.

## Consumer A: novice

Fresh New chat with previous conversation visibly collapsed, not deleted.
Punctuation was omitted when entering via native software keyboard; wording was
otherwise chosen independently by the consumer actor.

1. User: “My coffee came out pretty weak this morning can you help me make the next cup stronger”
   Reply: “Which brewer made this morning’s cup: hot Kalita, hot V60, or iced V60?”
   No card. Reasonable to establish brewer; root notes coffee was not yet established.
2. User: “Hot v60 with jar one I was making one mug”
   Reply: “Got it—hot V60, one mug. Was it thin but sweet/clean, or sour, sharp, or muted?”
   No card. Sensory clarification is relevant, but the consumer agent notes friction:
   next response must now deliver a concrete adjustment and usable card.
3. User: “Mostly thin and watery not really sour I could taste the coffee it just did not have much body”
   Reply recommends 1:15 rather than 1:16.4, 20 g/300 g, and supplies the correct
   Columbia V60 named card in the same response. Actor asks to scale for two mugs.
   **Failed native preview acceptance:** legacy grind 5.9 is not an Ode Gen 2 click;
   dose control stops at 24 g despite its 30 g bound, with a technical profile error
   below the instructions. No saved recipe was changed. Shared preview repairs
   and nearby dose feedback are in progress; a useful reply does not close this gate.

## Consumer B: enthusiast (cc65aeb preview)

Installed/built Dev assets match backend preview
https://twomanybeans-ruphus-8zok93zs8-tmanman90s-projects.vercel.app
(`dpl_4L5jJ4FXdPe6PSBwNevBQe8MC3FE`, READY/non-production, source cc65aeb).
Installed JS hash debd677cde8c40bc1a1a269732099353099b6e27e99ada42ada8f93f8a9e4d4a.
Login and prior chat survived reinstall without erase.

1. Fresh chat: “I feel like trying something adventurous with jar two on my switch 03 what would you brew”
   Reply recommends HARIO Switch 03 Matt Winton bloom hybrid, briefly explains
   open-valve bloom → closed immersion → release, and supplies the correctly bound
   Dehong Yuan Yi Yuan / Switch 03 card in the same response (24 g / 360 mL).
   Independent actor rates this useful and on-target. View recipe opens the named
   source guide, not the timer. No save occurred. Next actor turn switches coffee
   and equipment naturally; outcome pending.
2. “That sounds fun but I have actually got jar three and my v60 out now can you adapt it for those”
   Correct Rwanda / regular V60 / Tetsu Kasuya 4:6 card, but **rationale failure**:
   silently substitutes a different technique. Root and independent actor both
   flagged this; function-only proposal output had no explanatory text channel.
   A nullable explanation on the existing tool is being checked through the same
   response-safety boundary, without another provider round.
3. “Interesting why did you switch to Kasuya instead of adapting the Matt Winton recipe”
   Native autocorrect changed names to “kaduna” / “wonton”; the agent nevertheless
   understood and explained that Switch-specific valve stages cannot be directly
   used on a regular V60, acknowledged the substitution, and offered alternatives.
   Correct information-only reply: no new card or save.
4. “Okay let us try Hearts continuous pour recipe with jar three set that one up for my next brew”
   Correct Rwanda / Heart Continuous Pour card in the same response, distinct
   from Kasuya. View recipe: 22 g / 360 g, physical Ode 6, 95°C, named technique,
   preparation and full timed schedule. Dose changed to 20 g / 327 g with 45 g
   bloom and 327 g final pour; source timing remains explicit.
   Start brew opened the timer with that exact scaled schedule. Paused the test
   timer, without finishing a brew or recording a tasting. Fresh canonical
   readback still matches all 57 original recipes. Relaunch/save/Undo pending.
5. App stopped and relaunched through XcodeBuildMCP, same signed-in Dev bundle.
   The exact 20 g / 327 g trial recipe returned. Chat retained the trial receipt.
   Actor: “I want to keep this exact twenty gram version save it to my recipes”.
   Reply recovered the trial card and requested the native “Make this my recipe”
   confirmation; review showed 20 g, Heart Continuous Pour, matching timed pours.
   After pressing that control: Recipe updated + Undo. Read-only Dev state showed
   only the intended v60_hot slot changed (57 → 58 projections); Jar 3 readback
   was 20 g / 327 g / Ode 6 / gentle-main-pour. Pressed Undo. Readback restored
   **all 57 original canonical recipe projections exactly**, no changed slots.
   No tasting was logged. This is fresh native action/persistence evidence on
   cc65aeb, not a production claim.

Settled cumulative provider testing after these seven native requests: $48.219962
of $55 (this reopened run: $0.011911). No pending reservation at this checkpoint.
After trial-recovery chat: cumulative $48.221628; eight requests in this run,
$0.013577 total. Save and Undo are app commands, not paid model turns.

## Shared defect found by independent execution audit

Ordinary diagnostic preview eligibility depended on lexical agreement/readiness;
punctuation could make a resolved sour-cup question card-ineligible. Read/propose
permissions were conflated with mutation consent. A typed preview after exact
owner-bound recipe read is being verified; source, physical grinder, stale-state,
sensory ambiguity and native Save authority remain separate.

No five-gate completion verdict yet. No native mutation/relaunch/recovery result
from this reopened run may be inferred from the historical report.

The preceding sentence records the intermediate checkpoint, not the final verdict below.

## Fresh-language failure on c4d35b6

Verified installed/built assets match READY non-production preview
https://twomanybeans-ruphus-8p27yhoxc-tmanman90s-projects.vercel.app
(`dpl_2SJkGUbDCZdLvfrhDRDZTs9U25a3`, source c4d35b6), JS hash
615eaef56bf8118f032683c6997b0973e5f38a857c94f16738faed4afa317d06.
Local real-owner recipe projection now scales to 30 g / 450 g / 1:15 / Ode 6,
but this is not native conversation acceptance.

Fresh independent actor wording: “My jar one v60 tasted thin but otherwise clean
last time can you give me a better thirty gram recipe for two mugs”. Native
response failed, with misleading connection copy. Redacted server telemetry
reported tool_round_limit after evidence + technique reads and a proposal.
The message and retry control remain in the native transcript for a real
relaunch-and-retry test. **Gate remains failed**, despite 65 focused tests and
the rendered recipe-preview harness passing. Cumulative settled spend
$48.224056 / $55; nine native AI requests this run, $0.016005 total.

Additional observed lifecycle defect: explicitly closing the restored trial
recipe did not durably dismiss automatic reopening on subsequent relaunch.
The canonical recipe data remains restored (57/57). Shared dismissal and bounded
proposal recovery fixes are undergoing validation; neither is counted passed
from source tests alone.

## Native recovery and novice rerun — cf33e4c

Installed source cf33e4c with exact READY Dev preview
https://twomanybeans-ruphus-cok1bi2kh-tmanman90s-projects.vercel.app
(`dpl_2YSdWcUsKxGAAK5YnscWER98QxBX`). Built/installed JS hash
4e538b1ea8799b2206432c622e8202f762b0066fa8e646b9ef8a2a1d3511d6dd.

- Explicitly closed the restored trial sheet, stopped and relaunched only the
  Dev app. It returned signed in to Rotation, without auto-opening the trial.
- Returned to Chat: the original failed 30 g request and its retry affordance
  survived. Retried that message, without retyping or changing its wording.
- Successful response explains stronger ratio for a clean-but-thin cup and
  supplies Columbia / V60 / Tetsu Kasuya 4:6 / 1:15 card in the same response.
  View opens recipe, not timer: 30 g / 450 g, Ode 7.2 (physical click), 92°C,
  preparation, pours 75 g at 0:00, 180 g at 0:45, 270 g at 1:30, 360 g at
  2:10, 450 g at 2:40; drawdown 3:20–4:20. Start and Save are separate.
- Native stepper changed 30 → 24 g / 360 g → 30 g / 450 g. No silent boundary
  failure. Found a smaller display defect: regenerated 24 g loses its named
  technique label while retaining attribution. Fixed separately in b52abb2;
  final native label rerun remains required.
- Independent actor follow-up: “Should I brew the whole batch at once and split
  it or make the mugs separately?” Answer recommends one 30 g batch, explains
  the 450 g schedule is batch-specific, then gently swirl the server and split
  by weight. No redundant card or save. Actor judges the novice task fulfilled;
  root independently inspected the complete native schedule and controls.

Both real-provider requests settled successfully. Cumulative $48.229811 / $55,
eleven native AI requests this run, $0.021760 total. No pending reservation.
Xcode beta AX keyboard injection is unavailable; native edit-menu paste through
the exact simulator pasteboard provides background input without an auth seam.

## Final installed candidate and reruns — b52abb2

- Source `b52abb216971bb8837903364a85c42af191f4d40`.
- Backend https://twomanybeans-ruphus-peh5y4148-tmanman90s-projects.vercel.app
- Deployment `dpl_455Vwm8Fb8JXq1mVUZXJewjrizr7`, READY, non-production.
- Built and installed JS SHA-256 `df4e629ee02f94dc7a2d3374d53ad093712cdf13b08d5132a53557142cf28ee5`.
- Same signed-in Dev simulator, bundle/name/Firebase/channel/updater identities
  checked again. Install was over existing data, never erase/uninstall.
- Native novice preview rerun: 30 g / 450 g → 24 g / 360 g → 30 g / 450 g.
  Tetsu Kasuya 4:6 name now remains visible at every dose; physical Ode 7.2,
  ratio and complete instructions remain coherent. Closing the sheet returns
  to the existing conversation; nothing is saved by viewing or resizing.
- Fresh enthusiast Switch request returns the correct Dehong / Switch 03 /
  Matt Winton bloom hybrid card with a short open-bloom/immersion explanation.
- Independent actor correction, pasted unchanged through native input:
  “That sounds fun but I have actually got jar three and my V60 out now.
  Can you adapt it for those?”
- Actual reply: “Got it—jar three and the V60 are the setup. I’d adapt the
  adventurous idea into Tetsu Kasuya’s 4:6 pulse method: five distinct pours
  make the cup more expressive and variable than a standard single-stream
  brew. Try Tetsu Kasuya 4:6. Source recipe: five centered pulses using the
  4:6 method. Here’s the recipe to review.” Correct Rwanda / V60 named card
  is in that same response. This now identifies the adaptation and explains
  the choice; it does not pretend to retain the Switch technique unchanged.
- Independent consumer reviewer judged the previous silent-substitution defect
  resolved. Explicitly mentioning the missing Switch valve could improve the
  explanation, but is not a blocking failure of this request. Root agrees;
  generic claims about cup expressiveness remain advice, not measured results.
- Root opened the final Rwanda preview: 20 g / 300 g / 1:15, Ode 7.2,
  92°C, named technique, preparation and timed source pours, drawdown guidance,
  separate Start brew / Save recipe controls. No timer or save auto-started.

## Final five-gate verdict and evidence limits

| Gate | Result and evidence |
| --- | --- |
| Novice coaching and scaling | Passed fresh native ordinary-language coaching, sensory clarification, ratio-first card, complete 30 g recipe, 24–30 g scaling, and information-only batch-splitting follow-up. Sol consumer reviewed the actual replies; root inspected full instructions and controls. |
| Techniques and contextual corrections | Passed fresh native Switch → regular V60 and coffee change, named same-turn cards, explained adaptation, another technique (Heart), and equipment-appropriate instructions. Deterministic tests additionally cover unsupported/ambiguous/owner-bound references; these are not claimed as new native runs. |
| Trial → return/relaunch → Save → Undo | Passed fresh native cc65aeb journey with exact 20 g Heart trial recovered, explicit native Save, canonical readback of the one changed slot, and Undo restoring all 57 originals. Later dismissal fix was separately rerun natively on cf33e4c and retained on final installation. Final source action regressions pass; the paid trial journey was not needlessly repeated for the final display-only label patch. |
| Ambiguity, information-only, recovery | Native brewer/sensory clarification and information-only follow-ups passed. A real failed 30 g request survived relaunch and succeeded via its existing Retry control on cf33e4c. Additional ambiguous-reference, stale/idempotent action, cancellation and recovery branches pass targeted automated tests; not every outage was forced natively. |
| Regressions and independent review | Final source targeted runtime/provider/grinder/preview matrix 89/89; reference/method/endpoint/action/session matrix 79/79; rollout/dismissal/source-timer 24/24; auth/dismissal 6/6. Counts overlap and are not summed. Final rendered recipe-first harness passed mobile/desktop, narrow/large-text fallback, reduced motion and focus return with no writes. Native root visual review and independent consumer verdicts passed the bounded journeys. |

Other fresh local evidence: rendered retry-after-relaunch and cancellation
regressions pass; targeted changed-source ESLint and diff checks pass; Vite Dev
build and Xcode simulator build/install/launch pass. Existing unrelated full-suite
lint/test failures were not repaired or represented as a green full repository.
Browser fixture results are explicitly distinct from native real-provider proof.

## Preservation, spend and delivery

- Final read-only comparison: **57 original / 57 current, restored true,
  changedSlots empty**. No tasting or completed physical brew was fabricated.
- Cumulative provider testing settled at **$48.233313 / $55** with no pending
  reservation. This reopened run: **13 actual model requests, $0.025262**.
  This is app-provider testing spend, not Codex weekly usage or total engineering
  compute. Save/Undo and dose edits were native commands, not extra model turns.
- Source fixes are `cc65aeb`, `c4d35b6`, `cf33e4c`, `b52abb2`; the acceptance
  documentation commit may follow without changing the installed source identity.
- Signed-in simulator retained. No phone, production app/backend/Firebase/Capgo,
  authentication backdoor, diagnostic deletion/staging, or unrelated plist edit.
- Personal human verdict and physical-phone/production delivery remain outside
  this completed engineering acceptance. Agent role-play is not real-user study
  evidence, and these passing journeys do not guarantee arbitrary future answers.
