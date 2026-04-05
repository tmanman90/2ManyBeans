#!/usr/bin/env node
// Aiden Recipe A/B Test — Compare models side by side
// Usage: node scripts/aiden-ab-test.mjs

import { readFileSync } from 'fs';
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

const ANTHROPIC_KEY = env.ANTHROPIC_API_KEY;
const OPENAI_KEY = env.OPENAI_API_KEY;

if (!ANTHROPIC_KEY) { console.error('Missing ANTHROPIC_API_KEY in .env.local'); process.exit(1); }
if (!OPENAI_KEY) { console.error('Missing OPENAI_API_KEY in .env.local'); process.exit(1); }

// ─── Test Beans ───

const TEST_BEANS = [
  {
    name: 'El Placer',
    roaster: 'Dayglow (Promethium)',
    origin: 'Colombia',
    variety: 'Geisha',
    process: 'Anaerobic White Honey',
    roastDate: '2026-02-05',
    bagNotes: 'gardenia flowers / Earl Grey tea / bergamot',
    bagSize: 100,
    status: 'SEALED',
    peakStatus: 'In Peak (67%)',
    daysSinceRoast: 45,
  },
  {
    name: 'Finca La Fuente',
    roaster: 'Koppi',
    origin: 'Colombia (Tarqui, Huila)',
    variety: 'Pink Bourbon',
    process: 'Washed',
    roastDate: '2026-01-28',
    bagNotes: 'tropical fruits / floral / complex',
    bagSize: 100,
    status: 'SEALED',
    peakStatus: 'In Peak (82%)',
    daysSinceRoast: 53,
  },
  {
    name: 'Mulish',
    roaster: "Apollon's Gold",
    origin: 'Ethiopia',
    variety: 'Heirloom',
    process: 'Washed',
    roastDate: '2025-12-07',
    bagNotes: 'nectarine / honeysuckle / lavender',
    bagSize: 100,
    status: 'SEALED',
    peakStatus: 'Past Peak (+15d)',
    daysSinceRoast: 105,
  },
];

// ─── System Prompts (copied from aiden.js) ───

const REFERENCE_PROFILE_INDEX = `1. Kiss the Hippo Peru El Morito — Peru, Light, Washed, Bourbon/Caturra
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
34. KOS Armando Leivas Dark — Guatemala, Med-Dark, Washed, Caturra`;

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

### Density / Altitude Handling (MANDATORY)
For high-altitude, dense, light-roast coffees:
- increase EARLY ENERGY first (bloom temp, first pulse temps, bloom saturation, shorter intervals)
- do NOT let density automatically push the recipe toward a generic coarser or finer profile
- solve underdevelopment with temperature, bloom, and interval structure before changing family defaults

### Cup-Structure Family Classification (MANDATORY)

Before using any reference profile, classify the coffee into ONE family based on process, varietal, tasting notes, and intended cup structure.

Families:
- Washed Gesha / washed floral Pink Bourbon / washed floral heirloom = WASHED FLORAL CLARITY
- Washed Kenya SL28/SL34 = KENYA CLARITY
- Washed Ethiopia = WASHED ETHIOPIA CLARITY
- Natural Ethiopia / clean-fruit natural = CLEAN NATURAL FRUIT
- Honey / anaerobic / co-ferment / white honey / experimental = PROCESSED CLARITY

Rules:
- The family classification comes BEFORE origin-based reference matching.
- If a generic country/process reference conflicts with the family baseline, trust the family baseline.
- A washed floral Colombia (Gesha, Pink Bourbon, floral profile) must NOT be treated like a generic body-forward washed Colombia.
- Use references to refine pulse count, intervals, and temperatures — not to override family structure.

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
Defaults:
- ratio: 17.0 to 17.5
- bloom ratio: 2.5
- bloom time: 45-50s
- bloom temp: 92-94°C
- single-serve intervals: 25-30s
- batch intervals: 28-32s
- single-serve pulse count: usually 3
- batch pulse count: usually 4
- profile goal: bright fruit clarity, avoid winey heaviness

PROCESSED CLARITY
Examples: honey, anaerobic, white honey, co-ferment, experimental
Defaults:
- ratio: 17.0 to 17.5
- bloom ratio: 2.5
- bloom time: 45-55s
- bloom temp: 92-93°C
- single-serve intervals: 25-30s
- batch intervals: 30-35s
- single-serve pulse count: usually 3
- batch pulse count: usually 4
- profile goal: preserve tea/perfume/florals, avoid syrupy or drying finish

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

