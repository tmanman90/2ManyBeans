#!/usr/bin/env node
// Aiden Autoresearch — 6-model evaluation harness (Karpathy method)
// Tests research + recipe quality across models with binary scoring
// Usage: node scripts/aiden-autoresearch.mjs

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '.env.local');
const envContent = readFileSync(envPath, 'utf8');
const env = {};
for (const line of envContent.split('\n')) {
  const match = line.match(/^([A-Z_]+)=(.*)$/);
  if (match) env[match[1]] = match[2].replace(/^"|"$/g, '');
}

const OPENAI_KEY = env.OPENAI_API_KEY;
const ANTHROPIC_KEY = env.ANTHROPIC_API_KEY;
const GEMINI_KEY = env.GEMINI_API_KEY;
const XAI_KEY = env.XAI_API_KEY;

const missing = [];
if (!OPENAI_KEY) missing.push('OPENAI_API_KEY');
if (!ANTHROPIC_KEY) missing.push('ANTHROPIC_API_KEY');
if (!GEMINI_KEY) missing.push('GEMINI_API_KEY');
if (!XAI_KEY) missing.push('XAI_API_KEY');
if (missing.length) { console.error(`Missing in .env.local: ${missing.join(', ')}`); process.exit(1); }

// ═══════════════════════════════════════════════
// MODEL REGISTRY
// ═══════════════════════════════════════════════

const MODELS = [
  { name: 'GPT-5.4',          provider: 'openai',    model: 'gpt-5.4',                          pricing: { input: 2.50, output: 10.00 } },
  { name: 'GPT-5.4 Mini',     provider: 'openai',    model: 'gpt-5.4-mini',                     pricing: { input: 0.40, output: 1.60 } },
  { name: 'Gemini 2.5 Flash', provider: 'gemini',    model: 'gemini-2.5-flash',                  pricing: { input: 0.15, output: 0.60 } },
  { name: 'Gemini 2.0 Flash', provider: 'gemini',    model: 'gemini-2.0-flash',                  pricing: { input: 0.10, output: 0.40 } },
  { name: 'Haiku 4.5',        provider: 'anthropic', model: 'claude-haiku-4-5-20251001',         pricing: { input: 0.80, output: 4.00 } },
  { name: 'Grok 4.1 Fast',    provider: 'xai',       model: 'grok-4-1-fast-non-reasoning',       pricing: { input: 3.00, output: 15.00 } },
];

// ═══════════════════════════════════════════════
// TEST BEANS (10 beans, all 9 cup-structure families)
// ═══════════════════════════════════════════════

const TEST_BEANS = [
  // Existing 3
  {
    name: 'El Placer', roaster: 'Dayglow (Promethium)', origin: 'Colombia',
    variety: 'Geisha', process: 'Anaerobic White Honey', roastDate: '2026-02-05',
    bagNotes: 'gardenia flowers / Earl Grey tea / bergamot', bagSize: 100,
    status: 'SEALED', peakStatus: 'In Peak (67%)', daysSinceRoast: 58,
    expectedFamily: 'honey-anaerobic', isLightWashed: false, isKenyaWashed: false, isPastPeak: false,
  },
  {
    name: 'Finca La Fuente', roaster: 'Koppi', origin: 'Colombia (Tarqui, Huila)',
    variety: 'Pink Bourbon', process: 'Washed', roastDate: '2026-01-28',
    bagNotes: 'tropical fruits / floral / complex', bagSize: 100,
    status: 'SEALED', peakStatus: 'In Peak (82%)', daysSinceRoast: 66,
    expectedFamily: 'washed-colombia-clarity', isLightWashed: true, isKenyaWashed: false, isPastPeak: false,
  },
  {
    name: 'Mulish', roaster: "Apollon's Gold", origin: 'Ethiopia',
    variety: 'Heirloom', process: 'Washed', roastDate: '2025-12-07',
    bagNotes: 'nectarine / honeysuckle / lavender', bagSize: 100,
    status: 'SEALED', peakStatus: 'Past Peak (+15d)', daysSinceRoast: 118,
    expectedFamily: 'washed-ethiopia-clarity', isLightWashed: true, isKenyaWashed: false, isPastPeak: true,
  },
  // NEW: Kenya washed (tests Kenya-specific rules)
  {
    name: 'Gichathaini AA', roaster: 'Manhattan Coffee Roasters', origin: 'Kenya (Nyeri)',
    variety: 'SL28, SL34', process: 'Washed', roastDate: '2026-03-10',
    bagNotes: 'blackcurrant / grapefruit / brown sugar / pomelo', bagSize: 250,
    status: 'ACTIVE', peakStatus: 'In Peak (45%)', daysSinceRoast: 25,
    expectedFamily: 'washed-kenya-clarity', isLightWashed: true, isKenyaWashed: true, isPastPeak: false,
  },
  // NEW: Washed Gesha (tests floral clarity classification)
  {
    name: 'Gesha Village Lot 74', roaster: 'SEY', origin: 'Ethiopia (Gesha Village, Bench Maji)',
    variety: 'Gesha 1931', process: 'Washed', roastDate: '2026-03-01',
    bagNotes: 'jasmine / bergamot / white peach / lemongrass', bagSize: 100,
    status: 'ACTIVE', peakStatus: 'In Peak (55%)', daysSinceRoast: 34,
    expectedFamily: 'washed-gesha-clarity', isLightWashed: true, isKenyaWashed: false, isPastPeak: false,
  },
  // NEW: Natural Ethiopia (tests natural fruit intervals)
  {
    name: 'Worka Sakaro', roaster: 'April Coffee', origin: 'Ethiopia (Gedeb, Yirgacheffe)',
    variety: 'Heirloom', process: 'Natural', roastDate: '2026-02-20',
    bagNotes: 'blueberry / strawberry jam / dark chocolate / wine', bagSize: 250,
    status: 'ACTIVE', peakStatus: 'In Peak (70%)', daysSinceRoast: 43,
    expectedFamily: 'natural-ethiopia-fruit', isLightWashed: false, isKenyaWashed: false, isPastPeak: false,
  },
  // NEW: Guatemala washed (tests central america body-forward)
  {
    name: 'Antigua Pastores', roaster: 'Counter Culture', origin: 'Guatemala (Antigua)',
    variety: 'Bourbon, Caturra', process: 'Washed', roastDate: '2026-02-15',
    bagNotes: 'milk chocolate / orange / toasted almond / caramel', bagSize: 340,
    status: 'ACTIVE', peakStatus: 'In Peak (80%)', daysSinceRoast: 48,
    expectedFamily: 'washed-central-america', isLightWashed: true, isKenyaWashed: false, isPastPeak: false,
  },
  // NEW: Medium washed (tests medium roast handling)
  {
    name: 'Huila Castillo', roaster: 'Onyx Coffee Lab', origin: 'Colombia (Huila)',
    variety: 'Castillo, Caturra', process: 'Washed', roastDate: '2026-01-20',
    bagNotes: 'brown sugar / red apple / nutty / smooth', bagSize: 340,
    status: 'SEALED', peakStatus: 'Past Peak (+5d)', daysSinceRoast: 74,
    expectedFamily: 'medium-washed', isLightWashed: false, isKenyaWashed: false, isPastPeak: true,
  },
  // NEW: Dark roast
  {
    name: 'Intango Dark', roaster: 'Counter Culture', origin: 'Rwanda (Nyamasheke)',
    variety: 'Bourbon, Mayaguez, Jackson', process: 'Washed', roastDate: '2026-03-05',
    bagNotes: 'dark chocolate / molasses / dried cherry / smoky', bagSize: 340,
    status: 'ACTIVE', peakStatus: 'In Peak (40%)', daysSinceRoast: 30,
    expectedFamily: 'dark-roast', isLightWashed: false, isKenyaWashed: false, isPastPeak: false,
  },
  // NEW: Honey process (second honey-anaerobic variant)
  {
    name: 'Finca Las Flores', roaster: 'Brandywine Coffee', origin: 'Honduras (Marcala)',
    variety: 'Pacas', process: 'Yellow Honey', roastDate: '2026-02-25',
    bagNotes: 'peach / brown sugar / mild floral / creamy body', bagSize: 250,
    status: 'ACTIVE', peakStatus: 'In Peak (60%)', daysSinceRoast: 38,
    expectedFamily: 'honey-anaerobic', isLightWashed: false, isKenyaWashed: false, isPastPeak: false,
  },
];

