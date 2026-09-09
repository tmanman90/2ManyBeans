import { canonicalHash } from './contracts.js';

const recipeSummary = (recipe = {}) => ({
  technique: recipe.techniqueLabel || recipe.technique || null,
  dose: recipe.coffeeGrams ?? recipe.dose ?? null,
  water: recipe.waterGrams ?? recipe.water ?? null,
  ratio: recipe.ratio ?? null,
  grind: recipe.grindSize?.setting ?? recipe.grind ?? null,
  temperatureC: recipe.waterTemp?.celsius ?? recipe.temperatureC ?? null,
  totalBrewTime: recipe.totalBrewTime ?? null,
  totalBrewTimeSeconds: recipe.totalBrewTimeSeconds ?? recipe.guideTargetSeconds ?? null,
  waterAdditionsIncludingBloom: (recipe.steps || []).filter((step, index, steps) => Number.isFinite(step.waterTotal) && step.waterTotal > (index ? Number(steps[index - 1].waterTotal) || 0 : 0)).length,
  scheduleNote: 'Water additions include the initial bloom/first pour. The last step timestamp is not the finish/drawdown time.',
  steps: (recipe.steps || []).slice(0, 12).map(step => ({
    time: step.time || null, action: String(step.action || '').slice(0, 500), waterTotal: step.waterTotal ?? null,
  })),
});

// Only call with the authenticated server session, never request-body artifacts.
export function recentProposalReviews(session, refs = {}, binding = {}) {
  return (session?.messages || []).slice(session?.boundaryIndex || 0)
    .flatMap(message => message.artifacts || [])
    .filter(item => item?.type === 'recipe_proposal' && item.before && item.after)
    .map(item => {
      const coffeeRef = Object.entries(refs).find(([, id]) => id === item.coffeeId)?.[0];
      if (!coffeeRef || (binding.coffeeRef && binding.coffeeRef !== coffeeRef) || (binding.slot && binding.slot !== item.slotKey)) return null;
      return {
        coffeeRef, slot: item.slotKey, status: item.status || 'proposed',
        name: item.techniqueExperiment?.name || item.after.techniqueLabel || null,
        before: recipeSummary(item.before), proposed: recipeSummary(item.after),
        comparisonBasis: 'Saved recipe when this review was prepared; not proof of a save.',
      };
    }).filter(Boolean).slice(-4);
}

export const isAlternativeRequest = text => /\b(?:different|another|alternative)\b/i.test(text)
  && !/\b(?:how|why|explain|compare|difference)\b/i.test(text);

export function sameRecipeReview(left, right) {
  return canonicalHash(recipeSummary(left)) === canonicalHash(recipeSummary(right));
}
