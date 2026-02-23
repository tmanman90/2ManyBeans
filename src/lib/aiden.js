// Aiden brew profile helpers
// Phase 1: Claude generates recipe JSON from bean details
// Phase 2: Push profile to Fellow via /api/aiden proxy

import { getPeakStatus, daysSinceRoast } from './peakStatus';
import { getProfileForRoaster } from './roasterProfiles';

const PROXY_URL = '/api/claude';

// Valid Fellow Ode Gen 2 grind steps (31 positions)
const ODE_GEN2_STEPS = [
  1, 1.1, 1.2, 2, 2.1, 2.2, 3, 3.1, 3.2, 4, 4.1, 4.2,
  5, 5.1, 5.2, 6, 6.1, 6.2, 7, 7.1, 7.2, 8, 8.1, 8.2,
  9, 9.1, 9.2, 10, 10.1, 10.2, 11,
];

// Structured grind data keyed by reference profile number (matches REFERENCE_PROFILE_INDEX)
// Profiles 11, 25, 26 have no grind data in reference → grind: null
const REFERENCE_GRIND_DATA = {
  1:  { name: 'Kiss the Hippo Peru El Morito', origin: 'Peru', process: 'Washed', grind: { ssMin: 3, ssMax: 4, batchMin: 5, batchMax: 7 } },
  2:  { name: 'Passenger Colombia Divino Niño', origin: 'Colombia', process: 'Washed', grind: { ssMin: 5, ssMax: 6.1, batchMin: 6.2, batchMax: 8 } },
  3:  { name: 'Coffee Collective Kenya Kieni AB', origin: 'Kenya', process: 'Washed', grind: { ssMin: 3.2, ssMax: 4.2, batchMin: 5.1, batchMax: 7 } },
  4:  { name: 'Counter Culture Cueva de los Llanos', origin: 'Colombia', process: 'Washed', grind: { ssMin: 5.2, ssMax: 6.2, batchMin: 6.1, batchMax: 7.1 } },
  5:  { name: 'Sq Mile Ethiopia Telila Kecho', origin: 'Ethiopia', process: 'Washed', grind: { ssMin: 5.1, ssMax: 6, batchMin: 7, batchMax: 8.2 } },
  6:  { name: 'Sey Burundi Heza', origin: 'Burundi', process: 'Washed', grind: { ssMin: 3, ssMax: 3.2, batchMin: 5.2, batchMax: 7.2 } },
  7:  { name: 'Wonderstate Ethiopia Danche', origin: 'Ethiopia', process: 'Washed', grind: { ssMin: 3.2, ssMax: 3.2, batchMin: 4.2, batchMax: 4.2 } },
  8:  { name: 'Flower Child El Nevado Decaf', origin: 'Colombia', process: 'Washed', grind: { ssMin: 2, ssMax: 3, batchMin: 4, batchMax: 6 } },
  9:  { name: 'Heart Colombia Diomed Montano', origin: 'Colombia', process: 'Washed', grind: { ssMin: 5.2, ssMax: 6.2, batchMin: 6.2, batchMax: 7.2 } },
  10: { name: 'Wendelboe Kenya Kapsokiso', origin: 'Kenya', process: 'Washed', grind: { ssMin: 3, ssMax: 3, batchMin: 9, batchMax: 9 } },
  11: { name: 'La Cabra Kiamugumo', origin: 'Kenya', process: 'Washed', grind: null },
  12: { name: 'April Ethiopia Regessa', origin: 'Ethiopia', process: 'Natural', grind: { ssMin: 3, ssMax: 4, batchMin: 6.2, batchMax: 8.2 } },
  13: { name: 'Brandywine Rwanda Cyesha Natural', origin: 'Rwanda', process: 'Natural', grind: { ssMin: 3, ssMax: 4.2, batchMin: 8, batchMax: 10 } },
  14: { name: 'Camber Ethiopia Tadesse Yonka', origin: 'Ethiopia', process: 'Natural', grind: { ssMin: 3.1, ssMax: 4.1, batchMin: 5, batchMax: 6 } },
  15: { name: 'Camber Ethiopia Buliye', origin: 'Ethiopia', process: 'Natural', grind: { ssMin: 5, ssMax: 5, batchMin: 7, batchMax: 7 } },
  16: { name: 'Sq Mile Ethiopia Shoondhisa', origin: 'Ethiopia', process: 'Natural', grind: { ssMin: 5.1, ssMax: 6, batchMin: 7, batchMax: 8.2 } },
  17: { name: 'Equator Decaf Rwanda Nyamyumba', origin: 'Rwanda', process: 'Natural', grind: { ssMin: 3.1, ssMax: 4.1, batchMin: 6, batchMax: 7 } },
  18: { name: 'Brandywine Felloween IV', origin: 'Ethiopia', process: 'Natural', grind: { ssMin: 5, ssMax: 5, batchMin: 6, batchMax: 6 } },
  19: { name: 'Santa Felisa by Bean & Bean', origin: 'Guatemala', process: 'Natural', grind: { ssMin: 4.2, ssMax: 4.2, batchMin: 7.2, batchMax: 7.2 } },
  20: { name: 'Proud Mary Ethiopia Yirg Adado', origin: 'Ethiopia', process: 'Natural', grind: { ssMin: 3, ssMax: 4, batchMin: 6, batchMax: 7 } },
  21: { name: 'Equator Thailand Mae Chedi', origin: 'Thailand', process: 'Anaerobic Natural', grind: { ssMin: 4, ssMax: 5, batchMin: 5, batchMax: 7 } },
  22: { name: 'Special Guests Andres Cardona Purple Honey', origin: 'Colombia', process: 'Natural Honey', grind: { ssMin: 5, ssMax: 6, batchMin: 6, batchMax: 7.2 } },
  23: { name: 'Sightglass Guatemala Cuevitas', origin: 'Guatemala', process: 'Anaerobic Washed', grind: { ssMin: 3, ssMax: 4, batchMin: 6, batchMax: 7 } },
  24: { name: 'Black & White Fruit Cake', origin: 'Costa Rica', process: 'Anaerobic', grind: { ssMin: 3.2, ssMax: 3.2, batchMin: 4.2, batchMax: 4.2 } },
  25: { name: 'Onyx Honey Advent', origin: 'Various', process: 'Honey', grind: null },
  26: { name: 'Verve Miel de Flores', origin: 'Honduras', process: 'Honey', grind: null },
  27: { name: 'Loquat Costa Rica Finca Inés Geisha', origin: 'Costa Rica', process: 'Semi-Washed', grind: { ssMin: 4.1, ssMax: 5.1, batchMin: 4.1, batchMax: 5.1 } },
  28: { name: 'Loquat Costa Rica San Roque', origin: 'Costa Rica', process: 'Semi-Washed', grind: { ssMin: 3.2, ssMax: 4.2, batchMin: 3.2, batchMax: 4.2 } },
  29: { name: 'Asprotimana Colombia Huila', origin: 'Colombia', process: 'Washed', grind: { ssMin: 5, ssMax: 5.2, batchMin: 6, batchMax: 8 } },
  30: { name: 'Linea Guatemala La Esperanza', origin: 'Guatemala', process: 'Washed', grind: { ssMin: 2.1, ssMax: 3.1, batchMin: 5, batchMax: 7 } },
  31: { name: 'Olympia Amparo Pajoy', origin: 'Colombia', process: 'Washed', grind: { ssMin: 3, ssMax: 4, batchMin: 5.1, batchMax: 8 } },
  32: { name: 'Counter Culture Intango Dark', origin: 'Rwanda', process: 'Washed', grind: { ssMin: 6.1, ssMax: 7.1, batchMin: 7, batchMax: 8.1 } },
  33: { name: 'Methodical Oscuro Dark', origin: 'Brazil', process: 'Natural', grind: { ssMin: 8, ssMax: 9, batchMin: 8, batchMax: 9.2 } },
  34: { name: 'KOS Armando Leivas Dark', origin: 'Guatemala', process: 'Washed', grind: { ssMin: 5, ssMax: 6, batchMin: 6, batchMax: 7.2 } },
};

