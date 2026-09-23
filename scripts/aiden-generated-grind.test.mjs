import assert from 'node:assert/strict';
import test from 'node:test';
import { repairAidenProfile, repairGeneratedAidenProfile } from '../src/lib/aidenCore.js';

const bean = { name: 'Strawberry Shake', roaster: 'KOS Coffee Roasters', origin: 'Colombia', process: 'Nitro Washed', jarSlot: 1 };
const candidate = {
  profileType: 0, title: 'Model draft', ratio: 18,
  bloomEnabled: true, bloomRatio: 2.5, bloomDuration: 45, bloomTemperature: 93,
  ssPulsesEnabled: true, ssPulsesNumber: 3, ssPulsesInterval: 28, ssPulseTemperatures: [93, 93, 92.5],
  batchPulsesEnabled: true, batchPulsesNumber: 4, batchPulsesInterval: 30, batchPulseTemperatures: [93, 93, 92.5, 92],
  grindRecommendation: { singleServe: 5.1, batch: 7.1 },
};

test('generated recipes replace a nonphysical model grind before validating the profile', () => {
  assert.throws(() => repairAidenProfile(bean, candidate), /physical Ode Gen 2 step/);
  const repaired = repairGeneratedAidenProfile(bean, candidate);
  assert.equal(repaired.ratio, 18);
  assert.deepEqual(repaired.grindRecommendation, { singleServe: 4.6, batch: 6.6 });
  assert.deepEqual(candidate.grindRecommendation, { singleServe: 5.1, batch: 7.1 });
});

test('generated recipes still reject missing brew parameters', () => {
  assert.throws(() => repairGeneratedAidenProfile(bean, { ...candidate, ssPulsesNumber: undefined }), /ssPulsesNumber/);
});

test('generated title is stamped from the bean before validating its length', () => {
  const repaired = repairGeneratedAidenProfile(bean, { ...candidate, title: 'An overlong model title '.repeat(4) });
  assert.equal(repaired.title, '#1 Colombia Strawberry Shake - KOS Coffee Roasters');
});
