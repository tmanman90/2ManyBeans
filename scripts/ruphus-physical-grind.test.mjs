import assert from 'node:assert/strict';
import test from 'node:test';
import { ODE_GEN2_STEPS, isOdeStep, moveOdeClicks, nearestOdeStep, quantizeGrinderSetting, grinderSettingToMicrons } from '../src/lib/brewMethods.js';
import { generateKalitaRecipe } from '../src/lib/kalitaAdapter.js';
import { generateV60Recipe } from '../src/lib/v60Adapter.js';
import { generateV60SwitchRecipe } from '../src/lib/v60SwitchAdapter.js';
import { generateV60IcedRecipe } from '../src/lib/v60IcedAdapter.js';
import { generateKalitaIcedRecipe } from '../src/lib/kalitaIcedAdapter.js';
import { createRuphusTools, diagnosticRecommendationReady } from '../api/_lib/ruphusTools.js';
import { recentProposalReviews, isAlternativeRequest } from '../src/lib/ruphus/proposalContinuity.js';
import { buildDynamicEvidenceBlock } from '../api/_lib/ruphusPrompt.js';
import { runRuphusTurn } from '../api/_lib/ruphusOrchestrator.js';

test('short sour reports and review follow-ups unlock a review without authorizing a save', () => {
  assert.equal(diagnosticRecommendationReady('Jar one kalita sour'), true);
  const conversation = [{ role: 'assistant', content: 'Go one physical click finer: 5.6 to 5.2.' }];
  assert.equal(diagnosticRecommendationReady('Show recipe', conversation), true);
  assert.equal(diagnosticRecommendationReady('Show recipe', []), false);
  assert.equal(diagnosticRecommendationReady('What if it is sour?'), false);
  assert.equal(diagnosticRecommendationReady('Do not update recipe', conversation), false);
});

test('31 Ode labels represent physical clicks, not decimal increments', () => {
  assert.equal(ODE_GEN2_STEPS.length, 31);
  assert.equal(moveOdeClicks(5.6, -1), 5.2);
  assert.equal(moveOdeClicks(5, -1), 4.6);
  assert.equal(moveOdeClicks(4.6, 1), 5);
  assert.equal(nearestOdeStep(7.1), 7.2);
  assert.equal(moveOdeClicks(1, -1), 1);
  assert.equal(moveOdeClicks(11, 1), 11);
  for (const invalid of [4.3, 5.5, null, '', 0, 11.2]) assert.equal(isOdeStep(invalid), false);
  assert.equal(quantizeGrinderSetting(5 + 2 / 3, 'fellow-ode-gen2'), 5.6);
  assert.equal(quantizeGrinderSetting(5.5, 'other'), 5.5);
  assert.equal(grinderSettingToMicrons(5.6, 'fellow-ode-gen2'), 688);
});

test('all supported manual adapters generate physical Ode positions', () => {
  for (const generate of [generateKalitaRecipe, generateV60Recipe, generateV60SwitchRecipe, generateV60IcedRecipe, generateKalitaIcedRecipe]) {
    const recipe = generate({}, { dose: 20, grinder: 'fellow-ode-gen2' });
    assert.ok(isOdeStep(recipe.grindSize.setting), generate.name + ': ' + recipe.grindSize.setting);
    assert.equal(recipe.grindSize.microns, grinderSettingToMicrons(recipe.grindSize.setting, 'fellow-ode-gen2'));
  }
});

async function harness({ grinder = 'fellow-ode-gen2', text = 'Please update the grind', prior = [] } = {}) {
  const recipe = generateKalitaRecipe({}, { dose: 13, grinder });
  recipe.grindSize.setting = '5.6';
  const context = {
    rotationSnapshot: { coffees: [{ refKey: 'c1', name: 'Columbia', recipes: ['kalita_hot'] }], refs: { c1: 'coffee' }, setup: { grinder } },
    __ruphusRefs: { c1: 'coffee' }, __ruphusPriorProposals: prior, userText: text,
    proposalState: { diagnosisReady: true, userAgreed: true },
  };
  let writes = 0;
  const tools = createRuphusTools({ uid: 'owner', context, readers: { readRecipe: async () => recipe }, proposalStore: async input => { writes++; return { ...input, status: 'proposed' }; } });
  await tools.call('read_recipe', { coffeeRef: 'c1', slot: 'kalita_hot' });
  return { tools, context, recipe, writes: () => writes };
}

