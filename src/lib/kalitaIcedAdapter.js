import { descriptorForMicrons, grinderSettingToMicrons, GRINDER_MICRON_SCALES } from './brewMethods.js';
import { kalitaDoseBounds, normalizeKalitaDose, normalizeKalitaSize } from '../data/kalitaConfiguration.js';
import {
  KALITA_ICED_RULES,
  KALITA_ICED_SOURCE_REGISTRY_VERSION,
  KALITA_ICED_SOURCES,
  KALITA_ICED_TECHNIQUES,
  isKnownKalitaIcedParameterSource,
  kalitaIcedSourceById,
} from '../data/kalitaIcedSourceRegistry.js';

export const KALITA_ICED_ENGINE_VERSION = 'kalita-iced-engine-v2';
export const KALITA_ICED_RULES_VERSION = 'kalita-iced-rules-v2';
export const KALITA_ICED_PHASE_CONTRACT_VERSION = 1;
export const KALITA_ICED_SCALING_RULE_ID = 'kalita-iced-dose-scaling-v1';
export const KALITA_ICED_GRIND_RULE_ID = 'kalita-iced-grind-translation-v1';
export const KALITA_ICED_TEMPERATURE_RULE_ID = 'kalita-iced-temperature-range-v1';
export const KALITA_ICED_FLOW_GUARD_RULE_ID = 'kalita-iced-explicit-flow-guard-v1';
export const KALITA_ICED_CHILLING_SELECTION_RULE_ID = 'kalita-iced-chilling-selection-v1';

