import { useEffect, useRef, useState } from 'react';
import { C, fonts } from '../../../styles/theme';
import { useOnboarding } from '../OnboardingContext';
import { MascotStage, NoteBubble, OnboardingTopBar, onboardingBg } from './OnboardingPrimitives';

const PROCESSING_MS = 3000;
const QUIPS = [
  'Studying your palate...',
  'Calibrating recipes...',
  'Reading the bag...',
  'Warming up the timer...',
  'Pouring your welcome cup...',
  'Almost ready.',
];

export default function R09Processing() {
  const { dispatch } = useOnboarding();
  const [quipIndex, setQuipIndex] = useState(0);

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
    }, 1500);

    const finishTimer = setTimeout(advance, PROCESSING_MS);

    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      const elapsed = performance.now() - control.mountedAt;
      const cacheReady = !!(typeof window !== 'undefined' && window.__rcOfferingsCache);
      if (elapsed >= PROCESSING_MS && cacheReady) advance();
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
      <OnboardingTopBar step="R9 · BUILDING YOUR PLAN" hideBack overlay />

      <MascotStage src="/images/ruphus-animations/ruphus-celebrating.mp4" height={410} />

      <div style={{
        flex: 1,
        padding: '4px 24px 8px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        minHeight: 0,
      }}>
        <div style={{
          fontFamily: fonts.heading,
          fontSize: 26, lineHeight: 1.15,
          color: C.text,
          textAlign: 'center',
        }}>
          Building your brew plan
        </div>

        <NoteBubble style={{ marginTop: 4 }}>
          {QUIPS[quipIndex]}
        </NoteBubble>

        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 4,
        }}>
          <div style={{
            width: '100%', maxWidth: 280, height: 10,
            background: C.cardMuted,
            borderRadius: 999, overflow: 'hidden',
            border: `1px solid ${C.borderLight}`,
          }}>
            <div style={{
              width: '100%', height: '100%',
              background: C.accent,
              borderRadius: 999,
              transformOrigin: 'left center',
              animation: `onboarding-processing-fill ${PROCESSING_MS}ms linear forwards`,
            }} />
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: C.textMuted }}>
            Just a moment...
          </div>
        </div>
      </div>

      <style>{`
        @keyframes onboarding-processing-fill {
          from { transform: scaleX(0); }
          to { transform: scaleX(1); }
        }
      `}</style>
    </div>
  );
}
