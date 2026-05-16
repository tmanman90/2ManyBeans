import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { C, fonts } from '../../../styles/theme';
import { useOnboarding } from '../OnboardingContext';
import { logOnboardingEvent } from '../../../lib/onboardingAnalytics';
import { MascotStage, NoteBubble, OnboardingTopBar, OnboardingCtaBar, onboardingBg } from './OnboardingPrimitives';

const IMPORT_TIMEOUT_MS = 4000;

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
          setTimeout(() => reject(new Error('import_timeout')), IMPORT_TIMEOUT_MS)
        ),
      ]);
      const Camera = mod?.Camera;
      if (!Camera) throw new Error('camera_plugin_missing');

      const result = await Promise.race([
        Camera.requestPermissions({ permissions: ['camera'] }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('permission_timeout')), 8000)
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
      <OnboardingTopBar step="R8 · CAMERA" overlay />

      <MascotStage src="/images/ruphus-animations/ruphus-magnifying-glass.mp4" height={410} />

      <div style={{
        flex: 1,
        padding: '4px 24px 8px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        minHeight: 0,
        overflowY: 'auto',
      }}>
        <div style={{
          fontFamily: fonts.heading,
          fontSize: 26, lineHeight: 1.15,
          color: C.text,
          textAlign: 'center',
        }}>
          Give me a peek at your bags.
        </div>

        <NoteBubble style={{ marginTop: 4 }}>
          I'll need your camera to read the back labels on your bags. It's how I learn what you're drinking.
        </NoteBubble>

        <div style={{
          background: C.amberBg,
          border: '1px solid #E8D5A0',
          borderRadius: 12,
          padding: '12px 14px',
          marginTop: 2,
          fontSize: 13, color: C.textMuted, lineHeight: 1.45,
          textAlign: 'center',
        }}>
          Photos are sent to our AI to read the label, then discarded. We never store your images.
        </div>

        {deniedMessage && (
          <div
            role="status"
            style={{
              fontSize: 14,
              color: C.text,
              background: '#FEF2F2',
              border: '1px solid rgba(220,38,38,0.25)',
              borderRadius: 12,
              padding: '12px 14px',
              lineHeight: 1.45,
            }}
          >
            {deniedMessage}
          </div>
        )}
      </div>

      <OnboardingCtaBar
        label={requesting ? 'Requesting...' : 'Continue'}
        onClick={handleAllow}
        disabled={requesting}
      />
    </div>
  );
}
