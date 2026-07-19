# Parameter Inventory — Coffee Hub Brew/Tasting Logic

All refs relative to repo root `/Users/talmeltzer/Documents/VIBE CODING/Coffee-App-Build`.

---

## 1. `src/lib/aiden.js` — AIDEN_SYSTEM_PROMPT

### 1a. Family baseline defaults (src/lib/aiden.js:177-246)

| Family | ratio | bloom ratio | bloom time | bloom temp | SS interval | batch interval | SS pulse count | batch pulse count | grind (SS/Batch) | profile goal | line |
|---|---|---|---|---|---|---|---|---|---|---|---|
| WASHED FLORAL CLARITY | 17.0–17.5 | 3.0 | 45–55s | 94–96°C | 22–25s | 28–32s | 3 | 4 | n/a (see 1c) | transparent florals, citrus/stonefruit lift, clean finish | 183-194 |
| KENYA CLARITY | 17.0 | 2.5–3.0 | 40–55s | 94–96°C | 20–25s | 28–32s | 3 | 4 | n/a | pomelo/hibiscus/cane sugar, vivid acidity, tea-like structure | 196-206 |
| WASHED ETHIOPIA CLARITY | 17.0 | 3.0 | 45–55s | 94–95.5°C | 22–25s | 28–32s | 3 | 4 | n/a | florals + nectarine/citrus, no tea-tannin dryness | 208-218 |
| CLEAN NATURAL FRUIT | 17.0–17.5 | 2.5 | 45–50s | 92–94°C | 25–30s | 28–32s | 3 | 4 | SS ~4.2 / Batch ~6.2 | bright fruit clarity, avoid winey heaviness | 220-232 |
| PROCESSED CLARITY | 17.0–17.5 | 2.5 | 45–55s | 92–93°C | 25–30s | 30–35s | 3 | 4 | SS ~4.4–5.0 / Batch ~6.4–7.1 | preserve tea/perfume/florals, avoid syrupy or drying finish | 234-246 |

Global default (all families unless overridden, line 179-182): SS pulse count usually 3, batch pulse count usually 4.

### 1b. Temperature-curve mandatory rules (aiden.js:141-155)

- Declining temp profile preferred for light roasts: start at full bloom temp (94–96°C washed, 92–94°C naturals), step down **0.5–1.5°C per pulse**.
- Example declines: `[96,95,94]` or `[95,94,93]`.
- Dark roasts: flat temps acceptable, e.g. `[92,92,92]`.
- Batch profiles can use a steeper decline (longer total contact time).
- Density/altitude rule: increase early energy (bloom temp, first pulse temps, bloom saturation, shorter intervals) instead of changing grind for high-altitude/dense beans.

### 1c. FAMILY_GRIND_BANDS table (aiden.js:18-28)

| Family key | ssMin | ssMax | batchMin | batchMax |
|---|---|---|---|---|
| washed-floral-clarity | 3.2 | 3.2 | 5 | 6.2 |
| washed-kenya-clarity | 3 | 3.2 | 5.1 | 6.2 |
| washed-ethiopia-clarity | 3.2 | 3.2 | 5 | 6.2 |
| clean-natural-fruit | 4.2 | 4.2 | 6.2 | 6.2 |
| body-natural | 5 | 5 | 6.2 | 7.2 |
| processed-clarity | 4.2 | 5 | 6.2 | 7.1 |
| generic-washed | 4.2 | 5.2 | 6 | 7.2 |
| medium-washed | 5 | 5.2 | 6 | 8 |
| dark-roast | 5 | 9 | 6 | 9.2 |

`DEFAULT_FAMILY = 'generic-washed'` (aiden.js:31).

### 1d. Schema constraint ranges (aiden.js:56-73 output spec; enforced aiden.js:424-457)

