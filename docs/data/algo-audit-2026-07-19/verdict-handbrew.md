# Codex verdict: hand-brew algorithm (gpt-5.6-sol, effort high, 2026-07-19)

Scope: FAMILY_POUROVER_DEFAULTS, BREW_DEVICE_CONFIGS, IMMERSION_OVERRIDES, flashBrewTransform. Grind dial/micron calibration out of scope (fixed separately same day).

| parameter | app value | verdict | severity |
|---|---|---|---|
| Washed clarity ratios | 1:15.5-1:16 | VALIDATED | low |
| Washed clarity temps | 97-100C | ADJUST -> 95-100C Hoffmann; 93C for 4:6 | med |
| Washed clarity blooms | 2-3x, 30-45s | VALIDATED | low |
| Clean-natural ratio | 1:15-1:15.5 | CONFLICTING (stronger sources 1:16-1:16.5) | med |
| Clean-natural temp/bloom w/ 4:6 | 95-98C; 2x/30s | ADJUST -> published 4:6 variant: 93C, defined pour splits, ~30s/dry-bed | high |
| Processed-clarity ratio | 1:15.5-1:16 | VALIDATED | low |
| Processed-clarity temp/bloom | 95-98C; 2x/30s | ADJUST -> technique-specific (Hoffmann 95-100C 2x/45s; 4:6 93C) | high |
| Medium-washed | 1:16; 93-96C; 2x/30s | VALIDATED | low |
| Dark-roast ratio | 1:17-1:18 | ADJUST -> 1:15-1:16 | high |
| Dark-roast temp | 88-93C | ADJUST -> 88-91C | med |
| Dark-roast bloom | 2x, 25s | VALIDATED | low |
| Family->technique mapping | washed/dark Hoffmann; natural 4:6 | UNVERIFIED | med |
| Hoffmann technique block | bloom, 2-3 pours, swirl, 2:30-3:30 | VALIDATED | low |
| Kasuya block | 5 pours at 45s, coarse | ADJUST -> 4/5-pour variants, ~30s or dry-bed, medium-coarse, 93C | high |
| Washed family notes | dense needs heat etc. | UNVERIFIED | low |
| Natural/processed notes | fruit-sugar solubility etc. | UNVERIFIED | low |
| Dark notes | porous; wider ratio | ADJUST -> drop "wider ratio" | med |
| **Family temp application** | **family tempC replaced by device tempRange (handbrew.js:206-208)** | **ADJUST -> intersect family band with device limits — all 7 family temp bands currently INERT** | **high** |
| V60 ratio range | 1:15-1:17 | VALIDATED | low |
| V60 temp range | 92-100C | ADJUST -> 93-100C | med |
| V60 time window | 2:30-3:30, max 4:00 | CONFLICTING (Fellow Regessa 4:00-5:00) | med |
| Kalita ratio/temp/technique | 1:15-1:17; 93-100C; center-pour | UNVERIFIED | med |
| Kalita brew time | 3:00-3:45 | VALIDATED | low |
| Chemex ratio | 1:15-1:17 | VALIDATED | low |
| Chemex temp/rationale | 96-100C | UNVERIFIED | med |
| Chemex time/technique | 3:30-5:00 | UNVERIFIED | med |
| AeroPress ratio range | 1:10-1:18 all modes | ADJUST -> mode-specific; permit ~1:6 concentrate for bypass | high |
| AeroPress temp range | 80-100C | UNVERIFIED | med |
| AeroPress timing | 1-2min etc. | UNVERIFIED | low |
| French press ratio range | 1:13-1:16 | ADJUST -> 1:13.3-1:16.7 (include Hoffmann 60g/L) | med |
| French press temp | 95-100C | VALIDATED | low |
| French press timing/technique | 4min steep, break/skim, settle, no plunge | VALIDATED | low |
| AeroPress immersion override | no bloom, stir | UNVERIFIED | low |
| French press immersion override | medium grind, settle | VALIDATED | low |
| Flash-brew ice split | 40% ice / 60% hot | VALIDATED (matches Hoffmann/Japanese iced) | low |
| Flash-brew +1C bump | +1C cap 99 | UNVERIFIED | med |
| Flash-brew finer grind | 1-1.5 steps | UNVERIFIED (direction supported, magnitude not) | med |
| Aiden iced water/ice math | dose x10 hot, x6.8 ice | VALIDATED (59.5/40.5 split) | low |
| Aiden iced forced ratio: 14 | UNVERIFIED (neither hot 1:10 nor total 1:16.8) | | med |

Top 5 (Codex): (1) family temp bands bypassed by device override; (2) Kasuya 4:6 not faithful; (3) dark-roast ratio reversed vs evidence; (4) AeroPress modes compressed; (5) French press ceiling excludes Hoffmann's own ratio.