// ═══════════════════════════════════════════════
// REFERENCE PROFILE INDEX
// ═══════════════════════════════════════════════

const REFERENCE_PROFILE_INDEX = `1. Kiss the Hippo Peru El Morito — Peru, Light, Washed, Bourbon/Caturra
2. Passenger Colombia Divino Nino — Colombia, Light, Washed, Field Blend
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
27. Loquat Costa Rica Finca Ines Geisha — Costa Rica, Light, Semi-Washed, Geisha
28. Loquat Costa Rica San Roque — Costa Rica, Light-Med, Semi-Washed, San Roque
29. Asprotimana Colombia Huila — Colombia, Medium, Washed, Castillo/Caturra
30. Linea Guatemala La Esperanza — Guatemala, Med-Light, Washed, Bourbon
31. Olympia Amparo Pajoy — Colombia, Medium, Washed, Caturra
32. Counter Culture Intango Dark — Rwanda, Dark, Washed, Bourbon/Mayaguez/Jackson
33. Methodical Oscuro Dark — Brazil, Dark, Natural, Mundo Novo/Catuai
34. KOS Armando Leivas Dark — Guatemala, Med-Dark, Washed, Caturra`;

// ═══════════════════════════════════════════════
// SYSTEM PROMPTS (from aiden.js)
// ═══════════════════════════════════════════════

const RESEARCH_SYSTEM = `You are a specialty coffee expert with deep knowledge of origins, roasters, processing methods, and extraction science. Given a coffee's details, research and analyze the bean using your knowledge.

Respond with ONLY a valid JSON object (no markdown, no backticks, no explanation):

{
  "altitude": "estimated masl range (e.g. '1800-2100 masl')",
  "roastLevel": "ultra-light | light | light-medium | medium | medium-dark | dark",
  "roasterStyle": "brief description of this roaster's typical approach and philosophy",
  "processingNuance": "expanded processing details relevant to extraction",
  "densityEstimate": "high | medium | low (based on altitude, variety, and roast)",
  "flavorExpectations": "what flavors to optimize for in brewing",
  "extractionNotes": "practical brewing implications (water temp, grind, timing considerations)",
  "cupStructureFamily": "one of: washed-gesha-clarity | washed-kenya-clarity | washed-ethiopia-clarity | natural-ethiopia-fruit | honey-anaerobic | washed-colombia-clarity | washed-central-america | medium-washed | dark-roast",
  "closestReferenceProfiles": [
    { "number": 1, "name": "profile name", "why": "brief reason this is a close match" }
  ]
}

IMPORTANT: cupStructureFamily is based on the coffee's CUP STRUCTURE, not just its country of origin.
- A washed Colombia Gesha with floral/tea-like character = "washed-gesha-clarity" (NOT "washed-colombia-clarity")
- A washed Kenya with pomelo/hibiscus clarity = "washed-kenya-clarity"
- "washed-colombia-clarity" is for high-altitude Colombian washed coffees with lifted aromatics (floral, citrus, stonefruit)
- "washed-central-america" is for comfort/body-forward washed coffees from Guatemala, Costa Rica, etc.
- "medium-washed" is for medium roast washed coffees prioritizing body over clarity
- "dark-roast" is for any dark or medium-dark roast
- When in doubt between clarity and body families, choose the clarity family (finer grind is safer than coarser)

For closestReferenceProfiles, select the 2-3 most similar profiles from the reference database below. Match on cup structure, process, roast level, and varietal similarity (not just origin).

## Reference Profile Database

${REFERENCE_PROFILE_INDEX}

RESPOND WITH ONLY THE JSON OBJECT. No other text.`;