| Field | Range/Step | Line |
|---|---|---|
| ratio | 14–20, 0.5 steps | 57, 425 |
| bloomRatio | 1–3, 0.5 steps | 60, 427 |
| bloomDuration | 1–120s | 61, 428 |
| bloomTemperature | 50–99°C, 0.5 steps | 61, 429 |
| ssPulsesNumber | 1–10 | 63, 438 |
| ssPulsesInterval | 5–60s | 64, 439 |
| ssPulseTemperatures | length = ssPulsesNumber, each 50–99°C | 65, 440-445 |
| batchPulsesNumber | 1–10 | 67, 449 |
| batchPulsesInterval | 5–60s | 68, 450 |
| batchPulseTemperatures | length = batchPulsesNumber, each 50–99°C | 69, 451-456 |
| title | max 50 chars | 56, 432-434 |
| Ode Gen 2 grind steps (valid) | 1, 1.1, 1.2, 2, 2.1, 2.2, ... 10, 10.1, 10.2, 11 | 82, 395 |

Defaults used when field missing (aiden.js:425-450): ratio 16.5, bloomRatio 2.5, bloomDuration 40, bloomTemperature 96, ssPulsesNumber 3, ssPulsesInterval 23, batchPulsesNumber 3, batchPulsesInterval 30.

### 1e. Other mandatory rules (non-tabular)

- Bean age adjustments (aiden.js:117-122): In Peak late (>50%) ratio +0.5; Fading/Past Peak ratio +0.5 (sometimes +1), bloom ratio +0.5, early temps +0.5 to +1.5°C; Stale ratio +1 to +1.5, bloom ratio +0.5, maximize early temps, shorten intervals.
- Pulse interval guidelines (aiden.js:126-131): light washed 20–25s; light natural 25–30s; honey/anaerobic 25–35s; medium/dark 25–30s.
- Origin override — Washed Kenya (aiden.js:135, enforced 512-518): bloom 2.5–3.0x, bloom time 40–55s, pulse intervals 20–25s.
- Ratio sanity (aiden.js:139, enforced 507-509): light/washed clarity ratio ≥ 16.5 (prefer ~17).
- Enforcement order (aiden.js:529-531): `enforceSchemaConstraints` → `enforceDeterministicGrind` → `enforceClarityRules`.
- Batch grind must be strictly coarser than SS grind (aiden.js:493-496): if not, bump to next `ODE_GEN2_STEPS` entry.

### 1f. Reference profiles — count + 8 representative examples

**Total named reference profiles: 36** (5 categories: Light Washed 11, Light Natural 9, Anaerobic/Honey/Special Process 6, Semi-Washed 2, Medium/Dark 8) — aiden.js:257-373.

| # | Name (category) | ratio | bloom | temps | grind SS/Batch | line |
|---|---|---|---|---|---|---|
| 1 | Kiss the Hippo Peru El Morito (Light Washed) | 15.5 | 2/35s/96°C | SS 4x23s [96,95,95,94] | 3-4 / 5-7 | 259-260 |
| 2 | Coffee Collective Kenya Kieni AB (Light Washed) | 15.5 | 2/40s/94°C | SS 3x23s [94,94,94] | 3.2-4.2 / 5.1-7 | 265-266 |
| 3 | Sey Burundi Heza (Light Washed) | 18 | 3/40s/97°C | SS 3x30s [97,97,97] | 3-3.2 / 5.2-7.2 | 274-275 |
| 4 | Wendelboe Kenya Kapsokiso (Light Washed) | 15.5 | 1.5/40s/98°C | SS 2x40s [98,98] | 3 / 9 | 286-287 |
| 5 | April Ethiopia Regessa (Light Natural) | 16.5 | 3/45s/96°C | SS 3x20s [96,96,96] | 3-4 / 6.2-8.2 | 294-295 |
| 6 | Special Guests Andres Cardona Purple Honey (Anaerobic/Honey) | 14.5 | 3/45s/89°C | SS 3x23s [92.5,92.5,90.5] | 5-6 / 6-7.2 | 326-327 |
| 7 | Loquat Costa Rica Finca Inés Geisha (Semi-Washed) | 16 | 2/30s/92°C | SS 2x30s [92,92] | 4.1-5.1 / 4.1-5.1 | 343-344 |
| 8 | Counter Culture Intango Dark (Medium/Dark) | 17 | 2.5/45s/96°C | SS 3x28s [94.5,94.5,94.5] | 6.1-7.1 / 7-8.1 | 360-361 |