// Condensed reference profile index for research call (name + key attributes only, no brew params)
const REFERENCE_PROFILE_INDEX = `
1. Kiss the Hippo Peru El Morito — Peru, Light, Washed, Bourbon/Caturra
2. Passenger Colombia Divino Niño — Colombia, Light, Washed, Field Blend
3. Coffee Collective Kenya Kieni AB — Kenya, Light, Washed Double Ferm, SL28/SL34
4. Counter Culture Cueva de los Llanos — Colombia, Light, Washed, Caturra/Castillo
5. Sq Mile Ethiopia Telila Kecho — Ethiopia, Light, Washed, JARC 74110/74112
6. Sey Burundi Heza — Burundi, Light, Washed, Various
7. Wonderstate Ethiopia Danche — Ethiopia, Light, Washed, Landrace
8. Flower Child El Nevado Decaf — Colombia, Light, Washed EA Decaf, Caturra/Castillo/Pink Bourbon
9. Heart Colombia Diomed Montano — Colombia, Light, Washed
10. Wendelboe Kenya Kapsokiso — Kenya, Light, Washed, K7/SL28/SL34
11. La Cabra Kiamugumo — Kenya, Light, Washed, SL28/SL34
12. April Ethiopia Regessa — Ethiopia, Light, Natural, Krume 74158
13. Brandywine Rwanda Cyesha Natural — Rwanda, Light, Natural, Bourbon
14. Camber Ethiopia Tadesse Yonka — Ethiopia, Light, Natural, Heirloom
15. Camber Ethiopia Buliye — Ethiopia, Light, Natural, Heirloom
16. Sq Mile Ethiopia Shoondhisa — Ethiopia, Light, Natural, JARC varieties
17. Equator Decaf Rwanda Nyamyumba — Rwanda, Light, Natural SWP, Bourbon
18. Brandywine Felloween IV — Ethiopia, Light, Natural, 74158/Heirloom
19. Santa Felisa by Bean & Bean — Guatemala, Light, Natural, Yellow Catuai
20. Proud Mary Ethiopia Yirg Adado — Ethiopia, Medium, Natural, Heirloom
21. Equator Thailand Mae Chedi — Thailand, Light, Anaerobic Natural, Chiang Mai
22. Special Guests Andres Cardona Purple Honey — Colombia, Light, Natural Honey Co-Ferment, Castillo
23. Sightglass Guatemala Cuevitas — Guatemala, Medium, Anaerobic Washed, San Ramon/Pacas
24. Black & White Fruit Cake — Costa Rica, Medium, Cinnamon Anaerobic, Caturra/Catuai
25. Onyx Honey Advent — Various, Various, Honey, Various
26. Verve Miel de Flores — Honduras, Light, Honey, Pacas/Catuai/Catimor
27. Loquat Costa Rica Finca Inés Geisha — Costa Rica, Light, Semi-Washed, Geisha
28. Loquat Costa Rica San Roque — Costa Rica, Light-Med, Semi-Washed, San Roque
29. Asprotimana Colombia Huila — Colombia, Medium, Washed, Castillo/Caturra
30. Linea Guatemala La Esperanza — Guatemala, Med-Light, Washed, Bourbon
31. Olympia Amparo Pajoy — Colombia, Medium, Washed, Caturra
32. Counter Culture Intango Dark — Rwanda, Dark, Washed, Bourbon/Mayaguez/Jackson
33. Methodical Oscuro Dark — Brazil, Dark, Natural, Mundo Novo/Catuai
34. KOS Armando Leivas Dark — Guatemala, Med-Dark, Washed, Caturra
`.trim();

