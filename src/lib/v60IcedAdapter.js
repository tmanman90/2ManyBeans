import { descriptorForMicrons, grinderSettingToMicrons, GRINDER_MICRON_SCALES } from './brewMethods.js';
import { V60_ICED_SOURCE_REGISTRY_VERSION, V60_ICED_SOURCES, V60_ICED_TECHNIQUES, icedSourceById, isKnownV60IcedParameterSource } from '../data/v60IcedSourceRegistry.js';

export const V60_ICED_ENGINE_VERSION = 'v60-iced-engine-v1';
export const V60_ICED_RULES_VERSION = 'v60-iced-rules-v1';
export const V60_ICED_CONFIGURATION_KEY = 'v60:02:standard-paper:direct-server';
export const V60_ICED_PHASE_CONTRACT_VERSION = 1;
export const V60_ICED_SCALING_RULE_ID = 'v60-iced-dose-scaling-v1';
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const round = (value) => Math.round(value);
const timeLabel = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

export function normalizeV60IcedConfiguration(config = {}) {
  const dose = Number(config.dose);
  if (!Number.isFinite(dose) || dose < 12 || dose > 30) throw new Error('Iced V60 02 dose must be between 12g and 30g');
  return { dose, grinder: config.grinder || 'fellow-ode-gen2', configurationKey: V60_ICED_CONFIGURATION_KEY, doseProfile: dose <= 20 ? 'single-cup-12-20' : 'larger-dose-21-30' };
}

function intentText(intent = {}) { return JSON.stringify(intent).toLowerCase(); }

function executableIcedSource(recipe, dose) {
  if (!recipe || recipe.status !== 'original' || recipe.doseGrams !== dose || !Number.isFinite(recipe.finalWaterGrams) || !Number.isFinite(recipe.guideSeconds)) return null;
  if (recipe.hotWaterGrams + recipe.iceGrams !== recipe.finalWaterGrams || Math.abs(recipe.finalWaterGrams / recipe.doseGrams - recipe.ratio) > 0.01) return null;
  if (!Array.isArray(recipe.steps) || recipe.steps.length < 2 || recipe.steps[0].timeSeconds !== 0 || recipe.steps.at(-1).waterTotal !== recipe.hotWaterGrams || recipe.guideSeconds <= recipe.steps.at(-1).timeSeconds) return null;
  let lastTime = -1; let lastWater = -1;
  for (const step of recipe.steps) {
    if (step.timeSeconds <= lastTime || step.waterTotal < lastWater) return null;
    lastTime = step.timeSeconds; lastWater = step.waterTotal;
  }
  return recipe;
}

