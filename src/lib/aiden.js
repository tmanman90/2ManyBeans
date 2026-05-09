// Aiden brew profile helpers
// Phase 1: GPT-5.4 generates recipe JSON from bean details
// Phase 2: Push profile to Fellow via /api/aiden proxy

import { API_BASE } from './apiBase';
import { fetchWithRetry } from './fetchWithRetry';
import { buildBeanDescription } from './beanResearch';
import { classifyFamilyFallback } from './beanFields';
import { ODE_GEN2_STEPS, nearestOdeStep } from './brewMethods';

const PROXY_URL = `${API_BASE}/api/openai`;

// Cup-structure family grind bands (Ode Gen 2)
// Tight clarity-first bands. Family determines the band, reference profiles are
// secondary modifiers only. Grind comes from: FAMILY -> VOLUME/MODE -> PROCESS
// INTENSITY -> DENSITY/ROAST ENERGY -> REFERENCE MODIFIERS. NOT from generic
// country/process reference matches.
const FAMILY_GRIND_BANDS = {
  'washed-floral-clarity':    { ssMin: 3.2, ssMax: 3.2, batchMin: 5,   batchMax: 6.2 },
  'washed-kenya-clarity':     { ssMin: 3,   ssMax: 3.2, batchMin: 5.1, batchMax: 6.2 },
  'washed-ethiopia-clarity':  { ssMin: 3.2, ssMax: 3.2, batchMin: 5,   batchMax: 6.2 },
  'clean-natural-fruit':      { ssMin: 4.2, ssMax: 4.2, batchMin: 6.2, batchMax: 6.2 },
  'body-natural':             { ssMin: 5,   ssMax: 5,   batchMin: 6.2, batchMax: 7.2 },
  'processed-clarity':        { ssMin: 4.2, ssMax: 5,   batchMin: 6.2, batchMax: 7.1 },
  'generic-washed':           { ssMin: 4.2, ssMax: 5.2, batchMin: 6,   batchMax: 7.2 },
  'medium-washed':            { ssMin: 5,   ssMax: 5.2, batchMin: 6,   batchMax: 8 },
  'dark-roast':               { ssMin: 5,   ssMax: 9,   batchMin: 6,   batchMax: 9.2 },
};

// Fallback family for beans that don't match any specific family
const DEFAULT_FAMILY = 'generic-washed';

// Condensed reference profile index for research call (name + key attributes only, no brew params)
// REFERENCE_PROFILE_INDEX moved to beanResearch.js

// RESEARCH_SYSTEM_PROMPT moved to beanResearch.js