**Section headers** (aiden.js:257, 292, 321, 341, 349): `### LIGHT WASHED`, `### LIGHT NATURAL`, `### ANAEROBIC / HONEY / SPECIAL PROCESS`, `### SEMI-WASHED`, `### MEDIUM / DARK`.

**Section count: 6 (1a family defaults × 5 families + 1e default pulse counts) / 9 grind bands / 10 schema fields / 36 reference profiles.**

---

## 2. `src/lib/handbrew.js`

### 2a. FAMILY_POUROVER_DEFAULTS — 7 families (handbrew.js:137-180)

| Family | ratio | tempC | bloom | grindDirection | technique | notes |
|---|---|---|---|---|---|---|
| washed-floral-clarity | 1:15.5–1:16 | 97-100 | 2-3x, 30-45s | finer end of pour-over range | Hoffmann classic | Push extraction for clarity. Full boil OK. |
| washed-ethiopia-clarity | 1:15.5–1:16 | 97-100 | 2-3x, 30-45s | finer end of pour-over range | Hoffmann classic | Dense, high-altitude. Needs heat. Bergamot/jasmine/citrus. |
| washed-kenya-clarity | 1:15.5–1:16 | 97-100 | 2x, 30s | finer end of pour-over range | Hoffmann classic | Bright, juicy. Blackcurrant, tomato, grapefruit. |
| clean-natural-fruit | 1:15–1:15.5 | 95-98 | 2x, 30s | slightly coarser than washed | Kasuya 4:6 | Higher solubility, gentler pours, risk of over-extraction. |
| processed-clarity | 1:15.5–1:16 | 95-98 | 2x, 30s | slightly coarser than washed | Hoffmann or Kasuya 4:6 | Honey/anaerobic. Between washed and natural. |
| medium-washed | 1:16 | 93-96 | 2x, 30s | middle of pour-over range | Hoffmann classic | Balanced extraction, good starting point. |
| dark-roast | 1:17–1:18 | 88-93 | 2x, 25s | coarser end of pour-over range | Hoffmann classic | Very porous. Low temp, coarse grind, wider ratio. |

`DEFAULT_POUROVER_FAMILY = 'medium-washed'` (handbrew.js:196).

### 2b. BREW_DEVICE_CONFIGS — 5 devices (handbrew.js:61-131)

| Device | type | grindOffset | ratioRange | tempRange | maxBrewTime | drawdownTarget | defaultTechnique | techniques |
|---|---|---|---|---|---|---|---|---|
| v60 | pourover | 0 | [15,17] | [92,100] | 240s | 2:30-3:30 | hoffmann | hoffmann, kasuya-46 |
| kalita | pourover (restrictedFlow: true) | +1.0 | [15,17] | [93,100] | 240s | 3:00-3:45 | center-pour | center-pour |
| chemex | pourover | +2 | [15,17] | [96,100] | 360s | 3:30-5:00 | hoffmann-chemex | hoffmann-chemex |
| aeropress | immersion-pressure | -1 | [10,18] | [80,100] | 210s | n/a | standard | standard, inverted, bypass |
| french-press | full-immersion | +0.5 | [13,16] | [95,100] | 720s | n/a | hoffmann-french-press | hoffmann-french-press |

filterType/drainSpeed/promptContext also defined per device (handbrew.js:65-129) — see file for full prose per device.

### 2c. IMMERSION_OVERRIDES — 2 devices (handbrew.js:183-194)

| Device | bloom | grindDirection | notes |
|---|---|---|---|
| aeropress | N/A (stir instead) | finer than pour-over (short contact time) | Short steep + pressure. Concentrate brewing works well. |
| french-press | N/A (full immersion) | medium (Hoffmann method, NOT coarse) | Full immersion. Medium grind for better extraction. Settle period replaces filter refinement. |

