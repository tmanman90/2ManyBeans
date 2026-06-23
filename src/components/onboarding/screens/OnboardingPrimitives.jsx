import { ChevronLeft, Check } from 'lucide-react';
import { C, fonts, type, radius, shadows, motion as motionTokens, glass } from '../../../styles/theme';
import { haptic } from '../../../lib/haptics';
import { useOnboarding } from '../OnboardingContext';
import { m, spring, listContainer, listItem } from '../../../lib/motion';

// ─── Warm paper background value (used by screens as inline background) ───────
// Subtle layered warm gradient — deep paper base with a soft vignette lift so
// cream cards gain real perceived elevation against the background.
export const onboardingBg = `linear-gradient(160deg, ${C.bgDeep} 0%, ${C.bg} 45%, #EDE4D8 100%)`;

// ─── MascotStage ──────────────────────────────────────────────────────────────
// Framing-only refinement: warm radial glow behind the mascot for depth,
// tighter bottom fade. Video pattern is UNCHANGED.
export function MascotStage({ src, height = 460, poster }) {
  return (
    <div style={{
      position: 'relative',
      width: '100%',
      height,
      flexShrink: 0,
      overflow: 'hidden',
      background: 'transparent',
      paddingTop: 'env(safe-area-inset-top, 0px)',
    }}>
      {/* Warm ambient glow behind mascot */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: `radial-gradient(ellipse 70% 60% at 50% 60%, ${C.accentSoft} 0%, transparent 72%)`,
        pointerEvents: 'none',
        zIndex: 0,
      }} />
      <video
        src={src}
        poster={poster}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        style={{
          position: 'relative',
          zIndex: 1,
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          objectPosition: 'center bottom',
          display: 'block',
          WebkitMaskImage: 'radial-gradient(ellipse 78% 58% at center 48%, black 55%, transparent 100%)',
          maskImage: 'radial-gradient(ellipse 78% 58% at center 48%, black 55%, transparent 100%)',
        }}
      />
    </div>
  );
}

// ─── NoteBubble ───────────────────────────────────────────────────────────────
// Premium speech bubble: soft cream surface, hairline border, warm elevation.
// No script font — uses bodyL (Nunito 16/500) for readability.
export function NoteBubble({ children, style = {} }) {
  return (
    <div style={{
      position: 'relative',
      background: C.cream,
      border: `1px solid ${C.hairline}`,
      borderRadius: radius.lg,
      padding: '14px 18px',
      fontFamily: type.bodyL.fontFamily,
      fontSize: type.bodyL.fontSize,
      fontWeight: type.bodyL.fontWeight,
      lineHeight: type.bodyL.lineHeight,
      color: C.text,
      boxShadow: shadows.e2,
      ...style,
    }}>
      {/* Speech bubble tail (top-left) */}
      <div style={{
        position: 'absolute',
        top: -7,
        left: 24,
        width: 14,
        height: 14,
        background: C.cream,
        borderTop: `1px solid ${C.hairline}`,
        borderLeft: `1px solid ${C.hairline}`,
        transform: 'rotate(45deg)',
        borderRadius: 2,
      }} />
      <div style={{ position: 'relative' }}>{children}</div>
    </div>
  );
}

// ─── OnboardingTopBar ─────────────────────────────────────────────────────────
// Refined progress indicator: elegant segmented track + filled accent segments.
// Back button: 44px glass pill (overlay mode) or transparent (inline mode).
// Step string "R07" → parse to a number for segment fill when possible.
function parseStepIndex(step) {
  if (!step) return null;
  // Matches "R01".."R13b" — extract numeric portion
  const m = String(step).match(/R?0*(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

const TOTAL_STEPS = 13;

export function OnboardingTopBar({ step, onBack, hideBack, overlay = false }) {
  const { dispatch, state } = useOnboarding();

  const handleBack = () => {
    if (onBack) { onBack(); return; }
    haptic.selection();
    dispatch({ type: 'BACK' });
  };

  const stepKey = step || state?.step || '';
  const stepIndex = parseStepIndex(stepKey);
  const filled = stepIndex ? Math.max(1, stepIndex) : 1;

  return (
    <div style={{
      position: overlay ? 'absolute' : 'relative',
      top: 0, left: 0, right: 0,
      display: 'flex',
      alignItems: 'center',
      minHeight: 44,
      padding: overlay
        ? `calc(env(safe-area-inset-top, 0px) + 8px) 16px 8px`
        : '8px 16px',
      zIndex: 10,
      gap: 12,
    }}>
      {/* Back button — 44×44 minimum tap target */}
      {!hideBack ? (
        <button
          onClick={handleBack}
          aria-label="Back"
          style={{
            width: 44, height: 44,
            borderRadius: radius.pill,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: overlay ? glass.chrome : `${C.cream}CC`,
            backdropFilter: overlay ? glass.blur : 'none',
            WebkitBackdropFilter: overlay ? glass.blur : 'none',
            border: `1px solid ${C.hairline}`,
            cursor: 'pointer',
            flexShrink: 0,
            boxShadow: shadows.e1,
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <ChevronLeft size={20} color={C.textMuted} strokeWidth={2.5} />
        </button>
      ) : (
        <div style={{ width: 44, height: 44, flexShrink: 0 }} />
      )}

      {/* Segmented progress track — fills left-to-right with accent colour */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        gap: 3,
        height: 4,
      }}>
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: '100%',
              borderRadius: radius.pill,
              background: i < filled ? C.accent : C.border,
              transition: `background ${motionTokens.dur.base}s ${motionTokens.cssOut}`,
              opacity: i < filled ? 1 : 0.5,
            }}
          />
        ))}
      </div>

      {/* Right spacer to balance the back button */}
      <div style={{ width: 44, height: 44, flexShrink: 0 }} />
    </div>
  );
}

