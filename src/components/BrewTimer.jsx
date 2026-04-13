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

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Pause, Play, SkipForward, SkipBack, Check } from 'lucide-react';
import { C, fonts, shadows } from '../styles/theme';
import { haptic } from './../lib/haptics';
import { useBrewTimer, formatMMSS } from '../hooks/useBrewTimer';
import { acquireWakeLock, releaseWakeLock } from '../lib/wakeLock';

const RING_SIZE = 260;
const RING_STROKE = 14;
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
          fontFamily: fonts.title,
          fontSize: 180,
          color: C.accent,
          lineHeight: 1,
          animation: 'brewCountdownPulse 0.9s ease-out',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function CompletionScreen({ bean, totalElapsedMs, onStartTasting, onDone }) {
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
      <div style={{
        width: 96, height: 96, borderRadius: '50%',
        background: C.greenBg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 24,
      }}>
        <Check size={48} color={C.green} strokeWidth={3} />
      </div>
      <div style={{
        fontFamily: fonts.title,
        fontSize: 40,
        color: C.text,
        marginBottom: 8,
        textAlign: 'center',
      }}>
        Brew Complete
      </div>
      <div style={{ fontSize: 14, color: C.textMuted, marginBottom: 4 }}>Total time</div>
      <div style={{
        fontFamily: fonts.heading,
        fontSize: 44,
        color: C.accent,
        fontWeight: 700,
        marginBottom: 40,
      }}>
        {formatMMSS(totalElapsedMs)}
      </div>
      {onStartTasting && (
        <button
          onClick={onStartTasting}
          style={{
            width: '100%',
            maxWidth: 320,
            padding: '16px 24px',
            borderRadius: 14,
            background: C.accent,
            color: '#fff',
            border: 'none',
            fontSize: 16,
            fontWeight: 700,
            fontFamily: fonts.body,
            cursor: 'pointer',
            boxShadow: shadows.button,
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
          borderRadius: 14,
          background: 'transparent',
          color: C.textMuted,
          border: `1px solid ${C.border}`,
          fontSize: 15,
          fontWeight: 600,
          fontFamily: fonts.body,
          cursor: 'pointer',
        }}
      >
        Done
      </button>
    </div>
  );
}

function StepPill({ label, status, timeLabel }) {
  const bg = status === 'current' ? C.accent : status === 'done' ? C.greenBg : C.cardMuted;
  const fg = status === 'current' ? '#fff' : status === 'done' ? C.green : C.textMuted;
  return (
    <div style={{
      flex: '0 0 auto',
      padding: '10px 14px',
      borderRadius: 20,
      background: bg,
      color: fg,
      fontSize: 12,
      fontWeight: 600,
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      whiteSpace: 'nowrap',
    }}>
      {status === 'done' && <Check size={12} strokeWidth={3} />}
      <span>{label}</span>
      <span style={{ opacity: 0.85, fontWeight: 500 }}>{timeLabel}</span>
    </div>
  );
}

function ControlButton({ onClick, children, ariaLabel, primary, disabled }) {
  const size = primary ? 72 : 56;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: primary ? C.accent : C.cream,
        color: primary ? '#fff' : C.text,
        border: primary ? 'none' : `1px solid ${C.border}`,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: primary ? shadows.button : 'none',
        padding: 0,
      }}
    >
      {children}
    </button>
  );
}

