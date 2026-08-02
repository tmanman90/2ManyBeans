import { descriptorForMicrons, grinderSettingToMicrons, GRINDER_MICRON_SCALES } from './brewMethods.js';
import { V60_SOURCE_REGISTRY_VERSION, V60_RULES, V60_SOURCES, V60_TECHNIQUES, sourceById, isKnownV60ParameterSource } from '../data/v60SourceRegistry.js';

export const V60_ENGINE_VERSION = 'v60-hot-engine-v3';
export const V60_RULES_VERSION = 'v60-hot-rules-v3';
export const V60_CONFIGURATION_KEY = 'v60:02:standard-paper';
export const V60_PHASE_CONTRACT_VERSION = 1;
export const V60_ADAPTATION_RULE_ID = 'v60-adaptation-bounded-v1';
export const V60_SCALING_RULE_ID = 'v60-dose-scaling-v1';
const MIN_DOSE = 12;
const MAX_DOSE = 30;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const timeLabel = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
const round = (value) => Math.round(value);
const roundToFive = (value) => Math.round(value / 5) * 5;
const displayRatio = (value) => Math.round(value * 100) / 100;

export function normalizeV60Configuration(config = {}) {
  const requestedDose = Number(config.dose);
  const dose = Number.isFinite(requestedDose) ? requestedDose : 15;
  if (dose < MIN_DOSE || dose > MAX_DOSE) throw new Error(`V60 02 dose must be between ${MIN_DOSE}g and ${MAX_DOSE}g`);
  return {
    dose,
    grinder: config.grinder || 'fellow-ode-gen2',
    configurationKey: V60_CONFIGURATION_KEY,
    doseProfile: dose <= 18 ? 'small-12-18' : dose <= 24 ? 'medium-19-24' : 'large-25-30',
  };
}

function intentValue(intent, key, fallback = null) {
  return intent && intent[key] != null ? intent[key] : fallback;
}

function sourceRecipesFor(evidence) {
  const recipes = evidence?.sourceInsights?.brewRecipes;
  if (!Array.isArray(recipes)) return [];
  return recipes.filter((recipe) => recipe.mode === 'hot'
    && String(recipe.device).toLowerCase() === 'v60'
    && (!recipe.configuration || /v60\s*02|v60:02:standard-paper/i.test(String(recipe.configuration)))
    && !/reddit\.com/i.test(recipe.canonicalUrl || ''));
}

function executableSourceRecipe(recipe) {
  if (!recipe || recipe.status !== 'original' || !Number.isFinite(recipe.guideSeconds)
    || !Number.isFinite(recipe.temperatureC) || !Number.isFinite(recipe.ratio)
    || !recipe.grind || !recipe.geometry || !recipe.cadence || !recipe.agitation) return null;
  if (!/v60\s*02|v60:02:standard-paper/i.test(String(recipe.configuration || ''))) return null;
  if (recipe.temperatureC < 92 || recipe.temperatureC > 100) return null;
  if (!Array.isArray(recipe.steps) || recipe.steps.length < 2 || recipe.steps[0].timeSeconds !== 0) return null;
  let lastTime = -1; let lastWater = -1;
  for (const step of recipe.steps) {
    if (!Number.isFinite(step.timeSeconds) || !Number.isFinite(step.waterTotal)
      || step.timeSeconds <= lastTime || step.waterTotal <= 0 || step.waterTotal < lastWater) return null;
    lastTime = step.timeSeconds; lastWater = step.waterTotal;
  }
  const expectedWater = round(recipe.doseGrams * recipe.ratio);
  return recipe.steps.at(-1).waterTotal === expectedWater && recipe.guideSeconds > lastTime ? recipe : null;
}

