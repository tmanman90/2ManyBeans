// Brew timer on the Dynamic Island and Lock Screen, plus a local
// notification at each step boundary. Native side: ios/App/App/BrewActivityPlugin.swift.
//
// The app publishes only on timer transitions. Each publish carries the whole
// step schedule as date anchors, and the widget derives the current step from
// the clock, so it keeps going while the WebView is suspended.
//
// Capgo bundles also reach binaries built before the plugin existed, so every
// call is a no-op unless the native plugin is present.
import { Capacitor, registerPlugin } from '@capacitor/core';
import { resolveStepTiming } from './brewTimerSteps.js';

const BrewActivity = registerPlugin('BrewActivity');

// Done stays on the Lock Screen long enough to walk to the cup and tap
// "Rate this cup".
export const DONE_LINGER_SECONDS = 300;
const READY_STATUSES = ['ready', 'checkpoint-passed', 'awaiting-observation'];
const MAX_DETAIL_CHARS = 90;

const isAvailable = () => Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('BrewActivity');

const clip = (text) => {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  return value.length > MAX_DETAIL_CHARS ? `${value.slice(0, MAX_DETAIL_CHARS - 1).trimEnd()}…` : value;
};

const formatClock = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

// Timer steps -> the compact labels the widget shows. Water targets are
// cumulative scale weight, so a step that adds water is a pour.
export function describeBrewSteps(timerSteps = []) {
  const waters = timerSteps.map((entry) => (Number.isFinite(entry?.step?.waterTotal) ? Math.round(entry.step.waterTotal) : null));
  let previous = 0;
  const isPour = waters.map((water) => {
    const pour = water != null && water > previous;
    if (water != null) previous = Math.max(previous, water);
    return pour;
  });
  const names = timerSteps.map((entry, index) => String(entry?.step?.name || entry?.step?.label || `Step ${index + 1}`).trim());
  const isBloom = timerSteps.map((entry, index) => isPour[index]
    && (/bloom/i.test(entry?.step?.name || '') || /^\s*bloom/i.test(entry?.step?.action || '')));
  const pourCount = isPour.filter((pour, index) => pour && !isBloom[index]).length;
  let pourNumber = 0;
  return timerSteps.map((entry, index) => {
    const step = entry?.step || {};
    const unit = step.waterUnit === 'mL' ? 'mL' : 'g';
    const water = waters[index];
    const seconds = entry?.openEnded || !Number.isFinite(entry?.durationSeconds) || entry.durationSeconds <= 0
      ? null
      : entry.durationSeconds;
    if (isPour[index]) {
      const verb = isBloom[index] ? 'Bloom' : 'Pour';
      if (!isBloom[index]) pourNumber += 1;
      const numbered = !isBloom[index] && pourCount > 1;
      return {
        title: isBloom[index] ? 'Bloom' : numbered ? `Pour ${pourNumber} of ${pourCount}` : 'Pour',
        detail: `${verb} to ${water} ${unit}`,
        short: `${isBloom[index] ? 'Bloom' : numbered ? `Pour ${pourNumber}` : 'Pour'} to ${water} ${unit}`,
        target: `${water}${unit}`,
        seconds,
        pour: true,
      };
    }
    return {
      title: clip(names[index]),
      detail: clip(step.action || names[index]),
      short: clip(names[index]),
      seconds,
      pour: false,
    };
  });
}

