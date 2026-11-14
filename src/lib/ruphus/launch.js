const RECORDED_SLOTS = new Set(['aiden', 'v60_hot', 'v60_iced', 'kalita_hot', 'kalita_iced']);

export function resolveTastingLaunchMethod(tasting = {}) {
  const recordedSlot = [tasting.agentProvenance?.slotKey, tasting.provenance?.slotKey, tasting.brewAttempt?.slotKey, tasting.slotKey]
    .map(value => String(value || '').trim().toLowerCase())
    .find(value => RECORDED_SLOTS.has(value));
  if (recordedSlot) return recordedSlot;
  const method = String(tasting.method || tasting.brewMethod || tasting.attemptMethod || '').trim().toLowerCase();
  const mode = String(tasting.mode || tasting.brewMode || tasting.attemptMode || '').trim().toLowerCase();
  if (method === 'aiden') return 'aiden';
  if ((method === 'v60' || method === 'kalita') && (mode === 'hot' || mode === 'iced')) return `${method}_${mode}`;
  return null;
}

export function buildRecipeLaunchContext({ coffeeRef, surface, slot, ref } = {}) {
  const context = { coffeeRef, surface };
  if (ref && RECORDED_SLOTS.has(slot)) context.launchItem = { kind: 'recipe', ref, method: slot };
  return context;
}
