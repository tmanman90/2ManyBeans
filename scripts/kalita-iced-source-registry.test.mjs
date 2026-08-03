import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  KALITA_ICED_RULES,
  KALITA_ICED_SOURCES,
  validateKalitaIcedRegistry,
} from '../src/data/kalitaIcedSourceRegistry.js';

const result = validateKalitaIcedRegistry();
assert.deepEqual(result, { valid: true, errors: [] });

const executable = KALITA_ICED_SOURCES.filter((source) => source.executable);
assert.deepEqual(executable.map((source) => source.id), [
  'kurasu-wave-ice-after-v1',
  'yamatoya-wave-155-direct-v1',
  'espresso-parts-wave-185-direct-v1',
  'frothy-monkey-wave-large-direct-v1',
]);
assert.equal(KALITA_ICED_SOURCES.find((source) => source.id.startsWith('apollons')).executable, false);
assert.equal(KALITA_ICED_SOURCES.find((source) => source.id.startsWith('gota')).executable, false);
assert.ok(Object.values(KALITA_ICED_RULES).every((rule) => Array.isArray(rule.allowedFields)));
const espressoParts = KALITA_ICED_SOURCES.find((source) => source.id === 'espresso-parts-wave-185-direct-v1');
assert.equal(espressoParts.requiresCompleteMelt, false);
assert.equal(espressoParts.finalBeverageWaterTargetGrams, null);

const audit = readFileSync(new URL('../docs/data/kalita-iced-source-registry.md', import.meta.url), 'utf8');
for (const source of KALITA_ICED_SOURCES) {
  assert.match(audit, new RegExp(source.id));
  if (source.executable) {
    assert.match(audit, new RegExp(String(source.doseGrams)));
    assert.match(audit, new RegExp(String(source.hotWaterGrams)));
    assert.match(audit, new RegExp(String(source.recipeIceGrams)));
    assert.match(audit, new RegExp(source.canonicalUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
}
for (const id of Object.keys(KALITA_ICED_RULES)) assert.match(audit, new RegExp(id));
assert.match(audit, /espresso-parts-wave-185-direct-v1[^\n]*complete melt not asserted/);
assert.match(audit, /yamatoya-wave-155-direct-v1[^\n]*pour complete at 1:30[^\n]*app guide 2:00–3:00/);
assert.match(audit, /kalita-iced-grind-translation-v1[^\n]*600–1000µm/);

console.log('kalita iced source registry passed');
