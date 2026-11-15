# Acaia scale in the recipe flow (research + plan)

Date: 2026-11-15. Status: plan only, nothing built. Asked by Tal: "Bluetooth to my scale for the recipe flow? I have Acaia scale."

## Recommendation

Build it native-only (iOS app), behind a small JS `scale` layer, with **Acaia's official iOS SDK** as the first transport. Keep a pure-JS protocol over `@capacitor-community/bluetooth-le` as the fallback if the SDK does not cover Tal's model or fails a one-hour spike. Do not try to do it in the PWA.

The scale's job in v1 is three things: start the brew clock on the first pour, show live grams against each pour's target, and save what was actually poured. Step changes stay time-based, as today.

Rough effort: 4 to 6 thread-days, plus one new App Store/TestFlight binary (a native plugin cannot ship over Capgo).

**Blocking question for Tal:** which Acaia model (Pearl, Pearl S, Lunar, Lunar 2021, Pyxis, Cinco, Orion, Pearl 2021)? It decides SDK vs fallback.

## What exists today (repo)

- No scale or Bluetooth code anywhere. The 2026-04-12 hand-brew timer plan deliberately skipped Filtru-style Bluetooth scales (`docs/plans/2026-04-12-001-feat-hand-brew-timer-plan.md:44`).
- `src/hooks/useBrewTimer.js` is a wall-clock state machine: `idle -> countdown -> running <-> paused -> done`. `beginRunning()` sets `startedAtRef` when the 3-2-1 countdown ends. Steps advance by time in a 100 ms tick.
- Every timer step already carries a cumulative water target: `step.waterTotal` + `step.waterUnit` (Kalita adapter sets `waterTotal`, source recipes map `waterToGrams`). `BrewTimer.jsx:1076` already renders "N g total". That is exactly the number a scale compares against.
- Source recipes (V60 manual sources) already use `clock.origin: 'first-water'` and a `first-water` event (`src/lib/brewTimerSteps.js`, `useManualSourceBrewTimer.js`). A scale-detected first pour maps straight onto that event.
- Completed brews feed `src/lib/brewTimingMemory.js` (per-bean timing memory, 24 entries). Measured grams would slot in next to the timing data.
- `ios/` is gitignored and regenerated; Info.plist edits must go through `scripts/configure-ios-variant.mjs` or they are lost.

## Research findings

### Acaia's official iOS SDK
- Repo: https://github.com/acaia/acaia_sdk_ios (Acaia's own GitHub org).
- Binary `AcaiaSDK.xcframework`, shipped with a `Package.swift` (`binaryTarget`) and a podspec. SPM matters: Capacitor 8 here is SPM-based, and lessons.md already records a plugin failing for lack of `Package.swift`.
- README lists: Pearl, Lunar, Pearl S, Cinco, Pyxis. Functions: scan, connect/disconnect, tare, timer start/stop, weight stream "updated 5 pr sec".
- License (custom, copyright 2022 Acaia): use the unmodified binary free of charge; no reverse engineering of the binary; no sublicensing or selling the files; example apps may be copied. **Paid or subscription apps must mention Acaia in the app description and documentation and notify support@acaia.co.** Coffee Hub has a paywall, so this applies.
- 5 Hz is enough for pour-over targets and a smoothed flow rate. It is thin for espresso shot graphs (not in scope).
- Not listed: Lunar 2021, Pearl 2021, Orion, Pearl Model S 2022. "Lunar" may or may not include the 2021 model. Unverified.

