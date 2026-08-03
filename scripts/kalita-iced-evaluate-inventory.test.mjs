import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { evaluateAndRedactKalitaIcedInventory, evaluateKalitaIcedBean } from '../src/lib/kalitaIcedInventoryEvaluation.js';

const source = readFileSync(new URL('./kalita-iced-evaluate-inventory.mjs', import.meta.url), 'utf8');
const privateBean = {
  id: 'secret-id', name: 'Secret Coffee', roaster: 'Secret Roaster', process: 'Washed',
  sourceInsights: { brewGuidance: 'This coffee has stalled from fines and slow drawdown.' },
};
const rows = evaluateKalitaIcedBean(privateBean);
assert.equal(rows.length, 4);
assert.ok(rows.every((row) => row.valid));
assert.ok(rows.every((row) => row.personalizationApplied));
const summary = evaluateAndRedactKalitaIcedInventory([privateBean]);
assert.equal(summary.beanCount, 1);
assert.equal(summary.recipeCount, 4);
assert.equal(summary.allValid, true);
assert.deepEqual(summary.configurations, ['155:15g', '155:20g', '185:20g', '185:33g']);
assert.doesNotMatch(JSON.stringify(summary), /secret-id|Secret Coffee|Secret Roaster/);
assert.throws(() => evaluateAndRedactKalitaIcedInventory([]), /zero beans read/);

assert.match(source, /collection\('users'\)\.doc\(uid\)\.collection\('beans'\)\.get\(\)/);
assert.doesNotMatch(source, /\.(set|update|delete|add|create|batch|runTransaction)\s*\(/);
assert.doesNotMatch(source, /applicationDefault|GOOGLE_APPLICATION_CREDENTIALS/);

const refused = spawnSync(process.execPath, ['scripts/kalita-iced-evaluate-inventory.mjs'], { encoding: 'utf8' });
assert.equal(refused.status, 2);
assert.match(refused.stderr, /REFUSED/);
const invalid = spawnSync(process.execPath, ['scripts/kalita-iced-evaluate-inventory.mjs', '--uid', 'target', '--service-account', '/definitely/missing.json'], { encoding: 'utf8' });
assert.equal(invalid.status, 2);
assert.match(invalid.stderr, /could not read service-account JSON/);

console.log('read-only Kalita iced inventory evaluator passed');