## FINAL CHECKLIST — VERIFY BEFORE OUTPUTTING

Before returning your JSON, confirm ALL of the following:
1. AGE: If Past Peak or Fading: did you add ratio +0.5 to +1.0, bloom ratio +0.5, early temps up?
2. INTERVALS: Light washed = 20-25s? (35s+ is WRONG for light washed)
3. KENYA BLOOM: Washed Kenya = 2.5-3.0x bloom? (2.0 or below is WRONG)
4. RATIO SANITY: For light/washed clarity profiles, is ratio >= 16.5 (prefer ~17)?
5. ENERGY FIRST: For dense/high-altitude beans, use hotter bloom + early pulses + shorter intervals before reaching for finer grind.
6. DRYNESS STOP-LOSS: Avoid "fine + slow + hot." If intervals are long, counterbalance with shorter intervals / cooler late pulses.
7. FAMILY CHECK: Did I classify the coffee into the correct cup-structure family first, and did I avoid letting a generic country/process reference override that family?
8. FLORAL CHECK: If the coffee is floral/tea-like, did I avoid both extremes: "fine + slow + hot" AND "coarse + hollow"?
9. BATCH CHECK: If generating a batch recipe, default to 4 pulses unless there is a specific reason to use 3 or 5.

RESPOND WITH ONLY THE JSON OBJECT. No other text.`;

// ─── API Callers ───

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
      model,
      max_tokens: 2000,
      system,
      messages: [{ role: 'user', content: userMsg }],
    }),
  });
  const elapsed = Date.now() - start;
  const data = await res.json();
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${JSON.stringify(data)}`);
  const text = data.content?.map(c => c.text || '').join('') || '';
  const usage = data.usage || {};
  return { text, elapsed, inputTokens: usage.input_tokens, outputTokens: usage.output_tokens };
}

async function callOpenAI(model, system, userMsg) {
  const start = Date.now();
  const body = {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userMsg },
    ],
    max_completion_tokens: 2000,
  };
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const elapsed = Date.now() - start;
  const data = await res.json();
  if (!res.ok) throw new Error(`OpenAI Chat ${res.status}: ${JSON.stringify(data)}`);
  const text = data.choices?.[0]?.message?.content || '';
  const usage = data.usage || {};
  return { text, elapsed, inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens };
}

async function callOpenAIResponses(model, system, userMsg) {
  const start = Date.now();
  const body = {
    model,
    instructions: system,
    input: userMsg,
  };
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const elapsed = Date.now() - start;
  const data = await res.json();
  if (!res.ok) throw new Error(`OpenAI Responses ${res.status}: ${JSON.stringify(data)}`);
  // Extract text from output array
  const text = (data.output || [])
    .filter(item => item.type === 'message')
    .flatMap(item => (item.content || []))
    .filter(c => c.type === 'output_text')
    .map(c => c.text || '')
    .join('');
  const usage = data.usage || {};
  return { text, elapsed, inputTokens: usage.input_tokens, outputTokens: usage.output_tokens };
}

// ─── Validation ───

const VALID_ODE_STEPS = [1,1.1,1.2,2,2.1,2.2,3,3.1,3.2,4,4.1,4.2,5,5.1,5.2,6,6.1,6.2,7,7.1,7.2,8,8.1,8.2,9,9.1,9.2,10,10.1,10.2,11];

