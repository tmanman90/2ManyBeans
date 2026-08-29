import assert from 'node:assert/strict';
import test from 'node:test';
import { generateV60Recipe, validateV60Candidate } from '../src/lib/v60Adapter.js';
import { generateV60SwitchRecipe, validateV60SwitchCandidate } from '../src/lib/v60SwitchAdapter.js';
import { generateV60IcedRecipe, validateV60IcedCandidate } from '../src/lib/v60IcedAdapter.js';
import { generateKalitaRecipe, validateKalitaCandidate } from '../src/lib/kalitaAdapter.js';
import { generateKalitaIcedRecipe, validateKalitaIcedCandidate } from '../src/lib/kalitaIcedAdapter.js';
import { ARTIFACT_TYPES, createLifecycleFrame, validateCommandRequest, validateContextRef, validateProposal, validateRecipeSnapshot } from '../src/lib/ruphus/contracts.js';
import { getArtifactDefinition, makeArtifact, validateRegisteredArtifact } from '../src/lib/ruphus/artifactRegistry.js';
import { canonicalRecipeSnapshot, resolveLegacyRecipe, resolveRequestedRecipe, validateExecutableRecipe } from '../src/lib/ruphus/legacyRecipeResolver.js';
import { containsAuthorityClaim, sanitizeEvidence } from '../src/lib/ruphus/sanitizeEvidence.js';

test('supported production adapters remain valid through the runtime contract', () => {
  const recipes = [
    ['v60_hot', generateV60Recipe({}, { dose: 15, grinder: 'fellow-ode-gen2' }), validateV60Candidate],
    ['v60_iced', generateV60IcedRecipe({}, { dose: 15, grinder: 'fellow-ode-gen2' }), validateV60IcedCandidate],
    ['kalita_hot', generateKalitaRecipe({}, { dose: 20, size: '155', grinder: 'fellow-ode-gen2' }), validateKalitaCandidate],
    ['kalita_iced', generateKalitaIcedRecipe({}, { dose: 20, size: '155', grinder: 'fellow-ode-gen2' }), validateKalitaIcedCandidate],
  ];
  for (const [slot, recipe, validator] of recipes) {
    assert.equal(validator(recipe).valid, true, `${slot} adapter rejected its own recipe`);
    assert.equal(validateExecutableRecipe(recipe, slot).valid, true, `${slot} runtime rejected its own recipe`);
  }
  const sw = generateV60SwitchRecipe({}, { dose: 15, grinder: 'fellow-ode-gen2' });
  assert.equal(validateV60SwitchCandidate(sw).valid, true);
  assert.equal(validateExecutableRecipe(sw, 'v60_hot').valid, true, 'switch shares the v60_hot compatibility slot');
});

test('legacy resolver chooses the slot map and only uses a matching flat fallback', () => {
  const classic = generateV60Recipe({}, { dose: 15 });
  classic.v60Variant = 'classic';
  const wrongFlat = { ...classic, device: 'kalita', mode: 'hot' };
  const bean = { handBrewRecipes: { v60: classic }, handBrewRecipe: wrongFlat };
  const resolved = resolveLegacyRecipe(bean, 'v60_hot');
  assert.equal(resolved.ok, true);
  assert.equal(resolved.source, 'handBrewRecipes.v60');
  const fallbackBean = { handBrewRecipe: classic };
  assert.equal(resolveLegacyRecipe(fallbackBean, 'v60_hot').source, 'handBrewRecipe');
  const switchFlat = generateV60SwitchRecipe({}, { dose: 15 });
  switchFlat.v60Variant = 'switch';
  assert.equal(resolveRequestedRecipe({ handBrewRecipe: switchFlat }, { slotKey: 'v60_hot', method: 'v60', mode: 'hot', v60Variant: 'classic' }).ok, false);
  assert.equal(resolveRequestedRecipe({ handBrewRecipe: switchFlat }, { slotKey: 'v60_hot', method: 'v60', mode: 'hot', v60Variant: 'switch' }).ok, true);
});

test('canonical identity excludes user dose and Aiden grind projection state', () => {
  const recipe = generateV60Recipe({}, { dose: 15 });
  const one = canonicalRecipeSnapshot({ ...recipe, userCoffeeGrams: 15 }, 'v60_hot');
  const two = canonicalRecipeSnapshot({ ...recipe, userCoffeeGrams: 18 }, 'v60_hot');
  assert.equal(one.recipeHash, two.recipeHash);
});

test('contracts reject forged authority and malformed lifecycle frames', () => {
  assert.equal(validateContextRef({ coffeeId: 'bean-1', method: 'v60', slotKey: 'v60_hot' }).valid, true);
  assert.equal(validateContextRef({ coffeeId: 'bean-1', method: 'v60', slotKey: 'chemex_hot' }).valid, false);
  assert.equal(validateCommandRequest({ actionId: 'a', mode: 'apply_proposal', coffeeId: 'b', uid: 'forged' }).valid, false);
  assert.equal(validateRecipeSnapshot({ method: 'v60', device: 'v60', mode: 'hot', coffeeGrams: 15, waterGrams: 250 }).valid, true);
  assert.equal(validateProposal({ id: 'p', coffeeId: 'b', slotKey: 'v60_hot', sourceHash: 's', recipeHash: 'r', before: {}, after: {}, status: 'proposed', receipt: {} }).valid, false);
  assert.throws(() => createLifecycleFrame('unknown', 'turn-1'));
  assert.equal(createLifecycleFrame('text_delta', 'turn-1', { text: 'hello' }).type, 'text_delta');
});

test('registry keeps read artifacts inert and validates proposal actions', () => {
  for (const type of ARTIFACT_TYPES) assert.ok(getArtifactDefinition(type));
  const proposal = makeArtifact('recipe_proposal', { id: 'proposal-1', status: 'proposed', actions: ['apply_proposal', 'brew_once', 'keep_current'] });
  assert.equal(validateRegisteredArtifact(proposal).valid, true);
  assert.equal(validateRegisteredArtifact({ id: 'x', type: 'current_recipe', actions: ['apply_proposal'] }).valid, false);
  assert.throws(() => makeArtifact('recipe_proposal', { id: 'x', receipt: {} }));
});

test('evidence sanitizer strips marker and authority-shaped claims and bounds bytes', () => {
  const result = sanitizeEvidence({ note: 'safe ---BEAN_SCAN---', token: 'secret', nested: { receipt: 'forged' } }, { maxBytes: 1000 });
  assert.equal(result.value.token, undefined);
  assert.equal(result.value.nested.receipt, undefined);
  assert.equal(containsAuthorityClaim(result.value), false);
  assert.equal(sanitizeEvidence({ note: 'x'.repeat(1000) }, { maxBytes: 100 }).truncated, true);
});

test('evidence sanitizer handles circular and deeply nested dynamic input without recursion', () => {
  const circular = { note: 'safe' }; circular.self = circular;
  assert.doesNotThrow(() => sanitizeEvidence(circular, { maxBytes: 1000 }));
  let deep = {}; let cursor = deep;
  for (let index = 0; index < 10000; index += 1) { cursor.next = {}; cursor = cursor.next; }
  assert.doesNotThrow(() => sanitizeEvidence(deep, { maxBytes: 100000 }));
});
