// Hand brew recipe generation — research-driven pour-over recipes via GPT-5.4
// Mirrors the Aiden two-step pattern: researchBean() -> generateHandBrewRecipe()
// Grinder data + family defaults + enforcement layer co-located here (like aiden.js)

import { API_BASE } from './apiBase';
import { fetchWithRetry } from './fetchWithRetry';
import { buildBeanDescription } from './beanResearch';
import { HANDBREW_POUROVER_KNOWLEDGE, getOriginContext } from './coffeeKnowledge';

const PROXY_URL = `${API_BASE}/api/openai`;

// ---------------------------------------------------------------------------
// Grinder pour-over start points (mirrors Aiden's FAMILY_GRIND_BANDS pattern)
// One anchor value per roast level per grinder. GPT gets only the user's grinder.
// validRange is used by repairHandBrewRecipe() for post-generation clamping.
// Source: Fellow official manual (pour-over 4-8), Fellow Brew Talks recipes,
// Coffeetime/Home-barista forum data, cross-referenced with Aiden research.
// ---------------------------------------------------------------------------
const GRINDER_POUROVER_STARTS = {
  'fellow-ode-gen2': {
    label: 'Fellow Ode Gen 2',
    scale: '1-11 with .1/.2 sub-steps',
    pourOverStart: { light: 4.5, medium: 5.5, dark: 7.0 },
    validRange: { min: 4, max: 8 },
    aidenNote: 'Aiden light roast uses 3.1-4.0. Pour-over must be coarser (4+).',
  },
  'fellow-opus': {
    label: 'Fellow Opus',
    scale: '1-6 with 10 clicks per number',
    pourOverStart: { light: 4.0, medium: 5.0, dark: 6.0 },
    validRange: { min: 3, max: 6.5 },
  },
  'baratza-encore-esp': {
    label: 'Baratza Encore ESP',
    scale: '40 steps, 1-40',
    pourOverStart: { light: 15, medium: 20, dark: 25 },
    validRange: { min: 10, max: 32 },
  },
  'comandante-c40': {
    label: 'Comandante C40 MK4',
    scale: '~40 clicks, 0-40',
    pourOverStart: { light: 22, medium: 28, dark: 32 },
    validRange: { min: 18, max: 38 },
  },
  '1zpresso-jx-pro': {
    label: '1Zpresso JX-Pro',
    scale: '~200 clicks, 0-200',
    pourOverStart: { light: 90, medium: 110, dark: 130 },
    validRange: { min: 70, max: 150 },
  },
  'baratza-virtuoso-plus': {
    label: 'Baratza Virtuoso+',
    scale: '40 steps, 1-40',
    pourOverStart: { light: 15, medium: 20, dark: 25 },
    validRange: { min: 10, max: 32 },
  },
};