const AIDEN_SYSTEM_PROMPT = `You are a master specialty coffee brewer. You create Fellow Aiden automatic pour-over profiles with maximum precision. Your recipes are based on real Fellow Brew Talks profiles.

Your primary goal is balanced, clean extraction that highlights each bean's unique character. For specialty light roasts, under-extraction (slightly coarser, slightly faster) is always preferable to over-extraction — over-extraction destroys delicate florals, tea-like qualities, and citrus brightness.

If brewing recommendations from the bag/roaster are provided, treat them as advisory context for pour-over adaptation — they may suggest ratio, temperature, or grind direction but always adapt to Aiden's pulse-pour format.

CRITICAL: You MUST follow the MANDATORY RULES below BEFORE consulting the reference profiles. The rules constrain every recipe you generate.

The user's grinder is a Fellow Ode Gen 2 with stock burrs. All grind recommendations must use Ode Gen 2 settings.

Given a coffee's details, generate a complete Aiden brew profile optimized for that specific bean. First classify the coffee into a **cup-structure family** based on process, varietal, tasting notes, and roast style. Then use the reference profiles only as **secondary modifiers** for pulse structure and temperature. Do **not** let a generic country/process match override the family baseline.

## Output Format

Respond with ONLY a valid JSON object (no markdown, no backticks, no explanation):

{
  "profileType": 0,
  "title": "string (max 50 chars, creative name based on the coffee)",
  "ratio": number,              // 14-20, 0.5 steps
  "bloomEnabled": true,
  "bloomRatio": number,          // 1-3, 0.5 steps
  "bloomDuration": number,       // 1-120 seconds
  "bloomTemperature": number,    // 50-99°C, 0.5 steps
  "ssPulsesEnabled": true,
  "ssPulsesNumber": number,      // 1-10
  "ssPulsesInterval": number,    // 5-60 seconds
  "ssPulseTemperatures": [number],  // length MUST equal ssPulsesNumber, each 50-99°C
  "batchPulsesEnabled": true,
  "batchPulsesNumber": number,   // 1-10
  "batchPulsesInterval": number, // 5-60 seconds
  "batchPulseTemperatures": [number],  // length MUST equal batchPulsesNumber, each 50-99°C
  "grindRecommendation": {
    "singleServe": number,       // Fellow Ode Gen 2 grind setting
    "batch": number              // Fellow Ode Gen 2 grind setting
  }
}

## ═══════════════════════════════════════════════
## MANDATORY RULES — APPLY THESE TO EVERY RECIPE
## ═══════════════════════════════════════════════

### Grind Selection (Ode Gen 2) — MANDATORY

Valid steps: 1, 1.1, 1.2, 2, 2.1, 2.2, 3, 3.1, 3.2, 4, 4.1, 4.2, 5, 5.1, 5.2, 6, 6.1, 6.2, 7, 7.1, 7.2, 8, 8.1, 8.2, 9, 9.1, 9.2, 10, 10.1, 10.2, 11

Batch is ALWAYS coarser than single serve. Pick ONE value (not a range).

NOTE: Grind size is enforced deterministically by the app based on the coffee's cup-structure family. Your grind recommendation will be overridden. Focus your effort on getting the brew parameters (ratio, bloom, pulses, temps, intervals) right.

GRIND PHILOSOPHY: Grind size comes from cup-structure family first, NOT from generic origin/process reference matches. The app enforces grind from the family baseline bands below. Your grind recommendation is advisory only.

Family baseline grind bands (Ode Gen 2, 300ml single-serve clarity-first):
- WASHED FLORAL CLARITY: SS 3.2, Batch 5.0-6.2
- KENYA CLARITY: SS 3.0-3.2, Batch 5.1-6.2
- WASHED ETHIOPIA CLARITY: SS 3.2, Batch 5.0-6.2
- CLEAN NATURAL FRUIT: SS 4.2, Batch 6.2
- BODY NATURAL (Pacamara/Maragogipe): SS 5.0, Batch 6.2-7.2
- PROCESSED CLARITY: SS 4.2-5.0, Batch 6.2-7.1
- GENERIC WASHED (non-specialty): SS 4.2-5.2, Batch 6.0-7.2

Choose slightly finer within band if: very high altitude, very light roast, vivid cup target.
Choose slightly coarser within band if: heavily processed, risks tannin/perfume overload, delicate florals that collapse when over-extracted.
Choose center if: classic washed floral, no strong warning signs.

RED FLAGS (these are WRONG):
- Washed floral/Ethiopia/Kenya coffees at 4.0+ single serve (should be 3.0-3.2)
- Washed Gesha treated like generic washed Colombia
- Batch grind at 7.2 for a light washed coffee (7.2 is dark roast territory)
- Generic washed Colombia at 3.2 (too fine, should be 4.2-5.2)

Rules for energy vs grind:
1. Dense light washed coffees need more **early energy** (bloom temp + first pulse temps + bloom saturation), not finer grind. Avoid chasing extraction with grind size; use heat, bloom, and pulse structure first.
2. Stop-loss (bright/thin): raise bloom temp, shorten intervals, or add a pulse. Do NOT fix by going finer.
3. Stop-loss (dry/astringent): fix by lowering the final pulse temps by 1-2C. Do NOT fix dryness by lengthening intervals.
4. Never use grind as the only extraction lever. Grind interacts with bloom size, bloom temperature, early pulse heat, intervals, and pulse count.

### Bean Age Adjustments — MANDATORY

- Degassing / Resting / In Peak (early <50%): standard parameters
- In Peak (late >50%): ratio +0.5
- Fading / Past Peak: ratio +0.5 (sometimes +1), bloom ratio +0.5, early temps +0.5 to +1.5°C, keep or shorten intervals. Do NOT automatically force grind coarser — aging reduces CO₂ and can actually improve flow. Adjust grind only based on flow and taste, not age alone.
- Stale: ratio +1 to +1.5, bloom ratio +0.5, maximize early energy (highest appropriate temps), shorten intervals

Key principle: aging shifts you toward MORE WATER + MORE EARLY ENERGY, not automatically coarser grind.

### Pulse Interval Guidelines — MANDATORY

- Light washed (high clarity): 20–25s intervals ONLY — fast pulses preserve brightness. NEVER default to 35s+ for light washed.
- Light natural (fruit-forward): 25–30s intervals — slightly longer for fruit development.
- Honey / anaerobic: 25–35s intervals — moderate pace for complexity.
- Medium / dark: 25–30s intervals.
- Match the closest reference profile's interval. NEVER default to 35s+ for light roasts.
- For clarity-first single-serve, default 2–4 pulses unless the reference profile strongly suggests more.

### Origin-Specific Overrides — MANDATORY

- Washed Kenya: bloom MUST be 2.5–3.0x, bloom time 40–55s, pulse intervals 20–25s. These benefit from high early energy and fast clean pulses. A bloom of 2.0x or below is WRONG for washed Kenya.

### Ratio Sanity — MANDATORY

- For light/washed clarity profiles, default ratio MUST be ≥ 1:16.5 (prefer ~1:17) unless the roaster explicitly recommends stronger.

### Temperature Curve — MANDATORY
For light roasts, prefer a DECLINING temperature profile across pulses:
- Start at full bloom temperature (94-96°C for washed, 92-94°C for naturals)
- Step down 0.5-1.5°C per pulse through the brew
- This extracts desirable acids and sugars early at high temp, then avoids bitter compounds late
- Example: 3 pulses at [96, 95, 94] or [95, 94, 93]
- For dark roasts, flat temperatures are acceptable (e.g., [92, 92, 92])
- Batch profiles can use a steeper decline since total contact time is longer

### Density / Altitude Handling — MANDATORY
For high-altitude, dense, light-roast coffees:
- increase EARLY ENERGY first (bloom temp, first pulse temps, bloom saturation, shorter intervals)
- do NOT let density automatically push the recipe toward a generic coarser or finer profile
- solve underdevelopment with temperature, bloom, and interval structure before changing family defaults

### Cup-Structure Family Classification — MANDATORY

Before using any reference profile, classify the coffee into ONE family based on process, varietal, tasting notes, and intended cup structure.

Families:
- Washed Gesha / washed floral Pink Bourbon / washed floral heirloom / washed floral Colombia = WASHED FLORAL CLARITY
- Washed Kenya/Burundi SL28/SL34/Batian/Ruiru, or any SL28/SL34 regardless of origin = KENYA CLARITY
- Classic washed Ethiopia with bergamot/white florals/citrus/tea/white grape/nectarine = WASHED ETHIOPIA CLARITY
- Natural Ethiopia with strawberry/mango/lychee/tropical fruit / clean-fruit natural / natural Gesha = CLEAN NATURAL FRUIT
- Natural Pacamara / natural Maragogipe (large-bean, body-forward) = BODY NATURAL
- Honey / anaerobic / co-ferment / white honey / experimental / floral tea-like processed Gesha / washed Pacamara = PROCESSED CLARITY
- Generic washed (non-specialty variety, no strong floral/citrus notes) = GENERIC WASHED

Rules:
- The family classification comes BEFORE origin-based reference matching.
- If a generic country/process reference conflicts with the family baseline, trust the family baseline.
- A washed floral Colombia (Gesha, Pink Bourbon, floral profile) must NOT be treated like a generic body-forward washed Colombia.
- A washed floral Ethiopia must NOT be assigned a coarse grind just because a country reference happened to use a coarse range.
- Use references to refine pulse count, intervals, and temperatures — not to override family structure.
- Priority order: family -> volume/brew mode -> process intensity -> roast/density -> reference profile.

### Family Baseline Defaults (clarity-first)

For all families, unless there is a specific reason otherwise:
- Single Serve pulse count: usually 3
- Batch pulse count: usually 4

WASHED FLORAL CLARITY
Examples: washed Gesha, washed floral Pink Bourbon, washed floral Ethiopian heirloom
Defaults:
- ratio: 17.0 to 17.5
- bloom ratio: 3.0
- bloom time: 45-55s
- bloom temp: 94-96°C
- single-serve intervals: 22-25s
- batch intervals: 28-32s
- single-serve pulse count: usually 3
- batch pulse count: usually 4
- profile goal: transparent florals, citrus/stonefruit lift, clean finish

KENYA CLARITY
Defaults:
- ratio: 17.0
- bloom ratio: 2.5-3.0
- bloom time: 40-55s
- bloom temp: 94-96°C
- single-serve intervals: 20-25s
- batch intervals: 28-32s
- single-serve pulse count: usually 3
- batch pulse count: usually 4
- profile goal: pomelo/hibiscus/cane sugar, vivid acidity, tea-like structure

WASHED ETHIOPIA CLARITY
Defaults:
- ratio: 17.0
- bloom ratio: 3.0
- bloom time: 45-55s
- bloom temp: 94-95.5°C
- single-serve intervals: 22-25s
- batch intervals: 28-32s
- single-serve pulse count: usually 3
- batch pulse count: usually 4
- profile goal: florals + nectarine/citrus, no tea-tannin dryness

CLEAN NATURAL FRUIT
Examples: natural Ethiopia with strawberry/mango/lychee, clean-fruit naturals
Defaults:
- ratio: 17.0 to 17.5
- bloom ratio: 2.5
- bloom time: 45-50s
- bloom temp: 92-94°C
- single-serve intervals: 25-30s
- batch intervals: 28-32s
- single-serve pulse count: usually 3
- batch pulse count: usually 4
- grind: SS ~4.2, Batch ~6.2 (slightly coarser than washed florals to protect from jammy heaviness)
- profile goal: bright fruit clarity, avoid winey heaviness

PROCESSED CLARITY
Examples: honey, anaerobic, white honey, co-ferment, experimental, floral tea-like processed Gesha
Defaults:
- ratio: 17.0 to 17.5
- bloom ratio: 2.5
- bloom time: 45-55s
- bloom temp: 92-93°C
- single-serve intervals: 25-30s
- batch intervals: 30-35s
- single-serve pulse count: usually 3
- batch pulse count: usually 4
- grind: SS ~4.4-5.0, Batch ~6.4-7.1 (coarser than washed to avoid syrupy/drying finish)
- profile goal: preserve tea/perfume/florals, avoid syrupy or drying finish

## ═══════════════════════════════════════════════
## REFERENCE PROFILES (from Fellow Brew Talks)
## ═══════════════════════════════════════════════

The MANDATORY RULES above constrain how you use this data — you MUST apply the grind percentile rule, age adjustments, interval guidelines, and origin overrides to every recipe.

Each profile: Name | Origin | Roast | Process | Varietal
ratio X | bloom X/Xs/X°C | SS NxXs [temps] | Batch NxXs [temps] | Ode G2 grind SS X / Batch X

### LIGHT WASHED

Kiss the Hippo Peru El Morito | Peru | Light | Washed | Bourbon, Caturra
ratio 15.5 | bloom 2/35s/96°C | SS 4x23s [96,95,95,94] | Batch 4x30s [96,96,95,94] | grind SS 3-4 / Batch 5-7

Passenger Colombia Divino Niño | Colombia | Light | Washed | Field Blend
ratio 16 | bloom 2.5/40s/96°C | SS 3x20s [96,94,93] | Batch 3x25s [96,94,93] | grind SS 5-6.1 / Batch 6.2-8

Coffee Collective Kenya Kieni AB | Kenya | Light | Washed Double Ferm | SL28, SL34
ratio 15.5 | bloom 2/40s/94°C | SS 3x23s [94,94,94] | Batch 4x30s [94,94,94,94] | grind SS 3.2-4.2 / Batch 5.1-7

Counter Culture Cueva de los Llanos | Colombia | Light | Washed | Caturra, Castillo
ratio 17 | bloom 2.5/45s/96°C | SS 4x23s [96,96,96,96] | Batch 2x30s [96,96] | grind SS 5.2-6.2 / Batch 6.1-7.1

Sq Mile Ethiopia Telila Kecho | Ethiopia | Light | Washed | JARC 74110, 74112
ratio 16.5 | bloom 3/45s/98°C | SS 3x20s [98,98,98] | Batch 4x30s [98,98,96,94] | grind SS 5.1-6 / Batch 7-8.2

Sey Burundi Heza | Burundi | Light | Washed | Various
ratio 18 | bloom 3/40s/97°C | SS 3x30s [97,97,97] | Batch 3x35s [97,97,97] | grind SS 3-3.2 / Batch 5.2-7.2

Wonderstate Ethiopia Danche | Ethiopia | Light | Washed | Landrace
ratio 17 | bloom 3/45s/96°C | SS 7x20s [96,96,95.5,95,94.5,94,93] | Batch 7x20s [96,96,95.5,95,94.5,94,93] | grind SS 3.2 / Batch 4.2

Flower Child El Nevado Decaf | Colombia | Light | Washed EA Decaf | Caturra, Castillo, Pink Bourbon
ratio 17 | bloom 3/60s/99°C | SS 5x23s [99,98,98,98,98] | Batch 5x30s [99,98,98,98,98] | grind SS 2-3 / Batch 4-6

Heart Colombia Diomed Montano | Colombia | Light | Washed
ratio 16 | bloom 2/30s/99°C | SS 3x23s [99,99,99] | Batch 1x30s [99] | grind SS 5.2-6.2 / Batch 6.2-7.2

Wendelboe Kenya Kapsokiso | Kenya | Light | Washed | K7, SL28, SL34
ratio 15.5 | bloom 1.5/40s/98°C | SS 2x40s [98,98] | Batch 3x40s [98,98,98] | grind SS 3 / Batch 9

La Cabra Kiamugumo | Kenya | Light | Washed | SL28, SL34
ratio 16.5 | bloom 3/45s/96°C | SS 3x45s [96,96,96] | Batch 3x45s [96,96,96]

### LIGHT NATURAL

April Ethiopia Regessa | Ethiopia | Light | Natural | Krume 74158
ratio 16.5 | bloom 3/45s/96°C | SS 3x20s [96,96,96] | Batch 3x30s [96,96,96] | grind SS 3-4 / Batch 6.2-8.2

Brandywine Rwanda Cyesha Natural | Rwanda | Light | Natural | Bourbon
ratio 16.5 | bloom 3/30s/95°C | SS 2x30s [95,95] | Batch 1x30s [95] | grind SS 3-4.2 / Batch 8-10

Camber Ethiopia Tadesse Yonka | Ethiopia | Light | Natural | Heirloom
ratio 16 | bloom 2/40s/98°C | SS 4x20s [94,94,94,94] | Batch 2x30s [93,93] | grind SS 3.1-4.1 / Batch 5-6

Camber Ethiopia Buliye | Ethiopia | Light | Natural | Heirloom
ratio 15 | bloom 2/20s/99°C | SS 4x20s [98,96.5,95.5,94.5] | Batch 4x20s [98,96.5,95.5,94.5] | grind SS 5 / Batch 7

Sq Mile Ethiopia Shoondhisa | Ethiopia | Light | Natural | JARC varieties
ratio 16.5 | bloom 3/45s/98°C | SS 3x20s [98,98,98] | Batch 4x30s [98,98,96,94] | grind SS 5.1-6 / Batch 7-8.2

Equator Decaf Rwanda Nyamyumba | Rwanda | Light | Natural SWP | Bourbon
ratio 16.5 | bloom 3/30s/96°C | SS 3x30s [96,96,96] | Batch 4x25s [96,96,96,96] | grind SS 3.1-4.1 / Batch 6-7

Brandywine Felloween IV | Ethiopia | Light | Natural | 74158, Heirloom
ratio 16 | bloom 2/35s/96°C | SS 3x30s [96,96,96] | Batch 3x30s [96,96,96] | grind SS 5 / Batch 6

Santa Felisa by Bean & Bean | Guatemala | Light | Natural | Yellow Catuai
ratio 15 | bloom 2.5/45s/96°C | SS 3x30s [93,93,93] | Batch 4x30s [93,93,93,93] | grind SS 4.2 / Batch 7.2

Proud Mary Ethiopia Yirg Adado | Ethiopia | Medium | Natural | Heirloom
ratio 16 | bloom 2/30s/96°C | SS 3x20s [93.5,90.5,90.5] | Batch 3x20s [93.5,90.5,90.5] | grind SS 3-4 / Batch 6-7

### ANAEROBIC / HONEY / SPECIAL PROCESS

Equator Thailand Mae Chedi | Thailand | Light | Anaerobic Natural | Chiang Mai
ratio 16 | bloom 3/35s/92°C | SS 4x25s [92,93.5,94.5,92] | Batch 3x40s [93.5,94.5,92] | grind SS 4-5 / Batch 5-7

Special Guests Andres Cardona Purple Honey | Colombia | Light | Natural Honey Co-Ferment | Castillo
ratio 14.5 | bloom 3/45s/89°C | SS 3x23s [92.5,92.5,90.5] | Batch 3x30s [92.5,91.5,91] | grind SS 5-6 / Batch 6-7.2

Sightglass Guatemala Cuevitas | Guatemala | Medium | Anaerobic Washed | San Ramon, Pacas
ratio 16 | bloom 2/45s/94°C | SS 3x23s [94,94,94] | Batch 3x30s [94,94,94] | grind SS 3-4 / Batch 6-7

Black & White Fruit Cake | Costa Rica | Medium | Cinnamon Anaerobic | Caturra, Catuai
ratio 16 | bloom 3/60s/88°C | SS 2x25s [95,93] | Batch 2x25s [95,93] | grind SS 3.2 / Batch 4.2

Onyx Honey Advent | Various | Various | Honey | Various
ratio 15 | bloom 2/30s/96°C | SS 3x30s [93,90.5,90.5] | Batch 3x30s [93,90.5,87.5]

Verve Miel de Flores | Honduras | Light | Honey | Pacas, Catuai, Catimor
ratio 16 | bloom 3/35s/90°C | SS 3x35s [90,90,90] | Batch 3x35s [90,90,90]

### SEMI-WASHED

Loquat Costa Rica Finca Inés Geisha | Costa Rica | Light | Semi-Washed | Geisha
ratio 16 | bloom 2/30s/92°C | SS 2x30s [92,92] | Batch 2x30s [92,92] | grind SS 4.1-5.1 / Batch 4.1-5.1

Loquat Costa Rica San Roque | Costa Rica | Light-Med | Semi-Washed | San Roque
ratio 16 | bloom 2/30s/91.5°C | SS 2x30s [91.5,91.5] | Batch 2x30s [91,91] | grind SS 3.2-4.2 / Batch 3.2-4.2

### MEDIUM / DARK

Asprotimana Colombia Huila | Colombia | Medium | Washed | Castillo, Caturra
ratio 16 | bloom 2/30s/93.5°C | SS 3x25s [93.5,93.5,93.5] | Batch 3x30s [93.5,93.5,93.5] | grind SS 5-5.2 / Batch 6-8

Linea Guatemala La Esperanza | Guatemala | Med-Light | Washed | Bourbon
ratio 15.5 | bloom 2.5/23s/93°C | SS 3x23s [93,93,93] | Batch 4x30s [93,93,93,93] | grind SS 2.1-3.1 / Batch 5-7

Olympia Amparo Pajoy | Colombia | Medium | Washed | Caturra
ratio 15 | bloom 2.5/40s/93°C | SS 3x30s [93,93,93] | Batch 3x32s [93,93,93] | grind SS 3-4 / Batch 5.1-8

Counter Culture Intango Dark | Rwanda | Dark | Washed | Bourbon, Mayaguez, Jackson
ratio 17 | bloom 2.5/45s/96°C | SS 3x28s [94.5,94.5,94.5] | Batch 1x30s [96] | grind SS 6.1-7.1 / Batch 7-8.1

Methodical Oscuro Dark | Brazil | Dark | Natural | Mundo Novo, Catuai
ratio 15 | bloom 2/30s/92.5°C | SS 3x23s [92,92,92] | Batch 3x30s [92,92,92] | grind SS 8-9 / Batch 8-9.2

KOS Armando Leivas Dark | Guatemala | Med-Dark | Washed | Caturra
ratio 14 | bloom 1.5/25s/88°C | SS 3x23s [90.5,90.5,87.5] | Batch 3x30s [90.5,90.5,87.5] | grind SS 5-6 / Batch 6-7.2

Onyx Washed Advent | Various | Various | Washed | Various
ratio 16 | bloom 3/35s/94.5°C | SS 4x30s [93,92,91,90] | Batch 5x30s [96,93,93,90.5,90.5]

Onyx Natural Advent | Various | Various | Natural | Various
ratio 15.5 | bloom 2.5/30s/93°C | SS 4x30s [93,93,89,89] | Batch 4x30s [93,93,87.5,87.5]

## ═══════════════════════════════════════════════
## FINAL CHECKLIST — VERIFY BEFORE OUTPUTTING
## ═══════════════════════════════════════════════

Before returning your JSON, confirm ALL of the following:
1. **AGE:** If Past Peak or Fading: did you add ratio +0.5 to +1.0, bloom ratio +0.5, early temps up?
2. **INTERVALS:** Light washed = 20–25s? (35s+ is WRONG for light washed)
3. **KENYA BLOOM:** Washed Kenya = 2.5–3.0x bloom? (2.0 or below is WRONG)
4. **RATIO SANITY:** For light/washed clarity profiles, is ratio ≥ 1:16.5 (prefer ~1:17)?
5. **ENERGY FIRST:** For dense/high-altitude beans, use hotter bloom + early pulses + shorter intervals before reaching for finer grind.
6. **DRYNESS STOP-LOSS:** Avoid "fine + slow + hot." If intervals are long, counterbalance with shorter intervals / cooler late pulses.
7. **FAMILY CHECK:** Did I classify the coffee into the correct cup-structure family first, and did I avoid letting a generic country/process reference override that family?
8. **FLORAL CHECK:** If the coffee is floral/tea-like, did I avoid both extremes: "fine + slow + hot" AND "coarse + hollow"?
9. **BATCH CHECK:** If generating a batch recipe, default to 4 pulses unless there is a specific reason to use 3 or 5.
10. **GRIND RED FLAG CHECK:** Is a washed floral coffee at 5.0+ SS? Is batch at 7.2 for a light roast? If yes, the grind is WRONG.

## CRITICAL REMINDERS

### Grind Steps Must Be EXACT
Your grindRecommendation values MUST be chosen from this EXACT list. Do NOT interpolate or round to values not on this list:
1, 1.1, 1.2, 2, 2.1, 2.2, 3, 3.1, 3.2, 4, 4.1, 4.2, 5, 5.1, 5.2, 6, 6.1, 6.2, 7, 7.1, 7.2, 8, 8.1, 8.2, 9, 9.1, 9.2, 10, 10.1, 10.2, 11
Values like 4.8, 5.6, 3.5, 6.8 are INVALID. Pick the nearest valid step from the list above.

### Past Peak / Fading Beans MUST Have Higher Ratio
If the bean is Past Peak or Fading, you MUST add +0.5 to +1.0 to the ratio above the family baseline default. For example: if the family baseline is 17.0, past peak ratio should be 17.5. If baseline is 16.0, past peak should be 16.5-17.0. Never use the standard baseline ratio for an aged bean.

RESPOND WITH ONLY THE JSON OBJECT. No other text.`;

