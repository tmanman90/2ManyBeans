import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');

test('Ruphus authority records are owner-readable and client-write denied', () => {
  for (const collection of ['proposals', 'recipeRevisions', 'brewAttempts', 'actions', 'receipts']) {
    const block = rules.slice(rules.indexOf(`match /users/{userId}/${collection}/`), rules.indexOf('\n    }', rules.indexOf(`match /users/{userId}/${collection}/`)) + 6);
    assert.match(block, /allow read: if request\.auth != null && request\.auth\.uid == userId/);
    assert.match(block, /allow write: if false/);
  }
});

test('bean protected-field rule remains deferred until command-capable census', () => {
  assert.match(rules, /Agent v3 authority records are server-written/);
  assert.doesNotMatch(rules, /affectedKeys\(\)\.hasAny\(\['aidenRecipe'/);
});
