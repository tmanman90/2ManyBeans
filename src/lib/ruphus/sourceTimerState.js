// Pure state machine for source-backed manual brew timing.
//
// A timer state is an event ledger owned by an existing brew attempt. This
// module deliberately does not persist, schedule physical actions, or know
// about a registry, UI, storage, or provider. Time can change the view only;
// user-confirmed actions are the sole source of new physical events.
import {
  confirmManualSourceEvent,
  resolveManualSourceStage,
  sourceClockStartedAt,
} from '../manualSourceTiming.js';

export const MANUAL_SOURCE_TIMER_STATE_VERSION = 1;
export const MANUAL_SOURCE_TIMING_RECORD_VERSION = 2;

const timestamp = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const object = (value) => value != null && typeof value === 'object' && !Array.isArray(value);
const clone = (value) => structuredClone(value);

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((result, key) => {
      if (value[key] !== undefined) result[key] = stableValue(value[key]);
      return result;
    }, {});
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

function derivedConfiguration(record) {
  const equipment = record?.equipment || {};
  return {
    device: equipment.brewer ?? null,
    variant: equipment.brewer === 'switch' ? 'switch' : null,
    size: equipment.size ?? null,
    model: equipment.model ?? null,
    filter: equipment.filter ?? null,
    material: equipment.material ?? null,
    mode: record?.mode ?? null,
  };
}

function configurationFrom(binding, record) {
  const supplied = binding?.sourceConfiguration ?? binding?.configuration;
  if (supplied == null) return derivedConfiguration(record);
  if (!object(supplied)) throw new Error('Source timer configuration must be an object');
  return clone(supplied);
}

function recordShape(record) {
  if (!object(record) || typeof record.id !== 'string' || !record.id
    || !Number.isInteger(record.revision) || record.revision < 1
    || !Array.isArray(record.stages) || record.stages.length === 0) {
    return { valid: false, errors: ['invalid-source-execution'] };
  }
  const ids = new Set();
  const errors = [];
  for (const stage of record.stages) {
    if (!object(stage) || typeof stage.id !== 'string' || !stage.id || ids.has(stage.id)) errors.push('invalid-source-stage-id');
    ids.add(stage?.id);
  }
  return { valid: errors.length === 0, errors };
}

function expectedIdentity(record, binding = {}) {
  const shape = recordShape(record);
  if (!shape.valid) throw new Error(shape.errors.join(', '));
  const sourceId = binding?.sourceId ?? record.id;
  const sourceRevision = binding?.sourceRevision ?? record.revision;
  if (sourceId !== record.id) throw new Error('Source timer sourceId does not match source execution');
  if (sourceRevision !== record.revision) throw new Error('Source timer sourceRevision does not match source execution');

  const fingerprint = binding?.fingerprint ?? binding?.sourceFingerprint ?? null;
  if (fingerprint != null && (typeof fingerprint !== 'string' || !fingerprint)) {
    throw new Error('Source timer fingerprint must be a non-empty string');
  }
  const configurationKey = binding?.configurationKey ?? null;
  if (configurationKey != null && (typeof configurationKey !== 'string' || !configurationKey)) {
    throw new Error('Source timer configurationKey must be a non-empty string');
  }

  return {
    sourceId,
    sourceRevision,
    sourceConfiguration: configurationFrom(binding, record),
    configurationKey,
    sourceFingerprint: fingerprint,
    sourceDose: clone(binding?.dose ?? binding?.coffeeGrams ?? record.coffeeGrams ?? null),
  };
}

export function sourceTimerIdentity(record, binding = {}) {
  return expectedIdentity(record, binding);
}

export function sourceTimerIdentityKey(identity) {
  return stableStringify(identity);
}

function stateWithoutBinding(state) {
  return object(state)
    && object(state.events)
    && state.sourceId == null
    && state.sourceRevision == null
    && state.sourceConfiguration == null
    && state.configurationKey == null
    && state.sourceFingerprint == null
    && state.sourceDose == null
    && Object.keys(state.events || {}).length === 0
    && state.activeStageId == null
    && state.completed === false
    && Array.isArray(state.corrections)
    && state.corrections.length === 0;
}

