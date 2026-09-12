# Aiden conversational updates: scoped acceptance

Date: 2026-09-12. Source: `82f1af4` (implementation commits `79c41b5`, `1d080df`, `5652b8c`, `82f1af4`).

## Implemented scope

- Existing hot Aiden profiles can be proposed with a new ratio or temperature curve, reviewed as complete profiles, saved through the existing recipe command, and undone.
- Ratio uses supported half-step values; a temperature change shifts every enabled bloom/single-serve/batch temperature together and preserves the curve and pulse timing. Invalid bounds are rejected without clipping.
- Aiden chooses serving size. Manual pour-over grams/pours are not substituted for its profile. Grinder recommendations remain separate and unchanged.
- Cached Fellow links are bound to their original profile so a changed profile cannot silently reuse an old link. Saved-profile and trial preparation remain distinct actions.
- Missing profiles are reported honestly rather than becoming a tool-limit/connection error. Current explicit brewer instructions remain protected; a verified exact recipe read can replace a remembered/default brewer.

## Automated evidence

The six-file Aiden/runtime/endpoint/action matrix passed **120/120** on the final source. The new Aiden conversation suite contains 11 tests, including complete profile fields, temperature bounds, source metadata, stale Fellow links, Save/Undo, exact-read retargeting, explicit-brewer protection, and missing-profile recovery.

The recipe-first browser harness passed, including a 320px Aiden card with expanded settings, pending/historical states, and Save/Prepare/Leave actions. External writes were blocked in that harness. Targeted production ESLint and test-file ESLint passed; the JSX fixture itself is ignored by the repository lint configuration and is not claimed as linted. Dev asset build and native build/install passed; existing build warnings remain.

## Native, authenticated Dev evidence

- Device: signed-in iPhone 17 Pro simulator `7EC6BF90-33B7-4B1A-A651-464B4AC9AA9E`.
- Bundle/display: `com.talmeltzer.coffeehub.dev` / `2manybeans Dev`.
- Preview: `https://twomanybeans-ruphus-meb3wigf1-tmanman90s-projects.vercel.app`.
- Isolated Firebase: `twomanybeans-ruphus-dev`; Capgo autoUpdate false; channel dev.
- Built and installed JavaScript SHA-256 matched: `1a7cae89a7f20c74cdff292fec850be67b47791a29f1eea125ad92f907afa287`.

Observed conversation and actions:

1. “Make jar one Aiden ratio stronger”: Dev jar one has no saved Aiden profile. An early attempt failed with `tool_round_limit`; remediation returned a truthful missing-profile explanation and made no recipe change. This recovery was observed on `1d080df` and retained in the final source.
2. “Use jar two instead”: an early native follow-up exposed remembered Kalita focus overriding an exact Aiden read. After the final binding fixes, retry on `82f1af4` produced a same-response Aiden profile card with ratio **1:16 → 1:15.5**. Full bloom and single/batch curves were visible and unchanged.
3. Tapped **Save profile**. The native receipt confirmed the save; read-only cloud verification found exactly the intended Aiden slot changed among 57 recipes.
4. Stopped and relaunched only the Dev app. Login, saved card, and Undo receipt survived; the intended saved slot remained changed.
5. Tapped **Undo**. Native receipts reported restoration. Read-only comparison of the restored bean's entire Aiden profile against the applied revision's authoritative parent found **zero field differences**; the active revision source was `undo`, ratio 16.
6. “Make it two degrees cooler”: same coffee/method continued after Undo, producing a full profile card. Ratio remained 1:16. Bloom became 88°C; single-serve `[90,89.5,89]` became `[88,87.5,87]`; batch `[90,89.5,89,88.5]` became `[88,87.5,87,86.5]`. Timings and pulse counts were unchanged. Tapped **Leave unchanged**, received the unchanged receipt, and rechecked the saved profile against its parent.

### Restoration measurement caveat

The original broad checker hashes `resolveLegacyRecipe(...).recipe`, including its derived `recipeHash`. After canonical revision materialization, that resolver hashes an already-present `recipeHash`, so it reports the Aiden slot as different even after Undo. This result was not relabeled as a passing raw-hash check. All other 56 recipe hashes remained unchanged; the Aiden profile was independently compared field-for-field with its authoritative pre-apply parent and matched exactly. Normal revision/receipt history and derived metadata remain; no test ratio or temperature adjustment remains saved.

## Cost and limitations

- This scoped live work: five AI requests, **$0.009482** including the two failed discovery attempts. Cumulative ledger: **$48.242795** of the authorized $55. All reservations settled.
- No live Fellow cloud/profile preparation or physical brewing was exercised. The preparation adapter has deterministic test evidence only. No personal Fellow test profile was created.
- No production deployment, phone installation, Capgo channel change, Firebase rule change, login reset, or authentication backdoor.
- Existing uncommitted `ios/App/GoogleService-Info.plist` and all diagnostic ledgers/reports were preserved, not staged.
- This is evidence for the scoped Aiden update journey, not a universal chatbot-quality or physical-device acceptance claim.

## Local visual artifacts

These temporary captures may expire; the observed states above are the durable record.

- Ratio/full profile: `/var/folders/xx/hyp761n50hq2mw2ndtfrgs8c0000gn/T/screenshot_optimized_756e74ea-85ab-460b-af9e-172d0fcf4417.jpg`
- Save receipt: `/var/folders/xx/hyp761n50hq2mw2ndtfrgs8c0000gn/T/screenshot_optimized_e0c0b707-f2c8-456d-b54c-6d90068d85eb.jpg`
- Undo receipt: `/var/folders/xx/hyp761n50hq2mw2ndtfrgs8c0000gn/T/screenshot_optimized_18e1d538-602f-4ff9-ab59-d17313ab2bd4.jpg`
- Temperature/full profile: `/var/folders/xx/hyp761n50hq2mw2ndtfrgs8c0000gn/T/screenshot_optimized_63866b71-de28-42a6-9cb9-66af141afb45.jpg`
