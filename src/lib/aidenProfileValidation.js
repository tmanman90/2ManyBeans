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

  if (profile.title != null && (typeof profile.title !== 'string' || profile.title.length > 50)) {
    errors.push('title must be a string of at most 50 characters');
  }
  return { valid: errors.length === 0, errors };
}

export function assertValidAidenProfile(profile) {
  const validation = validateAidenProfile(profile);
  if (!validation.valid) throw new Error(`Invalid Aiden profile: ${validation.errors.join('; ')}`);
  return profile;
}
