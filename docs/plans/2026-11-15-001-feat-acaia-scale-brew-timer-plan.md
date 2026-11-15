# Acaia scale in the recipe flow (research + plan)

Date: 2026-11-15. Status: plan only, nothing built. Asked by Tal: "Bluetooth to my scale for the recipe flow? I have Acaia scale."

Revision 2 (2026-11-15, same day): deeper research pass. The open-source protocol code was read in full, Acaia's SDK was built with current Xcode, and other coffee apps' scale screens were surveyed. **The recommended transport changed** (see below). Mockups: `docs/plans/mockups/acaia-scale/`.

## Recommendation

Build it native-only (iOS app), behind a small JS `scale` layer. Do not try to do it in the PWA.

**Transport (changed in revision 2):** use `@capacitor-community/bluetooth-le` as the only native piece, and write the Acaia protocol in JS from the MIT-licensed references (aioacaia, AcaiaArduinoBLE, LunarGateway, acaia-swift). Keep Acaia's official iOS SDK as the fallback, not the first choice.

Why the change:

1. **Acaia's SDK is frozen.** Last commit 2022-05-13, binary v2.0.2, built with Xcode 13.3.1 against the iOS 15.4 SDK. It predates the Umbra scales (2025) and the redesigned Lunar. Nothing suggests Acaia still maintains it.
2. **Its API is thin.** Scan, connect, tare, timer, and a weight + unit notification. No battery level, no stable flag, no scale settings, no error detail. The open protocol gives battery, timer state and button presses.
3. **Fixes ship over Capgo.** Firmware differences between models are the main risk. With the protocol in JS, a fix is an OTA bundle. With the SDK, a bug in the closed binary cannot be fixed at all.
4. **One maintained plugin, more scales later.** The community BLE plugin (MIT, 8.3.0, updated 2026-11-12, has `Package.swift`) is the same transport other brands need (Bookoo, Felicita, Timemore, Decent).
5. **Fewer obligations.** The SDK license requires a paid app to name Acaia in its App Store description and notify support@acaia.co. A clean MIT-based implementation only needs the MIT notices.

The SDK is still a working fallback: it builds and links with Xcode 26.6 (checked today, see below). Its example app is also the best Phase 0 tool, because it is a known-good way to confirm Tal's scale streams weight before we write anything.

The scale's job in v1 is unchanged: start the brew clock on the first pour, show live grams against each pour's target, and save what was actually poured. Step changes stay time-based, as today.

Rough effort: 4 to 6 thread-days, plus one new App Store/TestFlight binary (a native plugin cannot ship over Capgo). Ship it in the same binary as the Dynamic Island Live Activity work if the timing lines up.

**Open question for Tal:** which Acaia model? It is no longer blocking: the JS path detects the protocol generation at connect time. It still decides which scale we test on and whether Umbra (no public protocol yet) matters.

## Product fit

The launch positioning sets the app apart from Beanconqueror by being simpler and focused on rotation and recipes, not dozens of brew parameters. So: the scale stays optional, v1 has no scale settings screen, and a brew without a scale looks exactly like today.

## What exists today (repo)

- No scale or Bluetooth code anywhere. The 2026-04-12 hand-brew timer plan deliberately skipped Bluetooth scales (`docs/plans/2026-04-12-001-feat-hand-brew-timer-plan.md:44`).
- `src/hooks/useBrewTimer.js` is a wall-clock state machine: `idle -> countdown -> running <-> paused -> done`. `beginRunning()` sets `startedAtRef` when the 3-2-1 countdown ends. Steps advance by time in a 100 ms tick.
- Every timer step already carries a cumulative water target: `step.waterTotal` + `step.waterUnit`. `BrewTimer.jsx` renders it as the "N g total" pill under the step. That is exactly the number a scale compares against.
- Source recipes (V60 manual sources) already use `clock.origin: 'first-water'` and a `first-water` event (`src/lib/brewTimerSteps.js`, `useManualSourceBrewTimer.js`). A scale-detected first pour maps straight onto that event.
- Completed brews feed `src/lib/brewTimingMemory.js` (per-bean timing memory, 24 entries). Measured grams would slot in next to the timing data.
- `ios/` has been tracked in git since PR 20 (2026-11-15). The Bluetooth usage string can go straight into `ios/App/App/Info.plist`, but `scripts/configure-ios-variant.mjs` rewrites that file on every variant switch, so add the key there too or it can be lost.