// ---------------------------------------------------------------------------
// Cup-structure family pour-over defaults (mirrors Aiden's per-family baselines)
// Uses the same 7 families returned by beanResearch.js cupStructureFamily field.
// ---------------------------------------------------------------------------
const FAMILY_POUROVER_DEFAULTS = {
  'washed-floral-clarity': {
    ratio: '1:15.5 to 1:16', tempC: '97-100', bloom: '2-3x, 30-45s',
    grindDirection: 'finer end of pour-over range',
    technique: 'Hoffmann or Hedrick 1-2-1 (extended bloom helps with florals)',
    notes: 'Push extraction for clarity. Full boil OK.',
  },
  'washed-ethiopia-clarity': {
    ratio: '1:15.5 to 1:16', tempC: '97-100', bloom: '2-3x, 30-45s',
    grindDirection: 'finer end of pour-over range',
    technique: 'Hedrick 1-2-1 (extended bloom maximizes floral/citrus clarity)',
    notes: 'Dense, high-altitude. Needs heat. Expect bergamot, jasmine, citrus.',
  },
  'washed-kenya-clarity': {
    ratio: '1:15.5 to 1:16', tempC: '97-100', bloom: '2x, 30s',
    grindDirection: 'finer end of pour-over range',
    technique: 'Hoffmann classic (bright acidity benefits from even extraction)',
    notes: 'Bright, juicy. Blackcurrant, tomato, grapefruit.',
  },
  'clean-natural-fruit': {
    ratio: '1:15 to 1:15.5', tempC: '95-98', bloom: '2x, 30s',
    grindDirection: 'slightly coarser than washed (lower density, drains faster)',
    technique: 'Kasuya 4:6 (flavor tuning controls sweetness/fruit balance)',
    notes: 'Higher solubility from fruit sugars. Gentler pours. Risk of over-extraction.',
  },
  'processed-clarity': {
    ratio: '1:15.5 to 1:16', tempC: '95-98', bloom: '2x, 30s',
    grindDirection: 'slightly coarser than washed',
    technique: 'Hoffmann or Kasuya 4:6',
    notes: 'Honey/anaerobic. Between washed and natural in behavior.',
  },
  'medium-washed': {
    ratio: '1:16', tempC: '93-96', bloom: '2x, 30s',
    grindDirection: 'middle of pour-over range',
    technique: 'Hoffmann classic (standard approach works well)',
    notes: 'Balanced extraction. Good starting point.',
  },
  'dark-roast': {
    ratio: '1:17 to 1:18', tempC: '88-93', bloom: '2x, 25s',
    grindDirection: 'coarser end of pour-over range',
    technique: 'Hoffmann classic (gentle, prevent over-extraction)',
    notes: 'Very porous. Low temp, coarse grind, wider ratio.',
  },
};

const DEFAULT_POUROVER_FAMILY = 'medium-washed';

// ---------------------------------------------------------------------------
// Family fallback — replicates Aiden's classifyFamilyFallback() logic
// Used when research doesn't return a cupStructureFamily
// ---------------------------------------------------------------------------
function classifyFamilyFallback(bean) {
  const origin = (bean.origin || '').toLowerCase();
  const process = (bean.process || '').toLowerCase();
  const variety = (bean.variety || '').toLowerCase();
  const roastLevel = (bean.roastLevel || '').toLowerCase();
  const notes = (bean.bagNotes || '').toLowerCase();

  if (roastLevel.includes('dark') || roastLevel === 'medium-dark') return 'dark-roast';
  if (roastLevel === 'medium' && process.includes('washed')) return 'medium-washed';
  if (process.includes('honey') || process.includes('anaerobic') || process.includes('co-ferment')) return 'processed-clarity';
  if (variety.includes('gesha') || variety.includes('geisha')) return 'washed-floral-clarity';
  if (process.includes('natural') && origin.includes('ethiopia')) return 'clean-natural-fruit';
  if (process.includes('washed') || (!process.includes('natural') && !process.includes('honey'))) {
    if (origin.includes('kenya')) return 'washed-kenya-clarity';
    if (origin.includes('ethiopia')) return 'washed-ethiopia-clarity';
    if (notes.includes('jasmine') || notes.includes('bergamot') || notes.includes('floral')) return 'washed-floral-clarity';
  }
  if (process.includes('natural')) return 'clean-natural-fruit';
  return DEFAULT_POUROVER_FAMILY;
}

// Map roast level to grind tier for grinder lookup
function roastToGrindTier(roastLevel) {
  const r = (roastLevel || '').toLowerCase();
  if (r.includes('dark') || r === 'medium-dark') return 'dark';
  if (r === 'medium' || r === 'light-medium') return 'medium';
  return 'light'; // ultra-light, light, or unknown default to light
}

