# Ruphus conversation completion — observed acceptance

The original completion verdict below was **reopened after subsequent owner failures**. These observations remain historical, not fresh acceptance. The current source `b52abb2` engineering verdict, independent native consumer journeys, failed attempts and verified fixes are in [the current acceptance log](2026-09-12-ruphus-independent-consumers.md). Phone/production release and owner subjective acceptance are not claimed here.

## Delivery identity

- Worktree/branch: `codex/ruphus-technique-exploration`.
- Implementation: `5608567` (semantic preview intent and failed-turn reconciliation), then `cd9ecd7` (trusted Switch identity and task continuity).
- Current Dev preview: https://twomanybeans-ruphus-qz3f7mcub-tmanman90s-projects.vercel.app
- Deployment: `dpl_DFLTDFmtSDPp5ofdN7LdEsHQmwuV`, verified READY and non-production.
- Installed simulator: `7EC6BF90-33B7-4B1A-A651-464B4AC9AA9E`, iPhone 17 Pro / iOS 26.4, existing signed-in account.
- Built and installed bundle: `com.talmeltzer.coffeehub.dev`, display name `2manybeans Dev`, Firebase `twomanybeans-ruphus-dev`, channel `dev`, updater `autoUpdate: false`, Ask Professor Ruphus label present.
- Built/installed JS hash: `b43ade95fc601daad8ce3fed6ce7d769890c1c7f8774a51dff8c3f1857115775`.

## Native journeys actually observed

| Journey | Observed result |
| --- | --- |
| “Can you suggest a unique v60 recipe for jar 2” | Brief answer and named Tetsu Kasuya 4:6 card in the same turn, for Dehong Yuan Yi Yuan. No existing V60 recipe was required. |
| View recipe | Opened recipe review, not a timer; 20 g / 300 g, 1:15, Ode 7.2, 92°C and complete pour schedule. |
| Change dose and trial | 21 g / 315 g, still 1:15; cumulative pours scaled to 53/126/189/252/315. Start brew opened the timer with those quantities. Timer was stopped without recording a physical brew or tasting. |
| Return and relaunch | Rotation → Chat and stop/launch both preserved the recipe card and Brew once receipt with “Make this my recipe.” Login was retained. |
| Save → readback → Undo | Explicit native save created only the selected Jar 2 V60 recipe at 21 g. Read-only canonical comparison detected that one changed slot. Native Undo restored its prior absence. All 57 original recipe hashes matched afterward. |
| “Cool show me a different one” | Same coffee, different named James Hoffmann One-Cup V60 card, not repeated 4:6. |
| “Actually I meant the kalita 185” | Same coffee, Onyx Monarch Wave 185 card, 20 g / 320 g. |
| “what about jar 1 on my switch 03” — final replay | Correct coffee and Switch 03 Matt Winton bloom hybrid card, 24 g / 360 mL. Review showed source preparation, open-valve bloom, valve closure and subsequent immersion steps. No automatic save or timer. |
| “why that technique” | Explanation of the open-bloom / closed-immersion / release approach; no duplicate recipe card. |
| Jar 1 Kalita 155, thin but sweet/clean, not sour | Ratio-first 1:16.5 → 1:15.5 recommendation and review card. At 13 g, displayed 202 g water; dose can be changed in review. |
| “actually it was sour” | Useful response and new review card changing Ode grind 5.6 → 5.2, keeping dose/water/temperature unchanged. No generic connection error or invented 5.5 setting. |
| Software keyboard | After correcting the simulator's per-device hardware-keyboard override, typing and sending worked. Composer was visibly above the software keyboard and the tab bar was hidden while typing. |

The trial/save/undo and first three technique journeys ran on `5608567`; the Switch, explanation, ratio and sour journeys ran on installed `cd9ecd7`. The latter changes are method binding and prompt behavior, not the action UI/persistence implementation. Final read-only comparison after all journeys: **57 original / 57 current; no changed recipe slots**.

## Failure encountered, not counted as a pass

The first live Switch correction on `5608567` returned an unavailable-source explanation with no card. Telemetry showed only an evidence read and a method-contradiction regeneration, while a read-only production-reader probe found two executable Switch 03 sources. Trusted method display had collapsed Switch into generic V60.

`cd9ecd7` preserves Switch hardware/size through method focus, retires it on an explicit classic-V60 correction, and carries the active recipe task across coffee/equipment changes. Regression tests and the final real native replay above passed. The failed original response was not deleted or concealed.

## Deterministic and rendered evidence

Final focused integration command passed **171 tests** on `cd9ecd7`:

```sh
node --test --test-reporter=dot scripts/ruphus-create-recipe-chat.test.mjs scripts/ruphus-session-write-race.test.mjs scripts/ruphus-method-resolution.test.mjs scripts/ruphus-u2-runtime.test.mjs scripts/ruphus-agent-endpoint.test.mjs scripts/ruphus-runtime-contracts.test.mjs scripts/ruphus-provider-contract.test.mjs scripts/ruphus-session-boundary.test.mjs scripts/ruphus-action-integration.test.mjs scripts/ruphus-technique-source-fidelity.test.mjs scripts/ruphus-source-journey.test.mjs scripts/ruphus-technique-runtime.test.mjs
```

- `node scripts/ruphus-chat-retry-restore.test.mjs`: actual hook/ChatTab with separate stale remote snapshot; failed turn persisted, retry affordance restored, survived re-persistence and completed on retry. Injected transport, not a native network-outage claim.
- `node scripts/verify-ruphus-agent-ui.mjs`: mobile/desktop rendering, context-free opening, hydration, injected proposal actions, lifecycle/artifacts, keyboard padding, no network writes.
- Targeted production and test ESLint, build, Dev asset copy/native build-and-run, and diff checks passed. No claim that unrelated full-repository lint is green.
- Owner/source/unsupported-target and information-only cases are deterministic evidence; the native journeys above are the real-provider evidence. They are not interchangeable.

## Preservation, cost and limits

- Final recipe comparison restored all 57 original canonical recipes. No login reset, authentication backdoor, phone interaction, production change, physical brew claim, tasting save or Capgo channel upload.
- Unrelated `ios/App/GoogleService-Info.plist` changes remain untouched. Diagnostic ledgers and report directories were neither deleted nor staged.
- Eight paid native acceptance prompts cost **$0.015512**. Cumulative testing ledger: **$48.187490 of $55**, with no remaining reservation after settlement. This is provider-test spend, not Codex subscription usage.
- The existing signed-in Dev simulator is updated. No phone update or production delivery is claimed.
- Not newly established: native network-outage injection, full accessibility audit, every possible conversation, physical-device behavior, or the owner's personal product-quality verdict. Failed-turn reload/retry has actual rendered integration proof; durable action relaunch has signed-in native proof.
