import { canonicalHash, clone, SLOT_KEYS, validateRecipeSnapshot } from './contracts.js';
import { validateAidenProfile } from '../aidenProfileValidation.js';
import { validateV60Candidate } from '../v60Adapter.js';
import { validateV60SwitchCandidate } from '../v60SwitchAdapter.js';
import { validateV60IcedCandidate } from '../v60IcedAdapter.js';
import { validateKalitaCandidate } from '../kalitaAdapter.js';
import { validateKalitaIcedCandidate } from '../kalitaIcedAdapter.js';

export const SLOT_DEFINITIONS = Object.freeze({
  aiden: { path: ['aidenRecipe'], method: 'aiden', mode: 'hot', device: 'aiden' },
  v60_hot: { path: ['handBrewRecipes', 'v60'], method: 'v60', mode: 'hot', device: 'v60' },
  v60_iced: { path: ['handBrewIcedRecipes', 'v60'], method: 'v60', mode: 'iced', device: 'v60' },
  kalita_hot: { path: ['handBrewRecipes', 'kalita'], method: 'kalita', mode: 'hot', device: 'kalita' },
  kalita_iced: { path: ['handBrewIcedRecipes', 'kalita'], method: 'kalita', mode: 'iced', device: 'kalita' },
});
const atPath = (bean, path) => path.reduce((value, key) => (value == null ? undefined : value[key]), bean);
const identity = (recipe) => ({ device: String(recipe?.device || '').toLowerCase(), mode: recipe?.mode || (recipe?.isIced ? 'iced' : 'hot'), variant: String(recipe?.variant || recipe?.v60Variant || 'classic').toLowerCase(), size: String(recipe?.kalitaSize || recipe?.size || '') });
const matches = (recipe, slotKey) => { const def = SLOT_DEFINITIONS[slotKey]; const item = identity(recipe); return Boolean(def && item && item.device === def.device && item.mode === def.mode && !(slotKey === 'v60_iced' && item.variant === 'switch')); };
const normalize = (recipe, slotKey) => ({ ...clone(recipe), method: SLOT_DEFINITIONS[slotKey].method, device: SLOT_DEFINITIONS[slotKey].device, mode: SLOT_DEFINITIONS[slotKey].mode });
const validator = (recipe, slotKey) => slotKey === 'aiden' ? validateAidenProfile(recipe) : slotKey === 'v60_hot' ? (identity(recipe).variant === 'switch' ? validateV60SwitchCandidate(recipe) : validateV60Candidate(recipe)) : slotKey === 'v60_iced' ? validateV60IcedCandidate(recipe) : slotKey === 'kalita_hot' ? validateKalitaCandidate(recipe) : validateKalitaIcedCandidate(recipe);

export function canonicalRecipeSnapshot(recipe, slotKey) { const normalized = normalize(recipe, slotKey); const canonical = clone(normalized); delete canonical.userCoffeeGrams; delete canonical.aidenGrind; return { ...normalized, recipeHash: canonicalHash(canonical) }; }
export function validateExecutableRecipe(recipe, slotKey) { const generic = validateRecipeSnapshot(normalize(recipe, slotKey)); if (!generic.valid) return generic; return validator(normalize(recipe, slotKey), slotKey); }
export function resolveLegacyRecipe(bean, slotKey) {
  if (!SLOT_KEYS.includes(slotKey)) return { ok: false, code: 'unsupported_slot', slotKey };
  const def = SLOT_DEFINITIONS[slotKey]; const mapped = atPath(bean, def.path);
  if (mapped && matches(mapped, slotKey)) { const recipe = canonicalRecipeSnapshot(mapped, slotKey); return { ok: true, source: def.path.join('.'), slotKey, recipe, hash: recipe.recipeHash, validation: validator(recipe, slotKey) }; }
  const legacy = bean?.handBrewRecipe;
  if (!mapped && legacy && matches(legacy, slotKey)) { const recipe = canonicalRecipeSnapshot(legacy, slotKey); return { ok: true, source: 'handBrewRecipe', slotKey, recipe, hash: recipe.recipeHash, validation: validator(recipe, slotKey) }; }
  if (mapped) return { ok: false, code: 'legacy_recipe_ambiguous', source: def.path.join('.'), slotKey, recipe: canonicalRecipeSnapshot(mapped, slotKey), validation: validator(mapped, slotKey) };
  return { ok: false, code: 'recipe_missing', source: null, slotKey, recipe: null, validation: { valid: false, errors: ['recipe missing'] } };
}

export function resolveRequestedRecipe(bean, { slotKey, method, mode = 'hot', v60Variant = 'classic', kalitaSize = '' } = {}) {
  const requested = slotKey || (method === 'aiden' ? 'aiden' : method === 'kalita' ? `kalita_${mode}` : `v60_${mode}`);
  const result = resolveLegacyRecipe(bean, requested);
  if (!result.ok) return result;
  const recipe = result.recipe;
  if (method && recipe.method !== method) return { ok: false, code: 'recipe_slot_mismatch', slotKey: requested };
  if (mode && recipe.mode !== mode) return { ok: false, code: 'recipe_slot_mismatch', slotKey: requested };
  if (requested === 'v60_hot' && v60Variant && String(recipe.v60Variant || 'classic').toLowerCase() !== String(v60Variant).toLowerCase()) return { ok: false, code: 'recipe_variant_mismatch', slotKey: requested };
  if (requested.startsWith('kalita') && kalitaSize && String(recipe.kalitaSize || recipe.size) !== String(kalitaSize)) return { ok: false, code: 'recipe_size_mismatch', slotKey: requested };
  const validation = validateExecutableRecipe(recipe, requested);
  if (!validation.valid) return { ...result, ok: false, code: 'legacy_recipe_ambiguous', validation };
  return { ...result, ok: true, recipe, selectedPath: result.source, selectedHash: result.hash, slotKey: requested, validation };
}

export { identity as candidateIdentity, matches as matchesSlot, validator as validateForSlot };
