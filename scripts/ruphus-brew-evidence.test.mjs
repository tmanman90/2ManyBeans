import test from 'node:test';
import assert from 'node:assert/strict';
import { fruktFixture } from './fixtures/ruphus-frukt-brew.mjs';
import { projectBrewEvidence } from '../api/_lib/ruphusBrewEvidence.js';
import { readCoffeeEvidence, publicEvidence } from '../api/_lib/ruphusEvidence.js';
import { createRuphusTools } from '../api/_lib/ruphusTools.js';
import { canonicalRecipeSnapshot } from '../src/lib/ruphus/legacyRecipeResolver.js';
const now = Date.parse('2026-10-12T00:00:00Z');
export function harness() {
  const f = fruktFixture();
  const context = { userText: 'You don’t think it just needs to be ground finer?', rotationSnapshot: { coffees: [{ refKey: 'c1', ...f.coffee, recipes: ['kalita_hot'] }], refs: { c1: f.coffee.id }, setup: { grinder: 'fellow-ode-gen2' } }, proposalState: { diagnosisReady: true, userAgreed: true }, __ruphusPriorProposals: [{ type: 'recipe_proposal', id: 'untried', status: 'proposed', coffeeId: f.coffee.id, slotKey: 'kalita_hot', sourceHash: canonicalRecipeSnapshot(f.saved, 'kalita_hot').recipeHash, before: f.saved, after: f.untried }] };
  const readers = { readCoffee: async () => f.coffee, readRecipe: async () => f.saved, readAttempts: async () => [f.attempt], readTastings: async () => [] };
  const writes = [];
  const tools = createRuphusTools({ uid: 'fixture-owner', context, readers, proposalStore: async input => { writes.push(input); return { ...input, status: 'proposed' }; } });
  return { ...f, context, readers, tools, writes };
}
test('snapshot wins over source dose; measured timing and explicit feedback join without rewriting history', async () => {
  const h = harness();
  const original = structuredClone(h.attempt);
  const evidence = await readCoffeeEvidence({ uid: 'fixture-owner', coffeeId: h.coffee.id, readers: h.readers, now });
  assert.match(evidence.brews.summary, /completed.*18g, 279g, 6.2, 93°.*measured 3:24/);
  assert.deepEqual(h.attempt, original);
  assert.doesNotMatch(JSON.stringify(publicEvidence(evidence)), /fixture-attempt|snapshot|owner/);
  const projected = projectBrewEvidence([h.attempt], h.coffee.handBrewTimingMemory, [{ attemptId: h.attempt.id, notes: 'Better but still kind of thin' }, { notes: 'Unlinked bitter tasting' }]);
  assert.deepEqual(projected[0].feedback, ['Better but still kind of thin']);
});
test('never infer a measurement from target, wall time, mismatched dose, skipped or unrelated timing', () => {
  const { attempt, coffee } = fruktFixture();
  for (const event of [{ ...coffee.handBrewTimingMemory[0], attemptId: 'other' }, { ...coffee.handBrewTimingMemory[0], doseGrams: 24 }, { ...coffee.handBrewTimingMemory[0], completionKind: 'skipped' }]) assert.equal(projectBrewEvidence([attempt], [event])[0].actualElapsedMs, null);
  assert.equal(projectBrewEvidence([attempt], [coffee.handBrewTimingMemory[0], { ...coffee.handBrewTimingMemory[0], actualElapsedMs: 400000 }])[0].actualElapsedMs, null);
  assert.equal(projectBrewEvidence([{ ...attempt, status: 'started' }], coffee.handBrewTimingMemory)[0].actualElapsedMs, null);
});
test('completed baseline preserves executed 18/279, temperature and pours during finer grind experiment', async () => {
  const h = harness();
  const evidence = await h.tools.call('read_coffee_evidence', { coffeeRef: 'c1', slot: 'kalita_hot', now });
  assert.equal(evidence.recentBrews[0].recipe.coffeeGrams, 18);
  assert.equal(evidence.recentBrews[0].actualElapsedMs, 203813);
  assert.equal(evidence.recentBrews[0].timing.measuredElapsedSeconds, 204);
  assert.equal(evidence.recentBrews[0].timing.plannedTargetSeconds, 300);
  assert.equal(evidence.recentBrews[0].recipe.totalBrewTime, undefined);
  assert.equal(evidence.recentBrews[0].grinderGuidance.oneClickFiner, 6);
  assert.equal(evidence.currentReview.recipe.waterGrams, 348);
  const args = { coffeeRef: 'c1', slot: 'kalita_hot', intent: 'recipe_preview', change: { control: 'grind', value: 6 } };
  assert.equal((await h.tools.call('propose_recipe_change', args)).code, 'brew_baseline_required');
  assert.equal(h.writes.length, 0);
  const result = await h.tools.call('propose_recipe_change', { ...args, baseline: evidence.recentBrews[0].brewRef });
  assert.equal(result.ok, true, JSON.stringify(result));
  const { before, after } = result.artifact;
  assert.equal(after.coffeeGrams, 18); assert.equal(after.waterGrams, 279); assert.equal(after.ratio, '1:15.5');
  assert.equal(after.grindSize.setting, '6');
  for (const key of Object.keys(before).filter(key => key !== 'grindSize')) assert.deepEqual(after[key], before[key], key);
  assert.deepEqual(h.writes[0].after.steps, h.executed.steps);
});
test('draft editing remains explicit and separate from completed-brew diagnosis', async () => {
  const h = harness();
  await h.tools.call('read_recipe', { coffeeRef: 'c1', slot: 'kalita_hot', now });
  const result = await h.tools.call('propose_recipe_change', { coffeeRef: 'c1', slot: 'kalita_hot', intent: 'recipe_preview', baseline: 'current_review', change: { control: 'grind', value: 6 } });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.artifact.after.waterGrams, 348);
});
test('unknown and uncompleted brew references cannot become experiment baselines', async () => {
  const h = harness(); h.attempt.status = 'started';
  await h.tools.call('read_recipe', { coffeeRef: 'c1', slot: 'kalita_hot', now });
  for (const baseline of ['brew-1', 'foreign-brew']) assert.equal((await h.tools.call('propose_recipe_change', { coffeeRef: 'c1', slot: 'kalita_hot', baseline, change: { control: 'grind', value: 6 } })).code, 'brew_baseline_unavailable');
  assert.equal(h.writes.length, 0);
});
test('newest brews survive the four-record evidence limit regardless of database order', async () => {
  const h = harness();
  const older = Array.from({ length: 6 }, (_, index) => ({ ...h.attempt, id: `old-${index}`, completedAt: `2026-10-0${index + 1}T00:00:00Z` }));
  h.readers.readAttempts = async () => [...older, h.attempt];
  const evidence = await readCoffeeEvidence({ uid: 'fixture-owner', coffeeId: h.coffee.id, readers: h.readers, now });
  assert.equal(evidence.brews.records[0].id, h.attempt.id);
  assert.equal(evidence.brews.records.length, 4);
});
test('opaque brew references remain stable across reads and cannot cross equipment or coffee scope', async () => {
  const h = harness();
  const first = await h.tools.call('read_coffee_evidence', { coffeeRef: 'c1', slot: 'kalita_hot', now });
  const second = await h.tools.call('read_recipe', { coffeeRef: 'c1', slot: 'kalita_hot', now });
  assert.equal(first.recentBrews[0].brewRef, second.recentBrews[0].brewRef);
  h.context.methodBinding = { status: 'locked', source: 'M1', slot: 'kalita_hot', displayName: 'hot Kalita 155' };
  await h.tools.call('read_recipe', { coffeeRef: 'c1', slot: 'kalita_hot', now });
  const result = await h.tools.call('propose_recipe_change', { coffeeRef: 'c1', slot: 'kalita_hot', baseline: first.recentBrews[0].brewRef, change: { control: 'grind', value: 6 } });
  assert.equal(result.code, 'brew_baseline_unavailable');
  await assert.rejects(h.tools.call('propose_recipe_change', { coffeeRef: 'foreign', slot: 'kalita_hot', baseline: first.recentBrews[0].brewRef, change: { control: 'grind', value: 6 } }), { code: 'cross_owner_or_context' });
});
test('one-control trial cannot silently pair a serving resize with grind', async () => {
  const h = harness();
  const evidence = await h.tools.call('read_recipe', { coffeeRef: 'c1', slot: 'kalita_hot', now });
  const result = await h.tools.call('propose_recipe_change', { coffeeRef: 'c1', slot: 'kalita_hot', baseline: evidence.recentBrews[0].brewRef, intent: 'recipe_preview', servingDoseGrams: 24, change: { control: 'grind', value: 6 } });
  assert.equal(result.code, 'one_change_required'); assert.equal(h.writes.length, 0);
});
test('timing must match coffee, brewer, equipment, lineage, session and revision', () => {
  const { attempt, coffee } = fruktFixture(); const event = coffee.handBrewTimingMemory[0];
  for (const patch of [
    { beanId: 'other-coffee' }, { device: 'v60' }, { kalitaSize: '155' }, { mode: 'iced' },
    { configurationKey: 'other-configuration' }, { sessionId: 'other-session' },
    { doseGrams: null }, { lineage: null }, { lineage: { ...event.lineage, rulesVersion: 'other-rules' } },
    { lineage: { ...event.lineage, sourceContextHash: 'other-source' } },
  ]) assert.equal(projectBrewEvidence([attempt], [{ ...event, ...patch }])[0].actualElapsedMs, null, JSON.stringify(patch));
  assert.equal(projectBrewEvidence([{ ...attempt, revisionId: 'expected-revision' }], [{ ...event, revisionId: 'wrong' }])[0].actualElapsedMs, null);
});
test('other brewers and equipment cannot crowd out the completed diagnostic baseline', async () => {
  for (const readName of ['read_coffee_evidence', 'read_recipe']) {
    const h = harness();
    h.context.userText = 'Could grinding finer help my last Kalita 185 cup?';
    h.context.methodBinding = { status: 'locked', source: 'M1', slot: 'kalita_hot', displayName: 'hot Kalita 185' };
    const newer = Array.from({ length: 8 }, (_, index) => ({ ...h.attempt, id: `other-${index}`, slotKey: index < 4 ? 'aiden' : 'kalita_hot', snapshot: { ...h.executed, kalitaSize: '155' }, completedAt: '2026-10-11T23:59:00Z' }));
    h.readers.readAttempts = async () => [...newer, h.attempt];
    const evidence = await h.tools.call(readName, { coffeeRef: 'c1', slot: 'kalita_hot', now });
    assert.equal(evidence.recentBrews.length, 1);
    assert.equal(evidence.recentBrews[0].recipe.kalitaSize, '185');
    assert.equal(evidence.recentBrews[0].recipe.waterGrams, 279);
    assert.doesNotMatch(JSON.stringify(evidence), /projectedRecords|fixture-attempt|other-7/);
    const result = await h.tools.call('propose_recipe_change', { coffeeRef: 'c1', slot: 'kalita_hot', intent: 'recipe_preview', change: { control: 'grind', value: 6 } });
    assert.equal(result.code, 'brew_baseline_required'); assert.equal(h.writes.length, 0);
  }
});
