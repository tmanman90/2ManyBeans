import { getModelPrice, MODEL_PRICING, PRICING_REGISTRY_VERSION } from '../../api/_lib/modelPricing.js';

export const EVALUATION_CAP_USD = 75;
export const CACHE_REGIMES = Object.freeze(['cold', 'warm']);
export const MODEL_ARMS = Object.freeze([
  { id: 'luna-medium', label: 'Luna medium', provider: 'openai', model: 'gpt-5.6-luna', effort: 'medium', endpoint: 'responses', cacheRegime: 'cold' },
  { id: 'luna-high', label: 'Luna high', provider: 'openai', model: 'gpt-5.6-luna', effort: 'high', endpoint: 'responses', cacheRegime: 'cold' },
  { id: 'terra-medium', label: 'Terra medium', provider: 'openai', model: 'gpt-5.6-terra', effort: 'medium', endpoint: 'responses', cacheRegime: 'cold' },
  { id: 'terra-high', label: 'Terra high', provider: 'openai', model: 'gpt-5.6-terra', effort: 'high', endpoint: 'responses', cacheRegime: 'cold' },
  { id: 'sonnet-disabled', label: 'Sonnet 5 thinking-disabled', provider: 'anthropic', model: 'claude-sonnet-5', thinking: 'disabled', endpoint: 'messages', cacheRegime: 'cold' },
  { id: 'sonnet-adaptive-high', label: 'Sonnet 5 adaptive/high', provider: 'anthropic', model: 'claude-sonnet-5', thinking: 'adaptive', effort: 'high', endpoint: 'messages', cacheRegime: 'cold' },
]);
export const SHIPPING_BASELINE = Object.freeze({ id: 'shipping-sonnet-disabled', label: 'Shipping prompt baseline', provider: 'anthropic', model: 'claude-sonnet-5', thinking: 'disabled', endpoint: 'messages', cacheRegime: 'cold', rankingEligible: false });

export function getArm(id) { return MODEL_ARMS.find((arm) => arm.id === id) || null; }
export function assertExactArms(arms = MODEL_ARMS) {
  const expected = new Set(MODEL_ARMS.map(({ id }) => id));
  if (arms.length !== expected.size || arms.some((arm) => !expected.has(arm.id))) throw new Error('exact six-arm matrix is required');
  if (arms.some((arm) => arm.provider === 'openai' && arm.model === 'gpt-5.6-luna' && arm.effort === 'low')) throw new Error('Luna cannot run below medium');
  return true;
}
export function pricedArm(arm) {
  const price = getModelPrice(arm.model);
  if (!price) throw new Error(`unknown pricing for ${arm.model}`);
  return { ...arm, price, pricingVersion: PRICING_REGISTRY_VERSION };
}
export function validateSchedule(schedule, { allowWarm = false } = {}) {
  assertExactArms(schedule.map((entry) => getArm(entry.armId) || entry));
  if (!allowWarm && schedule.some((entry) => (entry.cacheRegime || getArm(entry.armId)?.cacheRegime) !== 'cold')) throw new Error('decision schedule must be cold-cache');
  if (schedule.some((entry) => !getArm(entry.armId))) throw new Error('schedule contains unknown arm');
  return true;
}

// Conservative planning maxima. Values are intentionally explicit and must be
// frozen into the run manifest before any paid dispatch.
export const DEFAULT_LIMITS = Object.freeze({ inputTokens: 5000, outputTokens: 1800, toolTurns: 5, retries: 1, canaryRuns: 2, cases: 60, repeats: 3, finalistCases: 20, finalistRepeats: 3 });
export function estimateTurnCost(arm, limits = DEFAULT_LIMITS, { cacheRegime = 'cold' } = {}) {
  const p = getModelPrice(arm.model); if (!p) return null;
  const input = limits.inputTokens * (cacheRegime === 'warm' ? 0.25 : 1);
  return (input * p.input + limits.outputTokens * p.output) / 1_000_000;
}
export function estimateSchedule({ arms = MODEL_ARMS, limits = DEFAULT_LIMITS, includeWarmFinalists = true, canaryRuns = limits.canaryRuns } = {}) {
  assertExactArms(arms);
  const initialRuns = limits.cases * limits.repeats;
  const perArm = Object.fromEntries(arms.map((arm) => [arm.id, estimateTurnCost(arm, limits) * (initialRuns + canaryRuns) * (1 + limits.retries)]));
  const finalistTurn = Math.max(...arms.map((arm) => estimateTurnCost(arm, limits)));
  const warmFinalistTurn = Math.max(...arms.map((arm) => estimateTurnCost(arm, limits, { cacheRegime: 'warm' })));
  const lifecycle = Math.min(2, arms.length) * limits.finalistCases * limits.finalistRepeats * finalistTurn * (1 + limits.retries);
  const warm = includeWarmFinalists ? Math.min(2, arms.length) * limits.finalistCases * warmFinalistTurn : 0;
  const total = Object.values(perArm).reduce((a, b) => a + b, 0) + lifecycle + warm;
  return { perArm, initialRunsPerArm: initialRuns, lifecycle, warm, total, cap: EVALUATION_CAP_USD, feasible: total <= EVALUATION_CAP_USD };
}

export class BudgetReservation {
  constructor(cap = EVALUATION_CAP_USD) { if (!(cap > 0)) throw new Error('budget cap must be positive'); this.cap = cap; this.reserved = 0; this.reservations = new Map(); }
  reserve(id, amount) {
    if (!id || !(amount > 0) || !Number.isFinite(amount)) throw new Error('invalid budget reservation');
    if (this.reservations.has(id)) throw new Error(`duplicate reservation ${id}`);
    if (this.reserved + amount > this.cap + 1e-12) throw new Error('budget cap exceeded');
    this.reservations.set(id, amount); this.reserved += amount;
    return Object.freeze({ id, amount, remaining: this.cap - this.reserved });
  }
  release(id) { const amount = this.reservations.get(id) || 0; this.reservations.delete(id); this.reserved -= amount; return amount; }
  hasRoom(amount) { return Number.isFinite(amount) && amount >= 0 && this.reserved + amount <= this.cap + 1e-12; }
}

export { MODEL_PRICING };