export function selectV60Technique(intent = {}, configuration = {}, evidence = null) {
  const config = normalizeV60Configuration(configuration);
  const structuredRecipes = sourceRecipesFor(evidence);
  const exact = structuredRecipes.map(executableSourceRecipe).find((recipe) => recipe && config.dose === recipe.doseGrams) || null;
  const structured = structuredRecipes[0] || null;
  if (exact) return { ...V60_TECHNIQUES.smallPulse, id: 'direct-roaster-v60', sourceIds: [exact.id], sourceRecipe: exact, reasonCode: 'EXACT_STRUCTURED_SOURCE' };
  if (structured) return { ...V60_TECHNIQUES.smallPulse, structuredSource: structured, reasonCode: 'PARTIAL_STRUCTURED_SOURCE_ADAPTED' };
  const finesRisk = intentValue(intent, 'finesRisk', 'unknown');
  const energy = intentValue(intent, 'energyTendency', 'conservative');
  const cupDirection = intentValue(intent, 'cupDirection', {});
  if (config.dose >= 25) return { ...V60_TECHNIQUES.largeBatch, reasonCode: 'LARGE_DOSE_DEDICATED_PROFILE' };
  if (finesRisk === 'high') return { ...V60_TECHNIQUES.gentle, reasonCode: 'HIGH_FINES_LOW_AGITATION' };
  if (intentValue(intent, 'techniquePreference') === 'bloom-led-pulse') return { ...V60_TECHNIQUES.coarse46, reasonCode: 'COARSE_PULSE_SOLUBILITY_PROFILE' };
  if (energy === 'higher' && finesRisk !== 'high') return { ...V60_TECHNIQUES.twoStage, reasonCode: 'HIGH_ENERGY_LOW_FINES_PROFILE' };
  if (intentValue(intent, 'techniquePreference') === 'center-to-spiral-pulse') return { ...V60_TECHNIQUES.smallPulse, reasonCode: 'CENTER_SPIRAL_PULSE_PROFILE' };
  if ((cupDirection?.body === 'supported' && intentValue(intent, 'softPriors', {})?.process !== 'fruit-processed') || intentValue(intent, 'desiredStrength') === 'stronger') return { ...V60_TECHNIQUES.controlled, reasonCode: 'FULLER_CONTROLLED_PULSE_PROFILE' };
  if (energy === 'lower' || intentValue(intent, 'techniquePreference') === 'low-agitation-center') return { ...V60_TECHNIQUES.gentle, reasonCode: 'LOW_ENERGY_GENTLE_PROFILE' };
  return { ...V60_TECHNIQUES.smallPulse, reasonCode: 'BALANCED_SMALL_DOSE_PROFILE' };
}

function grindFor(grinder, technique, intent) {
  const targetMicrons = clamp(
    technique.id === 'hoffmann-large-batch' ? 760
      : technique.id === 'kasuya-coarse-pulses' ? 850
        : technique.id === 'rao-two-stage' ? 610
          : technique.id === 'gentle-main-pour' ? 720 : 660,
    380, 1050,
  ) + clamp(Number(intentValue(intent, 'grindAdjustmentMicrons', 0)) || 0, -45, 45);
  const scale = GRINDER_MICRON_SCALES[grinder];
  if (!scale) {
    return {
      setting: null, microns: round(targetMicrons), micronRange: [round(targetMicrons - 35), round(targetMicrons + 35)],
      description: descriptorForMicrons(targetMicrons), grinderSpecific: false,
    };
  }
  const raw = clamp((targetMicrons - scale.base) / scale.perStep + 1, 1, 40);
  const setting = Math.round(raw * 10) / 10;
  const microns = grinderSettingToMicrons(setting, grinder);
  return { setting: String(setting), microns, description: descriptorForMicrons(microns), grinderSpecific: true };
}

