import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createMemoryCommandStore, executeRecipeCommand } from '../api/_lib/ruphusCommandService.js';
import { generateV60Recipe } from '../src/lib/v60Adapter.js';

test('Firestore command saves a trial then completes its existing attempt without recreating it', async () => {
  const uid = 'trial-owner';
  const store = createMemoryCommandStore({ uid });
  const recipe = generateV60Recipe({}, { dose: 15 });
  store.seedBean('coffee', { handBrewRecipes: { v60: recipe } });
  const revision = store.execute({ actionId: 'base', mode: 'replace_active_recipe', coffeeId: 'coffee', slotKey: 'v60_hot', recipe }).revision;
  store.seedProposal({ id: 'proposal', ownerId: uid, coffeeId: 'coffee', slotKey: 'v60_hot', sourceRevisionId: revision.id, sourceHash: revision.snapshotHash, after: { ...recipe, waterTemp: { ...recipe.waterTemp, celsius: 97 } }, status: 'proposed' });
  const trial = store.execute({ actionId: 'trial', mode: 'brew_once', coffeeId: 'coffee', slotKey: 'v60_hot', proposalId: 'proposal' }).attempt;
  store.execute({ actionId: 'timer', mode: 'timer_started', coffeeId: 'coffee', slotKey: 'v60_hot', attemptId: trial.id });
  const data = new Map();
  const root = `users/${uid}`;
  for (const [collection, rows] of Object.entries({ beans: store.snapshot().beans, recipeRevisions: store.snapshot().revisions, proposals: store.snapshot().proposals, brewAttempts: store.snapshot().attempts })) {
    for (const row of rows) data.set(`${root}/${collection}/${row.id}`, structuredClone(row));
  }
  const ref = path => ({ path, id: path.split('/').at(-1), collection: name => ref(`${path}/${name}`), doc: id => ref(`${path}/${id}`) });
  const db = { collection: name => ref(name), runTransaction: async callback => {
    let writing = false; const pending = [];
    const tx = { get: async target => { assert.equal(writing, false); return { exists: data.has(target.path), id: target.id, data: () => structuredClone(data.get(target.path)) }; },
      create: (target, value) => { writing = true; assert.equal(data.has(target.path), false, `cannot recreate ${target.path}`); pending.push([target.path, value]); },
      set: (target, value) => { writing = true; pending.push([target.path, value]); },
      update: (target, value) => { writing = true; pending.push([target.path, { ...data.get(target.path), ...value }]); } };
    const result = await callback(tx); for (const [path, value] of pending) data.set(path, structuredClone(value)); return result;
  } };
  const saved = await executeRecipeCommand({ db, uid, actionId: 'save', mode: 'promote_attempt', coffeeId: 'coffee', slotKey: 'v60_hot', attemptId: trial.id });
  assert.equal(saved.revision.snapshot.waterTemp.celsius, 97);
  assert.equal(data.get(`${root}/brewAttempts/${trial.id}`).status, 'timer_started');
  const completed = await executeRecipeCommand({ db, uid, actionId: 'complete', mode: 'complete_attempt', coffeeId: 'coffee', slotKey: 'v60_hot', attemptId: trial.id, expectedRevisionId: revision.id });
  assert.equal(completed.attempt.status, 'completed');
  assert.equal(data.get(`${root}/brewAttempts/${trial.id}`).status, 'completed');
});

test('proposal transaction completes all reads before revision and bean writes', async () => {
  const source = await readFile(new URL('../api/_lib/ruphusRepository.js', import.meta.url), 'utf8');
  const reads = source.indexOf('const [pairSnap, sessionSnap]');
  const writes = source.indexOf('tx.set(revisions.doc');
  assert.ok(reads >= 0, 'proposal transaction must read owner/session state');
  assert.ok(writes >= 0, 'proposal transaction must write revision state');
  assert.ok(reads < writes, 'Firestore transaction reads must precede writes');
  assert.match(source, /tx\.get\(pairQuery\)/);
  assert.match(source, /tx\.get\(sessionQuery\)/);
  assert.match(source, /tx\.get\(revisions\.doc\(activeRevisionId\)\)/);
  assert.ok(source.indexOf('tx.get(revisions.doc(activeRevisionId))') < writes, 'active recipe revision must be read before writes');
});
