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

// Parse a free-form time string into seconds. Accepts "M:SS", "MM:SS",
// ranges like "2:30-3:00" (midpoint), and descriptive values like
// "about 3 minutes". Returns null if nothing parseable is found.
//
// Strict bounds: minutes 0-99, seconds 0-59. "120:00", "1:99", and
// "1:234" all return null rather than silently misparsing. A pour-over
// brew is never over 99 minutes, and GPT typos that push past this
// range should fail validation loudly, not produce wrong numbers.
export function parseTimeString(str) {
  if (str == null) return null;
  const s = String(str).trim();
  if (!s) return null;

  // Bounded MM:SS fragment: 1-2 minute digits, exactly 2 second digits.
  // `(?!\d)` prevents matching "1:234" as "1:23". Lookbehind `(?<!\d)`
  // prevents matching "120:00" as "20:00".
  const frag = /(?<!\d)(\d{1,2}):(\d{2})(?!\d)/;

  // Range: "M:SS-M:SS" → midpoint
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

  // Preflight: if any two time-like tokens (digit+colon+digit) flank a range
  // separator but the strict range regex didn't match, the input is malformed
  // (e.g. "2:30-120:00", "120:00-2:30", "2:3-3:00"). Reject rather than
  // silently parsing only the valid half.
  if (/\d+:\d+\s*[-–—]\s*\d+:\d+/.test(s)) return null;

  // Plain M:SS or MM:SS
  const mmss = s.match(frag);
  if (mmss) {
    const mins = parseInt(mmss[1], 10);
    const secs = parseInt(mmss[2], 10);
    if (secs >= 60) return null;
    return mins * 60 + secs;
  }

  // "3 minutes", "about 3 min", "3.5 minutes"
  const minsMatch = s.match(/([\d.]+)\s*(?:minutes?|mins?|m)\b/i);
  if (minsMatch) {
    const val = parseFloat(minsMatch[1]);
    if (!isNaN(val) && val >= 0 && val <= 99) return Math.round(val * 60);
  }

  // "90 seconds", "90s"
  const secsMatch = s.match(/([\d.]+)\s*(?:seconds?|secs?|s)\b/i);
  if (secsMatch) {
    const val = parseFloat(secsMatch[1]);
    if (!isNaN(val) && val >= 0 && val <= 99 * 60) return Math.round(val);
  }

  return null;
}

// ---------------------------------------------------------------------------
// Post-generation enforcement (mirrors Aiden's repairRecipe pattern)
// Clamps GPT output to valid ranges. Logs warnings but never rejects.
// ---------------------------------------------------------------------------
export function repairHandBrewRecipe(recipe, grinderKey, family, roastLevel) {
  const grinder = GRINDER_POUROVER_STARTS[grinderKey];
  const defaults = FAMILY_POUROVER_DEFAULTS[family] || FAMILY_POUROVER_DEFAULTS[DEFAULT_POUROVER_FAMILY];
  const repairs = [];

  // 1. Clamp grind setting to pour-over start point floor (not just validRange.min)
  // The pourOverStart is the research-backed minimum for each roast tier.
  if (grinder && recipe.grindSize?.setting != null) {
    const setting = parseFloat(recipe.grindSize.setting);
    const grindTier = roastToGrindTier(roastLevel);
    const floor = grinder.pourOverStart[grindTier] || grinder.validRange.min;
    if (!isNaN(setting)) {
      if (setting < floor) {
        recipe.grindSize.setting = String(floor);
        repairs.push(`Grind clamped from ${setting} to ${floor} (below pour-over start for ${grindTier} roast)`);
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

  // 5. Parse step.time → step.timeSeconds and enforce STRICTLY ascending order.
  // Timer consumers need a numeric field; GPT gives us free-form strings.
  // If a step's time is unparseable or not strictly greater than the previous,
  // null that step's timeSeconds and mark the whole recipe as not timer-ready.
  // Duplicate timestamps produce zero-length steps downstream, so reject them.
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
      // STRICTLY increasing: `<=` rejects duplicates and out-of-order.
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

  // 6. Normalize totalBrewTime → totalBrewTimeSeconds.
  // GPT returns free-form strings: "3:00", "2:30-3:00", "about 3 minutes".
  // Parse first; if unparseable, compute from the last step + average step duration.
  // Must be strictly AFTER the last valid step — otherwise the final step would
  // have a zero or negative duration, which breaks timer math.
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

  // 6b. Cross-check: totalBrewTimeSeconds must be strictly greater than the
  // last valid step's timeSeconds. If it isn't, derive a safe total from the
  // last step + avg step duration and log the repair. This protects Phase 1
  // timer math from negative final-step durations.
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

  // 7. Default optional fields
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
  repairHandBrewRecipe(parsed, grinderKey, family, roastLevel);

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
