import { validateKalitaRecipe } from './kalita-recipe-contract.test.mjs';

export function normalizeRecipe(recipe) {
  const validation = validateKalitaRecipe(recipe);
  if (!validation.valid) return { state: 'unknown', validationFailures: validation.failures };
  return {
    state: 'valid', dose: recipe.coffeeGrams, water: recipe.waterGrams, ratio: recipe.ratio,
    temperature: recipe.waterTemp.celsius, grindSetting: String(recipe.grindSize.setting), grindMicrons: recipe.grindSize.microns,
    technique: recipe.technique || 'unknown', steps: recipe.steps.map(({ timeSeconds, waterTotal }) => ({ timeSeconds, waterTotal })),
    totalDuration: recipe.totalBrewTimeSeconds, drawdownTarget: recipe.drawdownTarget || 'unknown',
    rationale: recipe.reasoning || recipe.rationale || '', provenance: recipe.provenance || [],
  };
}

export function compareRecipes(current, candidate) {
  const left = normalizeRecipe(current);
  const right = normalizeRecipe(candidate);
  if (left.state !== 'valid' || right.state !== 'valid') return { outcome: 'unknown', current: left, candidate: right, deltas: [] };
  const physicalFields = ['dose', 'water', 'ratio', 'temperature', 'grindSetting', 'grindMicrons', 'technique', 'steps', 'totalDuration', 'drawdownTarget'];
  const deltas = physicalFields.filter((key) => JSON.stringify(left[key]) !== JSON.stringify(right[key])).map((key) => ({ field: key, type: 'physical' }));
  if (!deltas.length && left.rationale !== right.rationale) deltas.push({ field: 'rationale', type: 'explanation-only' });
  return { outcome: 'compared', current: left, candidate: right, deltas };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = compareRecipes(JSON.parse(process.argv[2] || 'null'), JSON.parse(process.argv[3] || 'null'));
  console.log(JSON.stringify(report, null, 2));
}
