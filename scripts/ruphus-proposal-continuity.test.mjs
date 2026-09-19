import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { recipeSummary, recentProposalReviews, sameRecipeReview } from '../src/lib/ruphus/proposalContinuity.js';
import { techniqueSelectionsFromSession } from '../api/ruphus-agent.js';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const switchProjection = ({ water = { value: 440, unit: 'mL' }, temperature = null } = {}) => ({
  projectionVersion: 'ruphus-manual-source-projection-v1',
  sourceRecordVersion: 1,
  sourceId: 'hario-switch-03-ssd-360',
  sourceRevision: 1,
  sourceSnapshot: {
    title: 'HARIO Switch 03 full immersion',
    author: 'HARIO',
    source: { url: 'https://www.hario.com/product/SSD-360.pdf' },
  },
  sourceConfiguration: { device: 'switch', size: '03', mode: 'hot' },
  configurationKey: 'switch:03:hot',
  equipment: { brewer: 'switch', size: '03', model: 'SSD-360', filter: 'paper-03' },
  coffeeGrams: 36,
  water,
  temperature,
  clock: { origin: 'after-main-pour' },
  stages: [
    { id: 'pour', kind: 'pour', label: 'Pour to 440mL', trigger: { type: 'elapsed', seconds: 0 }, water, valve: 'closed' },
    { id: 'steep', kind: 'valve', label: 'Steep for approximately 2 minutes', trigger: { type: 'after', event: 'pour:complete', seconds: 0 }, water: null, valve: 'closed' },
    { id: 'drain', kind: 'finish', label: 'Open and drain', trigger: { type: 'after', event: 'steep:complete', seconds: 120 }, water: null, valve: 'open' },
  ],
  finish: null,
  readiness: { timerReady: true, blockers: [] },
});

const switchRecipe = (overrides = {}) => ({
  coffeeGrams: 36,
  ratio: '1:12.2',
  sourceProjection: switchProjection(overrides),
  ...overrides.recipe,
});

test('review summary preserves source-native mL and exact stage timing without inventing temperature', () => {
  const recipe = switchRecipe();
  delete recipe.coffeeGrams;
  const summary = recipeSummary({ ...recipe, temperatureC: 99, totalBrewTimeSeconds: 999 });
  assert.equal(summary.dose, 36, 'canonical projection dose remains available when legacy top-level dose is absent');
  assert.deepEqual(summary.water, { value: 440, unit: 'mL' });
  assert.equal(summary.temperature, undefined);
  assert.equal(summary.temperatureC, undefined);
  assert.equal(summary.steps[0].action, 'Pour to 440mL');
  assert.deepEqual(summary.steps[0].water, { value: 440, unit: 'mL' });
  assert.equal(summary.steps[0].waterTotal, undefined, 'volume must not be mislabeled as grams');
  assert.equal(summary.waterAdditionsIncludingBloom, 1, 'immersion retention is not a second water addition');
  assert.deepEqual(summary.steps[2].trigger, { type: 'after', event: 'steep:complete', seconds: 120 });
  assert.equal(summary.source.sourceId, 'hario-switch-03-ssd-360');
  assert.equal(summary.source.sourceRevision, 1);
  assert.deepEqual(summary.source.equipment, { brewer: 'switch', size: '03', model: 'SSD-360', filter: 'paper-03', mode: 'hot' });
  assert.equal(summary.source.clockOrigin, 'after-main-pour');
  assert.equal(summary.totalBrewTimeSeconds, undefined, 'source projection does not expose a generic legacy total as source timing');
  assert.deepEqual(summary.readiness, { timerReady: true });
});

