// Hand brew recipe generation — device-specific recipes via GPT-5.4 Mini
// Mirrors the Aiden two-step pattern: researchBean() -> generateHandBrewRecipe()
// Grinder data + family defaults + device configs + enforcement layer co-located here

import { API_BASE } from './apiBase';
import { fetchWithRetry } from './fetchWithRetry';
import { buildBeanDescription } from './beanResearch';
import { HANDBREW_POUROVER_KNOWLEDGE, getOriginContext } from './coffeeKnowledge';
import { classifyFamilyFallback } from './beanFields';
import { GRINDER_MICRON_SCALES } from './brewMethods';

const PROXY_URL = `${API_BASE}/api/openai`;

// ---------------------------------------------------------------------------
// Grinder pour-over start points (mirrors Aiden's FAMILY_GRIND_BANDS pattern)
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
// Brew device configurations — parameters validated against Hoffmann, Rao, Kasuya
// grindOffset is relative to V60 baseline in Ode Gen 2 steps
// ---------------------------------------------------------------------------
export const BREW_DEVICE_CONFIGS = {
  v60: {
    label: 'Hario V60',
    type: 'pourover',
    filterType: 'thin paper cone',
    drainSpeed: 'fast (single large hole)',
    grindOffset: 0,
    ratioRange: [15, 17],
    tempRange: [92, 100],
    maxBrewTime: 240,
    defaultTechnique: 'hoffmann',
    techniques: ['hoffmann', 'kasuya-46'],
    promptContext: 'Fast-draining cone. Grind and pour technique control extraction. Baseline device.',
  },
  kalita: {
    label: 'Kalita Wave',
    type: 'pourover',
    filterType: 'wavy paper flat-bed',
    drainSpeed: 'restricted (3 small holes)',
    grindOffset: +1,
    ratioRange: [15, 17],
    tempRange: [93, 100],
    maxBrewTime: 270,
    defaultTechnique: 'center-pour',
    techniques: ['center-pour'],
    promptContext: 'Flat-bed brewer with restricted flow. More forgiving than V60. Center-pour technique, avoid hitting walls.',
  },
  chemex: {
    label: 'Chemex',
    type: 'pourover',
    filterType: 'thick bonded paper',
    drainSpeed: 'slow (thick filter absorbs oils)',
    grindOffset: +2,
    ratioRange: [15, 17],
    tempRange: [96, 100],
    maxBrewTime: 360,
    defaultTechnique: 'hoffmann-chemex',
    techniques: ['hoffmann-chemex'],
    promptContext: 'Thick filter removes oils, produces clean cup. Coarser grind compensates slow flow. Higher temp compensates glass heat loss. Pre-rinse filter AND glass body.',
  },
  aeropress: {
    label: 'Aeropress',
    type: 'immersion-pressure',
    filterType: 'paper or metal disc',
    drainSpeed: 'user-controlled (plunge)',
    grindOffset: -1,
    ratioRange: [12, 16],
    tempRange: [80, 100],
    maxBrewTime: 210,
    defaultTechnique: 'standard',
    techniques: ['standard', 'inverted', 'bypass'],
    promptContext: 'Short contact time with pressure. Finer grind than pour-over. Wide temp range (80-100C). Bypass brewing (concentrate + water) wins championships.',
  },
  'french-press': {
    label: 'French Press',
    type: 'full-immersion',
    filterType: 'metal mesh (no paper)',
    drainSpeed: 'none (full immersion)',
    grindOffset: +2,
    ratioRange: [15, 17],
    tempRange: [93, 96],
    maxBrewTime: 720,
    defaultTechnique: 'hoffmann-french-press',
    techniques: ['hoffmann-french-press'],
    promptContext: 'Full immersion, metal mesh. Hoffmann method: MEDIUM grind (not coarse), 4min steep, break crust, scoop foam, settle 5-8min, DO NOT plunge to bottom. Pour slowly. Total 9-12min.',
  },
};

