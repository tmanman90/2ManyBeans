import { createRecipePreview } from './ruphus/recipePreview.js';

const finitePositive = (value) => Number.isFinite(value) && value > 0;

function requireSavedSourceRecipe(recipe, dose) {
  if (!recipe?.sourceProjection) {
    throw new TypeError('A saved source recipe is required.');
  }
  if (!finitePositive(dose)) {
    throw new TypeError('A positive source recipe dose is required.');
  }
}

// Keep the last persisted dose as a local marker. HandBrewModal compares that
// marker with the edited dose on close, so previews remain side-effect free
// until the existing explicit-save callback runs.
export function previewSavedSourceDose(recipe, dose) {
  requireSavedSourceRecipe(recipe, dose);
  const persistedDose = finitePositive(recipe.userCoffeeGrams)
    ? recipe.userCoffeeGrams
    : recipe.coffeeGrams;
  return {
    ...createRecipePreview({ recipe, dose }),
    ...(finitePositive(persistedDose) ? { userCoffeeGrams: persistedDose } : {}),
  };
}

export function hydrateSavedSourceDose(recipe) {
  const dose = finitePositive(recipe?.userCoffeeGrams)
    ? recipe.userCoffeeGrams
    : recipe?.coffeeGrams;
  return previewSavedSourceDose(recipe, dose);
}

export function savedSourceDosePersistence(recipe, dose) {
  requireSavedSourceRecipe(recipe, dose);
  if (recipe.coffeeGrams !== dose) {
    throw new TypeError('The saved source dose must match its projected recipe.');
  }
  const device = recipe.device || 'v60';
  const persistedRecipe = { ...recipe, userCoffeeGrams: dose };
  const iced = recipe.mode === 'iced' || recipe.isIced === true;
  return {
    persistedRecipe,
    update: iced
      ? { [`handBrewIcedRecipes.${device}.userCoffeeGrams`]: dose }
      : {
        'handBrewRecipe.userCoffeeGrams': dose,
        [`handBrewRecipes.${device}.userCoffeeGrams`]: dose,
      },
  };
}