// Pure: one timer snapshot -> what the plugin needs. Returns null while there
// is nothing to show (idle, 3-2-1 countdown).
export function buildBrewActivity({
  phase,
  stepIndex,
  timerSteps,
  globalElapsedMs,
  stepElapsedMs,
  currentStepDurationMs,
  totalMs,
  confirmedSource = false,
  sourceReadiness = null,
  sourceActive = false,
  completionElapsedMs = null,
  completionAtMs = null,
  iced = false,
  chilled = false,
  chillNote = null,
  nowMs = Date.now(),
}) {
  if (!Array.isArray(timerSteps) || timerSteps.length === 0) return null;
  if (!['running', 'paused', 'done'].includes(phase)) return null;
  const steps = describeBrewSteps(timerSteps);
  const index = Math.min(Math.max(0, stepIndex || 0), steps.length - 1);
  // A confirmed source step's countdown is whatever the app shows now: its own
  // duration, or the wait until the source checkpoint.
  if (confirmedSource) {
    steps[index] = { ...steps[index], seconds: currentStepDurationMs > 0 ? currentStepDurationMs / 1000 : null };
  }
  const totalSeconds = totalMs > 0 ? totalMs / 1000 : null;
  const base = {
    steps,
    stepIndex: index,
    totalSeconds,
    autoAdvance: !confirmedSource,
    elapsedSeconds: Math.max(0, globalElapsedMs) / 1000,
  };

  if (phase === 'done') {
    const elapsedMs = completionElapsedMs ?? globalElapsedMs;
    const state = {
      ...base,
      elapsedSeconds: Math.max(0, elapsedMs) / 1000,
      ...(iced && !chilled
        ? { phase: 'chill', dueAt: completionAtMs ?? nowMs, note: clip(chillNote || 'Swirl over ice') }
        : { phase: 'done' }),
    };
    return { state, alerts: [] };
  }

  if (phase === 'paused') {
    const remainingMs = resolveStepTiming({
      isFinalStep: index + 1 >= steps.length,
      nominalDurationMs: currentStepDurationMs,
      totalMs,
      globalElapsedMs,
      stepElapsedMs,
    }).remainingMs;
    return { state: { ...base, phase: 'paused', stepRemainingSeconds: remainingMs / 1000 }, alerts: [] };
  }

  const stepStartedAt = nowMs - Math.max(0, stepElapsedMs);
  const brewStartedAt = nowMs - Math.max(0, globalElapsedMs);
  if (confirmedSource && !sourceActive && READY_STATUSES.includes(sourceReadiness?.status)) {
    return { state: { ...base, phase: 'yourTurn', stepStartedAt, brewStartedAt, dueAt: nowMs }, alerts: [] };
  }
  const state = { ...base, phase: 'running', stepStartedAt, brewStartedAt };
  return { state, alerts: stepAlerts(state, nowMs) };
}

// Mirrors the widget's schedule walk (BrewActivityAttributes.swift): one alert
// per upcoming step start, or one "your turn" alert for a source step.
function stepAlerts(state, nowMs) {
  const { steps, stepIndex, autoAdvance } = state;
  const current = steps[stepIndex];
  if (!autoAdvance) {
    if (!current.seconds) return [];
    const at = state.stepStartedAt + current.seconds * 1000;
    return at > nowMs ? [{ at, title: 'Your turn', body: current.detail }] : [];
  }
  const alerts = [];
  let at = state.stepStartedAt;
  for (let index = stepIndex; index + 1 < steps.length; index += 1) {
    if (!steps[index].seconds) break;
    at += steps[index].seconds * 1000;
    const next = steps[index + 1];
    if (at > nowMs) {
      const brewAt = formatClock((at - state.brewStartedAt) / 1000);
      alerts.push({ at, title: `${next.title} · ${brewAt}`, body: next.detail });
    }
  }
  return alerts;
}

export function brewActivityAttributes({ sessionId, beanName, methodLabel, doseGrams, iced }) {
  const method = `${iced ? 'Iced ' : ''}${methodLabel || 'Brew'}`;
  return {
    sessionID: String(sessionId || 'brew'),
    title: clip([beanName, method].filter(Boolean).join(' · ')),
    subtitle: clip(Number.isFinite(doseGrams) ? `${method} · ${doseGrams} g` : method),
    iced: Boolean(iced),
  };
}

const quietly = (promise) => promise.catch(() => {});

export function publishBrewActivity(attributes, activity) {
  if (!isAvailable() || !activity) return;
  if (activity.state.phase === 'done') {
    quietly(BrewActivity.end({ state: activity.state, dismissAfterSeconds: DONE_LINGER_SECONDS }));
    return;
  }
  quietly(BrewActivity.upsert({ attributes, state: activity.state, alerts: activity.alerts }));
}

// Removes every brew activity and pending step alert at once.
export function endBrewActivity() {
  if (!isAvailable()) return;
  quietly(BrewActivity.end({}));
}

export function requestBrewAlertPermission() {
  if (!isAvailable()) return;
  quietly(BrewActivity.requestAlertPermission());
}

// "Rate this cup" on the done state. Returns a cleanup function.
export function onRateCupTapped(handler) {
  if (!isAvailable()) return () => {};
  const listener = BrewActivity.addListener('rateCup', handler);
  return () => { quietly(listener.then((handle) => handle.remove())); };
}
