import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { V60_ICED_SOURCES, V60_ICED_TECHNIQUES, V60_ICED_SOURCE_REGISTRY_VERSION, validateV60IcedRegistry } from '../src/data/v60IcedSourceRegistry.js';
const result = validateV60IcedRegistry();
assert.equal(result.valid, true, result.errors.join(', '));
assert.equal(V60_ICED_SOURCE_REGISTRY_VERSION, 'v60-iced-sources-v1');
assert.equal(Object.keys(V60_ICED_TECHNIQUES).length, 4);
for (const source of V60_ICED_SOURCES) {
  assert.equal(source.hotWaterGrams + source.iceGrams, source.finalWaterGrams);
  assert.ok(Math.abs(source.finalWaterGrams / source.doseGrams - source.ratio) < 0.01);
  assert.ok(Number.isFinite(source.temperatureC));
  assert.equal(source.grind, 'medium-fine');
}
assert.deepEqual(V60_ICED_SOURCES.find((source) => source.id === 'partners-flash-6733-v1').guideRangeSeconds, [160, 200]);
assert.equal(V60_ICED_SOURCES.find((source) => source.id === 'kurasu-iced-staged-v1').guideSeconds, 130);
assert.equal(V60_ICED_SOURCES.find((source) => source.id === 'counterculture-flash-v1').guideSeconds, null);
assert.equal(V60_ICED_SOURCES.find((source) => source.id === 'counterculture-flash-v1').agitation, null);
assert.match(readFileSync(new URL('../docs/data/v60-iced-source-registry.md', import.meta.url), 'utf8'), /classic 60\/40/i);
const audit = readFileSync(new URL('../docs/data/v60-iced-source-registry.md', import.meta.url), 'utf8');
for (const source of V60_ICED_SOURCES) {
  assert.match(audit, new RegExp('`' + source.id + '`'));
  assert.match(audit, new RegExp(source.canonicalUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(audit, new RegExp(`\\| ${source.status} \\|`));
}
console.log(`iced source registry passed (${V60_ICED_SOURCES.length} sources)`);
