import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSeedPlan, assertDevTarget, rewriteRelativeDates, seedFixture } from './seed-ruphus-dev-fixture.mjs';

test('fixture seeding fails closed outside an explicitly authorized Dev target', () => {
  assert.throws(() => assertDevTarget({ projectId: 'coffee-prod', fixtureUid: 'fixture', authorized: true }), /non-Dev/);
  assert.throws(() => assertDevTarget({ projectId: 'coffee-dev', fixtureUid: 'fixture', authorized: false }), /authorization/);
  assert.equal(assertDevTarget({ projectId: 'coffee-dev', fixtureUid: 'fixture-account', authorized: true }), true);
});

test('relative fixture dates are rewritten from one run clock and seed plan is idempotent-shaped', () => {
  const now = new Date('2026-08-30T12:00:00.000Z');
  assert.equal(rewriteRelativeDates({ date: '-2d' }, now).date, '2026-08-28T12:00:00.000Z');
  const account = { manifestVersion: 1, manifestHash: 'hash', setup: { grinder: 'Ode' }, coffees: [{ id: 'c1', name: 'Coffee' }], recipes: { 'c1:v60': { id: 'r1' } }, brews: [{ id: 'b1' }], tastings: [], attempts: [] };
  const plan = buildSeedPlan(account, { fixtureUid: 'fixture-account', now });
  assert.equal(plan[0].path, 'users/fixture-account');
  assert.equal(plan.some((operation) => operation.path.endsWith('/recipes/c1:v60')), true);
  assert.equal(plan.every((operation) => !JSON.stringify(operation).includes('token')), true);
});

test('seedFixture verifies the frozen account before creating writes', async () => {
  const result = await seedFixture({ projectId: 'coffee-dev', fixtureUid: 'fixture-account', authorized: true });
  assert.equal(result.dryRun, true);
  assert.equal(typeof result.manifestHash, 'string');
  assert.ok(result.operations.length > 1);
});

