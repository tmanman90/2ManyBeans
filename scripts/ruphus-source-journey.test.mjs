import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { handleRecipePreview } from '../api/ruphus-preview.js';
import { executeRecipeCommand } from '../api/_lib/ruphusCommandService.js';
import { createMemoryRuphusRepository } from '../api/_lib/ruphusRepository.js';
import { createRuphusTools } from '../api/_lib/ruphusTools.js';
import { generateManualSourceTechniqueOption } from '../src/lib/ruphus/techniqueOptions.js';
import { canonicalHash, validateManualSourceRecipeSnapshot } from '../src/lib/ruphus/contracts.js';
import { createRecipePreview } from '../src/lib/ruphus/recipePreview.js';
import { canonicalRecipeSnapshot } from '../src/lib/ruphus/legacyRecipeResolver.js';

test('chat opening and dose edits preserve source lineage while replaying ratio adaptations', () => {
  const chat = readFileSync(new URL('../src/tabs/ChatTab.jsx', import.meta.url), 'utf8');
  const calls = chat.match(/createRecipePreview\(\{[^;]+?\}\)/g);
  assert.equal(calls.length, 2);
  for (const call of calls) assert.doesNotMatch(call, /\b(?:ratio|targetRatio):/);
  const source = generateManualSourceTechniqueOption('kurasu-wave-155-2023', {}, {
    device: 'kalita', variant: 'wave', size: '155', model: 'Wave', filter: 'wave-155', mode: 'hot', dose: 13,
  }).recipe;
  assert.ok(source.ratio);
  const ratioPreview = createRecipePreview({ recipe: source, dose: 13, ratio: '1:15' });
  assert.equal(ratioPreview.sourceProjection.adaptation.controls.ratio, 15);
  assert.equal(ratioPreview.sourceProjection.sourceSnapshot.water.brewGrams, source.sourceProjection.sourceSnapshot.water.brewGrams);
  assert.equal(ratioPreview.ratio, '1:15');
  for (const dose of [12, 13, 14, 20]) {
    const preview = createRecipePreview({ recipe: source, dose, configuration: {} });
    assert.equal(preview.coffeeGrams, dose);
    assert.equal(preview.sourceProjection.sourceId, source.sourceProjection.sourceId);
    assert.equal(preview.ratio, source.ratio);
  }
  assert.throws(() => createRecipePreview({ recipe: source, dose: 21 }), /unsupported-dose-adaptation/);
});

test('source projection validation tolerates Firestore map key reordering', () => {
  const source = generateManualSourceTechniqueOption('hario-switch-03-instruction-manual-36-2023', {}, {
    device: 'v60', variant: 'switch', size: '03', model: 'V60 Switch', filter: 'v60-03-paper', material: 'glass', mode: 'hot', dose: 15,
  }).recipe;
  const reorderMaps = (value) => {
    if (Array.isArray(value)) return value.map(reorderMaps);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.keys(value).reverse().map((key) => [key, reorderMaps(value[key])]));
  };
  const roundTripped = reorderMaps(source);
  assert.equal(validateManualSourceRecipeSnapshot(roundTripped).valid, true);
  const preview = createRecipePreview({ recipe: roundTripped, dose: 16 });
  assert.equal(preview.coffeeGrams, 16);
  assert.equal(preview.waterMilliliters, 195.56);

  const waterTampered = reorderMaps(source);
  waterTampered.sourceProjection.water.value += 1;
  const waterResult = validateManualSourceRecipeSnapshot(waterTampered);
  assert.equal(waterResult.valid, false);
  assert.ok(waterResult.errors.includes('source-water-projection-mismatch'));

  const stageTampered = reorderMaps(source);
  stageTampered.sourceProjection.stages[0].water.value += 1;
  const stageResult = validateManualSourceRecipeSnapshot(stageTampered);
  assert.equal(stageResult.valid, false);
  assert.ok(stageResult.errors.includes('source-stages-mismatch'));
});

test('ratio and temperature adaptations replay through serialized dose reload without changing source identity', () => {
  const source = generateManualSourceTechniqueOption('kurasu-wave-155-2023', {}, {
    device: 'kalita', variant: 'wave', size: '155', model: 'Wave', filter: 'wave-155', mode: 'hot', dose: 14,
  }).recipe;
  const sourceSnapshot = structuredClone(source.sourceProjection.sourceSnapshot);
  const originalTimes = source.sourceProjection.stages.map((stage) => stage.trigger);
  const adapted = createRecipePreview({ recipe: source, dose: 14, ratio: '1:15', configuration: { sourceControls: { temperatureC: 94 } } });
  assert.equal(adapted.ratio, '1:15');
  assert.equal(adapted.temperature.value, 94);
  assert.deepEqual(adapted.sourceProjection.adaptation.controls, { ratio: 15, temperatureC: 94 });

  // A Firestore round trip reorders/clones maps; the next dose preview must
  // replay accepted controls instead of rebuilding from the original source.
  const reloaded = JSON.parse(JSON.stringify(adapted));
  const resized = createRecipePreview({ recipe: reloaded, dose: 20 });
  assert.equal(resized.coffeeGrams, 20);
  assert.equal(resized.ratio, '1:15');
  assert.equal(resized.temperature.value, 94);
  assert.equal(resized.waterGrams, 300);
  assert.deepEqual(resized.sourceProjection.adaptation.controls, { ratio: 15, temperatureC: 94 });
  assert.deepEqual(resized.sourceProjection.sourceSnapshot, sourceSnapshot);
  assert.deepEqual(resized.sourceProjection.stages.map((stage) => stage.trigger), originalTimes);
  assert.equal(resized.sourceProjection.water.unit, 'g');
  assert.equal(resized.sourceProjection.stages.at(-1).water.value, 300);
});