function techniqueShape(technique, dose, water, source, intent = {}) {
  const bloom = round(dose * 3);
  if (technique.id === 'direct-roaster-v60' && technique.sourceRecipe?.steps?.length) {
    return technique.sourceRecipe.steps.map((step) => [step.timeSeconds, step.waterTotal, step.action, step.name]);
  }
  if (technique.id === 'hoffmann-large-batch') return [
    [0, round(dose * 2), `Bloom with ${round(dose * 2)}g, then swirl until every ground is wet. Let it rest until 0:45.`, 'Bloom'],
    [45, round(water * 0.6), `Pour in a broad spiral to ${round(water * 0.6)}g by 1:15. Pouring near the filter is fine for this method.`, 'First pour'],
    [75, water, `Continue pouring a little more slowly to ${water}g by 1:45.`, 'Final pour'],
    [105, water, 'Stir once clockwise and once counterclockwise, let the brewer drain briefly, then give it one gentle swirl.', 'Settle & draw down'],
  ];
  if (technique.id === 'kasuya-coarse-pulses' && source.id === 'kasuya-46-v1' && dose === source.doseGrams && Array.isArray(source.pourTargets)) return source.pourTargets.map((target, index) => [target.seconds, target.grams, index === 0
    ? `Pour ${target.grams}g in the center, then let it drain until 0:45. Do not swirl.`
    : index === source.pourTargets.length - 1
      ? `Pour the final centered pulse to ${target.grams}g total, then let it drain without swirling.`
      : `Pour a centered pulse to ${target.grams}g total over about 10 seconds, then let it drain.`, index === 0 ? 'First pour' : index === source.pourTargets.length - 1 ? 'Final pour' : `Pour ${index + 1}`]);
  if (technique.id === 'kasuya-coarse-pulses') return [
    [0, round(water / 6), `Pour ${round(water / 6)}g in the center over about 10 seconds, then let it drain. Do not swirl.`, 'First pour'],
    [45, round(water * 0.4), `Pour a centered pulse to ${round(water * 0.4)}g total over about 10 seconds, then let it drain.`, 'Second pour'],
    [90, round(water * 0.6), `Pour gently to ${round(water * 0.6)}g total over about 10 seconds.`, 'Third pour'],
    [130, round(water * 0.8), `Pour gently to ${round(water * 0.8)}g total over about 10 seconds.`, 'Fourth pour'],
    [160, water, `Pour the final centered pulse to ${water}g total, then let it drain without swirling.`, 'Final pour'],
  ];
  if (technique.id === 'rao-two-stage') return [
    [0, source.bloomGrams || bloom, `Bloom with ${source.bloomGrams || bloom}g and immediately spin the brewer firmly to wet the entire bed.`, 'Bloom & spin'],
    [40, round(water * (200 / 330)), `Pour low and steadily in a center-to-outward spiral to ${round(water * (200 / 330))}g, then give one very gentle spin. Wait until the slurry is about 70% drained.`, 'First pour'],
    [100, water, `When the slurry is about 70% drained, pour to ${water}g with the same low, steady spiral. Finish with one very gentle spin.`, 'Final pour'],
  ];
  if (technique.id === 'gentle-main-pour') {
    const bloomWater = clamp(bloom, source.bloomRangeGrams?.[0] || bloom, source.bloomRangeGrams?.[1] || bloom);
    const sourceBloom = round(((source.bloomRangeGrams?.[0] || bloomWater) + (source.bloomRangeGrams?.[1] || bloomWater)) / 2);
    const sourcePourEnd = round(((source.pourEndRangeSeconds?.[0] || 110) + (source.pourEndRangeSeconds?.[1] || 120)) / 2);
    const sourceMainWater = round(source.doseGrams * source.ratio) - sourceBloom;
    const mainPourSeconds = roundToFive((water - bloomWater) / (sourceMainWater / (sourcePourEnd - (source.bloomRestSeconds || 20))));
    const mainPourStart = intent.finesRisk === 'high' ? 30 : (source.bloomRestSeconds || 20);
    const mainPourEnd = Math.max(mainPourStart + 45, mainPourStart + mainPourSeconds);
    return [
      [0, bloomWater, intent.finesRisk === 'high'
        ? `Bloom with ${bloomWater}g from the center. Wet every ground gently without stirring, then rest until ${timeLabel(mainPourStart)}.`
        : `Bloom with ${bloomWater}g from the center. Stir vigorously until every ground is wet, then rest until ${timeLabel(mainPourStart)}.`, 'Bloom'],
      [mainPourStart, water, `Begin one slow, continuous center pour. Keep the water line low and reach ${water}g around ${timeLabel(mainPourEnd)}.`, 'Continuous pour'],
      [mainPourEnd, water, intent.finesRisk === 'high'
        ? 'Stop pouring and let the bed draw down without stirring.'
        : 'Stop pouring, stir once around the edge to wash down any high grounds, then let the bed draw down.', 'Draw down'],
    ];
  }
  if (technique.id === 'kurasu-controlled-pulses') return [
    [0, bloom, `Bloom with ${bloom}g over 10 seconds, then move a teaspoon back and forth through the bed 2–3 times.`, 'Bloom & stir'],
    [40, round(water * 0.5), `Pour more firmly in a small center circle to ${round(water * 0.5)}g total over about 10 seconds.`, 'Second pour'],
    [70, round(water * 0.75), `Pour gently in a small center circle to ${round(water * 0.75)}g total over about 10 seconds.`, 'Third pour'],
    [100, water, `Finish gently at ${water}g, then glide the spoon once around the surface to level the bed.`, 'Final pour & stir'],
  ];
  return [
    [0, round(water * 0.2), `Bloom with ${round(water * 0.2)}g from the center. Wet the entire bed, then gently swirl at 0:10 and rest until 0:45.`, 'Bloom & swirl'],
    [45, round(water * 0.4), `Pour in a controlled spiral to ${round(water * 0.4)}g by 1:00, keeping the stream low and off the paper.`, 'Pour 1'],
    [60, round(water * 0.4), 'Pause until 1:10.', 'Rest'],
    [70, round(water * 0.6), `Pour in the same controlled spiral to ${round(water * 0.6)}g by 1:20.`, 'Pour 2'],
    [80, round(water * 0.6), 'Pause until 1:30.', 'Rest'],
    [90, round(water * 0.8), `Pour to ${round(water * 0.8)}g by 1:40.`, 'Pour 3'],
    [100, round(water * 0.8), 'Pause until 1:50.', 'Rest'],
    [110, water, `Pour to ${water}g by 2:00.`, 'Final pour'],
    [120, water, 'Give the brewer one gentle swirl to level the bed, then let it draw down.', 'Swirl & draw down'],
  ];
}