const AIDEN_SYSTEM = `You are a master specialty coffee brewer. You create Fellow Aiden automatic pour-over profiles with maximum precision. Your recipes are based on real Fellow Brew Talks profiles.

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
  "ratio": number,
  "bloomEnabled": true,
  "bloomRatio": number,
  "bloomDuration": number,
  "bloomTemperature": number,
  "ssPulsesEnabled": true,
  "ssPulsesNumber": number,
  "ssPulsesInterval": number,
  "ssPulseTemperatures": [number],
  "batchPulsesEnabled": true,
  "batchPulsesNumber": number,
  "batchPulsesInterval": number,
  "batchPulseTemperatures": [number],
  "grindRecommendation": {
    "singleServe": number,
    "batch": number
  }
}

## MANDATORY RULES

### Grind Selection (Ode Gen 2)
Valid steps: 1, 1.1, 1.2, 2, 2.1, 2.2, 3, 3.1, 3.2, 4, 4.1, 4.2, 5, 5.1, 5.2, 6, 6.1, 6.2, 7, 7.1, 7.2, 8, 8.1, 8.2, 9, 9.1, 9.2, 10, 10.1, 10.2, 11
Batch is ALWAYS coarser than single serve. Pick ONE value (not a range).

NOTE: Grind size is enforced deterministically by the app based on the coffee's cup-structure family. Your grind recommendation will be overridden. Focus your effort on getting the brew parameters (ratio, bloom, pulses, temps, intervals) right.

### Bean Age Adjustments
- In Peak (early <50%): standard parameters
- In Peak (late >50%): ratio +0.5
- Fading / Past Peak: ratio +0.5 (sometimes +1), bloom ratio +0.5, early temps +0.5 to +1.5C
- Stale: ratio +1 to +1.5, bloom ratio +0.5, maximize early energy

### Pulse Interval Guidelines
- Light washed (high clarity): 20-25s intervals ONLY
- Light natural (fruit-forward): 25-30s intervals
- Honey / anaerobic: 25-35s intervals
- Medium / dark: 25-30s intervals

### Origin-Specific Overrides
- Washed Kenya: bloom MUST be 2.5-3.0x, bloom time 40-55s, pulse intervals 20-25s

### Ratio Sanity
- For light/washed clarity profiles, default ratio MUST be >= 16.5 (prefer ~17)

### Temperature Curve (MANDATORY)
For light roasts, prefer a DECLINING temperature profile across pulses:
- Start at full bloom temperature (94-96C for washed, 92-94C for naturals)
- Step down 0.5-1.5C per pulse through the brew
- This extracts desirable acids and sugars early at high temp, then avoids bitter compounds late
- Example: 3 pulses at [96, 95, 94] or [95, 94, 93]
- For dark roasts, flat temperatures are acceptable (e.g., [92, 92, 92])
- Batch profiles can use a steeper decline since total contact time is longer

### Density / Altitude Handling (MANDATORY)
For high-altitude, dense, light-roast coffees:
- increase EARLY ENERGY first (bloom temp, first pulse temps, bloom saturation, shorter intervals)
- do NOT let density automatically push the recipe toward a generic coarser or finer profile

### Cup-Structure Family Classification (MANDATORY)

Before using any reference profile, classify the coffee into ONE family:
- Washed Gesha / washed floral Pink Bourbon / washed floral heirloom = WASHED FLORAL CLARITY
- Washed Kenya SL28/SL34 = KENYA CLARITY
- Washed Ethiopia = WASHED ETHIOPIA CLARITY
- Natural Ethiopia / clean-fruit natural = CLEAN NATURAL FRUIT
- Honey / anaerobic / co-ferment / white honey / experimental = PROCESSED CLARITY

Rules:
- The family classification comes BEFORE origin-based reference matching.
- If a generic country/process reference conflicts with the family baseline, trust the family baseline.
- A washed floral Colombia (Gesha, Pink Bourbon, floral profile) must NOT be treated like a generic body-forward washed Colombia.

### Family Baseline Defaults (clarity-first)

For all families, unless there is a specific reason otherwise:
- Single Serve pulse count: usually 3
- Batch pulse count: usually 4

WASHED FLORAL CLARITY
Defaults: ratio 17.0-17.5, bloom 3.0/45-55s/94-96C, SS intervals 22-25s, batch intervals 28-32s

KENYA CLARITY
Defaults: ratio 17.0, bloom 2.5-3.0/40-55s/94-96C, SS intervals 20-25s, batch intervals 28-32s

WASHED ETHIOPIA CLARITY
Defaults: ratio 17.0, bloom 3.0/45-55s/94-95.5C, SS intervals 22-25s, batch intervals 28-32s

CLEAN NATURAL FRUIT
Defaults: ratio 17.0-17.5, bloom 2.5/45-50s/92-94C, SS intervals 25-30s, batch intervals 28-32s

PROCESSED CLARITY
Defaults: ratio 17.0-17.5, bloom 2.5/45-55s/92-93C, SS intervals 25-30s, batch intervals 30-35s

## REFERENCE PROFILES (from Fellow Brew Talks)

Kiss the Hippo Peru El Morito | Peru | Light | Washed | Bourbon, Caturra
ratio 15.5 | bloom 2/35s/96C | SS 4x23s [96,95,95,94] | Batch 4x30s [96,96,95,94] | grind SS 3-4 / Batch 5-7

Passenger Colombia Divino Nino | Colombia | Light | Washed | Field Blend
ratio 16 | bloom 2.5/40s/96C | SS 3x20s [96,94,93] | Batch 3x25s [96,94,93] | grind SS 5-6.1 / Batch 6.2-8

Coffee Collective Kenya Kieni AB | Kenya | Light | Washed Double Ferm | SL28, SL34
ratio 15.5 | bloom 2/40s/94C | SS 3x23s [94,94,94] | Batch 4x30s [94,94,94,94] | grind SS 3.2-4.2 / Batch 5.1-7

Counter Culture Cueva de los Llanos | Colombia | Light | Washed | Caturra, Castillo
ratio 17 | bloom 2.5/45s/96C | SS 4x23s [96,96,96,96] | Batch 2x30s [96,96] | grind SS 5.2-6.2 / Batch 6.1-7.1

Sq Mile Ethiopia Telila Kecho | Ethiopia | Light | Washed | JARC 74110, 74112
ratio 16.5 | bloom 3/45s/98C | SS 3x20s [98,98,98] | Batch 4x30s [98,98,96,94] | grind SS 5.1-6 / Batch 7-8.2

Equator Thailand Mae Chedi | Thailand | Light | Anaerobic Natural | Chiang Mai
ratio 16 | bloom 3/35s/92C | SS 4x25s [92,93.5,94.5,92] | Batch 3x40s [93.5,94.5,92] | grind SS 4-5 / Batch 5-7

Special Guests Andres Cardona Purple Honey | Colombia | Light | Natural Honey Co-Ferment | Castillo
ratio 14.5 | bloom 3/45s/89C | SS 3x23s [92.5,92.5,90.5] | Batch 3x30s [92.5,91.5,91] | grind SS 5-6 / Batch 6-7.2

Black & White Fruit Cake | Costa Rica | Medium | Cinnamon Anaerobic | Caturra, Catuai
ratio 16 | bloom 3/60s/88C | SS 2x25s [95,93] | Batch 2x25s [95,93] | grind SS 3.2 / Batch 4.2

Loquat Costa Rica Finca Ines Geisha | Costa Rica | Light | Semi-Washed | Geisha
ratio 16 | bloom 2/30s/92C | SS 2x30s [92,92] | Batch 2x30s [92,92] | grind SS 4.1-5.1 / Batch 4.1-5.1

Counter Culture Intango Dark | Rwanda | Dark | Washed | Bourbon, Mayaguez, Jackson
ratio 17 | bloom 2.5/45s/96C | SS 3x28s [94.5,94.5,94.5] | Batch 1x30s [96] | grind SS 6.1-7.1 / Batch 7-8.1

Methodical Oscuro Dark | Brazil | Dark | Natural | Mundo Novo, Catuai
ratio 15 | bloom 2/30s/92.5C | SS 3x23s [92,92,92] | Batch 3x30s [92,92,92] | grind SS 8-9 / Batch 8-9.2

## FINAL CHECKLIST

Before returning your JSON, confirm:
1. AGE: If Past Peak or Fading: ratio +0.5 to +1.0, bloom ratio +0.5, early temps up?
2. INTERVALS: Light washed = 20-25s? (35s+ is WRONG for light washed)
3. KENYA BLOOM: Washed Kenya = 2.5-3.0x bloom? (2.0 or below is WRONG)
4. RATIO SANITY: Light/washed clarity profiles ratio >= 16.5 (prefer ~17)?
5. FAMILY CHECK: Correct cup-structure family, not overridden by generic country/process?
6. TEMP CURVE: For light roasts, are pulse temperatures declining (not flat)?

## CRITICAL REMINDERS

### Grind Steps Must Be EXACT
Your grindRecommendation values MUST be chosen from this EXACT list. Do NOT interpolate or round to values not on this list:
1, 1.1, 1.2, 2, 2.1, 2.2, 3, 3.1, 3.2, 4, 4.1, 4.2, 5, 5.1, 5.2, 6, 6.1, 6.2, 7, 7.1, 7.2, 8, 8.1, 8.2, 9, 9.1, 9.2, 10, 10.1, 10.2, 11
Values like 4.8, 5.6, 3.5, 6.8 are INVALID. Pick the nearest valid step from the list above.

### Past Peak / Fading Beans MUST Have Higher Ratio
If the bean is Past Peak or Fading, you MUST add +0.5 to +1.0 to the ratio above the family baseline default. For example: if the family baseline is 17.0, past peak ratio should be 17.5. If baseline is 16.0, past peak should be 16.5-17.0. Never use the standard baseline ratio for an aged bean.

RESPOND WITH ONLY THE JSON OBJECT. No other text.`;

