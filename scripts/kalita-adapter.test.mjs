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
assert.match(r155.techniqueInstruction, /center/i);
// Pour path (circle/spiral) and brewer swirl are separate levers. The bloom
// must wet the whole bed; no hot Wave technique bans the pour path outright.
assert.match(r155.steps[0].action, /spiral from the center out/i);
assert.match(r155.steps[0].action, /do not swirl/i);
assert.match(r155.steps[2].action, /tight center circle/i);
assert.match(r155.steps[2].action, /do not stir or swirl/i);
const intents = [
  { reasonCodes: [] },
  { finesRisk: 'high', reasonCodes: [] },
  { solubilityRisk: 'high', reasonCodes: [] },
  { energyTendency: 'higher', reasonCodes: [] },
  ...['low-agitation-center', 'bloom-led-pulse', 'center-to-spiral-pulse', 'low-agitation-no-swirl'].map((techniquePreference) => ({ techniquePreference, reasonCodes: [] })),
];
for (const intent of intents) {
  for (const [size, dose] of [['155', 15], ['185', 20], ['185', 30]]) {
    const recipe = generateKalitaRecipe(intent, { size, dose });
    const copy = [recipe.techniqueInstruction, ...recipe.steps.map((step) => step.action)].join(' ');
    assert.doesNotMatch(copy, /do not (?:use a wide )?spiral|avoid spiral|no spiral/i, `${recipe.technique} ${size} ${dose}g bans spiraling`);
    assert.match(recipe.steps[0].action, /every ground is wet/i, `${recipe.technique} bloom must wet the whole bed`);
    for (const step of recipe.steps.slice(1)) assert.match(step.action, /circle|spiral/i, `${recipe.technique} pour lacks a pour path: ${step.action}`);
  }
}
const unknown = generateKalitaRecipe({ reasonCodes: [] }, { size: '185', dose: 20 });
assert.equal(unknown.technique, 'low-agitation-no-swirl');
assert.match(unknown.steps[1].action, /small circles from the center outward/i);
assert.match(unknown.steps.at(-1).action, /no swirl needed/i);
assert.deepEqual(r155.steps.map((step) => [step.timeSeconds, step.waterTotal]), [[0, 45], [40, 108], [75, 240]]);
assert.equal(r155Extended.doseProfile, '155-extended');
assert.equal(r155Extended.waterGrams, 320);
assert.ok(r155Extended.totalBrewTimeSeconds > r155.totalBrewTimeSeconds);
assert.equal(validateKalitaCandidate({ ...r155, totalBrewTimeSeconds: 0 }).valid, false);
// Published Wave recipes (src/data/manualSources/kalita.js, Drop, Ozone,
// Onyx, Madcap) finish 2:30-4:00 and count the bloom pour inside a 30-45s
// bloom window. Large 185 doses split the water into several pours.
assert.equal(r155.totalBrewTimeSeconds, 165);
assert.equal(r185.totalBrewTimeSeconds, 195);
assert.equal(r30.totalBrewTimeSeconds, 225);
for (const dose of [15, 18, 20, 22, 25, 30, 36]) {
  const recipe = generateKalitaRecipe({}, { size: '185', dose });
  assert.ok(recipe.totalBrewTimeSeconds >= 150 && recipe.totalBrewTimeSeconds <= 240, `185 ${dose}g total ${recipe.totalBrewTime}`);
  assert.ok(recipe.steps[1].timeSeconds >= 40, `185 ${dose}g bloom window too short for the bloom pour`);
  assert.equal(recipe.steps.length - 1, dose > 22 ? 4 : 2, `185 ${dose}g pour count`);
  const largestPour = Math.max(...recipe.steps.slice(1).map((step, index) => step.waterTotal - recipe.steps[index].waterTotal));
  assert.ok(largestPour <= 200, `185 ${dose}g has a ${largestPour}g single pour`);
}
assert.deepEqual(r30.steps.map((step) => [step.timeSeconds, step.waterTotal]), [[0, 90], [45, 192], [70, 288], [95, 384], [120, 480]]);
assert.equal(r155Extended.steps.length - 1, 3);
console.log('kalita adapter passed');
