import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';
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

test('the chat recipe card shows an espresso ratio as 1:N, like the espresso modal', async () => {
  const recipe = buildEspressoRecipe({ bean: { id: 'coffee', roastLevel: 'light' }, setup: { espressoMachine: 'breville-barista-express', espressoBasket: 'stock-double-single-wall', espressoGrinder: 'integrated', espressoSetupConfirmed: true } }).recipe;
  const bundled = await build({ entryPoints: ['src/components/chat/artifacts/CurrentRecipeCard.jsx'], bundle: true, format: 'cjs', jsx: 'automatic', platform: 'node', write: false });
  const directory = await mkdtemp(join(tmpdir(), 'espresso-card-'));
  try {
    const bundlePath = join(directory, 'CurrentRecipeCard.cjs');
    await writeFile(bundlePath, bundled.outputFiles[0].text);
    const { CurrentRecipeCard } = await import(pathToFileURL(bundlePath));
    const html = renderToStaticMarkup(React.createElement(CurrentRecipeCard, { recipe }));
    assert.match(html, new RegExp(`>1:${recipe.ratio}<`));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