function initialStateFields(identity) {
  return {
    stateVersion: MANUAL_SOURCE_TIMER_STATE_VERSION,
    timingRecordVersion: MANUAL_SOURCE_TIMING_RECORD_VERSION,
    sourceId: identity?.sourceId ?? null,
    sourceRevision: identity?.sourceRevision ?? null,
    sourceConfiguration: identity?.sourceConfiguration == null ? null : clone(identity.sourceConfiguration),
    configurationKey: identity?.configurationKey ?? null,
    sourceFingerprint: identity?.sourceFingerprint ?? null,
    sourceDose: identity?.sourceDose == null ? null : clone(identity.sourceDose),
    events: {},
    activeStageId: null,
    completed: false,
    corrections: [],
  };
}

export function initialManualBrewState(record = null, binding = {}) {
  return initialStateFields(record ? expectedIdentity(record, binding) : null);
}

function identityErrors(record, state, binding) {
  let expected;
  try {
    expected = expectedIdentity(record, binding);
  } catch (error) {
    return { expected: null, errors: [error.message || 'invalid-source-identity'] };
  }
  const errors = [];
  if (state.sourceId !== expected.sourceId) errors.push('source-id-mismatch');
  if (state.sourceRevision !== expected.sourceRevision) errors.push('source-revision-mismatch');
  if (stableStringify(state.sourceConfiguration) !== stableStringify(expected.sourceConfiguration)) errors.push('source-configuration-mismatch');
  if (state.configurationKey !== expected.configurationKey) errors.push('source-configuration-key-mismatch');
  if (state.sourceFingerprint !== expected.sourceFingerprint) errors.push('source-fingerprint-mismatch');
  if (stableStringify(state.sourceDose) !== stableStringify(expected.sourceDose)) errors.push('source-dose-mismatch');
  return { expected, errors };
}

function stageEventIds(record) {
  const starts = new Map();
  const completes = new Map();
  const observed = new Map();
  for (const stage of record.stages) {
    starts.set(`${stage.id}:start`, stage);
    completes.set(`${stage.id}:complete`, stage);
    observed.set(`${stage.id}:observed`, stage);
  }
  return { starts, completes, observed };
}

function eventErrors(record, state) {
  const errors = [];
  const events = state.events;
  if (!object(events)) return ['invalid-events'];
  const { starts, completes, observed } = stageEventIds(record);
  const allowed = new Set(['first-water', 'extraction:complete', ...starts.keys(), ...completes.keys(), ...observed.keys()]);
  let previousAt = -1;
  const eventNames = Object.keys(events);
  for (const [event, atMs] of Object.entries(events)) {
    if (!allowed.has(event)) errors.push(`unknown-event:${event}`);
    if (!timestamp(atMs)) errors.push(`invalid-event-time:${event}`);
    if (timestamp(atMs) && atMs < previousAt) errors.push('events-not-monotonic');
    if (timestamp(atMs)) previousAt = Math.max(previousAt, atMs);
  }
  const firstWaterIndex = eventNames.indexOf('first-water');
  if (firstWaterIndex > 0) errors.push('first-water-not-first-event');
  const extractionIndex = eventNames.indexOf('extraction:complete');
  if (extractionIndex >= 0 && extractionIndex !== eventNames.length - 1) errors.push('extraction-not-last-event');

  for (const [event, stage] of starts) {
    if (!Object.hasOwn(events, event)) continue;
    const complete = events[`${stage.id}:complete`];
    if (complete != null && (!timestamp(complete) || complete < events[event])) errors.push(`stage-order:${stage.id}`);
    if (complete != null && eventNames.indexOf(event) > eventNames.indexOf(`${stage.id}:complete`)) errors.push(`stage-order:${stage.id}`);
  }
  for (const [event, stage] of completes) {
    if (!Object.hasOwn(events, event)) continue;
    if (!Object.hasOwn(events, `${stage.id}:start`)) errors.push(`completion-without-start:${stage.id}`);
    const index = record.stages.indexOf(stage);
    for (const prior of record.stages.slice(0, index)) {
      if (!Object.hasOwn(events, `${prior.id}:complete`)) errors.push(`stage-order:${stage.id}`);
    }
  }
  for (const [event, stage] of observed) {
    if (!Object.hasOwn(events, event)) continue;
    if (stage.trigger?.type !== 'condition') errors.push(`observation-on-noncondition:${stage.id}`);
    if (!Object.hasOwn(events, `${stage.id}:start`)) errors.push(`observation-without-start:${stage.id}`);
    if (Object.hasOwn(events, `${stage.id}:start`)
      && eventNames.indexOf(event) > eventNames.indexOf(`${stage.id}:start`)) errors.push(`stage-order:${stage.id}`);
  }

  const extractionAt = events['extraction:complete'];
  if (extractionAt != null) {
    if (!timestamp(extractionAt)) errors.push('invalid-extraction-time');
    if (state.completed !== true) errors.push('extraction-without-completed-state');
    if (record.stages.some((stage) => !Object.hasOwn(events, `${stage.id}:complete`))) errors.push('extraction-before-all-stages');
  }
  if (state.completed === true && !Object.hasOwn(events, 'extraction:complete')) errors.push('completed-without-extraction');
  return errors;
}