test('review summary keeps author ranges and native Fahrenheit typed', () => {
  const recipe = {
    coffeeGrams: 16,
    water: { value: { min: 40, max: 50 }, unit: 'g' },
    temperature: { value: { min: 195, max: 205 }, unit: 'F' },
    steps: [{ id: 'bloom', label: 'Wet all grounds with 40–50g', trigger: { type: 'manual' }, water: { value: { min: 40, max: 50 }, unit: 'g' } }],
  };
  const summary = recipeSummary(recipe);
  assert.deepEqual(summary.water, { value: { min: 40, max: 50 }, unit: 'g' });
  assert.deepEqual(summary.temperature, { value: { min: 195, max: 205 }, unit: 'F' });
  assert.equal(summary.temperatureC, undefined);
  assert.deepEqual(summary.steps[0].water, { value: { min: 40, max: 50 }, unit: 'g' });
  assert.deepEqual(summary.steps[0].waterTotal, { min: 40, max: 50 });
});

test('provider review serialization preserves a source-native mL marker over a legacy grams alias', () => {
  const sourceCard = (id, name, water) => ({
    id, type: 'recipe_proposal', status: 'proposed', coffeeId: 'coffee-1', slotKey: 'v60_hot',
    before: { coffeeGrams: 15, waterGrams: 250 },
    after: {
      coffeeGrams: 15,
      waterGrams: water,
      sourceNativeWaterUnit: 'mL',
      techniqueLabel: name,
      sourceLineage: { sourceId: id, familyId: id },
      steps: [{ action: `Pour to ${water}mL`, waterTotal: water }],
    },
    techniqueExperiment: { kind: 'manual_source_technique', techniqueId: id, familyId: id, sourceId: id, name },
  });
  const reviews = recentProposalReviews({ boundaryIndex: 0, messages: [
    { artifacts: [sourceCard('matt-winton-hybrid', 'Matt Winton hybrid', 225)] },
    { artifacts: [sourceCard('hario-full-immersion', 'HARIO full immersion', 183)] },
  ] }, { c1: 'coffee-1' }, { coffeeRef: 'c1', slot: 'v60_hot' });

  assert.deepEqual(reviews.map((review) => review.proposed.water), [
    { value: 225, unit: 'mL' },
    { value: 183, unit: 'mL' },
  ]);
  assert.deepEqual(reviews.map((review) => review.proposed.steps[0].water), [
    { value: 225, unit: 'mL' },
    { value: 183, unit: 'mL' },
  ]);
  assert.equal(reviews.some((review) => review.proposed.steps[0].waterTotal), false);
});

test('reviews carry exact authenticated proposal refs and source projection while excluding foreign and archived history', () => {
  const first = {
    id: 'proposal-first', type: 'recipe_proposal', status: 'superseded', coffeeId: 'coffee-1', slotKey: 'v60_hot', sessionId: 'turn-1', sourceRevisionId: 'revision-first', sourceHash: 'source-first', recipeHash: 'recipe-first',
    techniqueExperiment: { kind: 'v60_technique', techniqueId: 'family-pulse', familyId: 'family-pulse', sourceId: 'source-pulse', name: 'Pulse family' },
    before: { coffeeGrams: 20, waterGrams: 300 }, after: switchRecipe({ recipe: { techniqueLabel: 'Pulse family', sourceProjection: switchProjection({ water: { value: 300, unit: 'mL' } }) } }),
  };
  const second = {
    id: 'proposal-second', type: 'recipe_proposal', status: 'proposed', coffeeId: 'coffee-1', slotKey: 'v60_hot', sessionId: 'turn-2', sourceRevisionId: 'revision-second', sourceHash: 'source-second', recipeHash: 'recipe-second',
    techniqueExperiment: { kind: 'v60_technique', techniqueId: 'family-continuous', familyId: 'family-continuous', sourceId: 'source-continuous', name: 'Continuous family' },
    before: { coffeeGrams: 20, waterGrams: 300 }, after: { coffeeGrams: 20, waterGrams: 320, techniqueLabel: 'Continuous family' },
  };
  const reviews = recentProposalReviews({ boundaryIndex: 0, messages: [
    { artifacts: [{ ...first, coffeeId: 'foreign-coffee' }, first] },
    { artifacts: [second, { ...first, status: 'superseded', historyOnly: true }] },
  ] }, { c1: 'coffee-1' });
  assert.deepEqual(reviews.map(review => review.proposalId), ['proposal-first', 'proposal-second']);
  assert.deepEqual(reviews.map(review => review.ordinal), [1, 2]);
  assert.equal(reviews[0].artifactId, 'proposal-first');
  assert.equal(reviews[0].sourceRevisionId, 'revision-first');
  assert.equal(reviews[0].sourceId, 'hario-switch-03-ssd-360');
  assert.equal(reviews[0].sourceRevision, 1);
  assert.deepEqual(reviews[0].techniqueExperiment, { kind: 'v60_technique', techniqueId: 'family-pulse', familyId: 'family-pulse', sourceId: 'source-pulse', name: 'Pulse family' });
  assert.deepEqual(reviews[0].proposed.water, { value: 300, unit: 'mL' });
  assert.equal(JSON.stringify(reviews).includes('foreign-coffee'), false);
  assert.deepEqual(recentProposalReviews({ boundaryIndex: 2, messages: [{ artifacts: [first] }, { artifacts: [second] }] }, { c1: 'coffee-1' }), []);
  assert.deepEqual(recentProposalReviews({ messages: [{ artifacts: [first] }] }, { c1: 'coffee-1' }, { coffeeRef: 'c2' }), []);
});

