// BrewTimer — full-screen portal overlay for pour-over brew guidance.
//
// Renders via createPortal(document.body), not nested inside HandBrewModal's
// <Modal>, because Modal's backdrop onClick would destroy a mid-brew timer.
// Handles its own safe areas, close confirmation, and ring animation.
//
// State comes from useBrewTimer (phase/stepIndex/elapsed). Ring progression
// is computed every frame via requestAnimationFrame and written directly to
// the SVG circle's stroke-dashoffset via ref — this skips React reconciliation
// for 60fps updates. The numeric MM:SS readout uses React state and updates at
// ~10Hz via the hook's setInterval.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { assetUrl } from "../lib/assetUrl";
import { createPortal } from 'react-dom';
import { X, Pause, Play, SkipForward, SkipBack, Check } from 'lucide-react';
import { C, fonts, shadows, radius, glass, type as typeScale } from '../styles/theme';
import { m, spring, popIn } from '../lib/motion';
import { haptic } from './../lib/haptics';
import { useBrewTimer, formatMMSS } from '../hooks/useBrewTimer';
import {
  initialManualBrewState,
  manualBrewView,
  useManualSourceBrewTimer,
} from '../hooks/useManualSourceBrewTimer';
import { acquireWakeLock, releaseWakeLock } from '../lib/wakeLock';
import { timingContextFromRecipe } from '../lib/brewTimingMemory';
import {
  resolveGuideState,
  resolveStepTiming,
  resumeSourceTimerState,
  saveBrewTimingEvent,
  sourceTimerDisplayStages,
  sourceTimerMode,
  sourceTimerTotalSeconds,
} from '../lib/brewTimerSteps';

const RING_SIZE = 280;
const RING_STROKE = 10;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function Countdown({ onDone }) {
  const [value, setValue] = useState(3);
  useEffect(() => {
    haptic.light().catch(() => {});
  }, []);
  useEffect(() => {
    if (value <= 0) {
      haptic.heavy().catch(() => {});
      onDone();
      return;
    }
    const id = setTimeout(() => {
      haptic.light().catch(() => {});
      setValue((v) => v - 1);
    }, 900);
    return () => clearTimeout(id);
  }, [value, onDone]);

  if (value <= 0) return null;
  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: C.bg,
      zIndex: 2,
    }}>
      <div
        key={value}
        style={{
          fontFamily: fonts.heading,
          fontSize: 160,
          fontWeight: 600,
          color: C.accent,
          lineHeight: 1,
          letterSpacing: '-0.04em',
          animation: 'brewCountdownPulse 0.9s cubic-bezier(0.22,1,0.36,1)',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function CompletionScreen({ bean, totalElapsedMs, onStartTasting, onDone, saveState, onRetrySave }) {
  useEffect(() => {
    haptic.success().catch(() => {});
  }, []);
  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0 32px',
      background: C.bg,
      zIndex: 2,
      paddingTop: 'env(safe-area-inset-top, 0px)',
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    }}>
      <video
        src={assetUrl("/images/ruphus-animations/ruphus-brew-complete.mp4")}
        autoPlay muted playsInline
        style={{
          width: 200, height: 200, objectFit: 'contain',
          marginBottom: 20,
          WebkitMaskImage: 'radial-gradient(ellipse 75% 55% at center 48%, black 60%, transparent 100%)',
          maskImage: 'radial-gradient(ellipse 75% 55% at center 48%, black 60%, transparent 100%)',
        }}
      />
      {/* Eyebrow label */}
      <div style={{
        ...typeScale.label,
        color: C.accent,
        marginBottom: 8,
        letterSpacing: '0.12em',
      }}>
        Brew Complete
      </div>
      <div style={{
        fontFamily: fonts.heading,
        fontSize: 40,
        fontWeight: 600,
        color: C.text,
        lineHeight: 1.05,
        letterSpacing: '-0.02em',
        marginBottom: 6,
        textAlign: 'center',
      }}>
        Well done
      </div>
      <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 4, fontFamily: fonts.body }}>Total brew time</div>
      <div style={{
        fontFamily: fonts.heading,
        fontSize: 48,
        color: C.accent,
        fontWeight: 600,
        letterSpacing: '-0.02em',
        marginBottom: 40,
      }}>
        {formatMMSS(totalElapsedMs)}
      </div>
      {saveState === 'saving' && <div style={{ ...typeScale.caption, color: C.textMuted, marginTop: -26, marginBottom: 20 }}>Saving brew timing…</div>}
      {saveState === 'saved' && <div style={{ ...typeScale.caption, color: C.green, marginTop: -26, marginBottom: 20 }}>Brew timing saved</div>}
      {saveState === 'ephemeral' && <div style={{ ...typeScale.caption, color: C.textMuted, marginTop: -26, marginBottom: 20 }}>Timing is not saved for this quick recipe</div>}
      {saveState === 'failed' && (
        <div style={{ width: '100%', maxWidth: 320, marginTop: -26, marginBottom: 20, textAlign: 'center' }}>
          <div style={{ ...typeScale.caption, color: C.red, marginBottom: 8 }}>Timing was not saved.</div>
          <button onClick={onRetrySave} style={{ minHeight: 44, padding: '9px 14px', borderRadius: radius.pill, border: `1px solid ${C.red}55`, background: C.redBg, color: C.red, fontWeight: 700, cursor: 'pointer' }}>Try Again</button>
        </div>
      )}
      {onStartTasting && (
        <button
          onClick={onStartTasting}
          style={{
            width: '100%',
            maxWidth: 320,
            padding: '16px 24px',
            borderRadius: radius.md,
            background: `linear-gradient(135deg, ${C.accent} 0%, ${C.accentDark} 100%)`,
            color: '#fff',
            border: 'none',
            fontSize: 16,
            fontWeight: 700,
            fontFamily: fonts.body,
            cursor: 'pointer',
            boxShadow: shadows.navActive,
            marginBottom: 12,
          }}
        >
          Start Tasting Session
        </button>
      )}
      <button
        onClick={onDone}
        style={{
          width: '100%',
          maxWidth: 320,
          padding: '14px 24px',
          borderRadius: radius.md,
          background: glass.sheet,
          color: C.textMuted,
          border: `1px solid ${C.border}`,
          fontSize: 15,
          fontWeight: 600,
          fontFamily: fonts.body,
          cursor: 'pointer',
          backdropFilter: glass.blur,
          WebkitBackdropFilter: glass.blur,
        }}
      >
        Done
      </button>
    </div>
  );
}