function validateRecipe(recipe) {
  const issues = [];

  // Ratio
  if (recipe.ratio < 14 || recipe.ratio > 20) issues.push(`ratio ${recipe.ratio} out of 14-20`);
  if (recipe.ratio % 0.5 !== 0) issues.push(`ratio ${recipe.ratio} not in 0.5 steps`);

  // Bloom
  if (recipe.bloomRatio < 1 || recipe.bloomRatio > 3) issues.push(`bloomRatio ${recipe.bloomRatio} out of 1-3`);
  if (recipe.bloomDuration < 1 || recipe.bloomDuration > 120) issues.push(`bloomDuration ${recipe.bloomDuration} out of 1-120`);
  if (recipe.bloomTemperature < 50 || recipe.bloomTemperature > 99) issues.push(`bloomTemp ${recipe.bloomTemperature} out of 50-99`);

  // SS pulses
  if (recipe.ssPulsesNumber < 1 || recipe.ssPulsesNumber > 10) issues.push(`ssPulses ${recipe.ssPulsesNumber} out of 1-10`);
  if (recipe.ssPulsesInterval < 5 || recipe.ssPulsesInterval > 60) issues.push(`ssInterval ${recipe.ssPulsesInterval} out of 5-60`);
  if (recipe.ssPulseTemperatures?.length !== recipe.ssPulsesNumber) issues.push(`ssTemps length ${recipe.ssPulseTemperatures?.length} != ssPulsesNumber ${recipe.ssPulsesNumber}`);
  for (const t of (recipe.ssPulseTemperatures || [])) {
    if (t < 50 || t > 99) issues.push(`ssTemp ${t} out of 50-99`);
  }

  // Batch pulses
  if (recipe.batchPulsesNumber < 1 || recipe.batchPulsesNumber > 10) issues.push(`batchPulses ${recipe.batchPulsesNumber} out of 1-10`);
  if (recipe.batchPulsesInterval < 5 || recipe.batchPulsesInterval > 60) issues.push(`batchInterval ${recipe.batchPulsesInterval} out of 5-60`);
  if (recipe.batchPulseTemperatures?.length !== recipe.batchPulsesNumber) issues.push(`batchTemps length ${recipe.batchPulseTemperatures?.length} != batchPulsesNumber ${recipe.batchPulsesNumber}`);
  for (const t of (recipe.batchPulseTemperatures || [])) {
    if (t < 50 || t > 99) issues.push(`batchTemp ${t} out of 50-99`);
  }

  // Grind
  const gr = recipe.grindRecommendation;
  if (gr) {
    if (!VALID_ODE_STEPS.includes(gr.singleServe)) issues.push(`SS grind ${gr.singleServe} not valid Ode step`);
    if (!VALID_ODE_STEPS.includes(gr.batch)) issues.push(`Batch grind ${gr.batch} not valid Ode step`);
    if (gr.batch <= gr.singleServe) issues.push(`Batch grind ${gr.batch} not coarser than SS ${gr.singleServe}`);
  } else {
    issues.push('missing grindRecommendation');
  }

  return issues;
}

