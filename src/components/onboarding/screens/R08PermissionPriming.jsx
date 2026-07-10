import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { C, fonts, type as t, radius, shadows, cardBase } from '../../../styles/theme';
import { m, fadeUp, listContainer, listItem } from '../../../lib/motion';
import { useOnboarding } from '../OnboardingContext';
import { logOnboardingEvent } from '../../../lib/onboardingAnalytics';
import { MascotStage, NoteBubble, OnboardingTopBar, OnboardingCtaBar, onboardingBg } from './OnboardingPrimitives';
import { CAMERA_IMPORT_TIMEOUT_MS, CAMERA_PERMISSION_TIMEOUT_MS } from '../onboardingConstants';

// Benefit rows that frame the "why"
const BENEFITS = [
  {
    icon: '📦',
    title: 'Instant bag reading',
    body: 'Point at the back label — origin, roast, process, all captured in seconds.',
  },
  {
    icon: '🔒',
    title: 'Privacy by design',
    body: 'Photos go straight to our AI reader and are never stored.',
  },
];

export default function R08PermissionPriming() {
  const { dispatch } = useOnboarding();
  const [requesting, setRequesting] = useState(false);
  const [deniedMessage, setDeniedMessage] = useState(null);

  const canceledRef = useRef(false);
  const deniedTimerRef = useRef(null);
  useEffect(() => {
    canceledRef.current = false;
    return () => {
      canceledRef.current = true;
      if (deniedTimerRef.current) {
        clearTimeout(deniedTimerRef.current);
        deniedTimerRef.current = null;
      }
    };
  }, []);

  const advance = (cameraPermission) => {
    if (canceledRef.current) return;
    dispatch({
      type: 'ADVANCE',
      next: 'r9',
      answersPatch: { cameraPermission },
    });
  };

  // "Not now" — the user proactively opts out without ever hitting the OS
  // prompt. Writes cameraPermission via the SAME advance() path the OS-denial
  // branch uses below, but skips the deniedMessage banner (that stays tied
  // to an actual OS/permission-API denial, not this proactive skip).
  const handleNotNow = () => {
    if (requesting) return;
    advance('denied');
  };

  const handleAllow = async () => {
    if (requesting) return;
    setRequesting(true);

    if (!Capacitor.isNativePlatform()) {
      logOnboardingEvent('onboarding_permission_skipped_web', {});
      advance('unavailable');
      return;
    }

    try {
      const mod = await Promise.race([
        import('@capacitor/camera'),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('import_timeout')), CAMERA_IMPORT_TIMEOUT_MS)
        ),
      ]);
      const Camera = mod?.Camera;
      if (!Camera) throw new Error('camera_plugin_missing');

      const result = await Promise.race([
        Camera.requestPermissions({ permissions: ['camera'] }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('permission_timeout')), CAMERA_PERMISSION_TIMEOUT_MS)
        ),
      ]);
      const state = result?.camera || 'denied';
      if (state === 'granted') {
        advance('granted');
      } else {
        setDeniedMessage(
          "No worries — you can still add bags manually, and you can turn the camera on later from Settings."
        );
        deniedTimerRef.current = setTimeout(() => {
          deniedTimerRef.current = null;
          advance('denied');
        }, 800);
      }
    } catch (err) {
      logOnboardingEvent('onboarding_permission_failed', {
        reason: err?.message || String(err).slice(0, 80),
      });
      advance('unavailable');
    }
  };

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
      <OnboardingTopBar overlay />

      <MascotStage src="/images/ruphus-animations/ruphus-magnifying-glass.mp4" height={410} />

      <m.div
        variants={listContainer}
        initial="initial"
        animate="animate"
        style={{
          flex: 1,
          padding: '4px 24px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          minHeight: 0,
          overflowY: 'auto',
        }}
      >
        <m.div variants={listItem}>
          <div style={{
            ...t.h1,
            color: C.text,
            textAlign: 'center',
          }}>
            Give me a peek at your bags.
          </div>
        </m.div>

        <m.div variants={listItem}>
          <NoteBubble style={{ marginTop: 0 }}>
            I'll need your camera to read the back labels on your bags. It's how I learn what you're drinking.
          </NoteBubble>
        </m.div>

        {/* Benefit cards */}
        <m.div variants={listItem} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {BENEFITS.map((b) => (
            <div key={b.title} style={{
              ...cardBase,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              padding: '12px 14px',
              borderRadius: radius.md,
            }}>
              <div style={{
                fontSize: 22,
                lineHeight: 1,
                flexShrink: 0,
                marginTop: 1,
              }}>
                {b.icon}
              </div>
              <div>
                <div style={{
                  ...t.h3,
                  color: C.text,
                  marginBottom: 2,
                }}>
                  {b.title}
                </div>
                <div style={{
                  ...t.body,
                  color: C.textMuted,
                }}>
                  {b.body}
                </div>
              </div>
            </div>
          ))}
        </m.div>

        {deniedMessage && (
          <m.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            role="status"
            style={{
              ...t.body,
              color: C.text,
              background: C.redBg,
              border: `1px solid rgba(182,92,69,0.25)`,
              borderRadius: radius.md,
              padding: '12px 14px',
              lineHeight: 1.45,
            }}
          >
            {deniedMessage}
          </m.div>
        )}
      </m.div>

      <OnboardingCtaBar
        label={requesting ? 'Requesting...' : 'Allow Camera Access'}
        onClick={handleAllow}
        disabled={requesting}
        secondary={{
          label: 'Not now',
          onClick: handleNotNow,
        }}
      />
    </div>
  );
}