const RESEARCH_SYSTEM_PROMPT = `You are a specialty coffee expert with deep knowledge of origins, roasters, processing methods, and extraction science. Given a coffee's details, research and analyze the bean using your knowledge.

Respond with ONLY a valid JSON object (no markdown, no backticks, no explanation):

{
  "altitude": "estimated masl range (e.g. '1800-2100 masl')",
  "roastLevel": "ultra-light | light | light-medium | medium | medium-dark | dark",
  "roasterStyle": "brief description of this roaster's typical approach and philosophy",
  "processingNuance": "expanded processing details relevant to extraction",
  "densityEstimate": "high | medium | low (based on altitude, variety, and roast)",
  "flavorExpectations": "what flavors to optimize for in brewing",
  "extractionNotes": "practical brewing implications (water temp, grind, timing considerations)",
  "closestReferenceProfiles": [
    { "number": 1, "name": "profile name", "why": "brief reason this is a close match" }
  ]
}

For closestReferenceProfiles, select the 2-3 most similar profiles from the reference database below. Match on origin, process, roast level, and varietal similarity.

## Reference Profile Database

${REFERENCE_PROFILE_INDEX}

RESPOND WITH ONLY THE JSON OBJECT. No other text.`;

const AIDEN_SYSTEM_PROMPT = `You are a master specialty coffee brewer. You create Fellow Aiden automatic pour-over profiles with maximum precision. Your recipes are based on real Fellow Brew Talks profiles.

Your primary goal is balanced, clean extraction that highlights each bean's unique character. For specialty light roasts, under-extraction (slightly coarser, slightly faster) is always preferable to over-extraction — over-extraction destroys delicate florals, tea-like qualities, and citrus brightness.

CRITICAL: You MUST follow the MANDATORY RULES below BEFORE consulting the reference profiles. The rules constrain every recipe you generate.

The user's grinder is a Fellow Ode Gen 2 with stock burrs. All grind recommendations must use Ode Gen 2 settings.

Given a coffee's details, generate a complete Aiden brew profile optimized for that specific bean. Reason about the coffee's process, roast level, origin, and varietal to pick the best parameters. Use the reference profiles below to guide your decisions — find the closest match and adapt.

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

Rules — you MUST follow ALL of these:
1. Find the closest reference profile's grind range for single serve.
2. ALWAYS default to the UPPER-MIDDLE of that range (60–70th percentile) for clarity. When converting the percentile into an Ode Gen 2 setting, choose the nearest valid step; if exactly between steps, ALWAYS round coarser (clarity bias).
3. NEVER go finer than the range floor unless there's a specific reason (e.g., dark roast).
4. Dense light washed coffees often require more **early energy** (bloom temp + first pulse temps + bloom saturation), not finer grind. Avoid chasing extraction with grind size; use heat, bloom, and pulse structure first.
5. Washed Kenya (often SL28/SL34) can produce fines; avoid too-fine defaults that increase haze/tannins and reduce note separation.
6. Stop-loss (bright/thin): raise bloom temp, shorten intervals, or add a pulse — NEVER fix by going finer. Only go finer after energy/structure changes fail.
7. Stop-loss (dry/astringent): if a brew would taste drying/astringent, fix by +0.1 coarser OR lowering the final pulse temps by 1–2°C. Do NOT fix dryness by lengthening intervals.

**WORKED EXAMPLE — Kenya washed (SL28/SL34), closest match Coffee Collective Kenya Kieni AB:**
- Reference grind range SS: 3.2–4.2
- 60–70th percentile of 3.2–4.2 = 3.8–3.9 area → nearest valid Ode steps are 4.0 or 4.1
- Correct SS grind: **4.0 or 4.1** ← this is what you MUST pick
- WRONG: 3.0, 3.1, 3.2 (these are at or below the range floor — NEVER pick these)
- Batch grind: similarly upper-middle of 5.1–7 → 6.1 or 6.2

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
1. **GRIND:** Is single-serve grind at the 60–70th percentile of the reference range? (e.g., range 3.2–4.2 → 4.0 or 4.1, NOT 3.0/3.1/3.2)
2. **AGE:** If Past Peak or Fading: did you add ratio +0.5 to +1.0, bloom ratio +0.5, early temps up?
3. **INTERVALS:** Light washed = 20–25s? (35s+ is WRONG for light washed)
4. **KENYA BLOOM:** Washed Kenya = 2.5–3.0x bloom? (2.0 or below is WRONG)
5. **RATIO SANITY:** For light/washed clarity profiles, is ratio ≥ 1:16.5 (prefer ~1:17)?
6. **DRYNESS STOP-LOSS:** Avoid "fine + slow + hot." If grind is toward the fine end OR intervals are long, counterbalance with coarser grind / shorter intervals / cooler late pulses.

RESPOND WITH ONLY THE JSON OBJECT. No other text.`;