test('manual temperature controls honor the exact source-native unit across an active review', async () => {
  const canonical = generateManualSourceTechniqueOption('kurasu-wave-155-2023', {}, {
    device: 'kalita', variant: 'wave', size: '155', model: 'Wave', filter: 'wave-155', mode: 'hot', dose: 14,
  }).recipe;
  const activeReview = generateManualSourceTechniqueOption('onyx-monarch-wave-185', {}, {
    device: 'kalita', variant: 'wave', size: '185', model: 'Wave', filter: 'wave-185', mode: 'hot', dose: 25,
  }).recipe;
  const sourceHash = canonicalRecipeSnapshot(canonical, 'kalita_hot').recipeHash;
  const priorProposal = {
    type: 'recipe_proposal', id: 'review-onyx-185', status: 'proposed', coffeeId: 'coffee-1', slotKey: 'kalita_hot',
    sourceState: 'present', sourceHash, before: canonical, after: activeReview,
  };
  const makeTools = ({ recipe = canonical, prior = [priorProposal], displayName = 'hot Kalita 185' } = {}) => {
    const context = {
      userText: 'Make the water 2 degrees cooler.', sessionId: 'native-temperature-review', conversation: [],
      rotationSnapshot: { refs: { coffee: 'coffee-1' }, coffees: [{ refKey: 'coffee', name: 'Jar one', recipes: ['kalita_hot'] }], setup: {} },
      proposalState: { target: null, diagnosisReady: true, userAgreed: true, previewReady: true, proposalIssued: false },
      methodBinding: { status: 'locked', slot: 'kalita_hot', displayName, source: 'equipment-answer' },
      __ruphusPriorProposals: prior,
    };
    const tools = createRuphusTools({ uid: 'owner', context, readers: { readRecipe: async () => recipe } });
    return { context, tools };
  };

  const native = makeTools();
  const read = await native.tools.call('read_recipe', { coffeeRef: 'coffee', slot: 'kalita_hot' });
  assert.equal(read.recipe.temperature.value, canonical.temperature.value, 'canonical read remains independent from the active Onyx review');
  assert.equal(read.recipe.temperature.unit, 'C');
  assert.deepEqual(read.sourceControls, { allowedControls: ['ratio', 'temperature', 'servingDoseGrams'], servingDoseGrams: [12, 20] });
  assert.equal(read.currentReview.editable, true);
  assert.equal(read.currentReview.size, '185');
  assert.deepEqual(read.currentReview.recipe.temperature, activeReview.temperature, 'the provider sees the editable review temperature, not only canonical saved state');
  assert.deepEqual(read.currentReview.sourceControls, { allowedControls: ['ratio', 'temperature', 'grind', 'servingDoseGrams'], servingDoseGrams: [15, 36], temperatureUnit: 'F' });
  assert.deepEqual(read.currentReview.bounds, { ratio: [10, 25], temperature: [194, 212], temperatureC: [90, 100], grindMicrons: [300, 1200], servingDoseGrams: [15, 36] });

  const proposal = await native.tools.call('propose_recipe_change', {
    coffeeRef: 'coffee', slot: 'kalita_hot', intent: 'recipe_preview',
    change: { control: 'temperature', value: 198 }, servingDoseGrams: null,
    aidenProfile: null, experiment: null, explanation: null,
  });
  assert.equal(proposal.ok, true, JSON.stringify(proposal));
  assert.deepEqual(proposal.artifact.after.temperature, { value: 198, unit: 'F' });
  assert.equal(proposal.artifact.after.sourceProjection.adaptation.controls.temperatureC, 92.22);
  assert.deepEqual(proposal.artifact.after.sourceProjection.sourceSnapshot, activeReview.sourceProjection.sourceSnapshot);
  assert.deepEqual(proposal.artifact.after.sourceProjection.stages.map((stage) => stage.trigger), activeReview.sourceProjection.stages.map((stage) => stage.trigger));
  assert.deepEqual(proposal.artifact.after.sourceProjection.stages.map((stage) => stage.water.value), activeReview.sourceProjection.stages.map((stage) => stage.water.value));

  // The projection primitive remains canonical-Celsius internally; this
  // equivalence check proves the tool's native 198°F input reaches the same
  // adapter result without treating 198 as Celsius.
  const equivalent = createRecipePreview({
    recipe: activeReview, dose: 25, configuration: { sourceControls: { temperatureC: 92.22 } }, allowIced: true,
  });
  assert.deepEqual(equivalent.temperature, { value: 198, unit: 'F' });
  assert.equal(equivalent.sourceProjection.adaptation.controls.temperatureC, 92.22);
});

