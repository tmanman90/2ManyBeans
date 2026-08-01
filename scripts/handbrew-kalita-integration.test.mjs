import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const hook = readFileSync(new URL('../src/hooks/useHandBrew.js', import.meta.url), 'utf8');
const modal = readFileSync(new URL('../src/components/HandBrewModal.jsx', import.meta.url), 'utf8');
const settings = readFileSync(new URL('../src/components/SettingsPage.jsx', import.meta.url), 'utf8');
assert.match(hook, /candidateMatchesConfiguration/);
assert.match(hook, /engineVersion === KALITA_ENGINE_VERSION/);
assert.match(hook, /delete persistedRecipe\.shadowCandidate/);
assert.match(hook, /generationStatus: 'fallback'/);
assert.match(hook, /activeRequestRef\.current === rid/);
assert.match(modal, /Wave \{recipe\.kalitaSize/);
assert.match(modal, /low-agitation-center/);
assert.match(settings, /Kalita Wave Size/);
console.log('handbrew Kalita integration passed');
