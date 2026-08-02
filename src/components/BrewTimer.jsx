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

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { assetUrl } from "../lib/assetUrl";
import { createPortal } from 'react-dom';
import { X, Pause, Play, SkipForward, SkipBack, Check } from 'lucide-react';
import { C, fonts, shadows, radius, glass, type as typeScale } from '../styles/theme';
import { m, spring, popIn } from '../lib/motion';
import { haptic } from './../lib/haptics';
import { useBrewTimer, formatMMSS } from '../hooks/useBrewTimer';
import { acquireWakeLock, releaseWakeLock } from '../lib/wakeLock';
import { timingContextFromRecipe } from '../lib/brewTimingMemory';
import { resolveGuideState, resolveStepTiming } from '../lib/brewTimerSteps';

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

export const BrewTimer = ({ open, recipe, bean, onClose, onStartTasting, onSaveTimingEvent }) => {
  const timer = useBrewTimer(recipe);
  const {
    phase, stepIndex, timerSteps, currentStep, currentStepDurationMs,
    globalElapsedMs, stepElapsedMs, totalMs,
    readGlobalMs, readStepMs,
    start, beginRunning, pause, resume, finish, skipForward, rewind, reset, completionKind, completionElapsedMs,
    isReady,
  } = timer;

  const ringRef = useRef(null);
  const pillsScrollRef = useRef(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [saveState, setSaveState] = useState(null);
  const sessionRef = useRef(null);
  const reportedRef = useRef(false);
  const isFinalStep = !!timerSteps && stepIndex + 1 >= timerSteps.length;
  const guideState = resolveGuideState(globalElapsedMs, totalMs);

  // Freeze the effective render-time recipe as the session opens. This is
  // after HandBrewModal's dose scaling/iced transform and cannot be polluted
  // by later regeneration or a changed dose control.
  useEffect(() => {
    if (!open) {
      sessionRef.current = null;
      reportedRef.current = false;
      setSaveState(null);
      return;
    }
    if (!sessionRef.current && recipe && bean?.id) {
      const context = timingContextFromRecipe({ beanId: bean.id, recipe, mode: recipe.isIced ? 'iced' : 'hot' });
      sessionRef.current = {
        ...context,
        sessionId: globalThis.crypto?.randomUUID?.() || `brew-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        createdAt: Date.now(),
      };
    }
  }, [open, recipe, bean?.id]);

  const persistCompletion = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || !completionKind) {
      setSaveState('ephemeral');
      return;
    }
    setSaveState('saving');
    const result = await onSaveTimingEvent?.({
      ...session,
      actualElapsedMs: completionElapsedMs ?? readGlobalMs(),
      completionKind,
    }) || { status: 'ephemeral' };
    setSaveState(result.status);
  }, [completionElapsedMs, completionKind, onSaveTimingEvent, readGlobalMs]);

  useEffect(() => {
    if (phase !== 'done' || reportedRef.current) return;
    reportedRef.current = true;
    persistCompletion();
  }, [phase, persistCompletion]);

  // Auto-start countdown when the timer opens with a valid recipe.
  useEffect(() => {
    if (!open) {
      reset();
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
      <div style={{
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
        {/* Countdown overlay (covers the rest while active) */}
        {phase === 'countdown' && <Countdown onDone={beginRunning} />}

        {/* Ring */}
        <div style={{
          position: 'relative',
          width: RING_SIZE, height: RING_SIZE,
          flexShrink: 0,
        }}>
          <svg
            width={RING_SIZE}
            height={RING_SIZE}
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
              {guideState.reached
                ? `guide reached · +${formatMMSS(guideState.overtimeMs)}`
                : `guide finish ${formatMMSS(totalMs)}`}
            </div>
          </div>
        </div>

        {(phase === 'running' || phase === 'paused') && (
          <button
            onClick={handleFinishBrew}
            aria-label="Finish brew"
            style={{ minHeight: 44, padding: '10px 18px', borderRadius: radius.pill, border: `1px solid ${C.accentLight}`, background: C.amberBg, color: C.accent, fontFamily: fonts.body, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
          >
            {guideState.reached ? 'Finish When Drawdown Ends' : 'Finish Brew'}
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
          <div style={{
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
              {currentStep.step.waterTotal}g total
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
            const timeLabel = status === 'current'
              ? (isFinalStep && guideState.reached
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
            disabled={stepIndex === 0 || phase === 'countdown'}
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
            disabled={phase === 'countdown' || isFinalStep}
          >
            <SkipForward size={20} strokeWidth={2.5} />
          </ControlButton>
        </div>

        {/* Completion screen overlay */}
        {phase === 'done' && (
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