test('source grind reads and edits agree on physical Ode clicks, not tiny micron changes', async () => {
  const recipe = generateManualSourceTechniqueOption('onyx-monarch-wave-185', {
    grindAdjustmentMicrons: -20,
    evidenceHash: 'journey-density-evidence',
    reasonCodes: ['HIGH_DENSITY_TEST'],
  }, {
    device: 'kalita', variant: 'wave', size: '185', model: 'Wave', filter: 'wave-185', mode: 'hot', dose: 23,
    grinder: 'fellow-ode-gen2',
  }).recipe;
  const sourceProjectionHash = canonicalHash(recipe.sourceProjection);
  const context = {
    userText: 'One click finer please', sessionId: 'source-click', conversation: [],
    rotationSnapshot: { refs: { coffee: 'coffee-1' }, coffees: [{ refKey: 'coffee', name: 'Jar one', recipes: ['kalita_hot'] }], setup: { grinder: 'fellow-ode-gen2' } },
    proposalState: { target: null, diagnosisReady: true, userAgreed: true, previewReady: true, proposalIssued: false },
    methodBinding: { status: 'locked', slot: 'kalita_hot', displayName: 'hot Kalita 185', source: 'equipment-answer' },
  };
  const tools = createRuphusTools({ uid: 'owner', context, readers: { readRecipe: async () => recipe } });
  const read = await tools.call('read_recipe', { coffeeRef: 'coffee', slot: 'kalita_hot' });
  assert.equal(read.grinderGuidance.setting, recipe.grindSize.setting);
  assert.equal(read.grinderGuidance.oneClickFiner, 4);
  const propose = (value) => tools.call('propose_recipe_change', {
    coffeeRef: 'coffee', slot: 'kalita_hot', intent: 'recipe_preview',
    change: { control: 'grind', value }, servingDoseGrams: null,
    aidenProfile: null, experiment: null, explanation: null,
  });
  assert.equal((await propose(4.3)).code, 'invalid_grind_step');
  assert.equal((await propose(recipe.grindSize.microns)).code, 'unchanged_grind_step');
  const result = await propose(4);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.artifact.after.sourceProjection.grind.microns, 541);
  assert.equal(result.artifact.after.grindSize.setting, '4');
  assert.equal(result.artifact.after.sourceLineage.grindAdaptation.targetMicrons, 541);
  assert.deepEqual(result.artifact.after.sourceProjection.sourceSnapshot, recipe.sourceProjection.sourceSnapshot);
  assert.deepEqual(result.artifact.after.sourceProjection.stages, recipe.sourceProjection.stages);
  assert.equal(canonicalHash(recipe.sourceProjection), sourceProjectionHash);

  const resized = createRecipePreview({ recipe: result.artifact.after, dose: 25, configuration: { grinder: 'fellow-ode-gen2' } });
  assert.equal(resized.grindSize.setting, '4');
  assert.equal(resized.sourceLineage.grindAdaptation.targetMicrons, 541);
  assert.deepEqual(resized.sourceProjection.sourceSnapshot, recipe.sourceProjection.sourceSnapshot);
});

test('volume-native Switch ratio adaptation changes only native mL checkpoints and keeps valve events', () => {
  const source = generateManualSourceTechniqueOption('hario-switch-03-instruction-manual-36-2023', {}, {
    device: 'v60', variant: 'switch', size: '03', model: 'V60 Switch', filter: 'v60-03-paper', material: 'glass', mode: 'hot', dose: 36,
  }).recipe;
  const sourceSnapshot = structuredClone(source.sourceProjection.sourceSnapshot);
  const adapted = createRecipePreview({ recipe: source, dose: 20, ratio: '1:15' });
  assert.equal(adapted.waterMilliliters, 300);
  assert.equal(adapted.waterGrams, undefined);
  assert.equal(adapted.sourceProjection.water.unit, 'mL');
  assert.equal(adapted.sourceProjection.stages[0].water.value, 300);
  assert.equal(adapted.sourceProjection.stages[0].water.unit, 'mL');
  assert.match(adapted.sourceProjection.stages[0].label, /300mL/);
  assert.deepEqual(adapted.sourceProjection.stages.map((stage) => stage.valve), source.sourceProjection.stages.map((stage) => stage.valve));
  assert.deepEqual(adapted.sourceProjection.sourceSnapshot, sourceSnapshot);
  const reloaded = createRecipePreview({ recipe: JSON.parse(JSON.stringify(adapted)), dose: 15 });
  assert.equal(reloaded.waterMilliliters, 225);
  assert.equal(reloaded.waterGrams, undefined);
  assert.equal(reloaded.sourceProjection.adaptation.controls.ratio, 15);
  assert.deepEqual(reloaded.sourceProjection.sourceSnapshot, sourceSnapshot);
});

test('volume-native ratio adaptation cannot exceed its verified source input load', () => {
  const source = generateManualSourceTechniqueOption('hario-switch-03-instruction-manual-36-2023', {}, {
    device: 'v60', variant: 'switch', size: '03', model: 'V60 Switch', filter: 'v60-03-paper', material: 'glass', mode: 'hot', dose: 36,
  }).recipe;
  assert.throws(
    () => createRecipePreview({ recipe: source, dose: 20, ratio: 25 }),
    (error) => error.code === 'source-capacity-exceeded',
  );
});

