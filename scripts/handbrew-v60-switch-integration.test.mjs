import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateV60Recipe } from '../src/lib/v60Adapter.js';
import { generateV60SwitchRecipe } from '../src/lib/v60SwitchAdapter.js';
import { generateV60HotWithFallback } from '../src/lib/v60Generation.js';
import { normalizeRecipeEvidence } from '../src/lib/recipeEvidence.js';
import { buildExtractionIntent } from '../src/lib/extractionIntent.js';
import { timingContextFromRecipe, buildTimingEvent, selectTimingMemory, normalizeTimingHistory } from '../src/lib/brewTimingMemory.js';

const hook = readFileSync(new URL('../src/hooks/useHandBrew.js', import.meta.url), 'utf8');
const modal = readFileSync(new URL('../src/components/HandBrewModal.jsx', import.meta.url), 'utf8');
const profile = readFileSync(new URL('../src/hooks/useUserProfile.jsx', import.meta.url), 'utf8');

// --- Preference default (R1) -------------------------------------------
assert.match(profile, /v60Variant: 'classic'/);

// --- Hook wiring: variant reaches the adapter and drives the cache key --
assert.match(hook, /handleV60VariantChange/);
assert.match(hook, /const v60Variant = activePreferences\?\.v60Variant === 'switch' \? 'switch' : 'classic'/);
assert.match(hook, /generateV60HotWithFallback\(\{/);
assert.match(hook, /variant: v60Variant/);
assert.match(hook, /V60_SWITCH_CONFIGURATION_KEY/);
assert.match(hook, /V60_SWITCH_ENGINE_VERSION/);
assert.match(hook, /validateV60SwitchCandidate/);

// --- UI source assertions (mirrors handbrew-kalita-integration.test.mjs) -
assert.match(modal, /V60VariantSwitch/);
assert.match(modal, /aria-label="V60 variant"/);
assert.match(modal, /recipe\.device === 'v60' && recipe\.variant === 'switch'/);
assert.match(modal, /Switch 03 · \{recipe\.doseProfile \|\| recipe\.roastPreset \|\| 'hybrid'\}/);
assert.match(modal, /V60_SWITCH_DOSE_BOUNDS/);
assert.match(modal, /waterTemp2/);

// --- Functional: variant reaches the adapter and is stamped on the candidate
const bean = { id: 'fixture-switch', process: 'washed', roastLevel: 'medium', sourceInsights: { brewGuidance: 'steady pour' } };
const evidence = normalizeRecipeEvidence(bean, { cupStructureFamily: 'washed-floral-clarity' });
const intent = buildExtractionIntent(evidence);

const classicResult = generateV60HotWithFallback({ intent, configuration: { dose: 18, grinder: 'fellow-ode-gen2', variant: 'classic' }, evidence, variant: 'classic' });
assert.equal(classicResult.recipe.variant, undefined, 'classic candidate must not carry a switch variant tag');
assert.equal(classicResult.recipe.device, 'v60');

const switchResult = generateV60HotWithFallback({ intent, configuration: { dose: 20, grinder: 'fellow-ode-gen2', variant: 'switch' }, evidence, variant: 'switch' });
assert.equal(switchResult.recipe.variant, 'switch', 'switch request must stamp variant: switch on the candidate');
assert.equal(switchResult.recipe.device, 'v60', 'variant is not a new device key (R1)');

// --- configurationKey differs classic vs switch (R8) ---------------------
const classicDirect = generateV60Recipe(intent, { dose: 18, grinder: 'fellow-ode-gen2' }, evidence);
const switchDirect = generateV60SwitchRecipe(intent, { dose: 20, grinder: 'fellow-ode-gen2', roast: 'medium' });
assert.notEqual(classicDirect.configurationKey, switchDirect.configurationKey);
assert.equal(classicDirect.configurationKey, 'v60:02:standard-paper');
assert.equal(switchDirect.configurationKey, 'v60:03:standard-paper:switch:hot');

// --- Legacy compatibility: a cached classic recipe (no variant field) must
// never be served for a switch request, and vice versa. The hook's
// candidateMatchesConfiguration branches on requestedVariant and always
// compares recipe.configurationKey against the variant-specific constant, so
// a legacy/classic-keyed cache entry can never satisfy a switch request.
assert.match(hook, /const requestedVariant = activePreferences\?\.v60Variant === 'switch' \? 'switch' : 'classic'/);
assert.match(hook, /\(recipe\.variant \|\| 'classic'\) === 'switch'/);
assert.match(hook, /\(recipe\.variant \|\| 'classic'\) === 'classic'/);

// --- Unknown persisted variant falls back to classic ----------------------
assert.match(hook, /const nextVariant = \['classic', 'switch'\]\.includes\(variant\) \? variant : 'classic'/);
const bogusFallback = generateV60HotWithFallback({ intent, configuration: { dose: 20, grinder: 'fellow-ode-gen2', variant: 'not-a-real-variant' }, evidence, variant: 'not-a-real-variant' });
assert.equal(bogusFallback.recipe.variant, undefined, 'unrecognized variant must route to the classic engine, not the switch engine');
assert.equal(bogusFallback.recipe.configurationKey, 'v60:02:standard-paper');

// --- Timing memory: v60Variant field present and differentiates matches --
const classicContext = timingContextFromRecipe({ beanId: bean.id, recipe: classicDirect, mode: 'hot' });
const switchContext = timingContextFromRecipe({ beanId: bean.id, recipe: switchDirect, mode: 'hot' });
assert.equal(classicContext.v60Variant, 'classic');
assert.equal(switchContext.v60Variant, 'switch');
assert.notEqual(classicContext.configurationKey, switchContext.configurationKey);

const switchEvent = buildTimingEvent({ ...switchContext, sessionId: 'switch-1', actualElapsedMs: 195000, completionKind: 'userFinished' });
assert.ok(switchEvent, 'switch timing event must build');
assert.equal(switchEvent.v60Variant, 'switch');
assert.equal(selectTimingMemory([switchEvent], switchContext).event.sessionId, 'switch-1', 'switch brews must match against switch brews');
assert.equal(selectTimingMemory([switchEvent], classicContext), null, 'a switch timing event must not surface as classic timing memory');

const historyWithBadVariant = normalizeTimingHistory([{ ...switchContext, sessionId: 'bad-1', actualElapsedMs: 1000, completionKind: 'userFinished', v60Variant: 'espresso' }]);
assert.equal(historyWithBadVariant.length, 0, 'an out-of-allowlist v60Variant must be rejected, mirroring kalitaSize allowlist handling');

console.log('handbrew V60 Switch integration passed (variant routing, cache identity, legacy compatibility, timing memory)');
