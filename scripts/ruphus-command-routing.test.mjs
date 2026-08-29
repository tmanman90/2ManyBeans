import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { commandForBeanUpdate, PROTECTED_KEYS, splitProtectedRecipeUpdates } from '../src/lib/recipeCommands.js';
import { generateV60Recipe } from '../src/lib/v60Adapter.js';
import { generateV60IcedRecipe } from '../src/lib/v60IcedAdapter.js';

const recipe = generateV60Recipe({}, { dose: 15 });
const iced = generateV60IcedRecipe({}, { dose: 15 });
const bean = { id: 'bean-1', handBrewRecipe: recipe, handBrewRecipes: { v60: recipe }, handBrewIcedRecipes: { v60: iced }, aidenRecipe: { method: 'aiden', device: 'aiden', mode: 'hot' }, activeRevisionIds: {} };

test('every protected writer shape resolves to a canonical command mode', () => {
  assert.equal(commandForBeanUpdate(bean, { aidenGrind: { singleServe: 5 } }).mode, 'set_aiden_grind');
  assert.equal(commandForBeanUpdate(bean, { aidenGrind: { singleServe: 5 }, aidenLink: 'https://example.test' }).mode, 'set_aiden_grind');
  assert.equal(commandForBeanUpdate(bean, { aidenRecipe: bean.aidenRecipe, aidenGrind: { singleServe: 5 }, aidenLink: null }).mode, 'replace_active_recipe');
  assert.equal(commandForBeanUpdate(bean, { aidenLink: 'https://example.test', aidenUsedRelay: false }).mode, 'set_aiden_link');
  assert.equal(commandForBeanUpdate(bean, { 'handBrewRecipe.userCoffeeGrams': 16, 'handBrewRecipes.v60.userCoffeeGrams': 16 }).mode, 'set_dose');
  assert.equal(commandForBeanUpdate(bean, { 'handBrewIcedRecipes.v60': iced }).slotKey, 'v60_iced');
  assert.equal(commandForBeanUpdate(bean, { handBrewRecipe: recipe, 'handBrewRecipes.v60': recipe }).mode, 'replace_active_recipe');
  for (const key of ['aidenRecipe', 'aidenGrind', 'aidenLink', 'aidenIcedLink', 'activeRevisionIds', 'handBrewRecipes', 'handBrewIcedRecipes', 'handBrewRecipe']) assert.ok(PROTECTED_KEYS.has(key));
});

test('the app update seam intercepts protected fields before direct Firestore update', async () => {
  const source = await readFile(new URL('../src/hooks/useAppData.js', import.meta.url), 'utf8');
  assert.match(source, /if \(isProtectedRecipeUpdate\(updates\)\)/);
  assert.match(source, /executeRecipeCommand\(/);
  assert.match(source, /await updateDoc\(beanRef/);
  assert.ok(source.indexOf('isProtectedRecipeUpdate(updates)') < source.indexOf('await updateDoc(beanRef'));
});

test('mixed Edit Bean payload routes its protected generation field without swallowing ordinary fields', () => {
  const command = commandForBeanUpdate(bean, {
    displayName: 'Updated label',
    sourceContextHash: 'new-source',
    aidenGrind: { singleServe: 6, batch: 7 },
  });
  assert.equal(command.mode, 'set_aiden_grind');
  assert.deepEqual(command.patch, { aidenGrind: { singleServe: 6, batch: 7 } });
});

test('generated Aiden payloads without device metadata still target the Aiden slot', () => {
  const generatedAiden = { profileType: 0, ratio: 16, bloomEnabled: true, bloomRatio: 2, bloomDuration: 30, bloomTemperature: 96, ssPulsesEnabled: true, ssPulsesNumber: 1, ssPulsesInterval: 20, ssPulseTemperatures: [96], batchPulsesEnabled: true, batchPulsesNumber: 1, batchPulsesInterval: 30, batchPulseTemperatures: [96] };
  assert.equal(commandForBeanUpdate(bean, { aidenRecipe: generatedAiden }).slotKey, 'aiden');
});

test('mixed hot and iced editor payloads split into ordered selected-slot commands', () => {
  const groups = splitProtectedRecipeUpdates({ 'handBrewRecipes.v60': recipe, 'handBrewIcedRecipes.v60': iced });
  assert.equal(groups.length, 2);
  assert.equal(commandForBeanUpdate(bean, groups[0]).slotKey, 'v60_hot');
  assert.equal(commandForBeanUpdate(bean, groups[1]).slotKey, 'v60_iced');
  assert.notDeepEqual(groups[0], groups[1]);
});
