import assert from 'node:assert/strict';
import { generateV60IcedRecipe } from '../src/lib/v60IcedAdapter.js';
const partners = generateV60IcedRecipe({}, { dose: 16 });
assert.match(partners.steps.at(-1).action, /gentle carafe swirl/i);
assert.doesNotMatch(partners.steps.at(-1).action, /no final swirl/i);
const kurasu = generateV60IcedRecipe({ source: 'Kurasu staged iced' }, { dose: 16 });
assert.match(kurasu.steps.at(-1).action, /stir only as directed/i);
console.log('iced technique copy passed (Partners and Kurasu source-specific agitation)');