function reasonForTechnique(technique, config) {
  switch (technique.reasonCode) {
    case 'EXACT_STRUCTURED_SOURCE': return 'This coffee includes a complete roaster recipe, so the app follows that published V60 02 method directly.';
    case 'PARTIAL_STRUCTURED_SOURCE_ADAPTED': return 'The roaster supplied useful V60 guidance but not a complete timed recipe, so the app keeps those details inside a tested V60 02 profile.';
    case 'LARGE_DOSE_DEDICATED_PROFILE': return `${config.dose}g needs the dedicated large-batch cadence so the deeper bed stays evenly saturated.`;
    case 'HIGH_FINES_LOW_AGITATION': return 'This coffee is likely to produce more fines, so one gentle main pour limits agitation and helps prevent stalling.';
    case 'COARSE_PULSE_SOLUBILITY_PROFILE': return 'This coffee benefits from a coarser grind and separated pulses that build sweetness without excessive agitation.';
    case 'HIGH_ENERGY_LOW_FINES_PROFILE': return 'This coffee can handle more brewing energy, so two staged pours and controlled spins support an even extraction.';
    case 'CENTER_SPIRAL_PULSE_PROFILE': return 'This coffee suits small, controlled spiral pulses that balance clarity and sweetness.';
    case 'FULLER_CONTROLLED_PULSE_PROFILE': return 'This coffee benefits from controlled pulses that support body while keeping the pour repeatable.';
    case 'LOW_ENERGY_GENTLE_PROFILE': return 'This coffee suits a calm continuous pour that keeps the slurry stable and extraction even.';
    default: return 'This coffee suits a balanced small-dose pulse pattern for clarity, sweetness, and repeatability.';
  }
}