test('qualitative source grind stays source-native and cannot invent Ode calibration', () => {
  const source = generateManualSourceTechniqueOption('kurasu-wave-155-2023', {}, {
    device: 'kalita', variant: 'wave', size: '155', model: 'Wave', filter: 'wave-155', mode: 'hot', dose: 14,
  }).recipe;
  assert.throws(
    () => createRecipePreview({ recipe: source, dose: 14, configuration: { sourceControls: { grind: 6 } } }),
    (error) => error.code === 'source-grind-adaptation-unsupported',
  );
});

test('preview endpoint reconstructs accepted source controls before applying a later dose', async () => {
  const owner = 'source-endpoint-adaptation-owner';
  const coffeeId = 'source-endpoint-adaptation-coffee';
  const source = generateManualSourceTechniqueOption('kurasu-wave-155-2023', {}, {
    device: 'kalita', variant: 'wave', size: '155', model: 'Wave', filter: 'wave-155', mode: 'hot', dose: 14,
  }).recipe;
  const repository = createMemoryRuphusRepository({ clock: () => 1_789_000_000_000 });
  repository.seedBean(owner, { id: coffeeId, ownerId: owner, name: 'Endpoint Bean', handBrewRecipes: { kalita: source } });
  const context = {
    userText: 'Make this stronger.', sessionId: 'source-endpoint-adaptation', conversation: [],
    rotationSnapshot: { refs: { coffee: coffeeId }, coffees: [{ refKey: 'coffee', name: 'Endpoint Bean', recipes: ['kalita_hot'] }], setup: {} },
    proposalState: { target: null, diagnosisReady: true, userAgreed: true, previewReady: true, proposalIssued: false },
  };
  const tools = createRuphusTools({
    uid: owner, context, readers: { readRecipe: async () => source },
    proposalStore: (input) => repository.createProposal(input), proposalActions: ['apply_proposal', 'brew_once', 'keep_current'],
  });
  await tools.call('read_recipe', { coffeeRef: 'coffee', slot: 'kalita_hot' });
  const proposalResult = await tools.call('propose_recipe_change', {
    coffeeRef: 'coffee', slot: 'kalita_hot', intent: 'recipe_preview', change: { control: 'ratio', value: 15 },
    servingDoseGrams: null, experiment: null, explanation: null,
  });
  assert.equal(proposalResult.ok, true, JSON.stringify(proposalResult));
  const firestore = firestoreFromSnapshot(repository.snapshot(), owner);
  const previousAllowlist = process.env.RUPHUS_AGENT_V3_UIDS;
  process.env.RUPHUS_AGENT_V3_UIDS = owner;
  try {
    const result = response();
    await handleRecipePreview({ method: 'POST', body: {
      requestId: 'source-endpoint-dose-20', proposalId: proposalResult.proposal.id, coffeeId, slotKey: 'kalita_hot', sessionId: context.sessionId, dose: 20,
    } }, result, { uid: owner }, { db: firestore.db });
    assert.equal(result.statusCode, 200, JSON.stringify(result.body));
    assert.equal(result.body.preview.sourceProjection.adaptation.controls.ratio, 15);
    assert.equal(result.body.preview.coffeeGrams, 20);
    assert.equal(result.body.preview.waterGrams, 300);
    assert.equal(result.body.preview.temperature.value, source.temperature.value);
    assert.deepEqual(result.body.preview.sourceProjection.sourceSnapshot, source.sourceProjection.sourceSnapshot);
    const brewed = await executeRecipeCommand({
      db: firestore.db, uid: owner, coffeeId, slotKey: 'kalita_hot',
      actionId: 'personalized-grinder-brew', mode: 'brew_once',
      proposalId: result.body.proposal.id,
      expectedRevisionId: result.body.proposal.sourceRevisionId,
    });
    assert.deepEqual(brewed.attempt.snapshot.grindSize, result.body.preview.grindSize);
    assert.deepEqual(brewed.attempt.snapshot.sourceLineage.grindAdaptation, result.body.preview.sourceLineage.grindAdaptation);
    assert.deepEqual(brewed.attempt.snapshot.sourceProjection, result.body.preview.sourceProjection);
    assert.deepEqual(firestore.data.get(`${firestore.root}/beans/${coffeeId}`).handBrewRecipes.kalita, source);
  } finally {
    if (previousAllowlist == null) delete process.env.RUPHUS_AGENT_V3_UIDS;
    else process.env.RUPHUS_AGENT_V3_UIDS = previousAllowlist;
  }
});

