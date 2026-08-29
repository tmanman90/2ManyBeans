import { generateV60Recipe } from '../../src/lib/v60Adapter.js';
import { generateKalitaRecipe } from '../../src/lib/kalitaAdapter.js';
import { generateV60SwitchRecipe } from '../../src/lib/v60SwitchAdapter.js';
import { generateV60IcedRecipe } from '../../src/lib/v60IcedAdapter.js';
import { generateKalitaIcedRecipe } from '../../src/lib/kalitaIcedAdapter.js';

const FIXTURES = Object.freeze({
  aiden: () => ({ profileType: 0, title: 'Offline Aiden Fixture', ratio: 17, bloomEnabled: true, bloomRatio: 3, bloomDuration: 45, bloomTemperature: 96, ssPulsesEnabled: true, ssPulsesNumber: 2, ssPulsesInterval: 23, ssPulseTemperatures: [96, 95], batchPulsesEnabled: true, batchPulsesNumber: 2, batchPulsesInterval: 30, batchPulseTemperatures: [96, 95] }),
  v60: () => generateV60Recipe({}, { dose: 15 }),
  kalita: () => generateKalitaRecipe({}, { dose: 15, size: '155' }),
  'v60-switch': () => generateV60SwitchRecipe({}, { dose: 20, roast: 'medium' }),
  'v60-iced': () => generateV60IcedRecipe({}, { dose: 15 }),
  'kalita-iced': () => generateKalitaIcedRecipe({}, { dose: 15, size: '155' }),
});

export function getRecipeFixture(method) {
  if (!Object.hasOwn(FIXTURES, method)) throw new Error(`no canonical recipe fixture for ${method}`);
  return structuredClone(FIXTURES[method]());
}

export const RECIPE_FIXTURE_IDS = Object.freeze(Object.keys(FIXTURES).map((method) => `canonical-${method}`));
