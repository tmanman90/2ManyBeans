# Brew timer on the Dynamic Island and Lock Screen

Status: plan only. Nothing built. Written 2026-11-15. Revised the same day after a second research round (open-source code, competitors, Apple HIG, GETUP history) and mockups.

## Recommendation

Keep going with it. Build our own small Live Activity: a local Capacitor plugin plus a SwiftUI widget extension, ported from the GETUP workout Live Activity. Do not use a JSON-layout plugin (Capgo or others).

Every clock in it is a date anchor that iOS ticks by itself. The app publishes only on timer transitions (start, step change, pause, resume, skip, finish). It never publishes on ticks.

What changed in the revision:

1. **Send the whole step schedule, not one step of lookahead.** Timer.Coffee, the one open-source coffee timer with a shipping Live Activity, puts every step's offset and label in the state. The widget works out the current step from the clock each time iOS renders it. Our recipes are under 10 steps, so this fits easily in the 4 KB limit.
2. **Ship step alerts in the same binary as the Live Activity.** Every serious implementation found that local updates alone do not reliably flip the step label while the app is suspended. Timer.Coffee added a server push fallback for this. A local notification at each step boundary is the dependable cue, and both pieces need a new binary anyway. So old Phases 1 and 2 merge.
3. **The Acaia scale is the real fix for staying live.** A connected scale keeps the app legitimately running in the background (Bluetooth background mode), so it can publish each step on time and the live weight could show too. The schedule and alerts are the fallback when no scale is connected. This needs the `bluetooth-central` background mode, which the scale plan (`2026-11-15-001-feat-acaia-scale-brew-timer-plan.md`) currently lists as out of scope. It should come into scope when both plans are built.
4. **New states found in our own timer:** a "your turn" state for source recipes that wait for a confirmation, and an iced "chill and serve" state. Both are in the mockups.
5. **`ios/` is in git now** (PR 20), so the release blocker in the first version is gone.

## Mockups

Rendered from `docs/plans/mockups/brew-live-activity/mockups.html` (run `node docs/plans/mockups/brew-live-activity/render.mjs`). Sizes are iOS points for a 393 pt wide iPhone. Sample recipe only, no personal data: V60, 15 g to 250 g, four pours, 3:30 total, shown at 1:24.

| File | Shows |
|---|---|
| `mockups/brew-live-activity/01-compact.png` | Pouring (`190g` / `0:21`), drawdown, paused, your turn |
| `mockups/brew-live-activity/02-minimal.png` | Step ring next to a music activity; drawdown, paused, done, your turn |
| `mockups/brew-live-activity/03-expanded.png` | Pour 3 of 4, big countdown, target, segmented brew bar, next step |
| `mockups/brew-live-activity/04-lock-screen.png` | Same content on the Lock Screen, 371 x 150 pt |
| `mockups/brew-live-activity/05-done.png` | Done in compact, expanded and Lock Screen, with "Rate this cup" |
| `mockups/brew-live-activity/06-paused-your-turn-iced.png` | Paused, your turn, iced chill (Lock Screen) |

These are HTML renders with stand-in glyphs for SF Symbols. They are not SwiftUI previews and were not checked on a device.

## Why it matters, and the catch

The brew timer holds a wake lock, so the screen stays on while the app is open. iOS hides an app's own Live Activity while that app is in front. So the island and Lock Screen help in two cases:

1. Tal locks the phone or it locks itself mid-brew.
2. Tal leaves the app mid-brew (music, messages, a scale app).

In both cases the WebView's JavaScript is suspended within seconds. The timer hook (`src/hooks/useBrewTimer.js`) advances steps from a 100 ms JS ticker. It cannot push a step change to the Live Activity while suspended. Every design choice below follows from that.

## What other apps do

### Coffee apps