export function selectV60IcedTechnique(intent = {}, config = {}) {
  const normalized = normalizeV60IcedConfiguration(config);
  const text = intentText(intent);
  const structured = intent.sourceRecipes?.find((recipe) => recipe.mode === 'iced'
    && recipe.device === 'v60'
    && recipe.status === 'original'
    && /v60\s*02|v60:02:standard-paper/i.test(String(recipe.configuration || ''))
    && Number(recipe.doseGrams) === normalized.dose
    && Number.isFinite(recipe.hotWaterGrams) && Number.isFinite(recipe.iceGrams)
    && Number.isFinite(recipe.guideSeconds)
    && recipe.steps?.length >= 2
    && !/reddit\.com/i.test(recipe.canonicalUrl || '')) || null;
  const executableStructured = executableIcedSource(structured, normalized.dose);
  const structuredId = structured?.id;
  const knownStructured = (structuredId && icedSourceById(structuredId))
    || intent.sourceRecipes?.find((recipe) => recipe.mode === 'iced' && recipe.device === 'v60' && icedSourceById(recipe.id));
  if (executableStructured) return { id: 'direct-roaster-iced-v60', sourceIds: [executableStructured.id], label: 'structured iced source cadence', sourceRecipe: executableStructured, reasonCode: 'EXACT_STRUCTURED_ICED_SOURCE', structuredSource: true };
  if (knownStructured?.id === 'counterculture-flash-v1') return { ...V60_ICED_TECHNIQUES.countercultureAdapted, reasonCode: 'COUNTERCULTURE_CORROBORATION_ADAPTED' };
  if (knownStructured?.id === 'partners-flash-6733-v1') return { ...V60_ICED_TECHNIQUES.pulse6733, reasonCode: 'STRUCTURED_PARTNERS_SOURCE_PROFILE' };
  if (knownStructured?.id === 'kurasu-iced-staged-v1') return { ...V60_ICED_TECHNIQUES.kurasuStaged, reasonCode: 'STRUCTURED_KURASU_SOURCE_PROFILE' };
  if (knownStructured?.id === 'hoffmann-flash-6040-v1') return { ...V60_ICED_TECHNIQUES.classic6040, reasonCode: 'STRUCTURED_HOFFMANN_SOURCE_PROFILE' };
  if (knownStructured?.id === 'counterculture-flash-v1') return { ...V60_ICED_TECHNIQUES.pulse6733, reasonCode: 'STRUCTURED_COUNTERCULTURE_SOURCE_PROFILE' };
  if (text.includes('kurasu') || text.includes('staged iced') || intent.finesRisk === 'high' || intent.softPriors?.roast === 'developed') return { ...V60_ICED_TECHNIQUES.kurasuStaged, reasonCode: 'BOUNDED_LOW_AGITATION_ICE_PROFILE' };
  if (intent.sourceRecipes?.some((recipe) => recipe.mode === 'iced' && recipe.id === 'counterculture-flash-v1')) return { ...V60_ICED_TECHNIQUES.countercultureAdapted, reasonCode: 'COUNTERCULTURE_CORROBORATION_ADAPTED' };
  if (normalized.dose > 20) return { ...V60_ICED_TECHNIQUES.classic6040, reasonCode: 'LARGER_DOSE_CLASSIC_6040_BUDGET' };
  return { ...V60_ICED_TECHNIQUES.pulse6733, reasonCode: 'SINGLE_CUP_PULSE_6733_BUDGET' };
}

function grindFor(grinder) {
  const target = 690;
  const scale = GRINDER_MICRON_SCALES[grinder];
  if (!scale) return { setting: null, microns: target, micronRange: [655, 725], description: descriptorForMicrons(target), grinderSpecific: false };
  const setting = Math.round(clamp((target - scale.base) / scale.perStep + 1, 1, 40) * 10) / 10;
  const microns = grinderSettingToMicrons(setting, grinder);
  return { setting: String(setting), microns, description: descriptorForMicrons(microns), grinderSpecific: true };
}

function buildSteps(technique, dose, hotWater, source) {
  const bloom = round(dose * 3);
  if (technique.id === 'direct-roaster-iced-v60' && technique.sourceRecipe?.steps?.length) return technique.sourceRecipe.steps.map((step) => [step.timeSeconds, step.waterTotal, step.action]);
  if (technique.id === 'classic-60-40-flash') return [
    [0, bloom, `Bloom with ${bloom}g from the center; keep the stream on the bed and off the paper.`],
    [45, round(hotWater * 0.55), `Pour a controlled spiral to ${round(hotWater * 0.55)}g hot water; no aggressive agitation.`],
    [120, hotWater, `Finish with a controlled center pour to ${hotWater}g hot water using a low stream; let it drain without a final swirl.`],
  ];
  if (technique.id === 'kurasu-staged-flash' && source.id === 'kurasu-iced-staged-v1' && dose === source.doseGrams && Array.isArray(source.pourTargets)) return source.pourTargets.map((target, index) => [target.seconds, target.grams, index === 0
    ? `Bloom with ${target.grams}g in a small center circle; let the bed settle.`
    : index === source.pourTargets.length - 1
      ? `Complete the staged pour to ${target.grams}g; use a gentle third-pour motion with a low stream, keep off paper.`
      : `Use a small-radius staged pour to ${target.grams}g; keep the stream low and off paper.`]);
  if (technique.id === 'kurasu-staged-flash') return [
    [0, bloom, `Bloom with ${bloom}g in a small center circle; let the bed settle.`],
    [40, round(hotWater * 0.5), `Use a small-radius staged pour to ${round(hotWater * 0.5)}g; keep off paper.`],
    [95, hotWater, `Complete the staged pour to ${hotWater}g; stir only as directed after drawdown.`],
  ];
  if (source?.id === 'partners-flash-6733-v1' && dose === source.doseGrams && Array.isArray(source.pourTargets)) return source.pourTargets.map((target, index) => [target.seconds, target.grams, index === 0
    ? `Bloom with ${target.grams}g water in the center; stir gently as directed by the source.`
    : `Pour to ${target.grams}g hot water with a low centered pulse; keep the stream on the bed and away from paper.`]);
  const finalAction = source?.id === 'partners-flash-6733-v1'
      ? `Finish with a low centered pulse to ${hotWater}g; keep the stream on the bed and away from paper. After drawdown give the gentle carafe swirl from the source.`
    : source?.id === 'counterculture-flash-v1'
      ? `Finish with a circular pulse to ${hotWater}g; keep the stream low and off paper; do not infer an agitation step the source does not specify.`
      : `Finish with a low centered pulse to ${hotWater}g; keep the stream on the bed and away from paper; no final swirl.`;
  return [
    [0, bloom, `Bloom with ${bloom}g from the center; wet the bed evenly and do not swirl.`],
    [40, round(hotWater * 0.5), `Pulse in a restrained center-to-small-spiral pattern to ${round(hotWater * 0.5)}g; keep off paper.`],
    [100, hotWater, finalAction],
  ];
}

