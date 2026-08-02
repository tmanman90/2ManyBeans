import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { selectTimingMemory, timingContextFromRecipe } from '../src/lib/brewTimingMemory.js';

const modal = readFileSync(new URL('../src/components/HandBrewModal.jsx', import.meta.url), 'utf8');
const chat = readFileSync(new URL('../src/tabs/ChatTab.jsx', import.meta.url), 'utf8');
assert.match(modal, /TimingMemoryHint/);
assert.match(modal, /selectTimingMemory\(bean\?\.handBrewTimingMemory, timingContext\)/);
assert.match(modal, /scaleRecipeForDose\(recipe, effectiveDose\)/);
assert.match(modal, /onSaveTimingEvent=\{onSaveTimingEvent\}/);
assert.match(modal, /current guide remains/);
assert.match(modal, /mode: 'iced'/);
assert.match(modal, /TimingMemoryHint memory=\{icedTimingMemory\}/);
assert.match(chat, /useHandBrew\(ephemeralUpdateBean, saveHandBrewTiming\)/);
assert.match(chat, /onSaveTimingEvent=\{handBrew\.saveTimingEvent\}/);

const recipe = { device: 'kalita', kalitaSize: '155', coffeeGrams: 20, totalBrewTimeSeconds: 240, candidate: true, engineVersion: 'v1', rulesVersion: 'r1' };
const context = timingContextFromRecipe({ beanId: 'bombe', recipe });
const prior = { sessionId: '15g', beanId: 'bombe', device: 'kalita', kalitaSize: '155', mode: 'hot', doseGrams: 15, actualElapsedMs: 182000, targetMs: 240000, completionKind: 'natural', createdAt: 1, lineage: context.lineage };
const memory = selectTimingMemory([prior], context);
assert.equal(memory, null);
assert.equal(selectTimingMemory([{ ...prior, beanId: 'other' }], context), null);
console.log('handbrew timing memory integration passed');