// ═══════════════════════════════════════════════
// API CALLERS
// ═══════════════════════════════════════════════

async function callOpenAI(model, system, userMsg) {
  const start = Date.now();
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: system }, { role: 'user', content: userMsg }],
      max_completion_tokens: 2000,
    }),
  });
  const elapsed = Date.now() - start;
  const data = await res.json();
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${JSON.stringify(data).slice(0, 200)}`);
  const text = data.choices?.[0]?.message?.content || '';
  const usage = data.usage || {};
  return { text, elapsed, inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens };
}

async function callAnthropic(model, system, userMsg) {
  const start = Date.now();
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model, max_tokens: 2000, system,
      messages: [{ role: 'user', content: userMsg }],
    }),
  });
  const elapsed = Date.now() - start;
  const data = await res.json();
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${JSON.stringify(data).slice(0, 200)}`);
  const text = data.content?.map(c => c.text || '').join('') || '';
  const usage = data.usage || {};
  return { text, elapsed, inputTokens: usage.input_tokens, outputTokens: usage.output_tokens };
}

async function callGemini(model, system, userMsg) {
  const start = Date.now();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ parts: [{ text: userMsg }] }],
      generationConfig: { maxOutputTokens: 2000 },
    }),
  });
  const elapsed = Date.now() - start;
  const data = await res.json();
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${JSON.stringify(data).slice(0, 200)}`);
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const meta = data.usageMetadata || {};
  return { text, elapsed, inputTokens: meta.promptTokenCount, outputTokens: meta.candidatesTokenCount };
}

async function callXAI(model, system, userMsg) {
  const start = Date.now();
  const res = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${XAI_KEY}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: system }, { role: 'user', content: userMsg }],
      max_completion_tokens: 2000,
    }),
  });
  const elapsed = Date.now() - start;
  const data = await res.json();
  if (!res.ok) throw new Error(`xAI ${res.status}: ${JSON.stringify(data).slice(0, 200)}`);
  const text = data.choices?.[0]?.message?.content || '';
  const usage = data.usage || {};
  return { text, elapsed, inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens };
}

async function callModel(m, system, userMsg) {
  switch (m.provider) {
    case 'openai':    return callOpenAI(m.model, system, userMsg);
    case 'anthropic': return callAnthropic(m.model, system, userMsg);
    case 'gemini':    return callGemini(m.model, system, userMsg);
    case 'xai':       return callXAI(m.model, system, userMsg);
    default: throw new Error(`Unknown provider: ${m.provider}`);
  }
}

// ═══════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════

function extractJSON(text) {
  const clean = text.replace(/```json|```/g, '').trim();
  const match = clean.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

const VALID_ODE_STEPS = [1,1.1,1.2,2,2.1,2.2,3,3.1,3.2,4,4.1,4.2,5,5.1,5.2,6,6.1,6.2,7,7.1,7.2,8,8.1,8.2,9,9.1,9.2,10,10.1,10.2,11];

const VALID_FAMILIES = [
  'washed-gesha-clarity', 'washed-kenya-clarity', 'washed-ethiopia-clarity',
  'natural-ethiopia-fruit', 'honey-anaerobic', 'washed-colombia-clarity',
  'washed-central-america', 'medium-washed', 'dark-roast',
];

const VALID_ROAST_LEVELS = ['ultra-light', 'light', 'light-medium', 'medium', 'medium-dark', 'dark'];

function estimateCost(model, inputTokens, outputTokens) {
  if (!model.pricing || !inputTokens) return null;
  return (inputTokens * model.pricing.input + outputTokens * model.pricing.output) / 1_000_000;
}

function buildBeanDescription(bean) {
  return `Name: ${bean.name}