function extractJSON(text) {
  const clean = text.replace(/```json|```/g, '').trim();
  const match = clean.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

// ─── Models to test ───

const MODELS = [
  { name: 'Claude Sonnet 4.6', provider: 'anthropic', model: 'claude-sonnet-4-6' },
  { name: 'GPT-5.4', provider: 'openai', model: 'gpt-5.4', api: 'chat' },
];

// ─── Run Tests ───

async function testBean(bean) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`BEAN: ${bean.name} (${bean.roaster})`);
  console.log(`${bean.origin} | ${bean.variety} | ${bean.process} | ${bean.peakStatus}`);
  console.log(`${'='.repeat(70)}`);

  const userMsg = `Generate an Aiden brew profile for this coffee:

Name: ${bean.name}
Roaster: ${bean.roaster}
Origin: ${bean.origin}
Variety: ${bean.variety}
Process: ${bean.process}
Roast Date: ${bean.roastDate}
Days Since Roast: ${bean.daysSinceRoast}
Peak Status: ${bean.peakStatus}
Bag Notes: ${bean.bagNotes}`;

  const results = [];

  for (const m of MODELS) {
    process.stdout.write(`  Testing ${m.name}... `);
    try {
      let result;
      if (m.provider === 'anthropic') {
        result = await callAnthropic(m.model, AIDEN_SYSTEM, userMsg);
      } else if (m.api === 'responses') {
        result = await callOpenAIResponses(m.model, AIDEN_SYSTEM, userMsg);
      } else {
        result = await callOpenAI(m.model, AIDEN_SYSTEM, userMsg);
      }

      const recipe = extractJSON(result.text);
      if (!recipe) {
        console.log(`FAIL (no valid JSON)`);
        results.push({ model: m.name, success: false, error: 'No JSON', elapsed: result.elapsed, raw: result.text.slice(0, 200) });
        continue;
      }

      const issues = validateRecipe(recipe);
      const pass = issues.length === 0;
      console.log(`${pass ? 'PASS' : 'WARN'} (${result.elapsed}ms, ${result.inputTokens}+${result.outputTokens} tokens)`);
      if (issues.length > 0) console.log(`    Issues: ${issues.join(', ')}`);

      results.push({
        model: m.name,
        success: true,
        pass,
        issues,
        elapsed: result.elapsed,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        recipe,
      });
    } catch (err) {
      console.log(`ERROR: ${err.message.slice(0, 150)}`);
      results.push({ model: m.name, success: false, error: err.message.slice(0, 150) });
    }
  }

  // Print comparison table
  console.log(`\n  ${'─'.repeat(66)}`);
  console.log('  COMPARISON TABLE');
  console.log(`  ${'─'.repeat(66)}`);

  const header = ['Field', ...MODELS.map(m => m.name.padEnd(16))].join(' | ');
  console.log(`  ${header}`);
  console.log(`  ${'─'.repeat(66)}`);

  const fields = ['ratio', 'bloomRatio', 'bloomDuration', 'bloomTemperature',
    'ssPulsesNumber', 'ssPulsesInterval', 'batchPulsesNumber', 'batchPulsesInterval', 'title'];

  for (const f of fields) {
    const vals = results.map(r => {
      if (!r.recipe) return 'N/A'.padEnd(16);
      const v = r.recipe[f];
      return String(v ?? 'N/A').padEnd(16);
    });
    console.log(`  ${f.padEnd(20)} | ${vals.join(' | ')}`);
  }

  // SS temps
  const ssTemps = results.map(r => {
    if (!r.recipe?.ssPulseTemperatures) return 'N/A'.padEnd(16);
    return r.recipe.ssPulseTemperatures.join(',').padEnd(16);
  });
  console.log(`  ${'ssPulseTemps'.padEnd(20)} | ${ssTemps.join(' | ')}`);

  // Batch temps
  const batchTemps = results.map(r => {
    if (!r.recipe?.batchPulseTemperatures) return 'N/A'.padEnd(16);
    return r.recipe.batchPulseTemperatures.join(',').padEnd(16);
  });
  console.log(`  ${'batchPulseTemps'.padEnd(20)} | ${batchTemps.join(' | ')}`);

  // Grind
  const grinds = results.map(r => {
    if (!r.recipe?.grindRecommendation) return 'N/A'.padEnd(16);
    const g = r.recipe.grindRecommendation;
    return `SS${g.singleServe}/B${g.batch}`.padEnd(16);
  });
  console.log(`  ${'grind'.padEnd(20)} | ${grinds.join(' | ')}`);

  // Timing & cost
  console.log(`  ${'─'.repeat(66)}`);
  const times = results.map(r => `${r.elapsed || '?'}ms`.padEnd(16));
  console.log(`  ${'latency'.padEnd(20)} | ${times.join(' | ')}`);
  const tokens = results.map(r => r.inputTokens ? `${r.inputTokens}+${r.outputTokens}`.padEnd(16) : 'N/A'.padEnd(16));
  console.log(`  ${'tokens (in+out)'.padEnd(20)} | ${tokens.join(' | ')}`);
  const validations = results.map(r => {
    if (!r.success) return 'FAIL'.padEnd(16);
    return (r.issues?.length === 0 ? 'PASS' : `${r.issues.length} issues`).padEnd(16);
  });
  console.log(`  ${'validation'.padEnd(20)} | ${validations.join(' | ')}`);

  // Print full recipes
  for (const r of results) {
    if (!r.recipe) continue;
    console.log(`\n  ── FULL RECIPE: ${r.model} ──`);
    console.log(JSON.stringify(r.recipe, null, 2).split('\n').map(l => '  ' + l).join('\n'));
  }

  return results;
}

// ─── Main ───

async function main() {
  console.log('Aiden Recipe A/B Test');
  console.log(`Testing ${MODELS.length} models x ${TEST_BEANS.length} beans = ${MODELS.length * TEST_BEANS.length} API calls`);
  console.log('Models:', MODELS.map(m => m.name).join(', '));

  const allResults = [];
  for (const bean of TEST_BEANS) {
    const results = await testBean(bean);
    allResults.push({ bean: bean.name, results });
  }

  // Summary
  console.log(`\n${'='.repeat(70)}`);
  console.log('SUMMARY');
  console.log(`${'='.repeat(70)}`);

  for (const m of MODELS) {
    const modelResults = allResults.map(r => r.results.find(x => x.model === m.name));
    const passes = modelResults.filter(r => r?.pass).length;
    const totalIssues = modelResults.reduce((sum, r) => sum + (r?.issues?.length || 0), 0);
    const avgLatency = Math.round(modelResults.reduce((sum, r) => sum + (r?.elapsed || 0), 0) / modelResults.length);
    console.log(`  ${m.name}: ${passes}/${TEST_BEANS.length} clean passes, ${totalIssues} total issues, avg ${avgLatency}ms`);
  }
}

main().catch(console.error);