export const BrewTimer = ({ open, recipe, bean, onClose, onStartTasting }) => {
  const timer = useBrewTimer(recipe);
  const {
    phase, stepIndex, timerSteps, currentStep, currentStepDurationMs,
    globalElapsedMs, stepElapsedMs, totalMs,
    readStepMs,
    start, beginRunning, pause, resume, skipForward, rewind, reset,
    isReady,
  } = timer;

  const ringRef = useRef(null);
  const pillsScrollRef = useRef(null);
  const [confirmClose, setConfirmClose] = useState(false);

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
    const duration = currentStepDurationMs || 1;
    let raf = 0;
    const paint = () => {
      const stepMs = readStepMs();
      const p = Math.min(1, Math.max(0, stepMs / duration));
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
  }, [phase, currentStepDurationMs, stepIndex, readStepMs]);

  // Flicker-free ring reset on step boundary. Must run synchronously before
  // the next paint. We compute the new step's correct starting offset from
  // live refs rather than snapping blindly to full — this eliminates a
  // one-frame visual flash where the rAF closure from the previous effect
  // instance might paint an incorrect (old duration / new startedAt)
  // combination between the reducer commit and the new rAF effect mounting.
  useLayoutEffect(() => {
    if (!ringRef.current) return;
    ringRef.current.style.transition = 'none';
    const duration = currentStepDurationMs || 1;
    const stepMs = readStepMs();
    const p = Math.min(1, Math.max(0, stepMs / duration));
    ringRef.current.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - p));
    // force reflow
    void ringRef.current.getBoundingClientRect();
    ringRef.current.style.transition = '';
  }, [stepIndex, currentStepDurationMs, readStepMs]);

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
        <div style={{ fontSize: 16, color: C.text, textAlign: 'center', marginBottom: 16 }}>
          This recipe is missing timer data.
        </div>
        <div style={{ fontSize: 13, color: C.textMuted, textAlign: 'center', marginBottom: 24 }}>
          Try regenerating it to get a timer-ready version.
        </div>
        <button
          onClick={onClose}
          style={{
            padding: '12px 24px', borderRadius: 12,
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
    if (phase === 'running' || phase === 'paused') {
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
          0%   { transform: scale(0.4); opacity: 0; }
          35%  { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        .brew-pills::-webkit-scrollbar { display: none; }
      `}</style>

      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        borderBottom: `1px solid ${C.borderLight}`,
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
          {beanPhoto && (
            <img
              src={beanPhoto}
              alt=""
              style={{ width: 32, height: 32, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }}
            />
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: 13,
              fontWeight: 700,
              color: C.text,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
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
              }}>
                {recipe.title}
              </div>
            )}
          </div>
        </div>
        <button
          onClick={handleCloseRequest}
          aria-label="Close brew timer"
          style={{
            width: 44, height: 44, borderRadius: '50%',
            background: 'transparent', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: C.text, flexShrink: 0,
          }}
        >
          <X size={22} />
        </button>
      </div>

      {/* Main stage */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '24px 20px 16px',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Countdown overlay (covers the rest while active) */}
        {phase === 'countdown' && <Countdown onDone={beginRunning} />}

        {/* Ring */}
        <div style={{ position: 'relative', width: RING_SIZE, height: RING_SIZE, flexShrink: 0 }}>
          <svg width={RING_SIZE} height={RING_SIZE}>
            <circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              fill="none"
              stroke={C.borderLight}
              strokeWidth={RING_STROKE}
            />
            <circle
              ref={ringRef}
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              fill="none"
              stroke={C.accent}
              strokeWidth={RING_STROKE}
              strokeLinecap="round"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={RING_CIRCUMFERENCE}
              transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
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
          }}>
            <div style={{
              fontFamily: fonts.heading,
              fontSize: 56,
              fontWeight: 700,
              color: C.text,
              lineHeight: 1,
            }}>
              {formatMMSS(globalElapsedMs)}
            </div>
            <div style={{ fontSize: 13, color: C.textMuted, marginTop: 6 }}>
              of {formatMMSS(totalMs)}
            </div>
          </div>
        </div>

        {/* Current step name + instruction */}
        <div style={{ textAlign: 'center', padding: '16px 8px 8px', width: '100%' }}>
          <div style={{
            fontFamily: fonts.title,
            fontSize: 32,
            color: C.text,
            marginBottom: 6,
            lineHeight: 1.1,
          }}>
            {currentStep?.step?.name || currentStep?.step?.label || `Step ${stepIndex + 1}`}
          </div>
          <div style={{
            fontSize: 14,
            color: C.textMuted,
            lineHeight: 1.45,
            maxWidth: 320,
            margin: '0 auto',
          }}>
            {currentStep?.step?.action || ''}
          </div>
          {currentStep?.step?.waterTotal != null && (
            <div style={{
              marginTop: 10,
              display: 'inline-block',
              padding: '6px 12px',
              borderRadius: 12,
              background: C.cream,
              border: `1px solid ${C.border}`,
              fontSize: 13,
              fontWeight: 600,
              color: C.text,
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
            padding: '12px 4px',
            scrollbarWidth: 'none',
          }}
        >
          {(timerSteps || []).map((ts, i) => {
            const status = i < stepIndex ? 'done' : i === stepIndex ? 'current' : 'upcoming';
            const remainingMs = Math.max(0, currentStepDurationMs - stepElapsedMs);
            const timeLabel = status === 'current'
              ? `${formatMMSS(remainingMs)} left`
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
          gap: 24,
          padding: '16px 0 8px',
          width: '100%',
        }}>
          <ControlButton
            onClick={handleRewind}
            ariaLabel="Previous step"
            disabled={stepIndex === 0 || phase === 'countdown'}
          >
            <SkipBack size={22} strokeWidth={2.5} />
          </ControlButton>
          <ControlButton
            onClick={handlePauseToggle}
            ariaLabel={phase === 'running' ? 'Pause' : 'Resume'}
            primary
            disabled={phase !== 'running' && phase !== 'paused'}
          >
            {phase === 'running'
              ? <Pause size={28} strokeWidth={2.5} />
              : <Play size={28} strokeWidth={2.5} />}
          </ControlButton>
          <ControlButton
            onClick={handleSkipForward}
            ariaLabel="Next step"
            disabled={phase === 'countdown'}
          >
            <SkipForward size={22} strokeWidth={2.5} />
          </ControlButton>
        </div>

        {/* Completion screen overlay */}
        {phase === 'done' && (
          <CompletionScreen
            bean={bean}
            totalElapsedMs={globalElapsedMs}
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
          background: 'rgba(59, 36, 23, 0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          zIndex: 3,
        }}>
          <div style={{
            background: C.cream,
            borderRadius: 16,
            padding: 24,
            maxWidth: 320,
            width: '100%',
            textAlign: 'center',
            boxShadow: shadows.modal,
          }}>
            <div style={{
              fontFamily: fonts.title,
              fontSize: 28,
              color: C.text,
              marginBottom: 8,
            }}>
              Stop the brew?
            </div>
            <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 20 }}>
              You'll lose the current timer progress.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setConfirmClose(false)}
                style={{
                  flex: 1,
                  padding: '12px',
                  borderRadius: 12,
                  background: 'transparent',
                  color: C.text,
                  border: `1px solid ${C.border}`,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: fonts.body,
                }}
              >
                Keep brewing
              </button>
              <button
                onClick={handleConfirmClose}
                style={{
                  flex: 1,
                  padding: '12px',
                  borderRadius: 12,
                  background: C.red,
                  color: '#fff',
                  border: 'none',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: fonts.body,
                }}
              >
                Stop
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
};
