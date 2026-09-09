import assert from 'node:assert/strict';
import { generateKalitaRecipe } from '../src/lib/kalitaAdapter.js';
import { generateV60Recipe } from '../src/lib/v60Adapter.js';
import { generateV60IcedRecipe } from '../src/lib/v60IcedAdapter.js';
import {
  createRecipePreview,
  RecipePreviewError,
  validateRecipePreview,
  RECIPE_PREVIEW_VERSION,
} from '../src/lib/ruphus/recipePreview.js';

// Ratio intent is independent from the serving-size example. The source
// recipe is untouched and every timed water total follows the same ratio.
{
  const source = generateKalitaRecipe({}, { size: '155', dose: 13 });
  const snapshot = structuredClone(source);
  const preview = createRecipePreview({ recipe: source, dose: 13 });
  const larger = createRecipePreview({ recipe: source, dose: 20 });
  const ratioOnly = createRecipePreview({ recipe: source, dose: 13, targetRatio: 15 });

  assert.equal(preview.coffeeGrams, 13);
  assert.equal(preview.waterGrams, 208);
  assert.equal(preview.ratio, '1:16');
  assert.equal(preview.steps.at(-1).waterTotal, 208);
  assert.match(preview.steps.at(-1).action, /208g/);
  assert.equal(preview.ratioIntent.targetRatio, 16);
  assert.equal(preview.ratioIntent.exampleDose, 13);
  assert.equal(preview.recipePreview.version, RECIPE_PREVIEW_VERSION);
  assert.equal(larger.coffeeGrams, 20);
  assert.equal(larger.waterGrams, 320);
  assert.equal(larger.steps.at(-1).waterTotal, 320);
  assert.equal(ratioOnly.waterGrams, 195);
  assert.deepEqual(ratioOnly.steps.map((step) => step.waterTotal), [37, 88, 195]);
  assert.match(ratioOnly.steps.at(-1).action, /195g/);
  assert.deepEqual(source, snapshot);
}

// Crossing a Kalita 155 dose profile regenerates the complete schedule rather
// than copying 155-small timing to the extended dose.
{
  const source = generateKalitaRecipe({ targetTemperatureC: 99 }, { size: '155', dose: 13, grinder: 'fellow-opus' });
  const preview = createRecipePreview({ recipe: source, dose: 20 });

  assert.equal(preview.coffeeGrams, 20);
  assert.equal(preview.waterGrams, 320);
  assert.equal(preview.doseProfile, '155-extended');
  assert.equal(preview.totalBrewTimeSeconds, 285);
  assert.equal(preview.steps.at(-1).waterTotal, 320);
  assert.equal(preview.recipePreview.regenerated, true);
  assert.equal(preview.technique, source.technique);
  assert.deepEqual(preview.grindSize, source.grindSize);
  assert.equal(preview.waterTemp.celsius, source.waterTemp.celsius);
}

// Standard V60 profile transitions are refused without an explicit supported
// configuration; the adapter must not silently select its large-dose profile.
{
  const source = generateV60Recipe({}, { dose: 18 });
  assert.throws(
    () => createRecipePreview({ recipe: source, dose: 20 }),
    (error) => error instanceof RecipePreviewError && error.code === 'unsupported-dose-profile',
  );
}

// Dose bounds, malformed ratios and incomplete timed sources fail closed.
{
  const source = generateKalitaRecipe({}, { size: '155', dose: 15 });
  assert.throws(() => createRecipePreview({ recipe: source, dose: 21 }), /unsupported-dose/);
  assert.throws(() => createRecipePreview({ recipe: { ...source, ratio: 'not-a-ratio' }, dose: 16 }), /missing-ratio/);
  assert.equal(validateRecipePreview({ ...source, timerReady: false }, { dose: 16 }).valid, false);
}

// Iced V60 keeps total beverage ratio separate from hot extraction water and
// preserves the explicit hot-water + brew-ice accounting.
{
  const source = generateV60IcedRecipe({}, { dose: 20 });
  const preview = createRecipePreview({ recipe: source, dose: 18 });

  assert.equal(preview.finalBeverageWaterTargetGrams, 270);
  assert.equal(preview.hotWaterGrams + preview.initialBrewIceGrams, 270);
  assert.equal(preview.waterGrams, preview.hotWaterGrams);
  assert.equal(preview.steps.at(-1).waterTotal, preview.hotWaterGrams);
  assert.deepEqual(preview.steps.map((step) => step.waterTotal), [54, 108, 180]);
  assert.equal(preview.finalBeverageRatio, '1:15');
}

console.log('Ruphus recipe preview passed');
