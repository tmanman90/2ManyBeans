import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  initialManualBrewState,
  manualBrewView,
  restoreManualBrewState,
  sourceTimerIdentity,
  sourceTimerIdentityKey,
  transitionManualBrew,
  validateManualBrewState,
} from '../lib/ruphus/sourceTimerState.js';

export {
  initialManualBrewState,
  manualBrewView,
  restoreManualBrewState,
  sourceTimerIdentity,
  sourceTimerIdentityKey,
  transitionManualBrew,
  validateManualBrewState,
};

function now() {
  return Date.now();
}

function restorationFor(record, candidate, identity) {
  const validation = candidate == null ? { valid: true, errors: [] } : validateManualBrewState(record, candidate, identity);
  const restored = restoreManualBrewState(record, candidate, identity);
  return {
    accepted: candidate == null || restored != null,
    errors: validation.errors,
    restored: candidate != null && restored != null,
  };
}

export function useManualSourceBrewTimer(record, options = {}) {
  const initialState = options.initialState ?? null;
  const onStateChange = options.onStateChange;
  const identity = useMemo(() => options.sourceIdentity ?? options.identity ?? {}, [options.identity, options.sourceIdentity]);
  const binding = sourceTimerIdentity(record, identity);
  const bindingKey = sourceTimerIdentityKey(binding);
  const initial = restoreManualBrewState(record, initialState, identity) || initialManualBrewState(record, identity);
  const initialRestoration = restorationFor(record, initialState, identity);
  const [state, setState] = useState(initial);
  const [nowMs, setNowMs] = useState(now);
  const stateRef = useRef(state);
  const pendingChangeRef = useRef(false);
  const [restoration, setRestoration] = useState(initialRestoration);

  const stateBindingKey = state.sourceId == null ? null : sourceTimerIdentityKey({
    sourceId: state.sourceId,
    sourceRevision: state.sourceRevision,
    sourceConfiguration: state.sourceConfiguration,
    configurationKey: state.configurationKey,
    sourceFingerprint: state.sourceFingerprint,
    sourceDose: state.sourceDose,
  });
  const stateMatchesBinding = stateBindingKey === bindingKey;
  // A recipe/configuration switch is a new binding. Until the synchronizing
  // effect commits, render the fresh state and never expose the prior ledger.
  const effectiveState = stateMatchesBinding
    ? state
    : (restoreManualBrewState(record, initialState, identity) || initialManualBrewState(record, identity));

  useEffect(() => {
    if (stateMatchesBinding) return;
    stateRef.current = effectiveState;
    pendingChangeRef.current = false;
    setRestoration(restorationFor(record, initialState, identity));
    setState(effectiveState);
    setNowMs(now());
  }, [bindingKey, effectiveState, identity, initialState, record, stateMatchesBinding]);

  useEffect(() => {
    if (!pendingChangeRef.current || state !== stateRef.current) return;
    pendingChangeRef.current = false;
    onStateChange?.(state);
  }, [onStateChange, state]);

  const dispatch = useCallback((action) => {
    const atMs = now();
    const current = stateRef.current;
    const next = transitionManualBrew(record, current, action, atMs, identity);
    if (next === current) return current;
    stateRef.current = next;
    pendingChangeRef.current = true;
    setState(next);
    setNowMs(atMs);
    return next;
  }, [identity, record]);

  const view = manualBrewView(record, effectiveState, nowMs, identity);
  const running = Object.hasOwn(effectiveState.events, 'first-water') && !effectiveState.completed;

  useEffect(() => {
    if (!running) return undefined;
    const refresh = () => setNowMs(now());
    const interval = setInterval(refresh, 200);
    if (typeof document === 'undefined') return () => clearInterval(interval);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [running]);

  return {
    ...view,
    state: effectiveState,
    events: effectiveState.events,
    corrections: effectiveState.corrections,
    sourceIdentity: binding,
    restoration,
    running,
    act: dispatch,
    start: () => dispatch('start'),
    complete: () => dispatch('complete'),
    finish: () => dispatch('finish'),
    undo: () => dispatch('undo'),
  };
}