| App | What its Live Activity shows | Evidence |
|---|---|---|
| Timer.Coffee (open source, Flutter) | Compact: step counter `2/5` left, step countdown right. Minimal: countdown. Expanded and Lock Screen: recipe name, big step countdown, 2-line step text, brown progress bar. Paused swaps timers for a pause glyph. Water only appears inside the step text. Ends with no final state. | Read the Swift source ([repo](https://github.com/antonkarliner/timer-coffee), `ios/TimerCoffeeWidgetExtension/BrewingTimerLiveActivity.swift`) |
| Blooming Grounds 5.1 | Phase colours (bloom, pouring, drawdown) and a target water display. Watch haptics at transitions. | Listing text |
| BrewSmart 2.0 | Pour timer plus a next-pour countdown. Ends "ready to journal". | Listing text |
| BaristaTimer | Current step, time and water on the Lock Screen and island. | Listing text |
| Shizuku, BrewGPT | Live Activity listed, no detail. | Listing text |
| Brew Coach | Cold brew steep countdown, claims 12 to 24 h on the Lock Screen, beyond Apple's 8 h limit. | Listing text |
| FourSix, Brewprint | The first round cited a FourSix listing for a cooldown countdown and the Brewprint site for stages. The second round found no Live Activity evidence for either, and no app under the Brewprint name. Treat both as unconfirmed. | Conflicting |
| Beanconqueror, Filtru, Acaia, Fellow, Timemore, Hario | No Live Activity found (Beanconqueror's repo has no ActivityKit code). | Search, not proof |

No coffee app found shows target weight, a per-step countdown, the next pour and a whole-brew bar together. That is where Coffee Hub can lead, because our recipes already carry per-step times and water targets for the specific bean.

### Best-in-class timers outside coffee

- **Apple Clock:** the minimal view shows live remaining time, not a static icon (HIG). Pause and cancel in the expanded view.
- **Flighty:** the minimal view is a small ring of trip progress. Content changes by phase, and data that no longer matters drops off.
- **Citymapper, Uber:** one layout whose slots change meaning per phase. Uber reworked its ETA so it is not mistaken for the clock.
- **SmartGym, StrongLifts, Wakeout:** show what comes next. SmartGym drops heart rate because the Watch already shows it.
- **AlarmKit timers (iOS 26):** system countdown, paused and alert states, and an alert that breaks through silent mode and Focus.

### Patterns worth copying

1. Compact: one identity cue on the left, one live number on the right, read as one fact.
2. Timer text in a fixed-width frame with monospaced digits, so the island does not jitter. Timer text otherwise takes the width of its longest possible string.
3. Minimal shows live data (a ring or time), never only a logo.
4. Same slots, different meaning per phase: Pour, Wait, Drawdown, Done.
5. Show the next action and the target next to the time.
6. One colour carries the meaning. Keyline tint follows it.
7. Paused swaps live timers for static text and a pause glyph.
8. An explicit end state, then a short dismissal.

## Apple's rules, with numbers

From the HIG Live Activities page and the ActivityKit docs:

- Sizes on a 393 pt iPhone: compact leading or trailing 52.33 x 36.67 pt; minimal 36.67 to 45 wide; expanded and Lock Screen 371 wide, 84 to 160 tall. On a 430 pt iPhone the compact sides are 62.33 wide and the cards 408 wide.
- The system may truncate an activity taller than 160 pt. The Lock Screen standard margin is 14 pt.
- Compact sides should be snug to the camera, balanced, and use short units. Both sides deep-link to the same screen.
- The expanded view keeps the same relative placement as compact.
- Large text, medium weight or heavier. The island background is always black.
- Animations up to 2 s, none in Always-On reduced luminance. `numericText(countsDown:)` for timer digits.
- Alert only for essential updates, and never send a push for the same update.
- Up to 8 h active, then up to 4 h more on the Lock Screen. End as soon as the task ends, with a final state.
- Static plus dynamic data must stay at or under 4 KB. The extension has no network.
- iOS 26: activities also appear in the Mac menu bar and CarPlay (buttons do nothing in CarPlay). Watch Smart Stack mirror from watchOS 11.

## What each presentation shows

Data the timer already has per step (`buildTimerSteps`): start second, duration (or open-ended), the step text, and the water target where the recipe has one. Example below is a 4-pour V60.

| Presentation | During a pour | During a wait or drawdown | Paused | Your turn | Done |
|---|---|---|---|---|---|
| Minimal | Caramel ring draining to the end of this step, drop glyph inside | Ring with hourglass | Pause glyph, no ring | Amber target glyph | Sage check |
| Compact leading | Target water `190g` in caramel, no glyph (fits 52 pt) | Hourglass glyph | Pause glyph | Target glyph | Check |
| Compact trailing | Step countdown `0:21` | Step countdown | Frozen time, muted | Count-up `0:08`, amber | Total `3:28` |
| Expanded | Leading: `POUR 3 OF 4`, `V60 · 15 g`. Trailing: big countdown. Bottom: `Pour to 190 g`, segmented brew bar (one segment per step, sized by duration), `1:24 of 3:30`, `Next Pour 4 to 250 g 1:45` | Same, step text in place of the target | Static, muted | Step text, `Open the app to confirm` | `Brew done 3:28`, `Ready to taste`, `Rate this cup` link |
| Lock Screen | Bean and method header with whole-brew time, then the expanded content, caramel keyline. About 150 pt. | Same | Grey keyline, static | Amber keyline | Sage keyline, about 100 pt |

Iced recipes add a chill state after drawdown in frost tint, counting up until the user taps "Coffee chilled" in the app.

Rules for the content:

- Grams always carry the unit, and times are always `M:SS`, so the two never read alike.
- Use the step's water target as cumulative scale weight ("to 190 g"). That is what the scale shows. Confirm per method during the build that every recipe writes cumulative targets.
- The activity starts when the 3-2-1 countdown ends (`beginRunning`), not at countdown start. GETUP also skips its start countdown.
- `widgetURL` deep-links back to the open timer. The done state's "Rate this cup" is a `Link` to the tasting flow for that bean, the same bridge `App.jsx` already uses.
- Done lingers 5 minutes (`dismissalPolicy: .after(now + 300)`), long enough to walk to the cup and tap "Rate this cup". Opening tasting ends it at once. Apple sets no number for timers. GETUP uses 4 s, which is too short for a link that matters.
- Bars fill left to right: pass `countsDown: false` to `ProgressView(timerInterval:)`.
- Stop a countdown at 0:00 instead of counting past it, using Capgo's trick: `Text(timerInterval: end - 1 ... end, pauseTime: end, countsDown: true)` with the real start as the lower bound for the ring.
- Count-up states use `Text(stepDueDate, style: .timer)`. Never pass `Date.distantFuture` anywhere.
- The widget cannot import the app's theme. Repeat the hex values in Swift: caramel `#E2A266` (brand caramel lifted for contrast on black), sage `#8FC09A`, frost `#A9C3D0`, amber `#E8BE6A`, Lock Screen tint `#1B120C`.

## Staying correct while the app is suspended

The app cannot update the activity at step boundaries while suspended. Four layers handle this, strongest last:

1. **Whole schedule in the state.** ContentState carries the brew start date and a compact array of steps (offset, duration, short label, target grams). The widget computes the current step from `Date()` every time it renders. The whole-brew time and the segmented bar are pure date anchors and are always right.
2. **Re-render hints.** Set `staleDate` to the next step boundary and render an explicit `context.isStale` branch (without one, some reports show a spinner). In the island, wrap content in `TimelineView(.explicit(boundaryDates))` as Timer.Coffee does. Timer.Coffee found this unreliable on the Lock Screen and derives from `Date()` there instead. Neither is proven to fire while suspended, so the label can lag on the Lock Screen until something re-renders it.
3. **Step alerts (now in the first release).** Schedule a local notification for each upcoming step boundary at start ("Pour 4: to 250 g"). One identifier per step. Cancel and reschedule on pause, skip or rewind. These fire while suspended and give the buzz that today only works in the foreground (the 1.1.249 haptic fix is foreground-only). Needs `@capacitor/local-notifications`.
4. **Stay awake for real.** The Acaia scale connection with the `bluetooth-central` background mode keeps the app running for the whole brew, so it publishes every boundary on time and could show live grams. Audible pour cues with an audio session are the other route (GETUP does this, with App Review guideline 2.5.4 risk). Either makes layers 1 to 3 the fallback.

Ruled out:
- **Server push at each step** (Timer.Coffee's fallback). It needs a backend scheduler and APNs keys for a few seconds of label accuracy. Revisit only if device tests show layers 1 to 3 fail badly.
- **One AlarmKit alarm per step.** Loud, full-screen alerts for every pour is too much. AlarmKit is a fair candidate later for one "brew done" alert, iOS 26 only.
- **`NSSupportsLiveActivitiesFrequentUpdates`.** Not needed when we publish only on transitions.

## Update strategy

- Publish only on transitions. The checkpoint effect in `useBrewTimer.js` already fires on exactly these (phase or step index change). Hook the publish next to it.
- Convert the hook's wall-clock refs to absolute dates once per publish:
  - brew anchor = now minus `readGlobalMs()`
  - step end = now plus the step duration minus `readStepMs()`
- Paused: send static strings and no timer anchors. On resume, shift the anchors by the paused time (`start += now - pausedAt`).
- One upsert call: start the activity if none exists, otherwise update; skip when the state is equal to what is showing (openGym's pattern).
- In native code, copy GETUP's hard-won rules:
  - Race every ActivityKit await against a 10 s timeout, and keep a single writer that holds only the latest state. One stuck call once froze every later update in GETUP.
  - `end` cancels any pending update. Clean up orphans in their own task, and never let cleanup block starting the current brew.
  - Log markers at `notice` level so they survive for on-device diagnosis.
  - Capture `Activity<T>.activities` before an async sweep.
  - Use `.activityBackgroundTint`, never `.background`, on the Lock Screen view.
- End on Stop, Reset, Finish (after the done linger) and timer-age expiry (`MAX_BREW_TIMER_AGE_MS`, 6 hours). On app launch, end any orphan whose session is gone from `brewTimerSession.js`.
- No push token. Keep ContentState changes additive (optionals), so an old activity always decodes after an update.
- Cover both timers: `BrewTimer` (hand brew and quick recipe) and `ManualSourceBrewTimer`, including its confirm-to-advance steps. Fellow Aiden brews are machine-driven and come later.

## Native approach

### Plugin choice

| Option | Gets | Misses |
|---|---|---|
| `@capgo/capacitor-live-activities` 1.3.3 (2026-11-13) | JSON layouts. Its timer element does tick without updates. | Progress is a static 0 to 1 value, so rings and bars do not move. Its `startTimerSequence` runs a 1 s timer inside the app, which dies on suspend. No typed state. |
| `ludufre/capacitor-live-activities` 8.0.0, `kisimediaDE/capacitor-live-activity` 8.2.0 | JSON or string-map layouts, segmented progress (ludufre), push-to-start (kisimedia) | Same static-progress gap. |
| **Own local plugin + SwiftUI extension (recommended)** | Date-range rings and bars, schedule-driven step rendering, `isStale` branch, keyline tint, App Intent buttons later, direct reuse of GETUP Swift | We own about 150 lines of plugin Swift and the widget views |

A Capacitor precedent exists: openGym ([repo](https://github.com/DuarteSantos8/openGym)) ships a local `LiveActivityPlugin.swift` plus a widget extension in a Capacitor app, with JSON state decoded natively.

### Pieces

- `BrewActivityAttributes` (static: method, bean name, dose, session ID) and `ContentState` (phase, brew start, step schedule, current step index at publish, paused remaining, done total). One Swift file in both the app and extension targets.
- `BrewActivityPlugin` (app target): `isSupported()`, `upsert(state)`, `end(state, dismissAfterSeconds)`, `endAll()`.
- `BrewActivityWidget` extension: the views in the table above, iOS 16.2+.
- JS wrapper `src/lib/brewLiveActivity.js`: maps the hook's clock snapshot to ContentState. It no-ops on web, and when `Capacitor.isPluginAvailable('BrewActivity')` is false.
- `NSSupportsLiveActivities = YES` in the app Info.plist.

### Release facts

1. **New binary required.** This is native code, so it goes out through TestFlight and App Store review. Capgo `ship app` cannot deliver it. The JS wrapper must no-op on older binaries, because Capgo OTA bundles also reach phones on the old binary.
2. **`ios/` is tracked in git since PR 20.** The extension is a new target in the tracked project, with bundle IDs `com.talmeltzer.coffeehub.BrewActivity` and `com.talmeltzer.coffeehub.dev.BrewActivity`. `configure-ios-variant.mjs` rewrites bundle IDs by regex, so it must learn the extension's IDs too.

## Phases and effort

| Phase | Scope | Effort | Ships via |
|---|---|---|---|
| 1 | Live Activity in all presentations and states (running, paused, your turn, iced, done), schedule-driven steps, deep links, update policy, both timers, plus step-boundary local notifications | 4 to 5 days including simulator and device checks | New binary (TestFlight) |
| 2 | Live grams from the Acaia scale in the activity, when the scale thread lands | About 1 day on top of the scale work | New binary |
| 3 | Lock Screen and expanded buttons: Pause or Resume, Next step, using `LiveActivityIntent` (iOS 17+) | 2 to 3 days. Device-only proof. | New binary |

Phase 3 notes. The intent must work while the WebView sleeps, so it updates the activity natively from the schedule and queues the command in App Group storage. JS drains the queue on resume and acknowledges it with IDs, so a stale JS state never overwrites a newer tap (openGym). Each button carries a token of the step it was drawn for, and a mismatched tap is refused (GETUP, Pomodoist). GETUP's own intent buttons are still not device-verified, so prototype on a phone first.

## How to prove it

- Swift unit tests for the update policy, the schedule-to-current-step function, and the state mapping. A JS test for the clock-snapshot to ContentState mapping, added to `npm run test:brew-timing-memory`.
- Snapshot renders of the Lock Screen layout at 280, 320, 360 and 402 pt, as GETUP does, and at the largest Dynamic Type.
- Device checklist (the simulator does not show the real island):
  1. Lock mid-pour. The step countdown, ring and bar keep moving. At the boundary, the step alert buzzes.
  2. Leave it locked past two boundaries. Record when the step label catches up (layer 2 test). Total time stays right.
  3. With music playing, the minimal ring drains.
  4. Pause in the app, then lock. Static times show and nothing ticks. Resume, and the anchors shift correctly.
  5. A source recipe reaches a confirm step while locked. "Your turn" shows and counts up.
  6. Finish. The done state appears, and "Rate this cup" opens tasting for that bean. It dismisses after 5 minutes otherwise.
  7. Battery: a 4-minute brew costs no more than an idle locked phone.

## Not verified

- Nothing here was built, compiled or run. No Xcode build in this round.
- Mockups are HTML renders with stand-in glyphs, not SwiftUI, and were not seen on a device.
- Whether the widget re-renders at `staleDate` or on a `TimelineView(.explicit)` schedule while the app is suspended. Forum reports conflict and Timer.Coffee calls the Lock Screen case unreliable. Device test 2 decides how much layer 3 matters.
- Competitor details come from source code (Timer.Coffee) and listing text. No competitor app was installed or run. FourSix and Brewprint are unconfirmed (see the table).
- Apple's update budget numbers are not published.
- That every method's recipe writes cumulative water targets on each step.