test('invalid decimal from the model recovers to one real click and emits a card, not a connection error', async () => {
  const h = await harness();
  const frames = [];
  await runRuphusTurn({ turnId: 'physical-repair', context: h.context, userText: 'Sour', tools: h.tools, emit: frame => frames.push(frame), provider: { runTurn: async () => ({ toolCalls: [{ name: 'propose_recipe_change', args: { coffeeRef: 'c1', slot: 'kalita_hot', change: { control: 'grind', value: 5.5 } } }], usage: { input_tokens: 10, output_tokens: 10 } }) } });
  const card = frames.find(frame => frame.type === 'artifact_ready')?.artifact;
  assert.equal(card?.after.grindSize.setting, '5.2');
  assert.equal(frames.filter(frame => frame.type === 'artifact_ready').length, 1);
  assert.ok(!frames.some(frame => frame.type === 'turn_failed'));
  assert.equal(h.writes(), 1);
});

test('direct recipe read grounds the review follow-up before proposal dispatch', async () => {
  const h = await harness({ text: 'Show recipe' });
  h.context.conversation = [{ role: 'assistant', content: 'Go one click finer: 5.6 to 5.2.' }];
  h.context.proposalState = { diagnosisReady: false, userAgreed: false };
  await h.tools.call('read_recipe', { coffeeRef: 'c1', slot: 'kalita_hot' });
  assert.equal(h.context.proposalState.previewReady, true);
  const result = await h.tools.call('propose_recipe_change', { coffeeRef: 'c1', slot: 'kalita_hot', change: { control: 'grind', value: 5.2 } });
  assert.equal(result.ok, true);
  assert.equal(result.artifact.after.grindSize.setting, '5.2');
});

test('real proposal chain rejects 5.5 and accepts one physical finer click with coherent microns', async () => {
  const h = await harness();
  const args = { coffeeRef: 'c1', slot: 'kalita_hot', change: { control: 'grind', value: 5.5 } };
  const invalid = await h.tools.call('propose_recipe_change', args);
  assert.equal(invalid.code, 'physical_grind_required');
  assert.equal(invalid.validNearbySettings.finer, 5.2);
  assert.equal(h.writes(), 0);
  const valid = await h.tools.call('propose_recipe_change', { ...args, change: { control: 'grind', value: 5.2 } });
  assert.equal(valid.ok, true);
  assert.equal(valid.artifact.after.grindSize.setting, '5.2');
  assert.equal(valid.artifact.after.grindSize.microns, grinderSettingToMicrons(5.2, 'fellow-ode-gen2'));
  assert.equal(h.recipe.grindSize.setting, '5.6');
});

test('full-patch inputs cannot bypass physical grinder validation; other grinders are not Ode', async () => {
  const h = await harness();
  const result = await h.tools.call('propose_recipe_change', { coffeeRef: 'c1', slot: 'kalita_hot', intent: 'recipe_preview', afterRecipe: { grindSize: { setting: 4.3 } } });
  assert.equal(result.code, 'physical_grind_required');
  const other = await harness({ grinder: 'fellow-opus' });
  const allowed = await other.tools.call('propose_recipe_change', { coffeeRef: 'c1', slot: 'kalita_hot', change: { control: 'grind', value: 5.5 } });
  assert.equal(allowed.ok, true);
});

test('another recipe rejects repeated after-state but comparison is not an alternative request', async () => {
  const first = await harness();
  const args = { coffeeRef: 'c1', slot: 'kalita_hot', change: { control: 'grind', value: 5.2 } };
  const result = await first.tools.call('propose_recipe_change', args);
  const next = await harness({ text: 'Can you give me a different recipe to try?', prior: [result.artifact] });
  assert.equal((await next.tools.call('propose_recipe_change', args)).code, 'duplicate_alternative');
  assert.equal(next.writes(), 0);
  assert.equal(isAlternativeRequest('How does that differ from my current recipe?'), false);
  assert.equal(isAlternativeRequest('Cool show me a different one'), true);
});

test('comparison context retains exact named review, excludes foreign records and respects new chat', () => {
  const recipe = generateV60Recipe({}, { dose: 20 });
  const artifact = { type: 'recipe_proposal', coffeeId: 'coffee', slotKey: 'v60_hot', before: recipe, after: { ...recipe, techniqueLabel: 'Tetsu Kasuya 4:6' }, techniqueExperiment: { name: 'Tetsu Kasuya 4:6' } };
  const session = { messages: [{ artifacts: [{ ...artifact, coffeeId: 'foreign' }] }, { artifacts: [artifact] }] };
  const reviews = recentProposalReviews(session, { c1: 'coffee' });
  assert.equal(reviews.length, 1);
  assert.equal(reviews[0].name, 'Tetsu Kasuya 4:6');
  assert.equal(reviews[0].proposed.technique, 'Tetsu Kasuya 4:6');
  assert.ok(!JSON.stringify(reviews).includes('foreign'));
  assert.match(buildDynamicEvidenceBlock({ proposalReviews: reviews, proposalState: { previewReady: true } }), /Tetsu Kasuya 4:6/);
  assert.deepEqual(recentProposalReviews({ ...session, boundaryIndex: 2 }, { c1: 'coffee' }), []);
});
