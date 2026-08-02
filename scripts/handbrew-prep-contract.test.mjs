import assert from 'node:assert/strict';
import { buildTimerSteps, normalizeRecipePhases, PHASE_CONTRACT_VERSION } from '../src/lib/brewTimerSteps.js';
import { generateKalitaRecipe } from '../src/lib/kalitaAdapter.js';
import { generateV60Recipe } from '../src/lib/v60Adapter.js';
import { generateV60IcedRecipe } from '../src/lib/v60IcedAdapter.js';

const hot = generateV60Recipe({}, { dose: 15 });
assert.equal(hot.phaseContractVersion, PHASE_CONTRACT_VERSION);
assert.equal(hot.steps[0].timeSeconds, 0);
assert.ok(hot.prepSteps.length > 0);
assert.equal(buildTimerSteps(hot)[0].startSeconds, 0);

const kalita = generateKalitaRecipe({}, { size: '155', dose: 15 });
assert.equal(kalita.phaseContractVersion, PHASE_CONTRACT_VERSION);
assert.equal(kalita.steps[0].timeSeconds, 0);
assert.ok(kalita.prepSteps.some((step) => /rinse|level/i.test(step.action)));

const iced = generateV60IcedRecipe({}, { dose: 16 });
assert.ok(iced.prepSteps.some((step) => /ice/i.test(step.action)));
assert.equal(iced.steps[0].timeSeconds, 0);
assert.equal(iced.postBrewSteps[0].untimed, true);

const legacy = normalizeRecipePhases({ timerReady: true, totalBrewTimeSeconds: 180, steps: [
  { timeSeconds: 0, time: '0:00', action: 'Rinse filter and load coffee', waterTotal: 0 },
  { timeSeconds: 30, time: '0:30', action: 'Bloom with 40g water', waterTotal: 40 },
  { timeSeconds: 90, time: '1:30', action: 'Pour to 250g water', waterTotal: 250 },
] });
assert.equal(legacy.phaseContractStatus, 'legacy-normalized');
assert.equal(legacy.prepSteps.length, 1);
assert.equal(legacy.steps[0].timeSeconds, 0);
assert.equal(legacy.totalBrewTimeSeconds, 180);
assert.ok(buildTimerSteps(legacy));
const historicalTimedLoad = normalizeRecipePhases({ timerReady: true, totalBrewTimeSeconds: 120, steps: [
  { timeSeconds: 0, time: '0:00', action: 'Add 20g coffee and level the bed.', waterTotal: 0 },
  { timeSeconds: 30, time: '0:30', action: 'Bloom with 40g water.', waterTotal: 40 },
  { timeSeconds: 75, time: '1:15', action: 'Pour to 320g water.', waterTotal: 320 },
] });
assert.equal(historicalTimedLoad.steps[0].timeSeconds, 0);
assert.equal(historicalTimedLoad.steps[1].timeSeconds, 45);
const ambiguous = normalizeRecipePhases({ timerReady: true, totalBrewTimeSeconds: 180, steps: [{ timeSeconds: 0, action: 'Settle the bed', waterTotal: 0 }] });
assert.equal(ambiguous.timerReady, false);
console.log('handbrew prep/phase contract passed (versioned hot, Kalita, iced, legacy, ambiguous)');
