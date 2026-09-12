import { toAidenProfile, validateAidenProfile } from '../aidenProfileValidation.js';
import { canonicalHash } from './contracts.js';

export const aidenProfileHash = (recipe) => canonicalHash(toAidenProfile(recipe));
export function aidenLinkMatchesProfile(bean, iced = false) {
  const key = iced ? 'aidenIcedLink' : 'aidenLink';
  return Boolean(bean?.[key] && (!bean[`${key}ProfileHash`] || bean[`${key}ProfileHash`] === aidenProfileHash(bean.aidenRecipe)));
}

const fail = (message) => { throw Object.assign(new Error(message), { code: 'invalid_aiden_change' }); };

export function aidenTemperatureAnchor(recipe = {}) {
  if (recipe.ssPulsesEnabled) return recipe.ssPulseTemperatures?.[0];
  if (recipe.batchPulsesEnabled) return recipe.batchPulseTemperatures?.[0];
  return recipe.bloomEnabled ? recipe.bloomTemperature : null;
}

/** Aiden profiles scale on the device. Never manufacture manual dose/pour fields. */
export function createAidenProfilePreview(recipe, change, { servingDoseGrams = null } = {}) {
  const before = toAidenProfile(recipe);
  if (!validateAidenProfile(before).valid) fail('I could not validate this saved Aiden profile. Nothing was changed.');
  if (servingDoseGrams != null) fail('Choose the serving size on Aiden; its profile stores the ratio, not a fixed coffee dose. Leave the serving dose unset when preparing this profile.');
  const after = structuredClone(before);
  if (change?.control === 'ratio') {
    const raw = typeof change.value === 'string' ? change.value.trim().replace(/^1\s*:\s*/, '') : change.value;
    const ratio = Number(raw);
    if (!Number.isFinite(ratio) || ratio < 14 || ratio > 20 || ratio % 0.5 !== 0) fail('Aiden ratios must be between 1:14 and 1:20 in half-step increments, such as 1:15.5. Nothing was changed.');
    after.ratio = ratio;
  } else if (change?.control === 'temperature') {
    const target = Number(change.value);
    const anchor = aidenTemperatureAnchor(before);
    if (!Number.isFinite(target) || !Number.isFinite(anchor)) fail('Aiden needs an active, known temperature stage before changing its temperature curve.');
    const delta = target - anchor;
    if (before.bloomEnabled) after.bloomTemperature = before.bloomTemperature + delta;
    if (before.ssPulsesEnabled) after.ssPulseTemperatures = before.ssPulseTemperatures.map(value => value + delta);
    if (before.batchPulsesEnabled) after.batchPulseTemperatures = before.batchPulseTemperatures.map(value => value + delta);
    if (!validateAidenProfile(after).valid) fail('That shift would put an Aiden temperature outside 50–99°C. Choose a smaller change; the temperature curve was not clipped or saved.');
  } else {
    fail('This Aiden profile can be reviewed with a ratio or temperature change. Grinder settings are separate, and dose and water are chosen on Aiden; those controls cannot be saved as profile edits here.');
  }
  return after;
}

export function aidenProfileRows(recipe = {}) {
  const pulses = (prefix) => recipe[`${prefix}PulsesEnabled`]
    ? `${recipe[`${prefix}PulsesNumber`]} pulses · ${recipe[`${prefix}PulsesInterval`]}s interval · ${(recipe[`${prefix}PulseTemperatures`] || []).join(' → ')}°C`
    : 'Disabled';
  return [
    ['Ratio', `1:${recipe.ratio}`],
    ['Bloom', recipe.bloomEnabled ? `1:${recipe.bloomRatio} · ${recipe.bloomDuration}s · ${recipe.bloomTemperature}°C` : 'Disabled'],
    ['Single serve', pulses('ss')],
    ['Batch', pulses('batch')],
  ];
}
