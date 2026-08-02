import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { V60_ICED_SOURCES, V60_ICED_TECHNIQUES, V60_ICED_SOURCE_REGISTRY_VERSION, validateV60IcedRegistry } from '../src/data/v60IcedSourceRegistry.js';
const result = validateV60IcedRegistry();
assert.equal(result.valid, true, result.errors.join(', '));
assert.equal(V60_ICED_SOURCE_REGISTRY_VERSION, 'v60-iced-sources-v1');
assert.equal(Object.keys(V60_ICED_TECHNIQUES).length, 3);
assert.match(readFileSync(new URL('../docs/data/v60-iced-source-registry.md', import.meta.url), 'utf8'), /classic 60\/40/i);
console.log(`iced source registry passed (${V60_ICED_SOURCES.length} sources)`);