### 2d. GRINDER_POUROVER_STARTS — 6 grinders (handbrew.js:17-55)

| Grinder key | label | scale | pourOverStart light/medium/dark | validRange min/max | note |
|---|---|---|---|---|---|
| fellow-ode-gen2 | Fellow Ode Gen 2 | 1-11 w/ .1/.2 sub-steps | 4.5 / 5.5 / 7.0 | 4 / 8 | "Aiden light roast uses 3.1-4.0. Pour-over must be coarser (4+)." |
| fellow-opus | Fellow Opus | 1-11 dial, quarter-step clicks | 4.5 / 5.5 / 6.5 | 3 / 8.5 | — |
| baratza-encore-esp | Baratza Encore ESP | 40 steps, 1-40 | 16 / 20 / 25 | 10 / 32 | — |
| comandante-c40 | Comandante C40 MK4 | ~40 clicks, 0-40 | 22 / 28 / 32 | 18 / 38 | — |
| 1zpresso-jx-pro | 1Zpresso JX-Pro | ~200 clicks (rotation.number.tick, 1 rotation=40 clicks) | 105 / 125 / 145 | 90 / 180 | — |
| baratza-virtuoso-plus | Baratza Virtuoso+ | 40 steps, 1-40 | 15 / 20 / 25 | 10 / 32 | — |

**Section count: 7 family defaults / 5 device configs / 2 immersion overrides / 6 grinder starts = 20 parameter blocks.**

---

## 3. `src/lib/coffeeKnowledge.js`

### 3a. BREWING_KNOWLEDGE — verbatim (coffeeKnowledge.js:155-195)

```
BREWING REFERENCE (from James Hoffmann):

KEY VARIABLES:
- Coffee-to-water ratio: Pour-over 60g/L, French press 75g/L, AeroPress 75-100g/L, Espresso ~1:2 by weight
- Grind: finer = more surface area = faster extraction. Use burr grinder (not blade). Blade creates uneven particles.
- Water temp: just off boil for most methods. Espresso: 90-94C. Lighter roasts benefit from hotter water.
- Extraction target: 18-22% of ground coffee by weight.

GRIND SIZE BY METHOD:
- French press: medium (caster/superfine sugar)
- Pour-over: medium (adjust by batch size)
- AeroPress: fine to medium
- Moka pot: fine (not espresso-fine)
- Espresso: very fine (tiny changes matter)

WATER QUALITY:
- Water is 98.5% of filter coffee, ~90% of espresso
- Hard water = cups lacking nuance/sweetness/complexity
- Chlorinated water = terrible coffee. Use carbon filter.
- Soft to moderate hardness ideal.

METHOD GUIDANCE:
- French Press: 75g/L, medium grind, steep 4 min, stir crust, skim foam, wait 5 more min, pour slowly. Heavy body.
- Pour-Over: 60g/L, medium grind, rinse paper filter, bloom 2x coffee weight 30 sec, pour slowly. Clean, clear cup.
- AeroPress: 75-100g/L, steep 1 min then press. Versatile. Easy clean, portable.
- Espresso: 18g in, ~36g out, 27-29 sec, 9 bars. Invest in grinder before machine. Always adjust grind first.
- Electric Drip: 60g/L, medium grind. Most home machines don't heat water to correct temperature. Buy SCAA or ECBC certified machines. Avoid machines with hot plates (cooks the coffee). Use thermal carafe instead. Brew at least 500ml for best results.

STORAGE:
- Airtight, dark, never refrigerate
- Buy within 2 weeks of roast, use within 1 month
- Whole beans, grind just before brewing
- Freeze for long-term (defrost fully before use)
- Espresso: rest 5-20 days. Filter: 2-3 days minimum.

MILK:
- Steam to 60-68C max. Above this, proteins denature.
- Whole milk recommended (fat adds texture, makes flavors linger)
- Microfoam = tiny invisible bubbles, elastic, pourable
```

### 3b. BREW_TROUBLESHOOTING_RULES — verbatim (coffeeKnowledge.js:266-282)

