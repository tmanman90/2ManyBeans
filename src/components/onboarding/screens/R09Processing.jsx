import { useEffect, useRef, useState } from 'react';
import { C, fonts, type as t, radius } from '../../../styles/theme';
import { m, fadeUp } from '../../../lib/motion';
import { useOnboarding } from '../OnboardingContext';
import { MascotStage, NoteBubble, OnboardingTopBar, onboardingBg } from './OnboardingPrimitives';
import { PROCESSING_MS } from '../onboardingConstants';

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
      <OnboardingTopBar hideBack overlay />

      <MascotStage src="/images/ruphus-animations/ruphus-celebrating.mp4" height={410} />

      <m.div
        {...fadeUp}
        style={{
          flex: 1,
          padding: '4px 24px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          minHeight: 0,
          alignItems: 'center',
        }}
      >
        <div style={{
          ...t.h1,
          color: C.text,
          textAlign: 'center',
          width: '100%',
        }}>
          Building your brew plan
        </div>

        {/* Animated quip */}
        <m.div
          key={quipIndex}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          style={{ width: '100%' }}
        >
          <NoteBubble style={{ marginTop: 4 }}>
            {QUIPS[quipIndex]}
          </NoteBubble>
        </m.div>

        {/* Refined progress bar */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          marginTop: 8,
          width: '100%',
        }}>
          {/* Hairline track */}
          <div style={{
            width: '100%',
            maxWidth: 280,
            height: 3,
            background: C.hairline,
            borderRadius: radius.pill,
            overflow: 'hidden',
            position: 'relative',
          }}>
            {/* Accent fill */}
            <div style={{
              position: 'absolute',
              inset: 0,
              background: `linear-gradient(90deg, ${C.accent} 0%, ${C.accentLight} 100%)`,
              borderRadius: radius.pill,
              transformOrigin: 'left center',
              animation: `r09-fill ${PROCESSING_MS}ms cubic-bezier(0.22,1,0.36,1) forwards`,
            }} />
          </div>

          <div style={{
            marginTop: 12,
            ...t.caption,
            color: C.textLight,
            letterSpacing: '0.06em',
          }}>
            Just a moment...
          </div>
        </div>
      </m.div>

      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          @keyframes r09-fill {
            from { transform: scaleX(0); }
            to   { transform: scaleX(1); }
          }
        }
      `}</style>
    </div>
  );
}
