// Flash brew (急冷式) transform: hot recipe + device category + dose -> iced recipe
// Deterministic, no AI calls, no side effects.

import { nearestOdeStep, BREW_METHODS, parseTimeString } from './brewMethods.js';


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


function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function transformPourOver(hotRecipe, userDose) {
  const { dose, hotWater, iceGrams } = computeIceSplit(hotRecipe, userDose);

  // Prefer the repaired timeSeconds (handles range times like "0:30-1:10"
  // which the old naive parser returned null for — that null broke the
  // BrewTimer's strict timer-data gate on every iced recipe with ranges).
  let timerIntact = hotRecipe.timerReady === true;
  const icedSteps = (hotRecipe.steps || []).map(step => {
    const origSeconds = typeof step.timeSeconds === 'number'
      ? step.timeSeconds
      : parseTimeString(step.time);
    const shifted = origSeconds != null ? origSeconds + ICE_PREP_DURATION : null;
    if (shifted == null) timerIntact = false;
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
    action: `Add ${iceGrams}g ice to ${icePlacement}`,
    waterTotal: 0,
    isIceStep: true,
  });

  // Ice-prep shift moves every step +10s, so the total must move with it or
  // the timer gate (total > last step start) rejects the recipe.
  const totalSeconds = Number.isFinite(hotRecipe.totalBrewTimeSeconds)
    ? hotRecipe.totalBrewTimeSeconds + ICE_PREP_DURATION
    : null;
  if (totalSeconds == null) timerIntact = false;

  // The BrewTimer gate requires STRICTLY ascending timeSeconds and
  // total > last step. Range-midpoint parsing can produce collisions
  // ([0,20,20]) — if the final sequence violates the gate, demote
  // timerReady so the UI degrades gracefully instead of hard-failing.
  if (timerIntact) {
    const secs = icedSteps.map((s) => s.timeSeconds);
    for (let i = 1; i < secs.length; i++) {
      if (typeof secs[i] !== 'number' || secs[i] <= secs[i - 1]) { timerIntact = false; break; }
    }
    if (timerIntact && !(totalSeconds > secs[secs.length - 1])) timerIntact = false;
  }

  return {
    ...hotRecipe,
    coffeeGrams: dose,
    waterGrams: hotWater,
    iceGrams,
    steps: icedSteps,
    totalBrewTimeSeconds: totalSeconds,
    totalBrewTime: totalSeconds != null ? formatTime(totalSeconds) : hotRecipe.totalBrewTime,
    timerReady: timerIntact,
    // Kalita's restricted flat bed stalls if pushed too fine — cap the iced shift
    grindSize: shiftGrindFiner(hotRecipe.grindSize, device === 'kalita' ? 1 : 1.5),
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

  // The press-onto-ice step needs real timer data or the BrewTimer gate
  // rejects the whole recipe (every step must have STRICTLY ascending
  // timeSeconds) — place it strictly after the final hot step even when
  // that step starts at the recipe's total time.
  const hotTotal = Number.isFinite(hotRecipe.totalBrewTimeSeconds)
    ? hotRecipe.totalBrewTimeSeconds
    : null;
  const lastHotSecs = icedSteps.reduce(
    (max, s) => (typeof s.timeSeconds === 'number' && s.timeSeconds > max ? s.timeSeconds : max),
    -1
  );
  const iceStepAt = hotTotal != null ? Math.max(hotTotal, lastHotSecs + 10) : null;
  const ICE_POUR_DURATION = 15;
  icedSteps.push({
    time: iceStepAt != null ? formatTime(iceStepAt) : null,
    timeSeconds: iceStepAt,
    action: `Press/pour onto ${iceGrams}g ice`,
    isIceStep: true,
  });

  return {
    ...hotRecipe,
    coffeeGrams: dose,
    waterGrams: hotWater,
    iceGrams,
    steps: icedSteps,
    totalBrewTimeSeconds: iceStepAt != null ? iceStepAt + ICE_POUR_DURATION : null,
    totalBrewTime: iceStepAt != null ? formatTime(iceStepAt + ICE_POUR_DURATION) : hotRecipe.totalBrewTime,
    timerReady: hotRecipe.timerReady === true && iceStepAt != null
      && icedSteps.every((s, i) => typeof s.timeSeconds === 'number' && (i === 0 || s.timeSeconds > icedSteps[i - 1].timeSeconds)),
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
