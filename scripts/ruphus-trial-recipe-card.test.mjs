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
import { generateKalitaRecipe } from '../src/lib/kalitaAdapter.js';
import { generateKalitaIcedRecipe } from '../src/lib/kalitaIcedAdapter.js';
import { generateV60IcedRecipe } from '../src/lib/v60IcedAdapter.js';
import { generateManualSourceTechniqueOption } from '../src/lib/ruphus/techniqueOptions.js';

const renderProductionCard = async (props, entryPoint = 'src/components/chat/artifacts/CurrentRecipeCard.jsx', exportName = 'CurrentRecipeCard') => {
  const result = await build({
    entryPoints: [entryPoint],
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
    return renderToStaticMarkup(React.createElement(module[exportName], props));
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

test('recovered hot and iced trial cards render their complete executable recipe', async () => {
  const hot = generateKalitaRecipe({}, { size: '155', dose: 15, grinder: 'fellow-ode-gen2' });
  const icedV60 = {
    ...generateV60IcedRecipe({}, { dose: 25, grinder: 'fellow-ode-gen2' }),
    finalBeverageWaterTargetGrams: 400,
    ratio: '1:16',
    waterGrams: 266,
    hotWaterGrams: 266,
    iceGrams: 134,
    initialBrewIceGrams: 134,
    grindSize: { setting: '5.6', description: 'Medium', grinderSpecific: true },
  };
  const icedKalita = generateKalitaIcedRecipe({}, { size: '185', dose: 20, grinder: 'fellow-ode-gen2' });

  const hotMarkup = await renderProductionCard({ recipe: hot, title: 'Hot trial' });
  assert.match(hotMarkup, />Water<\/span>/);
  assert.match(hotMarkup, /Finish at 240g total/);

  const v60Markup = await renderProductionCard({ recipe: icedV60, title: 'V60 02 · Iced' });
  assert.match(v60Markup, />Brew water<\/span>[\s\S]*>266 g<\/span>/);
  assert.match(v60Markup, />Recipe ice<\/span>[\s\S]*>134 g<\/span>/);
  assert.match(v60Markup, />Total beverage water<\/span>[\s\S]*>400 g<\/span>/);
  assert.match(v60Markup, /1:16/);
  assert.match(v60Markup, /Medium · setting 5\.6/);
  assert.match(v60Markup, /After Finish Brew, swirl or stir until the recipe ice has melted/);

  const kalitaMarkup = await renderProductionCard({ recipe: icedKalita, title: 'Wave 185 · Iced' });
  assert.match(kalitaMarkup, />Recipe ice<\/span>/);
  assert.match(kalitaMarkup, />Total brew input<\/span>/);
  assert.match(kalitaMarkup, /Final beverage water and ratio are not assumed/);
  assert.doesNotMatch(kalitaMarkup, /<span>Ratio<\/span>/);
  assert.match(kalitaMarkup, /After Finish Brew, gently swirl the server/);
});

test('iced action receipts identify the recovered brewer mode without changing Aiden profiles', async () => {
  const iced = generateV60IcedRecipe({}, { dose: 20, grinder: 'fellow-ode-gen2' });
  const icedMarkup = await renderProductionCard({
    artifact: { id: 'receipt-iced', title: 'El Vergel · V60 02', status: 'ready', mode: 'brew_once', recipe: iced },
  }, 'src/components/chat/artifacts/ActionReceiptCard.jsx', 'ActionReceiptCard');
  assert.match(icedMarkup, />El Vergel · V60 02 · Iced</);
  assert.match(icedMarkup, /Review trial recipe/);

  const aiden = {
    method: 'aiden', device: 'aiden', ratio: 16, bloomEnabled: true, bloomRatio: 2, bloomDuration: 30, bloomTemperature: 95,
    ssPulsesEnabled: true, ssPulsesNumber: 2, ssPulsesInterval: 20, ssPulseTemperatures: [96, 95],
    batchPulsesEnabled: false, grindRecommendation: { singleServe: 5.6, batch: 6.4 },
  };
  const aidenMarkup = await renderProductionCard({ recipe: aiden, title: 'Aiden trial' });
  assert.match(aidenMarkup, /Single-serve grind \(Ode Gen 2\).*5\.6/);
  assert.doesNotMatch(aidenMarkup, /Recipe ice|Brew water|Total beverage water/);
});
