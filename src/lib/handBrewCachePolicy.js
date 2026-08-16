import { kalitaDoseBounds } from '../data/kalitaConfiguration.js';
import { V60_SWITCH_DOSE_BOUNDS } from '../data/v60SwitchConfiguration.js';

export function canUseCachedHotRecipe({ forceRegenerate, cachedRecipe, cachedGrinder, activeGrinder }) {
  return !forceRegenerate && Boolean(cachedRecipe) && cachedGrinder === activeGrinder;
}

export function resolveIcedRetryConfiguration({ recipe, bean, preferences }) {
  const preferredMethod = preferences?.brewMethod;
  const preferenceDevice = !preferredMethod || preferredMethod === 'aiden' || preferredMethod === 'handbrew'
    ? 'v60'
    : preferredMethod;
  const device = recipe?.device || preferenceDevice;
  const size = recipe?.kalitaSize || preferences?.kalitaSize || '185';
  const requestedDose = Number(recipe?.coffeeGrams || bean?.userCoffeeGrams);
  const defaultDose = device === 'kalita' ? kalitaDefaultDose(size) : 15;
  return {
    device,
    size,
    // Iced Switch is out of scope (plan Scope Boundaries) — iced retry always
    // targets the classic V60 iced engine regardless of the hot variant
    // preference, so this field is informational only until iced Switch
    // ships. Omitted for non-v60 devices to keep the existing kalita/legacy
    // shape byte-identical (handbrew-cache-policy.test.mjs deepEqual gate).
    ...(device === 'v60' ? { variant: recipe?.variant || preferences?.v60Variant || 'classic' } : {}),
    dose: Number.isFinite(requestedDose) && requestedDose > 0 ? requestedDose : defaultDose,
    grinder: recipe?.grinder || preferences?.grinder || 'fellow-ode-gen2',
  };
}
export const kalitaDefaultDose = (size) => kalitaDoseBounds(size).defaultDose;
export const v60SwitchDefaultDose = () => V60_SWITCH_DOSE_BOUNDS.defaultDose;
