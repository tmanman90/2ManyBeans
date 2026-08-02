import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mergeTimingEvent, timingContextFromRecipe } from '../src/lib/brewTimingMemory.js';

const source = readFileSync(new URL('../src/hooks/useAppData.js', import.meta.url), 'utf8');
assert.match(source, /runTransaction/);
assert.match(source, /saveHandBrewTiming/);
assert.match(source, /handBrewTimingMemory: history/);
assert.match(source, /return \{ status: 'failed'/);
const handBrew = readFileSync(new URL('../src/hooks/useHandBrew.js', import.meta.url), 'utf8');
assert.match(handBrew, /timingSaveInFlightRef/);
assert.doesNotMatch(source, /handBrewTimingMemory.*cacheWrite/);

const recipe = { device: 'kalita', kalitaSize: '155', coffeeGrams: 15, totalBrewTimeSeconds: 240, candidate: true, engineVersion: 'v1', rulesVersion: 'r1' };
const lineage = timingContextFromRecipe({ beanId: 'bean-1', recipe }).lineage;
const event = { sessionId: 'one', beanId: 'bean-1', device: 'kalita', kalitaSize: '155', mode: 'hot', doseGrams: 15, actualElapsedMs: 182000, targetMs: 240000, completionKind: 'manualEarly', createdAt: 1, lineage };
assert.equal(mergeTimingEvent([event], event).length, 1, 'a transaction retry remains idempotent');
assert.equal(mergeTimingEvent([], { ...event, beanId: null }).length, 0, 'invalid event never reaches persistence');
console.log('brew timing persistence contract passed');
