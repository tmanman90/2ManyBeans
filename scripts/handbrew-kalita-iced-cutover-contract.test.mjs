import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const hook = readFileSync(new URL('../src/hooks/useHandBrew.js', import.meta.url), 'utf8');
const modal = readFileSync(new URL('../src/components/HandBrewModal.jsx', import.meta.url), 'utf8');
const transformer = readFileSync(new URL('../src/lib/flashBrewTransform.js', import.meta.url), 'utf8');

assert.match(hook, /generateKalitaIcedWithFallback/);
assert.match(hook, /KALITA_ICED_SOURCE_REGISTRY_VERSION/);
assert.match(hook, /validateKalitaIcedCandidate/);
assert.match(hook, /queueLatestRecipeWrite/);
assert.match(hook, /createKeyedLatestWriteQueue/);
assert.match(hook, /canUseCachedHotRecipe/);
assert.match(hook, /resolveIcedRetryConfiguration/);
assert.match(hook, /iced cache repair persistence failed/);
assert.match(hook, /setHandBrewIcedRecipe\(null\)[\s\S]*setHandBrewIcedLoading\(true\)/);
assert.match(modal, /isDeterministicKalitaHot\(displayRecipe\)/);
assert.match(modal, /icedRecipe\?\.icedModeLabel/);
assert.match(modal, /Wave \$\{icedRecipe\.kalitaSize\} · Iced/);
assert.match(modal, /Final beverage water depends on how much chill ice melts/);
assert.doesNotMatch(modal, /Final beverage-water target: \{icedRecipe\.finalBeverageWaterTargetGrams\}g/);
assert.match(transformer, /Deterministic hot Kalita candidates require the independent iced Kalita adapter/);
console.log('handbrew Kalita iced cutover contract passed');
