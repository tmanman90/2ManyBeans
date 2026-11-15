import assert from 'node:assert/strict';
import { validateRecipeSnapshot } from '../src/lib/ruphus/contracts.js';
import { validateExecutableRecipe } from '../src/lib/ruphus/legacyRecipeResolver.js';
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
assert.equal(buildEspressoRecipe({ bean: { id: 'bean-1' }, setup: { ...supported, espressoBasket: 'different' } }).recipe.doseGrams, null);

// Generic equipment stays useful with Aiden as the ordinary default.
const noEspressoGrinder = resolveEspressoRecipe({ bean: { id: 'generic-bean' }, setup: { brewMethod: 'aiden', grinder: 'fellow-ode-gen2', espressoGrinder: null } });
assert.equal(noEspressoGrinder.recipe.setup.grinder, null);
assert.equal(noEspressoGrinder.recipe.grinderSetting.grinder, 'unknown');
assert.doesNotMatch(noEspressoGrinder.recipe.setupDescription, /Ode/i);
const genericSetup = { brewMethod: 'aiden', espressoMachine: 'other', espressoMachineName: 'My machine', espressoBasket: 'unknown', espressoGrinder: 'external', espressoGrinderModel: 'DF64' };
const generic = resolveEspressoRecipe({ bean: { id: 'generic-bean' }, setup: genericSetup });
assert.equal(generic.ok, true);
assert.equal(generic.recipe.recipeKind, 'generic');
assert.equal(generic.recipe.doseGrams, null);
assert.equal(generic.recipe.yieldGrams, null);
assert.equal(generic.recipe.ratio, 2);
assert.equal(generic.recipe.roastLevel, 'unknown');
assert.equal(generic.recipe.temperature.unit, null);
assert.equal(validateEspressoRecipe(generic.recipe).valid, false);
assert.equal(validateEspressoRecipe(generic.recipe, { allowIncomplete: true }).valid, true);
const chosenDose = editEspressoRecipe(generic.recipe, { doseGrams: 20 });
assert.equal(chosenDose.ok, true);
assert.equal(chosenDose.recipe.yieldGrams, 40);
assert.equal(chosenDose.recipe.doseBasis, 'user_selected');
assert.equal(validateRecipeSnapshot(chosenDose.recipe).valid, true);
assert.equal(validateExecutableRecipe(chosenDose.recipe, 'espresso').valid, true);
assert.equal(validateRecipeSnapshot(generic.recipe).valid, false);
assert.equal(editEspressoRecipe(generic.recipe, { doseGrams: true }).ok, false);
assert.equal(editEspressoRecipe(generic.recipe, { doseGrams: Number.POSITIVE_INFINITY }).ok, false);
assert.equal(editEspressoRecipe(generic.recipe, { doseGrams: 0 }).ok, false);
assert.equal(validateEspressoRecipe(chosenDose.recipe, { setup: genericSetup, coffeeId: 'generic-bean' }).valid, true);
assert.equal(editEspressoRecipe(generic.recipe, { yieldGrams: 40 }).ok, false);
assert.equal(validateEspressoRecipe({ ...baseline.recipe, recipeKind: 'generic', doseGrams: 20, yieldGrams: 40, ratio: 2 }).valid, false);
const preground = buildEspressoRecipe({ bean: { id: 'generic-bean' }, setup: { espressoMachine: 'other', espressoGrinder: 'preground', espressoBasket: 'dual-wall' }, doseGrams: 14 });
assert.equal(preground.ok, true);
assert.doesNotMatch(preground.recipe.grindGuidance, /adjust|finer|known espresso range/i);
assert.equal(validateEspressoRecipe({ ...preground.recipe, grinderSetting: { ...preground.recipe.grinderSetting, value: 5 } }).valid, false);
assert.equal(changedSetup.setupMismatch, true);
assert.deepEqual(changedSetup.previousRecipe, saved.recipe);
const builtinOther = buildEspressoRecipe({ bean: { id: 'generic-bean' }, setup: { espressoMachine: 'other', espressoMachineName: 'My machine', espressoGrinder: 'integrated' }, doseGrams: 20 }).recipe;
assert.equal(validateEspressoRecipe(builtinOther).valid, true);
assert.doesNotMatch(builtinOther.grindGuidance, /Barista|default/i);
assert.equal(validateEspressoRecipe({ ...builtinOther, grinderSetting: { ...builtinOther.grinderSetting, value: 30, source: 'user_saved' } }).valid, true);
const legacy = structuredClone(saved.recipe);
delete legacy.recipeKind;
delete legacy.doseBasis;
assert.equal(validateEspressoRecipe(legacy).valid, true);
console.log('espresso recipe tests: original and generic contracts passed');