### Open-source protocol implementations (fallback path)
| Project | License | Notes |
|---|---|---|
| zweckj/aioacaia (Python, powers Home Assistant's Acaia integration) | MIT | Detects "new style" scales (`is_new_scale`). New-style service `49535343-fe7d-4ae5-8fa9-9fafd205e455`. HA tested: Lunar, Pyxis, Pearl, Pearl S. |
| moritzsternemann/acaia-swift | MIT | Message encode/decode only, tested on Lunar 2021, says not production ready. |
| lucapinello/pyacaia and forks | AGPL-3.0 | Do not copy (public repo, paid app). README: Lunar 2021 needs a firmware update or commands fail. |
| graphefruit/Beanconqueror (Capacitor 8 app with Acaia) | GPL-3.0 | Do not copy. Uses `cordova-plugin-ble-central`, not the community plugin. |
| bpowers/btscale | ISC | Old Chrome Apps BLE API; protocol reference only. |

If the fallback is used, write the protocol from the MIT references only, and keep it in one file with its own tests.

### Capacitor BLE plugin (fallback transport)
- `@capacitor-community/bluetooth-le` 8.3.0, MIT, peer `@capacitor/core >=8.0.0`, has `Package.swift`. `startNotifications` / `write` / `writeWithoutResponse` on iOS.
- Needs `NSBluetoothAlwaysUsageDescription` (app crashes on first BLE call without it). `UIBackgroundModes: bluetooth-central` only if we want the scale live while backgrounded.
- BLE does not work in the iOS Simulator.

### Web / PWA
- iOS Safari does not implement Web Bluetooth (only third-party browsers like Bluefy do). Desktop Chrome does, but that is not how Tal brews. So: native-only, hidden on web.

### One connection at a time
- Home Assistant's docs say the scale accepts one connection; while HA holds it, the Acaia app cannot connect. Beanstats says the same. Expect: if the Acaia app is open, Coffee Hub cannot connect, and the reverse. The UI needs that hint.

### Competitor behavior worth copying
- **Beanstats**: auto-start when weight rises above 0.5 g/s; filter auto-start is OFF by default "to avoid triggering during bloom"; no auto-stop for pour-over (bloom pauses and pulse pours cause false stops); chimes at each cumulative target weight.
- **Filtru**: Acaia Pearl, Pearl S, Lunar, Pyxis, Cinco plus many other brands; shows a timer with a flow-speed illustration.
- **Acaia's own apps** (Acaia Coffee, Brewguide, Brewbar) are the bar for "pour to target" guidance.

## Design for Coffee Hub

### Architecture
```
src/lib/scale/
  scaleSession.js     # pure: weight samples -> smoothed weight, flow g/s, first-pour detection, target state
  scaleTransport.js   # picks transport: native Acaia plugin | BLE fallback | mock | none
  mockScale.js        # replays recorded traces for tests, simulator, Playwright
src/hooks/useScale.js # connect/reconnect, status, latest sample; no-op on web
native/capacitor-acaia/  # local Capacitor plugin (Swift + Package.swift) wrapping AcaiaSDK via SPM
```
- The plugin exposes only: `scan`, `connect(id)`, `disconnect`, `tare`, and a `weight` event (`{ grams, stable, atMs }`) plus `status` events. All brew logic stays in JS, so it is cloud-testable and fixable over Capgo.
- Reference the SDK as a remote SPM dependency on `github.com/acaia/acaia_sdk_ios`; do not vendor the xcframework into this public repo (the license forbids sublicensing; linking to Acaia's own repo avoids redistributing it).
- JS checks `Capacitor.isPluginAvailable('Acaia')` so a new OTA bundle running on an older binary simply hides the feature.
- Add `NSBluetoothAlwaysUsageDescription` in `scripts/configure-ios-variant.mjs` ("Coffee Hub connects to your coffee scale to track your pours.").

### Brew flow (v1)
1. **Before brewing** (BrewTimer idle screen): a "Scale" pill. First time: scan and pick; after that, auto-connect to the remembered scale when the timer opens. States: Connected (battery), Searching, Not found ("close the Acaia app"), Off.
2. **Tare**: one button that sends tare. Copy tells Tal to tare with dripper, filter and coffee on the server. Iced recipes: tare after the ice is in the server, so `waterTotal` (hot water only) stays correct.
3. **Auto-start on first pour** (replaces the 3-2-1 when a scale is connected, with a "Start manually" fallback): start when net weight is above 2 g and rising at 1 g/s or more for 300 ms; back-date `startedAt` to the first sample above 0.5 g so the clock counts from first water. For source recipes this sets the existing `first-water` event. On by default for pour-over here (unlike Beanstats) because our brew always begins with the bloom pour, which is exactly the trigger.
4. **While pouring**: big live grams next to the step's cumulative target ("62 / 60 g"), a fill bar toward the target, smoothed flow rate (1.5 s window), and a light haptic + "Stop" cue within 2 g of the target, a warning past 5 g over. The existing ring and step timing stay as they are.
5. **Bloom and pour timing**: the scale shows when each pour actually ended. That directly answers Tal's "does the 30 second bloom include the pour" question on his own brews, and the saved data shows real pour durations.
6. **Finish**: still a manual "Done" tap. With the dripper sitting on the server on the scale, total weight does not change during drawdown, so the scale cannot detect drawdown end. Do not attempt auto-stop.
7. **Save**: add an additive `scaleSummary` to the brew attempt/timing record: `{ model, firstWaterAtMs, perStep: [{ targetG, actualG, reachedAtSec }], finalWaterG, maxFlowGps, overpourG }`. No raw 5 Hz stream in Firestore. Brew history can then show "poured 352 g of 350 g".

### Not in v1
- Weight-driven step advance (time stays the source of truth; revisit after real brews).
- Espresso shot graphs, background BLE, other scale brands (the transport layer leaves room: Felicita, Timemore, Bookoo all have public or reverse-engineered protocols).
- Dynamic Island: the separate Live Activity work can show "62 / 60 g" later; the scale layer exposes the numbers.

## Phases and effort

| Phase | Where | Effort | Output |
|---|---|---|---|
| 0. Spike: build Acaia's Example-swift app, connect to Tal's scale, confirm weight stream; same for the BLE fallback if the SDK fails | Studio + Tal's iPhone + scale (Tal present) | 0.5 day | go/no-go on SDK, model confirmed |
| 1. Local Capacitor plugin + `scaleTransport` + `mockScale` + `scaleSession` with tests in `npm test` | Cloud writes JS + Swift; Studio builds | 1 to 1.5 days | connect, tare, weight events |
| 2. BrewTimer integration: scale pill, tare, auto-start, live target, haptics | Cloud writes; Studio sim check with mock; device check with real scale | 1.5 to 2 days | the brew flow above |
| 3. `scaleSummary` save + brew history display | Cloud (Firestore shape is additive) | 0.5 to 1 day | measured pours saved |
| 4. Device QA, new binary to TestFlight/App Store, App Store text mentions Acaia, email support@acaia.co | Studio + Tal | 0.5 day + review | shipped |

## Risks
- SDK model coverage (Lunar 2021, Pearl 2021, Orion not listed) and SDK age (2022 copyright). Phase 0 settles it.
- Reverse-engineered fallback can break on Acaia firmware updates.
- Needs a new native binary; Capgo-only ship cannot deliver it.
- One-connection limit: the Acaia app holding the scale looks like "scale not found".
- Simulator has no BLE; real checks need Tal's phone and scale in the room.
- Licensing: the "mention Acaia + notify support@acaia.co" step is an outward action for Tal.

## Not verified in this research
- Nothing was built or run against a real scale or the SDK.
- Whether the SDK supports Tal's exact model, ships arm64 simulator slices, or builds cleanly with current Xcode.
- The SDK's last commit date and whether it exposes stability or battery.
- Exact BLE UUIDs, handshake and heartbeat per model (aioacaia and Beanconqueror source directories could not be fetched).
- The one-connection limit comes from Home Assistant and Beanstats docs, not from Acaia.

## Sources
- Acaia iOS SDK: https://github.com/acaia/acaia_sdk_ios (README, LICENSE, Package.swift read 2026-11-15)
- Acaia app compatibility: https://help.acaia.co/hc/en-us/articles/360034707131-Which-apps-connect-with-which-scales
- Home Assistant Acaia integration: https://www.home-assistant.io/integrations/acaia
- aioacaia: https://github.com/zweckj/aioacaia , https://pypi.org/project/aioacaia/ (0.2.3)
- acaia-swift: https://github.com/moritzsternemann/acaia-swift
- pyacaia: https://github.com/vctrd/pyacaia
- Capacitor BLE plugin: https://github.com/capacitor-community/bluetooth-le (npm 8.3.0)
- Beanconqueror: https://github.com/graphefruit/Beanconqueror , https://beanconqueror.gitbook.io/beanconqueror/devices/compatible-devices
- Beanstats scale docs: https://beanstats.com/docs/features/scale-integration/
- Filtru App Store listing: https://apps.apple.com/us/app/best-brew-guide-filtru-coffee/id1150921819
- WebKit Web Bluetooth status: https://bugs.webkit.org/show_bug.cgi?id=238049
