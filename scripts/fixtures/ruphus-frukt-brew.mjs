// Sanitized reproduction of the FRUKT Kalita trial: synthetic owner/document IDs.
import { timingContextFromRecipe } from '../../src/lib/brewTimingMemory.js';
import { generateKalitaRecipe } from '../../src/lib/kalitaAdapter.js';
import { createRecipePreview } from '../../src/lib/ruphus/recipePreview.js';
export function fruktFixture() {
  const coffee = { id: 'fixture-coffee', name: 'Casa Almeida Barreto', roaster: 'FRUKT', origin: 'Brazil', process: 'Natural' };
  const saved = createRecipePreview({ recipe: generateKalitaRecipe(coffee, { dose: 24, grinder: 'fellow-ode-gen2', kalitaSize: '185' }), dose: 24, ratio: 16.5 });
  Object.assign(saved, { slotKey: 'kalita_hot', coffeeGrams: 24, userCoffeeGrams: 24, waterGrams: 396, ratio: '1:16.5', waterTemp: { celsius: 93, fahrenheit: 199 }, grindSize: { ...saved.grindSize, setting: '6.2', microns: 747 } });
  const executed = createRecipePreview({ recipe: saved, slotKey: 'kalita_hot', dose: 18, ratio: 15.5 });
  const untried = createRecipePreview({ recipe: saved, slotKey: 'kalita_hot', dose: 24, ratio: 14.5 });
  const attempt = { id: 'fixture-attempt', coffeeId: coffee.id, sessionId: 'fixture-attempt', slotKey: 'kalita_hot', status: 'completed', dose: 24, createdAt: '2026-10-11T23:34:26.711Z', completedAt: '2026-10-11T23:37:54.953Z', snapshot: executed };
  coffee.handBrewTimingMemory = [{ ...timingContextFromRecipe({ beanId: coffee.id, recipe: executed }), attemptId: attempt.id, sessionId: attempt.sessionId, doseGrams: 18, actualElapsedMs: 203813, targetMs: 300000, completionKind: 'userFinished' }];
  return { coffee, saved, executed, untried, attempt };
}
