import assert from 'node:assert/strict';
import { generateKalitaRecipe, validateKalitaCandidate } from '../src/lib/kalitaAdapter.js';

const washed = { confidence: 'high', finesRisk: 'high', energyTendency: 'higher', reasonCodes: ['WASHED_FLATBED_FINES_GUARD'] };
const r155 = generateKalitaRecipe(washed, { size: '155', dose: 15, grinder: 'fellow-ode-gen2' });
const r185 = generateKalitaRecipe(washed, { size: '185', dose: 20, grinder: 'fellow-opus' });
const r30 = generateKalitaRecipe({ confidence: 'low', reasonCodes: [] }, { size: '185', dose: 30, grinder: 'comandante-c40' });
const r155Extended = generateKalitaRecipe({ targetRatio: 16, targetTemperatureC: 96, techniquePreference: 'low-agitation-center', reasonCodes: [] }, { size: '155', dose: 20, grinder: 'fellow-ode-gen2' });
assert.deepEqual(r155, generateKalitaRecipe(washed, { size: '155', dose: 15, grinder: 'fellow-ode-gen2' }));
assert.notEqual(r155.totalBrewTimeSeconds, r185.totalBrewTimeSeconds);
assert.notEqual(r185.totalBrewTimeSeconds, r30.totalBrewTimeSeconds);
assert.equal(r155.technique, 'low-agitation-center');
assert.equal(r155Extended.doseProfile, '155-extended');
assert.equal(r155Extended.waterGrams, 320);
assert.ok(r155Extended.totalBrewTimeSeconds > r155.totalBrewTimeSeconds);
assert.equal(validateKalitaCandidate({ ...r155, totalBrewTimeSeconds: 0 }).valid, false);
console.log('kalita adapter passed');