## Research findings

### Acaia's official iOS SDK (built and inspected 2026-11-15)

- Repo: https://github.com/acaia/acaia_sdk_ios. 20 commits, 2018-10-30 to 2022-05-13. Relevant ones: "Add support for acaia Pearl S" (2020-06-21), "Added support for Pearl 2021 and Lunar 2021" and "Add support of Swift Package Manager" (both 2021-11-11).
- `AcaiaSDK.xcframework`: static library, version 2.0.2 (build 2021.7.21.1), minimum iOS 12. Slices: `ios-arm64` and `ios-arm64_x86_64-simulator`, so it links on Apple-silicon simulators. Built with Xcode 13.3.1 / iOS 15.4 SDK. The objects carry embedded bitcode.
- **Build check:** Acaia's `Example-swift` target built with Xcode 26.6 (17F113) for device (Debug and Release) and for the simulator, with no SDK warnings. The Release app binary has no `__LLVM` bitcode segment, so the old bitcode does not reach the App Store upload. Not run on a device or against a scale.
- No privacy manifest in the framework. AcaiaSDK is not on Apple's list of SDKs that require one, so this should not block review (unverified until an upload).
- Public API (`AcaiaManager.h`): `startScan`, `stopScan`, `scaleList`, `connectedScale`, `enableBackgroundRecovery`; per scale `uuid`, `name`, `modelName`, `connect`, `disconnect`, `tare`, `startTimer`, `stopTimer`, `pauseTimer`. Events via `NSNotificationCenter`: connected, disconnected, connect failed, device list changed, scan finished, weight (grams or ounces), timer.
- Models: README says Pearl, Lunar, Pearl S, Cinco, Pyxis; the 2021 commit adds Pearl 2021 and Lunar 2021. The binary's name matching includes `PEARL`, `PEARLS`, `LUNAR-`, `ACAIAL`, `CINCO`, `PYXIS`, `PROCHBT`. Nothing for Umbra or the 2025 Lunar.
- License: free use of the unmodified binary; no reverse engineering, sublicensing or selling the files; paid or subscription apps must mention Acaia in the app description and docs and notify support@acaia.co.

### Open-source protocol implementations (read 2026-11-15)

