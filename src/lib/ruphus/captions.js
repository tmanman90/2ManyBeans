export const RUPHUS_CAPTIONS = Object.freeze({
  context_loading: 'I’m getting the lay of the land…',
  read_coffee_evidence: 'Looking at this coffee…',
  read_recipe: 'Reading the recipe…',
  read_tastings: 'Checking your last cups…',
  read_attempts: 'Looking at how it brewed…',
  resolve_coffee: 'Finding the coffee you mean…',
  propose_recipe_change: 'Working out one change…',
  regeneration: 'Let me put that more simply…',
  turn_interrupted: 'Professor Ruphus got cut off.',
  turn_failed: 'That response didn’t finish.',
});

export function ruphusCaption(frame = {}) {
  return RUPHUS_CAPTIONS[frame.name || frame.tool || frame.type] || 'I’m thinking it through…';
}
