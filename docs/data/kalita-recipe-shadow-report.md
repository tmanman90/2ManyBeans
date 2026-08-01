# Kalita shadow report — 2026-08-01

## Decision: HOLD — no production cutover

The deterministic candidate is structurally gated offline, but there is no reviewed frozen current-model capture, no variance sample, and no blind-trial record yet. The default remains `kalitaRecipeEngine: legacy`; `shadow` can generate a memory-only comparator candidate without writing it to the saved recipe cache. Iced candidate cutover is independently blocked.

## Offline status

| Gate | Status | Evidence |
| --- | --- | --- |
| Candidate determinism | pass | `scripts/kalita-adapter.test.mjs` |
| Dose/timer/scaling/iced contract | pass | `scripts/kalita-runtime-contract.test.mjs` |
| Legacy fallback and non-persisted shadow candidate | pass | `scripts/handbrew-kalita-integration.test.mjs` |
| Current GPT variance baseline | unknown | `kalita-recipe-current-baseline.json` has no reviewed capture |
| Representative blind trials | unknown | required protocol has no observations |
| Hot production cutover | blocked | retain legacy default |
| Iced production cutover | blocked | requires separate hot/trial evidence first |

## Rollback

Set the preference to `legacy`. Existing keyed and legacy hand-brew recipes remain readable because the candidate metadata is additive.
