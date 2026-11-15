import { selectTimingMemory, timingContextFromRecipe } from '../../src/lib/brewTimingMemory.js';
// Read-time projection only. Attempt.dose binds the saved source for optimistic
// concurrency; snapshot is the recipe executed after a Brew once dose resize.
const finite = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
const date = row => Date.parse(row.completedAt || row.createdAt || row.date || '') || 0;
export function projectBrewEvidence(attempts = [], timingMemory = [], tastings = []) {
  timingMemory = Array.isArray(timingMemory) ? timingMemory : [];
  tastings = Array.isArray(tastings) ? tastings : [];
  return attempts.filter(attempt => attempt && typeof attempt === 'object').map(attempt => {
    const recipe = attempt.snapshot && typeof attempt.snapshot === 'object' && !Array.isArray(attempt.snapshot) ? attempt.snapshot : null;
    if (!recipe) return { ...attempt }; // Historical flat records remain descriptive, never executable.
    const dose = recipe.coffeeGrams ?? recipe.userCoffeeGrams ?? recipe.dose;
    const water = recipe.waterGrams ?? recipe.water;
    const timingContext = timingContextFromRecipe({ beanId: attempt.coffeeId, recipe, mode: recipe.mode || (recipe.isIced ? 'iced' : 'hot') });
    // Reuse the timer's source/configuration/clock contract, then require the
    // exact attempt and session. Validate separately so duplicate sessions
    // with conflicting elapsed times remain ambiguous rather than deduped.
    const timing = timingMemory.filter(event =>
      event && attempt.id && event.attemptId === attempt.id
      && (!attempt.sessionId || event.sessionId === attempt.sessionId)
      && (!attempt.revisionId || event.revisionId === attempt.revisionId)
      && event.doseGrams === dose
      && finite(event.actualElapsedMs)
      && selectTimingMemory([event], timingContext));
    // Conflicting measurements are ambiguous: do not pick one by array order.
    const elapsed = timing.length && new Set(timing.map(event => event.actualElapsedMs)).size === 1 ? timing[0].actualElapsedMs : null;
    const feedback = tastings.filter(item => item && attempt.id && item.attemptId === attempt.id)
      .map(item => item.notes || item.note).filter(value => typeof value === 'string').slice(0, 3);
    const completed = attempt.status === 'completed';
    return { ...attempt, dose, water, grind: recipe.grindSize?.setting ?? recipe.grind,
      temperature: recipe.waterTemp?.celsius ?? recipe.temperature,
      ratio: recipe.ratio, completed,
      actualElapsedMs: completed ? elapsed : null,
      drawdown: completed && elapsed != null ? `measured ${Math.floor(Math.round(elapsed / 1000) / 60)}:${String(Math.round(elapsed / 1000) % 60).padStart(2, '0')}` : null,
      notes: feedback.length ? feedback.join(' | ') : attempt.notes || attempt.note,
      feedback,
    };
  }).sort((a, b) => date(b) - date(a));
}