| Project | License | Last commit | Use |
|---|---|---|---|
| zweckj/aioacaia (Python, powers Home Assistant's Acaia integration) | MIT | 2026-11-10 | Primary reference. Clean encoder, parser, both generations, flow rate. |
| tatemazer/AcaiaArduinoBLE (ESP32) | MIT | 2026-08-27 | Per-model compatibility table with firmware versions. |
| frowin/LunarGateway (ESP32) | MIT | 2022-03-04 | Original Lunar gateway; AcaiaArduinoBLE is a port of it. |
| moritzsternemann/acaia-swift | MIT | 2024-02-19 | Encode/decode only, Lunar 2021 only, "not recommended for production". |
| bpowers/btscale | ISC | 2017-02-05 | Old Chrome Apps API; history only. |
| lucapinello/pyacaia | AGPL-3.0 | 2022-01-05 | Do not copy. |
| graphefruit/Beanconqueror | GPL-3.0 | 2026-11-14 | Do not copy. Read for behavior and settings only. |
| decentespresso/de1app | GPL-3.0 | 2026-10-29 | Do not copy. Treats old-style and "Pyxis-style" Acaia as two scale types. |
| Zer0-bit/gaggiuino | CC BY-NC 4.0 | 2025-04-18 | Do not copy (non-commercial). |

Write the protocol from the MIT sources only, in one file with its own tests.

What the MIT sources agree on (aioacaia `const.py`, `encoder.py`, `parser.py`, `scale.py`; AcaiaArduinoBLE `.h`/`.cpp`):

- **Two generations, told apart by characteristics, not by name.** Old style: a single characteristic `2a80` (service `1820`) for write and notify. New style: the Microchip transparent-UART service `49535343-fe7d-4ae5-8fa9-9fafd205e455`, write `49535343-8841-43f4-a8d4-ecbe34729bb3`, notify `49535343-1e4d-4bd9-ba61-23c647249616`. AcaiaArduinoBLE marks pre-2021 Lunar as old style and Lunar 2021 and Pyxis as new style.
- **Advertised names** start with `ACAIA`, `PYXIS`, `LUNAR`, `PROCH` (aioacaia); Beanconqueror also matches `PEARL` and `CINCO`. `PROCHBT001` is a Pearl.
- **Framing:** `EF DD`, message type, payload, then two checksum bytes (sum of even-index and odd-index payload bytes, each `& 0xFF`).
- **Session:** after connecting, send identify (type 11, 15 ASCII bytes; new style uses `012345678901234`, old style 15 dashes), then a notification request (type 12) for weight, battery, timer and key events.
- **Heartbeat:** new style needs identify + heartbeat + get-settings about every 1 s (aioacaia); old style every 5 s. AcaiaArduinoBLE uses 2.75 s and treats 5 s without a packet as a dropped link. Beanconqueror defaults to 1 s and offers a "V1" fallback mode for scales that loop connect/disconnect.
- **Weight:** two little-endian bytes divided by 10^unit-byte (1 to 4), negative when bit 2 of byte 5 is set. Settings messages carry battery (low 7 bits) and, on new style, whether the scale timer is running (top bit).
- **Flow:** aioacaia fits a least-squares line through recent (time, weight) samples and drops values outside 0 to 20 g/s.
- **Reconnect:** aioacaia waits 15 s after a disconnect before reconnecting.

Per-model notes (AcaiaArduinoBLE table, pyacaia README, Home Assistant docs):

| Model | Protocol generation | Official SDK 2.0.2 | Open-source evidence |
|---|---|---|---|
| Pearl (classic) | detect at connect | yes | HA tested |
| Pearl 2021 | detect at connect | yes (2021 commit) | not separately listed |
| Pearl S (micro-USB and USB-C) | detect at connect | yes | HA tested; Arduino "Ok" |
| Lunar pre-2021 | old style | yes | Arduino "Great" |
| Lunar 2021 (USB-C) | new style | yes (2021 commit) | Arduino "Hit or Miss"; pyacaia says it needs a firmware update first |
| Lunar 2025 redesign | unknown | no | only Brew Better claims support |
| Pyxis | new style | yes | Arduino "Good", but the tare command is less reliable than the button |
| Cinco | unknown | yes | Beanconqueror name-matches it; not in aioacaia's list |
| Umbra Lunar / Umbra Duo (2025, no display) | unknown | no | only Brew Better claims support |

Orion is a bean doser, not a scale; drop it from the model question. Acaia says the Pearl line is meant for manual brewing and the Lunar for espresso, so a home pour-over brewer most likely has a Pearl or Pearl S. No sales data was found to confirm that.

### Capacitor BLE plugin

- `@capacitor-community/bluetooth-le` 8.3.0, MIT, peer `@capacitor/core >=8.0.0` (repo is on `^8.2.0`), ships `Package.swift`. Offers `requestDevice`/scan, `connect`, `startNotifications`, `write`, `writeWithoutResponse`.
- Needs `NSBluetoothAlwaysUsageDescription` (the app crashes on the first BLE call without it). `UIBackgroundModes: bluetooth-central` only if the scale must stay live while backgrounded; not in v1.
- BLE does not work in the iOS Simulator. Simulator checks use the mock transport.
- Beanconqueror is the proof that this shape works: a Capacitor 8 app with Acaia in JS over a BLE plugin (it uses `cordova-plugin-ble-central`). Its known iOS issue is a scale that connects but sends no weight; it shows a "No weight values?" prompt for exactly that.

### Web / PWA

- iOS Safari does not implement Web Bluetooth (only third-party browsers like Bluefy do). So: native-only, hidden on web.

### One connection at a time

- Acaia's help center, Home Assistant and Beanstats all say a scale holds one connection. Acaia's own advice: force-close other Acaia apps (including background updaters), turn off other Acaia scales, keep the phone close. The pairing screen shows this hint up front.

### How other coffee apps present it

Full notes came from App Store listings, help docs and open-source settings; Acaia's own help center blocked direct reads, so its claims come from search excerpts.

- **Acaia's own apps are not the bar.** Brewguide (1.0.30, 3.1 stars from 14 ratings) is a Pearl S recipe loader; the guidance runs on the scale, not the phone. Brewmaster (2.0.50, 1.7 stars from 18) has live charts and auto-start "when the first drops reach the cup", but reviews cite crashes and unclear graphs. Brewbar was last updated 2022-01-26.
- **On-scale Pearl pour-over mode:** auto-starts on flow, flow LEDs from 0.5 to 9.5 g/s with brighter marks at 2.5 and 6.5 g/s; vibration can false-trigger it. The Pearl 2021 end screen shows time, water, beverage weight and ratio.
- **Beanstats** (closest to what we want): weight and time in one header row with a stability dot, chart below, pinned Finish button; flow reads "Idle" under 0.3 g/s; peak-flow badge; dotted gray reference trace when repeating a brew; filter auto-start OFF by default "to avoid triggering during bloom", trigger above 0.5 g/s; "Recipe Weight Chimes" at each cumulative target with a distinct final chime; haptics on; long-press weight to freeze during a swirl.
- **Beanconqueror** defaults: tare on new brew and on timer start ON; auto-start ("Listening") OFF with a 0.1 g threshold; first-drip threshold 0.1 g; smoothed flow drawn, raw flow off for filter; reference graph overlay; pause button to ignore weight during a swirl; keep-connected-in-background OFF. 4.9 stars, but a 2024 review describes a Pearl S disconnect loop with stacked pop-ups.
- **Brew Better** (third-party Acaia app): live "where the water should be" target, per-pour phases (duration, water, flow), Umbra and "Lunar 2025" support, in-app pairing only.
- **Fellow Tally Pro** has no app; its Brew Assist shows target and current weight together and inverts the number's color at target.
- **Timemore, Bookoo, Felicita** apps all draw weight and flow curves; reviews complain about small weight readouts, lost brew records and unreliable auto modes.

Patterns we copy: live weight as the biggest number while pouring; cumulative targets with a chime and haptic at each; explicit "listening" state after tare instead of always-on auto-start; smoothed flow; a summary with water, ratio, times and the curve against a reference; in-app pairing with the one-app hint. Pitfalls we design against: connect loops and silent connections on iOS, false auto-starts from vibration, tiny readouts, lost saves.

## Design for Coffee Hub

Mockups (made-up data, app theme colors and type): `docs/plans/mockups/acaia-scale/00-overview.png` plus one PNG per screen, `01-pair-scale.png` to `06-brew-summary.png`. Source: `mockups.html`; regenerate with `node docs/plans/mockups/acaia-scale/render.mjs`.

### Architecture

```
src/lib/scale/
  acaiaProtocol.js    # pure: encode commands, decode frames (weight, battery, timer, button); written from MIT sources
  scaleSession.js     # pure: samples -> smoothed weight, flow g/s, first-pour detection, target state, summary
  scaleTransport.js   # picks transport: BLE (community plugin) | mock | none; SDK plugin slot if ever needed
  mockScale.js        # replays recorded traces for tests, simulator and Playwright
src/hooks/useScale.js # connect/reconnect, heartbeat, watchdog, status, latest sample; no-op on web
```

- All protocol and brew logic is JS, so it is cloud-testable and fixable over Capgo. `npm test` gets decoder tests from captured frames and session tests from recorded traces.
- Connect flow: scan by name prefix, connect, read services, pick old or new style by characteristic, identify, request notifications, start the heartbeat (1 s new style, 5 s old style).
- **Watchdog:** connected but no weight frame for 3 s -> one automatic reconnect, then a "Scale connected but silent" state with a Reconnect button. No stacked pop-ups.
- After a drop, wait before reconnecting (aioacaia uses 15 s) and show "Reconnecting".
- JS checks `Capacitor.isPluginAvailable('BluetoothLe')` so a new OTA bundle on an older binary simply hides the feature.
- Add `NSBluetoothAlwaysUsageDescription` ("Coffee Hub connects to your coffee scale to track your pours.") in `Info.plist` and in `scripts/configure-ios-variant.mjs`.
- SDK fallback, only if Phase 0 shows the JS protocol cannot hold a connection on Tal's model: a small local Capacitor plugin wrapping `AcaiaSDK` via SPM from Acaia's own repo (never vendor the binary into this public repo), emitting the same `{ grams, atMs }` events.

### Brew flow (v1), matching the mockups

1. **Pair** (`01`): a "Scale" pill on the BrewTimer opens a sheet that scans in-app. Rows show model, signal and battery. The one-app-at-a-time hint is always visible. "Brew without a scale" closes it. The scale is remembered and auto-connects when the timer opens.
2. **Tare** (`02`): live weight of everything on the scale, one Tare button (sends the tare command). Copy: server, dripper, rinsed filter and coffee on, then tare. Iced recipes: tare after the ice is in, so `waterTotal` (hot water only) stays correct.
3. **Listening** (`03`): replaces the 3-2-1 countdown when a scale is connected. Starts when net weight is above 2 g and rising at 1 g/s or more for 300 ms (stricter than Beanconqueror's 0.1 g to resist vibration), then back-dates `startedAt` to the first sample above 0.5 g. For source recipes this sets the existing `first-water` event. "Start timer now" is always there. This differs from Beanstats (auto-start off for filter) on purpose: our brew always opens with the bloom pour, and Listening is an explicit armed state after tare, not a background trigger.
4. **Pouring** (`04`): live grams are the biggest number, inside the ring, which fills toward the current pour's cumulative target. Brew time moves to a smaller line above. Flow (smoothed over 1.5 s) sits on a 2.5 to 6.5 g/s band, the same marks Acaia's Pearl uses. A strip shows every pour's cumulative target.
5. **Target** (`05`): within 2 g of the target the ring turns sage, one haptic tap, a short chime (a distinct one on the last pour), and a "Stop pouring" banner with the next pour time. Over by more than 5 g: amber with the amount. Nothing blocks the brew; steps still advance on time.
6. **Finish:** still a manual tap. With the dripper on the server on the scale, total weight does not change during drawdown, so the scale cannot detect its end. No auto-stop.
7. **Summary** (`06`): water poured vs target, real ratio from the recipe dose, bloom length and bloom pour time, peak and average flow, per-pour target vs poured vs time reached, and the pour curve against the targets and (dotted) the last brew of the same bean. Then the existing "Start Tasting Session" and Done.
8. **Save:** an additive `scaleSummary` on the brew attempt/timing record: `{ model, protocol: 'acaia-old'|'acaia-new', firstWaterAtMs, perStep: [{ targetG, actualG, reachedAtSec }], finalWaterG, peakFlowGps, avgFlowGps, curve: [[sec, g]] }`. `curve` is thinned to 1 Hz (a 4 minute brew is about 240 pairs); the raw stream is never stored.

### Not in v1
- Weight-driven step advance (time stays the source of truth; revisit after real brews).
- A swirl/hold control that freezes weight (Beanstats, Beanconqueror). Smoothing covers short spikes; add it if real brews show noisy flow.
- A scale settings screen, espresso shot graphs, background BLE.
- Other brands. The transport leaves room: Bookoo, Felicita and Decent use simple open protocols that AcaiaArduinoBLE already implements under MIT.
- Umbra and the 2025 Lunar, until someone documents their protocol or Tal owns one.
- Dynamic Island: the Live Activity work can show "42 / 60 g" later; the scale layer exposes the numbers.

## Phases and effort

| Phase | Where | Effort | Output |
|---|---|---|---|
| 0. Spike with Tal's scale: run Acaia's `Example-swift` on his iPhone (it already builds) to confirm the model streams; then a throwaway dev build with the BLE plugin and a first `acaiaProtocol.js`, connect, log 5 minutes of frames | Studio + Tal's iPhone + scale (Tal present) | 0.5 day | model confirmed, protocol generation known, real frame captures for tests, go/no-go on the JS path |
| 1. `acaiaProtocol` + `scaleSession` + `mockScale` + `scaleTransport` + `useScale`, with decoder and session tests in `npm test` | Cloud writes; Studio builds | 1.5 days | connect, heartbeat, tare, weight, battery, watchdog |
| 2. BrewTimer integration per the mockups: pair sheet, tare, listening, live target, flow, chimes and haptics | Cloud writes; Studio sim check with the mock; device check with the real scale | 1.5 to 2 days | the brew flow above |
| 3. `scaleSummary` save + summary screen + brew history line ("poured 322 g of 320 g") | Cloud (Firestore shape is additive) | 0.5 to 1 day | measured pours saved |
| 4. Device QA, new binary to TestFlight/App Store | Studio + Tal | 0.5 day + review | shipped |

## Risks
- Reverse-engineered protocol can break on Acaia firmware updates. Mitigation: it is JS, so fixes ship over Capgo; the SDK stays as a fallback.
- Lunar 2021 connections are reported as unreliable, and that model may need a firmware update first. Pyxis tare by command is less reliable than the button.
- iOS "connected but no weight" is a known Acaia problem in a Capacitor app (Beanconqueror). The watchdog is the answer; Phase 0 tells us how often it happens.
- Needs a new native binary; Capgo-only ship cannot deliver the plugin.
- One-connection limit: the Acaia app holding the scale looks like "scale not found".
- Simulator has no BLE; real checks need Tal's phone and scale in the room.
- Heartbeats run on JS timers. The brew screen is in the foreground, so this should be fine, but iOS suspends JS when the app is backgrounded (the Live Activity work may tempt that).

## Not verified in this research
- Nothing was run against a real scale. Neither the SDK nor any protocol code was tested on hardware.
- The SDK example was built (device and simulator, Debug and Release) but not launched, and no App Store upload was tried.
- Which generation Pearl S, Pearl 2021 and Cinco use, and what Umbra and the 2025 Lunar speak.
- How often the scale sends weight frames over the open protocol (the SDK says 5 per second).
- Acaia help-center claims (one connection, close other apps, Pearl 2021 end screen, Pearl for manual brewing) come from search excerpts; the site blocked direct reads. No Reddit threads or YouTube videos were checked.
- Which Acaia model Tal owns.

## Sources
- Acaia iOS SDK: https://github.com/acaia/acaia_sdk_ios (cloned, built with Xcode 26.6, 2026-11-15)
- aioacaia: https://github.com/zweckj/aioacaia (MIT, cloned 2026-11-15)
- AcaiaArduinoBLE: https://github.com/tatemazer/AcaiaArduinoBLE (MIT)
- LunarGateway: https://github.com/frowin/LunarGateway (MIT)
- acaia-swift: https://github.com/moritzsternemann/acaia-swift (MIT)
- btscale: https://github.com/bpowers/btscale (ISC)
- pyacaia: https://github.com/lucapinello/pyacaia (AGPL, read only)
- Beanconqueror: https://github.com/graphefruit/Beanconqueror (GPL, settings and strings read only), https://beanconqueror.gitbook.io/beanconqueror/features/smartscales-bluetooth-features
- de1app: https://github.com/decentespresso/de1app (GPL, read only)
- Gaggiuino: https://github.com/Zer0-bit/gaggiuino (CC BY-NC, read only)
- Capacitor BLE plugin: https://github.com/capacitor-community/bluetooth-le (npm 8.3.0)
- Home Assistant Acaia integration: https://www.home-assistant.io/integrations/acaia
- Beanstats scale docs: https://beanstats-docs.pages.dev/docs/features/scale-integration
- Brewguide: https://apps.apple.com/us/app/brewguide/id1449417468 ; Brewmaster: https://apps.apple.com/us/app/brewmaster/id973393267 ; Brewbar: https://apps.apple.com/us/app/brewbar/id979811869
- Brew Better: https://apps.apple.com/app/id6751485032 , https://brewbetter.app/blog/connecting-acaia-scale
- Beanconqueror App Store: https://apps.apple.com/app/id1445297158 ; Timemore Coffee: https://apps.apple.com/app/id1537369359 ; Filtru: https://apps.apple.com/us/app/1150921819
- Pearl modes: https://www.seattlecoffeegear.com/pages/product-resources/acaia-pearl-coffee-scale-product-guide
- Acaia help center (search excerpts): https://help.acaia.co/hc/en-us/articles/360034707131 , https://help.acaia.co/hc/en-us/articles/360034047271 , https://help.acaia.co/hc/en-us/articles/360059886312
- Umbra Lunar: https://dailycoffeenews.com/2025/06/02/the-new-acaia-umbra-lunar-goes-where-other-scales-cannot/
- Fellow Tally Pro: https://clivecoffee.com/blogs/learn/fellow-tally-vs-acaia-pearl-which-coffee-scale-is-best
- WebKit Web Bluetooth status: https://bugs.webkit.org/show_bug.cgi?id=238049
