import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Camera as CameraIcon } from 'lucide-react';
import { C, fonts } from '../../../styles/theme';
import { OnboardingScreenShell } from './OnboardingScreenShell';
import { useOnboarding } from '../OnboardingContext';
import { logOnboardingEvent } from '../../../lib/onboardingAnalytics';

// R8 — camera permission priming.
//
// The iOS convention is "ask WHY before you ask for permission." This
// screen explains why Coffee Hub wants the camera, then a single tap
// triggers the actual prompt.
//
// Failure modes we handle:
// - Not a native platform → skip the prompt entirely, mark unavailable,
//   advance. (Web build never sees the OS prompt anyway.)
// - Dynamic import of @capacitor/camera stalls → 4s timeout, mark
//   unavailable, advance. Cannot block the user if the plugin fails
//   to load on a bad network.
// - OS prompt denied → flag denied and advance. R11/R13b fall back to
//   the "Add a bag manually" CTA.
// - Prompt returns "prompt" / unexpected → treat as denied.

const IMPORT_TIMEOUT_MS = 4000;

export default function R08PermissionPriming() {
  const { dispatch } = useOnboarding();
  const [requesting, setRequesting] = useState(false);
  const [deniedMessage, setDeniedMessage] = useState(null);

  // Canceled flag + timer ref so that navigating away (back button) or
  // unmounting during the 800ms "denied" follow-up window doesn't strand
  // a stale setTimeout that later force-advances the reducer.
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

    // Web: no native prompt to ask. Mark unavailable so R11 falls back
    // to the manual-add CTA and move on.
    if (!Capacitor.isNativePlatform()) {
      logOnboardingEvent('onboarding_permission_skipped_web', {});
      advance('unavailable');
      return;
    }

    try {
      // Race the dynamic import against a 4s timeout so a bad chunk
      // fetch can't strand us here.
      const mod = await Promise.race([
        import('@capacitor/camera'),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('import_timeout')), IMPORT_TIMEOUT_MS)
        ),
      ]);
      const Camera = mod?.Camera;
      if (!Camera) throw new Error('camera_plugin_missing');

      const result = await Camera.requestPermissions({ permissions: ['camera'] });
      const state = result?.camera || 'denied';
      if (state === 'granted') {
        advance('granted');
      } else {
        // 'denied' OR 'prompt' OR 'prompt-with-rationale' OR anything
        // unexpected — treat as denied, surface a short follow-up
        // message, advance anyway. We never hard-stop the flow.
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
    <OnboardingScreenShell
      title="Give Ruphus a peek at your bags."
      ruphusLine="I'll need your camera to read the back labels on your bags. It's how I learn what you're drinking."
      primaryCta={{
        label: requesting ? 'Requesting…' : 'Allow camera',
        onClick: handleAllow,
        disabled: requesting,
      }}
    >
      {/* Visual iconography — big camera on a soft card */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        marginTop: 4,
        marginBottom: 20,
      }}>
        <div
          style={{
            width: 140,
            height: 140,
            borderRadius: 28,
            background: C.amberBg,
            border: `1px solid #E8D5A0`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 18,
          }}
          aria-hidden
        >
          <CameraIcon size={64} color={C.accent} strokeWidth={1.5} />
        </div>
        <div style={{
          fontSize: 14,
          color: C.textMuted,
          textAlign: 'center',
          maxWidth: 300,
          lineHeight: 1.45,
          fontFamily: fonts.body,
        }}>
          Just the camera — nothing stored, nothing shared. Labels stay on
          your device unless you tell me otherwise.
        </div>
      </div>

      {deniedMessage && (
        <div
          role="status"
          style={{
            fontSize: 14,
            color: C.text,
            background: C.redBg,
            border: `1px solid ${C.red}40`,
            borderRadius: 12,
            padding: '12px 14px',
            lineHeight: 1.45,
          }}
        >
          {deniedMessage}
        </div>
      )}
    </OnboardingScreenShell>
  );
}
