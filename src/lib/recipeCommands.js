import { getAuth } from 'firebase/auth';
import { ruphusApiUrl } from './apiBase.js';
import { RUPHUS_CLIENT_COMMAND_CAPABILITIES, ruphusClientVersion } from './ruphus/census.js';
import { recipePreviewErrorMessage } from './ruphus/recovery.js';

const PROTECTED_KEYS = new Set(['aidenRecipe', 'aidenGrind', 'aidenLink', 'aidenIcedLink', 'aidenUsedRelay', 'aidenIcedUsedRelay', 'aidenLinkRevisionId', 'aidenLinkProfileHash', 'aidenIcedLinkProfileHash', 'activeRevisionIds', 'recipeProvenance', 'handBrewRecipes', 'handBrewIcedRecipes', 'handBrewRecipe']);

export const isProtectedRecipeUpdate = (updates = {}) => Object.keys(updates).some((key) => PROTECTED_KEYS.has(key) || key.startsWith('handBrewRecipes.') || key.startsWith('handBrewIcedRecipes.') || key.startsWith('handBrewRecipe.'));
export const protectedRecipeUpdates = (updates = {}) => Object.fromEntries(
  Object.entries(updates).filter(([key]) => PROTECTED_KEYS.has(key) || key.startsWith('handBrewRecipes.') || key.startsWith('handBrewIcedRecipes.') || key.startsWith('handBrewRecipe.'))
);

// A single editor save can contain hot and iced projections. Each protected
// slot is its own command so a selected-slot patch can never cross-contaminate.
export function splitProtectedRecipeUpdates(updates = {}) {
  const groups = new Map();
  for (const [key, value] of Object.entries(protectedRecipeUpdates(updates))) {
    let group = 'aiden';
    if (key.startsWith('handBrewIcedRecipes.') || key === 'handBrewIcedRecipes') group = 'iced';
    else if (key.startsWith('handBrewRecipes.') || key === 'handBrewRecipes' || key.startsWith('handBrewRecipe.') || key === 'handBrewRecipe') group = 'hot';
    if (!groups.has(group)) groups.set(group, {});
    groups.get(group)[key] = value;
  }
  return [...groups.values()];
}

export async function executeRecipeCommand(command) {
  const user = getAuth().currentUser;
  if (!user?.uid) throw new Error('Sign in to save recipe changes.');
  const token = await user.getIdToken();
  const response = await fetch(ruphusApiUrl('/api/recipe-command'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ ...command, clientVersion: ruphusClientVersion(), commandCapabilities: RUPHUS_CLIENT_COMMAND_CAPABILITIES }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(result.message || result.error || 'Recipe command failed.'), { code: result.error || 'command_failed', details: result.details });
  return result;
}

// Prepare a server-validated, non-mutating recipe version for the recipe page.
// The server resolves the owner-scoped base recipe; this client helper never
// sends a recipe snapshot as write authority.
export async function prepareRecipePreview({ requestId = crypto.randomUUID(), ...request } = {}) {
  const user = getAuth().currentUser;
  if (!user?.uid) throw new Error('Sign in to prepare a recipe preview.');
  const token = await user.getIdToken();
  const response = await fetch(ruphusApiUrl('/api/ruphus-preview'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ ...request, requestId, clientVersion: ruphusClientVersion() }),
  }).catch(() => { throw Object.assign(new Error(recipePreviewErrorMessage({ code: 'network_error' })), { code: 'network_error' }); });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const failure = { code: result.error || 'preview_failed', status: response.status, details: result.details };
    throw Object.assign(new Error(recipePreviewErrorMessage(failure)), failure);
  }
  return result;
}

export function commandForBeanUpdate(bean, updates, { actionId = crypto.randomUUID() } = {}) {
  const protectedUpdates = protectedRecipeUpdates(updates);
  const keys = Object.keys(protectedUpdates);
  updates = protectedUpdates;
  if (updates?.aidenGrind !== undefined && keys.every((key) => ['aidenGrind', 'aidenLink', 'aidenIcedLink', 'aidenUsedRelay', 'aidenIcedUsedRelay'].includes(key))) return { actionId, mode: 'set_aiden_grind', coffeeId: bean.id, slotKey: 'aiden', grind: updates.aidenGrind, patch: updates, expectedRevisionId: bean.activeRevisionIds?.aiden || undefined };
  const aidenLinkKeys = new Set(['aidenLink', 'aidenIcedLink', 'aidenUsedRelay', 'aidenIcedUsedRelay']);
  if (Object.keys(updates || {}).length > 0 && Object.keys(updates).every((key) => aidenLinkKeys.has(key))) {
    return { actionId, mode: 'set_aiden_link', coffeeId: bean.id, slotKey: 'aiden', link: updates.aidenLink, icedLink: updates.aidenIcedLink, patch: updates, expectedRevisionId: bean.activeRevisionIds?.aiden || undefined };
  }
  const doseKeys = Object.keys(updates || {}).filter((key) => key.endsWith('.userCoffeeGrams'));
  if (doseKeys.length && doseKeys.length === Object.keys(updates).length) {
    const doseKey = doseKeys[0];
    const device = doseKey.startsWith('handBrewRecipe.') ? (bean.handBrewRecipe?.device || 'v60') : doseKey.split('.')[1];
    const slotKey = doseKey.startsWith('handBrewIcedRecipes') ? `${device || 'v60'}_iced` : `${device || 'v60'}_hot`;
    return { actionId, mode: 'set_dose', coffeeId: bean.id, slotKey, dose: updates[doseKey], expectedRevisionId: bean.activeRevisionIds?.[slotKey] || undefined };
  }
  const dottedRecipeEntry = Object.entries(updates || {}).find(([key, value]) => /^(handBrewRecipes|handBrewIcedRecipes)\.(v60|kalita)$/.test(key) && value && typeof value === 'object');
  const recipe = updates.aidenRecipe || updates.handBrewRecipe || updates.handBrewRecipes?.v60 || updates.handBrewRecipes?.kalita || updates.handBrewIcedRecipes?.v60 || updates.handBrewIcedRecipes?.kalita || dottedRecipeEntry?.[1];
  const slotKey = updates.aidenRecipe ? 'aiden' : dottedRecipeEntry?.[0].startsWith('handBrewIcedRecipes') ? `${dottedRecipeEntry[0].split('.')[1]}_iced` : recipe?.device === 'aiden' ? 'aiden' : recipe?.mode === 'iced' ? `${recipe.device || 'v60'}_iced` : `${recipe?.device || 'v60'}_hot`;
  return { actionId, mode: 'replace_active_recipe', coffeeId: bean.id, slotKey, recipe, patch: updates, expectedRevisionId: bean.activeRevisionIds?.[slotKey] || undefined };
}

export { PROTECTED_KEYS };