Roaster: ${bean.roaster}
Origin: ${bean.origin}
Variety: ${bean.variety}
Process: ${bean.process}
Roast Date: ${bean.roastDate}
Days Since Roast: ${bean.daysSinceRoast}
Peak Status: ${bean.peakStatus}
Bag Notes: ${bean.bagNotes}`;
}

function buildRecipeUserMsg(bean, research) {
  let msg = `Generate an Aiden brew profile for this coffee:\n\n${buildBeanDescription(bean)}`;
  if (research) {
    msg += `\n\n## Research Context
Altitude: ${research.altitude || 'unknown'}
Roast Level: ${research.roastLevel || 'unknown'}
Roaster Style: ${research.roasterStyle || 'unknown'}
Processing Nuance: ${research.processingNuance || 'unknown'}
Density: ${research.densityEstimate || 'unknown'}
Flavor Expectations: ${research.flavorExpectations || 'unknown'}
Extraction Notes: ${research.extractionNotes || 'unknown'}
Cup Structure Family: ${research.cupStructureFamily || 'unknown'}`;
    if (research.closestReferenceProfiles?.length) {
      msg += '\n\nClosest reference profiles:';
      for (const ref of research.closestReferenceProfiles) {
        msg += `\n- #${ref.number} ${ref.name}: ${ref.why}`;
      }
    }
  }
  return msg;
}

// ═══════════════════════════════════════════════
// BINARY SCORING (Karpathy autoresearch style)
// ═══════════════════════════════════════════════

function scoreResearch(research) {
  const scores = {};

  // R1: Valid JSON
  scores.R1 = research !== null;
  if (!research) return { scores, total: 0, max: 6 };

  // R2: cupStructureFamily is valid enum
  scores.R2 = VALID_FAMILIES.includes(research.cupStructureFamily);

  // R3: closestReferenceProfiles has 2-3 entries
  const refs = research.closestReferenceProfiles;
  scores.R3 = Array.isArray(refs) && refs.length >= 2 && refs.length <= 3;

  // R4: All reference numbers are 1-34
  scores.R4 = Array.isArray(refs) && refs.length > 0 &&
    refs.every(r => Number.isInteger(r.number) && r.number >= 1 && r.number <= 34);

  // R5: roastLevel is valid enum
  scores.R5 = VALID_ROAST_LEVELS.includes(research.roastLevel);

  // R6: densityEstimate is valid enum
  scores.R6 = ['high', 'medium', 'low'].includes(research.densityEstimate);

  const total = Object.values(scores).filter(Boolean).length;
  return { scores, total, max: 6 };
}

