import { ChevronLeft } from 'lucide-react';
import { C, fonts, radius, shadows } from '../../../styles/theme';
import { haptic } from '../../../lib/haptics';
import { RuphusSpeechBubble } from '../RuphusSpeechBubble';
import { useOnboarding } from '../OnboardingContext';

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
      background: C.bg,
      display: 'flex',
      flexDirection: 'column',
      fontFamily: fonts.body,
      paddingTop: `calc(env(safe-area-inset-top, 0px) + 12px)`,
    }}>
      {/* Top bar — back button (hidden when back disabled) */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        minHeight: 44,
        padding: '0 12px',
      }}>
        {!backDisabled ? (
          <button
            onClick={handleBack}
            aria-label="Back"
            style={{
              width: 44,
              height: 44,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <ChevronLeft size={28} color={C.textMuted} />
          </button>
        ) : (
          <div style={{ width: 44, height: 44 }} />
        )}
        {/* Tiny step indicator for placeholders — helps manual QA scroll
            through Phase 1. Phase 2+ may replace with a real progress UI. */}
        <div style={{
          flex: 1,
          textAlign: 'center',
          fontSize: 12,
          color: C.textLight,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
        }}>
          {state?.step?.toUpperCase?.() || ''}
        </div>
        <div style={{ width: 44, height: 44 }} />
      </div>

      {/* Scrollable content */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        minHeight: 0,
        padding: '8px 20px 16px',
      }}>
        {ruphusLine && (
          <div style={{ marginBottom: 20 }}>
            <RuphusSpeechBubble>{ruphusLine}</RuphusSpeechBubble>
          </div>
        )}

        {title && (
          <div style={{
            fontFamily: fonts.heading,
            fontSize: 28,
            lineHeight: 1.15,
            color: C.text,
            marginBottom: 8,
          }}>
            {title}
          </div>
        )}

        {subtitle && (
          <div style={{
            fontSize: 15,
            color: C.textMuted,
            lineHeight: 1.4,
            marginBottom: 20,
          }}>
            {subtitle}
          </div>
        )}

        {children}
      </div>

      {/* CTA bar — sticky to bottom, safe-area padded */}
      {(primaryCta || secondaryCta) && (
        <div style={{
          padding: `12px 20px calc(env(safe-area-inset-bottom, 0px) + 16px)`,
          background: C.bg,
          borderTop: `1px solid ${C.borderLight}`,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}>
          {primaryCta && (
            <button
              onClick={() => {
                haptic.selection();
                primaryCta.onClick?.();
              }}
              disabled={primaryCta.disabled}
              style={{
                width: '100%',
                minHeight: 52,
                fontSize: 17,
                fontWeight: 700,
                fontFamily: fonts.body,
                background: C.accent,
                color: '#fff',
                border: 'none',
                borderRadius: radius.md,
                cursor: primaryCta.disabled ? 'not-allowed' : 'pointer',
                opacity: primaryCta.disabled ? 0.5 : 1,
                boxShadow: shadows.button,
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {primaryCta.label}
            </button>
          )}
          {secondaryCta && (
            <button
              onClick={() => {
                haptic.selection();
                secondaryCta.onClick?.();
              }}
              style={{
                width: '100%',
                minHeight: 44,
                fontSize: 15,
                fontWeight: 600,
                fontFamily: fonts.body,
                background: 'transparent',
                color: C.textMuted,
                border: 'none',
                cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {secondaryCta.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default OnboardingScreenShell;
