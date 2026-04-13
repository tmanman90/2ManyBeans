import { useEffect, useRef, useState } from 'react';
import { C, fonts, radius } from '../../../styles/theme';
import { OnboardingScreenShell } from './OnboardingScreenShell';
import { useOnboarding } from '../OnboardingContext';

// R9 — processing moment. This is the wall-clock beat that masks the
// RC offerings fetch race (kicked off at R7 mount via warmPaywallOfferings).
//
// Advance rules:
// - 3s minimum on screen (CSS keyframes progress bar, no JS tick loop).
// - If the user backgrounds the app, iOS pauses the JS timer. On return,
//   we check elapsed time via performance.now() and advance if
//   wall-clock already passed the 3s mark AND the offerings cache is
//   populated.
// - advance() is idempotent — both the setTimeout path and the
//   visibilitychange path call it, but a hasAdvanced latch + canceled
//   flag guarantee exactly one dispatch.
// - backDisabled — partial-processed state is meaningless to rewind.

const PROCESSING_MS = 3000;
const QUIPS = [
  'Studying your palate…',
  'Pouring your welcome cup…',
  'Warming up the timer…',
  'Almost ready.',
];

export default function R09Processing() {
  const { dispatch } = useOnboarding();
  const [quipIndex, setQuipIndex] = useState(0);

  // Single mutable control object so every async callback reads the
  // same canceled / hasAdvanced state. Created once via useRef so
  // StrictMode's dev double-invoke gets reset cleanly.
  const controlRef = useRef(null);
  if (controlRef.current === null) {
    controlRef.current = { canceled: false, hasAdvanced: false, mountedAt: 0 };
  }

  useEffect(() => {
    const control = controlRef.current;
    control.canceled = false;
    control.hasAdvanced = false;
    control.mountedAt = performance.now();

    const advance = () => {
      if (control.canceled || control.hasAdvanced) return;
      control.hasAdvanced = true;
      dispatch({ type: 'ADVANCE', next: 'r10' });
    };

    const quipTimer = setInterval(() => {
      setQuipIndex((i) => (i + 1) % QUIPS.length);
    }, 1000);

    // Floor advance at 3s — this is the "normal" path.
    const finishTimer = setTimeout(advance, PROCESSING_MS);

    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      // On iOS, backgrounding pauses setTimeout. When we come back we
      // check actual elapsed wall-clock time and advance if the 3s
      // floor has already passed AND the RC offerings cache has been
      // populated (success OR error — either way we don't need to wait).
      const elapsed = performance.now() - control.mountedAt;
      const cacheReady = !!(typeof window !== 'undefined' && window.__rcOfferingsCache);
      if (elapsed >= PROCESSING_MS && cacheReady) {
        advance();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      control.canceled = true;
      clearInterval(quipTimer);
      clearTimeout(finishTimer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [dispatch]);

  return (
    <OnboardingScreenShell
      title="Building your brew plan"
      ruphusLine={QUIPS[quipIndex]}
      backDisabled
    >
      {/* Progress bar — CSS keyframes only, no JS tick loop to race
          against. The timer-based advance handles the state transition
          regardless of whether the CSS animation finished rendering. */}
      <div style={{
        marginTop: 20,
        marginBottom: 20,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}>
        <div
          style={{
            width: '100%',
            maxWidth: 280,
            height: 12,
            background: C.cardMuted,
            borderRadius: 999,
            overflow: 'hidden',
            border: `1px solid ${C.borderLight}`,
          }}
          aria-hidden
        >
          <div
            style={{
              width: '100%',
              height: '100%',
              background: C.accent,
              borderRadius: 999,
              transformOrigin: 'left center',
              animation: `onboarding-processing-fill ${PROCESSING_MS}ms linear forwards`,
            }}
          />
        </div>
        <div style={{
          marginTop: 14,
          fontSize: 13,
          color: C.textMuted,
          fontFamily: fonts.body,
        }}>
          Just a moment…
        </div>
      </div>

      {/* Inline keyframes to keep this self-contained. Scoped via a
          styled <style> tag — CSS variable approach is overkill for
          a one-shot animation. */}
      <style>{`
        @keyframes onboarding-processing-fill {
          from { transform: scaleX(0); }
          to { transform: scaleX(1); }
        }
      `}</style>

      <div style={{
        background: C.card,
        border: `1px solid ${C.borderLight}`,
        borderRadius: radius.md,
        padding: '14px 16px',
        marginTop: 8,
      }}>
        <div style={{
          fontSize: 14,
          color: C.textMuted,
          lineHeight: 1.5,
        }}>
          I'm tuning recommendations to the palate you just gave me. Don't
          close the app — it'll only take a second.
        </div>
      </div>
    </OnboardingScreenShell>
  );
}