const RECIPE_REQUIRED_FIELDS = [
  'profileType', 'title', 'ratio', 'bloomEnabled', 'bloomRatio', 'bloomDuration',
  'bloomTemperature', 'ssPulsesEnabled', 'ssPulsesNumber', 'ssPulsesInterval',
  'ssPulseTemperatures', 'batchPulsesEnabled', 'batchPulsesNumber', 'batchPulsesInterval',
  'batchPulseTemperatures', 'grindRecommendation',
];

function scoreRecipe(recipe, bean) {
  const scores = {};
  let applicable = 0;

  // A1: Valid JSON with all required fields
  scores.A1 = recipe !== null && RECIPE_REQUIRED_FIELDS.every(f => recipe[f] !== undefined);
  applicable++;
  if (!recipe) return { scores, total: 0, max: 1, applicable: 1 };

  // A2: Correct types
  scores.A2 = typeof recipe.ratio === 'number' &&
    typeof recipe.bloomEnabled === 'boolean' &&
    typeof recipe.bloomRatio === 'number' &&
    Array.isArray(recipe.ssPulseTemperatures) &&
    Array.isArray(recipe.batchPulseTemperatures);
  applicable++;

  // A3: Grind values are valid Ode Gen 2 steps
  const gr = recipe.grindRecommendation;
  scores.A3 = gr && VALID_ODE_STEPS.includes(gr.singleServe) && VALID_ODE_STEPS.includes(gr.batch);
  applicable++;

  // A4: Batch grind coarser than single serve
  scores.A4 = gr && gr.batch > gr.singleServe;
  applicable++;

  // A5: Light washed SS intervals 20-25s (conditional)
  if (bean.isLightWashed) {
    scores.A5 = recipe.ssPulsesInterval >= 20 && recipe.ssPulsesInterval <= 25;
    applicable++;
  }

  // A6: Kenya washed bloom 2.5-3.0x (conditional)
  if (bean.isKenyaWashed) {
    scores.A6 = recipe.bloomRatio >= 2.5 && recipe.bloomRatio <= 3.0;
    applicable++;
  }

  // A7: Light/washed ratio >= 16.5 (conditional)
  if (bean.isLightWashed) {
    scores.A7 = recipe.ratio >= 16.5;
    applicable++;
  }

  // A8: SS temp array length matches pulse count
  scores.A8 = Array.isArray(recipe.ssPulseTemperatures) &&
    recipe.ssPulseTemperatures.length === recipe.ssPulsesNumber;
  applicable++;

  // A9: Batch temp array length matches pulse count
  scores.A9 = Array.isArray(recipe.batchPulseTemperatures) &&
    recipe.batchPulseTemperatures.length === recipe.batchPulsesNumber;
  applicable++;

  // A10: All temps in 50-99C
  const allTemps = [
    recipe.bloomTemperature,
    ...(recipe.ssPulseTemperatures || []),
    ...(recipe.batchPulseTemperatures || []),
  ];
  scores.A10 = allTemps.every(t => typeof t === 'number' && t >= 50 && t <= 99);
  applicable++;

  // A11: Age adjustments for past peak beans (conditional)
  if (bean.isPastPeak) {
    // Past peak beans should have ratio >= 17.0 (baseline ~16.5-17 + 0.5)
    scores.A11 = recipe.ratio >= 17.0;
    applicable++;
  }

  // A12: Bloom duration in valid range
  scores.A12 = typeof recipe.bloomDuration === 'number' &&
    recipe.bloomDuration >= 1 && recipe.bloomDuration <= 120;
  applicable++;

  // A13: Declining temperature curve for light roasts (conditional)
  // Light roast SS pulse temps should decline (first temp >= last temp)
  if (bean.isLightRoast !== false && !bean.expectedFamily?.includes('dark') && !bean.expectedFamily?.includes('medium')) {
    const ssTemps = recipe.ssPulseTemperatures || [];
    if (ssTemps.length >= 2) {
      scores.A13 = ssTemps[0] >= ssTemps[ssTemps.length - 1];
      applicable++;
    }
  }

  const total = Object.values(scores).filter(v => v === true).length;
  return { scores, total, max: Object.keys(scores).length, applicable };
}

// ═══════════════════════════════════════════════
// TEST PHASES
// ═══════════════════════════════════════════════

async function runPhase1(bean) {
  const userMsg = `Research this coffee bean:\n\n${buildBeanDescription(bean)}`;
  const results = {};

  const promises = MODELS.map(async (m) => {
    const tag = m.name;
    try {
      const raw = await callModel(m, RESEARCH_SYSTEM, userMsg);
      const research = extractJSON(raw.text);
      const { scores, total, max } = scoreResearch(research);
      const cost = estimateCost(m, raw.inputTokens, raw.outputTokens);
      results[tag] = {
        success: true, research, scores, total, max,
        elapsed: raw.elapsed, inputTokens: raw.inputTokens, outputTokens: raw.outputTokens, cost,
      };
    } catch (err) {
      results[tag] = { success: false, error: err.message.slice(0, 150), scores: {}, total: 0, max: 6 };
    }
  });

  await Promise.allSettled(promises);
  return results;
}