test('preview endpoint preserves the reviewed source grind target while changing grinder quantization', async () => {
  const owner = 'source-endpoint-grinder-owner';
  const coffeeId = 'source-endpoint-grinder-coffee';
  const source = generateManualSourceTechniqueOption('onyx-monarch-wave-185', {
    grindAdjustmentMicrons: -20,
    evidenceHash: 'endpoint-grinder-evidence',
    reasonCodes: ['HIGH_DENSITY_TEST'],
  }, {
    device: 'kalita', variant: 'wave', size: '185', model: 'Wave', filter: 'wave-185', mode: 'hot', dose: 25,
    grinder: 'fellow-ode-gen2',
  }).recipe;
  const repository = createMemoryRuphusRepository({ clock: () => 1_789_000_000_100 });
  repository.seedBean(owner, { id: coffeeId, ownerId: owner, name: 'Endpoint Grinder Bean', handBrewRecipes: { kalita: source } });
  const context = {
    userText: 'Make this stronger.', sessionId: 'source-endpoint-grinder', conversation: [],
    rotationSnapshot: { refs: { coffee: coffeeId }, coffees: [{ refKey: 'coffee', name: 'Endpoint Grinder Bean', recipes: ['kalita_hot'] }], setup: { grinder: 'fellow-ode-gen2' } },
    proposalState: { target: null, diagnosisReady: true, userAgreed: true, previewReady: true, proposalIssued: false },
  };
  const tools = createRuphusTools({
    uid: owner, context, readers: { readRecipe: async () => source },
    proposalStore: (input) => repository.createProposal(input), proposalActions: ['apply_proposal', 'brew_once', 'keep_current'],
  });
  await tools.call('read_recipe', { coffeeRef: 'coffee', slot: 'kalita_hot' });
  const proposalResult = await tools.call('propose_recipe_change', {
    coffeeRef: 'coffee', slot: 'kalita_hot', intent: 'recipe_preview', change: { control: 'ratio', value: 15 },
    servingDoseGrams: null, experiment: null, explanation: null,
  });
  assert.equal(proposalResult.ok, true, JSON.stringify(proposalResult));
  const firestore = firestoreFromSnapshot(repository.snapshot(), owner);
  const previousAllowlist = process.env.RUPHUS_AGENT_V3_UIDS;
  process.env.RUPHUS_AGENT_V3_UIDS = owner;
  try {
    const result = response();
    await handleRecipePreview({ method: 'POST', body: {
      requestId: 'source-endpoint-grinder-opus', proposalId: proposalResult.proposal.id, coffeeId, slotKey: 'kalita_hot',
      sessionId: context.sessionId, dose: 25, configuration: { grinder: 'fellow-opus' },
    } }, result, { uid: owner }, { db: firestore.db });
    assert.equal(result.statusCode, 200, JSON.stringify(result.body));
    assert.equal(result.body.preview.sourceLineage.grindAdaptation.targetMicrons, 580);
    assert.equal(result.body.preview.sourceLineage.grindAdaptation.grinder, 'fellow-opus');
    assert.notEqual(result.body.preview.grindSize.setting, source.grindSize.setting);
    assert.deepEqual(result.body.preview.sourceProjection.sourceSnapshot, source.sourceProjection.sourceSnapshot);
  } finally {
    if (previousAllowlist == null) delete process.env.RUPHUS_AGENT_V3_UIDS;
    else process.env.RUPHUS_AGENT_V3_UIDS = previousAllowlist;
  }
});

const CASES = [
  {
    label: 'Kalita Wave 155',
    uid: 'source-journey-kalita-owner',
    coffeeId: 'source-journey-kalita-coffee',
    slotKey: 'kalita_hot',
    currentSourceId: 'kurasu-wave-155-2023',
    alternativeSourceId: 'art-of-brew-wave-155-pulse-2024',
    configuration: { device: 'kalita', variant: 'wave', size: '155', model: 'Wave', filter: 'wave-155', mode: 'hot' },
    dose: 14,
    previewDose: 20,
    nativeWaterKey: 'waterGrams',
    nativeWater: 320,
    wrongWaterKey: 'waterMilliliters',
    wrongSize: '185',
  },
  {
    label: 'HARIO Switch 03',
    uid: 'source-journey-switch-owner',
    coffeeId: 'source-journey-switch-coffee',
    slotKey: 'v60_hot',
    currentSourceId: 'hario-switch-03-matt-winton-hybrid-24-2022',
    alternativeSourceId: 'hario-switch-03-instruction-manual-36-2023',
    configuration: { device: 'v60', variant: 'switch', size: '03', model: 'V60 Switch', filter: 'v60-03-paper', material: 'glass', mode: 'hot' },
    dose: 24,
    previewDose: 20,
    nativeWaterKey: 'waterMilliliters',
    nativeWater: 244.44,
    wrongWaterKey: 'waterGrams',
    wrongSize: '02',
  },
];

function queryRef(collectionPath, filters = []) {
  return {
    kind: 'query',
    collectionPath,
    filters,
    where(field, operator, value) {
      return queryRef(collectionPath, [...filters, { field, operator, value }]);
    },
  };
}

