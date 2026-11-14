import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSeedPlan, assertDevTarget, createFirestoreSessionReset, executableFixtureRecipe, fixtureAttemptCleanup, rewriteRelativeDates, seedFixture } from './seed-ruphus-dev-fixture.mjs';
import { validateExecutableRecipe } from '../src/lib/ruphus/legacyRecipeResolver.js';
import { buildProposal } from '../api/_lib/ruphusRepository.js';
import { loadFixtureManifest } from './ruphus-conversation-runner.mjs';

test('fixture seeding fails closed outside an explicitly authorized Dev target', () => {
  assert.throws(() => assertDevTarget({ projectId: 'coffee-prod', fixtureUid: 'fixture', authorized: true }), /non-Dev/);
  assert.throws(() => assertDevTarget({ projectId: 'coffee-dev', fixtureUid: 'fixture', authorized: false }), /authorization/);
  assert.equal(assertDevTarget({ projectId: 'coffee-dev', fixtureUid: 'fixture-account', authorized: true }), true);
});

test('conversation reset removes only extra attempts in the verified fixture, preserving frozen history', () => {
  const prefix = 'projects/coffee-dev/databases/(default)/documents/users/fixture-account/brewAttempts/';
  const input = { projectId: 'coffee-dev', fixtureUid: 'fixture-account', authorized: true, profile: { subscription: { source: 'ruphus-dev-fixture' } }, account: { brews: [{ id: 'brew' }], attempts: [{ id: 'attempt' }] }, documents: ['brew', 'attempt', 'previous-ui-trial'].map(id => ({ name: prefix + id })) };
  assert.deepEqual(fixtureAttemptCleanup(input), [prefix + 'previous-ui-trial']);
  assert.throws(() => fixtureAttemptCleanup({ ...input, profile: {} }), /dedicated fixture/);
  assert.throws(() => fixtureAttemptCleanup({ ...input, authorized: false }), /authorization/);
  assert.throws(() => fixtureAttemptCleanup({ ...input, documents: [...input.documents, { name: prefix.replace('fixture-account', 'owner-account') + 'trial' }] }), /foreign document/);
  assert.throws(() => fixtureAttemptCleanup({ ...input, documents: [{ name: prefix + 'trial/child' }] }), /foreign document/);
});

test('relative fixture dates are rewritten from one run clock and seed plan is idempotent-shaped', () => {
  const now = new Date('2026-08-30T12:00:00.000Z');
  assert.equal(rewriteRelativeDates({ date: '-2d' }, now).date, '2026-08-28T12:00:00.000Z');
  const account = { manifestVersion: 1, manifestHash: 'hash', setup: { grinder: 'Ode' }, coffees: [{ id: 'c1', name: 'Coffee' }], recipes: { 'c1:v60': { id: 'r1' } }, brews: [{ id: 'b1' }], tastings: [], attempts: [] };
  const plan = buildSeedPlan(account, { fixtureUid: 'fixture-account', now });
  assert.equal(plan[0].path, 'users/fixture-account');
  assert.equal(plan.some((operation) => operation.path.endsWith('/recipeRevisions/c1:v60')), true);
  assert.equal(plan.some((operation) => operation.path.endsWith('/beans/c1')), true);
  assert.equal(plan.some((operation) => operation.path.endsWith('/brewAttempts/b1')), true);
  assert.deepEqual(plan[0].data.subscription, {
    status: 'active',
    plan: 'pro-dev-fixture',
    expiresAt: '2026-09-06T12:00:00.000Z',
    source: 'ruphus-dev-fixture',
  });
  assert.equal(plan.every((operation) => !JSON.stringify(operation).includes('token')), true);
});

test('seedFixture verifies the frozen account before creating writes', async () => {
  const result = await seedFixture({ projectId: 'coffee-dev', fixtureUid: 'fixture-account', authorized: true });
  assert.equal(result.dryRun, true);
  assert.equal(typeof result.manifestHash, 'string');
  assert.ok(result.operations.length > 1);
});

test('seed plan feeds the production reader collection names and revision shape', () => {
  const account = { setup: { defaultMethod: 'v60_hot', grinder: 'Ode', units: 'metric' }, coffees: [{ id: 'c1' }], recipes: { 'c1:v60_hot': { slot: 'v60_hot', dose: 15 } }, tastings: [{ id: 't1', coffeeId: 'c1' }], brews: [{ id: 'b1', coffeeId: 'c1' }], attempts: [] };
  const rows = new Map(buildSeedPlan(account, { fixtureUid: 'fixture-account' }).map((item) => [item.path, item.data]));
  assert.equal(rows.get('users/fixture-account/beans/c1').id, 'c1');
  assert.deepEqual(rows.get('users/fixture-account/beans/c1').activeRevisionIds, { v60_hot: 'c1:v60_hot' });
  assert.equal(rows.get('users/fixture-account/recipeRevisions/c1:v60_hot').coffeeId, 'c1');
  assert.equal(rows.get('users/fixture-account/recipeRevisions/c1:v60_hot').id, 'c1:v60_hot');
  assert.equal(rows.get('users/fixture-account/recipeRevisions/c1:v60_hot').slotKey, 'v60_hot');
  assert.deepEqual(rows.get('users/fixture-account/beans/c1').handBrewRecipes.v60, rows.get('users/fixture-account/recipeRevisions/c1:v60_hot').snapshot, 'Command drift checks require the same saved projection and revision');
  assert.equal(rows.get('users/fixture-account/tastings/t1').beanId, 'c1');
  assert.equal(rows.get('users/fixture-account/brewAttempts/b1').coffeeId, 'c1');
  const profile = rows.get('users/fixture-account');
  assert.deepEqual(Object.keys(profile).sort(), ['displayName', 'preferences', 'subscription', 'username']);
  assert.equal(profile.username, null);
  assert.equal(profile.subscription.source, 'ruphus-dev-fixture');
  assert.deepEqual(rows.get('users/fixture-account').preferences, { brewMethod: 'v60_hot', grinder: 'Ode', units: 'metric' });
  assert.equal(rows.get('users/fixture-account').subscription.plan, 'pro-dev-fixture');
});

