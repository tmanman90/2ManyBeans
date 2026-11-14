import assert from 'node:assert/strict';
import {
  generateV60TechniqueOption,
  getV60TechniqueOption,
  listV60TechniqueOptions,
  listV60TechniqueReferences,
} from '../src/lib/ruphus/techniqueOptions.js';
import {
  createV60RatioExperiment,
  generateV60Recipe,
  generateV60RecipeForTechnique,
  validateV60Candidate,
} from '../src/lib/v60Adapter.js';
import { buildTimerSteps } from '../src/lib/brewTimerSteps.js';
import { createRecipePreview } from '../src/lib/ruphus/recipePreview.js';
import { buildProposal, persistProposal } from '../api/_lib/ruphusRepository.js';
import { canonicalRecipeSnapshot } from '../src/lib/ruphus/legacyRecipeResolver.js';
import { Firestore } from '@google-cloud/firestore';

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
assert.ok(all.every((option) => option.comparisonStatus === 'unknown-current-technique'));
assert.ok(!all.some((option) => option.sourceId === 'rao-two-stage-v1' || option.sourceId === 'kurasu-controlled-pulses-v1'));

assert.equal(listV60TechniqueOptions({ currentFamilyId: 'hoffmann-small-pulses' }).some((option) => option.familyId === 'hoffmann-small-pulses'), false);
assert.equal(listV60TechniqueOptions({ currentSourceId: 'hoffmann-one-cup-v1' }).length, all.length - 1);
const unknownCurrent = listV60TechniqueOptions({ currentTechniqueId: 'not-known' });
assert.equal(unknownCurrent.length, all.length);
assert.ok(unknownCurrent.every((option) => option.comparisonStatus === 'unknown-current-technique'));
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

const reviewed = generateV60RecipeForTechnique('hoffmann-one-cup-v1', {
  targetRatio: 16,
  targetTemperatureC: 94,
  reviewedGrindSize: { setting: '5.5', microns: 700, description: 'medium', grinderSpecific: true },
}, { dose: 20 });
assert.equal(reviewed.ratio, '1:16');
assert.equal(reviewed.waterGrams, 320);
assert.equal(reviewed.waterTemp.celsius, 94);
assert.equal(reviewed.grindSize.setting, '5.5');
assert.equal(reviewed.sourceLineage.parameterSources.ratio, 'v60-adaptation-bounded-v1');
assert.equal(reviewed.sourceLineage.parameterSources.grind, 'v60-adaptation-bounded-v1');
assert.ok(reviewed.sourceLineage.changedFields.includes('ratio'));
assert.ok(reviewed.sourceLineage.changedFields.includes('grind'));
assert.equal(validateV60Candidate(reviewed).valid, true);
assert.ok(buildTimerSteps(reviewed).length > 0);

const kasuyaReviewedRatio = generateV60RecipeForTechnique('kasuya-46-v1', { targetRatio: 16 }, { dose: 20 });
assert.equal(kasuyaReviewedRatio.waterGrams, 320);
assert.equal(kasuyaReviewedRatio.steps.at(-1).waterTotal, 320);
assert.equal(kasuyaReviewedRatio.sourceLineage.status, 'adapted');
assert.equal(kasuyaReviewedRatio.sourceLineage.parameterSources.ratio, 'v60-adaptation-bounded-v1');
assert.equal(validateV60Candidate(kasuyaReviewedRatio).valid, true);
assert.ok(buildTimerSteps(kasuyaReviewedRatio).length > 0);

