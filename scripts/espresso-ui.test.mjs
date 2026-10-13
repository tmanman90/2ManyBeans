import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEspressoRecipe, editEspressoRecipe } from '../src/lib/espressoRecipes.js';
import { espressoHasUnsavedEdits } from '../src/lib/espressoUi.js';

test('an unedited generic starting framework is available to chat without saving invented numbers', () => {
  const draft = buildEspressoRecipe({ bean: { id: 'coffee' }, setup: { brewMethod: 'aiden', espressoGrinder: null } }).recipe;
  assert.equal(draft.doseGrams, null);
  assert.equal(espressoHasUnsavedEdits(draft, null), false);
  const edited = editEspressoRecipe(draft, { doseGrams: 20 }).recipe;
  assert.equal(espressoHasUnsavedEdits(edited, null), true);
  assert.equal(espressoHasUnsavedEdits(edited, structuredClone(edited)), false);
  const changed = editEspressoRecipe(edited, { yieldGrams: 44 }).recipe;
  assert.equal(espressoHasUnsavedEdits(changed, edited), true);
});

test('a machine starting recipe can be discussed but editing requires the saved revision', () => {
  const draft = buildEspressoRecipe({ bean: { id: 'coffee' }, setup: { brewMethod: 'aiden', espressoMachine: 'breville-barista-express', espressoBasket: 'stock-double-single-wall', espressoGrinder: 'external', espressoGrinderModel: 'DF64', espressoSetupConfirmed: true } }).recipe;
  assert.equal(espressoHasUnsavedEdits(draft, null), false);
  assert.equal(espressoHasUnsavedEdits(editEspressoRecipe(draft, { yieldGrams: 39 }).recipe, null), true);
});