function firestoreFromData(data, uid) {
  const root = `users/${uid}`;
  const readField = (value, field) => field.split('.').reduce((current, key) => current?.[key], value);
  const ref = (path) => ({
    path,
    id: path.split('/').at(-1),
    collection: (name) => ref(`${path}/${name}`),
    doc: (id) => ref(`${path}/${id}`),
    get: async () => {
      const value = data.get(path);
      return { exists: data.has(path), id: path.split('/').at(-1), data: () => structuredClone(value) };
    },
    where: (field, operator, value) => queryRef(path, [{ field, operator, value }]),
  });
  const db = {
    collection: (name) => ref(name),
    runTransaction: async (callback) => {
      const pending = [];
      const tx = {
        get: async (target) => {
          if (target.kind === 'query') {
            const prefix = `${target.collectionPath}/`;
            const docs = [...data.entries()]
              .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
              .map(([path, value]) => ({ id: path.split('/').at(-1), ref: ref(path), data: () => structuredClone(value) }))
              .filter((doc) => target.filters.every(({ field, operator, value }) => operator === '==' && readField(doc.data(), field) === value));
            return { docs };
          }
          const value = data.get(target.path);
          return { exists: data.has(target.path), id: target.id, data: () => structuredClone(value) };
        },
        create: (target, value) => {
          assert.equal(data.has(target.path), false, `transaction create collided at ${target.path}`);
          pending.push([target.path, structuredClone(value)]);
        },
        set: (target, value) => pending.push([target.path, structuredClone(value)]),
        update: (target, value) => pending.push([target.path, { ...(data.get(target.path) || {}), ...structuredClone(value) }]),
      };
      const result = await callback(tx);
      pending.forEach(([path, value]) => data.set(path, value));
      return result;
    },
  };
  return { db, data, root };
}

function firestoreFromSnapshot(snapshot, uid) {
  const root = `users/${uid}`;
  const data = new Map();
  for (const collection of ['beans', 'proposals', 'revisions', 'attempts', 'receipts', 'actions']) {
    const key = collection === 'revisions' ? 'revisions' : collection;
    const path = collection === 'revisions' ? 'recipeRevisions' : collection === 'attempts' ? 'brewAttempts' : collection;
    for (const value of snapshot[key] || []) data.set(`${root}/${path}/${value.id}`, structuredClone(value));
  }
  return firestoreFromData(data, uid);
}

function cloneFirestore(source, uid) {
  return firestoreFromData(new Map([...source.data.entries()].map(([path, value]) => [path, structuredClone(value)])), uid);
}

function response() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return value; },
  };
}

function commandFor(caseData, fields) {
  return { coffeeId: caseData.coffeeId, slotKey: caseData.slotKey, ...fields };
}

async function createSourceProposal(caseData) {
  const current = generateManualSourceTechniqueOption(caseData.currentSourceId, {}, { ...caseData.configuration, dose: caseData.dose }).recipe;
  assert.equal(validateManualSourceRecipeSnapshot(current).valid, true);
  const repository = createMemoryRuphusRepository({ clock: () => 1_789_000_000_000 });
  repository.seedBean(caseData.uid, {
    id: caseData.coffeeId,
    ownerId: caseData.uid,
    handBrewRecipes: { [caseData.slotKey.startsWith('kalita') ? 'kalita' : 'v60']: current },
    handBrewRecipe: current,
  });
  const context = {
    userText: `Show me a different technique for this ${caseData.label} recipe.`,
    conversation: [],
    ledger: { entries: [] },
    sessionId: `source-journey-${caseData.slotKey}`,
    rotationSnapshot: { coffees: [{ refKey: 'c1', name: 'Journey Bean', recipes: [caseData.slotKey] }], refs: { c1: caseData.coffeeId } },
    __ruphusRefs: { c1: caseData.coffeeId },
    proposalState: { target: null, diagnosisReady: false, userAgreed: false, proposalIssued: false },
  };
  const tools = createRuphusTools({
    uid: caseData.uid,
    context,
    readers: {
      readRecipe: async ({ coffeeId, slotKey }) => repository.getBean(caseData.uid, coffeeId).handBrewRecipes[slotKey.startsWith('kalita') ? 'kalita' : 'v60'],
    },
    proposalStore: async (input) => repository.createProposal(input),
    proposalActions: ['apply_proposal', 'brew_once', 'keep_current'],
  });
  const options = await tools.call('read_technique_options', { coffeeRef: 'c1', slot: caseData.slotKey });
  assert.equal(options.ok, true, `${caseData.label}: technique options failed`);
  assert.equal(options.actionable, true, `${caseData.label}: no actionable alternative`);
  const selected = options.options.find((option) => option.sourceId === caseData.alternativeSourceId);
  assert.ok(selected, `${caseData.label}: expected source option was not offered`);
  assert.equal(selected.executable, true);
  const proposalResult = await tools.call('propose_recipe_change', {
    coffeeRef: 'c1',
    slot: caseData.slotKey,
    change: null,
    experiment: { kind: 'manual_source_technique', sourceId: selected.sourceId },
  });
  assert.equal(proposalResult.ok, true, `${caseData.label}: source proposal failed: ${proposalResult.message || proposalResult.code}`);
  assert.equal(proposalResult.artifact.after.sourceProjection.sourceId, caseData.alternativeSourceId);
  const sourceProposal = repository.getProposal(caseData.uid, proposalResult.artifact.id);
  assert.ok(sourceProposal);
  assert.equal(sourceProposal.status, 'proposed');
  assert.equal(sourceProposal.before.sourceProjection.sourceId, caseData.currentSourceId);
  assert.equal(sourceProposal.after.sourceProjection.sourceId, caseData.alternativeSourceId);
  return { repository, current, context, sourceProposal };
}

