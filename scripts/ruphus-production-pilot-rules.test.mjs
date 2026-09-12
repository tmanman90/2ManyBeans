import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { productionPilotRules } from './ruphus-production-pilot-rules.mjs';
const reference = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const original = "rules_version = '2';\nservice cloud.firestore {\n  match /databases/{database}/documents {\n    // preserved existing policy\n  }\n}\n";
const owner = 'pilot-owner-123456789012345';
test('pilot preserves the prior policy verbatim and scopes every new grant', () => {
  const candidate = productionPilotRules(original, reference, owner);
  const prefix = original.slice(0, original.lastIndexOf('  }\n}'));
  assert.ok(candidate.startsWith(prefix));
  assert.ok(candidate.endsWith(original.slice(prefix.length)));
  const addition = candidate.slice(prefix.length, -original.slice(prefix.length).length);
  const grants = addition.split('\n').filter(line => /allow (read|write|delete): if request/.test(line));
  assert.equal(grants.length, 9);
  assert.ok(grants.every(line => line.includes(`&& userId == '${owner}'`)));
  assert.equal((addition.match(/allow write: if false/g) || []).length, 6);
  assert.doesNotMatch(addition, /match .*\/(beans|tastings|secrets|usage)\//);
});
test('pilot rejects injection, unknown layouts, duplicate installation', () => {
  assert.throws(() => productionPilotRules(original, reference, "bad' || true"));
  assert.throws(() => productionPilotRules(original, '', owner));
  assert.throws(() => productionPilotRules(productionPilotRules(original, reference, owner), reference, owner));
});