// --- Deterministic enforcement helpers ---

function nearestOdeStep(target, preferCoarser = true) {
  let closest = ODE_GEN2_STEPS[0];
  let minDist = Math.abs(target - closest);
  for (const step of ODE_GEN2_STEPS) {
    const dist = Math.abs(target - step);
    if (dist < minDist || (dist === minDist && preferCoarser && step > closest)) {
      closest = step;
      minDist = dist;
    }
  }
  return closest;
}

function pickUpperMiddle(min, max) {
  const target = min + (max - min) * 0.65;
  return nearestOdeStep(target, true);
}

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

function chooseReferenceForBean(bean, research) {
  // Try research.closestReferenceProfiles first
  if (research?.closestReferenceProfiles) {
    for (const ref of research.closestReferenceProfiles) {
      const entry = REFERENCE_GRIND_DATA[ref.number];
      if (entry?.grind) return entry;
    }
  }

  // Fallback: heuristic match on origin + process
  const beanOrigin = (bean.origin || '').toLowerCase();
  const beanProcess = (bean.process || '').toLowerCase();

  // First try: match both origin and process type
  for (const key of Object.keys(REFERENCE_GRIND_DATA)) {
    const ref = REFERENCE_GRIND_DATA[key];
    if (!ref.grind) continue;
    const refOrigin = ref.origin.toLowerCase();
    const refProcess = ref.process.toLowerCase();
    if (beanOrigin.includes(refOrigin) && beanProcess.includes(refProcess)) {
      return ref;
    }
  }

  // Second try: match origin only
  for (const key of Object.keys(REFERENCE_GRIND_DATA)) {
    const ref = REFERENCE_GRIND_DATA[key];
    if (!ref.grind) continue;
    if (beanOrigin.includes(ref.origin.toLowerCase())) {
      return ref;
    }
  }

  return null;
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
  const ref = chooseReferenceForBean(bean, research);
  if (!ref) return;

  const { ssMin, ssMax, batchMin, batchMax } = ref.grind;
  const ssGrind = pickUpperMiddle(ssMin, ssMax);
  let batchGrind = pickUpperMiddle(batchMin, batchMax);

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

function buildBeanDescription(bean) {
  const ps = getPeakStatus(bean);
  const dsr = daysSinceRoast(bean.roastDate);
  const profile = getProfileForRoaster(bean.roaster);

  return {
    text: [
      `Roaster: ${bean.roaster}`,
      `Name: ${bean.name}`,
      `Origin: ${bean.origin}`,
      bean.variety ? `Variety: ${bean.variety}` : null,
      `Process: ${bean.process}`,
      bean.roastDate ? `Roast date: ${bean.roastDate} (${dsr}d ago)` : null,
      `Peak status: ${ps.label}`,
      `Roaster category: ${profile.category}`,
      bean.bagNotes ? `Bag tasting notes: ${bean.bagNotes}` : null,
      bean.producer ? `Producer: ${bean.producer}` : null,
    ].filter(Boolean).join('\n'),
    profile,
  };
}

export async function researchBean(bean) {
  const { text: beanDescription } = buildBeanDescription(bean);

  const response = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system: RESEARCH_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `Research this coffee bean:\n\n${beanDescription}` }],
      maxTokens: 600,
    }),
  });

  if (!response.ok) {
    throw new Error(`Research API error: ${response.status}`);
  }

  const data = await response.json();
  const text = data.content?.map(c => c.text || '').join('') || '';
  const clean = text.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

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

  const response = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system: AIDEN_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
      maxTokens: 1000,
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status}`);
  }

  const data = await response.json();
  const text = data.content?.map(c => c.text || '').join('') || '';
  const clean = text.replace(/```json|```/g, '').trim();
  const parsed = JSON.parse(clean);
  return repairRecipe(bean, parsed, research);
}

export async function pushToAiden(recipe) {
  // Strip grindRecommendation — not part of Fellow schema
  const { grindRecommendation, ...profile } = recipe;

  const response = await fetch('/api/aiden', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profile),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Fellow API error: ${response.status}`);
  }

  const result = await response.json();
  return { ...result, grindRecommendation };
}
