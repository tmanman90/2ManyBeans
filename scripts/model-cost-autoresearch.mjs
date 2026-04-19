#!/usr/bin/env node
// Model Cost Autoresearch — multi-feature, multi-model evaluation harness
// Tests: Handbrew recipes, Bean Research across cheaper model alternatives
// Uses same Karpathy autoresearch pattern as aiden-autoresearch.mjs
// Usage: node scripts/model-cost-autoresearch.mjs

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

const missing = [];
if (!OPENAI_KEY) missing.push('OPENAI_API_KEY');
if (!ANTHROPIC_KEY) missing.push('ANTHROPIC_API_KEY');
if (!GEMINI_KEY) missing.push('GEMINI_API_KEY');
if (missing.length) { console.error(`Missing in .env.local: ${missing.join(', ')}`); process.exit(1); }

// ═══════════════════════════════════════════════
// MODEL REGISTRY (focus on cost-effective alternatives)
// ═══════════════════════════════════════════════

const MODELS = [
  { name: 'GPT-5.4',          provider: 'openai',    model: 'gpt-5.4',                    pricing: { input: 2.50, output: 10.00 } },
  { name: 'GPT-5.4 Mini',     provider: 'openai',    model: 'gpt-5.4-mini',               pricing: { input: 0.40, output: 1.60  } },
  { name: 'Gemini 2.5 Flash', provider: 'gemini',    model: 'gemini-2.5-flash',            pricing: { input: 0.15, output: 0.60  } },
  { name: 'Haiku 4.5',        provider: 'anthropic', model: 'claude-haiku-4-5-20251001',   pricing: { input: 0.80, output: 4.00  } },
];

// ═══════════════════════════════════════════════
// TEST BEANS (8 beans covering all family types)
// ═══════════════════════════════════════════════

const TEST_BEANS = [
  {
    name: 'El Placer', roaster: 'Dayglow (Promethium)', origin: 'Colombia',
    variety: 'Geisha', process: 'Anaerobic White Honey', roastDate: '2026-02-05',
    bagNotes: 'gardenia flowers / Earl Grey tea / bergamot', bagSize: 100,
    peakStatus: 'In Peak (67%)', daysSinceRoast: 58,
    expectedFamily: 'processed-clarity', isLightWashed: false, isPastPeak: false,
  },
  {
    name: 'Finca La Fuente', roaster: 'Koppi', origin: 'Colombia (Tarqui, Huila)',
    variety: 'Pink Bourbon', process: 'Washed', roastDate: '2026-01-28',
    bagNotes: 'tropical fruits / floral / complex', bagSize: 100,
    peakStatus: 'In Peak (82%)', daysSinceRoast: 66,
    expectedFamily: 'washed-floral-clarity', isLightWashed: true, isPastPeak: false,
  },
  {
    name: 'Mulish', roaster: "Apollon's Gold", origin: 'Ethiopia',
    variety: 'Heirloom', process: 'Washed', roastDate: '2025-12-07',
    bagNotes: 'nectarine / honeysuckle / lavender', bagSize: 100,
    peakStatus: 'Past Peak (+15d)', daysSinceRoast: 118,
    expectedFamily: 'washed-ethiopia-clarity', isLightWashed: true, isPastPeak: true,
  },
  {
    name: 'Gichathaini AA', roaster: 'Manhattan Coffee Roasters', origin: 'Kenya (Nyeri)',
    variety: 'SL28, SL34', process: 'Washed', roastDate: '2026-03-10',
    bagNotes: 'blackcurrant / grapefruit / brown sugar / pomelo', bagSize: 250,
    peakStatus: 'In Peak (45%)', daysSinceRoast: 25,
    expectedFamily: 'washed-kenya-clarity', isLightWashed: true, isPastPeak: false,
  },
  {
    name: 'Worka Sakaro', roaster: 'April Coffee', origin: 'Ethiopia (Gedeb, Yirgacheffe)',
    variety: 'Heirloom', process: 'Natural', roastDate: '2026-02-20',
    bagNotes: 'blueberry / strawberry jam / dark chocolate / wine', bagSize: 250,
    peakStatus: 'In Peak (70%)', daysSinceRoast: 43,
    expectedFamily: 'clean-natural-fruit', isLightWashed: false, isPastPeak: false,
  },
  {
    name: 'Antigua Pastores', roaster: 'Counter Culture', origin: 'Guatemala (Antigua)',
    variety: 'Bourbon, Caturra', process: 'Washed', roastDate: '2026-02-15',
    bagNotes: 'milk chocolate / orange / toasted almond / caramel', bagSize: 340,
    peakStatus: 'In Peak (80%)', daysSinceRoast: 48,
    expectedFamily: 'medium-washed', isLightWashed: false, isPastPeak: false,
  },
  {
    name: 'Intango Dark', roaster: 'Counter Culture', origin: 'Rwanda (Nyamasheke)',
    variety: 'Bourbon, Mayaguez, Jackson', process: 'Washed', roastDate: '2026-03-05',
    bagNotes: 'dark chocolate / molasses / dried cherry / smoky', bagSize: 340,
    peakStatus: 'In Peak (40%)', daysSinceRoast: 30,
    expectedFamily: 'dark-roast', isLightWashed: false, isPastPeak: false,
  },
  {
    name: 'Huila Castillo', roaster: 'Onyx Coffee Lab', origin: 'Colombia (Huila)',
    variety: 'Castillo, Caturra', process: 'Washed', roastDate: '2026-01-20',
    bagNotes: 'brown sugar / red apple / nutty / smooth', bagSize: 340,
    peakStatus: 'Past Peak (+5d)', daysSinceRoast: 74,
    expectedFamily: 'medium-washed', isLightWashed: false, isPastPeak: true,
  },
];

