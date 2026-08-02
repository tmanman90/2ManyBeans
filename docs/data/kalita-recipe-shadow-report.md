# Kalita shadow report — 2026-08-01

## Decision: DEV-ONLY direct candidate testing — no production cutover

The deterministic candidate is structurally gated offline and is now the automatic Kalita path in the Dev build. GPT remains an invisible fallback when evidence normalization or candidate generation fails. Shadow comparison is deferred because it is not required for this Dev test cycle. Production rollout still requires review of representative Dev brews. Iced candidate rollout remains independently deferred.

## Offline status

| Gate | Status | Evidence |
| --- | --- | --- |
| Candidate determinism | pass | `scripts/kalita-adapter.test.mjs` |
| Dose/timer/scaling/iced contract | pass | `scripts/kalita-runtime-contract.test.mjs` |
| Legacy fallback and candidate persistence boundaries | pass | `scripts/handbrew-kalita-integration.test.mjs` |
| Current GPT variance baseline | unknown | `kalita-recipe-current-baseline.json` has no reviewed capture |
| Representative blind trials | unknown | required protocol has no observations |
| Dev direct candidate test | ready | candidate default with GPT fallback |
| Hot production cutover | blocked | review Dev brew results first |
| Iced production cutover | blocked | requires separate hot/trial evidence first |

## Rollback

Restore the previous Dev deployment or temporarily gate Kalita generation back to GPT. Existing keyed and legacy hand-brew recipes remain readable because candidate metadata is additive.