function sourceFor(technique) { return technique.sourceRecipe || icedSourceById(technique.sourceIds[0]) || V60_ICED_SOURCES[1]; }

function buildRecipe(config, intent, technique, { fallback = false } = {}) {
  const source = sourceFor(technique);
  const family = technique.id === 'classic-60-40-flash' ? 'classic-60-40' : 'pulse-67-33';
  const hotFraction = Number.isFinite(source.hotWaterGrams) && Number.isFinite(source.finalWaterGrams)
    ? source.hotWaterGrams / source.finalWaterGrams
    : family === 'classic-60-40' ? 0.6 : 2 / 3;
  const exactStructured = technique.structuredSource === true && config.dose === source.doseGrams;
  const totalWater = exactStructured ? source.finalWaterGrams : round(config.dose * clamp(Number(source.ratio) || 15, 13.5, 20));
  const hotWaterGrams = exactStructured ? source.hotWaterGrams : round(totalWater * hotFraction);
  const initialBrewIceGrams = exactStructured ? source.iceGrams : totalWater - hotWaterGrams;
  const finalBeverageWaterTargetGrams = totalWater;
  const steps = buildSteps(technique, config.dose, hotWaterGrams, source).map(([timeSeconds, waterTotal, action]) => ({ timeSeconds, time: timeLabel(timeSeconds), waterTotal, action, phase: 'brew' }));
  const exactSourceDose = config.dose === source.doseGrams;
  const guideTargetSeconds = exactStructured || (source.id === 'kurasu-iced-staged-v1' && exactSourceDose)
    ? round(source.guideSeconds)
    : clamp(round(source.guideSeconds || 180) + (config.dose > 20 ? 30 : 0), 140, 330);
  const sourceId = source.id;
  const sourceRequiresAdaptation = source.id === 'kurasu-iced-staged-v1' || source.status !== 'original';
  const scaled = !exactSourceDose;
  const sourceLineage = {
    method: 'v60', mode: 'iced', configurationKey: V60_ICED_CONFIGURATION_KEY, technique: technique.id, structuredSource: Boolean(technique.structuredSource), canonicalUrls: technique.sourceRecipe ? [technique.sourceRecipe.canonicalUrl] : undefined,
    sourceIds: [sourceId], sourceRegistryVersion: V60_ICED_SOURCE_REGISTRY_VERSION, status: sourceRequiresAdaptation ? 'adapted' : exactSourceDose ? 'original' : 'scaled',
    adaptation: `Independent iced profile based on ${source.author}; hot candidate is not used.`,
    changedFields: [
      config.dose !== source.doseGrams && 'doseGrams',
      scaled && 'hotWaterGrams', scaled && 'initialBrewIceGrams', scaled && 'cadence',
      sourceRequiresAdaptation && 'configuration',
      !Number.isFinite(source.guideSeconds) && 'guideSeconds',
    ].filter(Boolean),
    parameterSources: { family: sourceId, dose: exactSourceDose ? sourceId : 'user-configuration', hotWater: scaled ? V60_ICED_SCALING_RULE_ID : sourceId, brewIce: scaled ? V60_ICED_SCALING_RULE_ID : sourceId, ratio: sourceId, geometry: sourceId, agitation: source.agitation ? sourceId : V60_ICED_SCALING_RULE_ID, guide: !Number.isFinite(source.guideSeconds) || scaled ? V60_ICED_SCALING_RULE_ID : sourceId },
  };
  return {
    method: 'pour-over', device: 'v60', mode: 'iced', isIced: true, configurationKey: V60_ICED_CONFIGURATION_KEY, v60Size: '02', doseProfile: config.doseProfile,
    coffeeGrams: config.dose, waterGrams: hotWaterGrams, hotWaterGrams, initialBrewIceGrams, iceGrams: initialBrewIceGrams,
    finalBeverageWaterTargetGrams, hotExtractionRatio: `1:${round(hotWaterGrams / config.dose * 100) / 100}`, finalBeverageRatio: `1:${round(finalBeverageWaterTargetGrams / config.dose * 100) / 100}`,
    servingIceExcluded: true, measuredMeltedIceGrams: null, actualFinalBeverageMassGrams: null, actualFinalTemperatureC: null,
    ratio: `1:${round(finalBeverageWaterTargetGrams / config.dose * 100) / 100}`, waterTemp: (() => { const celsius = clamp(Number(intent?.targetTemperatureC) || 96, 92, 100); return { celsius, fahrenheit: Math.round(celsius * 9 / 5 + 32) }; })(), grindSize: grindFor(config.grinder),
    technique: technique.id, techniqueLabel: technique.label, techniqueInstruction: `${technique.label}: brew hot directly over ice for rapid cooling; serving ice is separate.`,
    prepSteps: [
      { action: 'Rinse and preheat the V60 02 filter and server; discard rinse water.', phase: 'prep' },
      { action: `Add ${initialBrewIceGrams}g brew ice to the server. This is recipe water, not a measured melt guarantee.`, phase: 'prep' },
      { action: `Add ${config.dose}g coffee and level the bed.`, phase: 'prep' },
    ],
    steps, postBrewSteps: [{ action: source.postBrewInstruction || 'After Finish Brew, swirl or stir until the recipe ice has melted as directed; serve over fresh serving ice.', phase: 'post-brew', untimed: true }],
    totalBrewTimeSeconds: guideTargetSeconds, totalBrewTime: timeLabel(guideTargetSeconds), guideTargetSeconds, guideRangeSeconds: source.guideRangeSeconds || [guideTargetSeconds - 30, guideTargetSeconds + 30],
    timerReady: true, phaseContractVersion: V60_ICED_PHASE_CONTRACT_VERSION, candidate: true, doseTimingPolicy: 'generated-dose-v60-iced-v1',
    engineVersion: V60_ICED_ENGINE_VERSION, rulesVersion: V60_ICED_RULES_VERSION, sourceRegistryVersion: V60_ICED_SOURCE_REGISTRY_VERSION,
    sourceLineage, timingProfile: `v60:iced:${technique.id}`, reasonCodes: [technique.reasonCode, fallback && 'V60_ICED_CONSERVATIVE_BASELINE'].filter(Boolean), fallback: Boolean(fallback), generationStatus: fallback ? 'fallback' : 'candidate',
    reasoning: `This iced profile uses the ${family} extraction budget for a ${config.doseProfile.replaceAll('-', ' ')} dose.`, tips: `Guide finish ${timeLabel(guideTargetSeconds)} ends at drawdown. Chilling happens after Finish Brew and is not timing memory.`, title: 'Iced V60 02 bean-specific recipe',
  };
}