// Ratio 10–25 is an explicit app-authored experiment envelope, distinct from
// normal source-family selection (which remains bounded at 15–18.5).
const kasuyaSource = generateV60RecipeForTechnique('kasuya-46-v1', {}, { dose: 20, grinder: 'fellow-ode-gen2' });
const kasuyaSnapshot = structuredClone(kasuyaSource);
const strongerRatio = createV60RatioExperiment(kasuyaSource, 14);
assert.equal(strongerRatio.ratio, '1:14');
assert.equal(strongerRatio.waterGrams, 280);
assert.equal(strongerRatio.steps.at(-1).waterTotal, 280);
assert.ok(strongerRatio.steps.every((step, index) => index === 0 || step.waterTotal >= strongerRatio.steps[index - 1].waterTotal));
assert.deepEqual(strongerRatio.steps.map((step) => step.timeSeconds), kasuyaSource.steps.map((step) => step.timeSeconds));
assert.deepEqual(strongerRatio.grindSize, kasuyaSource.grindSize);
assert.deepEqual(strongerRatio.waterTemp, kasuyaSource.waterTemp);
assert.equal(strongerRatio.sourceLineage.adaptationRuleId, 'v60-explicit-ratio-adaptation-v1');
assert.equal(strongerRatio.sourceLineage.parameterSources.ratio, 'v60-explicit-ratio-adaptation-v1');
assert.equal(strongerRatio.sourceLineage.parameterSources.water, 'v60-explicit-ratio-adaptation-v1');
assert.equal(strongerRatio.sourceLineage.parameterSources.bloom, 'v60-explicit-ratio-adaptation-v1');
assert.ok(strongerRatio.sourceLineage.changedFields.includes('ratio'));
assert.ok(strongerRatio.sourceLineage.changedFields.includes('water'));
assert.ok(strongerRatio.sourceLineage.changedFields.includes('bloom'));
assert.equal(strongerRatio.sourceLineage.sourceIds[0], 'kasuya-46-v1');
assert.equal(strongerRatio.sourceLineage.status, 'adapted');
assert.equal(validateV60Candidate(strongerRatio).valid, true);
assert.deepEqual(kasuyaSource, kasuyaSnapshot, 'ratio experiments do not mutate the original source recipe');
assert.throws(() => createV60RatioExperiment({ ...kasuyaSource, ratio: '1:14' }, 14), /cannot safely support/);
const alternateRatio = createRecipePreview({ recipe: kasuyaSource, dose: 20, targetRatio: 14.5 });
assert.equal(alternateRatio.ratio, '1:14.5');
assert.equal(alternateRatio.waterGrams, 290);
assert.equal(alternateRatio.sourceLineage.adaptationRuleId, 'v60-explicit-ratio-adaptation-v1');
const resizedExperiment = createRecipePreview({ recipe: strongerRatio, dose: 25 });
assert.equal(resizedExperiment.ratio, '1:14');
assert.equal(resizedExperiment.coffeeGrams, 25);
assert.equal(resizedExperiment.waterGrams, 350);
assert.equal(resizedExperiment.steps.at(-1).waterTotal, 350);
assert.equal(resizedExperiment.sourceLineage.adaptationRuleId, 'v60-explicit-ratio-adaptation-v1');
assert.throws(() => createV60RatioExperiment(kasuyaSource, 9), /between 10 and 25/);
assert.throws(() => createV60RatioExperiment(kasuyaSource, 26), /between 10 and 25/);

// The Admin Firestore serializer rejects undefined values even though the
// recipe/proposal contracts otherwise permit optional fields. Keep the
// generated proposal shape directly serializable for the real persistence
// boundary (no network or transaction is used by this regression).
const firestoreSerializer = new Firestore({ projectId: 'ruphus-local-regression' })._serializer;
assert.throws(() => firestoreSerializer.encodeFields({ sourceLineage: { canonicalUrls: undefined } }), /Cannot encode value: undefined/);
const firestoreBefore = { ...generateV60Recipe({}, { dose: 20 }), method: 'v60', device: 'v60', mode: 'hot' };
const firestoreOption = generateV60TechniqueOption('hoffmann-large-batch', {}, { dose: 20 });
const firestorePreview = createRecipePreview({ recipe: firestoreOption.recipe, dose: 20, ratio: 16.65 });
const firestoreAfter = { ...firestorePreview, method: 'v60', device: 'v60', mode: 'hot' };
const firestoreProposal = buildProposal({ proposalId: 'proposal-firestore-regression', uid: 'owner-1', coffeeId: 'coffee-1', slotKey: 'v60_hot', sessionId: 'session-firestore-regression', before: firestoreBefore, after: firestoreAfter, sourceRevisionHash: 'source-hash', createdAt: '2026-09-09T00:00:00.000Z' });
assert.doesNotThrow(() => firestoreSerializer.encodeFields(firestoreProposal));

