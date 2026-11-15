# Brew timer on the Dynamic Island and Lock Screen

Status: plan only. Nothing built. Written 2026-11-15.

## Recommendation

Build our own small Live Activity: a local Capacitor plugin plus a SwiftUI widget extension, ported from the GETUP workout Live Activity. Do not use the Capgo JSON-layout plugin.

Every clock in it is a date anchor that iOS ticks by itself. The app publishes only on timer transitions (start, step change, pause, resume, skip, finish). It never publishes on ticks.

It ships in three phases. Phase 1 is read-only and needs a new App Store binary. Capgo alone cannot deliver it.

## Why it matters, and the catch

The brew timer holds a wake lock, so the screen stays on while the app is open. iOS hides an app's own Live Activity while that app is in front. So the island and Lock Screen help in two cases:

1. Tal locks the phone or it locks itself mid-brew.
2. Tal leaves the app mid-brew (music, messages, a scale app).

In both cases the WebView's JavaScript is suspended within seconds. The timer hook (`src/hooks/useBrewTimer.js`) advances steps from a 100 ms JS ticker. It cannot push a step change to the Live Activity while suspended. Every design choice below follows from that.

## What competitors show

| App | Live Activity content | Source |
|---|---|---|
| Timer.Coffee (free, open source) | "Follow your brew step-by-step on the Lock Screen and in the Dynamic Island". Mirrors to the Apple Watch Smart Stack on watchOS 11. | [App Store](https://apps.apple.com/us/app/timer-coffee/id6449322787) |
| BaristaTimer | "See the current step, time, and water on your Lock Screen." | [App Store](https://apps.apple.com/za/app/baristatimer-brew-timer-log/id6759971787) |
| FourSix Coffee Timer | Brew progress, then a cooldown countdown after the brew ends. iOS 18+. | [App Store](https://apps.apple.com/us/app/foursix-coffee-timer/id1519905670) |
| Brewprint (TestFlight beta) | Stage-by-stage timer: bloom, pours, drawdown. | [getbrewprint.app](https://getbrewprint.app/) |
| Brew Coach | Cold brew steep countdown. | [App Store](https://apps.apple.com/br/app/brew-coach-coffee-timer/id6776633159?l=en-GB) |
| Fellow, Acaia, Timemore official apps | No evidence of a Live Activity found. Not confirmed on device. | web search |

None of the listings show a target weight plus a next-pour preview plus a ring per stage together. That combination is where Coffee Hub can lead, because our recipes already carry per-step times and water targets for the specific bean.

## What GETUP already proved (reuse it)

From `~/Developer/FORM` (GETUP), PR 199 (2026-11-13), the battery fix (build 537) and its lessons:

- **Anchors, not ticks.** `Text(timerInterval:)` and `ProgressView(timerInterval:)` tick inside the widget with zero app updates. The per-second update loop drained about 40% battery per hour. `LiveActivityUpdatePolicy` fixed it by publishing only on real changes.
- **Minimal view = the Clock app ring.** A circular `ProgressView(timerInterval: start...deadline, countsDown: true)` with the glyph inside. iOS shows minimal whenever a second Live Activity (music) is running, so this view matters more than it looks.
- **Keyline tint follows the phase colour.**
- **Lock Screen height caps at 160 pt.** Their compact-layout fix shares one layout struct and tests it at 280, 320, 360 and 402 pt widths.
- **Lessons to copy as rules:**
  - Never pass `Date.distantFuture` to `Text(timerInterval:)`. It crashed chronod. Guard with a `hasValidCountdown` check and clamp end dates.
  - Use `.activityBackgroundTint`, never `.background`, on the Lock Screen view. `.background` renders invisible.
  - Capture `Activity<T>.activities` before an async stale sweep. Reading it inside the Task ended the new activity.
- **ContentState changes stay additive** (optionals that decode as nil), so an old activity never fails to decode after an update.

The design bank adds one more fact: the in-app island is only a look-alike. The real one requires a Widget Extension, and widgets get no gestures and no custom animation. Interactivity is App Intent buttons only.

## What each presentation shows

Data the timer already has per step (`buildTimerSteps`): start second, duration, the step text, and the water target where the recipe has one. Example below is a 4-pour V60.

| Presentation | During a pour | During a wait or drawdown | Paused | Done |
|---|---|---|---|---|
| Minimal | Accent ring draining to the end of this step, drop glyph inside | Same ring | Pause glyph, no ring | Check glyph |
| Compact leading | Target water: `150g` | Method glyph | Method glyph | Check glyph |
| Compact trailing | Step countdown `0:12`, accent | Step countdown | `Paused` in muted text | Total time `3:28` |
| Expanded | Leading: `Pour 2 of 4`. Trailing: big step countdown. Bottom: `Pour to 150 g`, whole-brew progress bar with step ticks, `1:24 of 3:30`, `Next: Pour 3 to 250 g at 1:30` | Same, with the step text in place of the target | Static times, `Paused` | `Brew done 3:28`, `Tap to rate this cup` |
| Lock Screen | Bean and method header, then the expanded content in the GETUP shared layout | Same | Same, static | Same as expanded done |

Rules for the content:

- Grams always carry the unit, and times are always `M:SS`, so the two never read alike in the compact pill.
- Use the step's water target as cumulative scale weight ("to 150 g"). That is what the scale shows. The recipe engine already writes cumulative targets; confirm per method during the build.
- The activity starts when the 3-2-1 countdown ends (`beginRunning`), not at countdown start.
- `widgetURL` deep-links back to the open timer. The done state deep-links to the tasting flow for that bean, the same bridge `App.jsx` already uses.
- The done state stays for a short time (about 2 minutes), then dismisses. A FourSix-style "ready to taste in 2:00" cooldown countdown is an optional extra.
- The Apple Watch Smart Stack mirror comes free on watchOS 11. Check it, but design nothing for it.

## Staying correct while the app is suspended

The app cannot update the activity at step boundaries while suspended. Three layers handle this:

1. **One step of lookahead (Phase 1).** ContentState carries the current step and the next step. `staleDate` is set to the next step's start. The widget renders the next step when `context.isStale` is true. Most steps run under a minute, so one step covers most short absences. After that, the whole-brew timer and progress bar still tick correctly. Only the step label lags until the app returns.
2. **Step alerts while locked (Phase 2).** Schedule a local notification for each upcoming step boundary at start ("Pour 3: to 250 g"). Cancel and reschedule on pause, skip or rewind. These fire while the app is suspended and give the buzz that today only works in the foreground (the 1.1.249 haptic fix is foreground-only). This needs `@capacitor/local-notifications`, which is a native dependency.
3. **Stay awake for real (later).** Two features would keep the app legitimately running for the whole brew and let it update every boundary on time:
   - The Acaia scale connection (Tal's Bluetooth note) with the `bluetooth-central` background mode.
   - Audible pour cues with an audio background session, as GETUP does.

   Either one makes layer 1 a fallback, not the main path. Neither is in scope here.

Ruled out:
- Server push updates. APNs cannot schedule a send for a set second, and running a per-brew scheduler on Vercel is too much for this.
- One alarm per step with iOS 26 AlarmKit. Alarm alerts are loud and full-screen, too much for every pour. Not verified on device.

## Update strategy

- Publish only on transitions. The checkpoint effect in `useBrewTimer.js` already fires on exactly these (phase or step index change). Hook the Live Activity publish next to it.
- Convert the hook's wall-clock refs to absolute dates once per publish:
  - brew anchor = now minus `readGlobalMs()`
  - step end = now plus the step duration minus `readStepMs()`
- Paused: send static strings and no timer anchors.
- Dedupe in native code, using GETUP's `LiveActivityUpdatePolicy` shape: skip a publish if nothing visible changed and dates moved under 1.5 s.
- End on Stop, Reset, Finish (after the done state) and timer-age expiry (`MAX_BREW_TIMER_AGE_MS`, 6 hours). On app launch, end any orphaned activity whose session is gone from `brewTimerSession.js`.
- No push token, no `NSSupportsLiveActivitiesFrequentUpdates`. Stay well under the 4 KB payload: send step labels, not the full recipe.
- Cover both timers: `BrewTimer` (hand brew and quick recipe) and `ManualSourceBrewTimer`. Fellow Aiden brews are machine-driven and come later.

## Native approach

### Plugin choice

| Option | Gets | Misses | Effort |
|---|---|---|---|
| `@capgo/capacitor-live-activities` v8 ([docs](https://capgo.app/docs/plugins/live-activities/), [repo](https://github.com/Cap-go/capacitor-live-activities)) | Capacitor 8 support, JSON layouts, a timer element, staleDate, dismissal policy, a built-in timer-sequence API | Progress is a 0 to 1 value, not a date range, so rings would not drain by themselves. No App Intent buttons. Its own docs do not say its timer ticks without updates. Still needs a Widget Extension. | Lower to start, capped quality |
| **Own local plugin + SwiftUI extension (recommended)** | Everything above, date-range rings, `isStale` rendering, keyline tint, App Intent buttons later, direct reuse of GETUP Swift | We own about 150 lines of plugin Swift and the widget views | About 1 to 2 days more |

### Pieces

- `BrewActivityAttributes` (static: method, bean name, step count, session ID) and `ContentState` (phase, step index, current and next step labels and targets, brew anchor, step start and end, total end, paused, done). One Swift file in both the app and extension targets.
- `BrewActivityPlugin` (app target): `isSupported()`, `start(state)`, `update(state)`, `end(state, dismissAfterSeconds)`, `endAll()`.
- `BrewActivityWidget` extension: the views in the table above, iOS 16.2+.
- JS wrapper `src/lib/brewLiveActivity.js`: maps the hook's clock snapshot to ContentState. It no-ops on web, and it no-ops when `Capacitor.isPluginAvailable('BrewActivity')` is false.
- `NSSupportsLiveActivities = YES` in the app Info.plist.

### Two release facts

1. **New binary required.** Phase 1 is native code, so it goes out through TestFlight and App Store review. Capgo `ship app` cannot deliver it. The JS wrapper must no-op on older binaries, because Capgo OTA bundles also reach phones still on the old binary.
2. **The iOS project is not in git.** `ios/` is gitignored. The main checkout has only a plist there. `configure-ios-variant.mjs` patches `project.pbxproj` by regex. A widget extension is a new Xcode target, with its own bundle IDs:
   - `com.talmeltzer.coffeehub.BrewActivity`
   - `com.talmeltzer.coffeehub.dev.BrewActivity`

   It must not live only on the Studio's disk.

   **Decision for Tal (recommended: a):**
   - a) Commit `ios/` like a standard Capacitor app, keeping `GoogleService-Info*.plist` and build output ignored.
   - b) Keep `ios/` ignored. Commit the Swift sources under `native/ios/`, plus an idempotent script that adds the extension target with the Ruby `xcodeproj` gem.

   Option a is the root fix. Option b keeps today's habit but adds one more fragile project patch.

## Phases and effort

| Phase | Scope | Effort | Ships via |
|---|---|---|---|
| 0 | Native project in version control (decision above) | 0.5 to 1 day | n/a |
| 1 | Read-only Live Activity: all four presentations, paused and done states, deep links, one-step lookahead, update policy, both timers | 3 to 4 days including simulator and device checks | New binary (TestFlight) |
| 2 | Step-boundary local notifications, cancelled and rescheduled on pause and skip | About 1 day | New binary (new plugin) |
| 3 | Lock Screen and expanded buttons: Pause or Resume, Next step, using `LiveActivityIntent` (iOS 17+) | 2 to 3 days. Device-only proof. | New binary |

Phase 3 is harder here than in GETUP. GETUP's intents call native engines. Ours must change a timer that lives in a suspended WebView. The intent would update the activity natively and write a command that JS reconciles on resume (the timer checkpoint already lives in localStorage). Prototype it on a phone before committing to it.

## How to prove it

- Swift unit tests for the update policy and the state mapping. A JS test for the clock-snapshot to ContentState mapping, added to `npm run test:brew-timing-memory`.
- Snapshot renders of the Lock Screen layout at 280, 320, 360 and 402 pt, as GETUP does.
- Device checklist (the simulator does not show the real island):
  1. Lock mid-pour. The step countdown and ring keep moving. At the boundary, the next step appears.
  2. With music playing, the minimal ring drains.
  3. Pause in the app, then lock. Static times show and nothing ticks.
  4. Finish. The done state appears, and tapping it opens tasting for that bean.
  5. Leave the phone locked past two boundaries. The total time is still right, and the label catches up on unlock.
  6. Battery: a 4-minute brew costs no more than an idle locked phone.

## Not verified

- Nothing here was built, compiled or run. No Xcode build: another Studio thread had the simulator.
- That the widget re-renders with `isStale` at `staleDate` while the app is suspended. This is Apple's documented behaviour, but it was not tested here.
- Competitor details come from App Store listings and websites, not from using the apps. Timer.Coffee's features page returned HTTP 429.
- That Fellow, Acaia and Timemore have no Live Activity. The search found none, which is not proof.
- The Capgo plugin's latest version and whether its timer element ticks without updates.
- That every method's recipe writes cumulative water targets on each step.