function stateErrors(record, state, binding = {}) {
  const errors = [];
  if (!object(state) || Array.isArray(state)) return ['invalid-source-timer-state'];
  if (typeof state.completed !== 'boolean') errors.push('invalid-completed-state');
  if (state.stateVersion !== MANUAL_SOURCE_TIMER_STATE_VERSION) errors.push('invalid-state-version');
  if (state.timingRecordVersion !== MANUAL_SOURCE_TIMING_RECORD_VERSION) errors.push('invalid-timing-record-version');
  errors.push(...identityErrors(record, state, binding).errors);
  errors.push(...eventErrors(record, state));

  const ids = new Set(record.stages.map((stage) => stage.id));
  const events = object(state.events) ? state.events : {};
  if (state.activeStageId != null && !ids.has(state.activeStageId)) errors.push('unknown-active-stage');
  if (state.activeStageId != null) {
    const stage = record.stages.find((candidate) => candidate.id === state.activeStageId);
    if (stage) {
      if (!Object.hasOwn(events, `${stage.id}:start`)) errors.push('active-stage-without-start');
      if (Object.hasOwn(events, `${stage.id}:complete`)) errors.push('active-stage-completed');
      const index = record.stages.indexOf(stage);
      for (const prior of record.stages.slice(0, index)) {
        if (!Object.hasOwn(events, `${prior.id}:complete`)) errors.push('active-stage-before-previous-completion');
      }
    }
  } else {
    const next = record.stages.findIndex((stage) => !Object.hasOwn(events, `${stage.id}:complete`));
    if (next >= 0 && Object.hasOwn(events, `${record.stages[next].id}:start`)) errors.push('unconfirmed-stage-missing-active-state');
  }

  if (!Array.isArray(state.corrections)) errors.push('invalid-corrections');
  else {
    let previousCorrection = -1;
    for (const correction of state.corrections) {
      if (!object(correction) || !ids.has(correction.stageId)
        || !timestamp(correction.withdrawnAtMs) || !timestamp(correction.correctedAtMs)
        || correction.correctedAtMs < correction.withdrawnAtMs) {
        errors.push('invalid-correction');
        continue;
      }
      if (correction.correctedAtMs < previousCorrection) errors.push('corrections-not-monotonic');
      previousCorrection = correction.correctedAtMs;
    }
  }
  return [...new Set(errors)];
}

export function validateManualBrewState(record, state, binding = {}) {
  const shape = recordShape(record);
  if (!shape.valid) return { valid: false, errors: shape.errors };
  if (stateWithoutBinding(state)) {
    return { valid: true, errors: [], unbound: true, identity: expectedIdentity(record, binding) };
  }
  let identity;
  try {
    identity = expectedIdentity(record, binding);
  } catch (error) {
    return { valid: false, errors: [error.message || 'invalid-source-identity'] };
  }
  const errors = stateErrors(record, state, binding);
  return { valid: errors.length === 0, errors, identity };
}

/**
 * Restore only a state that is structurally valid and bound to this exact
 * source/configuration/dose. A missing state starts a new, bound attempt. A
 * corrupt or foreign non-empty state is rejected with null; callers own the
 * recovery policy and persistence.
 */
export function restoreManualBrewState(record, candidate, binding = {}) {
  const fresh = initialManualBrewState(record, binding);
  if (candidate == null) return fresh;
  const validation = validateManualBrewState(record, candidate, binding);
  if (!validation.valid) return null;
  if (validation.unbound) return fresh;
  return clone(candidate);
}

function validatedStateFor(record, state, binding = {}) {
  const candidate = state == null ? initialManualBrewState() : state;
  const validation = validateManualBrewState(record, candidate, binding);
  if (validation.unbound) return initialManualBrewState(record, binding);
  if (!validation.valid) throw new Error(`Invalid source timer state: ${validation.errors.join(', ')}`);
  return candidate;
}

function currentStage(record, state) {
  return record.stages.find((stage) => !Object.hasOwn(state.events, `${stage.id}:complete`)) || null;
}

