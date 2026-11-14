// Pure source-clock semantics shared by source validation and the event timer. No UI,
// persistence, legacy clock conversion, or automatic physical actions here.
import { MANUAL_SOURCE_CLOCK_EVENTS } from './manualRecipeContract.js';
const timestamp = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;

export function confirmManualSourceEvent(events, event, atMs) {
  if (!events || typeof events !== 'object' || Array.isArray(events) || typeof event !== 'string' || !event || !timestamp(atMs)) throw new Error('Invalid source event');
  if (Object.hasOwn(events, event)) return { ...events }; // idempotent, never reanchor
  const recorded = Object.values(events);
  if (recorded.some((value) => !timestamp(value) || value > atMs)) throw new Error('Source events must be chronological');
  return { ...events, [event]: atMs };
}

export function sourceClockStartedAt(record, events) {
  const key = MANUAL_SOURCE_CLOCK_EVENTS[record?.clock?.origin];
  return key && timestamp(events?.[key]) ? events[key] : null;
}

export function resolveManualSourceStage(record, stageId, events, nowMs) {
  if (!timestamp(nowMs)) throw new Error('Invalid current time');
  const index = record?.stages?.findIndex((stage) => stage.id === stageId) ?? -1;
  if (index < 0) throw new Error('Unknown source stage');
  const stage = record.stages[index];
  const completed = events?.[`${stage.id}:complete`];
  if (timestamp(completed)) return { status: 'completed', completedAtMs: completed, remainingMs: 0, requiresConfirmation: false };
  // Viewing another stage is not evidence that preceding physical work ended.
  const prior = record.stages[index - 1];
  if (prior && !timestamp(events?.[`${prior.id}:complete`])) return { status: 'waiting-for-previous', remainingMs: null, requiresConfirmation: true };
  const trigger = stage.trigger;
  if (trigger.type === 'condition') return { status: 'awaiting-observation', condition: trigger.condition, remainingMs: null, requiresConfirmation: true };
  if (trigger.type === 'manual') return { status: 'ready', remainingMs: null, requiresConfirmation: true };
  const anchor = trigger.type === 'elapsed' ? sourceClockStartedAt(record, events) : events?.[trigger.event];
  if (!timestamp(anchor)) return { status: 'waiting-for-event', remainingMs: null, requiresConfirmation: true };
  const dueAtMs = anchor + trigger.seconds * 1000;
  const remainingMs = Math.max(0, dueAtMs - nowMs);
  return {
    status: remainingMs > 0 ? 'countdown' : trigger.type === 'elapsed' && nowMs > dueAtMs ? 'checkpoint-passed' : 'ready',
    dueAtMs, remainingMs, lateByMs: Math.max(0, nowMs - dueAtMs), requiresConfirmation: true,
  };
}

export function manualSourceTimingSummary(record, events) {
  const start = events?.['first-water'];
  const end = events?.['extraction:complete'];
  if (!timestamp(start) || !timestamp(end) || end < start) return null;
  return {
    timingRecordVersion: 2, sourceId: record.id, sourceRevision: record.revision,
    clockOrigin: record.clock.origin, sourceClockStartedAtMs: sourceClockStartedAt(record, events),
    actualMs: end - start, targetMs: null, sourceFinishRangeSeconds: record.finish,
  };
}
