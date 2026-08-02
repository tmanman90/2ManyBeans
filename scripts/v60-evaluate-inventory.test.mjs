import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { evaluateAndRedactBeans, evaluateV60Bean, resolveV60Configuration } from '../src/lib/v60InventoryEvaluation.js';

const source = readFileSync(new URL('./v60-evaluate-inventory.mjs', import.meta.url), 'utf8');
const fakeBean = {
  id: 'private-doc-id', name: 'Private Bean Name', roaster: 'Private Roaster', process: 'Washed', roastLevel: 'light',
  userCoffeeGrams: 18, handBrewRecipes: { v60: { grinder: 'comandante-c40' } },
  beanResearch: { cupStructureFamily: 'washed-floral-clarity' },
};

assert.deepEqual(resolveV60Configuration(fakeBean), { dose: 18, grinder: 'comandante-c40', configurationKey: 'v60:02:standard-paper' });
const pure = evaluateV60Bean(fakeBean);
assert.equal(pure.hot.valid, true);
assert.equal(pure.iced.valid, true);
const developed = evaluateV60Bean({ ...fakeBean, process: 'natural', roastLevel: 'dark', beanResearch: { cupStructureFamily: 'dark-roast' } });
assert.notEqual(developed.iced.technique, pure.iced.technique);
const redacted = evaluateAndRedactBeans([fakeBean]);
assert.equal(redacted.length, 1);
assert.doesNotMatch(JSON.stringify(redacted), /private-doc-id|Private Bean Name|Private Roaster/);

// Static no-write contract: the CLI must read only users/{uid}/beans and must
// not contain any Firestore mutation API or credential-default fallback.
assert.match(source, /collection\('users'\)\.doc\(uid\)\.collection\('beans'\)\.get\(\)/);
assert.doesNotMatch(source, /\.(set|update|delete|add|create|batch|runTransaction)\s*\(/);
assert.doesNotMatch(source, /applicationDefault|GOOGLE_APPLICATION_CREDENTIALS/);

const refused = spawnSync(process.execPath, ['scripts/v60-evaluate-inventory.mjs'], { encoding: 'utf8' });
assert.equal(refused.status, 2);
assert.match(refused.stderr, /REFUSED/);
const invalid = spawnSync(process.execPath, ['scripts/v60-evaluate-inventory.mjs', '--uid', 'target', '--service-account', '/definitely/missing.json'], { encoding: 'utf8' });
assert.equal(invalid.status, 2);
assert.match(invalid.stderr, /could not read service-account JSON/);

// No service account is present in this test lane, so do not claim a live
// inventory run. The pure fake-bean path above is the network-free proof.
const noLiveRun = execFileSync(process.execPath, ['-e', 'process.stdout.write("no-live-run")'], { encoding: 'utf8' });
assert.equal(noLiveRun, 'no-live-run');
console.log('read-only V60 inventory evaluator passed (pure fake bean, redaction, static no-write, auth fail-closed)');
