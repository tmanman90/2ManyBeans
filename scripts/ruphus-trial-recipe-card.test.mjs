import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';
import test from 'node:test';
import { createRuphusTools } from '../api/_lib/ruphusTools.js';
import { generateManualSourceTechniqueOption } from '../src/lib/ruphus/techniqueOptions.js';

const renderProductionCard = async (props) => {
  const result = await build({
    entryPoints: ['src/components/chat/artifacts/CurrentRecipeCard.jsx'],
    bundle: true,
    format: 'cjs',
    jsx: 'automatic',
    platform: 'node',
    write: false,
  });
  const directory = await mkdtemp(join(tmpdir(), 'ruphus-trial-card-'));
  try {
    const bundlePath = join(directory, 'CurrentRecipeCard.cjs');
    await writeFile(bundlePath, result.outputFiles[0].text);
    const module = await import(pathToFileURL(bundlePath));
    return renderToStaticMarkup(React.createElement(module.CurrentRecipeCard, props));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

test('review_trial_recipe output renders trusted Switch source facts', async () => {
  const sourceRecipe = generateManualSourceTechniqueOption(
    'hario-switch-03-instruction-manual-36-2023',
    {},
    { dose: 16 },
  ).recipe;
  const attempt = {
    id: 'attempt-switch-16',
    ownerId: 'owner',
    coffeeId: 'coffee',
    slotKey: 'v60_hot',
    proposalId: 'proposal-switch-16',
    revisionId: 'revision-switch-16',
    sourceHash: 'source-hash-switch-16',
    status: 'timer_started',
    snapshot: sourceRecipe,
  };
  const context = {
    rotationSnapshot: {
      refs: { c1: 'coffee' },
      coffees: [{ refKey: 'c1', name: 'El Vergel' }],
    },
    __ruphusTrialReceipts: [{
      id: 'receipt-switch-16',
      attemptId: attempt.id,
      coffeeId: attempt.coffeeId,
      slotKey: attempt.slotKey,
    }],
  };
  const tools = createRuphusTools({
    uid: 'owner',
    context,
    proposalActions: ['apply_proposal'],
    readers: {
      readAttempts: async () => [attempt],
      readTrialReceipt: async () => ({
        id: 'receipt-switch-16',
        ownerId: 'owner',
        actionId: 'action-switch-16',
        mode: 'brew_once',
        attemptId: attempt.id,
        coffeeId: attempt.coffeeId,
        slotKey: attempt.slotKey,
      }),
    },
  });

  const review = await tools.call('review_trial_recipe', { coffeeRef: 'c1', slot: 'v60_hot', trialRef: null });
  assert.equal(review.ok, true);
  assert.equal(review.artifact.title, 'El Vergel · Switch 03');
  assert.equal(review.artifact.recipe.sourceProjection.water.value, 195.56);
  assert.equal(review.artifact.recipe.sourceProjection.water.unit, 'mL');
  assert.equal(review.artifact.recipe.waterMilliliters, 195.56);
  assert.equal(review.artifact.recipe.grind.description, 'Medium grind');
  assert.equal(review.artifact.recipe.techniqueLabel, 'HARIO Switch 03 instruction-manual immersion');

  const markup = await renderProductionCard({
    recipe: review.artifact.recipe,
    title: review.artifact.title,
  });
  assert.match(markup, />El Vergel · Switch 03</);
  assert.match(markup, />195\.56mL</);
  assert.match(markup, />Medium grind</);
  assert.match(markup, />HARIO Switch 03 Instruction Manual Immersion</);
  assert.doesNotMatch(markup, /\[object Object\]/);
  assert.doesNotMatch(markup, />undefined</);
});
