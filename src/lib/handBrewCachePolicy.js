import { kalitaDoseBounds } from '../data/kalitaConfiguration.js';

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
    dose: Number.isFinite(requestedDose) && requestedDose > 0 ? requestedDose : defaultDose,
    grinder: recipe?.grinder || preferences?.grinder || 'fellow-ode-gen2',
  };
}
export const kalitaDefaultDose = (size) => kalitaDoseBounds(size).defaultDose;
