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
import { advanceStepClock, buildTimerSteps } from '../lib/brewTimerSteps';
export { buildTimerSteps } from '../lib/brewTimerSteps';

const TICK_MS = 100;

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
export function useBrewTimer(recipe) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Recompute when recipe changes (regenerate, different bean, etc.).
  // Wrapped in useMemo so it's stable within a single recipe identity.
  const timerSteps = useMemo(() => buildTimerSteps(recipe), [recipe]);

  // Refs — source of truth for time math. Never trigger re-renders.
  // Exposed on the return value so the component's rAF loop can read them
  // directly every frame instead of going through React state.
  const startedAtRef = useRef(null);        // wall clock when brew began (after countdown)
  const stepStartedAtRef = useRef(null);    // wall clock when current step began
  const pauseStartedAtRef = useRef(null);   // wall clock when current pause began
  const pausedAccumMsRef = useRef(0);       // total ms spent paused (global)
  const stepPausedAccumMsRef = useRef(0);   // ms paused within current step
  const completionRef = useRef(null);

  // Display state — 10Hz MM:SS readout. Ring animation does NOT come from here;
  // the component reads refs directly via requestAnimationFrame.
  const [globalElapsedMs, setGlobalElapsedMs] = useState(0);
  const [stepElapsedMs, setStepElapsedMs] = useState(0);
  const [completion, setCompletion] = useState(null);

  const totalMs = recipe?.totalBrewTimeSeconds != null
    ? recipe.totalBrewTimeSeconds * 1000
    : 0;

  const currentStep = timerSteps && state.stepIndex < timerSteps.length
    ? timerSteps[state.stepIndex]
    : null;
  const currentStepDurationMs = currentStep
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
    const nextCompletion = { kind: completionKind, elapsedMs: elapsed };
    completionRef.current = nextCompletion;
    setCompletion(nextCompletion);
    setGlobalElapsedMs(elapsed);
    dispatch({ type: 'FINISH' });
    return elapsed;
  }, [state.phase, readGlobalMs]);

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
    dispatch({ type: 'START' });
  }, [timerSteps]);

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
    skipForward,
    rewind,
    reset,
    isReady: !!timerSteps,
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