// An active Firestore revision is the production path used by the endpoint.
// Its legacy method label must be normalized for the proposal contract while
// retaining the exact active revision identity and source hash.
const legacyBefore = generateV60Recipe({}, { dose: 20 });
const legacySnapshot = { ...legacyBefore, method: 'pour-over' };
const legacySourceHash = canonicalRecipeSnapshot(legacySnapshot, 'v60_hot').recipeHash;
const legacyRevision = { id: 'revision-legacy-v60', coffeeId: 'coffee-legacy', slotKey: 'v60_hot', snapshot: legacySnapshot, snapshotHash: legacySourceHash };
const legacyProposalWrites = [];
const ref = (path) => {
  const value = { path, collection: (name) => ref(`${path}/${name}`), doc: (id) => ref(`${path}/${id}`) };
  value.where = () => value;
  return value;
};
const db = { collection: (name) => ref(name), runTransaction: async (work) => work({
  get: async (target) => target.path.endsWith('/beans/coffee-legacy')
    ? { exists: true, data: () => ({ id: 'coffee-legacy', activeRevisionIds: { v60_hot: legacyRevision.id }, handBrewRecipes: { v60: legacySnapshot } }) }
    : target.path.endsWith(`/recipeRevisions/${legacyRevision.id}`)
      ? { exists: true, data: () => legacyRevision }
      : { docs: [] },
  create: (target, value) => legacyProposalWrites.push({ target, value }),
}) };
const persistedLegacyProposal = await persistProposal({ db, uid: 'owner-1', coffeeId: 'coffee-legacy', slotKey: 'v60_hot', sessionId: 'session-legacy-v60', after: firestoreAfter, proposalId: 'proposal-legacy-v60', now: () => '2026-09-09T00:00:00.000Z' });
assert.equal(persistedLegacyProposal.before.method, 'v60');
assert.equal(persistedLegacyProposal.sourceRevisionId, legacyRevision.id);
assert.equal(persistedLegacyProposal.sourceHash, legacySourceHash);
assert.equal(legacyProposalWrites.length, 1);
assert.doesNotThrow(() => firestoreSerializer.encodeFields(legacyProposalWrites[0].value));

assert.throws(() => generateV60RecipeForTechnique('rao-two-stage-v1', {}, { dose: 20 }), /not an executable registry option/);
assert.throws(() => generateV60TechniqueOption('kurasu-controlled-pulses-v1', {}, { dose: 14 }), /reference-only/);
assert.throws(() => generateV60TechniqueOption('made-up-source-v1', {}, { dose: 20 }), /unknown or unsupported/i);
assert.throws(() => generateV60TechniqueOption('kasuya-46-v1', {}, { dose: 31 }), /between 12g and 30g/);
assert.throws(() => generateV60TechniqueOption('kasuya-46-v1', {}, { brewer: 'Aiden', dose: 20 }), /hot V60 brewer/);
assert.throws(() => generateV60RecipeForTechnique('kasuya-46-v1', { targetRatio: 19 }, { dose: 20 }), /reviewed ratio must be between 15 and 18.5/);
assert.throws(() => generateV60RecipeForTechnique('kasuya-46-v1', { targetTemperatureC: 101 }, { dose: 20 }), /reviewed temperature must be between 92C and 100C/);

const refs = listV60TechniqueReferences();
assert.equal(refs.find((source) => source.sourceId === 'rao-two-stage-v1').timerReady, false);
assert.equal(refs.find((source) => source.sourceId === 'kurasu-controlled-pulses-v1').referenceOnly, true);
console.log(`Ruphus V60 technique options passed (${all.length} executable, ${refs.length} reference-only)`);
