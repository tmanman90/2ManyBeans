import assert from 'node:assert/strict';
import {
  generateV60TechniqueOption,
  getV60TechniqueOption,
  listV60TechniqueOptions,
  listV60TechniqueReferences,
} from '../src/lib/ruphus/techniqueOptions.js';
import {
  generateV60Recipe,
  generateV60RecipeForTechnique,
  validateV60Candidate,
} from '../src/lib/v60Adapter.js';
import { buildTimerSteps } from '../src/lib/brewTimerSteps.js';

const all = listV60TechniqueOptions();
assert.deepEqual(all.map((option) => option.sourceId), [
  'hoffmann-one-cup-v1',
  'hoffmann-large-batch-v1',
  'kasuya-46-v1',
  'heart-continuous-v1',
]);
assert.ok(all.every((option) => option.timerReady && option.executable));
assert.ok(all.every((option) => option.sourceId && option.familyId && option.attribution?.canonicalUrl));
assert.ok(all.every((option) => option.bounds.dose[0] === 12 && option.bounds.dose[1] === 30));
assert.ok(!all.some((option) => option.sourceId === 'rao-two-stage-v1' || option.sourceId === 'kurasu-controlled-pulses-v1'));

assert.equal(listV60TechniqueOptions({ currentFamilyId: 'hoffmann-small-pulses' }).some((option) => option.familyId === 'hoffmann-small-pulses'), false);
assert.equal(listV60TechniqueOptions({ currentSourceId: 'hoffmann-one-cup-v1' }).length, all.length - 1);
assert.equal(listV60TechniqueOptions({ currentTechniqueId: 'not-known' }).length, all.length);
assert.equal(listV60TechniqueOptions({ excludeIds: ['kasuya-46-v1'] }).some((option) => option.sourceId === 'kasuya-46-v1'), false);
assert.equal(listV60TechniqueOptions({ excludedIds: ['heart-continuous-v1'] }).some((option) => option.familyId === 'gentle-main-pour'), false);
assert.equal(getV60TechniqueOption('kasuya-coarse-pulses').sourceId, 'kasuya-46-v1');

const explicit = generateV60TechniqueOption({ familyId: 'kasuya-coarse-pulses', intent: { finesRisk: 'high' }, configuration: { dose: 20 } });
assert.equal(explicit.familyId, 'kasuya-coarse-pulses');
assert.equal(explicit.recipe.technique, 'kasuya-coarse-pulses');
assert.equal(explicit.recipe.sourceLineage.sourceIds[0], 'kasuya-46-v1');
assert.equal(validateV60Candidate(explicit.recipe).valid, true);
assert.ok(buildTimerSteps(explicit.recipe).length > 0);
assert.equal(explicit.recipe.steps[0].waterTotal, 50);

const forcedHeart = generateV60RecipeForTechnique('heart-continuous-v1', { techniquePreference: 'bloom-led-pulse' }, { dose: 20 });
assert.equal(forcedHeart.technique, 'gentle-main-pour');
assert.equal(forcedHeart.sourceLineage.sourceIds[0], 'heart-continuous-v1');
assert.equal(validateV60Candidate(forcedHeart).valid, true);
assert.notEqual(forcedHeart.technique, generateV60Recipe({ techniquePreference: 'bloom-led-pulse' }, { dose: 20 }).technique);

const scaled = generateV60RecipeForTechnique('hoffmann-one-cup-v1', {}, { dose: 20 });
assert.equal(scaled.sourceLineage.status, 'scaled');
assert.equal(scaled.sourceLineage.parameterSources.water, 'v60-dose-scaling-v1');
assert.equal(scaled.sourceLineage.sourceIds[0], 'hoffmann-one-cup-v1');
assert.equal(scaled.waterGrams, 333);

assert.throws(() => generateV60RecipeForTechnique('rao-two-stage-v1', {}, { dose: 20 }), /not an executable registry option/);
assert.throws(() => generateV60TechniqueOption('kurasu-controlled-pulses-v1', {}, { dose: 14 }), /reference-only/);
assert.throws(() => generateV60TechniqueOption('made-up-source-v1', {}, { dose: 20 }), /unknown or unsupported/i);
assert.throws(() => generateV60TechniqueOption('kasuya-46-v1', {}, { dose: 31 }), /between 12g and 30g/);
assert.throws(() => generateV60TechniqueOption('kasuya-46-v1', {}, { brewer: 'Aiden', dose: 20 }), /hot V60 brewer/);

const refs = listV60TechniqueReferences();
assert.equal(refs.find((source) => source.sourceId === 'rao-two-stage-v1').timerReady, false);
assert.equal(refs.find((source) => source.sourceId === 'kurasu-controlled-pulses-v1').referenceOnly, true);
console.log(`Ruphus V60 technique options passed (${all.length} executable, ${refs.length} reference-only)`);