async function runJourney(caseData) {
  const { repository, current, context, sourceProposal } = await createSourceProposal(caseData);
  const firestore = firestoreFromSnapshot(repository.snapshot(), caseData.uid);
  const originalSaved = structuredClone(sourceProposal.before);
  const beanPath = `${firestore.root}/beans/${caseData.coffeeId}`;
  const proposalPath = `${firestore.root}/proposals/${sourceProposal.id}`;
  const initialRevisionId = sourceProposal.sourceRevisionId;
  const previousAllowlist = process.env.RUPHUS_AGENT_V3_UIDS;
  process.env.RUPHUS_AGENT_V3_UIDS = caseData.uid;
  try {
    const previewRequest = {
      method: 'POST',
      body: {
        requestId: `${caseData.slotKey}-dose-${caseData.previewDose}`,
        proposalId: sourceProposal.id,
        coffeeId: caseData.coffeeId,
        slotKey: caseData.slotKey,
        sessionId: context.sessionId,
        dose: caseData.previewDose,
      },
    };
    const previewResponse = response();
    await handleRecipePreview(previewRequest, previewResponse, { uid: caseData.uid }, { db: firestore.db });
    assert.equal(previewResponse.statusCode, 200, `${caseData.label}: ${JSON.stringify(previewResponse.body)}`);
    assert.equal(previewResponse.body.serverValidated, true);
    assert.equal(previewResponse.body.saved, false);
    const preview = previewResponse.body.preview;
    assert.equal(preview.sourceProjection.sourceId, caseData.alternativeSourceId);
    assert.equal(preview.coffeeGrams, caseData.previewDose);
    assert.equal(preview[caseData.nativeWaterKey], caseData.nativeWater);
    assert.equal(Object.hasOwn(preview, caseData.wrongWaterKey), false);
    assert.equal(validateManualSourceRecipeSnapshot(preview).valid, true);
    assert.deepEqual(firestore.data.get(beanPath).handBrewRecipes[caseData.slotKey.startsWith('kalita') ? 'kalita' : 'v60'], current);

    // Preparation is idempotent and remains a draft; repeating the same
    // request does not create a second preview proposal or an attempt.
    const replayPreviewResponse = response();
    await handleRecipePreview(previewRequest, replayPreviewResponse, { uid: caseData.uid }, { db: firestore.db });
    assert.equal(replayPreviewResponse.statusCode, 200);
    assert.equal(replayPreviewResponse.body.proposal.id, previewResponse.body.proposal.id);
    assert.equal([...firestore.data.keys()].filter((path) => path.startsWith(`${firestore.root}/proposals/`)).length, 2);
    assert.equal([...firestore.data.keys()].filter((path) => path.startsWith(`${firestore.root}/brewAttempts/`)).length, 0);

    // A source hardware mismatch is rejected before server reconstruction.
    const wrongConfigurationResponse = response();
    await handleRecipePreview({
      method: 'POST',
      body: { ...previewRequest.body, requestId: `${caseData.slotKey}-wrong-size`, sourceConfiguration: { size: caseData.wrongSize } },
    }, wrongConfigurationResponse, { uid: caseData.uid }, { db: firestore.db });
    assert.equal(wrongConfigurationResponse.statusCode, 400);
    assert.equal(wrongConfigurationResponse.body.error, 'source_configuration_mismatch');

    // The proposal and its immutable after snapshot survive the brew command;
    // the active saved source remains unchanged until the later promotion.
    const brewCommand = commandFor(caseData, {
      actionId: `${caseData.slotKey}-journey-brew`,
      mode: 'brew_once',
      proposalId: previewResponse.body.proposal.id,
      expectedRevisionId: initialRevisionId,
    });
    const brewed = await executeRecipeCommand({ db: firestore.db, uid: caseData.uid, ...brewCommand });
    assert.equal(brewed.attempt.snapshot.sourceProjection.sourceId, caseData.alternativeSourceId);
    assert.equal(brewed.attempt.snapshot.coffeeGrams, caseData.previewDose);
    assert.equal(brewed.attempt.snapshot[caseData.nativeWaterKey], caseData.nativeWater);
    assert.deepEqual(brewed.attempt.snapshot, previewResponse.body.proposal.after);
    assert.deepEqual(firestore.data.get(beanPath).handBrewRecipes[caseData.slotKey.startsWith('kalita') ? 'kalita' : 'v60'], current);
    const replayBrew = await executeRecipeCommand({ db: firestore.db, uid: caseData.uid, ...brewCommand });
    assert.equal(replayBrew.attempt.id, brewed.attempt.id);
    assert.equal([...firestore.data.keys()].filter((path) => path.startsWith(`${firestore.root}/brewAttempts/`)).length, 1);

    const timerCommand = commandFor(caseData, {
      actionId: `${caseData.slotKey}-journey-timer`,
      mode: 'timer_started',
      attemptId: brewed.attempt.id,
      expectedRevisionId: initialRevisionId,
    });
    const timerStarted = await executeRecipeCommand({ db: firestore.db, uid: caseData.uid, ...timerCommand });
    assert.equal(timerStarted.attempt.status, 'timer_started');
    const replayTimer = await executeRecipeCommand({ db: firestore.db, uid: caseData.uid, ...timerCommand });
    assert.equal(replayTimer.attempt.id, timerStarted.attempt.id);
    assert.equal(replayTimer.attempt.status, 'timer_started');

    // Rebuild the injected DB from its persisted documents to model relaunch;
    // no provider, phone, or physical confirmation is involved.
    const recovered = cloneFirestore(firestore, caseData.uid);
    const completeCommand = commandFor(caseData, {
      actionId: `${caseData.slotKey}-journey-complete`,
      mode: 'complete_attempt',
      attemptId: brewed.attempt.id,
      expectedRevisionId: initialRevisionId,
    });
    const completed = await executeRecipeCommand({ db: recovered.db, uid: caseData.uid, ...completeCommand });
    assert.equal(completed.attempt.status, 'completed');
    assert.equal(completed.receipt.timerCompleted, true);
    assert.equal(completed.receipt.physicalBrewConfirmed, false);
    const replayComplete = await executeRecipeCommand({ db: recovered.db, uid: caseData.uid, ...completeCommand });
    assert.equal(replayComplete.attempt.id, completed.attempt.id);
    assert.equal(replayComplete.attempt.status, 'completed');

    const promoteCommand = commandFor(caseData, {
      actionId: `${caseData.slotKey}-journey-promote`,
      mode: 'promote_attempt',
      attemptId: completed.attempt.id,
      expectedRevisionId: initialRevisionId,
    });
    const promoted = await executeRecipeCommand({ db: recovered.db, uid: caseData.uid, ...promoteCommand });
    assert.equal(promoted.revision.snapshot.sourceProjection.sourceId, caseData.alternativeSourceId);
    assert.equal(promoted.revision.snapshot.coffeeGrams, caseData.previewDose);
    assert.equal(recovered.data.get(beanPath).handBrewRecipes[caseData.slotKey.startsWith('kalita') ? 'kalita' : 'v60'].coffeeGrams, caseData.previewDose);
    const replayPromote = await executeRecipeCommand({ db: recovered.db, uid: caseData.uid, ...promoteCommand });
    assert.equal(replayPromote.revision.id, promoted.revision.id);
    assert.equal([...recovered.data.keys()].filter((path) => path.startsWith(`${recovered.root}/recipeRevisions/`) && recovered.data.get(path)?.source === 'promote').length, 1);

    const undoCommand = commandFor(caseData, {
      actionId: `${caseData.slotKey}-journey-undo`,
      mode: 'undo_revision',
      expectedRevisionId: promoted.revision.id,
    });
    const undone = await executeRecipeCommand({ db: recovered.db, uid: caseData.uid, ...undoCommand });
    assert.deepEqual(undone.revision.snapshot, originalSaved);
    assert.deepEqual(recovered.data.get(beanPath).handBrewRecipes[caseData.slotKey.startsWith('kalita') ? 'kalita' : 'v60'], originalSaved);
    const replayUndo = await executeRecipeCommand({ db: recovered.db, uid: caseData.uid, ...undoCommand });
    assert.equal(replayUndo.revision.id, undone.revision.id);
    assert.equal([...recovered.data.keys()].filter((path) => path.startsWith(`${recovered.root}/recipeRevisions/`) && recovered.data.get(path)?.source === 'undo').length, 1);

    // Owner and base bindings fail closed on isolated stale copies and never
    // mutate the completed journey.
    await assert.rejects(
      () => executeRecipeCommand({ db: firestore.db, uid: `${caseData.uid}-other`, ...brewCommand }),
      (error) => error.code === 'not_found',
    );
    const stale = cloneFirestore(firestore, caseData.uid);
    const staleReplace = commandFor(caseData, {
      actionId: `${caseData.slotKey}-journey-stale-replace`,
      mode: 'replace_active_recipe',
      recipe: current,
      expectedRevisionId: initialRevisionId,
    });
    await executeRecipeCommand({ db: stale.db, uid: caseData.uid, ...staleReplace });
    const staleBrewCommand = { ...brewCommand, actionId: `${caseData.slotKey}-journey-stale-brew` };
    await assert.rejects(
      () => executeRecipeCommand({ db: stale.db, uid: caseData.uid, ...staleBrewCommand }),
      (error) => error.code === 'stale',
    );
    const stalePreviewResponse = response();
    await handleRecipePreview(previewRequest, stalePreviewResponse, { uid: caseData.uid }, { db: stale.db });
    assert.equal(stalePreviewResponse.statusCode, 409);
    assert.equal(stalePreviewResponse.body.error, 'stale');

    // Keep the source proposal available as an audit trail while the active
    // saved recipe is restored; endpoint preparation never claims a save.
    assert.equal(firestore.data.get(proposalPath).status, 'proposed');
    const previewProposalPath = `${firestore.root}/proposals/${previewResponse.body.proposal.id}`;
    assert.equal(firestore.data.get(previewProposalPath).status, 'attempt_created');
    assert.equal(recovered.data.get(`${recovered.root}/proposals/${sourceProposal.id}`).status, 'proposed');
    assert.equal(recovered.data.get(`${recovered.root}/proposals/${previewResponse.body.proposal.id}`).status, 'attempt_created');
  } finally {
    if (previousAllowlist == null) delete process.env.RUPHUS_AGENT_V3_UIDS;
    else process.env.RUPHUS_AGENT_V3_UIDS = previousAllowlist;
  }
}

for (const caseData of CASES) {
  test(`source journey: ${caseData.label}`, { concurrency: false }, async () => {
    await runJourney(caseData);
  });
}