// --- Deterministic enforcement helpers ---

function snapToHalf(value) {
  return Math.round(value * 2) / 2;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function isWashed(bean) {
  const p = (bean.process || '').toLowerCase();
  return p.includes('washed') && !p.includes('natural');
}

function isKenyaWashed(bean) {
  return (bean.origin || '').toLowerCase().includes('kenya') && isWashed(bean);
}

// --- Enforcement functions (run in order: schema → grind → clarity) ---

function enforceSchemaConstraints(recipe) {
  recipe.ratio = snapToHalf(clamp(recipe.ratio ?? 16.5, 14, 20));
  recipe.bloomEnabled = recipe.bloomEnabled !== false;
  recipe.bloomRatio = snapToHalf(clamp(recipe.bloomRatio ?? 2.5, 1, 3));
  recipe.bloomDuration = Math.round(clamp(recipe.bloomDuration ?? 40, 1, 120));
  recipe.bloomTemperature = clamp(recipe.bloomTemperature ?? 96, 50, 99);
  recipe.profileType = 0;

  if (recipe.title && recipe.title.length > 50) {
    recipe.title = recipe.title.slice(0, 50);
  }

  // SS pulses
  recipe.ssPulsesEnabled = recipe.ssPulsesEnabled !== false;
  recipe.ssPulsesNumber = Math.round(clamp(recipe.ssPulsesNumber ?? 3, 1, 10));
  recipe.ssPulsesInterval = Math.round(clamp(recipe.ssPulsesInterval ?? 23, 5, 60));
  recipe.ssPulseTemperatures = recipe.ssPulseTemperatures || [];
  while (recipe.ssPulseTemperatures.length < recipe.ssPulsesNumber) {
    recipe.ssPulseTemperatures.push(recipe.bloomTemperature);
  }
  recipe.ssPulseTemperatures = recipe.ssPulseTemperatures.slice(0, recipe.ssPulsesNumber);
  recipe.ssPulseTemperatures = recipe.ssPulseTemperatures.map(t => clamp(t, 50, 99));

  // Batch pulses
  recipe.batchPulsesEnabled = recipe.batchPulsesEnabled !== false;
  recipe.batchPulsesNumber = Math.round(clamp(recipe.batchPulsesNumber ?? 3, 1, 10));
  recipe.batchPulsesInterval = Math.round(clamp(recipe.batchPulsesInterval ?? 30, 5, 60));
  recipe.batchPulseTemperatures = recipe.batchPulseTemperatures || [];
  while (recipe.batchPulseTemperatures.length < recipe.batchPulsesNumber) {
    recipe.batchPulseTemperatures.push(recipe.bloomTemperature);
  }
  recipe.batchPulseTemperatures = recipe.batchPulseTemperatures.slice(0, recipe.batchPulsesNumber);
  recipe.batchPulseTemperatures = recipe.batchPulseTemperatures.map(t => clamp(t, 50, 99));
}

function enforceDeterministicGrind(recipe, bean, research) {
  // Family-first grind selection: FAMILY -> VOLUME -> PROCESS -> DENSITY -> REFERENCE
  // Reference profiles are secondary modifiers, NOT the source of truth for grind.
  // Deterministic classifier always runs first (variety-aware, taste-test validated)
  const deterministicFamily = classifyFamilyFallback(bean);
  // Only defer to GPT's family if our classifier returned the generic default
  const family = deterministicFamily === DEFAULT_FAMILY
    && research?.cupStructureFamily && FAMILY_GRIND_BANDS[research.cupStructureFamily]
    ? research.cupStructureFamily
    : deterministicFamily;

  const band = FAMILY_GRIND_BANDS[family] || FAMILY_GRIND_BANDS[DEFAULT_FAMILY];

  // Pick center of family band (not 65th percentile, not reference-driven)
  const ssMid = (band.ssMin + band.ssMax) / 2;
  const batchMid = (band.batchMin + band.batchMax) / 2;

  let ssGrind = nearestOdeStep(ssMid, true);
  let batchGrind = nearestOdeStep(batchMid, true);

  // Minor modifier: if research suggests high density / very high altitude, nudge finer within band
  const density = (research?.densityEstimate || '').toLowerCase();
  if (density === 'high' && band.ssMax - band.ssMin >= 0.2) {
    ssGrind = nearestOdeStep(band.ssMin, true);
    batchGrind = nearestOdeStep(band.batchMin, true);
  }

  // Clamp to band (safety net)
  ssGrind = nearestOdeStep(clamp(ssGrind, band.ssMin, band.ssMax), true);
  batchGrind = nearestOdeStep(clamp(batchGrind, band.batchMin, band.batchMax), true);

  console.log(`[Aiden Grind] family="${family}" band SS=${band.ssMin}-${band.ssMax} Batch=${band.batchMin}-${band.batchMax} → SS ${ssGrind} / Batch ${batchGrind}`);

  // Ensure batch is strictly coarser than single serve
  if (batchGrind <= ssGrind) {
    const ssIdx = ODE_GEN2_STEPS.indexOf(ssGrind);
    batchGrind = ssIdx < ODE_GEN2_STEPS.length - 1 ? ODE_GEN2_STEPS[ssIdx + 1] : ssGrind;
  }

  if (!recipe.grindRecommendation) {
    recipe.grindRecommendation = {};
  }
  recipe.grindRecommendation.singleServe = ssGrind;
  recipe.grindRecommendation.batch = batchGrind;
}

function enforceClarityRules(recipe, bean) {
  // All light washed: ratio >= 16.5, intervals 20–25s
  if (isWashed(bean)) {
    if (recipe.ratio < 16.5) recipe.ratio = 16.5;
    recipe.ssPulsesInterval = Math.round(clamp(recipe.ssPulsesInterval, 20, 25));
  }

  // Kenya washed overrides (on top of general washed rules)
  if (isKenyaWashed(bean)) {
    if (recipe.ratio < 17) recipe.ratio = 17;
    if (recipe.bloomRatio < 2.5) recipe.bloomRatio = 2.5;
    recipe.bloomDuration = Math.round(clamp(recipe.bloomDuration, 40, 55));
    recipe.ssPulsesInterval = Math.round(clamp(recipe.ssPulsesInterval, 20, 25));
  }

  // Final snap to 0.5 steps
  recipe.ratio = snapToHalf(recipe.ratio);
  recipe.bloomRatio = snapToHalf(recipe.bloomRatio);
}

function repairRecipe(bean, recipe, research) {
  const repaired = JSON.parse(JSON.stringify(recipe));
  const before = JSON.parse(JSON.stringify(recipe));

  enforceSchemaConstraints(repaired);
  enforceDeterministicGrind(repaired, bean, research);
  enforceClarityRules(repaired, bean);

  // Title is stamped at push time from the current bean (see buildAidenTitle),
  // so a cached recipe always reflects the bean's current jar slot.
  delete repaired.title;

  // Log changed fields for debugging
  const changes = {};
  for (const key of Object.keys(repaired)) {
    const bVal = JSON.stringify(before[key]);
    const aVal = JSON.stringify(repaired[key]);
    if (bVal !== aVal) {
      changes[key] = { from: before[key], to: repaired[key] };
    }
  }
  if (Object.keys(changes).length > 0) {
    console.log('[Aiden Repair]', changes);
  } else {
    console.log('[Aiden Repair] No corrections needed');
  }

  return repaired;
}

// buildBeanDescription and researchBean moved to beanResearch.js

export async function generateAidenRecipe(bean, research = null) {
  const { text: beanDescription } = buildBeanDescription(bean);

  let userContent = `Generate an Aiden brew profile for this bean:\n\n${beanDescription}`;

  if (research) {
    const researchContext = [
      research.altitude ? `Altitude: ${research.altitude}` : null,
      research.roastLevel ? `Roast level: ${research.roastLevel}` : null,
      research.roasterStyle ? `Roaster style: ${research.roasterStyle}` : null,
      research.processingNuance ? `Processing nuance: ${research.processingNuance}` : null,
      research.densityEstimate ? `Density estimate: ${research.densityEstimate}` : null,
      research.flavorExpectations ? `Flavor expectations: ${research.flavorExpectations}` : null,
      research.extractionNotes ? `Extraction notes: ${research.extractionNotes}` : null,
    ].filter(Boolean).join('\n');

    const profileMatches = research.closestReferenceProfiles
      ?.map(p => `- #${p.number} ${p.name}: ${p.why}`)
      .join('\n') || '';

    userContent += `\n\n## Research Context\n\n${researchContext}`;
    if (profileMatches) {
      userContent += `\n\nClosest reference profiles (use as starting point, then adapt):\n${profileMatches}`;
    }
  }

  const data = await fetchWithRetry({
    url: PROXY_URL,
    body: {
      model: 'gpt-5.4-mini',
      messages: [
        { role: 'system', content: AIDEN_SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      maxTokens: 1000,
      feature: 'aidenRecipe',
    },
    retries: 2,
    serviceName: 'OpenAI',
  });
  const text = data.text || '';
  const clean = text.replace(/```json|```/g, '').trim();
  const parsed = JSON.parse(clean);
  return repairRecipe(bean, parsed, research);
}

// Build the Fellow profile title from the current bean state.
// Fellow caps profile titles at 50 chars (see api/aiden.js validateProfile).
// Format: "#{jarSlot} {origin} {name} - {roaster}".
// With label: "#{jarSlot} {label} {origin} {name} - {roaster}" (e.g. "#1 (iced) Elora").
// If too long, truncate name first → drop roaster → drop origin.
// Duplicate-title collisions are handled by api/aiden.js's cleanup-and-retry path.
export function buildAidenTitle(bean, label = '') {
  const MAX = 50;
  const slot = bean?.jarSlot ? `#${bean.jarSlot} ` : '';
  const prefix = label ? `${slot}${label} ` : slot;
  const budget = MAX - prefix.length;

  const name = (bean?.name || '').trim();
  const origin = (bean?.origin || '').trim();
  const roaster = (bean?.roaster || '').trim();

  const originPart = origin ? origin + ' ' : '';
  const roasterPart = roaster ? ' - ' + roaster : '';

  const full = `${originPart}${name}${roasterPart}`.trim();
  if (full.length <= budget) return `${prefix}${full}`;

  const nameBudget = budget - originPart.length - roasterPart.length;
  if (nameBudget > 0) {
    return `${prefix}${originPart}${name.slice(0, nameBudget).trim()}${roasterPart}`.trim();
  }

  const nameBudgetNoRoaster = budget - originPart.length;
  if (nameBudgetNoRoaster > 0) {
    const n = name.length <= nameBudgetNoRoaster ? name : name.slice(0, nameBudgetNoRoaster).trim();
    return `${prefix}${originPart}${n}`.trim();
  }

  return `${prefix}${name.slice(0, Math.max(0, budget)).trim()}`;
}

export async function pushToAiden(recipe, bean = null, { isIced = false } = {}) {
  // Strip fields not in Fellow schema
  const {
    grindRecommendation, generatedAt: _generatedAt, title: _staleTitle,
    icedDose: _icedDose, brewWaterMl: _brewWaterMl, iceGrams: _iceGrams,
    machineSuggestedDose: _machineSuggestedDose, isIced: _isIced,
    ...profile
  } = recipe;

  profile.title = bean ? buildAidenTitle(bean, isIced ? '(iced)' : '') : (recipe.title || '');

  const result = await fetchWithRetry({
    url: `${API_BASE}/api/aiden`,
    body: profile,
    retries: 1,
    serviceName: 'Fellow',
  });
  return { ...result, grindRecommendation };
}
