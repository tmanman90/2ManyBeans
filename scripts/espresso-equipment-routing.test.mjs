import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BREW_DEVICES,
  BREW_METHODS,
  ESPRESSO_BASKETS,
  ESPRESSO_GRINDERS,
  ESPRESSO_MACHINES,
  DEFAULT_ESPRESSO_SETUP,
  changesEspressoEquipmentIdentity,
  hasSavedBrewProfile,
  isEspressoBrewMethod,
  isManualBrewMethod,
  isSupportedEspressoSetup,
} from '../src/lib/brewMethods.js';

test('espresso is a distinct brew category and never a manual device', () => {
  assert.equal(BREW_METHODS.espresso.category, 'espresso');
  assert.equal(isEspressoBrewMethod('espresso'), true);
  assert.equal(isManualBrewMethod('espresso'), false);
  assert.equal(BREW_DEVICES.some(({ key }) => key === 'espresso'), false);
});

test('the verified setup keeps machine, basket, and grinder choices independent', () => {
  assert.equal(ESPRESSO_MACHINES.some(({ key }) => key === 'breville-barista-express'), true);
  assert.equal(ESPRESSO_MACHINES.some(({ key }) => key === 'other'), true);
  assert.equal(ESPRESSO_GRINDERS.some(({ key }) => key === 'unknown'), true);
  assert.equal(ESPRESSO_GRINDERS.some(({ key }) => key === 'preground'), true);
  assert.equal(ESPRESSO_BASKETS.some(({ key }) => key === 'dual-wall'), true);
  assert.equal(DEFAULT_ESPRESSO_SETUP.espressoGrinder, null);
  assert.equal(ESPRESSO_BASKETS.some(({ key }) => key === 'stock-double-single-wall'), true);
  assert.equal(ESPRESSO_GRINDERS.some(({ key }) => key === 'integrated'), true);
  assert.equal(ESPRESSO_GRINDERS.some(({ key }) => key === 'external'), true);
  assert.equal(ESPRESSO_GRINDERS.some(({ key }) => key === 'custom'), true);
  assert.equal(DEFAULT_ESPRESSO_SETUP.espressoMachine, null);
  assert.equal(DEFAULT_ESPRESSO_SETUP.espressoBasket, null);
  assert.equal(DEFAULT_ESPRESSO_SETUP.espressoSetupConfirmed, false);
  assert.equal(isSupportedEspressoSetup(DEFAULT_ESPRESSO_SETUP), false);
  assert.equal(isSupportedEspressoSetup({
    espressoMachine: 'breville-barista-express',
    espressoBasket: 'different',
    espressoSetupConfirmed: true,
  }), false);
  assert.equal(isSupportedEspressoSetup({
    espressoMachine: 'breville-barista-express',
    espressoBasket: 'stock-double-single-wall',
    espressoGrinder: 'integrated',
    espressoSetupConfirmed: true,
  }), true);
  assert.equal(changesEspressoEquipmentIdentity('espressoMachine'), true);
  assert.equal(changesEspressoEquipmentIdentity('espressoMachineName'), true);
  assert.equal(changesEspressoEquipmentIdentity('espressoBasketDoseGrams'), true);
  assert.equal(changesEspressoEquipmentIdentity('espressoBasket'), true);
  assert.equal(changesEspressoEquipmentIdentity('espressoGrinder'), true);
});

test('saved archive recipe remains visible after changing current brew preference', () => {
  assert.equal(hasSavedBrewProfile({
    showBrewProfile: true,
    handBrewRecipe: { device: 'v60' },
  }), true);
  assert.equal(hasSavedBrewProfile({
    showBrewProfile: true,
    aidenRecipe: { ratio: '1:2' },
  }), true);
  assert.equal(hasSavedBrewProfile({ showBrewProfile: true }), false);
  assert.equal(hasSavedBrewProfile({ showBrewProfile: false, handBrewRecipe: { device: 'v60' } }), false);
});

test('existing entry points do not classify espresso as hand brew or Aiden', () => {
  for (const path of [
    'src/tabs/RotationTab.jsx',
    'src/tabs/InventoryTab.jsx',
    'src/tabs/ChatTab.jsx',
    'src/components/QuickRecipeFlow.jsx',
  ]) {
    const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /preferences\.brewMethod\s*!==\s*['"]aiden['"]/);
    assert.match(source, /isEspressoBrewMethod/);
    assert.match(source, /isManualBrewMethod/);
  }
});