```
Brew troubleshooting (apply per brewer):
- Sour / bright / sharp: grind finer; or on Aiden, raise bloom temperature or
  add a pulse; on hand-brew, raise water temp or extend bloom.
- Bitter / harsh / astringent: grind coarser; or on Aiden, lower the final
  pulse temperatures 1-2C; on hand-brew, lower water temp or shorten
  contact.
- Stalled / choked pour-over (water pooling, drawdown way past target —
  V60 2:30-3:30, Kalita 3:00-3:45, Chemex 3:30-5:00): grind coarser 0.5-1
  step. Dense light washed beans on a flat-bed (Kalita) are the classic
  case — never fix a stall by pouring slower or grinding finer.
- Weak / watery / thin: higher dose (stronger ratio, e.g. 1:16 instead of
  1:17).
- Cup is fine: keep the current recipe.
Always cite the direction in words (finer/coarser) AND the new number on the
user's specific grinder from the GRINDERS block. Never invert direction.
```

### 3c. GRINDER_KNOWLEDGE — per-grinder table (coffeeKnowledge.js:230-261)

| Grinder | Direction convention | Micron calibration | Pour-over range | Light/Med/Dark start |
|---|---|---|---|---|
| Fellow Ode Gen 2 | lower number = finer | ~275µm at 1, ~88µm per whole number (5≈630, 6≈720, 7≈805µm) | ~4-6 (V60) | ~4.5 light. Flat-bed (Kalita) runs coarser: 5.5-6.5 light. Aiden light uses 3.1-4.0 (too fine for manual pour-over). |
| Fellow Opus | lower number = finer | ~230µm at 1, ~93µm per whole number | ~3-8.5 | ~4.5 light |
| Baratza Encore ESP | lower number = finer | ~29µm per step | 16-30 | 16 / 20 / 25 |
| Comandante C40 MK4 | more clicks = coarser | ~30µm per click | 18-38 | 22 / 28 / 32 |
| 1Zpresso JX-Pro | more clicks = coarser | ~4.6µm per click | 90-180 | 105 / 125 / 145 |
| Baratza Virtuoso+ | lower number = finer | ~25µm per step | 10-32 | 15 / 20 / 25 |
| Other/custom | electric = lower finer; manual = more clicks coarser | confirm user's direction convention first | — | — |

Trailing rule (coffeeKnowledge.js:258-260): grinder settings are starting points — Fellow ships burrs aligned 5 clicks after chirp; self-calibrated units read up to half a number different; correct by drawdown time and taste.

### 3d. HANDBREW_POUROVER_KNOWLEDGE — verbatim (coffeeKnowledge.js:299-320)

```
POUR-OVER METHODOLOGY (from James Hoffmann):
- Rinse paper filter under hot water (reduces paper taste, warms device). Use bleached white papers.
- Bloom: Pour ~2x coffee weight in water. Pick up and swirl or stir to wet all grounds. Wait 30 seconds.
- Slowly pour remainder of water directly onto coffee bed (NOT the walls). Weigh as you go.
- When surface is 2-3cm below top, give gentle swirl (prevents grounds sticking to walls).
- Diagnostic: flat, even bed = good extraction. Sloped/cratered bed = channeling (pour more evenly).
- Troubleshooting: Bitter = grind coarser. Sour/weak/astringent = grind finer. Change ONE variable at a time.
- Drawdown diagnostics: stalled bed / water pooling / drawdown far past the device target = grind coarser 0.5-1 step, NOT a slower pour. Racing under target = grind finer.
- Flat-bed brewers (Kalita): the device restricts flow, so grind coarser than V60 and recover extraction with hotter water and a swirl. Dense light washed beans shed fines that clog the flat bed if ground fine.

EXTRACTION SCIENCE:
- Target: 18-22% extraction of ground coffee by weight.
- Under-extracted: sour, sharp, lacking sweetness. Fix: grind finer, brew longer, hotter water.
- Over-extracted: bitter, harsh, astringent. Fix: grind coarser, brew shorter, cooler water.
- Finer grind = more extraction per unit time AND slower flow rate (double effect).
- Stirring/agitation increases extraction. Pour-over: gentle swirl after pours.

WATER:
- Water is 98.5% of filter coffee by volume. It matters.
- Hard water = cups lacking nuance and sweetness. Soft to moderate ideal.
```

