import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { V60_SOURCES, V60_TECHNIQUES, validateV60Registry, V60_SOURCE_REGISTRY_VERSION } from '../src/data/v60SourceRegistry.js';
const result = validateV60Registry();
assert.equal(result.valid, true, result.errors.join(', '));
assert.equal(V60_SOURCE_REGISTRY_VERSION, 'v60-hot-sources-v1');
assert.ok(Object.keys(V60_TECHNIQUES).length >= 6);
assert.ok(V60_SOURCES.every((source) => source.evidenceType === 'primary'));
assert.deepEqual(V60_SOURCES.find((source) => source.id === 'hoffmann-large-batch-v1').pourTargets, [{ seconds: 45, grams: 300 }, { seconds: 75, grams: 500 }]);
assert.equal(V60_SOURCES.find((source) => source.id === 'hoffmann-large-batch-v1').guideSeconds, 210);
assert.equal(V60_SOURCES.find((source) => source.id === 'rao-two-stage-v1').temperatureC, 97);
assert.equal(V60_SOURCES.find((source) => source.id === 'heart-continuous-v1').doseGrams, 22);
assert.deepEqual(V60_SOURCES.find((source) => source.id === 'heart-continuous-v1').guideRangeSeconds, [140, 150]);
assert.equal(V60_SOURCES.find((source) => source.id === 'rao-two-stage-v1').grind, null);
assert.deepEqual(V60_SOURCES.find((source) => source.id === 'heart-continuous-v1').bloomRangeGrams, [40, 50]);
assert.match(V60_SOURCES.find((source) => source.id === 'heart-continuous-v1').agitation, /vigorous bloom stir.*final stir/i);
const kurasu = V60_SOURCES.find((source) => source.id === 'kurasu-controlled-pulses-v1');
assert.equal(kurasu.supportedV60_02, false);
assert.equal(kurasu.ratio, null);
assert.match(readFileSync(new URL('../docs/data/v60-source-registry.md', import.meta.url), 'utf8'), /hoffmann-one-cup-v1/);
const audit = readFileSync(new URL('../docs/data/v60-source-registry.md', import.meta.url), 'utf8');
for (const source of V60_SOURCES) {
  assert.match(audit, new RegExp('`' + source.id + '`'));
  assert.match(audit, new RegExp(source.canonicalUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(audit, new RegExp(`\\| ${source.status} \\|`));
}
console.log(`v60 source registry passed (${V60_SOURCES.length} sources, ${Object.keys(V60_TECHNIQUES).length} techniques)`);
