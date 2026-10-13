import assert from 'node:assert/strict';
import {
  buildEspressoRecipe,
  editEspressoRecipe,
  espressoSetupKey,
  isSupportedEspressoSetup,
  resolveEspressoRecipe,
  validateEspressoRecipe,
} from '../src/lib/espressoRecipes.js';

const supported = {
  espressoMachine: 'breville-barista-express',
  espressoBasket: 'stock-double-single-wall',
  espressoGrinder: 'integrated',
  espressoSetupConfirmed: true,
};
const external = { ...supported, espressoGrinder: 'external', espressoGrinderModel: 'Encore ESP' };
const externalUnnamed = { ...supported, espressoGrinder: 'external' };

assert.equal(isSupportedEspressoSetup(supported), true);
assert.equal(isSupportedEspressoSetup({ ...supported, espressoSetupConfirmed: false }), false);
assert.equal(isSupportedEspressoSetup({ ...supported, espressoMachine: null }), false);
assert.notEqual(espressoSetupKey(supported), espressoSetupKey(external));
assert.equal(isSupportedEspressoSetup(externalUnnamed), true);
const unnamedExternalRecipe = buildEspressoRecipe({ bean: { id: 'bean-1', roastLevel: 'medium' }, setup: externalUnnamed });
assert.equal(unnamedExternalRecipe.ok, true);
assert.equal(unnamedExternalRecipe.recipe.grinderSetting.model, null);
assert.equal(validateEspressoRecipe(unnamedExternalRecipe.recipe, { setup: externalUnnamed, coffeeId: 'bean-1' }).valid, true);
assert.equal(validateEspressoRecipe({ ...unnamedExternalRecipe.recipe, grinderSetting: { ...unnamedExternalRecipe.recipe.grinderSetting, value: 5 } }).valid, false);

const baseline = buildEspressoRecipe({ bean: { id: 'bean-1', roastLevel: 'medium' }, setup: supported });
assert.equal(baseline.ok, true);
assert.equal(baseline.recipe.doseGrams, 18);
assert.equal(baseline.recipe.yieldGrams, 36);
assert.equal(baseline.recipe.ratio, 2);
assert.equal(baseline.recipe.source, 'app_baseline');
assert.equal(Object.hasOwn(baseline.recipe, 'waterGrams'), false);
assert.equal(validateEspressoRecipe(baseline.recipe, { setup: supported, coffeeId: 'bean-1' }).valid, true);

const light = buildEspressoRecipe({ bean: { id: 'bean-1', roastLevel: 'light' }, setup: supported });
assert.equal(light.recipe.doseGrams, 17);
assert.equal(light.recipe.yieldGrams, 37.4);
const unknown = buildEspressoRecipe({ bean: { id: 'bean-1', origin: 'Ethiopia' }, setup: supported });
assert.equal(unknown.recipe.roastLevel, 'unknown');
assert.equal(unknown.recipe.doseGrams, 18);

const filterOnly = resolveEspressoRecipe({ bean: { id: 'bean-1', research: { brewMethods: { espresso: { ratio: 4 } } } }, setup: supported });
assert.equal(filterOnly.recipe.source, 'app_baseline');
assert.equal(filterOnly.recipe.ratio, 2);

const saved = editEspressoRecipe(baseline.recipe, { doseGrams: 17.5 });
assert.equal(saved.ok, true);
assert.equal(saved.recipe.yieldGrams, 35);
assert.equal(saved.recipe.source, 'user_saved');
assert.deepEqual(saved.recipe.originalProvenance, baseline.recipe.provenance);
const preferred = resolveEspressoRecipe({ bean: { id: 'bean-1', espressoRecipe: saved.recipe }, setup: supported });
assert.equal(preferred.source, 'user_saved');
assert.equal(preferred.recipe.doseGrams, 17.5);
const refreshKeepsSaved = resolveEspressoRecipe({ bean: { id: 'bean-1', espressoRecipe: saved.recipe }, setup: supported, forceRegenerate: true });
assert.equal(refreshKeepsSaved.source, 'user_saved');
const changedSetup = resolveEspressoRecipe({ bean: { id: 'bean-1', espressoRecipe: saved.recipe }, setup: external });
assert.equal(changedSetup.source, 'app_baseline');
assert.equal(changedSetup.recipe.setupKey, espressoSetupKey(external));

const outputEdit = editEspressoRecipe(baseline.recipe, { yieldGrams: 40 });
assert.equal(outputEdit.ok, true);
assert.equal(outputEdit.recipe.ratio, 2.22);
assert.equal(editEspressoRecipe(baseline.recipe, { doseGrams: 15 }).ok, false);
assert.equal(validateEspressoRecipe({ ...baseline.recipe, waterGrams: 36 }).valid, false);
assert.equal(validateEspressoRecipe({ ...baseline.recipe, actualYieldGrams: 40 }).valid, false);
assert.equal(buildEspressoRecipe({ bean: { id: 'bean-1' }, setup: { ...supported, espressoBasket: 'different' } }).code, 'espresso_setup_unconfirmed');

console.log('espresso recipe tests: 16 passed');