export function manualBrewView(record, inputState, nowMs, binding = {}) {
  if (!timestamp(nowMs)) throw new Error('Invalid current time');
  const state = validatedStateFor(record, inputState, binding);
  const stage = currentStage(record, state);
  const firstWater = state.events['first-water'];
  const end = state.events['extraction:complete'];
  const elapsedMs = firstWater == null ? 0 : Math.max(0, (end ?? nowMs) - firstWater);
  const clockStart = sourceClockStartedAt(record, state.events);
  let readiness = stage ? resolveManualSourceStage(record, stage.id, state.events, nowMs) : null;
  // The first pour creates the first-water anchor; it cannot wait on itself.
  if (stage === record.stages[0] && firstWater == null && stage.trigger.type === 'elapsed'
    && stage.trigger.seconds === 0 && record.clock.origin === 'first-water') {
    readiness = { status: 'ready', remainingMs: 0 };
  }
  const prior = stage ? record.stages[record.stages.indexOf(stage) - 1] : record.stages.at(-1);
  const canUndo = !state.completed && !state.activeStageId && prior
    && Object.hasOwn(state.events, `${prior.id}:complete`);
  return {
    stage,
    readiness,
    elapsedMs,
    canUndo: Boolean(canUndo),
    sourceElapsedMs: clockStart == null ? null : Math.max(0, (end ?? nowMs) - clockStart),
    active: stage != null && state.activeStageId === stage.id,
    done: state.completed,
  };
}

function actionType(action) {
  if (typeof action === 'string') return action;
  if (object(action) && typeof action.type === 'string') return action.type;
  return null;
}

function appendEvent(events, event, atMs) {
  return confirmManualSourceEvent(events, event, atMs);
}

function latestRecordedTime(state) {
  const eventTimes = Object.values(state.events).filter(timestamp);
  const correctionTimes = state.corrections.map((correction) => correction.correctedAtMs).filter(timestamp);
  return Math.max(-1, ...eventTimes, ...correctionTimes);
}

/**
 * Apply one explicit user action. `begin`/`complete`/`finish` remain accepted
 * for the existing timer consumer; `start` is the user-facing start synonym.
 */
export function transitionManualBrew(record, inputState, action, nowMs, binding = {}) {
  if (!timestamp(nowMs)) throw new Error('Invalid current time');
  const state = validatedStateFor(record, inputState, binding);
  if (state.completed) return state;
  if (nowMs < latestRecordedTime(state)) throw new Error('Source timer action time must be chronological');
  const view = manualBrewView(record, state, nowMs, binding);
  const type = actionType(action);
  if (!type) return state;

  if (type === 'undo' && view.canUndo) {
    const prior = view.stage ? record.stages[record.stages.indexOf(view.stage) - 1] : record.stages.at(-1);
    const withdrawnAtMs = state.events[`${prior.id}:complete`];
    const events = { ...state.events };
    delete events[`${prior.id}:complete`];
    return {
      ...state,
      events,
      activeStageId: prior.id,
      corrections: [...state.corrections, { stageId: prior.id, withdrawnAtMs, correctedAtMs: nowMs }],
    };
  }

  if ((type === 'begin' || type === 'start') && view.stage && !view.active
    && ['ready', 'checkpoint-passed', 'awaiting-observation'].includes(view.readiness.status)) {
    let events = state.events;
    if (view.stage.kind === 'pour' && !Object.hasOwn(events, 'first-water')) events = appendEvent(events, 'first-water', nowMs);
    if (view.readiness.status === 'awaiting-observation') events = appendEvent(events, `${view.stage.id}:observed`, nowMs);
    events = appendEvent(events, `${view.stage.id}:start`, nowMs);
    return { ...state, events, activeStageId: view.stage.id };
  }

  const completeCurrent = type === 'complete';
  if (completeCurrent && view.active) {
    let events = appendEvent(state.events, `${view.stage.id}:complete`, nowMs);
    const extractionEnds = view.stage.kind === 'finish'
      || (record.equipment?.brewer === 'aeropress'
        && view.stage.kind === 'press'
        && view.stage === record.stages.at(-1));
    if (extractionEnds) events = appendEvent(events, 'extraction:complete', nowMs);
    return { ...state, events, activeStageId: null, completed: extractionEnds };
  }

  if (type === 'finish' && !view.stage && Object.hasOwn(state.events, 'first-water')) {
    const events = appendEvent(state.events, 'extraction:complete', nowMs);
    return { ...state, events, completed: true };
  }
  return state;
}
