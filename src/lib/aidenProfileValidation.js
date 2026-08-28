// Browser/server-neutral Aiden profile contract. Keep this module pure: it is
// shared by the client push path, the server Fellow boundary, and evaluation
// grading. It must not import Firebase, DOM, Node, or evaluation code.

const finiteNumber = (value) => typeof value === 'number' && Number.isFinite(value);

function checkBoundedNumber(errors, name, value, min, max) {
  if (!finiteNumber(value)) {
    errors.push(`${name} must be a finite number`);
    return false;
  }
  if (value < min || value > max) errors.push(`${name} ${value} out of range ${min}-${max}`);
  return true;
}

function checkPulses(errors, label, enabled, count, interval, temperatures) {
  if (!enabled) return;
  if (!Number.isInteger(count) || count < 1 || count > 10) errors.push(`${label} pulsesNumber ${count} out of range 1-10`);
  if (!checkBoundedNumber(errors, `${label}PulsesInterval`, interval, 5, 60)) return;
  if (!Array.isArray(temperatures)) {
    errors.push(`${label} temperatures must be an array`);
    return;
  }
  if (temperatures.length !== count) errors.push(`${label} temps length ${temperatures.length} !== pulsesNumber ${count}`);
  temperatures.forEach((temperature, index) => checkBoundedNumber(errors, `${label} temp[${index}]`, temperature, 50, 99));
}

/** Validate the profile shape accepted at the Fellow Aiden boundary. */
export function validateAidenProfile(profile) {
  const errors = [];
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return { valid: false, errors: ['profile must be an object'] };
  if (profile.profileType !== 0) errors.push('profileType must be 0');
  for (const key of ['bloomEnabled', 'ssPulsesEnabled', 'batchPulsesEnabled']) {
    if (typeof profile[key] !== 'boolean') errors.push(`${key} must be boolean`);
  }

  if (checkBoundedNumber(errors, 'ratio', profile.ratio, 14, 20) && profile.ratio % 0.5 !== 0) {
    errors.push(`ratio ${profile.ratio} must be in 0.5 steps`);
  }

  if (profile.bloomEnabled) {
    checkBoundedNumber(errors, 'bloomRatio', profile.bloomRatio, 1, 3);
    checkBoundedNumber(errors, 'bloomDuration', profile.bloomDuration, 1, 120);
    checkBoundedNumber(errors, 'bloomTemperature', profile.bloomTemperature, 50, 99);
  }

  checkPulses(errors, 'ss', profile.ssPulsesEnabled, profile.ssPulsesNumber, profile.ssPulsesInterval, profile.ssPulseTemperatures || []);
  checkPulses(errors, 'batch', profile.batchPulsesEnabled, profile.batchPulsesNumber, profile.batchPulsesInterval, profile.batchPulseTemperatures || []);

  if (typeof profile.title !== 'string' || profile.title.length === 0 || profile.title.length > 50) errors.push('title must be a non-empty string of at most 50 characters');
  return { valid: errors.length === 0, errors };
}

// Pure Fellow payload projection shared by the client and evaluator. This
// denylist mirrors the former pushToAiden stripping contract: recipe-only
// metadata must never be sent to Fellow or treated as its canonical payload.
export function buildAidenTitle(bean, label = '') {
  const max = 50;
  const slot = bean?.jarSlot ? `#${bean.jarSlot} ` : '';
  const prefix = label ? `${slot}${label} ` : slot;
  const budget = max - prefix.length;
  const name = (bean?.name || '').trim();
  const origin = (bean?.origin || '').trim();
  const roaster = (bean?.roaster || '').trim();
  const originPart = origin ? `${origin} ` : '';
  const roasterPart = roaster ? ` - ${roaster}` : '';
  const full = `${originPart}${name}${roasterPart}`.trim();
  if (full.length <= budget) return `${prefix}${full}`;
  const nameBudget = budget - originPart.length - roasterPart.length;
  if (nameBudget > 0) return `${prefix}${originPart}${name.slice(0, nameBudget).trim()}${roasterPart}`.trim();
  const nameBudgetNoRoaster = budget - originPart.length;
  if (nameBudgetNoRoaster > 0) {
    const truncatedName = name.length <= nameBudgetNoRoaster ? name : name.slice(0, nameBudgetNoRoaster).trim();
    return `${prefix}${originPart}${truncatedName}`.trim();
  }
  return `${prefix}${name.slice(0, Math.max(0, budget)).trim()}`;
}

export function toAidenProfile(recipe, bean = null, { isIced = false } = {}) {
  if (!recipe || typeof recipe !== 'object' || Array.isArray(recipe)) return {};
  const {
    grindRecommendation, generatedAt: _generatedAt, title: _staleTitle,
    icedDose: _icedDose, brewWaterMl: _brewWaterMl, iceGrams: _iceGrams,
    machineSuggestedDose: _machineSuggestedDose, isIced: _isIced,
    ...profile
  } = recipe;
  profile.title = bean ? buildAidenTitle(bean, isIced ? '(iced)' : '') : (recipe.title || '');
  return profile;
}

export function assertValidAidenProfile(profile) {
  const validation = validateAidenProfile(profile);
  if (!validation.valid) throw new Error(`Invalid Aiden profile: ${validation.errors.join('; ')}`);
  return profile;
}