test('new-chat boundary and explicit historical inspection do not create a command reference', () => {
  const chat = read('src/tabs/ChatTab.jsx');
  assert.match(chat, /const handleHistoricalProposalInspect = useCallback/);
  assert.match(chat, /onInspect=\{handleHistoricalProposalInspect\}/);
  assert.match(chat, /data-historical-inspection="true"/);
  const card = read('src/components/chat/artifacts/RecipeProposalCard.jsx');
  // Proposed/saved/undone callback behavior is exercised by the rendered
  // card test; historical inspection must remain a separate read-only path.
  assert.match(card, /const showActions = proposal\.status === 'proposed'/);
  const handler = chat.slice(chat.indexOf('const handleHistoricalProposalInspect'), chat.indexOf('const closeHistoricalProposal'));
  assert.doesNotMatch(handler, /handleRuphusAction|runRuphusAction|restoreRecipePreviewAction|writeRecipePreviewDraft/);
  assert.match(chat, /setHistoricalProposal\(null\)/);
});

test('technique exclusion state keeps exact successfully delivered proposal refs', () => {
  const session = {
    boundaryIndex: 0,
    messages: [{ artifacts: [
      { id: 'proposal-one', type: 'recipe_proposal', coffeeId: 'coffee-1', slotKey: 'v60_hot', techniqueExperiment: { kind: 'v60_technique', techniqueId: 'technique-one', familyId: 'family-one', sourceId: 'source-one' } },
      { id: 'proposal-two', type: 'recipe_proposal', coffeeId: 'coffee-1', slotKey: 'v60_hot', techniqueExperiment: { kind: 'v60_technique', techniqueId: 'technique-two', familyId: 'family-two', sourceId: 'source-two' } },
      { id: 'foreign', type: 'recipe_proposal', coffeeId: 'foreign', slotKey: 'v60_hot', techniqueExperiment: { kind: 'v60_technique', techniqueId: 'foreign-technique' } },
    ] }],
  };
  const selections = techniqueSelectionsFromSession(session, { c1: 'coffee-1' });
  assert.deepEqual(selections.get('c1:v60_hot'), { selectedIds: ['technique-one', 'family-one', 'source-one', 'technique-two', 'family-two', 'source-two'], proposalIds: ['proposal-one', 'proposal-two'] });
});

test('source unit changes remain distinct review identities', () => {
  const grams = switchRecipe({ recipe: { sourceProjection: switchProjection({ water: { value: 440, unit: 'g' } }) } });
  assert.equal(sameRecipeReview(switchRecipe(), grams), false);
});
