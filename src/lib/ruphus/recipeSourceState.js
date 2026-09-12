// Owner-scoped recipe lineage helpers.  A missing slot is a first-class
// source state; it is not permission to invent a valid saved recipe.
import { clone, recipeSourceHash } from './contracts.js';
import { resolveLegacyRecipe } from './legacyRecipeResolver.js';

export const RECIPE_SOURCE_STATES = Object.freeze(['present', 'absent']);

/** Return the stable identity used for an explicitly empty recipe slot. */
export function absentRecipeSourceHash(slotKey) {
  return recipeSourceHash(null, slotKey);
}

/**
 * Resolve the source represented by an owner bean. Only the resolver's exact
 * `recipe_missing` result is absence. Ambiguous, mismatched, or malformed
 * recipe data remains an invalid source and must fail closed at the caller.
 */
export function resolveRecipeSource(bean, slotKey) {
  const resolved = resolveLegacyRecipe(bean, slotKey);
  if (resolved.ok) {
    // `resolveLegacyRecipe` can identify a mapped slot before its adapter
    // validation runs. Keep that object present (including when malformed)
    // rather than turning it into an apparently empty slot. Callers that
    // execute or persist a source may still fail closed on its validation;
    // lineage must never reinterpret it as absence.
    return {
      ...resolved,
      sourceState: 'present',
      recipe: clone(resolved.recipe),
      hash: recipeSourceHash(resolved.recipe, slotKey),
    };
  }
  if (resolved.code === 'recipe_missing') {
    return {
      ...resolved,
      ok: true,
      sourceState: 'absent',
      recipe: null,
      hash: absentRecipeSourceHash(slotKey),
    };
  }
  return { ...resolved, ok: false, sourceState: 'invalid' };
}

export { recipeSourceHash };