// ─── OnboardingCtaBar ─────────────────────────────────────────────────────────
// Confident primary CTA (caramel gradient + warm shadow), refined secondary.
// Glass backdrop for a premium floating feel when sitting over scrolled content.
export function OnboardingCtaBar({ label, onClick, disabled, secondary }) {
  return (
    <div style={{
      padding: `12px 20px calc(env(safe-area-inset-bottom, 0px) + 20px)`,
      background: glass.sheet,
      backdropFilter: glass.blur,
      WebkitBackdropFilter: glass.blur,
      borderTop: `1px solid ${C.hairline}`,
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}>
      <m.button
        onClick={() => { haptic.selection(); onClick?.(); }}
        disabled={disabled}
        whileTap={!disabled ? { scale: 0.975 } : {}}
        transition={spring.snappy}
        style={{
          width: '100%',
          minHeight: 52,
          fontSize: type.bodyL.fontSize,
          fontWeight: 700,
          fontFamily: type.bodyL.fontFamily,
          background: disabled
            ? C.accentLight
            : `linear-gradient(135deg, ${C.accent} 0%, #C4793F 100%)`,
          color: '#FFFDFA',
          border: 'none',
          borderRadius: radius.md,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
          boxShadow: disabled ? 'none' : shadows.navActive,
          transition: `opacity ${motionTokens.dur.fast}s, background ${motionTokens.dur.fast}s`,
          WebkitTapHighlightColor: 'transparent',
          letterSpacing: '0.01em',
        }}
      >
        {label}
      </m.button>
      {secondary && (
        <m.button
          onClick={() => { haptic.selection(); secondary.onClick?.(); }}
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
          {secondary.label}
        </m.button>
      )}
    </div>
  );
}

// ─── OnboardingOptionList ─────────────────────────────────────────────────────
// Premium selectable cards: accentSoft fill + accent border when selected,
// hairline + cream otherwise. Spring press. Staggered entrance. Checkmark badge.
export function OnboardingOptionList({ options, value, onSelect, compact = false }) {
  return (
    <m.div
      variants={listContainer}
      initial="initial"
      animate="animate"
      style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
    >
      {options.map((opt) => {
        const selected = value === opt.key;
        const Icon = opt.icon;
        return (
          <m.button
            key={opt.key}
            variants={listItem}
            onClick={() => { haptic.selection(); onSelect(opt.key); }}
            whileTap={{ scale: 0.978 }}
            transition={spring.snappy}
            style={{
              width: '100%',
              minHeight: compact ? 52 : 58,
              padding: compact ? '12px 16px' : '14px 18px',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              textAlign: 'left',
              fontSize: type.bodyL.fontSize,
              fontFamily: type.bodyL.fontFamily,
              fontWeight: 600,
              color: selected ? C.accent : C.text,
              background: selected ? C.accentSoft : C.cream,
              border: `1.5px solid ${selected ? C.accent : C.hairline}`,
              borderRadius: radius.md,
              cursor: 'pointer',
              boxShadow: selected ? shadows.e2 : shadows.e1,
              transition: `background ${motionTokens.dur.fast}s ${motionTokens.cssOut}, border-color ${motionTokens.dur.fast}s ${motionTokens.cssOut}, box-shadow ${motionTokens.dur.fast}s`,
              WebkitTapHighlightColor: 'transparent',
              position: 'relative',
            }}
          >
            {Icon && (
              <span style={{
                width: 38, height: 38, flexShrink: 0,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: radius.sm,
                background: selected ? C.accent : C.accentSoft,
                color: selected ? C.cream : C.accent,
                border: selected ? 'none' : `1px solid ${C.border}`,
                transition: `background ${motionTokens.dur.fast}s, color ${motionTokens.dur.fast}s`,
              }}>
                <Icon size={20} strokeWidth={2} />
              </span>
            )}
            <span style={{ flex: 1 }}>{opt.label}</span>
            {/* Checkmark badge on selected */}
            {selected && (
              <span style={{
                width: 22, height: 22, flexShrink: 0,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: radius.pill,
                background: C.accent,
              }}>
                <Check size={13} color={C.cream} strokeWidth={2.5} />
              </span>
            )}
          </m.button>
        );
      })}
    </m.div>
  );
}