function buildRecipe(intent, config, technique, { fallback = false } = {}) {
  const source = technique.sourceRecipe || sourceById(technique.sourceIds[0]) || V60_SOURCES[0];
  const ratio = clamp(Number(source.ratio) || Number(intentValue(intent, 'targetRatio', 16.5)) || 16.5, 15, 18.5);
  const waterGrams = round(config.dose * ratio);
  const temperature = technique.sourceRecipe
    ? clamp(source.temperatureC, 92, 100)
    : clamp(Number(intentValue(intent, 'targetTemperatureC', source.temperatureC || 96)) || 96, 92, 100);
  const shape = techniqueShape(technique, config.dose, waterGrams, source, intent);
  const finalAt = shape.at(-1)[0];
  const prepSteps = [
    { action: 'Rinse and preheat the V60 02 filter and server; discard rinse water.', phase: 'prep' },
    { action: `Add ${config.dose}g coffee, settle, and level the bed.`, phase: 'prep' },
  ];
  const steps = shape.map(([timeSeconds, waterTotal, action, name]) => ({ timeSeconds, time: timeLabel(timeSeconds), waterTotal, action, name, phase: 'brew' }));
  const sourceIds = technique.sourceRecipe ? [technique.sourceRecipe.id] : technique.structuredSource ? [technique.structuredSource.id, ...technique.sourceIds] : technique.sourceIds;
  const sourceSupportsV60 = source.supportedV60_02 !== false && !technique.structuredSource;
  const parameterRule = sourceSupportsV60 ? sourceIds[0] : V60_ADAPTATION_RULE_ID;
  const exactSourceDose = sourceSupportsV60 && config.dose === source.doseGrams;
  const scaled = sourceSupportsV60 && !exactSourceDose;
  const adaptedTechnique = technique.id === 'gentle-main-pour' && intent.finesRisk === 'high';
  const sourceCadenceExact = technique.sourceRecipe ? true : source.executableCadence === true;
  const temperatureAdapted = !technique.sourceRecipe && Number.isFinite(source.temperatureC) && temperature !== source.temperatureC;
  const exactSourceProfile = exactSourceDose && sourceCadenceExact && !adaptedTechnique && !temperatureAdapted;
  const sourceGuide = round(source.guideSeconds || 210);
  const doseGuideAdjustment = round((config.dose - (Number(source.doseGrams) || config.dose)) * 2);
  const contactGuideAdjustment = clamp(round(Number(intentValue(intent, 'contactTimeAdjustmentSeconds', 0)) || 0), -15, 15);
  const guide = exactSourceProfile
    ? sourceGuide
    : clamp(sourceGuide + doseGuideAdjustment + contactGuideAdjustment, Math.max(120, finalAt + 30), 360);
  const guideAdapted = guide !== sourceGuide;
  const guideRangeShift = guide - sourceGuide;
  const rawGuideRange = Array.isArray(source.guideRangeSeconds)
    ? source.guideRangeSeconds.map((seconds) => seconds + guideRangeShift)
    : [Math.max(guide - 30, finalAt + 30), guide + 30];
  const minimumGuideSpread = exactSourceProfile ? 0 : 20;
  const guideRange = [
    Math.max(finalAt + 15, Math.floor(Math.min(rawGuideRange[0], guide - minimumGuideSpread) / 5) * 5),
    Math.ceil(Math.max(rawGuideRange[1], guide + minimumGuideSpread) / 5) * 5,
  ];
  const scalingFields = scaled ? ['dose', 'water', 'bloom', 'cadence', 'guide'] : [];
  const cadenceFields = !sourceCadenceExact ? ['cadence'] : [];
  const status = !sourceSupportsV60 || adaptedTechnique || (exactSourceDose && (!sourceCadenceExact || temperatureAdapted || guideAdapted))
    ? 'adapted'
    : exactSourceDose ? 'original' : 'scaled';
  const adaptation = technique.sourceRecipe
    ? 'Follows the complete V60 02 recipe supplied by the roaster.'
    : technique.structuredSource
      ? 'Keeps the roaster’s available guidance inside a complete, tested V60 02 method.'
      : sourceSupportsV60
        ? `Published method: ${source.author} — ${source.publication}${exactSourceDose ? '' : `, scaled to ${config.dose}g`}${temperatureAdapted ? ' with a bean-specific temperature adjustment' : ''}.`
        : `Adapted from ${source.author}’s V60 01 guide for V60 02 and ${config.dose}g.`;
  const lineage = {
    method: 'v60', mode: 'hot', configurationKey: V60_CONFIGURATION_KEY, technique: technique.id, structuredSource: Boolean(technique.sourceRecipe), canonicalUrls: technique.sourceRecipe ? [technique.sourceRecipe.canonicalUrl] : undefined,
    sourceIds, sourceRegistryVersion: V60_SOURCE_REGISTRY_VERSION, status, adaptation,
    changedFields: [...scalingFields, ...cadenceFields, !scaled && guideAdapted && 'guide', temperatureAdapted && 'temperature', !sourceSupportsV60 && 'brewer', !sourceSupportsV60 && 'dose', !sourceSupportsV60 && 'ratio', !sourceSupportsV60 && 'temperature', (!sourceSupportsV60 || !source.grind) && 'grind', !sourceSupportsV60 && 'geometry', !sourceSupportsV60 && 'cadence', !sourceSupportsV60 && 'agitation', adaptedTechnique && 'agitation'].filter(Boolean),
    parameterSources: { ratio: sourceSupportsV60 ? sourceIds[0] : parameterRule, dose: exactSourceDose ? sourceIds[0] : 'user-configuration', temperature: temperatureAdapted || !sourceSupportsV60 ? V60_ADAPTATION_RULE_ID : sourceIds[0], grind: sourceSupportsV60 && source.grind ? sourceIds[0] : V60_ADAPTATION_RULE_ID, geometry: sourceSupportsV60 ? sourceIds[0] : parameterRule, agitation: adaptedTechnique || !sourceSupportsV60 ? V60_ADAPTATION_RULE_ID : sourceIds[0], water: scaled ? V60_SCALING_RULE_ID : (sourceSupportsV60 ? sourceIds[0] : parameterRule), bloom: !sourceSupportsV60 ? V60_ADAPTATION_RULE_ID : scaled || !sourceCadenceExact ? V60_SCALING_RULE_ID : sourceIds[0], cadence: !sourceSupportsV60 ? V60_ADAPTATION_RULE_ID : scaled || !sourceCadenceExact ? V60_SCALING_RULE_ID : sourceIds[0], guide: scaled ? V60_SCALING_RULE_ID : guideAdapted ? V60_ADAPTATION_RULE_ID : (sourceSupportsV60 ? sourceIds[0] : parameterRule) },
  };
  return {
    method: 'pour-over', device: 'v60', mode: 'hot', isIced: false, configurationKey: V60_CONFIGURATION_KEY,
    v60Size: '02', doseProfile: config.doseProfile, coffeeGrams: config.dose, waterGrams, ratio: `1:${displayRatio(ratio)}`,
    waterTemp: { celsius: temperature, fahrenheit: Math.round(temperature * 9 / 5 + 32) }, grindSize: technique.sourceRecipe
      ? { setting: null, microns: null, description: source.grind, grinderSpecific: false, sourceExact: true }
      : grindFor(config.grinder, technique, intent),
    technique: technique.id, techniqueLabel: technique.label, techniqueInstruction: technique.id === 'direct-roaster-v60' ? `${source.geometry || 'Source cadence'}; ${source.agitation || 'source agitation'}.` : `${technique.label}: center start, low stream, keep water off the paper walls.`,
    prepSteps, steps, postBrewSteps: [], totalBrewTimeSeconds: guide, totalBrewTime: timeLabel(guide), guideTargetSeconds: guide,
    guideRangeSeconds: guideRange, timerReady: true, phaseContractVersion: V60_PHASE_CONTRACT_VERSION,
    candidate: true, doseTimingPolicy: 'generated-dose-v60-v3', engineVersion: V60_ENGINE_VERSION, rulesVersion: V60_RULES_VERSION,
    sourceRegistryVersion: V60_SOURCE_REGISTRY_VERSION, sourceLineage: lineage, timingProfile: `v60:hot:${technique.id}`,
    reasonCodes: [...(intent.reasonCodes || []), technique.reasonCode, fallback && 'V60_CONSERVATIVE_BASELINE'].filter(Boolean),
    fallback: Boolean(fallback), generationStatus: fallback ? 'fallback' : 'candidate',
    reasoning: reasonForTechnique(technique, config),
    tips: 'Finish when the steady stream slows to occasional drips. Save the actual drawdown; taste decides what to change next time.',
    title: 'V60 02 recipe for this bean',
  };
}

