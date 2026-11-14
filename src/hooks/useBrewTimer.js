// Brew timer state machine for pour-over recipes.
//
// Drives BrewTimer.jsx. Wall-clock based: every visible value is computed
// from Date.now() deltas against a stored `startedAt`, so iOS JS suspension
// during backgrounding self-corrects on resume. setInterval-derived accumulators
// would drift; we don't use them.
//
// State coordinates:
//   globalElapsed = (now - startedAtRef) - pausedAccumMsRef
//     the total wall-clock time since START, minus any time spent paused.
//   stepElapsed = (now - stepStartedAtRef) - pausedAccumMsRef
//     elapsed within the current step; resets on step advance or rewind.
//
// Phases: idle → countdown → running ⇄ paused → done
// stepTransition is a visual flourish handled entirely in BrewTimer (haptic +
// brief highlight); the hook does not need a separate phase for it.

import { useReducer, useRef, useState, useEffect, useCallback, useMemo } from 'react';
import {
  advanceStepClock,
  buildTimerSteps,
  normalizeRecipePhases,
  sourceRestoreStartedAt,
  sourceTimerMode,
  sourceTimerTotalSeconds,
} from '../lib/brewTimerSteps';
export { buildTimerSteps } from '../lib/brewTimerSteps';

const TICK_MS = 100;
const checkpointKey = id => `ruphus-timer-v1:${id}`;

function readCheckpoint(id, signature, stepCount) {
  if (!id) return null;
  try {
    const saved = JSON.parse(localStorage.getItem(checkpointKey(id)));
    const now = Date.now();
    if (!saved || saved.signature !== signature || !['running', 'paused'].includes(saved.phase)) return null;
    if (!Number.isInteger(saved.stepIndex) || saved.stepIndex < 0 || saved.stepIndex >= stepCount) return null;
    if (![saved.startedAt, saved.stepStartedAt, saved.pausedAccumMs, saved.stepPausedAccumMs].every(Number.isFinite)) return null;
    if (saved.startedAt <= 0 || saved.stepStartedAt < saved.startedAt || saved.stepStartedAt > now) return null;
    if (saved.pausedAccumMs < 0 || saved.pausedAccumMs > now - saved.startedAt || saved.stepPausedAccumMs < 0 || saved.stepPausedAccumMs > saved.pausedAccumMs) return null;
    if (saved.phase === 'paused' && (!Number.isFinite(saved.pauseStartedAt) || saved.pauseStartedAt < saved.stepStartedAt || saved.pauseStartedAt > now)) return null;
    if (saved.phase === 'running' && saved.pauseStartedAt !== null) return null;
    const anchor = saved.pauseStartedAt ?? now;
    if (saved.pausedAccumMs > anchor - saved.startedAt || saved.stepPausedAccumMs > anchor - saved.stepStartedAt) return null;
    return saved;
  } catch { return null; }
}

function clearCheckpoint(id) {
  if (!id) return;
  try { localStorage.removeItem(checkpointKey(id)); } catch { /* Timer still works without storage. */ }
}

function reducer(state, action) {
  switch (action.type) {
    case 'START':
      return { ...state, phase: 'countdown', stepIndex: 0 };
    case 'COUNTDOWN_DONE':
      return { ...state, phase: 'running' };
    case 'PAUSE':
      return { ...state, phase: 'paused' };
    case 'RESUME':
      return { ...state, phase: 'running' };
    case 'RESTORE':
      return { phase: action.phase, stepIndex: action.stepIndex };
    case 'NEXT_STEP':
      return { ...state, stepIndex: state.stepIndex + 1 };
    case 'SET_STEP':
      return { ...state, stepIndex: action.stepIndex };
    case 'FINISH':
      return { ...state, phase: 'done' };
    case 'RESET':
      return { phase: 'idle', stepIndex: 0 };
    default:
      return state;
  }
}

const initialState = { phase: 'idle', stepIndex: 0 };