export function validateV60IcedCandidate(recipe) {
  const errors = [];
  if (!recipe || recipe.device !== 'v60' || recipe.mode !== 'iced' || !recipe.isIced) errors.push('wrong-mode-or-device');
  if (recipe?.configurationKey !== V60_ICED_CONFIGURATION_KEY || recipe?.v60Size !== '02') errors.push('invalid-configuration');
  if (!Number.isFinite(recipe?.coffeeGrams) || recipe.coffeeGrams < 12 || recipe.coffeeGrams > 30) errors.push('invalid-dose');
  for (const key of ['hotWaterGrams', 'initialBrewIceGrams', 'finalBeverageWaterTargetGrams']) if (!Number.isFinite(recipe?.[key]) || recipe[key] <= 0) errors.push(`invalid-${key}`);
  if (recipe.hotWaterGrams + recipe.initialBrewIceGrams !== recipe.finalBeverageWaterTargetGrams) errors.push('beverage-math-mismatch');
  if (Math.abs(recipe.finalBeverageWaterTargetGrams / recipe.coffeeGrams - Number(String(recipe.finalBeverageRatio).split(':')[1])) > 0.01) errors.push('final-ratio-mismatch');
  const hotFraction = recipe.hotWaterGrams / recipe.finalBeverageWaterTargetGrams;
  if (recipe.technique === 'classic-60-40-flash' && Math.abs(hotFraction - 0.6) > 0.01) errors.push('classic-fraction-mismatch');
  if (recipe.servingIceExcluded !== true || recipe.measuredMeltedIceGrams !== null) errors.push('ice-semantics-failure');
  if (!Array.isArray(recipe.prepSteps) || recipe.prepSteps.length < 3 || !Array.isArray(recipe.postBrewSteps) || !recipe.postBrewSteps.length) errors.push('missing-phase-steps');
  let lastTime = -1; let lastWater = -1;
  for (const step of recipe.steps || []) {
    if (!Number.isFinite(step.timeSeconds) || step.timeSeconds <= lastTime) errors.push('invalid-timer-sequence');
    if (!Number.isFinite(step.waterTotal) || step.waterTotal < lastWater || !/center|spiral|pulse|staged/i.test(step.action)) errors.push('invalid-step-copy-or-water');
    lastTime = step.timeSeconds; lastWater = step.waterTotal;
  }
  if (recipe.steps?.[0]?.timeSeconds !== 0 || lastWater !== recipe.hotWaterGrams || recipe.guideTargetSeconds <= lastTime) errors.push('invalid-guide-or-water');
  if (!recipe.sourceLineage?.sourceRegistryVersion || recipe.sourceLineage.mode !== 'iced') errors.push('missing-provenance');
  for (const [field, sourceId] of Object.entries(recipe?.sourceLineage?.parameterSources || {})) {
    const structuredAllowed = recipe?.sourceLineage?.structuredSource === true && recipe.sourceLineage.canonicalUrls?.every((url) => url && !/reddit\.com/i.test(url));
    if (structuredAllowed && !isKnownV60IcedParameterSource(sourceId) && sourceId !== recipe.sourceLineage.sourceIds?.[0]) errors.push(`embedded-source-mismatch:${field}`);
    if (!isKnownV60IcedParameterSource(sourceId) && !structuredAllowed) errors.push(`unknown-parameter-source:${field}`);
  }
  if (recipe?.sourceLineage?.status === 'original' && recipe.sourceLineage.changedFields?.length) errors.push('original-has-changed-fields');
  if (recipe?.sourceLineage?.status !== 'original' && !recipe?.sourceLineage?.changedFields?.length) errors.push('adaptation-missing-changed-fields');
  if (!Object.values(V60_ICED_TECHNIQUES).some((technique) => technique.id === recipe.technique) && recipe.technique !== 'direct-roaster-iced-v60') errors.push('closed-technique-failure');
  return { valid: errors.length === 0, errors };
}

export function generateV60IcedRecipe(intent = {}, configuration = {}) {
  const config = normalizeV60IcedConfiguration(configuration);
  const recipe = buildRecipe(config, intent, selectV60IcedTechnique(intent, config));
  const validation = validateV60IcedCandidate(recipe);
  if (!validation.valid) throw new Error(`Iced V60 candidate contract failed: ${validation.errors.join(', ')}`);
  return recipe;
}

export function generateV60IcedFallback(configuration = {}, reason = 'candidate-failed') {
  const config = normalizeV60IcedConfiguration(configuration);
  const recipe = buildRecipe(config, {}, { ...V60_ICED_TECHNIQUES.pulse6733, reasonCode: 'V60_ICED_CONSERVATIVE_BASELINE' }, { fallback: true });
  recipe.fallbackReason = reason;
  const validation = validateV60IcedCandidate(recipe);
  if (!validation.valid) throw new Error(`Iced V60 fallback contract failed: ${validation.errors.join(', ')}`);
  return recipe;
}