const GRINDER_RANGES = {
  'fellow-ode-gen2': [1, 11], 'fellow-opus': [1, 11], 'baratza-encore-esp': [1, 40],
  'comandante-c40': [10, 40], '1zpresso-jx-pro': [60, 220], 'baratza-virtuoso-plus': [1, 40],
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const round = (value) => Math.round(value);
const timeLabel = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
const sourceGrindDescription = (source, flowGuard) => {
  const label = source.grind.split('-').map((part) => `${part[0].toUpperCase()}${part.slice(1)}`).join('-');
  return flowGuard ? `${label}, slightly coarser` : label;
};

export function kalitaIcedConfigurationKey(size) {
  return `kalita:${size}:wave-paper:iced`;
}

export function normalizeKalitaIcedConfiguration(configuration = {}) {
  const size = normalizeKalitaSize(configuration.size || configuration.kalitaSize, configuration.dose);
  const dose = normalizeKalitaDose(size, configuration.dose);
  const bounds = kalitaDoseBounds(size);
  return {
    size,
    dose,
    grinder: configuration.grinder || 'fellow-ode-gen2',
    chillingMethod: ['brew-over-ice', 'chill-after'].includes(configuration.chillingMethod)
      ? configuration.chillingMethod
      : 'auto',
    configurationKey: kalitaIcedConfigurationKey(size),
    doseProfile: size === '155' ? 'wave-155-12-20' : dose > 30 ? 'wave-185-31-36' : 'wave-185-15-30',
    bounds,
  };
}

function hasExplicitFlowRisk(intent = {}) {
  return intent.finesRisk === 'high' && Array.isArray(intent.reasonCodes)
    && intent.reasonCodes.includes('EXPLICIT_FLOW_RISK_GUARD');
}

export function selectKalitaIcedTechnique(intent = {}, configuration = {}) {
  const config = normalizeKalitaIcedConfiguration(configuration);
  const flowGuard = hasExplicitFlowRisk(intent);
  const directTechnique = config.size === '155'
    ? KALITA_ICED_TECHNIQUES.yamatoya155Direct
    : config.dose > 30
      ? KALITA_ICED_TECHNIQUES.frothyLargeDirect
      : KALITA_ICED_TECHNIQUES.espressoPartsDirect;
  const recommended = config.size === '155'
    ? KALITA_ICED_TECHNIQUES.kurasuIceAfter
    : directTechnique;
  const recommendedChillingMethod = recommended === KALITA_ICED_TECHNIQUES.kurasuIceAfter ? 'chill-after' : 'brew-over-ice';
  const selected = config.chillingMethod === 'chill-after' ? KALITA_ICED_TECHNIQUES.kurasuIceAfter
    : config.chillingMethod === 'brew-over-ice' ? directTechnique
      : recommended;
  const selectedChillingMethod = selected === KALITA_ICED_TECHNIQUES.kurasuIceAfter ? 'chill-after' : 'brew-over-ice';
  const chillingMethodOverrideApplied = config.chillingMethod !== 'auto' && selectedChillingMethod !== recommendedChillingMethod;
  const sourceEnvelopeCode = selected === KALITA_ICED_TECHNIQUES.yamatoya155Direct ? 'WAVE_155_DIRECT_CHILL_SOURCE_ENVELOPE'
    : selected === KALITA_ICED_TECHNIQUES.kurasuIceAfter ? 'KURASU_POST_BREW_CHILL_SOURCE_ENVELOPE'
      : selected === KALITA_ICED_TECHNIQUES.frothyLargeDirect ? 'WAVE_185_LARGE_SOURCE_ENVELOPE'
        : 'WAVE_185_STANDARD_SOURCE_ENVELOPE';
  return {
    ...selected,
    flowGuard,
    recommendedTechniqueId: recommended.id,
    recommendedChillingMethod,
    selectedChillingMethod,
    chillingMethodOverrideApplied,
    reasonCodes: [
      sourceEnvelopeCode,
      chillingMethodOverrideApplied && 'USER_CHILLING_METHOD_OVERRIDE',
      flowGuard && 'EXPLICIT_FLOW_RISK_GUARD',
    ].filter(Boolean),
  };
}

function grindFor(grinder, source, flowGuard) {
  const sourceMicrons = source.id === 'kurasu-wave-ice-after-v1' ? 912
    : source.id === 'yamatoya-wave-155-direct-v1' ? 650
    : source.id === 'frothy-monkey-wave-large-direct-v1' ? 620 : 680;
  const grindBounds = KALITA_ICED_RULES[KALITA_ICED_GRIND_RULE_ID].bounds.microns;
  const flowGuardDelta = KALITA_ICED_RULES[KALITA_ICED_FLOW_GUARD_RULE_ID].defaultMicronDelta;
  const targetMicrons = clamp(sourceMicrons + (flowGuard ? flowGuardDelta : 0), grindBounds[0], grindBounds[1]);
  const scale = GRINDER_MICRON_SCALES[grinder];
  if (!scale) return { setting: null, microns: targetMicrons, description: sourceGrindDescription(source, flowGuard), micronDescription: descriptorForMicrons(targetMicrons), grinderSpecific: false };
  const range = GRINDER_RANGES[grinder] || [1, 40];
  const numericSetting = Math.round(clamp((targetMicrons - scale.base) / scale.perStep + 1, range[0], range[1]) * 10) / 10;
  const microns = grinderSettingToMicrons(numericSetting, grinder);
  const setting = grinder === 'comandante-c40' ? `${Math.round(numericSetting)} clicks`
    : grinder === '1zpresso-jx-pro' ? `${Math.round(numericSetting)} clicks` : String(numericSetting);
  return { setting, microns, description: sourceGrindDescription(source, flowGuard), micronDescription: descriptorForMicrons(microns), grinderSpecific: true };
}

function scaledSteps(source, dose, hotWaterGrams, flowGuard) {
  if (dose === source.doseGrams && !flowGuard) {
    return source.steps.map((step) => ({ ...step, time: timeLabel(step.timeSeconds), phase: 'brew' }));
  }
  const targets = source.steps.map((step) => round(step.waterTotal / source.hotWaterGrams * hotWaterGrams));
  return source.steps.map((step, index) => {
    const target = index === source.steps.length - 1 ? hotWaterGrams : targets[index];
    let action;
    if (source.id === 'kurasu-wave-ice-after-v1') {
      action = index === 0
        ? `Pour slowly in a small circle around the center to ${target}g; do not spiral or swirl.`
        : index === source.steps.length - 1
          ? `Finish to ${target}g total with the same small center circle; do not spiral or swirl, then let it drip through.`
          : `Repeat the same small center circle to ${target}g total; do not widen into a spiral or swirl.`;
    } else if (source.id === 'yamatoya-wave-155-direct-v1') {
      action = index === 0
        ? `Pour slowly in a tight circle around the center to ${target}g; do not add a separate swirl, then bloom for 30 seconds.`
        : index === source.steps.length - 1
          ? `Finish to ${target}g total with the same tight center circle; do not add a separate stir or swirl, and finish pouring near 1:30.`
          : `Continue with the same slow center circle to ${target}g total; do not add a separate stir or swirl, then pause for 30 seconds.`;
    } else if (source.id === 'espresso-parts-wave-185-direct-v1') {
      action = index === 0
        ? `Bloom from the center to ${target}g, wetting the bed evenly; do not add a separate stir or swirl.`
        : flowGuard
          ? `Pour continuously in tight controlled circles near the center to ${target}g total; keep off the paper and do not stir or swirl.`
          : `Pour continuously in small controlled circles to ${target}g total; keep the stream on the coffee bed and do not stir or swirl.`;
    } else {
      action = index === 0
        ? `Bloom from the center to ${target}g and wet all grounds evenly; do not add a separate stir or swirl.`
        : flowGuard
          ? `Use a tight controlled spiral near the center to ${target}g total; keep off the paper and do not stir or swirl.`
          : `Use a controlled spiral from the middle outward to ${target}g total; keep off the paper and do not stir or swirl.`;
    }
    return { timeSeconds: step.timeSeconds, time: timeLabel(step.timeSeconds), waterTotal: target, action, phase: 'brew' };
  });
}

function buildRecipe(config, technique, { fallback = false } = {}) {
  const source = kalitaIcedSourceById(technique.sourceId) || KALITA_ICED_SOURCES[0];
  const exactDose = config.dose === source.doseGrams;
  const scale = config.dose / source.doseGrams;
  const hotWaterGrams = exactDose ? source.hotWaterGrams : round(source.hotWaterGrams * scale);
  const recipeIceGrams = exactDose ? source.recipeIceGrams : round(source.recipeIceGrams * scale);
  const directOverIce = source.initialBrewIceGrams != null;
  const initialBrewIceGrams = directOverIce ? recipeIceGrams : null;
  const postBrewIceGrams = directOverIce ? null : recipeIceGrams;
  const finalBeverageWaterTargetGrams = source.requiresCompleteMelt ? hotWaterGrams + recipeIceGrams : null;
  const finalBeverageRatio = finalBeverageWaterTargetGrams == null ? null : `1:${round(finalBeverageWaterTargetGrams / config.dose * 100) / 100}`;
  const steps = scaledSteps(source, config.dose, hotWaterGrams, technique.flowGuard);
  const guideShift = exactDose ? 0 : round((config.dose - source.doseGrams) * 2);
  const guideTargetSeconds = clamp(source.guideSeconds + guideShift, steps.at(-1).timeSeconds + 20, 300);
  const guideRangeSeconds = source.guideRangeSeconds.map((seconds) => seconds + (guideTargetSeconds - source.guideSeconds));
  const temperatureC = Number.isFinite(source.temperatureC)
    ? source.temperatureC
    : 94;
  const grindSize = grindFor(config.grinder, source, technique.flowGuard);
  const sourceNeedsAdaptation = !Number.isFinite(source.temperatureC)
    || (source.id === 'espresso-parts-wave-185-direct-v1' && Array.isArray(source.temperatureRangeC));
  const grindTranslated = !(source.id === 'kurasu-wave-ice-after-v1' && config.grinder === 'fellow-ode-gen2' && exactDose);
  const changedFields = [
    !exactDose && 'dose', !exactDose && 'hotWater', !exactDose && 'recipeIce', !exactDose && 'cadence', !exactDose && 'guide',
    sourceNeedsAdaptation && 'temperature', source.guideRuleId && 'guide', technique.chillingMethodOverrideApplied && 'technique',
    technique.flowGuard && 'geometry', (technique.flowGuard || grindTranslated) && 'grind',
  ].filter(Boolean);
  const status = technique.flowGuard || sourceNeedsAdaptation || technique.chillingMethodOverrideApplied || (exactDose && grindTranslated)
    ? 'adapted'
    : !exactDose ? 'scaled' : 'original';
  const parameterSources = {
    size: 'user-configuration',
    dose: exactDose ? source.id : 'user-configuration',
    hotWater: exactDose ? source.id : KALITA_ICED_SCALING_RULE_ID,
    recipeIce: exactDose ? source.id : KALITA_ICED_SCALING_RULE_ID,
    cadence: exactDose ? source.id : KALITA_ICED_SCALING_RULE_ID,
    guide: source.guideRuleId || (exactDose ? source.id : KALITA_ICED_SCALING_RULE_ID),
    temperature: sourceNeedsAdaptation ? KALITA_ICED_TEMPERATURE_RULE_ID : source.id,
    grind: technique.flowGuard ? KALITA_ICED_FLOW_GUARD_RULE_ID : grindTranslated ? KALITA_ICED_GRIND_RULE_ID : source.id,
    geometry: technique.flowGuard ? KALITA_ICED_FLOW_GUARD_RULE_ID : source.id,
    agitation: source.id,
    technique: technique.chillingMethodOverrideApplied ? 'user-configuration' : KALITA_ICED_CHILLING_SELECTION_RULE_ID,
  };
  const personalizationApplied = Boolean(technique.flowGuard);
  const icePlacement = directOverIce ? 'server before brewing' : 'glass after brewing';
  const iceTiming = directOverIce ? 'prep' : 'post-brew';
  const titleLabel = directOverIce ? 'Iced Flash Brew' : 'Iced Pour Over';
  const selectedMethodLabel = directOverIce ? 'brew over ice' : 'chill after brewing';
  const reasoning = technique.chillingMethodOverrideApplied
    ? `You chose ${selectedMethodLabel}; the app regenerated the complete source-backed recipe rather than only moving the ice step.`
      : technique.flowGuard
        ? `This source-backed Wave ${config.size} recipe keeps its pour tighter and grind slightly coarser because saved brew guidance explicitly warns about slow flow.`
        : `Source-backed starting point for Wave ${config.size} at ${config.dose}g. Size and dose select the published recipe family.`;
  return {
    method: 'pour-over', device: 'kalita', mode: 'iced', isIced: true, kalitaSize: config.size,
    configurationKey: config.configurationKey, doseProfile: config.doseProfile,
    coffeeGrams: config.dose, waterGrams: hotWaterGrams, hotWaterGrams,
    recipeIceGrams, iceGrams: recipeIceGrams, initialBrewIceGrams, postBrewIceGrams,
    finalBeverageWaterTargetGrams, hotExtractionRatio: `1:${round(hotWaterGrams / config.dose * 100) / 100}`,
    finalBeverageRatio, ratio: finalBeverageRatio, requiresCompleteMelt: source.requiresCompleteMelt,
    servingIceExcluded: true, measuredMeltedIceGrams: null, icePlacement, iceTiming,
    waterTemp: { celsius: temperatureC, fahrenheit: Math.round(temperatureC * 9 / 5 + 32) }, grindSize,
    technique: technique.id, techniqueLabel: technique.label,
    chillingMethod: technique.selectedChillingMethod,
    recommendedChillingMethod: technique.recommendedChillingMethod,
    chillingMethodOverrideApplied: technique.chillingMethodOverrideApplied,
    techniqueInstruction: directOverIce
      ? source.requiresCompleteMelt
        ? `${technique.label}: brew directly over recipe ice, then melt it before serving over fresh ice.`
        : `${technique.label}: brew directly over recipe ice, gently swirl to chill, then serve over fresh ice.`
      : `${technique.label}: brew hot first, then pour over measured chill ice and stir until cold.`,
    prepSteps: [
      { action: `Rinse and preheat the Wave ${config.size} filter and server; discard rinse water.`, phase: 'prep' },
      ...(directOverIce ? [{ action: `Add ${recipeIceGrams}g recipe ice to the server before brewing. Serving ice is separate.`, phase: 'prep' }] : []),
      { action: `Add ${config.dose}g coffee and level the bed.`, phase: 'prep' },
    ],
    steps,
    postBrewSteps: [{ action: exactDose ? source.postBrewInstruction : source.id === 'yamatoya-wave-155-direct-v1'
      ? `After Finish Brew, remove the dripper and stir the server in a figure-eight until the ${recipeIceGrams}g recipe ice has fully melted. Pour over fresh serving ice if desired.`
      : directOverIce
      ? source.requiresCompleteMelt
        ? `After Finish Brew, swirl the server until the ${recipeIceGrams}g recipe ice has melted, then pour over fresh serving ice.`
        : `After Finish Brew, gently swirl the server to chill the coffee over the ${recipeIceGrams}g recipe ice, then pour over fresh serving ice. Complete melt is not assumed.`
      : `After Finish Brew, add ${recipeIceGrams}g ice to a glass, pour the hot coffee over it, and stir until cold. Complete melt is not assumed.`, phase: 'post-brew', untimed: true }],
    totalBrewTimeSeconds: guideTargetSeconds, totalBrewTime: timeLabel(guideTargetSeconds), guideTargetSeconds, guideRangeSeconds,
    timerReady: true, phaseContractVersion: KALITA_ICED_PHASE_CONTRACT_VERSION,
    engineVersion: KALITA_ICED_ENGINE_VERSION, rulesVersion: KALITA_ICED_RULES_VERSION,
    sourceRegistryVersion: KALITA_ICED_SOURCE_REGISTRY_VERSION, candidate: true,
    doseTimingPolicy: 'generated-dose-kalita-iced-v1', timingProfile: `kalita:iced:${config.size}:${technique.id}`,
    sourceLineage: {
      method: 'kalita', mode: 'iced', configurationKey: config.configurationKey, technique: technique.id,
      sourceIds: [source.id], canonicalUrls: [source.canonicalUrl], sourceRegistryVersion: KALITA_ICED_SOURCE_REGISTRY_VERSION,
      status, changedFields, parameterSources,
      adaptation: exactDose && status === 'original'
        ? `Exact published ${source.author} recipe.`
        : `Source-backed ${source.author} profile with only versioned configuration changes.`,
    },
    personalizationApplied, reasonCodes: [...(technique.reasonCodes || []), fallback && 'KALITA_ICED_CONSERVATIVE_BASELINE'].filter(Boolean),
    fallback: Boolean(fallback), generationStatus: fallback ? 'fallback' : 'candidate',
    reasoning, tips: `Guide finish ${timeLabel(guideTargetSeconds)} is a drawdown reference. Finish when dripping ends; the timer stays in overtime until you press Finish Brew.`,
    title: `Iced Kalita Wave ${config.size} recipe`, icedModeLabel: titleLabel,
    icedEntryLabel: directOverIce ? 'Flash brew this coffee' : 'Iced pour over this coffee',
  };
}

export function validateKalitaIcedCandidate(recipe) {
  const errors = [];
  if (!recipe || recipe.device !== 'kalita' || recipe.mode !== 'iced' || !recipe.isIced) errors.push('wrong-mode-or-device');
  const bounds = kalitaDoseBounds(recipe?.kalitaSize);
  if (!Number.isFinite(recipe?.coffeeGrams) || recipe.coffeeGrams < bounds.minDose || recipe.coffeeGrams > bounds.maxDose) errors.push('invalid-dose');
  if (recipe?.configurationKey !== kalitaIcedConfigurationKey(recipe?.kalitaSize)) errors.push('invalid-configuration');
  for (const key of ['hotWaterGrams', 'recipeIceGrams']) if (!Number.isFinite(recipe?.[key]) || recipe[key] <= 0) errors.push(`invalid-${key}`);
  const hasInitialIce = Number.isFinite(recipe?.initialBrewIceGrams);
  const hasPostIce = Number.isFinite(recipe?.postBrewIceGrams);
  if (hasInitialIce === hasPostIce || (hasInitialIce ? recipe.initialBrewIceGrams : recipe.postBrewIceGrams) !== recipe.recipeIceGrams) errors.push('invalid-ice-timing');
  if (recipe.requiresCompleteMelt) {
    if (recipe.finalBeverageWaterTargetGrams !== recipe.hotWaterGrams + recipe.recipeIceGrams || !recipe.finalBeverageRatio) errors.push('complete-melt-math');
  } else if (recipe.finalBeverageWaterTargetGrams != null || recipe.finalBeverageRatio != null || recipe.ratio != null) errors.push('unsupported-melt-claim');
  if (recipe.servingIceExcluded !== true || recipe.measuredMeltedIceGrams !== null) errors.push('ice-semantics');
  if (!['brew-over-ice', 'chill-after'].includes(recipe?.chillingMethod)
    || !['brew-over-ice', 'chill-after'].includes(recipe?.recommendedChillingMethod)
    || typeof recipe?.chillingMethodOverrideApplied !== 'boolean') errors.push('chilling-method');
  if ((recipe.chillingMethod === 'brew-over-ice') !== hasInitialIce) errors.push('chilling-method-ice-timing');
  if (!Number.isFinite(recipe?.waterTemp?.celsius) || !Number.isFinite(recipe?.waterTemp?.fahrenheit) || recipe.waterTemp.celsius < 90 || recipe.waterTemp.celsius > 96) errors.push('temperature');
  if (!recipe?.grindSize || !Number.isFinite(recipe.grindSize.microns)) errors.push('grind');
  if (!Array.isArray(recipe?.prepSteps) || recipe.prepSteps.length < 2 || !Array.isArray(recipe?.postBrewSteps) || recipe.postBrewSteps.length !== 1) errors.push('phase-steps');
  let lastTime = -1; let lastWater = -1;
  for (const step of recipe?.steps || []) {
    if (!Number.isFinite(step.timeSeconds) || step.timeSeconds <= lastTime) errors.push('timer-sequence');
    if (!Number.isFinite(step.waterTotal) || step.waterTotal <= lastWater || !/center|circle|spiral/i.test(step.action) || !/swirl|stir/i.test(step.action)) errors.push('step-copy-or-water');
    lastTime = step.timeSeconds; lastWater = step.waterTotal;
  }
  if (recipe?.steps?.[0]?.timeSeconds !== 0 || lastWater !== recipe.hotWaterGrams || !Number.isFinite(recipe.guideTargetSeconds) || recipe.guideTargetSeconds <= lastTime) errors.push('guide-or-water');
  if (!Array.isArray(recipe?.guideRangeSeconds) || recipe.guideRangeSeconds.length !== 2 || !recipe.guideRangeSeconds.every(Number.isFinite)
    || recipe.guideRangeSeconds[0] > recipe.guideTargetSeconds || recipe.guideTargetSeconds > recipe.guideRangeSeconds[1]) errors.push('guide-range');
  if (!Object.values(KALITA_ICED_TECHNIQUES).some((technique) => technique.id === recipe?.technique)) errors.push('closed-technique');
  if (!recipe?.sourceLineage?.sourceIds?.every((id) => kalitaIcedSourceById(id)?.executable) || recipe.sourceLineage.sourceRegistryVersion !== KALITA_ICED_SOURCE_REGISTRY_VERSION) errors.push('source-lineage');
  for (const [field, sourceId] of Object.entries(recipe?.sourceLineage?.parameterSources || {})) {
    if (!isKnownKalitaIcedParameterSource(sourceId)) errors.push(`unknown-parameter-source:${field}`);
    const rule = KALITA_ICED_RULES[sourceId];
    if (rule && !rule.allowedFields.includes(field)) errors.push(`rule-field-mismatch:${field}`);
    if (rule?.sourceIds?.length && !recipe.sourceLineage.sourceIds.some((id) => rule.sourceIds.includes(id))) errors.push(`rule-source-mismatch:${field}`);
  }
  if (recipe?.sourceLineage?.status === 'original' && recipe.sourceLineage.changedFields?.length) errors.push('original-has-changes');
  if (recipe?.sourceLineage?.status !== 'original' && !recipe?.sourceLineage?.changedFields?.length) errors.push('adaptation-missing-changes');
  const hasPersonalizationReason = recipe?.reasonCodes?.includes('EXPLICIT_FLOW_RISK_GUARD');
  if (recipe?.personalizationApplied !== hasPersonalizationReason) errors.push('personalization-truth');
  if (!recipe.personalizationApplied && /bean-specific|tailored to this bean/i.test(`${recipe.reasoning} ${recipe.title}`)) errors.push('false-personalization-copy');
  if (!recipe.icedModeLabel || !recipe.icedEntryLabel) errors.push('missing-mode-labels');
  return { valid: errors.length === 0, errors };
}

export function generateKalitaIcedRecipe(intent = {}, configuration = {}) {
  const config = normalizeKalitaIcedConfiguration(configuration);
  const recipe = buildRecipe(config, selectKalitaIcedTechnique(intent, config));
  const validation = validateKalitaIcedCandidate(recipe);
  if (!validation.valid) throw new Error(`Kalita iced candidate contract failed: ${validation.errors.join(', ')}`);
  return recipe;
}

export function generateKalitaIcedFallback(configuration = {}, reason = 'candidate-failed') {
  const config = normalizeKalitaIcedConfiguration(configuration);
  const selected = selectKalitaIcedTechnique({}, config);
  const technique = config.chillingMethod === 'auto'
    ? {
      ...KALITA_ICED_TECHNIQUES.kurasuIceAfter,
      flowGuard: false,
      selectedChillingMethod: 'chill-after',
      recommendedChillingMethod: selected.recommendedChillingMethod,
      chillingMethodOverrideApplied: false,
      reasonCodes: ['KALITA_ICED_CONSERVATIVE_BASELINE'],
    }
    : { ...selected, flowGuard: false, reasonCodes: [...selected.reasonCodes, 'KALITA_ICED_CONSERVATIVE_BASELINE'] };
  const recipe = buildRecipe(config, technique, { fallback: true });
  recipe.fallbackReason = reason;
  const validation = validateKalitaIcedCandidate(recipe);
  if (!validation.valid) throw new Error(`Kalita iced fallback contract failed: ${validation.errors.join(', ')}`);
  return recipe;
}

export function isDeterministicKalitaHot(recipe) {
  return recipe?.candidate === true && recipe?.device === 'kalita' && (recipe?.mode == null || recipe.mode === 'hot');
}
