import { getModelPrice, MODEL_PRICING, PRICING_REGISTRY_VERSION } from '../../api/_lib/modelPricing.js';

export const EVALUATION_CAP_USD = 75;
export const LONG_CONTEXT_THRESHOLD = 272_000;
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
  if (arms.length !== expected.size || new Set(arms.map((arm) => arm.id)).size !== expected.size || arms.some((arm) => !expected.has(arm.id))) throw new Error('exact six-arm matrix requires every arm exactly once');
  for (const canonical of MODEL_ARMS) {
    const actual = arms.find((arm) => arm.id === canonical.id);
    for (const field of ['provider', 'model', 'effort', 'thinking', 'endpoint', 'cacheRegime']) {
      if ((actual?.[field] ?? null) !== (canonical[field] ?? null)) throw new Error(`arm ${canonical.id} does not match canonical ${field}`);
    }
  }
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
  if (!Number.isFinite(limits.inputTokens) || limits.inputTokens > LONG_CONTEXT_THRESHOLD) throw new Error('long-context pricing is not frozen for this evaluator');
  const p = getModelPrice(arm.model); if (!p) throw new Error(`unknown pricing for ${arm.model}`);
  const input = limits.inputTokens;
  const cached = cacheRegime === 'warm' ? input * 0.25 : 0;
  return ((input - cached) * p.input + cached * (p.cacheRead ?? p.input) + limits.outputTokens * p.output) / 1_000_000;
}
export function estimateSchedule({ arms = MODEL_ARMS, limits = DEFAULT_LIMITS, includeWarmFinalists = true, canaryRuns = limits.canaryRuns } = {}) {
  assertExactArms(arms);
  const initialRuns = limits.cases * limits.repeats;
  const initialModelTurns = (initialRuns + canaryRuns) * limits.toolTurns;
  const perArm = Object.fromEntries(arms.map((arm) => [arm.id, estimateTurnCost(arm, limits) * initialModelTurns * (1 + limits.retries)]));
  const finalistTurn = Math.max(...arms.map((arm) => estimateTurnCost(arm, limits)));
  const warmFinalistTurn = Math.max(...arms.map((arm) => estimateTurnCost(arm, limits, { cacheRegime: 'warm' })));
  const finalistCount = Math.min(2, arms.length);
  const lifecycleTurns = finalistCount * limits.finalistCases * limits.finalistRepeats * limits.toolTurns;
  const lifecycle = lifecycleTurns * finalistTurn * (1 + limits.retries);
  const warmCalls = finalistCount * limits.finalistCases * limits.toolTurns;
  const warmCreationTurn = Math.max(...arms.map((arm) => {
    const p = getModelPrice(arm.model); return (limits.inputTokens * (p?.input || 0) + limits.outputTokens * (p?.output || 0) + limits.inputTokens * (p?.cacheWrite || 0)) / 1_000_000;
  }));
  const warmRead = warmFinalistTurn * Math.max(0, warmCalls - finalistCount);
  const warm = includeWarmFinalists ? (finalistCount * warmCreationTurn + warmRead) * (1 + limits.retries) : 0;
  const initial = Object.values(perArm).reduce((a, b) => a + b, 0);
  const total = initial + lifecycle + warm;
  return { perArm, initial, initialRunsPerArm: initialRuns, initialModelTurnsPerArm: initialModelTurns, lifecycle, lifecycleTurns, warm, warmCreationTurn, warmRead, warmCalls, total, cap: EVALUATION_CAP_USD, feasible: total <= EVALUATION_CAP_USD };
}

export class BudgetReservation {
  constructor(cap = EVALUATION_CAP_USD) { if (!Number.isFinite(cap) || !(cap > 0) || cap > EVALUATION_CAP_USD) throw new Error('budget cap must be finite, positive, and no higher than approved cap'); this.cap = cap; this.reserved = 0; this.reservations = new Map(); }
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