test('Dev hand-brew fixtures become complete executable revision snapshots', () => {
  const sparse = { slot: 'kalita_hot', dose: 15, water: 250, grind: 'Ode 4.2', temperature: 94, ratio: '1:16.7' };
  const recipe = executableFixtureRecipe(sparse, 'kalita_hot');
  assert.equal(recipe.coffeeGrams, 15);
  assert.equal(recipe.waterGrams, 250);
  assert.equal(recipe.grindSize.setting, '4.2');
  assert.equal(recipe.steps.at(-1).waterTotal, 250);
  assert.equal(validateExecutableRecipe(recipe, 'kalita_hot').valid, true);
  assert.doesNotThrow(() => buildProposal({ proposalId: 'p1', uid: 'u1', coffeeId: 'c1', slotKey: 'kalita_hot', sessionId: 's1', before: recipe, after: recipe, sourceRevisionHash: 'hash', createdAt: new Date().toISOString() }));
  const plan = buildSeedPlan({ setup: {}, coffees: [{ id: 'c1' }], recipes: { 'c1:v60_hot': { slot: 'v60_hot', dose: 15, water: 250, grind: 'Ode 4.2', temperature: 94, ratio: '1:16.7' } } }, { fixtureUid: 'fixture-account' });
  assert.equal(JSON.stringify(plan).includes('undefined'), false);
});

test('each Dev fixture session reset also clears only the fake owner rate-limit counter', async () => {
  const writes = [];
  const db = { collection: (name) => ({ doc: (id) => ({ collection: (child) => ({ doc: (childId) => ({ set: async (data) => writes.push({ path: `${name}/${id}/${child}/${childId}`, data }) }) }) }) }) };
  const reset = await createFirestoreSessionReset({ projectId: 'coffee-dev', fixtureUid: 'fixture-account', db });
  await reset({ fixture: { launchContext: { surface: 'direct' } }, repetition: 1, stage: 'smoke' });
  assert.deepEqual(writes.map((item) => item.path).sort(), ['users/fixture-account/chatSessions/active', 'users/fixture-account/rateLimits/claude']);
  assert.equal(writes.find((item) => item.path.endsWith('/rateLimits/claude')).data.count, 0);
  const session = writes.find(item => item.path.endsWith('/chatSessions/active')).data;
  assert.equal('u3Stage' in session, false, 'diagnostic metadata makes owner session writes fail rules');
  assert.equal('u3Repetition' in session, false);
});

test('trial-return reset binds current chat to its exact trial despite an older alternative', async () => {
  const writes = [];
  const removed = [];
  const db = { collection: name => ({ doc: id => ({ collection: child => ({ doc: childId => ({ set: async data => writes.push({ path: `${name}/${id}/${child}/${childId}`, data }), delete: async () => removed.push(`${child}/${childId}`) }) }) }) }) };
  const { cases } = await loadFixtureManifest();
  const reset = await createFirestoreSessionReset({ projectId: 'coffee-dev', fixtureUid: 'fixture-account', db });
  await reset({ fixture: cases.cases.find(item => item.id === 'AE15') });
  const attempts = writes.filter(item => item.path.includes('/brewAttempts/'));
  assert.deepEqual(attempts.map(item => item.data.snapshot.waterGrams), [235, 240]);
  assert.ok(attempts.every(item => item.data.ownerId === 'fixture-account' && item.data.status === 'timer_started'));
  const session = writes.find(item => item.path.endsWith('/chatSessions/active')).data;
  const receipt = session.messages[0].artifacts[0];
  assert.equal(receipt.attemptId, 'fixture-trial-return');
  assert.equal(writes.find(item => item.path.endsWith(`/receipts/${receipt.id}`)).data.ownerId, 'fixture-account');
  assert.ok(writes.every(item => !item.path.includes('/beans/') && !item.path.includes('/recipeRevisions/')));
  await reset({ fixture: cases.cases[0] });
  assert.deepEqual(removed, ['brewAttempts/fixture-trial-return-older', 'brewAttempts/fixture-trial-return']);
});
