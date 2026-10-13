import { espressoRecipeFingerprint } from './espressoRecipes.js';

// A fresh deterministic framework can be discussed without first saving a
// recipe. User-edited targets need a save so chat reads the same revision.
export function espressoHasUnsavedEdits(recipe, savedRecipe) {
  if (!recipe) return false;
  if (savedRecipe && espressoRecipeFingerprint(recipe) === espressoRecipeFingerprint(savedRecipe)) return false;
  return recipe.source === 'user_saved' || Boolean(recipe.userAdjustedFields?.length);
}
