import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const hook = readFileSync(new URL('../src/hooks/useHandBrew.js', import.meta.url), 'utf8');
const modal = readFileSync(new URL('../src/components/HandBrewModal.jsx', import.meta.url), 'utf8');
const settings = readFileSync(new URL('../src/components/SettingsPage.jsx', import.meta.url), 'utf8');
const adapter = readFileSync(new URL('../src/lib/kalitaAdapter.js', import.meta.url), 'utf8');
assert.match(hook, /candidateMatchesConfiguration/);
// V60 joined the deterministic-candidate path in the V60 Switch cutover;
// the condition legitimately grew from a Kalita-only check to a
// Kalita-or-V60 check.
assert.match(hook, /const candidateMode = device === 'kalita' \|\| device === 'v60' \? 'candidate' : 'legacy'/);
assert.match(hook, /engineVersion === KALITA_ENGINE_VERSION/);
assert.match(hook, /delete persistedRecipe\.shadowCandidate/);
assert.match(hook, /generationStatus: 'fallback'/);
assert.match(hook, /activeRequestRef\.current === rid/);
assert.match(hook, /handleKalitaSizeChange/);
assert.match(hook, /doseOverride: nextSize === '155' \? 15 : 20/);
assert.match(hook, /kalitaCacheEligible/);
assert.match(modal, /KalitaSizeSwitch/);
assert.match(modal, /aria-label=\{`Use Kalita Wave \$\{size\}`\}/);
assert.match(modal, /Wave \{recipe\.kalitaSize/);
assert.match(modal, /low-agitation-center/);
assert.match(modal, /Pouring technique/);
assert.match(adapter, /techniqueInstruction/);
assert.match(adapter, /controlled spiral outward/);
assert.doesNotMatch(adapter, /confidence extraction intent/);
assert.doesNotMatch(settings, /Kalita Wave Size/);
assert.doesNotMatch(settings, /Kalita Engine/);
console.log('handbrew Kalita integration passed');
