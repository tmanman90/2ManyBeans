import { ChevronLeft } from 'lucide-react';
import { C, fonts, type, radius, shadows, motion as motionTokens, glass } from '../../../styles/theme';
import { haptic } from '../../../lib/haptics';
import { RuphusSpeechBubble } from '../RuphusSpeechBubble';
import { useOnboarding } from '../OnboardingContext';
import { m, spring, fadeUp } from '../../../lib/motion';
import { onboardingBg } from './OnboardingPrimitives';

// Shared layout for the 13 onboarding screens. Safe-area padded full-dvh
// container with a top bar (back button), optional Ruphus bubble, hero
// slot, title/subtitle, children slot, and a sticky CTA bar.
//
// Every tap target is ≥44pt and every CTA fires `haptic.selection()` on
// press. Screens that set `backDisabled` (R1, R9, R10, R13, R13b) render
// with the back arrow hidden.
export function OnboardingScreenShell({
  title,
  subtitle,
  ruphusLine,
  children,
  primaryCta,
  secondaryCta,
  backDisabled = false,
}) {
  const { dispatch, state } = useOnboarding();

  const handleBack = () => {
    if (backDisabled) return;
    haptic.selection();
    dispatch({ type: 'BACK' });
  };

  return (
    <div style={{
      minHeight: '100dvh',
      maxHeight: '100dvh',
      background: onboardingBg,
      display: 'flex',
      flexDirection: 'column',
      fontFamily: fonts.body,
      paddingTop: `calc(env(safe-area-inset-top, 0px) + 12px)`,
    }}>
      {/* Top bar — back button + subtle step label */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        minHeight: 44,
        padding: '0 16px',
        gap: 8,
      }}>
        {!backDisabled ? (
          <m.button
            onClick={handleBack}
            aria-label="Back"
            whileTap={{ scale: 0.92 }}
            transition={spring.snappy}
            style={{
              width: 44,
              height: 44,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: `${C.cream}CC`,
              border: `1px solid ${C.hairline}`,
              borderRadius: radius.pill,
              cursor: 'pointer',
              boxShadow: shadows.e1,
              WebkitTapHighlightColor: 'transparent',
              flexShrink: 0,
            }}
          >
            <ChevronLeft size={20} color={C.textMuted} strokeWidth={2.5} />
          </m.button>
        ) : (
          <div style={{ width: 44, height: 44, flexShrink: 0 }} />
        )}

        {/* Step eyebrow label */}
        <div style={{
          flex: 1,
          textAlign: 'center',
          ...type.label,
          color: C.textLight,
          fontSize: type.caption.fontSize,
        }}>
          {state?.step?.toUpperCase?.() || ''}
        </div>

        <div style={{ width: 44, height: 44, flexShrink: 0 }} />
      </div>

      {/* Scrollable content */}
      <m.div
        {...fadeUp}
        style={{
          flex: 1,
          overflowY: 'auto',
          minHeight: 0,
          padding: '8px 20px 16px',
        }}
      >
        {ruphusLine && (
          <div style={{ marginBottom: 20 }}>
            <RuphusSpeechBubble>{ruphusLine}</RuphusSpeechBubble>
          </div>
        )}

        {title && (
          <div style={{
            ...type.h1,
            color: C.text,
            marginBottom: 8,
          }}>
            {title}
          </div>
        )}

        {subtitle && (
          <div style={{
            ...type.bodyL,
            color: C.textMuted,
            marginBottom: 20,
          }}>
            {subtitle}
          </div>
        )}

        {children}
      </m.div>

      {/* CTA bar — glass surface, safe-area padded */}
      {(primaryCta || secondaryCta) && (
        <div style={{
          padding: `12px 20px calc(env(safe-area-inset-bottom, 0px) + 20px)`,
          background: glass.sheet,
          backdropFilter: glass.blur,
          WebkitBackdropFilter: glass.blur,
          borderTop: `1px solid ${C.hairline}`,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}>
          {primaryCta && (
            <m.button
              onClick={() => {
                haptic.selection();
                primaryCta.onClick?.();
              }}
              disabled={primaryCta.disabled}
              whileTap={!primaryCta.disabled ? { scale: 0.975 } : {}}
              transition={spring.snappy}
              style={{
                width: '100%',
                minHeight: 52,
                fontSize: type.bodyL.fontSize,
                fontWeight: 700,
                fontFamily: type.bodyL.fontFamily,
                background: primaryCta.disabled
                  ? C.accentLight
                  : `linear-gradient(135deg, ${C.accent} 0%, #C4793F 100%)`,
                color: '#FFFDFA',
                border: 'none',
                borderRadius: radius.md,
                cursor: primaryCta.disabled ? 'not-allowed' : 'pointer',
                opacity: primaryCta.disabled ? 0.6 : 1,
                boxShadow: primaryCta.disabled ? 'none' : shadows.navActive,
                WebkitTapHighlightColor: 'transparent',
                letterSpacing: '0.01em',
              }}
            >
              {primaryCta.label}
            </m.button>
          )}
          {secondaryCta && (
            <m.button
              onClick={() => {
                haptic.selection();
                secondaryCta.onClick?.();
              }}
              whileTap={{ scale: 0.98 }}
              transition={spring.snappy}
              style={{
                width: '100%',
                minHeight: 44,
                fontSize: 14,
                fontWeight: 600,
                fontFamily: fonts.body,
                background: 'transparent',
                color: C.textMuted,
                border: 'none',
                cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent',
                letterSpacing: '0.01em',
              }}
            >
              {secondaryCta.label}
            </m.button>
          )}
        </div>
      )}
    </div>
  );
}

export default OnboardingScreenShell;