export function validateV60Candidate(recipe) {
  const errors = [];
  if (!recipe || recipe.device !== 'v60' || recipe.mode !== 'hot' || recipe.isIced) errors.push('wrong-mode-or-device');
  if (recipe?.configurationKey !== V60_CONFIGURATION_KEY || recipe?.v60Size !== '02') errors.push('invalid-configuration');
  if (!Number.isFinite(recipe?.coffeeGrams) || recipe.coffeeGrams < MIN_DOSE || recipe.coffeeGrams > MAX_DOSE) errors.push('invalid-dose');
  if (!Number.isFinite(recipe?.waterGrams) || recipe.waterGrams <= 0 || !Number.isFinite(recipe?.waterTemp?.celsius)
    || recipe.waterTemp.celsius < 92 || recipe.waterTemp.celsius > 100) errors.push('invalid-physical-values');
  if (!recipe?.sourceLineage?.sourceRegistryVersion || !recipe?.sourceLineage?.parameterSources) errors.push('missing-provenance');
  for (const [field, sourceId] of Object.entries(recipe?.sourceLineage?.parameterSources || {})) {
    const structuredAllowed = recipe?.sourceLineage?.structuredSource === true && recipe.sourceLineage.canonicalUrls?.every((url) => url && !/reddit\.com/i.test(url));
    if (structuredAllowed && sourceId !== recipe.sourceLineage.sourceIds?.[0]) errors.push(`embedded-source-mismatch:${field}`);
    if (!isKnownV60ParameterSource(sourceId) && !structuredAllowed) errors.push(`unknown-parameter-source:${field}`);
    const rule = V60_RULES[sourceId];
    if (!structuredAllowed && rule && !rule.allowedFields.includes(field)) errors.push(`rule-field-mismatch:${field}`);
    if (!structuredAllowed && rule?.sourceIds?.length && !recipe.sourceLineage.sourceIds?.some((id) => rule.sourceIds.includes(id))) errors.push(`rule-source-mismatch:${field}`);
  }
  if (recipe?.sourceLineage?.status === 'original' && recipe.sourceLineage.changedFields?.length) errors.push('original-has-changed-fields');
  if (recipe?.sourceLineage?.status !== 'original' && !recipe?.sourceLineage?.changedFields?.length) errors.push('adaptation-missing-changed-fields');
  if (!Array.isArray(recipe?.prepSteps) || !recipe.prepSteps.length) errors.push('missing-prep');
  let lastWater = -1; let lastTime = -1;
  if (!Array.isArray(recipe?.steps) || !recipe.steps.length) errors.push('missing-steps');
  for (const step of recipe?.steps || []) {
    if (!Number.isFinite(step.timeSeconds) || step.timeSeconds <= lastTime) errors.push('invalid-timer-sequence');
    if (!Number.isFinite(step.waterTotal) || step.waterTotal <= 0 || step.waterTotal < lastWater || !step.action || !/bloom|center|spiral|pulse|pour|swirl|spin|stir|drain|rest|pause|finish|wait/i.test(step.action)) errors.push('invalid-step-copy-or-water');
    lastTime = step.timeSeconds; lastWater = step.waterTotal;
  }
  if (lastWater !== recipe?.waterGrams) errors.push('final-water-mismatch');
  if (!Number.isFinite(recipe?.guideTargetSeconds) || recipe.guideTargetSeconds <= lastTime) errors.push('invalid-guide');
  if (!Array.isArray(recipe?.guideRangeSeconds) || recipe.guideRangeSeconds.length !== 2
    || !recipe.guideRangeSeconds.every(Number.isFinite)
    || recipe.guideRangeSeconds[0] > recipe.guideTargetSeconds || recipe.guideTargetSeconds > recipe.guideRangeSeconds[1]) errors.push('invalid-guide-range');
  if (!recipe?.technique || !Object.values(V60_TECHNIQUES).some((technique) => technique.id === recipe.technique) && recipe.technique !== 'direct-roaster-v60') errors.push('closed-technique-failure');
  return { valid: errors.length === 0, errors };
}

export function generateV60Recipe(intent = {}, configuration = {}, evidence = null) {
  const config = normalizeV60Configuration(configuration);
  const technique = selectV60Technique(intent, config, evidence);
  const recipe = buildRecipe(intent, config, technique);
  const validation = validateV60Candidate(recipe);
  if (!validation.valid) throw new Error(`V60 candidate contract failed: ${validation.errors.join(', ')}`);
  return recipe;
}

export function generateV60Fallback(configuration = {}, reason = 'candidate-failed') {
  const config = normalizeV60Configuration(configuration);
  const recipe = buildRecipe({}, config, { ...V60_TECHNIQUES.smallPulse, reasonCode: 'V60_CONSERVATIVE_BASELINE' }, { fallback: true });
  recipe.fallbackReason = reason;
  const validation = validateV60Candidate(recipe);
  if (!validation.valid) throw new Error(`V60 fallback contract failed: ${validation.errors.join(', ')}`);
  return recipe;
}