async function runPhase2(bean, sharedResearch) {
  const userMsg = buildRecipeUserMsg(bean, sharedResearch);
  const results = {};

  const promises = MODELS.map(async (m) => {
    const tag = m.name;
    try {
      const raw = await callModel(m, AIDEN_SYSTEM, userMsg);
      const recipe = extractJSON(raw.text);
      const { scores, total, max, applicable } = scoreRecipe(recipe, bean);
      const cost = estimateCost(m, raw.inputTokens, raw.outputTokens);
      results[tag] = {
        success: true, recipe, scores, total, max, applicable,
        elapsed: raw.elapsed, inputTokens: raw.inputTokens, outputTokens: raw.outputTokens, cost,
      };
    } catch (err) {
      results[tag] = { success: false, error: err.message.slice(0, 150), scores: {}, total: 0, max: 0, applicable: 0 };
    }
  });

  await Promise.allSettled(promises);
  return results;
}

// ═══════════════════════════════════════════════
// OUTPUT FORMATTING
// ═══════════════════════════════════════════════

function printPhase1Table(bean, results) {
  console.log(`\n  PHASE 1: RESEARCH — ${bean.name}`);
  console.log(`  Expected family: ${bean.expectedFamily}`);
  console.log(`  ${'─'.repeat(90)}`);

  const header = '  ' + 'Model'.padEnd(20) + 'Family'.padEnd(28) + 'Refs'.padEnd(10) + 'Score'.padEnd(8) + 'Time'.padEnd(10) + 'Cost';
  console.log(header);
  console.log(`  ${'─'.repeat(90)}`);

  for (const m of MODELS) {
    const r = results[m.name];
    if (!r?.success) {
      console.log(`  ${m.name.padEnd(20)}${'ERROR'.padEnd(28)}${''.padEnd(10)}${'0/6'.padEnd(8)}${''.padEnd(10)}`);
      continue;
    }
    const family = (r.research?.cupStructureFamily || 'N/A').padEnd(28);
    const refs = (r.research?.closestReferenceProfiles?.map(p => `#${p.number}`).join(',') || 'N/A').padEnd(10);
    const score = `${r.total}/6`.padEnd(8);
    const time = `${r.elapsed}ms`.padEnd(10);
    const cost = r.cost ? `$${r.cost.toFixed(4)}` : 'N/A';
    const familyMatch = r.research?.cupStructureFamily === bean.expectedFamily ? '' : ' !!';
    console.log(`  ${m.name.padEnd(20)}${family}${refs}${score}${time}${cost}${familyMatch}`);
  }
}

function printPhase2Table(bean, results) {
  console.log(`\n  PHASE 2: RECIPE — ${bean.name}`);
  console.log(`  ${'─'.repeat(110)}`);

  const header = '  ' + 'Model'.padEnd(20) + 'Ratio'.padEnd(7) + 'Bloom'.padEnd(14) + 'SS Int'.padEnd(8) +
    'SS#'.padEnd(5) + 'Batch#'.padEnd(7) + 'Score'.padEnd(10) + 'Time'.padEnd(10) + 'Cost';
  console.log(header);
  console.log(`  ${'─'.repeat(110)}`);

  for (const m of MODELS) {
    const r = results[m.name];
    if (!r?.success || !r.recipe) {
      console.log(`  ${m.name.padEnd(20)}${'ERROR'.padEnd(7)}`);
      continue;
    }
    const rec = r.recipe;
    const ratio = String(rec.ratio || '?').padEnd(7);
    const bloom = `${rec.bloomRatio}x/${rec.bloomDuration}s/${rec.bloomTemperature}C`.padEnd(14);
    const ssInt = `${rec.ssPulsesInterval}s`.padEnd(8);
    const ssN = String(rec.ssPulsesNumber || '?').padEnd(5);
    const batchN = String(rec.batchPulsesNumber || '?').padEnd(7);
    const score = `${r.total}/${r.applicable}`.padEnd(10);
    const time = `${r.elapsed}ms`.padEnd(10);
    const cost = r.cost ? `$${r.cost.toFixed(4)}` : 'N/A';
    console.log(`  ${m.name.padEnd(20)}${ratio}${bloom}${ssInt}${ssN}${batchN}${score}${time}${cost}`);
  }

  // Print failed checks per model
  for (const m of MODELS) {
    const r = results[m.name];
    if (!r?.success) continue;
    const fails = Object.entries(r.scores).filter(([, v]) => v === false).map(([k]) => k);
    if (fails.length > 0) {
      console.log(`    ${m.name} fails: ${fails.join(', ')}`);
    }
  }
}

