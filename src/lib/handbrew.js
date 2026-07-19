// Hand brew recipe generation — device-specific recipes via GPT-5.4 Mini
// Mirrors the Aiden two-step pattern: researchBean() -> generateHandBrewRecipe()
// Grinder data + family defaults + device configs + enforcement layer co-located here

import { API_BASE } from './apiBase';
import { fetchWithRetry } from './fetchWithRetry';
import { buildBeanDescription } from './beanResearch';
import { HANDBREW_POUROVER_KNOWLEDGE, getOriginContext } from './coffeeKnowledge';
import { classifyFamilyFallback } from './beanFields';
import { GRINDER_MICRON_SCALES, grinderSettingToMicrons, descriptorForMicrons, parseTimeString } from './brewMethods';
export { parseTimeString } from './brewMethods';

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
    scale: '1-11 dial with quarter-step clicks',
    pourOverStart: { light: 4.5, medium: 5.5, dark: 6.5 },
    validRange: { min: 3, max: 8.5 },
  },
  'baratza-encore-esp': {
    label: 'Baratza Encore ESP',
    scale: '40 steps, 1-40',
    pourOverStart: { light: 16, medium: 20, dark: 25 },
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
    scale: '~200 clicks from zero (rotations.number.tick, 1 rotation = 40 clicks)',
    pourOverStart: { light: 105, medium: 125, dark: 145 },
    validRange: { min: 90, max: 180 },
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
    drawdownTarget: '2:30-3:30',
    defaultTechnique: 'hoffmann',
    techniques: ['hoffmann', 'kasuya-46'],
    promptContext: 'Fast-draining cone. Grind and pour technique control extraction. Baseline device.',
  },
  kalita: {
    label: 'Kalita Wave',
    type: 'pourover',
    filterType: 'wavy paper flat-bed',
    drainSpeed: 'restricted (3 small holes)',
    grindOffset: +1.0,
    restrictedFlow: true,
    ratioRange: [15, 17],
    tempRange: [93, 100],
    maxBrewTime: 240,
    drawdownTarget: '3:00-3:45',
    defaultTechnique: 'center-pour',
    techniques: ['center-pour'],
    promptContext: 'Flat-bed brewer with restricted flow (3 tiny exit holes). The DEVICE controls flow rate, so do NOT grind fine to slow the flow — fine grinds shed fines that clog the flat bed and stall the brew, especially dense light roasts. Grind coarser than V60 and recover extraction with hotter water and a swirl. Center-pour technique, avoid hitting walls.',
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
    drawdownTarget: '3:30-5:00',
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
    ratioRange: [6, 18],
    tempRange: [80, 100],
    maxBrewTime: 210,
    defaultTechnique: 'standard',
    techniques: ['standard', 'inverted', 'bypass'],
    promptContext: 'Short contact time with pressure. Finer grind than pour-over. Wide temp range (80-100C). Ratio is MODE-SPECIFIC: standard 1:12-1:18; inverted 1:10-1:14; bypass brews a ~1:6 concentrate then dilutes to taste (championship approach).',
  },
  'french-press': {
    label: 'French Press',
    type: 'full-immersion',
    filterType: 'metal mesh (no paper)',
    drainSpeed: 'none (full immersion)',
    grindOffset: +0.5,
    ratioRange: [13, 17],
    tempRange: [95, 100],
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
    ratio: '1:15.5 to 1:16.5', tempC: '95-98', bloom: '2x, 30s',
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
    ratio: '1:15.5 to 1:16.5', tempC: '88-91', bloom: '2x, 25s',
    grindDirection: 'coarser end of pour-over range',
    technique: 'Hoffmann classic (gentle, prevent over-extraction)',
    notes: 'Highly soluble. Low temp and coarse grind prevent over-extraction; keep standard-strength ratio (census median 1:15.5 for dark).',
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

  // Intersect the family's temp band with the device's physical range — the
  // family band carries the roast/process evidence (dark 88-91C etc.) and must
  // survive device selection; the device range only clips it. (Audit R1: the
  // old code REPLACED the family band, making all 7 bands dead code.)
  if (config.tempRange) {
    const [devLo, devHi] = config.tempRange;
    const fam = String(base.tempC || '').match(/(\d+)\s*-\s*(\d+)/);
    if (fam) {
      const famLo = Number(fam[1]);
      const famHi = Number(fam[2]);
      const lo = Math.max(famLo, devLo);
      const hi = Math.min(famHi, devHi);
      result.tempC = lo <= hi ? `${lo}-${hi}` : `${devLo}-${devHi}`;
    } else {
      result.tempC = `${devLo}-${devHi}`;
    }
  }

  // Restricted-flow flat beds invert the "finer end" guidance: the device
  // already restricts flow, and dense washed lights shed fines that stall it.
  if (config.restrictedFlow && HIGH_FINES_FAMILIES.has(family)) {
    result.grindDirection = 'coarse end of pour-over range — the device restricts flow; recover extraction with hotter water and a swirl, never a finer grind';
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

// High fines-risk cup-structure families: dense, high-grown washed clarity
// beans shed the most fines on flat burrs — the ones that clog restricted-flow
// flat-bed brewers (Kalita). They get a coarser start on those devices.
const HIGH_FINES_FAMILIES = new Set([
  'washed-floral-clarity',
  'washed-ethiopia-clarity',
  'washed-kenya-clarity',
]);

// Ode Gen 2 µm-per-step — device grindOffsets are defined in Ode steps, so
// converting an offset to another grinder's native units goes through this.
const ODE_PER_STEP = GRINDER_MICRON_SCALES['fellow-ode-gen2'].perStep;

// Apply device grind offset (plus a fines-risk bump on restricted-flow
// devices) to a grinder's pour-over start point. For immersion devices
// (Aeropress), allow going below the pour-over floor since shorter contact
// time permits finer grinds.
function getDeviceAdjustedGrindStart(grinderKey, grindTier, device, family) {
  const grinder = GRINDER_POUROVER_STARTS[grinderKey];
  if (!grinder) return null;
  const config = BREW_DEVICE_CONFIGS[device];
  let rawOffset = config?.grindOffset || 0;
  // Dense washed lights on a restricted-flow flat bed: extra half step coarser
  if (config?.restrictedFlow && family && HIGH_FINES_FAMILIES.has(family)) {
    rawOffset += 0.5;
  }
  const base = grinder.pourOverStart[grindTier] || grinder.validRange.min;
  const targetPerStep = GRINDER_MICRON_SCALES[grinderKey]?.perStep || ODE_PER_STEP;
  const nativeOffset = (rawOffset * ODE_PER_STEP) / targetPerStep;
  const adjusted = Math.round((base + nativeOffset) * 10) / 10;
  // Immersion devices can go finer than pour-over floor (use absolute grinder min, not pour-over min)
  const floor = (config?.type === 'immersion-pressure') ? 1 : grinder.validRange.min;
  return Math.max(floor, Math.min(grinder.validRange.max, adjusted));
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
    const floor = getDeviceAdjustedGrindStart(grinderKey, grindTier, device, family);
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

    // Reconcile microns with the (possibly clamped) setting via the grinder's
    // calibration — the model's freehand micron estimate is often on a
    // different scale, and UI must never show a setting/micron contradiction.
    const finalSetting = parseFloat(recipe.grindSize.setting);
    const trueMicrons = grinderSettingToMicrons(finalSetting, grinderKey);
    if (trueMicrons != null) {
      if (recipe.grindSize.microns != null && Math.abs(recipe.grindSize.microns - trueMicrons) > trueMicrons * 0.12) {
        repairs.push(`Microns ${recipe.grindSize.microns} inconsistent with setting ${finalSetting} (~${trueMicrons}µm); corrected`);
      }
      recipe.grindSize.microns = trueMicrons;
      recipe.grindSize.description = recipe.grindSize.description || descriptorForMicrons(trueMicrons);
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
    const startAt = getDeviceAdjustedGrindStart(grinderKey, grindTier, device, family);
    const scale = GRINDER_MICRON_SCALES[grinderKey];
    const startMicrons = grinderSettingToMicrons(startAt, grinderKey);
    grinderContext = `GRINDER: ${grinder.label} (${grinder.scale})
- ${config.label} start point for ${grindTier} roast: ${startAt} (~${startMicrons} microns)
- CALIBRATION: setting-to-microns is linear — each whole step ≈ ${Math.round(scale.perStep)} microns. Your grindSize.microns MUST match your grindSize.setting via this calibration.
- Valid range: ${grinder.validRange.min} to ${grinder.validRange.max}
${grinder.aidenNote ? `- ${grinder.aidenNote}` : ''}
- Recommend grind in this grinder's native notation (e.g., "${startAt}")
- Treat the setting as a STARTING POINT: burr calibration varies unit to unit, so the tips should tell the user to correct by drawdown time and taste, not treat the number as absolute`;
  } else {
    const customName = sanitize(preferences?.grinderCustomName, 60) || 'Custom grinder';
    const customBands = config.restrictedFlow
      ? 'Light roast: 600-750 microns. Medium: 650-800. Dark: 750-900. (Flat-bed: the device restricts flow — do not grind fine to slow it.)'
      : config.type === 'pourover'
        ? 'Light roast: 450-600 microns. Medium: 550-700. Dark: 650-800.'
        : config.type === 'immersion-pressure'
          ? 'Light roast: 400-550 microns. Medium: 450-600. Dark: 550-700.'
          : 'Light roast: 550-750 microns. Medium: 650-800. Dark: 750-900.';
    grinderContext = `GRINDER: ${customName} (custom)
- No specific setting data available. Recommend grind in MICRONS only.
- ${customBands}`;
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
- grindSize.microns MUST be consistent with grindSize.setting per the CALIBRATION line.
- Water temperature MUST be within ${config.tempRange[0]}-${config.tempRange[1]}C for ${config.label}.
- Technique should be appropriate for ${config.label}.
- Steps must have ascending waterTotal values.
- Total brew time must match the device's typical range.${config.drawdownTarget ? `
- Target total drawdown: ${config.drawdownTarget}. The tips MUST include: if the brew stalls or runs past this window, grind coarser (0.5-1 step); if it races under, grind finer.` : ''}

RESPOND WITH ONLY THE JSON OBJECT.`;
}

function buildTechniqueBlock(config) {
  const blocks = {
    hoffmann: 'Hoffmann Classic: all-rounder, bloom then 2-3 pours to target weight, gentle swirl after each pour, target 2:30-3:30.',
    'kasuya-46': 'Kasuya 4:6: 93C water, medium-coarse grind, 1:15 base. Pour when the previous pour has drained (~30-45s cadence, watch the bed not the clock). First 40% in 2 pours controls sweetness/acidity; last 60% in 1-3 pours controls strength (fewer = stronger) — the original uses 3 (5 pours total), the medium-strength variant 2 (4 pours total).',
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
  let parsed;
  try {
    const clean = text.replace(/```json|```/g, '').trim();
    parsed = JSON.parse(clean);
  } catch {
    // Fallback: extract the first {...} block from the response
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        throw new Error('Recipe generation returned invalid data. Please try again.');
      }
    } else {
      throw new Error('Recipe generation returned invalid data. Please try again.');
    }
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
