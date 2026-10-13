import assert from 'node:assert/strict';
import test from 'node:test';
import { espressoTastingContext, formatBrewContext, resolveBrewContext, snapshotBrewContext, tastingStepCopy } from '../src/lib/brewContext.js';
import { summarizeEvidence } from '../api/_lib/ruphusEvidence.js';
import { resolveTastingLaunchMethod } from '../src/lib/ruphus/launch.js';
import { buildPalateSummary } from '../src/lib/palateSummary.js';

test('espresso tasting snapshots preserve setup, drink and recipe independently of preferences', () => {
  const context = snapshotBrewContext({
    method: 'espresso', drinkType: 'with_milk', recipeRevisionId: 'rev-39',
    equipment: { machine: 'breville-barista-express', basket: 'stock-double-single-wall', grinder: 'external', grinderModel: 'Niche Zero' },
    recipeSnapshot: {
      doseGrams: 18, yieldGrams: 39, ratio: 2.17, timeBasis: 'machine_start_to_stop',
      grinderSetting: { grinder: 'external', model: 'Niche Zero', value: '18', unit: 'machine_setting', source: 'user_saved' },
      temperature: { mode: 'machine_default', offsetF: 2, supportedOffsetsF: [-4, -2, 0, 2, 4], unit: 'F', source: 'breville-manual' },
      provenance: { kind: 'verified_roaster', label: 'Verified roaster recipe', url: 'https://roaster.example/recipe' },
    },
  });
  const record = { beanId: 'bean-1', date: '2026-10-12', rating: null, notes: '', tastingScores: {} };
  const saved = { ...record, cupContext: context };
  assert.equal(saved.cupContext.drinkType, 'with_milk');
  assert.equal(saved.cupContext.recipeRevisionId, 'rev-39');
  assert.equal(saved.cupContext.equipment.grinderModel, 'Niche Zero');
  assert.deepEqual(saved.cupContext.recipeSnapshot.grinderSetting, { grinder: 'external', model: 'Niche Zero', value: '18', unit: 'machine_setting', source: 'user_saved' });
  assert.deepEqual(saved.cupContext.recipeSnapshot.temperature, { mode: 'machine_default', offsetF: 2, supportedOffsetsF: [-4, -2, 0, 2, 4], unit: 'F', source: 'breville-manual' });
  assert.equal(saved.cupContext.recipeSnapshot.provenance.url, 'https://roaster.example/recipe');
  assert.match(formatBrewContext(saved.cupContext), /espresso, with milk/);
  assert.match(formatBrewContext(saved.cupContext), /18g in, 39g out/);
  assert.match(formatBrewContext(saved.cupContext), /grind 18/);
  assert.match(formatBrewContext(saved.cupContext), /machine default \+2°F/);
  assert.match(formatBrewContext(saved.cupContext), /Verified roaster recipe/);
  assert.equal(resolveTastingLaunchMethod(saved), 'espresso');
});

test('unsaved espresso target is labeled without a saved revision and method correction clears incompatible context', () => {
  const savedRecipe = { fingerprint: 'saved-39', doseGrams: 18, yieldGrams: 39 };
  const editedRecipe = { ...savedRecipe, fingerprint: 'edited-40', doseGrams: 18, yieldGrams: 40 };
  const unsaved = espressoTastingContext({ recipe: editedRecipe, savedRecipe, setup: { machine: 'BES870', basket: 'stock', grinder: 'integrated' }, revisionId: 'revision-39' });
  assert.equal(unsaved.recipeRevisionId, undefined);
  assert.equal(unsaved.recipeSnapshot.source, 'unsaved_target');
  const corrected = snapshotBrewContext({ method: 'v60_hot' });
  assert.equal(corrected.method, 'v60_hot');
  assert.equal(corrected.equipment, undefined);
  assert.equal(corrected.recipeSnapshot, undefined);
  assert.equal(corrected.recipeRevisionId, undefined);
});

test('non-espresso direct tasting context does not inherit espresso equipment', () => {
  const preferences = {
    brewMethod: 'v60_hot',
    espressoMachine: 'breville-barista-express',
    espressoBasket: 'stock-double-single-wall',
    espressoGrinder: 'integrated',
    grinder: 'fellow-ode-gen2',
  };
  const context = resolveBrewContext({
    method: preferences.brewMethod,
    preferences: null,
    recipe: null,
  });
  assert.equal(context.method, 'v60_hot');
  assert.equal(context.equipment, undefined);
  assert.equal(context.recipeSnapshot, undefined);
});

test('espresso copy uses small-sip cues and suppresses cupping instructions', () => {
  const context = resolveBrewContext({ method: 'espresso', drinkType: 'straight', preferences: { brewMethod: 'v60_hot' } });
  const smell = tastingStepCopy({ key: 'smell', prompt: 'old', technique: 'old' }, context);
  const sip = tastingStepCopy({ key: 'firstsip', prompt: 'old', technique: 'old' }, context);
  assert.doesNotMatch(smell.technique, /crust|four-minute|four minute/i);
  assert.match(`${sip.prompt} ${sip.technique}`, /small first sip/i);
});

test('evidence describes recorded espresso context and keeps milk out of pure-bean inference', () => {
  const evidence = summarizeEvidence('tastings', [{
    createdAt: '2026-10-10T12:00:00Z', oneWord: 'sweet',
    cupContext: { method: 'espresso', drinkType: 'with_milk', recipeRevisionId: 'rev-39', equipment: { machine: 'breville-barista-express', grinder: 'external' }, recipeSnapshot: { doseGrams: 18, yieldGrams: 39, ratio: 2.17 } },
    actuals: { doseGrams: 18, yieldGrams: 39, elapsedSeconds: 40 },
  }], { now: Date.parse('2026-10-12T12:00:00Z'), windowDays: null });
  assert.doesNotMatch(evidence.summary, /\[object Object\]/);
  assert.match(evidence.summary, /espresso, with milk/);
  assert.match(evidence.summary, /milk sensory notes are drink context/);
  assert.deepEqual(evidence.contexts[0].recipeSnapshot, { doseGrams: 18, yieldGrams: 39, ratio: 2.17 });
});

test('legacy tastings remain unknown rather than inheriting current preferences', () => {
  const evidence = summarizeEvidence('tastings', [{ createdAt: '2026-10-10T12:00:00Z', notes: 'bright' }], { now: Date.parse('2026-10-12T12:00:00Z'), windowDays: null });
  assert.match(evidence.summary, /not linked to a specific brew/);
  assert.equal(evidence.contexts, undefined);
});

test('milk tasting stays in history but is excluded from pure-bean palate trends', () => {
  const base = Array.from({ length: 3 }, (_, index) => ({ tastingScores: { sweetness: 3, body: 3 }, oneWord: 'clean' }));
  const milk = { cupContext: { method: 'espresso', drinkType: 'with_milk' }, tastingScores: { sweetness: 10, body: 10 }, oneWord: 'milkshake' };
  const summary = buildPalateSummary([...base, milk]);
  assert.match(summary, /4 cups logged/);
  assert.match(summary, /sweetness 3\.0/);
  assert.doesNotMatch(summary, /sweetness 4\.8/);
  assert.doesNotMatch(summary, /milkshake/);
});
