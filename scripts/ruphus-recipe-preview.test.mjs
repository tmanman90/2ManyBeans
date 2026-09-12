import assert from 'node:assert/strict';
import { generateKalitaRecipe } from '../src/lib/kalitaAdapter.js';
import { generateV60Recipe } from '../src/lib/v60Adapter.js';
import { generateV60TechniqueOption } from '../src/lib/ruphus/techniqueOptions.js';
import { generateV60IcedRecipe } from '../src/lib/v60IcedAdapter.js';
import { generateV60SwitchRecipe } from '../src/lib/v60SwitchAdapter.js';
import {
  createRecipePreview,
  RecipePreviewError,
  validateRecipePreview,
  RECIPE_PREVIEW_VERSION,
} from '../src/lib/ruphus/recipePreview.js';
import { grinderSettingToMicrons, isOdeStep } from '../src/lib/brewMethods.js';

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

// A ratio preview may be the trusted base for a later dose preview. Its
// rounded gram totals are ordinary scaling, not customized pours, so the
// recognized source family remains eligible across the profile boundary.
{
  const source = generateV60Recipe({}, { dose: 15, grinder: 'fellow-ode-gen2' });
  const snapshot = structuredClone(source);
  const ratioPreview = createRecipePreview({ recipe: source, dose: 20, targetRatio: 15, configuration: { grinder: 'fellow-ode-gen2' } });
  const dosePreview = createRecipePreview({ recipe: ratioPreview, dose: 30, configuration: { grinder: 'fellow-ode-gen2' } });
  assert.equal(dosePreview.coffeeGrams, 30);
  assert.equal(dosePreview.waterGrams, 450);
  assert.equal(dosePreview.ratio, '1:15');
  assert.equal(dosePreview.technique, source.technique);
  assert.deepEqual(dosePreview.sourceLineage.sourceIds, source.sourceLineage.sourceIds);
  assert.equal(dosePreview.recipePreview.regenerated, true);
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

// A recognized legacy V60 source may regenerate its own family across the
// 12–30g range, retaining the source, standard configuration, ratio, and a
// valid timed schedule. The saved source remains immutable.
{
  const source = generateV60Recipe({}, { dose: 20, grinder: 'fellow-ode-gen2' });
  const snapshot = structuredClone(source);
  const preview = createRecipePreview({ recipe: source, dose: 30, targetRatio: 15, configuration: { grinder: 'fellow-ode-gen2' } });
  assert.equal(preview.coffeeGrams, 30);
  assert.equal(preview.waterGrams, 450);
  assert.equal(preview.ratio, '1:15');
  assert.equal(preview.technique, source.technique);
  assert.deepEqual(preview.sourceLineage.sourceIds, source.sourceLineage.sourceIds);
  assert.equal(preview.configurationKey, source.configurationKey);
  assert.equal(preview.v60Size, source.v60Size);
  assert.equal(preview.timerReady, true);
  assert.equal(preview.steps.at(-1).waterTotal, 450);
  assert.ok(preview.guideTargetSeconds > preview.steps.at(-1).timeSeconds);
  assert.ok(isOdeStep(preview.grindSize.setting));
  assert.deepEqual(source, snapshot);
}

// Invalid persisted Ode values are repaired only in the derived preview. The
// trusted grinder context is required; other grinders and qualitative/source
// exact values stay untouched.
{
  const source = generateV60Recipe({}, { dose: 20, grinder: 'fellow-ode-gen2' });
  source.grindSize = { ...source.grindSize, setting: '5.9', microns: 999, description: 'legacy' };
  const snapshot = structuredClone(source);
  const preview = createRecipePreview({ recipe: source, dose: 20, configuration: { grinder: 'fellow-ode-gen2' } });
  assert.equal(preview.grindSize.setting, '6');
  assert.equal(preview.grindSize.microns, grinderSettingToMicrons(6, 'fellow-ode-gen2'));
  assert.equal(preview.recipePreview.regenerated, false);
  assert.equal(preview.recipePreview.grindNormalization.from, '5.9');
  assert.equal(preview.recipePreview.grindNormalization.to, '6');
  assert.deepEqual(source, snapshot);
  const other = createRecipePreview({ recipe: source, dose: 20, configuration: { grinder: 'fellow-opus' } });
  assert.equal(other.grindSize.setting, '5.9');
  assert.equal(other.recipePreview.grindNormalization, undefined);
  const qualitative = createRecipePreview({ recipe: { ...source, grindSize: { ...source.grindSize, setting: 'medium' } }, dose: 20, configuration: { grinder: 'fellow-ode-gen2' } });
  assert.equal(qualitative.grindSize.setting, 'medium');
  assert.equal(qualitative.recipePreview.grindNormalization, undefined);
  const sourceExact = createRecipePreview({ recipe: { ...source, grindSize: { ...source.grindSize, setting: '5.9', sourceExact: true } }, dose: 20, configuration: { grinder: 'fellow-ode-gen2' } });
  assert.equal(sourceExact.grindSize.setting, '5.9');
  assert.equal(sourceExact.recipePreview.grindNormalization, undefined);
  for (const setting of [null, '', 0, 11.2, 99]) {
    const unchanged = createRecipePreview({ recipe: { ...source, grindSize: { ...source.grindSize, setting } }, dose: 20, configuration: { grinder: 'fellow-ode-gen2' } });
    assert.equal(unchanged.grindSize.setting, setting);
    assert.equal(unchanged.recipePreview.grindNormalization, undefined);
  }
}

// A forged/unknown source lineage cannot unlock a cross-profile regeneration,
// even if the rest of the recipe looks like a standard V60.
{
  const source = generateV60Recipe({}, { dose: 20 });
  const unknown = { ...source, sourceLineage: { ...source.sourceLineage, sourceIds: ['unregistered-source-v1'] } };
  assert.throws(
    () => createRecipePreview({ recipe: unknown, dose: 30 }),
    (error) => error instanceof RecipePreviewError
      && error.code === 'unsupported-dose-profile'
      && /choose.*source-backed V60 technique/i.test(error.message),
  );
  const customized = { ...source, steps: source.steps.map((step, index) => index === 1 ? { ...step, action: `${step.action} Custom pour` } : step) };
  assert.throws(
    () => createRecipePreview({ recipe: customized, dose: 30 }),
    (error) => error instanceof RecipePreviewError
      && error.code === 'technique-conflict'
      && /customized pours/i.test(error.message),
  );
  const customSplit = { ...source, steps: source.steps.map((step, index) => index === 1 ? { ...step, waterTotal: step.waterTotal - 8 } : index === 2 ? { ...step, waterTotal: step.waterTotal - 8 } : step) };
  assert.throws(
    () => createRecipePreview({ recipe: customSplit, dose: 30 }),
    (error) => error instanceof RecipePreviewError
      && error.code === 'technique-conflict'
      && /customized pours/i.test(error.message),
  );
  const exact = createRecipePreview({ recipe: source, dose: 20 });
  assert.equal(exact.sourceLineage.status, source.sourceLineage.status);
  assert.deepEqual(exact.sourceLineage.sourceIds, source.sourceLineage.sourceIds);
}

// An explicit large-batch family keeps its source-backed explanation through
// a same-profile reviewed-dose preview, and the adaptation label follows the
// displayed dose rather than the proposal's 20g example.
{
  const selected = generateV60TechniqueOption('hoffmann-large-batch', {}, { dose: 20 }).recipe;
  const preview = createRecipePreview({ recipe: selected, dose: 21 });

  assert.equal(preview.coffeeGrams, 21);
  assert.equal(preview.waterGrams, 350);
  assert.equal(preview.steps[0].waterTotal, 42);
  assert.match(preview.reasoning, /^The selected family uses the dedicated large-batch cadence/i);
  assert.doesNotMatch(preview.reasoning, /\b20g\b/i);
  assert.doesNotMatch(preview.reasoning, /balanced small-dose pulse/i);
  assert.match(preview.sourceLineage.adaptation, /scaled to 21g/i);
  assert.doesNotMatch(preview.sourceLineage.adaptation, /scaled to 20g/i);
}

// A regenerated Switch profile retains fixed grind controls from the reviewed
// source when no new grinder configuration was explicitly selected.
{
  const source = generateV60SwitchRecipe({}, { dose: 20, roast: 'medium', grinder: 'fellow-opus' });
  const preview = createRecipePreview({ recipe: source, dose: 22, configuration: { roast: 'medium' } });
  assert.deepEqual(preview.grindSize, source.grindSize);
  assert.equal(preview.steps.at(-1).waterTotal, preview.waterGrams);
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