// ---------------------------------------------------------------------------
// Post-generation enforcement (mirrors Aiden's repairRecipe pattern)
// Clamps GPT output to valid ranges. Logs warnings but never rejects.
// ---------------------------------------------------------------------------
function repairHandBrewRecipe(recipe, grinderKey, family) {
  const grinder = GRINDER_POUROVER_STARTS[grinderKey];
  const defaults = FAMILY_POUROVER_DEFAULTS[family] || FAMILY_POUROVER_DEFAULTS[DEFAULT_POUROVER_FAMILY];
  const repairs = [];

  // 1. Clamp grind setting to valid pour-over range (skip for custom/"other" grinders)
  if (grinder && recipe.grindSize?.setting != null) {
    const setting = parseFloat(recipe.grindSize.setting);
    if (!isNaN(setting)) {
      if (setting < grinder.validRange.min) {
        recipe.grindSize.setting = String(grinder.validRange.min);
        repairs.push(`Grind clamped from ${setting} to ${grinder.validRange.min} (below pour-over range)`);
      }
      if (setting > grinder.validRange.max) {
        recipe.grindSize.setting = String(grinder.validRange.max);
        repairs.push(`Grind clamped from ${setting} to ${grinder.validRange.max} (above pour-over range)`);
      }
    }
  }

  // 2. Clamp ratio to valid range (1:14 to 1:19)
  const ratioMatch = recipe.ratio?.match(/1:([\d.]+)/);
  if (ratioMatch) {
    const r = parseFloat(ratioMatch[1]);
    if (r < 14) { recipe.ratio = '1:14'; repairs.push(`Ratio clamped from 1:${r} to 1:14`); }
    if (r > 19) { recipe.ratio = '1:19'; repairs.push(`Ratio clamped from 1:${r} to 1:19`); }
  }

  // 3. Clamp water temperature (83-100C is the valid pour-over range)
  if (recipe.waterTemp?.celsius) {
    const c = recipe.waterTemp.celsius;
    if (c < 83) { recipe.waterTemp.celsius = 83; repairs.push(`Temp clamped from ${c}C to 83C`); }
    if (c > 100) { recipe.waterTemp.celsius = 100; repairs.push(`Temp clamped from ${c}C to 100C`); }
    recipe.waterTemp.fahrenheit = Math.round(recipe.waterTemp.celsius * 9 / 5 + 32);
  }

  // 4. Ensure steps have ascending waterTotal
  if (Array.isArray(recipe.steps)) {
    let lastTotal = 0;
    for (const step of recipe.steps) {
      if (step.waterTotal != null && step.waterTotal < lastTotal) {
        step.waterTotal = lastTotal;
        repairs.push('Fixed non-ascending waterTotal in steps');
      }
      if (step.waterTotal != null) lastTotal = step.waterTotal;
    }
  }

  // 5. Default optional fields
  recipe.reasoning = recipe.reasoning || '';
  recipe.technique = recipe.technique || 'hoffmann';

  if (repairs.length > 0) {
    console.warn('[HandBrew Repair]', repairs.join('; '));
  }

  return recipe;
}