function ChillServeScreen({ onCoffeeChilled, onDismiss, saveState, onRetrySave, postBrewInstruction }) {
  const dialogRef = useRef(null);
  useEffect(() => { dialogRef.current?.focus(); }, []);
  return (
    <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="chill-serve-heading" style={{
      position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: '0 max(28px, env(safe-area-inset-left, 0px)) 0 max(28px, env(safe-area-inset-right, 0px))',
      background: C.bg, zIndex: 2, paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    }}>
      <SnowflakeIcon />
      <div style={{ ...typeScale.label, color: C.frost, letterSpacing: '0.12em', marginBottom: 8 }}>CHILL &amp; SERVE</div>
      <h2 id="chill-serve-heading" style={{ fontFamily: fonts.heading, fontSize: 30, fontWeight: 600, color: C.text, textAlign: 'center', margin: '0 0 10px' }}>{saveState === 'saved' ? 'Your drawdown is saved' : 'Finish and serve'}</h2>
      <div style={{ ...typeScale.body, color: C.textMuted, lineHeight: 1.55, textAlign: 'center', maxWidth: 320, marginBottom: 18 }}>
        {postBrewInstruction || 'Swirl or stir until the brew ice melts as directed, then serve over fresh ice.'} Chilling is untimed and does not change drawdown memory.
      </div>
      <div role="status" aria-live="polite" style={{ ...typeScale.caption, color: saveState === 'saved' ? C.green : saveState === 'failed' ? C.red : C.textMuted, marginBottom: 16 }}>
        {saveState === 'saved' ? 'Drawdown saved' : saveState === 'failed' ? 'Timing not saved' : saveState === 'ephemeral' ? 'Timing not saved · Quick Recipe' : 'Saving drawdown…'}
      </div>
      {saveState === 'failed' && <button onClick={onRetrySave} style={{ minHeight: 44, marginBottom: 10, padding: '9px 14px', borderRadius: radius.pill, border: `1px solid ${C.red}55`, background: C.redBg, color: C.red, fontWeight: 700, cursor: 'pointer' }}>Try Again</button>}
      <button onClick={onCoffeeChilled} style={{ width: '100%', maxWidth: 320, minHeight: 52, border: 'none', borderRadius: radius.md, background: `linear-gradient(180deg, ${C.frost} 0%, #4E6878 100%)`, color: C.cream, fontFamily: fonts.body, fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>Coffee chilled</button>
      <button onClick={onDismiss} style={{ width: '100%', maxWidth: 320, minHeight: 48, marginTop: 10, border: `1px solid ${C.border}`, borderRadius: radius.md, background: C.card, color: C.textMuted, fontFamily: fonts.body, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>Done</button>
    </div>
  );
}

function SnowflakeIcon() {
  return <div aria-hidden="true" style={{ fontSize: 34, color: C.frost, marginBottom: 10 }}>❄</div>;
}

function StepPill({ label, status, timeLabel }) {
  const bg =
    status === 'current' ? C.accent :
    status === 'done' ? C.greenBg :
    C.cardMuted;
  const fg =
    status === 'current' ? '#fff' :
    status === 'done' ? C.green :
    C.textMuted;
  const borderColor =
    status === 'current' ? 'transparent' :
    status === 'done' ? C.green + '44' :
    C.hairline;

  return (
    <div style={{
      flex: '0 0 auto',
      padding: '9px 14px',
      borderRadius: radius.pill,
      background: bg,
      color: fg,
      fontSize: 12,
      fontWeight: 700,
      fontFamily: fonts.body,
      display: 'flex',
      alignItems: 'center',
      gap: 5,
      whiteSpace: 'nowrap',
      border: `1px solid ${borderColor}`,
      boxShadow: status === 'current' ? shadows.navActive : 'none',
      letterSpacing: '0.01em',
    }}>
      {status === 'done' && <Check size={11} strokeWidth={3} />}
      <span>{label}</span>
      <span style={{ opacity: 0.75, fontWeight: 500, fontSize: 11 }}>{timeLabel}</span>
    </div>
  );
}

function ControlButton({ onClick, children, ariaLabel, primary, disabled }) {
  const size = primary ? 72 : 56;
  return (
    <m.button
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      whileTap={disabled ? {} : { scale: primary ? 0.93 : 0.92 }}
      transition={spring.bouncy}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: primary
          ? `linear-gradient(145deg, ${C.accent} 0%, ${C.accentDark} 100%)`
          : glass.sheet,
        color: primary ? '#fff' : C.text,
        border: primary ? 'none' : `1px solid ${C.border}`,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.35 : 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: primary ? shadows.navActive : shadows.e1,
        padding: 0,
        backdropFilter: primary ? 'none' : glass.blur,
        WebkitBackdropFilter: primary ? 'none' : glass.blur,
        flexShrink: 0,
        // GPU hint
        willChange: 'transform',
      }}
    >
      {children}
    </m.button>
  );
}

const sourceStageActionLabel = (stage, active) => {
  if (!stage) return 'Finish Brew';
  if (!active) {
    if (stage.kind === 'valve') return `Begin ${stage.valve === 'open' ? 'opening' : 'closing'} valve`;
    if (stage.kind === 'finish') return 'Begin drawdown check';
    if (stage.kind === 'pour') return 'Begin pour';
    return 'Begin action';
  }
  if (stage.kind === 'valve') return `Confirm valve ${stage.valve || 'position'}`;
  if (stage.kind === 'finish') return 'Drawdown complete';
  if (stage.kind === 'pour') return 'Pour finished';
  return 'Action finished';
};

const sourceStepName = (stage) => ({
  pour: 'Pour', valve: 'Valve', agitate: 'Action', press: 'Press', dilute: 'Dilute', finish: 'Finish',
}[stage?.kind] || 'Action');

const sourceTriggerLabel = (stage) => {
  const trigger = stage?.trigger;
  if (trigger?.type === 'elapsed') return `@${formatMMSS(trigger.seconds * 1000)}`;
  if (trigger?.type === 'after') return trigger.seconds > 0
    ? `${formatMMSS(trigger.seconds * 1000)} after confirmation`
    : 'after confirmation';
  if (trigger?.type === 'condition') return 'confirm condition';
  return 'when ready';
};

function useConfirmedSourceTimer(recipe, {
  sourceTimerState = null,
  onSourceTimerStateChange,
  sourceTimerBinding = null,
  onReplaceSourceTimerState,
} = {}) {
  const projection = recipe.sourceProjection;
  const record = projection.sourceExecution;
  const binding = useMemo(() => ({
    sourceId: projection.sourceId,
    sourceRevision: projection.sourceRevision,
    sourceConfiguration: projection.sourceConfiguration,
    configurationKey: projection.configurationKey,
    fingerprint: projection.sourceFingerprint || null,
    dose: projection.coffeeGrams,
    ...(sourceTimerBinding || {}),
  }), [projection, sourceTimerBinding]);
  const source = useManualSourceBrewTimer(record, {
    initialState: sourceTimerState,
    onStateChange: onSourceTimerStateChange,
    sourceIdentity: binding,
  });
  const restoredPauseStartedAtMs = Number.isFinite(sourceTimerState?.sharedTimerPauseStartedAtMs)
    ? sourceTimerState.sharedTimerPauseStartedAtMs : null;
  const [phase, setPhase] = useState(() => source.done
    ? 'done'
    : restoredPauseStartedAtMs != null && source.running
      ? 'paused'
      : source.running ? 'running' : 'idle');
  const [pauseStartedAtMs, setPauseStartedAtMs] = useState(restoredPauseStartedAtMs);

  useEffect(() => {
    if (source.done) setPhase('done');
    else if (source.running && phase === 'idle') setPhase('running');
  }, [source.done, source.running, phase]);

  const pausedView = phase === 'paused' && Number.isFinite(pauseStartedAtMs)
    ? manualBrewView(record, source.state, pauseStartedAtMs, binding)
    : null;
  const timerView = pausedView || source;
  const timerStage = timerView.stage;
  const stageIndex = timerStage ? record.stages.indexOf(timerStage) : Math.max(0, record.stages.length - 1);
  const timerSteps = useMemo(() => {
    const displayById = new Map(sourceTimerDisplayStages(recipe).map((stage) => [stage.id, stage]));
    return record.stages.map((stage, index) => {
      const displayStage = displayById.get(stage.id) || stage;
      const water = displayStage.water && Number.isFinite(displayStage.water.value)
        ? displayStage.water
        : Number.isFinite(displayStage.waterToGrams)
          ? { value: displayStage.waterToGrams, unit: 'g' }
          : Number.isFinite(displayStage.waterToMilliliters)
            ? { value: displayStage.waterToMilliliters, unit: 'mL' }
            : null;
      return {
        index,
        startSeconds: stage.trigger?.type === 'elapsed' && Number.isFinite(stage.trigger.seconds)
          ? stage.trigger.seconds : 0,
        durationSeconds: Number.isFinite(stage.durationSeconds) ? stage.durationSeconds : null,
        openEnded: !Number.isFinite(stage.durationSeconds),
        step: {
          ...stage,
          ...displayStage,
          name: sourceStepName(stage),
          action: displayStage.label,
          ...(water ? { water, waterTotal: water.value, waterUnit: water.unit } : {}),
        },
      };
    });
  }, [recipe, record]);
  const currentStep = timerStage ? (timerSteps[stageIndex] || null) : null;
  const activeStartedAt = timerStage ? source.events[`${timerStage.id}:start`] : null;
  const firstWaterAt = source.events['first-water'];
  const countdownDurationMs = timerStage?.trigger?.type === 'elapsed'
    ? timerStage.trigger.seconds * 1000 : 0;
  const stepElapsedMs = timerView.active && Number.isFinite(activeStartedAt) && Number.isFinite(firstWaterAt)
    ? Math.max(0, timerView.elapsedMs - (activeStartedAt - firstWaterAt))
    : timerView.readiness?.status === 'countdown' && Number.isFinite(timerView.readiness.remainingMs)
      ? Math.max(0, countdownDurationMs - timerView.readiness.remainingMs)
      : 0;
  const currentStepDurationMs = Number.isFinite(timerStage?.durationSeconds)
    ? timerStage.durationSeconds * 1000
    : timerView.readiness?.status === 'countdown' && countdownDurationMs > 0
      ? countdownDurationMs
      : 0;
  const globalElapsedMs = phase === 'paused' ? timerView.elapsedMs : source.elapsedMs;
  const totalSeconds = sourceTimerTotalSeconds(recipe);
  const totalMs = totalSeconds == null ? 0 : totalSeconds * 1000;
  const canAct = timerView.active || ['ready', 'checkpoint-passed', 'awaiting-observation'].includes(timerView.readiness?.status);

  const start = useCallback(() => {
    if (source.running) setPhase('running');
    else setPhase('countdown');
  }, [source.running]);
  const beginRunning = useCallback(() => {
    source.act('start');
    setPhase('running');
  }, [source]);
  const pause = useCallback(() => {
    if (phase !== 'running') return;
    const pausedAtMs = Date.now();
    setPauseStartedAtMs(pausedAtMs);
    onSourceTimerStateChange?.({ ...source.state, sharedTimerPauseStartedAtMs: pausedAtMs });
    setPhase('paused');
  }, [onSourceTimerStateChange, phase, source.state]);
  const resume = useCallback(() => {
    if (phase !== 'paused' || !Number.isFinite(pauseStartedAtMs)) return;
    const shifted = resumeSourceTimerState({ ...source.state, sharedTimerPauseStartedAtMs: pauseStartedAtMs }, Date.now());
    if (shifted) onReplaceSourceTimerState?.(shifted);
  }, [onReplaceSourceTimerState, pauseStartedAtMs, phase, source.state]);
  const advance = useCallback(() => {
    if (!canAct) return;
    source.act(timerView.active ? 'complete' : 'start');
  }, [canAct, source, timerView.active]);
  const finish = useCallback(() => {
    if (source.stage) return null;
    const next = source.act('finish');
    return next?.events?.['extraction:complete'] == null ? null : source.elapsedMs;
  }, [source]);
  const rewind = useCallback(() => source.act('undo'), [source]);
  const reset = useCallback(() => {
    onReplaceSourceTimerState?.(initialManualBrewState(record, binding));
  }, [binding, onReplaceSourceTimerState, record]);
  const readGlobalMs = useCallback(() => globalElapsedMs, [globalElapsedMs]);
  const readStepMs = useCallback(() => stepElapsedMs, [stepElapsedMs]);
  const completionAtMs = source.events['extraction:complete'] ?? null;

  return {
    phase,
    stepIndex: stageIndex,
    timerSteps,
    currentStep,
    currentStepDurationMs,
    globalElapsedMs,
    stepElapsedMs,
    totalMs,
    readGlobalMs,
    readStepMs,
    start,
    beginRunning,
    pause,
    resume,
    finish,
    skipForward: advance,
    rewind,
    reset,
    completionKind: source.done ? 'userFinished' : null,
    completionElapsedMs: source.done ? source.elapsedMs : null,
    completionAtMs,
    isReady: source.restoration.accepted,
    sourceMode: 'confirmed',
    sourceReadiness: timerView.readiness,
    sourceActive: timerView.active,
    sourceCanUndo: source.canUndo,
    sourceActionLabel: sourceStageActionLabel(timerStage, timerView.active),
    sourceActionDisabled: !canAct,
    sourceEvents: source.events,
    sourceCorrections: source.corrections,
  };
}

const BrewTimerShell = ({
  open, recipe, bean, attemptId = null, revisionId = null, onClose, onStartTasting, onSaveTimingEvent,
  sourceTimerState = null, sourceTimerBinding = null, timerOverride = null,
}) => {
  const standardTimer = useBrewTimer(recipe, attemptId, { sourceTimerState, sourceTimerBinding });
  const timer = timerOverride || standardTimer;
  const {
    phase, stepIndex, timerSteps, currentStep, currentStepDurationMs,
    globalElapsedMs, stepElapsedMs, totalMs,
    readGlobalMs, readStepMs,
    start, beginRunning, pause, resume, finish, skipForward, rewind, reset, completionKind, completionElapsedMs, completionAtMs,
    isReady,
  } = timer;
  const sourceProjection = recipe?.sourceProjection || null;
  const isConfirmedSource = timer.sourceMode === 'confirmed';

  const ringRef = useRef(null);
  const pillsScrollRef = useRef(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [saveState, setSaveState] = useState(null);
  const [chilled, setChilled] = useState(false);
  const sessionRef = useRef(null);
  const reportedRef = useRef(false);
  const isFinalStep = !!timerSteps && stepIndex + 1 >= timerSteps.length;
  const guideState = resolveGuideState(globalElapsedMs, totalMs);
  const guideRangeSeconds = Array.isArray(recipe?.guideRangeSeconds)
    && recipe.guideRangeSeconds.length === 2
    && recipe.guideRangeSeconds.every(Number.isFinite)
    ? recipe.guideRangeSeconds
    : null;
  const hasGuideWindow = Boolean(guideRangeSeconds || totalMs > 0);
  const guideWindowMs = guideRangeSeconds?.map((seconds) => seconds * 1000) || (totalMs > 0 ? [totalMs, totalMs] : [0, 0]);
  const guideWindowStarted = hasGuideWindow && globalElapsedMs >= guideWindowMs[0];
  const guideWindowPassed = hasGuideWindow && globalElapsedMs > guideWindowMs[1];
  const guideWindowText = guideRangeSeconds
    ? `${formatMMSS(guideWindowMs[0])}–${formatMMSS(guideWindowMs[1])}`
    : totalMs > 0 ? formatMMSS(totalMs) : null;

  // Freeze the effective render-time recipe as the session opens. This is
  // after HandBrewModal's dose scaling/iced transform and cannot be polluted
  // by later regeneration or a changed dose control.
  useEffect(() => {
    if (!open) {
      sessionRef.current = null;
      reportedRef.current = false;
      setSaveState(null);
      setChilled(false);
      return;
    }
    if (!sessionRef.current && recipe && bean?.id) {
      const context = timingContextFromRecipe({ beanId: bean.id, recipe, mode: recipe.isIced ? 'iced' : 'hot' });
      sessionRef.current = {
        ...context,
        sessionId: attemptId || globalThis.crypto?.randomUUID?.() || `brew-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        attemptId,
        revisionId,
        createdAt: Date.now(),
      };
    }
  }, [open, recipe, bean?.id, attemptId, revisionId]);

  const persistCompletion = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || !completionKind) {
      setSaveState('ephemeral');
      return;
    }
    setSaveState('saving');
    const measuredElapsedMs = completionElapsedMs ?? readGlobalMs();
    const sourceFinishAtMs = sourceProjection ? Math.round(completionAtMs ?? Date.now()) : completionAtMs;
    const sourceActualElapsedMs = sourceProjection ? Math.max(0, Math.round(measuredElapsedMs)) : measuredElapsedMs;
    const sourceEvents = isConfirmedSource
      ? timer.sourceEvents
      : sourceProjection
        ? {
            'first-water': Math.max(0, sourceFinishAtMs - sourceActualElapsedMs),
            'extraction:complete': Math.max(0, sourceFinishAtMs),
          }
        : null;
    const status = await saveBrewTimingEvent(onSaveTimingEvent, {
      ...session,
      actualElapsedMs: sourceActualElapsedMs,
      completionKind,
      ...(sourceProjection ? {
        timingRecordVersion: 2,
        sourceId: sourceProjection.sourceId,
        sourceRevision: sourceProjection.sourceRevision,
        sourceConfiguration: sourceProjection.sourceConfiguration,
        clockOrigin: sourceProjection.clock?.origin || null,
        sourceEvents,
        sourceCorrections: isConfirmedSource ? timer.sourceCorrections : [],
      } : {}),
    });
    setSaveState(status);
  }, [completionAtMs, completionElapsedMs, completionKind, isConfirmedSource, onSaveTimingEvent, readGlobalMs, sourceProjection, timer.sourceCorrections, timer.sourceEvents]);

  useEffect(() => {
    if (phase !== 'done' || reportedRef.current) return;
    reportedRef.current = true;
    persistCompletion();
  }, [phase, persistCompletion]);

  // Auto-start countdown when the timer opens with a valid recipe.
  useEffect(() => {
    if (!open) {
      if (phase !== 'idle') reset();
      return;
    }
    if (!isReady) return;
    if (phase === 'idle') start();
  }, [open, isReady, phase, start, reset]);

  // Screen wake lock — acquire during running, release on pause/done/unmount.
  // Re-acquire on foreground (visibilitychange) because iOS auto-releases the
  // sentinel when the page is hidden.
  useEffect(() => {
    if (phase !== 'running') {
      releaseWakeLock();
      return;
    }
    acquireWakeLock();
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        acquireWakeLock();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      releaseWakeLock();
    };
  }, [phase]);

  // Ring animation loop — reads Date.now-derived elapsed directly from the
  // hook's refs every frame, NOT from React state. This is the only way to
  // get a true 60fps ring without the effect being torn down every tick.
  // Intentionally does NOT depend on `stepElapsedMs` — deps are only the
  // structural values that truly require a restart.
  useEffect(() => {
    if (phase !== 'running' && phase !== 'paused') return;
    if (!ringRef.current) return;
    let raf = 0;
    const paint = () => {
      const stepMs = readStepMs();
      const timing = resolveStepTiming({
        isFinalStep,
        nominalDurationMs: currentStepDurationMs,
        totalMs,
        globalElapsedMs: readGlobalMs(),
        stepElapsedMs: stepMs,
      });
      const p = Math.min(1, Math.max(0, stepMs / timing.durationMs));
      if (ringRef.current) {
        ringRef.current.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - p));
      }
      // Keep painting while running; on pause the paused value is frozen
      // by readStepMs() anyway, but we can stop scheduling to save cycles.
      if (phase === 'running') {
        raf = requestAnimationFrame(paint);
      }
    };
    raf = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(raf);
  }, [phase, currentStepDurationMs, totalMs, stepIndex, isFinalStep, readGlobalMs, readStepMs]);

  // Flicker-free ring reset on step boundary. Must run synchronously before
  // the next paint. We compute the new step's correct starting offset from
  // live refs rather than snapping blindly to full — this eliminates a
  // one-frame visual flash where the rAF closure from the previous effect
  // instance might paint an incorrect (old duration / new startedAt)
  // combination between the reducer commit and the new rAF effect mounting.
  useLayoutEffect(() => {
    if (!ringRef.current) return;
    ringRef.current.style.transition = 'none';
    const stepMs = readStepMs();
    const timing = resolveStepTiming({
      isFinalStep,
      nominalDurationMs: currentStepDurationMs,
      totalMs,
      globalElapsedMs: readGlobalMs(),
      stepElapsedMs: stepMs,
    });
    const p = Math.min(1, Math.max(0, stepMs / timing.durationMs));
    ringRef.current.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - p));
    // force reflow
    void ringRef.current.getBoundingClientRect();
    ringRef.current.style.transition = '';
  }, [stepIndex, currentStepDurationMs, totalMs, isFinalStep, readGlobalMs, readStepMs]);

  // Auto-scroll the step pills row to keep the current step visible.
  useEffect(() => {
    if (!pillsScrollRef.current) return;
    const pillNode = pillsScrollRef.current.querySelector(`[data-step-index="${stepIndex}"]`);
    if (pillNode && typeof pillNode.scrollIntoView === 'function') {
      pillNode.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [stepIndex]);

  if (!open) return null;

  // Recipe is missing required timer data — refuse to render the timer.
  if (!isReady) {
    return createPortal(
      <div style={{
        position: 'fixed',
        inset: 0,
        background: C.bg,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        zIndex: 1000,
      }}>
        <div style={{ fontSize: 16, color: C.text, textAlign: 'center', marginBottom: 16, fontFamily: fonts.body }}>
          This recipe is missing timer data.
        </div>
        <div style={{ fontSize: 13, color: C.textMuted, textAlign: 'center', marginBottom: 24, fontFamily: fonts.body }}>
          Try regenerating it to get a timer-ready version.
        </div>
        <button
          onClick={onClose}
          style={{
            padding: '12px 24px', borderRadius: radius.md,
            background: C.accent, color: '#fff', border: 'none',
            fontSize: 15, fontWeight: 600, fontFamily: fonts.body, cursor: 'pointer',
          }}
        >
          Close
        </button>
      </div>,
      document.body
    );
  }

  const handleCloseRequest = () => {
    if (phase === 'countdown' || phase === 'running' || phase === 'paused') {
      setConfirmClose(true);
      return;
    }
    onClose?.();
  };

  const handleConfirmClose = () => {
    reset();
    setConfirmClose(false);
    onClose?.();
  };

  const handleSkipForward = () => {
    haptic.heavy().catch(() => {});
    skipForward();
  };

  const handleFinishBrew = () => {
    haptic.success().catch(() => {});
    finish('userFinished');
  };

  const handleSourceAction = () => {
    haptic.medium().catch(() => {});
    skipForward();
  };

  const handleRewind = () => {
    haptic.medium().catch(() => {});
    rewind();
  };

  const handlePauseToggle = () => {
    if (phase === 'running') {
      haptic.light().catch(() => {});
      pause();
    } else if (phase === 'paused') {
      haptic.light().catch(() => {});
      resume();
    }
  };

  const beanName = bean?.name || bean?.roasterName || '';
  const beanPhoto = bean?.productPhotoUrl || bean?.photoUrl || null;

  // Accent color for paused state
  const ringStrokeColor = phase === 'paused' ? C.accentLight : C.accent;
  const completionOverlayVisible = phase === 'done';

  return createPortal(
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        inset: 0,
        background: C.bg,
        display: 'flex',
        flexDirection: 'column',
        zIndex: 1000,
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        fontFamily: fonts.body,
      }}
    >
      <style>{`
        @keyframes brewCountdownPulse {
          0%   { transform: scale(0.3) rotate(-8deg); opacity: 0; }
          40%  { transform: scale(1.12) rotate(2deg); opacity: 1; }
          70%  { transform: scale(0.97) rotate(-1deg); }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        @keyframes brewRingGlow {
          0%, 100% { filter: drop-shadow(0 0 6px rgba(168,106,56,0.25)); }
          50% { filter: drop-shadow(0 0 14px rgba(168,106,56,0.45)); }
        }
        .brew-pills::-webkit-scrollbar { display: none; }
        .brew-ring-active {
          animation: brewRingGlow 2.4s ease-in-out infinite;
        }
      `}</style>

      {/* Header — glass chrome */}
      <div inert={completionOverlayVisible ? true : undefined} aria-hidden={completionOverlayVisible ? true : undefined} style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        borderBottom: `1px solid ${C.hairline}`,
        background: glass.chrome,
        backdropFilter: glass.blur,
        WebkitBackdropFilter: glass.blur,
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
          {beanPhoto && (
            <img
              src={beanPhoto}
              alt=""
              style={{
                width: 34, height: 34, borderRadius: radius.xs,
                objectFit: 'cover', flexShrink: 0,
                border: `1px solid ${C.hairline}`,
                boxShadow: shadows.e1,
              }}
            />
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontFamily: fonts.heading,
              fontSize: 15,
              fontWeight: 600,
              color: C.text,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              letterSpacing: '-0.01em',
            }}>
              {beanName || 'Brew Timer'}
            </div>
            {recipe?.title && (
              <div style={{
                fontSize: 11,
                color: C.textMuted,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                fontWeight: 500,
                marginTop: 1,
              }}>
                {recipe.title}
              </div>
            )}
          </div>
        </div>
        <m.button
          onClick={handleCloseRequest}
          aria-label="Close brew timer"
          whileTap={{ scale: 0.9 }}
          transition={spring.snappy}
          style={{
            width: 44, height: 44, borderRadius: '50%',
            background: 'transparent', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: C.textMuted, flexShrink: 0,
            willChange: 'transform',
          }}
        >
          <X size={20} strokeWidth={2} />
        </m.button>
      </div>

      {/* Main stage */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '28px 20px 16px',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div inert={completionOverlayVisible ? true : undefined} aria-hidden={completionOverlayVisible ? true : undefined} style={{ display: 'contents' }}>
        {/* Countdown overlay (covers the rest while active) */}
        {phase === 'countdown' && <Countdown onDone={beginRunning} />}

        {/* Ring */}
        <div style={{
          position: 'relative',
          width: 'min(280px, calc(100vw - 40px), 34vh)',
          aspectRatio: '1 / 1',
          flexShrink: 0,
        }}>
          <svg
            width="100%"
            height="100%"
            viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
            className={phase === 'running' ? 'brew-ring-active' : ''}
            style={{ willChange: 'filter' }}
          >
            {/* Hairline track */}
            <circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              fill="none"
              stroke={C.hairline}
              strokeWidth={2}
            />
            {/* Accent progress arc */}
            <circle
              ref={ringRef}
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              fill="none"
              stroke={ringStrokeColor}
              strokeWidth={RING_STROKE}
              strokeLinecap="round"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={RING_CIRCUMFERENCE}
              transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
              style={{ transition: 'stroke 0.3s ease' }}
            />
            {/* Soft warm bloom layer — static full ring behind the accent arc */}
            <circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              fill="none"
              stroke={C.accentSoft}
              strokeWidth={RING_STROKE + 6}
              opacity={0.45}
              style={{ pointerEvents: 'none' }}
            />
          </svg>
          {/* Centered readout */}
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            gap: 2,
          }}>
            {/* Phase pill */}
            <div style={{
              ...typeScale.label,
              color: phase === 'paused' ? C.textLight : C.accent,
              letterSpacing: '0.10em',
              marginBottom: 4,
              transition: 'color 0.3s ease',
            }}>
              {phase === 'paused' ? 'PAUSED' : phase === 'running' ? 'BREWING' : phase === 'idle' ? 'READY' : ''}
            </div>
            {/* Main countdown number */}
            <div style={{
              fontFamily: fonts.heading,
              fontSize: 64,
              fontWeight: 600,
              color: C.text,
              lineHeight: 1,
              letterSpacing: '-0.03em',
            }}>
              {formatMMSS(globalElapsedMs)}
            </div>
            <div style={{
              fontSize: 12,
              color: C.textLight,
              fontWeight: 500,
              marginTop: 4,
              letterSpacing: '0.01em',
            }}>
              {!hasGuideWindow
                ? isConfirmedSource && timer.sourceReadiness?.status === 'awaiting-observation'
                  ? 'waiting for your confirmation'
                  : 'finish on the source condition'
                : guideWindowPassed
                ? `past expected window · +${formatMMSS(globalElapsedMs - guideWindowMs[1])}`
                : guideWindowStarted
                  ? 'in expected window · finish on drawdown'
                  : `expected drawdown ${guideWindowText}`}
            </div>
          </div>
        </div>

        {(phase === 'running' || phase === 'paused') && (
          <button
            onClick={isConfirmedSource && currentStep ? handleSourceAction : handleFinishBrew}
            disabled={isConfirmedSource && currentStep ? timer.sourceActionDisabled || phase === 'paused' : false}
            aria-label={isConfirmedSource && currentStep ? timer.sourceActionLabel : 'Finish brew'}
            style={{ minHeight: 44, padding: '10px 18px', borderRadius: radius.pill, border: `1px solid ${C.accentLight}`, background: C.amberBg, color: C.accent, fontFamily: fonts.body, fontSize: 14, fontWeight: 700, cursor: isConfirmedSource && currentStep && (timer.sourceActionDisabled || phase === 'paused') ? 'default' : 'pointer', opacity: isConfirmedSource && currentStep && (timer.sourceActionDisabled || phase === 'paused') ? 0.5 : 1 }}
          >
            {isConfirmedSource && currentStep
              ? timer.sourceActionLabel
              : guideWindowStarted ? 'Finish When Drawdown Ends' : 'Finish Brew'}
          </button>
        )}

        {/* Current step name + instruction */}
        <div style={{ textAlign: 'center', padding: '12px 8px 6px', width: '100%' }}>
          <div style={{
            fontFamily: fonts.heading,
            fontSize: 26,
            fontWeight: 600,
            color: C.text,
            marginBottom: 8,
            lineHeight: 1.1,
            letterSpacing: '-0.01em',
          }}>
            {currentStep?.step?.name || currentStep?.step?.label || `Step ${stepIndex + 1}`}
          </div>
          <div role="status" aria-live="polite" aria-atomic="true" style={{
            fontSize: 14,
            color: C.textMuted,
            lineHeight: 1.5,
            maxWidth: 300,
            margin: '0 auto',
            fontWeight: 500,
          }}>
            {currentStep?.step?.action || ''}
          </div>
          {currentStep?.step?.waterTotal != null && (
            <div style={{
              marginTop: 12,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '7px 14px',
              borderRadius: radius.pill,
              background: C.accentSoft,
              border: `1px solid ${C.accentLight}`,
              fontSize: 13,
              fontWeight: 700,
              color: C.accent,
              letterSpacing: '0.01em',
            }}>
              {currentStep.step.waterTotal}{currentStep.step.waterUnit || 'g'} total
            </div>
          )}
          {isConfirmedSource && timer.sourceReadiness?.status === 'countdown' && (
            <div style={{ ...typeScale.caption, color: C.accent, marginTop: 8 }}>
              {formatMMSS(timer.sourceReadiness.remainingMs)} until the source checkpoint
            </div>
          )}
          {isConfirmedSource && timer.sourceReadiness?.status === 'awaiting-observation' && (
            <div style={{ ...typeScale.caption, color: C.accent, marginTop: 8 }}>
              Confirm only when you observe: {timer.sourceReadiness.condition}
            </div>
          )}
        </div>

        {/* Step pills */}
        <div
          ref={pillsScrollRef}
          className="brew-pills"
          style={{
            display: 'flex',
            gap: 8,
            overflowX: 'auto',
            width: '100%',
            padding: '10px 16px',
            scrollbarWidth: 'none',
          }}
        >
          {(timerSteps || []).map((ts, i) => {
            const status = i < stepIndex ? 'done' : i === stepIndex ? 'current' : 'upcoming';
            const remainingMs = resolveStepTiming({
              isFinalStep,
              nominalDurationMs: currentStepDurationMs,
              totalMs,
              globalElapsedMs,
              stepElapsedMs,
            }).remainingMs;
            const timeLabel = isConfirmedSource && status !== 'current'
              ? status === 'done' ? 'confirmed' : sourceTriggerLabel(ts.step)
              : isConfirmedSource && status === 'current'
                ? timer.sourceActive
                  ? 'confirm when finished'
                  : timer.sourceReadiness?.status === 'countdown'
                    ? `${formatMMSS(timer.sourceReadiness.remainingMs)} left`
                    : sourceTriggerLabel(ts.step)
                : status === 'current'
              ? (isFinalStep && guideRangeSeconds
                  ? guideWindowPassed
                    ? `+${formatMMSS(globalElapsedMs - guideWindowMs[1])} past window`
                    : guideWindowStarted
                      ? 'finish on drawdown'
                      : `${formatMMSS(guideWindowMs[0] - globalElapsedMs)} to window`
                  : isFinalStep && guideState.reached
                    ? `+${formatMMSS(guideState.overtimeMs)} over`
                    : `${formatMMSS(remainingMs)} left`)
              : status === 'done'
                ? `@${formatMMSS(ts.startSeconds * 1000)}`
                : `@${formatMMSS(ts.startSeconds * 1000)}`;
            return (
              <div key={i} data-step-index={i}>
                <StepPill
                  label={ts.step?.name || ts.step?.label || `Step ${i + 1}`}
                  status={status}
                  timeLabel={timeLabel}
                />
              </div>
            );
          })}
        </div>

        {/* Controls */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 20,
          padding: '12px 0 8px',
          width: '100%',
        }}>
          <ControlButton
            onClick={handleRewind}
            ariaLabel="Previous step"
            disabled={isConfirmedSource ? !timer.sourceCanUndo || phase === 'countdown' : stepIndex === 0 || phase === 'countdown'}
          >
            <SkipBack size={20} strokeWidth={2.5} />
          </ControlButton>
          <ControlButton
            onClick={handlePauseToggle}
            ariaLabel={phase === 'running' ? 'Pause' : 'Resume'}
            primary
            disabled={phase !== 'running' && phase !== 'paused'}
          >
            {phase === 'running'
              ? <Pause size={26} strokeWidth={2.5} />
              : <Play size={26} strokeWidth={2.5} />}
          </ControlButton>
          <ControlButton
            onClick={handleSkipForward}
            ariaLabel="Next step"
            disabled={isConfirmedSource || phase === 'countdown' || isFinalStep}
          >
            <SkipForward size={20} strokeWidth={2.5} />
          </ControlButton>
        </div>
        </div>

        {/* Completion screen overlay */}
        {phase === 'done' && recipe?.isIced && !chilled && (
          <ChillServeScreen postBrewInstruction={recipe?.postBrewSteps?.[0]?.action} onCoffeeChilled={() => setChilled(true)} onDismiss={onClose} saveState={saveState} onRetrySave={persistCompletion} />
        )}
        {phase === 'done' && (!recipe?.isIced || chilled) && (
          <CompletionScreen
            bean={bean}
            totalElapsedMs={globalElapsedMs}
            saveState={saveState}
            onRetrySave={persistCompletion}
            onStartTasting={onStartTasting ? () => onStartTasting(bean?.id) : null}
            onDone={onClose}
          />
        )}
      </div>

      {/* Close confirmation */}
      {confirmClose && (
        <div style={{
          position: 'absolute',
          inset: 0,
          background: glass.scrim,
          backdropFilter: glass.blurStrong,
          WebkitBackdropFilter: glass.blurStrong,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          zIndex: 3,
        }}>
          <m.div
            {...popIn}
            style={{
              background: glass.sheet,
              borderRadius: radius.xl,
              padding: 28,
              maxWidth: 320,
              width: '100%',
              textAlign: 'center',
              boxShadow: shadows.modal,
              border: `1px solid ${C.hairline}`,
              backdropFilter: glass.blur,
              WebkitBackdropFilter: glass.blur,
            }}
          >
            <div style={{
              fontFamily: fonts.heading,
              fontSize: 24,
              fontWeight: 600,
              color: C.text,
              marginBottom: 8,
              letterSpacing: '-0.01em',
            }}>
              Stop the brew?
            </div>
            <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 24, lineHeight: 1.5, fontFamily: fonts.body }}>
              You'll lose the current timer progress.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <m.button
                onClick={() => setConfirmClose(false)}
                whileTap={{ scale: 0.97 }}
                transition={spring.snappy}
                style={{
                  flex: 1,
                  padding: '13px',
                  borderRadius: radius.md,
                  background: 'transparent',
                  color: C.text,
                  border: `1px solid ${C.border}`,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: fonts.body,
                  willChange: 'transform',
                }}
              >
                Keep brewing
              </m.button>
              <m.button
                onClick={handleConfirmClose}
                whileTap={{ scale: 0.97 }}
                transition={spring.snappy}
                style={{
                  flex: 1,
                  padding: '13px',
                  borderRadius: radius.md,
                  background: C.red,
                  color: '#fff',
                  border: 'none',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: fonts.body,
                  willChange: 'transform',
                }}
              >
                Stop
              </m.button>
            </div>
          </m.div>
        </div>
      )}
    </div>,
    document.body
  );
};

function ConfirmedSourceBrewTimerSession({ onReplaceSourceTimerState, ...props }) {
  const timer = useConfirmedSourceTimer(props.recipe, {
    sourceTimerState: props.sourceTimerState,
    onSourceTimerStateChange: props.onSourceTimerStateChange,
    sourceTimerBinding: props.sourceTimerBinding,
    onReplaceSourceTimerState,
  });
  return <BrewTimerShell {...props} timerOverride={timer} />;
}

function ConfirmedSourceBrewTimer({ onSourceTimerStateChange, ...props }) {
  const [sessionState, setSessionState] = useState(props.sourceTimerState);
  const [generation, setGeneration] = useState(0);
  const publishState = useCallback((next) => {
    setSessionState(next);
    onSourceTimerStateChange?.(next);
  }, [onSourceTimerStateChange]);
  const replaceState = useCallback((next) => {
    publishState(next);
    setGeneration((value) => value + 1);
  }, [publishState]);
  return (
    <ConfirmedSourceBrewTimerSession
      key={generation}
      {...props}
      sourceTimerState={sessionState}
      onSourceTimerStateChange={publishState}
      onReplaceSourceTimerState={replaceState}
    />
  );
}

export function BrewTimer(props) {
  if (sourceTimerMode(props.recipe) === 'confirmed') return <ConfirmedSourceBrewTimer {...props} />;
  return <BrewTimerShell {...props} />;
}