// Normalize recipe.steps into a list of { index, startSeconds, durationSeconds, step }
// entries suitable for the timer. Requires that every step has a numeric
// `timeSeconds` (populated by repairHandBrewRecipe) and that totalBrewTimeSeconds
// is > last step's timeSeconds.
export function useBrewTimer(recipe, sessionId = null, options = {}) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Recompute when recipe changes (regenerate, different bean, etc.).
  // Wrapped in useMemo so it's stable within a single recipe identity.
  const effectiveRecipe = useMemo(() => normalizeRecipePhases(recipe), [recipe]);
  const timerSteps = useMemo(() => buildTimerSteps(effectiveRecipe), [effectiveRecipe]);
  const resolvedSourceMode = useMemo(() => sourceTimerMode(recipe), [recipe]);

  // Refs — source of truth for time math. Never trigger re-renders.
  // Exposed on the return value so the component's rAF loop can read them
  // directly every frame instead of going through React state.
  const startedAtRef = useRef(null);        // wall clock when brew began (after countdown)
  const stepStartedAtRef = useRef(null);    // wall clock when current step began
  const pauseStartedAtRef = useRef(null);   // wall clock when current pause began
  const pausedAccumMsRef = useRef(0);       // total ms spent paused (global)
  const stepPausedAccumMsRef = useRef(0);   // ms paused within current step
  const completionRef = useRef(null);
  const checkpointRef = useRef(null);

  // Display state — 10Hz MM:SS readout. Ring animation does NOT come from here;
  // the component reads refs directly via requestAnimationFrame.
  const [globalElapsedMs, setGlobalElapsedMs] = useState(0);
  const [stepElapsedMs, setStepElapsedMs] = useState(0);
  const [completion, setCompletion] = useState(null);

  const sourceTotalSeconds = sourceTimerTotalSeconds(recipe);
  const totalMs = sourceTotalSeconds != null
    ? sourceTotalSeconds * 1000
    : effectiveRecipe?.totalBrewTimeSeconds != null
      ? effectiveRecipe.totalBrewTimeSeconds * 1000
      : 0;

  const currentStep = timerSteps && state.stepIndex < timerSteps.length
    ? timerSteps[state.stepIndex]
    : null;
  const currentStepDurationMs = currentStep && Number.isFinite(currentStep.durationSeconds)
    ? currentStep.durationSeconds * 1000
    : 0;

  // Pure readers — compute elapsed live from refs and Date.now(). These
  // are the source of truth; setState values are just cached snapshots
  // for display-level React subscribers.
  const readGlobalMs = useCallback(() => {
    if (startedAtRef.current == null) return 0;
    const now = Date.now();
    const base = (now - startedAtRef.current) - pausedAccumMsRef.current;
    // If currently paused, freeze the value at the moment pause began.
    if (pauseStartedAtRef.current != null) {
      return Math.max(0, (pauseStartedAtRef.current - startedAtRef.current) - pausedAccumMsRef.current);
    }
    return Math.max(0, base);
  }, []);

  const readStepMs = useCallback(() => {
    if (stepStartedAtRef.current == null) return 0;
    const now = Date.now();
    const base = (now - stepStartedAtRef.current) - stepPausedAccumMsRef.current;
    if (pauseStartedAtRef.current != null) {
      return Math.max(0, (pauseStartedAtRef.current - stepStartedAtRef.current) - stepPausedAccumMsRef.current);
    }
    return Math.max(0, base);
  }, []);

  // One terminal transition for manual finish, natural completion, and final
  // step skip. Capture a fresh wall-clock value before React state changes so
  // persistence never relies on the 10Hz display snapshot.
  const finish = useCallback((completionKind = 'natural') => {
    if (state.phase !== 'running' && state.phase !== 'paused') return null;
    if (completionRef.current) return completionRef.current.elapsedMs;
    const elapsed = readGlobalMs();
    const nextCompletion = { kind: completionKind, elapsedMs: elapsed, atMs: Date.now() };
    completionRef.current = nextCompletion;
    clearCheckpoint(checkpointRef.current?.id);
    setCompletion(nextCompletion);
    setGlobalElapsedMs(elapsed);
    dispatch({ type: 'FINISH' });
    return elapsed;
  }, [state.phase, readGlobalMs]);

  // Persist clock anchors on transitions, not every display tick. A process
  // restart keeps wall-clock elapsed time; a normal Stop/Finish clears it.
  useEffect(() => {
    if (!checkpointRef.current?.id || !['running', 'paused'].includes(state.phase)) return;
    try {
      localStorage.setItem(checkpointKey(checkpointRef.current.id), JSON.stringify({
        signature: checkpointRef.current.signature,
        phase: state.phase,
        stepIndex: state.stepIndex,
        startedAt: startedAtRef.current,
        stepStartedAt: stepStartedAtRef.current,
        pauseStartedAt: pauseStartedAtRef.current,
        pausedAccumMs: pausedAccumMsRef.current,
        stepPausedAccumMs: stepPausedAccumMsRef.current,
      }));
    } catch { /* Timer still works without storage. */ }
  }, [state.phase, state.stepIndex]);

  // Low-frequency ticker — drives the numeric MM:SS readout AND owns step
  // advancement. Reads live from refs to avoid any stale-state off-by-one.
  useEffect(() => {
    if (state.phase !== 'running') return;
    let alive = true;
    const tick = () => {
      if (!alive) return;
      const global = readGlobalMs();
      const step = readStepMs();
      setGlobalElapsedMs(global);
      setStepElapsedMs(step);

      if (currentStep) {
        const isFinalStep = state.stepIndex + 1 >= (timerSteps?.length || 0);
        if (!isFinalStep && step >= currentStepDurationMs) {
          // Roll step clock forward by the exact duration so residual overshoot
          // carries into the next step (e.g. tick arrived 150ms after the
          // boundary — next step starts with 150ms already elapsed).
          stepStartedAtRef.current = advanceStepClock(
            stepStartedAtRef.current,
            currentStepDurationMs,
            stepPausedAccumMsRef.current,
          );
          stepPausedAccumMsRef.current = 0;
          // Reset the display state BEFORE dispatching so the next render sees
          // 0 against the new step duration instead of the overshoot value
          // from the step that just finished. React batches these together.
          setStepElapsedMs(0);
          dispatch({ type: 'NEXT_STEP' });
        }
      }
    };
    tick();
    const id = setInterval(tick, TICK_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [state.phase, state.stepIndex, currentStep, currentStepDurationMs, timerSteps, readGlobalMs, readStepMs]);

  // Recompute on visibility change so foreground resume doesn't wait up to
  // 100ms for the next interval fire. Matches Capacitor's JS suspension model.
  useEffect(() => {
    if (state.phase !== 'running') return;
    const onVis = () => {
      if (document.visibilityState !== 'visible') return;
      setGlobalElapsedMs(readGlobalMs());
      setStepElapsedMs(readStepMs());
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [state.phase, readGlobalMs, readStepMs]);

  const start = useCallback(() => {
    if (!timerSteps) return;
    completionRef.current = null;
    setCompletion(null);
    const signature = JSON.stringify(timerSteps.map(step => [step.startSeconds, step.durationSeconds]));
    checkpointRef.current = { id: sessionId, signature };
    const saved = readCheckpoint(sessionId, signature, timerSteps.length);
    if (saved) {
      startedAtRef.current = saved.startedAt;
      stepStartedAtRef.current = saved.stepStartedAt;
      pauseStartedAtRef.current = saved.pauseStartedAt;
      pausedAccumMsRef.current = saved.pausedAccumMs;
      stepPausedAccumMsRef.current = saved.stepPausedAccumMs;
      const anchor = saved.pauseStartedAt ?? Date.now();
      setGlobalElapsedMs(anchor - saved.startedAt - saved.pausedAccumMs);
      setStepElapsedMs(anchor - saved.stepStartedAt - saved.stepPausedAccumMs);
      dispatch({ type: 'RESTORE', phase: saved.phase, stepIndex: saved.stepIndex });
      return;
    }
    const sourceStartedAt = resolvedSourceMode === 'automatic'
      ? sourceRestoreStartedAt(recipe, options.sourceTimerState, options.sourceTimerBinding)
      : null;
    if (sourceStartedAt != null && sourceStartedAt <= Date.now()) {
      const elapsedMs = Math.max(0, Date.now() - sourceStartedAt);
      let restoredStepIndex = 0;
      for (let index = 1; index < timerSteps.length; index += 1) {
        if (timerSteps[index].startSeconds * 1000 <= elapsedMs) restoredStepIndex = index;
      }
      startedAtRef.current = sourceStartedAt;
      stepStartedAtRef.current = sourceStartedAt + timerSteps[restoredStepIndex].startSeconds * 1000;
      pauseStartedAtRef.current = null;
      pausedAccumMsRef.current = 0;
      stepPausedAccumMsRef.current = 0;
      setGlobalElapsedMs(elapsedMs);
      setStepElapsedMs(Math.max(0, elapsedMs - timerSteps[restoredStepIndex].startSeconds * 1000));
      dispatch({ type: 'RESTORE', phase: 'running', stepIndex: restoredStepIndex });
      return;
    }
    dispatch({ type: 'START' });
  }, [timerSteps, sessionId, options.sourceTimerBinding, options.sourceTimerState, recipe, resolvedSourceMode]);

  // Called by the 3-2-1 countdown overlay when it reaches 0.
  const beginRunning = useCallback(() => {
    const now = Date.now();
    startedAtRef.current = now;
    stepStartedAtRef.current = now;
    pauseStartedAtRef.current = null;
    pausedAccumMsRef.current = 0;
    stepPausedAccumMsRef.current = 0;
    completionRef.current = null;
    setCompletion(null);
    setGlobalElapsedMs(0);
    setStepElapsedMs(0);
    dispatch({ type: 'COUNTDOWN_DONE' });
  }, []);

  const pause = useCallback(() => {
    if (state.phase !== 'running') return;
    pauseStartedAtRef.current = Date.now();
    dispatch({ type: 'PAUSE' });
  }, [state.phase]);

  const resume = useCallback(() => {
    if (state.phase !== 'paused') return;
    if (pauseStartedAtRef.current != null) {
      const paused = Date.now() - pauseStartedAtRef.current;
      pausedAccumMsRef.current += paused;
      stepPausedAccumMsRef.current += paused;
      pauseStartedAtRef.current = null;
    }
    dispatch({ type: 'RESUME' });
  }, [state.phase]);

  // When navigating between steps, the step clock must align with "now" if
  // the timer is running, or with pauseStartedAt if paused. Otherwise a
  // rewind-while-paused followed by a resume would under-credit the new
  // step by the time spent paused before the rewind.
  const stepNavAnchor = () => (
    pauseStartedAtRef.current != null ? pauseStartedAtRef.current : Date.now()
  );

  const skipForward = useCallback(() => {
    if (!timerSteps) return;
    if (state.stepIndex + 1 >= timerSteps.length) {
      return;
    }
    stepStartedAtRef.current = stepNavAnchor();
    stepPausedAccumMsRef.current = 0;
    setStepElapsedMs(0);
    dispatch({ type: 'NEXT_STEP' });
  }, [timerSteps, state.stepIndex]);

  const rewind = useCallback(() => {
    if (!timerSteps || state.stepIndex <= 0) return;
    // Global elapsed clock keeps ticking. Only the step clock resets.
    stepStartedAtRef.current = stepNavAnchor();
    stepPausedAccumMsRef.current = 0;
    setStepElapsedMs(0);
    dispatch({ type: 'SET_STEP', stepIndex: state.stepIndex - 1 });
  }, [timerSteps, state.stepIndex]);

  const reset = useCallback(() => {
    clearCheckpoint(checkpointRef.current?.id);
    checkpointRef.current = null;
    startedAtRef.current = null;
    stepStartedAtRef.current = null;
    pauseStartedAtRef.current = null;
    pausedAccumMsRef.current = 0;
    stepPausedAccumMsRef.current = 0;
    completionRef.current = null;
    setCompletion(null);
    setGlobalElapsedMs(0);
    setStepElapsedMs(0);
    dispatch({ type: 'RESET' });
  }, []);

  return {
    phase: state.phase,
    stepIndex: state.stepIndex,
    timerSteps,
    currentStep,
    currentStepDurationMs,
    globalElapsedMs,
    stepElapsedMs,
    totalMs,
    // Live readers for rAF loops — read Date.now() against internal refs
    // every frame so animations stay 60fps without React state churn.
    readGlobalMs,
    readStepMs,
    start,
    beginRunning,
    pause,
    resume,
    finish,
    completionKind: completion?.kind || null,
    completionElapsedMs: completion?.elapsedMs ?? null,
    completionAtMs: completion?.atMs ?? null,
    skipForward,
    rewind,
    reset,
    isReady: !!timerSteps,
    sourceMode: resolvedSourceMode,
  };
}

// Format ms → "M:SS" (always at least 1 digit minutes, 2 digit seconds)
export function formatMMSS(ms) {
  if (ms == null || ms < 0 || !isFinite(ms)) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
