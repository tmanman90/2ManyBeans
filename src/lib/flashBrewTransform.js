// Flash brew (急冷式) transform: hot recipe + device category + dose -> iced recipe
// Deterministic, no AI calls, no side effects.

import { nearestOdeStep } from './brewMethods';
import { BREW_METHODS } from './brewMethods';

const ICE_FRACTION = 0.4;
const HOT_FRACTION = 0.6;
const ICE_PREP_DURATION = 10;

function computeIceSplit(hotRecipe, userDose) {
  const dose = userDose || hotRecipe.coffeeGrams;
  const ratioStr = hotRecipe.ratio || '1:16';
  const divisor = parseFloat(String(ratioStr).match(/1\s*:\s*(\d+(?:\.\d+)?)/)?.[1]) || 16;
  const totalWater = dose * divisor;
  return {
    dose,
    totalWater,
    hotWater: Math.round(totalWater * HOT_FRACTION),
    iceGrams: Math.round(totalWater * ICE_FRACTION),
  };
}

function bumpTemp(waterTemp) {
  if (!waterTemp) return waterTemp;
  if (typeof waterTemp === 'number') return Math.min(waterTemp + 1, 99);
  if (typeof waterTemp === 'object' && waterTemp.celsius != null) {
    return {
      celsius: Math.min(waterTemp.celsius + 1, 99),
      fahrenheit: typeof waterTemp.fahrenheit === 'number'
        ? waterTemp.fahrenheit + 2
        : waterTemp.fahrenheit,
    };
  }
  return waterTemp;
}

function shiftGrindFiner(grindSize, steps) {
  if (!grindSize) return grindSize;
  if (typeof grindSize.setting === 'number') {
    return {
      ...grindSize,
      setting: nearestOdeStep(grindSize.setting - steps),
    };
  }
  return grindSize;
}

function parseTimeToSeconds(timeStr) {
  if (typeof timeStr !== 'string') return null;
  const parts = timeStr.split(':');
  if (parts.length !== 2) return null;
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function transformPourOver(hotRecipe, userDose) {
  const { dose, hotWater, iceGrams } = computeIceSplit(hotRecipe, userDose);

  const icedSteps = (hotRecipe.steps || []).map(step => {
    const origSeconds = parseTimeToSeconds(step.time);
    const shifted = origSeconds != null ? origSeconds + ICE_PREP_DURATION : null;
    return {
      ...step,
      time: shifted != null ? formatTime(shifted) : step.time,
      timeSeconds: shifted,
      waterTotal: typeof step.waterTotal === 'number'
        ? Math.round(step.waterTotal * HOT_FRACTION)
        : step.waterTotal,
    };
  });

  const device = hotRecipe.device || 'v60';
  const icePlacement = device === 'kalita' ? 'glass'
    : device === 'chemex' ? 'carafe' : 'server';

  icedSteps.unshift({
    time: '0:00',
    timeSeconds: 0,
    durationSeconds: ICE_PREP_DURATION,
    action: `Add ${iceGrams}g ice to ${icePlacement}`,
    waterTotal: 0,
    isIceStep: true,
  });

  return {
    ...hotRecipe,
    coffeeGrams: dose,
    waterGrams: hotWater,
    iceGrams,
    totalLiquid: hotWater + iceGrams,
    steps: icedSteps,
    grindSize: shiftGrindFiner(hotRecipe.grindSize, 1.5),
    waterTemp: bumpTemp(hotRecipe.waterTemp),
    isIced: true,
    icePlacement,
  };
}

export function transformImmersion(hotRecipe, userDose) {
  const { dose, hotWater, iceGrams } = computeIceSplit(hotRecipe, userDose);

  const icedSteps = (hotRecipe.steps || []).map(step => ({
    ...step,
    waterTotal: typeof step.waterTotal === 'number'
      ? Math.round(step.waterTotal * HOT_FRACTION)
      : step.waterTotal,
  }));

  icedSteps.push({
    time: null,
    action: `Press/pour onto ${iceGrams}g ice`,
    isIceStep: true,
  });

  return {
    ...hotRecipe,
    coffeeGrams: dose,
    waterGrams: hotWater,
    iceGrams,
    totalLiquid: hotWater + iceGrams,
    steps: icedSteps,
    grindSize: shiftGrindFiner(hotRecipe.grindSize, 1),
    waterTemp: bumpTemp(hotRecipe.waterTemp),
    isIced: true,
    icePlacement: 'glass',
  };
}

export function transformAiden(hotRecipe, userDose = 25) {
  const dose = userDose;
  const brewWaterMl = Math.round(dose * 10);
  const iceGrams = Math.round(dose * 6.8);
  const machineSuggestedDose = Math.round(brewWaterMl / 14 * 10) / 10;

  const bumpAidenTemp = (t) => typeof t === 'number' ? Math.min(t + 1, 99) : t;

  const ssGrind = hotRecipe.grindRecommendation?.singleServe;
  const icedSsGrind = typeof ssGrind === 'number' ? nearestOdeStep(ssGrind - 1) : ssGrind;

  return {
    ...hotRecipe,
    ratio: 14,
    bloomTemperature: bumpAidenTemp(hotRecipe.bloomTemperature),
    ssPulseTemperatures: hotRecipe.ssPulseTemperatures?.map(bumpAidenTemp) || [],
    batchPulseTemperatures: hotRecipe.batchPulseTemperatures?.map(bumpAidenTemp) || [],
    icedDose: dose,
    brewWaterMl,
    iceGrams,
    machineSuggestedDose,
    totalLiquid: brewWaterMl + iceGrams,
    grindRecommendation: icedSsGrind != null ? {
      singleServe: icedSsGrind,
      batch: hotRecipe.grindRecommendation?.batch,
    } : hotRecipe.grindRecommendation,
    isIced: true,
  };
}

export function transformToFlashBrew(hotRecipe, deviceKey, userDose) {
  const method = BREW_METHODS[deviceKey];
  if (!method) return transformPourOver(hotRecipe, userDose);
  if (deviceKey === 'aiden') return transformAiden(hotRecipe, userDose);
  if (method.category === 'immersion') return transformImmersion(hotRecipe, userDose);
  return transformPourOver(hotRecipe, userDose);
}
