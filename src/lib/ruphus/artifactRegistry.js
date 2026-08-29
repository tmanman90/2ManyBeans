import { ARTIFACT_TYPES, ACTION_STATES, validateArtifact } from './contracts.js';

const inert = Object.freeze({ actions: [], authority: 'coffee-read-only' });

export const ARTIFACT_REGISTRY = Object.freeze({
  coffee_context: Object.freeze({ type: 'coffee_context', label: 'Coffee context', ...inert }),
  current_recipe: Object.freeze({ type: 'current_recipe', label: 'Current recipe', ...inert }),
  recipe_proposal: Object.freeze({ type: 'recipe_proposal', label: 'Recipe proposal', actions: ['apply_proposal', 'brew_once', 'keep_current'], authority: 'coffee-proposal' }),
  brew_comparison: Object.freeze({ type: 'brew_comparison', label: 'Brew comparison', ...inert }),
  brew_history_chart: Object.freeze({ type: 'brew_history_chart', label: 'Brew history', ...inert }),
  data_gap: Object.freeze({ type: 'data_gap', label: 'More information needed', actions: ['choose'], authority: 'coffee-read-only' }),
});

export function getArtifactDefinition(type) { return ARTIFACT_REGISTRY[type] || null; }

export function validateRegisteredArtifact(artifact) {
  const result = validateArtifact(artifact);
  if (!result.valid) return result;
  const definition = getArtifactDefinition(artifact.type);
  if (!definition) return { valid: false, errors: ['unregistered artifact type'] };
  const errors = [];
  const actions = Array.isArray(artifact.actions) ? artifact.actions : [];
  if (actions.some((action) => !definition.actions.includes(action))) errors.push('artifact action is not registered for this type');
  if (definition.authority === 'coffee-read-only' && actions.some((action) => action !== 'choose')) errors.push('read-only artifact cannot mutate');
  if (artifact.status && !ACTION_STATES.includes(artifact.status) && !['ready', 'choice'].includes(artifact.status)) errors.push('invalid artifact status');
  return { valid: errors.length === 0, errors };
}

export function makeArtifact(type, payload = {}) {
  const definition = getArtifactDefinition(type);
  if (!definition) throw new Error(`Unknown Ruphus artifact: ${type}`);
  const artifact = { id: payload.id || `${type}-${Date.now()}`, type, status: payload.status || (type === 'data_gap' ? 'choice' : 'ready'), ...payload };
  const result = validateRegisteredArtifact(artifact);
  if (!result.valid) throw new Error(`Invalid Ruphus artifact: ${result.errors.join('; ')}`);
  return Object.freeze(artifact);
}

export { ARTIFACT_TYPES };
