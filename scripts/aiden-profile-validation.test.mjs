import assert from 'node:assert/strict';
import test from 'node:test';
import { validateAidenProfile, assertValidAidenProfile } from '../src/lib/aidenProfileValidation.js';

const validProfile = {
  profileType: 0, title: 'Ethiopia test', ratio: 17, bloomEnabled: true,
  bloomRatio: 3, bloomDuration: 45, bloomTemperature: 96,
  ssPulsesEnabled: true, ssPulsesNumber: 2, ssPulsesInterval: 23,
  ssPulseTemperatures: [96, 95], batchPulsesEnabled: true,
  batchPulsesNumber: 2, batchPulsesInterval: 30, batchPulseTemperatures: [96, 95],
};

test('shared Aiden seam accepts a canonical profile', () => {
  assert.deepEqual(validateAidenProfile(validProfile), { valid: true, errors: [] });
  assert.equal(assertValidAidenProfile(validProfile), validProfile);
});

test('nonfinite and malformed Aiden values fail closed', () => {
  for (const value of [Number.NaN, Number.POSITIVE_INFINITY, '17', null]) {
    const result = validateAidenProfile({ ...validProfile, ratio: value });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => /ratio.*finite/.test(error)));
  }
  assert.equal(validateAidenProfile({ ...validProfile, ssPulsesNumber: 3 }).valid, false);
  assert.equal(validateAidenProfile({ ...validProfile, ssPulseTemperatures: [96, 100.5] }).valid, false);
  assert.equal(validateAidenProfile({ ...validProfile, batchPulseTemperatures: { length: 2 } }).valid, false);
  assert.equal(validateAidenProfile({ ...validProfile, title: 'x'.repeat(51) }).valid, false);
  assert.throws(() => assertValidAidenProfile({ ...validProfile, bloomTemperature: Number.NaN }), /Invalid Aiden profile/);
});

test('legacy server coercion is characterized as intentional strict hardening', () => {
  // The former inline server checks relied on JS comparisons and therefore
  // accepted ratio:'17' and a truthy non-string title. Canonical profiles are
  // unchanged, while these malformed wire values now fail before Fellow.
  assert.equal(validateAidenProfile({ ...validProfile, ratio: '17' }).valid, false);
  assert.equal(validateAidenProfile({ ...validProfile, title: { length: 1 } }).valid, false);
  assert.equal(validateAidenProfile(validProfile).valid, true);
});

test('disabled sections retain their existing optional-field behavior', () => {
  const disabled = { ...validProfile, bloomEnabled: false, ssPulsesEnabled: false, batchPulsesEnabled: false };
  delete disabled.bloomTemperature;
  delete disabled.ssPulseTemperatures;
  delete disabled.batchPulseTemperatures;
  assert.equal(validateAidenProfile(disabled).valid, true);
});