// Sanitize user-controlled bean fields before prompt injection
// Uses literal space (not \s) to block newline injection per security review
function sanitize(str, maxLen = 100) {
  return (str || '').slice(0, maxLen).replace(/[^\w .\-',()/]/g, '');
}

function buildHandBrewPrompt(preferences, family, roastLevel) {
  const grinderKey = preferences?.grinder || 'fellow-ode-gen2';
  const grinder = GRINDER_POUROVER_STARTS[grinderKey];
  const familyDefaults = FAMILY_POUROVER_DEFAULTS[family] || FAMILY_POUROVER_DEFAULTS[DEFAULT_POUROVER_FAMILY];
  const grindTier = roastToGrindTier(roastLevel);

  // Build grinder context: inject only the user's grinder (not all 6)
  let grinderContext;
  if (grinder) {
    const startAt = grinder.pourOverStart[grindTier];
    grinderContext = `GRINDER: ${grinder.label} (${grinder.scale})
- Pour-over start point for ${grindTier} roast: ${startAt}
- Valid pour-over range: ${grinder.validRange.min} to ${grinder.validRange.max}
${grinder.aidenNote ? `- ${grinder.aidenNote}` : ''}
- Recommend grind in this grinder's native notation (e.g., "${startAt}")
- Also include approximate micron value`;
  } else {
    const customName = sanitize(preferences?.grinderCustomName, 60) || 'Custom grinder';
    grinderContext = `GRINDER: ${customName} (custom)
- No specific setting data available. Recommend grind in MICRONS only.
- Light roast pour-over: 400-500 microns. Medium: 500-650. Dark: 650-800.`;
  }

  return `You are a specialty coffee brew guide. Generate a custom pour-over recipe tailored to THIS specific bean.

${grinderContext}

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
- Hoffmann Classic: all-rounder, bloom then 2-3 pours to target weight, gentle swirl, target 2:30-3:30.
- Hedrick 1-2-1: best for light/floral beans, 1 bloom pour, 2-minute extended bloom for full CO2 release, 1 final pour from slight height. Boiling water OK.
- Kasuya 4:6: best for naturals and flavor tuning, coarse grind (French Press level), 5 equal pours at 45s intervals. First 2 pours (40%) control sweetness/acidity, last 3 (60%) control strength.

OUTPUT FORMAT (JSON only, no markdown, no backticks):
{
  "method": "pour-over",
  "technique": string ("hoffmann" | "hedrick-121" | "kasuya-46" | "hybrid"),
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
- Technique MUST match the family recommendation unless you have a specific reason to deviate.
- Bloom duration and water MUST vary (light roasts get longer/more bloom).
- Steps must have ascending waterTotal values.

RESPOND WITH ONLY THE JSON OBJECT.`;
}

export async function generateHandBrewRecipe(bean, research, preferences) {
  const { text: beanDescription } = buildBeanDescription(bean);
  const originProfile = getOriginContext(bean.origin);

  // Determine family: from research, or fallback heuristic
  const family = research?.cupStructureFamily
    || classifyFamilyFallback(bean);
  const roastLevel = research?.roastLevel || '';

  // Build explicit user content with top-level fields for reliable matrix lookup
  let userContent = `Generate a hand brew pour-over recipe for this bean:

${sanitize(beanDescription, 500)}

BEAN CLASSIFICATION:
- Cup-structure family: ${family}
- Roast level: ${sanitize(roastLevel) || 'unknown (infer from description)'}
- Process: ${sanitize(research?.processingNuance || bean.process || '') || 'unknown'}
- Density: ${sanitize(research?.densityEstimate || '') || 'unknown'}`;

  if (originProfile) {
    userContent += `\n\nOrigin profile: ${originProfile}`;
  }

  if (research?.flavorExpectations) {
    userContent += `\nExpected flavors: ${sanitize(research.flavorExpectations, 200)}`;
  }
  if (research?.extractionNotes) {
    userContent += `\nExtraction notes: ${sanitize(research.extractionNotes, 200)}`;
  }

  const systemPrompt = buildHandBrewPrompt(preferences, family, roastLevel);
  const grinderKey = preferences?.grinder || 'fellow-ode-gen2';

  const data = await fetchWithRetry({
    url: PROXY_URL,
    body: {
      model: 'gpt-5.4',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      maxTokens: 1000,
    },
    retries: 2,
    serviceName: 'OpenAI',
  });

  const text = data.text || '';
  const clean = text.replace(/```json|```/g, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(clean);
  } catch {
    throw new Error('Recipe generation returned invalid data. Please try again.');
  }

  // Enforce valid ranges (mirrors Aiden's repairRecipe pattern)
  repairHandBrewRecipe(parsed, grinderKey, family);

  return validateRecipe(parsed);
}

// Lightweight validation: JSON parsed + required fields exist
function validateRecipe(recipe) {
  if (!recipe.coffeeGrams || !recipe.waterGrams || !recipe.steps) {
    throw new Error('Recipe missing required fields (coffeeGrams, waterGrams, steps)');
  }
  if (!Array.isArray(recipe.steps) || recipe.steps.length === 0) {
    throw new Error('Recipe must include at least one brew step');
  }
  return recipe;
}
