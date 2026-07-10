import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { C, fonts, type as t } from '../../../styles/theme';
import { m, listContainer, listItem } from '../../../lib/motion';
import { useOnboarding } from '../OnboardingContext';
import { OnboardingPalateChart } from '../OnboardingPalateChart';
import { MascotStage, NoteBubble, OnboardingTopBar, onboardingBg } from './OnboardingPrimitives';
import { AXIS_LABELS } from '../../../lib/onboardingPalate';
import { R09_ASSEMBLY_MS, R09_REDUCE_DWELL_MS } from '../onboardingConstants';

// Fixed axis order (matches CREATIVE_SPEC Appendix A2 + the R5 tinder deck
// c1..c5 order). Object key order in AXIS_LABELS already matches this, but
// spelling it out here keeps the beat sequence explicit and audit-friendly.
const AXIS_ORDER = ['sweetness', 'acidity', 'body', 'clean_funky', 'fruit_nutty'];

// Per-axis reveal beat (CREATIVE_SPEC §2 R09: "600ms apart"). Distinct from
// R09_ASSEMBLY_MS (the total auto-advance dwell) — this is the fixed
// per-beat cadence the spec calls out as a literal number, not a fraction of
// the total.
const AXIS_BEAT_MS = 600;

function axisLine(label, value) {
  if (value > 0) return `${label}: you lean in.`;
  if (value < 0) return `${label}: not your thing.`;
  return `${label}: still open.`;
}

export default function R09Processing() {
  const { dispatch, answers } = useOnboarding();
  const reduce = useReducedMotion();
  const chart = answers?.palateChart && typeof answers.palateChart === 'object' ? answers.palateChart : {};

  const lines = AXIS_ORDER.map((key) => axisLine(AXIS_LABELS[key], chart[key] || 0));
  const [lineIndex, setLineIndex] = useState(reduce ? lines.length - 1 : 0);

  const controlRef = useRef(null);
  if (controlRef.current === null) {
    controlRef.current = { canceled: false, hasAdvanced: false, mountedAt: 0 };
  }

  useEffect(() => {
    const control = controlRef.current;
    control.canceled = false;
    control.hasAdvanced = false;
    control.mountedAt = performance.now();
    const dwellMs = reduce ? R09_REDUCE_DWELL_MS : R09_ASSEMBLY_MS;

    const advance = () => {
      if (control.canceled || control.hasAdvanced) return;
      control.hasAdvanced = true;
      dispatch({ type: 'ADVANCE', next: 'r10' });
    };

    // Reduced motion: single final caption, no line cycling.
    let beatTimer = null;
    if (!reduce) {
      setLineIndex(0);
      beatTimer = setInterval(() => {
        setLineIndex((i) => Math.min(i + 1, lines.length - 1));
      }, AXIS_BEAT_MS);
    } else {
      setLineIndex(lines.length - 1);
    }

    const finishTimer = setTimeout(advance, dwellMs);

    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      const elapsed = performance.now() - control.mountedAt;
      const cacheReady = !!(typeof window !== 'undefined' && window.__rcOfferingsCache);
      if (elapsed >= dwellMs && cacheReady) advance();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      control.canceled = true;
      if (beatTimer) clearInterval(beatTimer);
      clearTimeout(finishTimer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, reduce]);

  return (
    <div style={{
      width: '100%',
      minHeight: '100dvh',
      maxHeight: '100dvh',
      background: onboardingBg,
      display: 'flex',
      flexDirection: 'column',
      fontFamily: fonts.body,
      position: 'relative',
      overflow: 'hidden',
    }}>
      <OnboardingTopBar hideBack overlay />

      <MascotStage src="/images/ruphus-animations/ruphus-examining-v3.mp4" height={330} />

      <m.div
        variants={listContainer}
        initial="initial"
        animate="animate"
        style={{
          flex: 1,
          padding: '4px 24px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          minHeight: 0,
          alignItems: 'center',
          overflowY: 'auto',
        }}
      >
        <m.div variants={listItem} style={{
          ...t.display,
          color: C.text,
          textAlign: 'center',
          width: '100%',
        }}>
          Reading your palate.
        </m.div>

        {/* Centerpiece: the real computed palate chart. The chart itself is a
            single SVG (OnboardingPalateChart) — we don't modify that shared
            component to stagger its internals. Instead it reveals once at the
            first beat (delay 0), and the per-axis stagger lives in the label
            list below it. */}
        <div className="r09-beat" style={{ '--axis-i': 0, marginTop: 2 }}>
          <OnboardingPalateChart chart={chart} size={200} />
        </div>

        <div style={{ width: '100%', maxWidth: 280, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {AXIS_ORDER.map((key, i) => {
            const value = chart[key] || 0;
            return (
              <div
                key={key}
                className="r09-beat"
                style={{
                  '--axis-i': i,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '5px 2px',
                }}
              >
                <span style={{
                  fontFamily: fonts.body,
                  fontSize: 14,
                  fontWeight: 600,
                  color: C.text,
                }}>
                  {AXIS_LABELS[key]}
                </span>
                <span
                  aria-hidden
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: 999,
                    background: value > 0 ? C.accent : 'transparent',
                    border: value >= 0 ? `1px solid ${C.accent}` : `1px solid ${C.textLight}`,
                    opacity: value < 0 ? 0.5 : 1,
                  }}
                />
              </div>
            );
          })}
        </div>

        {/* NoteBubble text changes with the same beats — sequential lines,
            one per axis, final state always the last line. CSS-driven fade
            per remount (same pattern as OnboardingTopBar's chapter-label
            cross-fade), NOT a framer mount animation. */}
        <div key={lineIndex} className="r09-line-fade" style={{ width: '100%', marginTop: 4 }}>
          <NoteBubble>
            {reduce ? "Here's your palate, mapped." : lines[lineIndex]}
          </NoteBubble>
        </div>

        <m.div variants={listItem} style={{
          marginTop: 6,
          ...t.caption,
          color: C.textLight,
          letterSpacing: '0.06em',
        }}>
          Just a moment...
        </m.div>
      </m.div>

      <style>{`
        .r09-beat, .r09-line-fade { opacity: 1; }
        @media (prefers-reduced-motion: no-preference) {
          @keyframes r09-beat-in {
            from { opacity: 0; transform: translateY(8px); }
            to   { opacity: 1; transform: translateY(0); }
          }
          .r09-beat {
            opacity: 0;
            animation: r09-beat-in 240ms cubic-bezier(0.22,1,0.36,1) both;
            animation-delay: calc(var(--axis-i) * 600ms);
          }
          .r09-line-fade {
            opacity: 0;
            animation: r09-beat-in 240ms cubic-bezier(0.22,1,0.36,1) both;
          }
        }
      `}</style>
    </div>
  );
}
