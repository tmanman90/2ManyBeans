import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { canonicalHash } from '../src/lib/ruphus/contracts.js';
import { generateManualSourceTechniqueOption } from '../src/lib/ruphus/techniqueOptions.js';
import { commandForBeanUpdate } from '../src/lib/recipeCommands.js';
import { hydrateSavedSourceDose, previewSavedSourceDose, savedSourceDosePersistence } from '../src/lib/savedSourceDose.js';

test('saved source dose preview persists metadata and rehydrates the source envelope on open', () => {
  const original = generateManualSourceTechniqueOption('onyx-monarch-wave-185', {
    grindAdjustmentMicrons: -20,
    evidenceHash: 'saved-source-dose-test',
  }, {
    device: 'kalita', variant: 'wave', size: '185', model: 'Wave', filter: 'wave-185',
    mode: 'hot', dose: 23, grinder: 'fellow-ode-gen2',
  }).recipe;
  const snapshot = structuredClone(original);
  const originalSourceHash = canonicalHash(original.sourceProjection.sourceSnapshot);

  const preview = previewSavedSourceDose(original, 25);
  assert.equal(preview.coffeeGrams, 25);
  assert.equal(preview.userCoffeeGrams, 23, 'preview keeps the last persisted dose marker');
  assert.equal(preview.timerReady, true);
  assert.equal(preview.sourceProjection.sourceId, original.sourceProjection.sourceId);
  assert.deepEqual(preview.sourceLineage.grindAdaptation, original.sourceLineage.grindAdaptation);
  assert.deepEqual(preview.grindSize, original.grindSize);
  assert.equal(canonicalHash(preview.sourceProjection.sourceSnapshot), originalSourceHash);
  assert.deepEqual(original, snapshot, 'preview must not mutate the saved source');

  const persistence = savedSourceDosePersistence(preview, 25);
  assert.equal(persistence.persistedRecipe.userCoffeeGrams, 25);
  assert.deepEqual(persistence.update, {
    'handBrewRecipe.userCoffeeGrams': 25,
    'handBrewRecipes.kalita.userCoffeeGrams': 25,
  });
  const hotCommand = commandForBeanUpdate({
    id: 'bean-1', handBrewRecipe: original, activeRevisionIds: { kalita_hot: 'hot-revision' },
  }, persistence.update, { actionId: 'hot-dose' });
  assert.equal(hotCommand.mode, 'set_dose');
  assert.equal(hotCommand.slotKey, 'kalita_hot');
  assert.equal(hotCommand.expectedRevisionId, 'hot-revision');
  assert.equal(persistence.persistedRecipe.sourceProjection.sourceId, original.sourceProjection.sourceId);
  assert.deepEqual(persistence.persistedRecipe.sourceLineage.grindAdaptation, original.sourceLineage.grindAdaptation);
  assert.equal(canonicalHash(persistence.persistedRecipe.sourceProjection.sourceSnapshot), originalSourceHash);

  const reopened = hydrateSavedSourceDose({ ...original, userCoffeeGrams: 25 });
  assert.equal(reopened.coffeeGrams, 25);
  assert.equal(reopened.userCoffeeGrams, 25);
  assert.deepEqual(reopened.sourceLineage.grindAdaptation, original.sourceLineage.grindAdaptation);
  assert.equal(canonicalHash(reopened.sourceProjection.sourceSnapshot), originalSourceHash);

  const icedPersistence = savedSourceDosePersistence({ ...preview, mode: 'iced', isIced: true }, 25);
  assert.deepEqual(icedPersistence.update, {
    'handBrewIcedRecipes.kalita.userCoffeeGrams': 25,
  });
  const icedCommand = commandForBeanUpdate({
    id: 'bean-1', activeRevisionIds: { kalita_iced: 'iced-revision' },
  }, icedPersistence.update, { actionId: 'iced-dose' });
  assert.equal(icedCommand.mode, 'set_dose');
  assert.equal(icedCommand.slotKey, 'kalita_iced');
  assert.equal(icedCommand.expectedRevisionId, 'iced-revision');

  const hook = readFileSync(new URL('../src/hooks/useHandBrew.js', import.meta.url), 'utf8');
  const callback = hook.slice(
    hook.indexOf('const handleSourceCoffeeGramsChange'),
    hook.indexOf('const handleCoffeeGramsChange'),
  );
  assert.match(callback, /previewSavedSourceDose\(handBrewRecipe, newDose\)/);
  assert.doesNotMatch(callback, /handleBrewHandBrew|forceRegenerate/);
  assert.match(hook, /handBrewRecipe\.sourceProjection\s*\? handBrewRecipe\.coffeeGrams/);
  assert.match(hook, /sourcePersistence\?\.update \|\|/);
  assert.match(hook, /setHandBrewRecipe\(hydrateSavedSourceDose\(cachedCandidate\)\)/);
  const persistenceBlock = hook.slice(hook.indexOf('const persistDose'), hook.indexOf('const handleSourceCoffeeGramsChange'));
  assert.equal((persistenceBlock.match(/setHandBrewRecipe/g) || []).length, 1, 'async completion must not restore a stale recipe');
  assert.doesNotMatch(persistenceBlock, /handBrewRecipe:\s*sourcePersistence|handBrewRecipes\.\$\{dev\}`\]:\s*sourcePersistence/);

  const rotation = readFileSync(new URL('../src/tabs/RotationTab.jsx', import.meta.url), 'utf8');
  assert.match(rotation, /onSourceCoffeeGramsChange=\{handBrew\.handleSourceCoffeeGramsChange\}/);
});