// ---------------------------------------------------------------------------
// Cup-structure family pour-over defaults (base table, V60-centric)
// Device offsets applied by getDeviceFamilyDefaults()
// ---------------------------------------------------------------------------
const FAMILY_POUROVER_DEFAULTS = {
  'washed-floral-clarity': {
    ratio: '1:15.5 to 1:16', tempC: '97-100', bloom: '2-3x, 30-45s',
    grindDirection: 'finer end of pour-over range',
    technique: 'Hoffmann classic (even extraction brings out florals)',
    notes: 'Push extraction for clarity. Full boil OK.',
  },
  'washed-ethiopia-clarity': {
    ratio: '1:15.5 to 1:16', tempC: '97-100', bloom: '2-3x, 30-45s',
    grindDirection: 'finer end of pour-over range',
    technique: 'Hoffmann classic (even extraction maximizes floral/citrus clarity)',
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

// Immersion-specific defaults that override pour-over base
const IMMERSION_OVERRIDES = {
  aeropress: {
    bloom: 'N/A (stir instead)',
    grindDirection: 'finer than pour-over (short contact time)',
    notes: 'Short steep + pressure. Concentrate brewing works well.',
  },
  'french-press': {
    bloom: 'N/A (full immersion)',
    grindDirection: 'medium (Hoffmann method, NOT coarse)',
    notes: 'Full immersion. Medium grind for better extraction. Settle period replaces filter refinement.',
  },
};

const DEFAULT_POUROVER_FAMILY = 'medium-washed';

// Apply device-specific adjustments to family defaults
function getDeviceFamilyDefaults(device, family) {
  const base = FAMILY_POUROVER_DEFAULTS[family] || FAMILY_POUROVER_DEFAULTS[DEFAULT_POUROVER_FAMILY];
  const config = BREW_DEVICE_CONFIGS[device];
  if (!config) return base;

  const result = { ...base };

  if (config.tempRange) {
    result.tempC = `${config.tempRange[0]}-${config.tempRange[1]}`;
  }

  // Only override family technique for non-V60 devices (V60 preserves family-specific choices like Kasuya for naturals)
  if (device !== 'v60') {
    result.technique = config.defaultTechnique;
  }

  // Immersion devices get overrides
  if (IMMERSION_OVERRIDES[device]) {
    Object.assign(result, IMMERSION_OVERRIDES[device]);
  }

  return result;
}

// Map roast level to grind tier for grinder lookup
function roastToGrindTier(roastLevel) {
  const r = (roastLevel || '').toLowerCase();
  if (r.includes('dark') || r === 'medium-dark') return 'dark';
  if (r === 'medium' || r === 'light-medium') return 'medium';
  return 'light';
}

// Apply device grind offset to a grinder's pour-over start point.
// For immersion devices (Aeropress), allow going below the pour-over floor
// since shorter contact time permits finer grinds.
function getDeviceAdjustedGrindStart(grinderKey, grindTier, device) {
  const grinder = GRINDER_POUROVER_STARTS[grinderKey];
  if (!grinder) return null;
  const config = BREW_DEVICE_CONFIGS[device];
  const rawOffset = config?.grindOffset || 0;
  const base = grinder.pourOverStart[grindTier] || grinder.validRange.min;
  const targetPerStep = GRINDER_MICRON_SCALES[grinderKey]?.perStep || 70;
  const nativeOffset = (rawOffset * 70) / targetPerStep;
  const adjusted = base + nativeOffset;
  // Immersion devices can go finer than pour-over floor (use absolute grinder min, not pour-over min)
  const floor = (config?.type === 'immersion-pressure') ? 1 : grinder.validRange.min;
  return Math.max(floor, Math.min(grinder.validRange.max, adjusted));
}

export function parseTimeString(str) {
  if (str == null) return null;
  const s = String(str).trim();
  if (!s) return null;

  const frag = /(?<!\d)(\d{1,2}):(\d{2})(?!\d)/;

  const rangeMatch = s.match(new RegExp(frag.source + String.raw`\s*[-–—]\s*` + frag.source));
  if (rangeMatch) {
    const m1 = parseInt(rangeMatch[1], 10);
    const s1 = parseInt(rangeMatch[2], 10);
    const m2 = parseInt(rangeMatch[3], 10);
    const s2 = parseInt(rangeMatch[4], 10);
    if (s1 >= 60 || s2 >= 60) return null;
    const a = m1 * 60 + s1;
    const b = m2 * 60 + s2;
    return Math.round((a + b) / 2);
  }

  if (/\d+:\d+\s*[-–—]\s*\d+:\d+/.test(s)) return null;

  const mmss = s.match(frag);
  if (mmss) {
    const mins = parseInt(mmss[1], 10);
    const secs = parseInt(mmss[2], 10);
    if (secs >= 60) return null;
    return mins * 60 + secs;
  }

  const minsMatch = s.match(/([\d.]+)\s*(?:minutes?|mins?|m)\b/i);
  if (minsMatch) {
    const val = parseFloat(minsMatch[1]);
    if (!isNaN(val) && val >= 0 && val <= 99) return Math.round(val * 60);
  }

  const secsMatch = s.match(/([\d.]+)\s*(?:seconds?|secs?|s)\b/i);
  if (secsMatch) {
    const val = parseFloat(secsMatch[1]);
    if (!isNaN(val) && val >= 0 && val <= 99 * 60) return Math.round(val);
  }

  return null;
}

// ---------------------------------------------------------------------------
// Post-generation enforcement with device-specific rules
// ---------------------------------------------------------------------------
export function repairHandBrewRecipe(recipe, grinderKey, family, roastLevel, device = 'v60') {
  const grinder = GRINDER_POUROVER_STARTS[grinderKey];
  const repairs = [];
  const config = BREW_DEVICE_CONFIGS[device] || BREW_DEVICE_CONFIGS.v60;

  // 1. Clamp grind setting with device-adjusted floor
  if (grinder && recipe.grindSize?.setting != null) {
    const setting = parseFloat(recipe.grindSize.setting);
    const grindTier = roastToGrindTier(roastLevel);
    const floor = getDeviceAdjustedGrindStart(grinderKey, grindTier, device);
    if (!isNaN(setting) && floor != null) {
      if (setting < floor) {
        recipe.grindSize.setting = String(floor);
        repairs.push(`Grind clamped from ${setting} to ${floor} (below ${device} start for ${grindTier} roast)`);
      }
      if (setting > grinder.validRange.max) {
        recipe.grindSize.setting = String(grinder.validRange.max);
        repairs.push(`Grind clamped from ${setting} to ${grinder.validRange.max} (above range)`);
      }
    }
  }

  // 2. Clamp ratio to device-specific range
  const ratioMatch = recipe.ratio?.match(/1:([\d.]+)/);
  if (ratioMatch) {
    const r = parseFloat(ratioMatch[1]);
    const [minRatio, maxRatio] = config.ratioRange || [14, 19];
    if (r < minRatio) { recipe.ratio = `1:${minRatio}`; repairs.push(`Ratio clamped from 1:${r} to 1:${minRatio}`); }
    if (r > maxRatio) { recipe.ratio = `1:${maxRatio}`; repairs.push(`Ratio clamped from 1:${r} to 1:${maxRatio}`); }
  }

  // 3. Clamp water temperature to device-specific range
  if (recipe.waterTemp?.celsius) {
    const c = recipe.waterTemp.celsius;
    const [minTemp, maxTemp] = config.tempRange || [83, 100];
    if (c < minTemp) { recipe.waterTemp.celsius = minTemp; repairs.push(`Temp clamped from ${c}C to ${minTemp}C`); }
    if (c > maxTemp) { recipe.waterTemp.celsius = maxTemp; repairs.push(`Temp clamped from ${c}C to ${maxTemp}C`); }
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

  // 5. Parse step.time -> step.timeSeconds with strictly ascending order
  recipe.timerReady = true;
  let lastStepSeconds = null;
  if (Array.isArray(recipe.steps)) {
    let lastSeconds = -1;
    for (let i = 0; i < recipe.steps.length; i++) {
      const step = recipe.steps[i];
      const parsed = parseTimeString(step.time);
      if (parsed == null) {
        recipe.timerReady = false;
        repairs.push(`Step ${i} has unparseable time "${step.time}"`);
        step.timeSeconds = null;
        continue;
      }
      if (parsed <= lastSeconds) {
        recipe.timerReady = false;
        repairs.push(`Step ${i} time ${step.time} is not strictly after previous (${lastSeconds}s)`);
        step.timeSeconds = null;
        continue;
      }
      step.timeSeconds = parsed;
      lastSeconds = parsed;
      lastStepSeconds = parsed;
    }
  }

  // 6. Normalize totalBrewTime -> totalBrewTimeSeconds
  const totalParsed = parseTimeString(recipe.totalBrewTime);
  if (totalParsed != null) {
    recipe.totalBrewTimeSeconds = totalParsed;
  } else if (Array.isArray(recipe.steps) && recipe.steps.length > 0) {
    const validSeconds = recipe.steps
      .map((s) => s.timeSeconds)
      .filter((v) => v != null && v >= 0);
    if (validSeconds.length > 0) {
      const lastStep = validSeconds[validSeconds.length - 1];
      const avgStepDuration = validSeconds.length > 1
        ? (validSeconds[validSeconds.length - 1] - validSeconds[0]) / (validSeconds.length - 1)
        : 30;
      recipe.totalBrewTimeSeconds = Math.round(lastStep + avgStepDuration);
      repairs.push(`totalBrewTime "${recipe.totalBrewTime}" unparseable; derived ${recipe.totalBrewTimeSeconds}s from steps`);
    } else {
      recipe.totalBrewTimeSeconds = null;
      recipe.timerReady = false;
      repairs.push(`totalBrewTime "${recipe.totalBrewTime}" unparseable and no step times available`);
    }
  } else {
    recipe.totalBrewTimeSeconds = null;
    recipe.timerReady = false;
  }

  // 6b. Cross-check: totalBrewTimeSeconds must be strictly greater than last step
  if (
    lastStepSeconds != null &&
    recipe.totalBrewTimeSeconds != null &&
    recipe.totalBrewTimeSeconds <= lastStepSeconds
  ) {
    const validSeconds = recipe.steps
      .map((s) => s.timeSeconds)
      .filter((v) => v != null && v >= 0);
    const avgStepDuration = validSeconds.length > 1
      ? (validSeconds[validSeconds.length - 1] - validSeconds[0]) / (validSeconds.length - 1)
      : 30;
    const derived = Math.round(lastStepSeconds + Math.max(avgStepDuration, 10));
    repairs.push(
      `totalBrewTime ${recipe.totalBrewTimeSeconds}s is not after last step ${lastStepSeconds}s; derived ${derived}s`
    );
    recipe.totalBrewTimeSeconds = derived;
  }

  // 7. Clamp max brew time per device
  if (config.maxBrewTime && recipe.totalBrewTimeSeconds > config.maxBrewTime) {
    repairs.push(`totalBrewTime ${recipe.totalBrewTimeSeconds}s exceeds ${device} max ${config.maxBrewTime}s`);
  }

  // 8. Default optional fields
  recipe.reasoning = recipe.reasoning || '';
  recipe.technique = recipe.technique || config.defaultTechnique || 'hoffmann';

  if (repairs.length > 0) {
    console.warn('[HandBrew Repair]', repairs.join('; '));
  }

  return recipe;
}

// Sanitize user-controlled bean fields before prompt injection
function sanitize(str, maxLen = 100) {
  return (str || '').slice(0, maxLen).replace(/[^\w .\-',()/]/g, '');
}

function buildHandBrewPrompt(preferences, family, roastLevel, device = 'v60') {
  const grinderKey = preferences?.grinder || 'fellow-ode-gen2';
  const grinder = GRINDER_POUROVER_STARTS[grinderKey];
  const familyDefaults = getDeviceFamilyDefaults(device, family);
  const grindTier = roastToGrindTier(roastLevel);
  const config = BREW_DEVICE_CONFIGS[device] || BREW_DEVICE_CONFIGS.v60;

  // Build grinder context with device-adjusted start point
  let grinderContext;
  if (grinder) {
    const startAt = getDeviceAdjustedGrindStart(grinderKey, grindTier, device);
    grinderContext = `GRINDER: ${grinder.label} (${grinder.scale})
- ${config.label} start point for ${grindTier} roast: ${startAt}
- Valid range: ${grinder.validRange.min} to ${grinder.validRange.max}
${grinder.aidenNote ? `- ${grinder.aidenNote}` : ''}
- Recommend grind in this grinder's native notation (e.g., "${startAt}")
- Also include approximate micron value`;
  } else {
    const customName = sanitize(preferences?.grinderCustomName, 60) || 'Custom grinder';
    grinderContext = `GRINDER: ${customName} (custom)
- No specific setting data available. Recommend grind in MICRONS only.
- Light roast: 400-500 microns. Medium: 500-650. Dark: 650-800.`;
  }

  // Device-specific method description
  const methodDesc = config.type === 'full-immersion'
    ? `full-immersion ${config.label}`
    : config.type === 'immersion-pressure'
      ? `immersion-pressure ${config.label}`
      : `pour-over (${config.label})`;

  // Device-specific technique options
  const techniqueBlock = buildTechniqueBlock(config);

  return `You are a specialty coffee brew guide. Generate a custom ${methodDesc} recipe tailored to THIS specific bean.

BREW DEVICE: ${config.label}
- Type: ${config.type}
- Filter: ${config.filterType}
- Flow: ${config.drainSpeed}
- ${config.promptContext}

${grinderContext}

${config.type === 'pourover' ? HANDBREW_POUROVER_KNOWLEDGE : ''}

BEAN'S FAMILY DEFAULTS (use as your starting parameters, adjust based on bean specifics):
- Family: ${family}
- Ratio: ${familyDefaults.ratio}
- Water temperature: ${familyDefaults.tempC}C
- Bloom: ${familyDefaults.bloom}
- Grind direction: ${familyDefaults.grindDirection}
- Recommended technique: ${familyDefaults.technique}
- Notes: ${familyDefaults.notes}

${techniqueBlock}

OUTPUT FORMAT (JSON only, no markdown, no backticks):
{
  "method": "${config.type === 'pourover' ? 'pour-over' : config.type}",
  "technique": string,
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
  "title": string (bean name + ${config.label} technique),
  "reasoning": string (1-2 sentences: why these parameters for this bean on ${config.label})
}

FINAL CHECKLIST (verify before outputting):
- Ratio MUST be within ${config.ratioRange[0]}-${config.ratioRange[1]} range for ${config.label}.
- Grind setting MUST be within the grinder's valid range provided above.
- Water temperature MUST be within ${config.tempRange[0]}-${config.tempRange[1]}C for ${config.label}.
- Technique should be appropriate for ${config.label}.
- Steps must have ascending waterTotal values.
- Total brew time must match the device's typical range.

RESPOND WITH ONLY THE JSON OBJECT.`;
}

function buildTechniqueBlock(config) {
  const blocks = {
    hoffmann: 'Hoffmann Classic: all-rounder, bloom then 2-3 pours to target weight, gentle swirl after each pour, target 2:30-3:30.',
    'kasuya-46': 'Kasuya 4:6: best for naturals, slightly coarser grind, 5 pours at 45s intervals. First 2 pours control sweetness/acidity, last 3 control strength.',
    'center-pour': 'Center-Pour: steady pour in center, avoid hitting paper walls. The device controls flow rate. More forgiving technique.',
    'hoffmann-chemex': 'Hoffmann Chemex: adapted for thick filter. Higher temp compensates glass heat loss. Pre-rinse filter AND glass body. Coarser grind. 3:30-5:00 total.',
    standard: 'Standard: add water, stir, steep 1-2 min, press. Quick and clean.',
    inverted: 'Inverted: flip Aeropress, steep upside-down for more control over steep time. Flip and press.',
    bypass: 'Bypass: brew a concentrate with less water, then dilute to taste. Championship-winning approach.',
    'hoffmann-french-press': 'Hoffmann French Press: MEDIUM grind (not coarse). 4min steep, break crust with spoon, scoop foam, settle 5-8min, DO NOT plunge to bottom. Pour slowly. Total 9-12min.',
  };

  const techniques = config.techniques.map(t => blocks[t] || t).filter(Boolean);
  if (techniques.length === 0) return '';
  return `TECHNIQUE OPTIONS (choose the best for this bean):\n${techniques.map(t => `- ${t}`).join('\n')}`;
}

export async function generateHandBrewRecipe(bean, research, preferences, device = 'v60') {
  const { text: beanDescription } = buildBeanDescription(bean);
  const originProfile = getOriginContext(bean.origin);

  const family = research?.cupStructureFamily
    || classifyFamilyFallback(bean, DEFAULT_POUROVER_FAMILY);
  const roastLevel = research?.roastLevel || '';

  let userContent = `Generate a ${(BREW_DEVICE_CONFIGS[device] || BREW_DEVICE_CONFIGS.v60).label} recipe for this bean:

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

  const systemPrompt = buildHandBrewPrompt(preferences, family, roastLevel, device);
  const grinderKey = preferences?.grinder || 'fellow-ode-gen2';

  const data = await fetchWithRetry({
    url: PROXY_URL,
    body: {
      model: 'gpt-5.4-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      maxTokens: 1000,
      feature: 'handBrewRecipe',
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

  repairHandBrewRecipe(parsed, grinderKey, family, roastLevel, device);

  return validateRecipe(parsed);
}

function validateRecipe(recipe) {
  if (!recipe.coffeeGrams || !recipe.waterGrams || !recipe.steps) {
    throw new Error('Recipe missing required fields (coffeeGrams, waterGrams, steps)');
  }
  if (!Array.isArray(recipe.steps) || recipe.steps.length === 0) {
    throw new Error('Recipe must include at least one brew step');
  }
  return recipe;
}