### 3e. Other exported knowledge constants (1-line description each)

| Export | Line | Description |
|---|---|---|
| `TASTING_KNOWLEDGE` | 6-58 | Hoffmann tasting-skill reference (how tasting works, attributes, flavor categories, origin/process/roast/altitude tendencies, brewing troubleshooting) — injected into tasting chat system prompt. |
| `RUPHUS_KNOWLEDGE` | 62-112 | Hoffmann coffee-knowledge reference (arabica vs robusta, varieties, processing methods, roasting stages/chemistry, harvesting, grading, trading) — for Professor Ruphus stories. |
| `ORIGIN_PROFILES` | 116-151 | Object of 32 origin-country prose blurbs (region/variety/flavor notes) keyed by country name, used to contextualize beans by origin. |
| `FELLOW_AIDEN_KNOWLEDGE` | 202-214 | Prose explaining the Aiden's automated pulse-pour parameters and what's adjustable vs. automated. |
| `HANDBREW_BREWER_KNOWLEDGE` | 216-223 | Prose explaining manual hand-brew (V60/Kalita/Chemex) adjustable parameters. |
| `getOriginContext(origin)` | 285-294 | Function (not constant) — fuzzy-matches an origin string against `ORIGIN_PROFILES` and returns the blurb. |

**Section count: 2 verbatim blocks + 1 per-grinder table (6 grinders + 1 "other" row) + 1 verbatim pour-over block + 6 other exports.**

---

## 4. `src/lib/peakStatus.js` and `src/lib/roasterProfiles.js` — degas/peak windows

### 4a. ROAST_STYLE_CATEGORIES (roasterProfiles.js:3-9)

| Style key | degasMin | degasMax | peakStart | peakEnd | Label |
|---|---|---|---|---|---|
| nordic-ultra-light | 10 | 14 | 21 | 60 | Nordic / Ultra-Light |
| specialty-light | 7 | 14 | 14 | 60 | Specialty Light |
| medium | 5 | 10 | 10 | 45 | Medium |
| dark | 3 | 7 | 7 | 30 | Dark |
| extended-rest | 35 | 45 | 60 | 90 | Extended Rest |

`DEFAULT_PROFILE` (roasterProfiles.js:94-98): degasMin 7, degasMax 14, peakStart 14, peakEnd 60 ("Specialty Light (default)").

Roasters are mapped 1:1 to a style key via `ROASTER_STYLE_MAP` (roasterProfiles.js:12-78; ~60 roasters across the 5 style buckets) — window numbers are inherited from the table above, not set per-roaster.

Fuzzy-match threshold (roasterProfiles.js:163): `bestScore >= 60` required to accept a fuzzy roaster-name match; else falls back to inferred-from-roastLevel or `DEFAULT_PROFILE`.

### 4b. peakStatus.js status thresholds (not per-roaster; derived from the roaster's degasMin/peakStart/peakEnd)

| Status | Condition | Line |
|---|---|---|
| Degassing | `days < bean.degasMin` | 67 |
| Resting | `days < bean.peakStart` | 68 |
| In Peak (X%) | `days <= peak` (peak = `effectivePeakEnd`) | 69-71 |
| Fading (+Xd) | `over <= 14` where `over = days - peak` | 74 |
| Past Peak (+Xd) | `over <= 30` | 75 |
| Stale (+Xd) | `over > 30` | 76 |

`effectivePeakEnd(bean)` = `bean.shelfLifeOverride ?? bean.peakEnd` (peakStatus.js:37).
`parseShelfLifeDays` caps override at 730 days (peakStatus.js:39-50).

**Section count: 5 roast-style rows + 1 default profile + 6 status thresholds = 12 numeric parameters.**