function printSummary(allPhase1, allPhase2) {
  console.log(`\n${'='.repeat(110)}`);
  console.log('FINAL SCORECARD');
  console.log(`${'='.repeat(110)}`);

  const header = '  ' + 'Model'.padEnd(20) + 'Research%'.padEnd(12) + 'Recipe%'.padEnd(12) +
    'Combined%'.padEnd(12) + 'Avg Latency'.padEnd(14) + 'Total Cost'.padEnd(14) + 'Cost/Call';
  console.log(header);
  console.log(`  ${'─'.repeat(100)}`);

  const modelStats = [];

  for (const m of MODELS) {
    let researchTotal = 0, researchMax = 0;
    let recipeTotal = 0, recipeApplicable = 0;
    let totalLatency = 0, latencyCount = 0;
    let totalCost = 0, callCount = 0;

    for (const bean of TEST_BEANS) {
      const p1 = allPhase1[bean.name]?.[m.name];
      if (p1?.success) {
        researchTotal += p1.total;
        researchMax += p1.max;
        totalLatency += p1.elapsed;
        latencyCount++;
        totalCost += p1.cost || 0;
        callCount++;
      }

      const p2 = allPhase2[bean.name]?.[m.name];
      if (p2?.success) {
        recipeTotal += p2.total;
        recipeApplicable += p2.applicable;
        totalLatency += p2.elapsed;
        latencyCount++;
        totalCost += p2.cost || 0;
        callCount++;
      }
    }

    const researchPct = researchMax > 0 ? Math.round((researchTotal / researchMax) * 100) : 0;
    const recipePct = recipeApplicable > 0 ? Math.round((recipeTotal / recipeApplicable) * 100) : 0;
    const combinedPct = Math.round(researchPct * 0.3 + recipePct * 0.7);
    const avgLatency = latencyCount > 0 ? Math.round(totalLatency / latencyCount) : 0;
    const costPerCall = callCount > 0 ? totalCost / callCount : 0;

    console.log(
      `  ${m.name.padEnd(20)}` +
      `${(researchPct + '%').padEnd(12)}` +
      `${(recipePct + '%').padEnd(12)}` +
      `${(combinedPct + '%').padEnd(12)}` +
      `${(avgLatency + 'ms').padEnd(14)}` +
      `${'$' + totalCost.toFixed(4).padEnd(13)}` +
      `$${costPerCall.toFixed(4)}`
    );

    modelStats.push({
      name: m.name, researchPct, recipePct, combinedPct, avgLatency, totalCost, costPerCall, callCount,
    });
  }

  // Consumer scale projection
  console.log(`\n  ${'─'.repeat(100)}`);
  console.log('  CONSUMER SCALE PROJECTION (1,000 recipes/month = 2,000 API calls: 1,000 research + 1,000 recipe)');
  console.log(`  ${'─'.repeat(100)}`);

  for (const s of modelStats) {
    const monthly = s.costPerCall * 2000;
    console.log(`  ${s.name.padEnd(20)} ~$${monthly.toFixed(2)}/month   Quality: ${s.combinedPct}%`);
  }

  // Recommendation
  console.log(`\n  ${'─'.repeat(100)}`);
  console.log('  RECOMMENDATION');
  console.log(`  ${'─'.repeat(100)}`);

  const baseline = modelStats.find(s => s.name === 'GPT-5.4');
  const candidates = modelStats
    .filter(s => s.name !== 'GPT-5.4' && s.combinedPct >= (baseline.combinedPct - 5))
    .sort((a, b) => a.costPerCall - b.costPerCall);

  if (candidates.length === 0) {
    console.log('  No cheaper model matched GPT-5.4 quality (within 5%). GPT-5.4 remains the best option.');
  } else {
    const best = candidates[0];
    const savings = ((1 - best.costPerCall / baseline.costPerCall) * 100).toFixed(0);
    console.log(`  Best alternative: ${best.name}`);
    console.log(`  Quality: ${best.combinedPct}% (baseline: ${baseline.combinedPct}%)`);
    console.log(`  Cost: $${best.costPerCall.toFixed(4)}/call vs $${baseline.costPerCall.toFixed(4)}/call (${savings}% cheaper)`);
    console.log(`  Monthly savings at 1k recipes: $${((baseline.costPerCall - best.costPerCall) * 2000).toFixed(2)}`);
  }

  return modelStats;
}

// ═══════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════

async function main() {
  const totalCalls = MODELS.length * TEST_BEANS.length * 2;
  console.log('Aiden Autoresearch — 6-Model Evaluation Harness');
  console.log(`Testing ${MODELS.length} models x ${TEST_BEANS.length} beans x 2 phases = ${totalCalls} API calls`);
  console.log(`Models: ${MODELS.map(m => m.name).join(', ')}`);
  console.log(`Beans: ${TEST_BEANS.map(b => b.name).join(', ')}`);

  const allPhase1 = {};
  const allPhase2 = {};

  // Phase 1: Research
  console.log(`\n${'='.repeat(110)}`);
  console.log('PHASE 1: RESEARCH (each model independently classifies each bean)');
  console.log(`${'='.repeat(110)}`);

  for (const bean of TEST_BEANS) {
    process.stdout.write(`\n  Testing ${bean.name}...`);
    const results = await runPhase1(bean);
    allPhase1[bean.name] = results;

    const passes = MODELS.map(m => results[m.name]?.success ? results[m.name].total : 'X').join(', ');
    process.stdout.write(` scores: [${passes}]\n`);
    printPhase1Table(bean, results);
  }

  // Phase 2: Recipe (using GPT-5.4 research as shared input)
  console.log(`\n${'='.repeat(110)}`);
  console.log('PHASE 2: RECIPE (all models use GPT-5.4 research as shared input)');
  console.log(`${'='.repeat(110)}`);

  for (const bean of TEST_BEANS) {
    const gptResearch = allPhase1[bean.name]?.['GPT-5.4']?.research;
    if (!gptResearch) {
      console.log(`\n  SKIP ${bean.name}: GPT-5.4 research failed, no shared input available`);
      continue;
    }

    process.stdout.write(`\n  Testing ${bean.name}...`);
    const results = await runPhase2(bean, gptResearch);
    allPhase2[bean.name] = results;

    const passes = MODELS.map(m => {
      const r = results[m.name];
      return r?.success ? `${r.total}/${r.applicable}` : 'X';
    }).join(', ');
    process.stdout.write(` scores: [${passes}]\n`);
    printPhase2Table(bean, results);
  }

  // Final summary
  const modelStats = printSummary(allPhase1, allPhase2);

  // Save results to JSON
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outPath = resolve(__dirname, `autoresearch-results-${timestamp}.json`);
  const output = {
    timestamp: new Date().toISOString(),
    models: MODELS.map(m => ({ name: m.name, model: m.model, provider: m.provider, pricing: m.pricing })),
    beans: TEST_BEANS.map(b => b.name),
    phase1: allPhase1,
    phase2: allPhase2,
    summary: modelStats,
  };
  writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\nResults saved to: ${outPath}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