// ═══════════════════════════════════════════════
// API CALLERS (same pattern as aiden-autoresearch)
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

async function callModel(m, system, userMsg) {
  switch (m.provider) {
    case 'openai':    return callOpenAI(m.model, system, userMsg);
    case 'anthropic': return callAnthropic(m.model, system, userMsg);
    case 'gemini':    return callGemini(m.model, system, userMsg);
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

function estimateCost(model, inputTokens, outputTokens) {
  if (!model.pricing || !inputTokens) return null;
  return (inputTokens * model.pricing.input + outputTokens * model.pricing.output) / 1_000_000;
}

function sanitize(str, maxLen = 100) {
  return (str || '').slice(0, maxLen).replace(/[^\w .\-',()/]/g, '');
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

// ═══════════════════════════════════════════════
// HANDBREW SYSTEM PROMPT (copied from handbrew.js)
// ═══════════════════════════════════════════════

const HANDBREW_POUROVER_KNOWLEDGE = `
POUR-OVER METHODOLOGY (from James Hoffmann):
- Rinse paper filter under hot water (reduces paper taste, warms device). Use bleached white papers.
- Bloom: Pour ~2x coffee weight in water. Pick up and swirl or stir to wet all grounds. Wait 30 seconds.
- Slowly pour remainder of water directly onto coffee bed (NOT the walls). Weigh as you go.
- When surface is 2-3cm below top, give gentle swirl (prevents grounds sticking to walls).
- Diagnostic: flat, even bed = good extraction. Sloped/cratered bed = channeling (pour more evenly).
- Troubleshooting: Bitter = grind coarser. Sour/weak/astringent = grind finer. Change ONE variable at a time.

EXTRACTION SCIENCE:
- Target: 18-22% extraction of ground coffee by weight.
- Under-extracted: sour, sharp, lacking sweetness. Fix: grind finer, brew longer, hotter water.
- Over-extracted: bitter, harsh, astringent. Fix: grind coarser, brew shorter, cooler water.
- Finer grind = more extraction per unit time AND slower flow rate (double effect).
- Stirring/agitation increases extraction. Pour-over: gentle swirl after pours.

WATER:
- Water is 98.5% of filter coffee by volume. It matters.
- Hard water = cups lacking nuance and sweetness. Soft to moderate ideal.
`;

const GRINDER_POUROVER_STARTS = {
  'fellow-ode-gen2': {
    label: 'Fellow Ode Gen 2', scale: '1-11 with .1/.2 sub-steps',
    pourOverStart: { light: 4.5, medium: 5.5, dark: 7.0 },
    validRange: { min: 4, max: 8 },
    aidenNote: 'Aiden light roast uses 3.1-4.0. Pour-over must be coarser (4+).',
  },
};

const FAMILY_POUROVER_DEFAULTS = {
  'washed-floral-clarity': { ratio: '1:15.5 to 1:16', tempC: '97-100', bloom: '2-3x, 30-45s', grindDirection: 'finer end of pour-over range', technique: 'Hoffmann classic', notes: 'Push extraction for clarity. Full boil OK.' },
  'washed-ethiopia-clarity': { ratio: '1:15.5 to 1:16', tempC: '97-100', bloom: '2-3x, 30-45s', grindDirection: 'finer end of pour-over range', technique: 'Hoffmann classic', notes: 'Dense, high-altitude. Needs heat.' },
  'washed-kenya-clarity': { ratio: '1:15.5 to 1:16', tempC: '97-100', bloom: '2x, 30s', grindDirection: 'finer end of pour-over range', technique: 'Hoffmann classic', notes: 'Bright, juicy.' },
  'clean-natural-fruit': { ratio: '1:15 to 1:15.5', tempC: '95-98', bloom: '2x, 30s', grindDirection: 'slightly coarser than washed', technique: 'Kasuya 4:6', notes: 'Higher solubility from fruit sugars.' },
  'processed-clarity': { ratio: '1:15.5 to 1:16', tempC: '95-98', bloom: '2x, 30s', grindDirection: 'slightly coarser than washed', technique: 'Hoffmann or Kasuya 4:6', notes: 'Honey/anaerobic.' },
  'medium-washed': { ratio: '1:16', tempC: '93-96', bloom: '2x, 30s', grindDirection: 'middle of pour-over range', technique: 'Hoffmann classic', notes: 'Balanced extraction.' },
  'dark-roast': { ratio: '1:17 to 1:18', tempC: '88-93', bloom: '2x, 25s', grindDirection: 'coarser end of pour-over range', technique: 'Hoffmann classic', notes: 'Very porous. Low temp, coarse grind, wider ratio.' },
};

function buildHandBrewPrompt(family, roastLevel) {
  const grinder = GRINDER_POUROVER_STARTS['fellow-ode-gen2'];
  const familyDefaults = FAMILY_POUROVER_DEFAULTS[family] || FAMILY_POUROVER_DEFAULTS['medium-washed'];
  const grindTier = (roastLevel || '').includes('dark') ? 'dark' : (roastLevel || '').includes('medium') ? 'medium' : 'light';
  const startAt = grinder.pourOverStart[grindTier];

  return `You are a specialty coffee brew guide. Generate a custom pour-over recipe tailored to THIS specific bean.

GRINDER: ${grinder.label} (${grinder.scale})
- Pour-over start point for ${grindTier} roast: ${startAt}
- Valid pour-over range: ${grinder.validRange.min} to ${grinder.validRange.max}
${grinder.aidenNote ? `- ${grinder.aidenNote}` : ''}
- Recommend grind in this grinder's native notation (e.g., "${startAt}")
- Also include approximate micron value

${HANDBREW_POUROVER_KNOWLEDGE}

BEAN'S FAMILY DEFAULTS (use as your starting parameters, adjust based on bean specifics):
- Family: ${family}
- Ratio: ${familyDefaults.ratio}
- Water temperature: ${familyDefaults.tempC}C
- Bloom: ${familyDefaults.bloom}
- Grind direction: ${familyDefaults.grindDirection}
- Recommended technique: ${familyDefaults.technique}
- Notes: ${familyDefaults.notes}

TECHNIQUE OPTIONS (choose the best for this bean, or blend approaches):
- Hoffmann Classic: all-rounder, bloom then 2-3 pours to target weight, gentle swirl after each pour, target 2:30-3:30. Best for washed beans, light-to-medium roasts, and when you want even extraction.
- Kasuya 4:6: best for naturals and flavor tuning, slightly coarser grind, 5 pours at 45s intervals. First 2 pours (40%) control sweetness/acidity balance, last 3 (60%) control strength. Great for experimenting with flavor profile.

OUTPUT FORMAT (JSON only, no markdown, no backticks):
{
  "method": "pour-over",
  "technique": string ("hoffmann" | "kasuya-46"),
  "coffeeGrams": number,
  "waterGrams": number,
  "ratio": string (e.g., "1:15.5"),
  "grindSize": { "setting": string, "description": string, "microns": number },
  "waterTemp": { "celsius": number, "fahrenheit": number },
  "steps": [
    { "time": string, "action": string, "waterTotal": number }
  ],
  "totalBrewTime": string,
  "tips": string (tasting expectations + adjustment advice),
  "title": string (bean name + technique),
  "reasoning": string (1-2 sentences: why these parameters for this bean)
}

FINAL CHECKLIST (verify before outputting):
- Ratio MUST match the family defaults above, NOT 1:16.7 for every bean.
- Grind setting MUST be within the grinder's valid pour-over range provided above.
- Water temperature MUST vary with roast level (light = hotter, dark = cooler).
- Technique should start from the family recommendation, but choose whichever best serves this bean.
- Bloom duration and water MUST vary (light roasts get longer/more bloom).
- Steps must have ascending waterTotal values.

RESPOND WITH ONLY THE JSON OBJECT.`;
}

// ═══════════════════════════════════════════════
// RESEARCH SYSTEM PROMPT (from beanResearch.js)
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
  "cupStructureFamily": "one of: washed-floral-clarity | washed-kenya-clarity | washed-ethiopia-clarity | clean-natural-fruit | processed-clarity | medium-washed | dark-roast",
  "closestReferenceProfiles": [
    { "number": 1, "name": "profile name", "why": "brief reason this is a close match" }
  ]
}

IMPORTANT: cupStructureFamily is based on the coffee's CUP STRUCTURE, not just its country of origin.
- "washed-floral-clarity" = washed Gesha, washed floral Pink Bourbon, washed floral heirloom. Notes: jasmine, bergamot, florals.
- "washed-kenya-clarity" = washed Kenya SL28/SL34 with pomelo, hibiscus, berry.
- "washed-ethiopia-clarity" = classic washed Ethiopia with bergamot, white florals, citrus, tea.
- "clean-natural-fruit" = natural Ethiopia with strawberry, mango, lychee, tropical fruit.
- "processed-clarity" = honey, anaerobic, co-ferment, experimental processing.
- "medium-washed" = medium roast washed coffees prioritizing body over clarity
- "dark-roast" = any dark or medium-dark roast

For closestReferenceProfiles, select 2-3 most similar from this database:

${REFERENCE_PROFILE_INDEX}

RESPOND WITH ONLY THE JSON OBJECT.`;

// ═══════════════════════════════════════════════
// SCORING: HANDBREW RECIPE
// ═══════════════════════════════════════════════

const VALID_FAMILIES = [
  'washed-floral-clarity', 'washed-kenya-clarity', 'washed-ethiopia-clarity',
  'clean-natural-fruit', 'processed-clarity', 'medium-washed', 'dark-roast',
];

const VALID_ROAST_LEVELS = ['ultra-light', 'light', 'light-medium', 'medium', 'medium-dark', 'dark'];

function scoreHandbrewRecipe(recipe, bean) {
  const scores = {};
  let applicable = 0;

  // H1: Valid JSON with required fields
  const required = ['method', 'technique', 'coffeeGrams', 'waterGrams', 'ratio', 'grindSize', 'waterTemp', 'steps'];
  scores.H1 = recipe !== null && required.every(f => recipe[f] !== undefined);
  applicable++;
  if (!recipe) return { scores, total: 0, max: 1, applicable: 1 };

  // H2: Correct types
  scores.H2 = typeof recipe.coffeeGrams === 'number' &&
    typeof recipe.waterGrams === 'number' &&
    typeof recipe.ratio === 'string' &&
    Array.isArray(recipe.steps) && recipe.steps.length > 0;
  applicable++;

  // H3: Technique is valid
  scores.H3 = ['hoffmann', 'kasuya-46'].includes(recipe.technique);
  applicable++;

  // H4: Grind setting within Ode Gen 2 pour-over range (4-8)
  const grindSetting = parseFloat(recipe.grindSize?.setting);
  scores.H4 = !isNaN(grindSetting) && grindSetting >= 4 && grindSetting <= 8;
  applicable++;

  // H5: Ratio matches family expectation (not a one-size-fits-all)
  const ratioMatch = recipe.ratio?.match(/1:([\d.]+)/);
  const ratioVal = ratioMatch ? parseFloat(ratioMatch[1]) : null;
  scores.H5 = ratioVal !== null && ratioVal >= 14 && ratioVal <= 19;
  applicable++;

  // H6: Water temp varies with roast (light=hot, dark=cool)
  const tempC = recipe.waterTemp?.celsius;
  if (bean.expectedFamily === 'dark-roast') {
    scores.H6 = typeof tempC === 'number' && tempC >= 83 && tempC <= 95;
  } else if (bean.isLightWashed) {
    scores.H6 = typeof tempC === 'number' && tempC >= 95 && tempC <= 100;
  } else {
    scores.H6 = typeof tempC === 'number' && tempC >= 83 && tempC <= 100;
  }
  applicable++;

  // H7: Steps have ascending waterTotal
  if (Array.isArray(recipe.steps) && recipe.steps.length > 1) {
    let ascending = true;
    let lastTotal = 0;
    for (const step of recipe.steps) {
      if (step.waterTotal != null) {
        if (step.waterTotal < lastTotal) ascending = false;
        lastTotal = step.waterTotal;
      }
    }
    scores.H7 = ascending;
    applicable++;
  }

  // H8: Coffee/water ratio matches stated ratio
  if (ratioVal && recipe.coffeeGrams && recipe.waterGrams) {
    const actualRatio = recipe.waterGrams / recipe.coffeeGrams;
    scores.H8 = Math.abs(actualRatio - ratioVal) < 1.0; // within 1g tolerance
    applicable++;
  }

  // H9: Has reasoning and tips (quality content)
  scores.H9 = typeof recipe.reasoning === 'string' && recipe.reasoning.length > 10 &&
    typeof recipe.tips === 'string' && recipe.tips.length > 10;
  applicable++;

  // H10: Microns in reasonable range (300-900 for pour-over)
  const microns = recipe.grindSize?.microns;
  scores.H10 = typeof microns === 'number' && microns >= 300 && microns <= 900;
  applicable++;

  // H11: Technique matches family recommendation
  if (bean.expectedFamily === 'clean-natural-fruit') {
    scores.H11 = recipe.technique === 'kasuya-46'; // naturals should get Kasuya
    applicable++;
  } else if (bean.expectedFamily === 'washed-floral-clarity' || bean.expectedFamily === 'washed-ethiopia-clarity' || bean.expectedFamily === 'washed-kenya-clarity') {
    scores.H11 = recipe.technique === 'hoffmann'; // washed clarity should get Hoffmann
    applicable++;
  }

  // H12: Past peak beans should have wider ratio (>= 1:16 at minimum)
  if (bean.isPastPeak && ratioVal) {
    scores.H12 = ratioVal >= 16.0;
    applicable++;
  }

  const total = Object.values(scores).filter(v => v === true).length;
  return { scores, total, max: Object.keys(scores).length, applicable };
}

// ═══════════════════════════════════════════════
// SCORING: BEAN RESEARCH
// ═══════════════════════════════════════════════

function scoreResearch(research, bean) {
  const scores = {};

  // R1: Valid JSON
  scores.R1 = research !== null;
  if (!research) return { scores, total: 0, max: 6 };

  // R2: cupStructureFamily is valid enum
  scores.R2 = VALID_FAMILIES.includes(research.cupStructureFamily);

  // R3: Family matches expected
  scores.R3 = research.cupStructureFamily === bean.expectedFamily;

  // R4: closestReferenceProfiles has 2-3 entries with valid numbers
  const refs = research.closestReferenceProfiles;
  scores.R4 = Array.isArray(refs) && refs.length >= 2 && refs.length <= 3 &&
    refs.every(r => Number.isInteger(r.number) && r.number >= 1 && r.number <= 34);

  // R5: roastLevel is valid enum
  scores.R5 = VALID_ROAST_LEVELS.includes(research.roastLevel);

  // R6: densityEstimate is valid enum
  scores.R6 = ['high', 'medium', 'low'].includes(research.densityEstimate);

  const total = Object.values(scores).filter(Boolean).length;
  return { scores, total, max: 6 };
}

// ═══════════════════════════════════════════════
// MAP EXPECTED FAMILY TO POUR-OVER FAMILY
// (The handbrew uses 7 families, test beans may have Aiden-specific families)
// ═══════════════════════════════════════════════

function mapToHandbrewFamily(expectedFamily) {
  const map = {
    'washed-floral-clarity': 'washed-floral-clarity',
    'washed-ethiopia-clarity': 'washed-ethiopia-clarity',
    'washed-kenya-clarity': 'washed-kenya-clarity',
    'clean-natural-fruit': 'clean-natural-fruit',
    'processed-clarity': 'processed-clarity',
    'honey-anaerobic': 'processed-clarity',
    'washed-colombia-clarity': 'washed-floral-clarity',
    'washed-central-america': 'medium-washed',
    'medium-washed': 'medium-washed',
    'dark-roast': 'dark-roast',
    'natural-ethiopia-fruit': 'clean-natural-fruit',
    'washed-gesha-clarity': 'washed-floral-clarity',
  };
  return map[expectedFamily] || 'medium-washed';
}

// ═══════════════════════════════════════════════
// TEST RUNNER
// ═══════════════════════════════════════════════

async function runHandbrewTest(bean) {
  const family = mapToHandbrewFamily(bean.expectedFamily);
  const roastLevel = bean.expectedFamily.includes('dark') ? 'dark' :
    bean.expectedFamily.includes('medium') ? 'medium' : 'light';
  const systemPrompt = buildHandBrewPrompt(family, roastLevel);

  let userContent = `Generate a hand brew pour-over recipe for this bean:

${sanitize(buildBeanDescription(bean), 500)}

BEAN CLASSIFICATION:
- Cup-structure family: ${family}
- Roast level: ${roastLevel}
- Process: ${sanitize(bean.process)}
- Days since roast: ${bean.daysSinceRoast}
- Peak status: ${bean.peakStatus}`;

  const results = {};

  const promises = MODELS.map(async (m) => {
    try {
      const raw = await callModel(m, systemPrompt, userContent);
      const recipe = extractJSON(raw.text);
      const { scores, total, max, applicable } = scoreHandbrewRecipe(recipe, bean);
      const cost = estimateCost(m, raw.inputTokens, raw.outputTokens);
      results[m.name] = {
        success: true, recipe, scores, total, max, applicable,
        elapsed: raw.elapsed, inputTokens: raw.inputTokens, outputTokens: raw.outputTokens, cost,
      };
    } catch (err) {
      results[m.name] = { success: false, error: err.message.slice(0, 200), scores: {}, total: 0, max: 0, applicable: 0 };
    }
  });

  await Promise.allSettled(promises);
  return results;
}

async function runResearchTest(bean) {
  const userMsg = `Research this coffee bean:\n\n${buildBeanDescription(bean)}`;
  const results = {};

  const promises = MODELS.map(async (m) => {
    try {
      const raw = await callModel(m, RESEARCH_SYSTEM, userMsg);
      const research = extractJSON(raw.text);
      const { scores, total, max } = scoreResearch(research, bean);
      const cost = estimateCost(m, raw.inputTokens, raw.outputTokens);
      results[m.name] = {
        success: true, research, scores, total, max,
        elapsed: raw.elapsed, inputTokens: raw.inputTokens, outputTokens: raw.outputTokens, cost,
      };
    } catch (err) {
      results[m.name] = { success: false, error: err.message.slice(0, 200), scores: {}, total: 0, max: 6 };
    }
  });

  await Promise.allSettled(promises);
  return results;
}

// ═══════════════════════════════════════════════
// OUTPUT FORMATTING
// ═══════════════════════════════════════════════

function printTable(title, bean, results, maxField) {
  console.log(`\n  ${title} — ${bean.name} (${bean.expectedFamily})`);
  console.log(`  ${'─'.repeat(95)}`);
  const header = '  ' + 'Model'.padEnd(20) + 'Score'.padEnd(12) + 'Failures'.padEnd(35) + 'Time'.padEnd(10) + 'Cost';
  console.log(header);
  console.log(`  ${'─'.repeat(95)}`);

  for (const m of MODELS) {
    const r = results[m.name];
    if (!r?.success) {
      console.log(`  ${m.name.padEnd(20)}${'ERROR'.padEnd(12)}${(r?.error || '').slice(0, 35).padEnd(35)}${''.padEnd(10)}`);
      continue;
    }
    const score = `${r.total}/${r[maxField]}`.padEnd(12);
    const failures = Object.entries(r.scores).filter(([, v]) => v === false).map(([k]) => k).join(',') || 'none';
    const time = `${r.elapsed}ms`.padEnd(10);
    const cost = r.cost ? `$${r.cost.toFixed(5)}` : 'N/A';
    console.log(`  ${m.name.padEnd(20)}${score}${failures.padEnd(35)}${time}${cost}`);
  }
}

function printSummary(allResults, feature, maxField) {
  console.log(`\n${'═'.repeat(100)}`);
  console.log(`  ${feature} SUMMARY — AGGREGATE SCORES`);
  console.log(`${'═'.repeat(100)}`);

  const header = '  ' + 'Model'.padEnd(20) + 'Avg Score'.padEnd(12) + 'Pass Rate'.padEnd(12) + 'Avg Time'.padEnd(12) + 'Total Cost'.padEnd(14) + 'Cost/call';
  console.log(header);
  console.log(`  ${'─'.repeat(90)}`);

  for (const m of MODELS) {
    let totalScore = 0, totalMax = 0, totalTime = 0, totalCost = 0, count = 0;
    for (const beanResults of allResults) {
      const r = beanResults[m.name];
      if (r?.success) {
        totalScore += r.total;
        totalMax += r[maxField];
        totalTime += r.elapsed;
        totalCost += r.cost || 0;
        count++;
      }
    }
    if (count === 0) {
      console.log(`  ${m.name.padEnd(20)}${'NO DATA'.padEnd(12)}`);
      continue;
    }
    const avgScore = (totalScore / totalMax * 100).toFixed(1);
    const passRate = `${totalScore}/${totalMax}`.padEnd(12);
    const avgTime = `${Math.round(totalTime / count)}ms`.padEnd(12);
    const costTotal = `$${totalCost.toFixed(5)}`.padEnd(14);
    const costPerCall = `$${(totalCost / count).toFixed(5)}`;
    console.log(`  ${m.name.padEnd(20)}${(avgScore + '%').padEnd(12)}${passRate}${avgTime}${costTotal}${costPerCall}`);
  }
}

function printRecipeComparison(allResults) {
  console.log(`\n${'═'.repeat(100)}`);
  console.log(`  HANDBREW RECIPE PARAMETER COMPARISON (spot check)`);
  console.log(`${'═'.repeat(100)}`);

  // Show first 3 beans' key recipe params across models
  const beansToShow = TEST_BEANS.slice(0, 3);
  for (let i = 0; i < beansToShow.length; i++) {
    const bean = beansToShow[i];
    console.log(`\n  ${bean.name} (${bean.expectedFamily}):`);
    console.log(`  ${'─'.repeat(90)}`);
    const header = '  ' + 'Model'.padEnd(20) + 'Ratio'.padEnd(10) + 'Grind'.padEnd(8) + 'Temp'.padEnd(8) + 'Tech'.padEnd(14) + 'Steps'.padEnd(8) + 'Tips len';
    console.log(header);

    for (const m of MODELS) {
      const r = allResults[i]?.[m.name];
      if (!r?.success || !r.recipe) { console.log(`  ${m.name.padEnd(20)}ERROR`); continue; }
      const rec = r.recipe;
      const ratio = (rec.ratio || 'N/A').padEnd(10);
      const grind = (rec.grindSize?.setting || 'N/A').toString().padEnd(8);
      const temp = (rec.waterTemp?.celsius ? `${rec.waterTemp.celsius}C` : 'N/A').padEnd(8);
      const tech = (rec.technique || 'N/A').padEnd(14);
      const steps = (rec.steps?.length?.toString() || '0').padEnd(8);
      const tips = (rec.tips?.length?.toString() || '0');
      console.log(`  ${m.name.padEnd(20)}${ratio}${grind}${temp}${tech}${steps}${tips}`);
    }
  }
}

// ═══════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║  MODEL COST AUTORESEARCH — Handbrew + Research Optimization        ║');
  console.log('║  Testing: GPT-5.4 vs GPT-5.4 Mini vs Gemini Flash vs Haiku 4.5    ║');
  console.log(`║  Date: ${new Date().toISOString().slice(0, 19)}                               ║`);
  console.log('╚══════════════════════════════════════════════════════════════════════╝');

  // ── PHASE 1: HANDBREW RECIPES ──
  console.log('\n\n' + '▓'.repeat(100));
  console.log('  PHASE 1: HANDBREW RECIPE GENERATION (4 models x 8 beans = 32 calls)');
  console.log('▓'.repeat(100));

  const handbrewResults = [];
  for (const bean of TEST_BEANS) {
    process.stdout.write(`\n  Testing: ${bean.name}...`);
    const results = await runHandbrewTest(bean);
    handbrewResults.push(results);
    printTable('HANDBREW', bean, results, 'max');
  }
  printSummary(handbrewResults, 'HANDBREW RECIPE', 'max');
  printRecipeComparison(handbrewResults);

  // ── PHASE 2: BEAN RESEARCH ──
  console.log('\n\n' + '▓'.repeat(100));
  console.log('  PHASE 2: BEAN RESEARCH (4 models x 8 beans = 32 calls)');
  console.log('▓'.repeat(100));

  const researchResults = [];
  for (const bean of TEST_BEANS) {
    process.stdout.write(`\n  Testing: ${bean.name}...`);
    const results = await runResearchTest(bean);
    researchResults.push(results);
    printTable('RESEARCH', bean, results, 'max');
  }
  printSummary(researchResults, 'BEAN RESEARCH', 'max');

  // ── COST PROJECTION ──
  console.log('\n\n' + '═'.repeat(100));
  console.log('  MONTHLY COST PROJECTION @ 10,000 USERS');
  console.log('═'.repeat(100));

  const projections = {};
  for (const m of MODELS) {
    let hbCost = 0, hbCount = 0, resCost = 0, resCount = 0;
    for (const r of handbrewResults) {
      if (r[m.name]?.cost) { hbCost += r[m.name].cost; hbCount++; }
    }
    for (const r of researchResults) {
      if (r[m.name]?.cost) { resCost += r[m.name].cost; resCount++; }
    }
    const avgHb = hbCount ? hbCost / hbCount : 0;
    const avgRes = resCount ? resCost / resCount : 0;
    // 10k users x 2 handbrews/week x 4.3 weeks = 86k calls/mo
    // 10k users x 1 research/bean x 2 beans/week x 4.3 weeks = 86k calls/mo
    const monthlyHb = avgHb * 86000;
    const monthlyRes = avgRes * 86000;
    projections[m.name] = { avgHb, avgRes, monthlyHb, monthlyRes, total: monthlyHb + monthlyRes };
  }

  const header = '  ' + 'Model'.padEnd(20) + 'HB $/call'.padEnd(14) + 'HB $/mo'.padEnd(14) + 'Res $/call'.padEnd(14) + 'Res $/mo'.padEnd(14) + 'Total $/mo';
  console.log(header);
  console.log(`  ${'─'.repeat(90)}`);
  for (const m of MODELS) {
    const p = projections[m.name];
    console.log(`  ${m.name.padEnd(20)}$${p.avgHb.toFixed(5).padEnd(13)}$${p.monthlyHb.toFixed(0).padStart(6).padEnd(13)}$${p.avgRes.toFixed(5).padEnd(13)}$${p.monthlyRes.toFixed(0).padStart(6).padEnd(13)}$${p.total.toFixed(0)}`);
  }

  // ── SAVE RESULTS ──
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outputPath = resolve(__dirname, `model-cost-results-${timestamp}.json`);
  const output = {
    timestamp: new Date().toISOString(),
    models: MODELS.map(m => ({ name: m.name, model: m.model, pricing: m.pricing })),
    beans: TEST_BEANS.map(b => ({ name: b.name, expectedFamily: b.expectedFamily })),
    handbrewResults,
    researchResults,
    projections,
  };
  writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`\n  Results saved: ${outputPath}`);

  console.log('\n  DONE.\n');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
