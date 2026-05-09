import { ChevronLeft } from 'lucide-react';
import { C, fonts } from '../../../styles/theme';
import { haptic } from '../../../lib/haptics';
import { useOnboarding } from '../OnboardingContext';

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
      <video
        src={src}
        poster={poster}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          objectPosition: 'center bottom',
          display: 'block',
          WebkitMaskImage: 'radial-gradient(ellipse 75% 55% at center 48%, black 60%, transparent 100%)',
          maskImage: 'radial-gradient(ellipse 75% 55% at center 48%, black 60%, transparent 100%)',
        }}
      />
    </div>
  );
}

export function NoteBubble({ children, style = {} }) {
  return (
    <div style={{
      position: 'relative',
      background: C.amberBg,
      border: '1px solid #E8D5A0',
      borderRadius: 18,
      padding: '14px 18px',
      fontFamily: fonts.title,
      fontSize: 19,
      lineHeight: 1.35,
      color: C.text,
      boxShadow: '0 1px 2px rgba(92,61,46,0.04), 0 8px 18px rgba(92,61,46,0.05)',
      ...style,
    }}>
      <div style={{
        position: 'absolute',
        top: -8,
        left: 28,
        width: 16,
        height: 16,
        background: C.amberBg,
        borderTop: '1px solid #E8D5A0',
        borderLeft: '1px solid #E8D5A0',
        transform: 'rotate(45deg)',
      }} />
      <div style={{ position: 'relative' }}>{children}</div>
    </div>
  );
}

export function OnboardingTopBar({ step, onBack, hideBack, overlay = false }) {
  const { dispatch, state } = useOnboarding();

  const handleBack = () => {
    if (onBack) { onBack(); return; }
    haptic.selection();
    dispatch({ type: 'BACK' });
  };

  const label = step || state?.step?.toUpperCase?.() || '';

  return (
    <div style={{
      position: overlay ? 'absolute' : 'relative',
      top: 0, left: 0, right: 0,
      display: 'flex',
      alignItems: 'center',
      minHeight: 44,
      padding: overlay
        ? `calc(env(safe-area-inset-top, 0px) + 8px) 12px 8px`
        : '8px 12px',
      zIndex: 10,
    }}>
      {!hideBack ? (
        <button
          onClick={handleBack}
          aria-label="Back"
          style={{
            width: 40, height: 40, borderRadius: 20,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: overlay ? 'rgba(255,248,240,0.85)' : 'transparent',
            backdropFilter: overlay ? 'blur(8px)' : undefined,
            border: overlay ? `1px solid ${C.borderLight}` : 'none',
            cursor: 'pointer',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <ChevronLeft size={22} color={C.text} />
        </button>
      ) : (
        <div style={{ width: 40, height: 40 }} />
      )}
      <div style={{ flex: 1 }} />
      <div style={{ width: 40, height: 40 }} />
    </div>
  );
}

export function OnboardingCtaBar({ label, onClick, disabled, secondary }) {
  return (
    <div style={{
      padding: `12px 20px calc(env(safe-area-inset-bottom, 0px) + 16px)`,
      background: '#FFFFFF',
      borderTop: `1px solid ${C.borderLight}`,
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}>
      <button
        onClick={() => { haptic.selection(); onClick?.(); }}
        disabled={disabled}
        style={{
          width: '100%',
          minHeight: 52,
          fontSize: 17, fontWeight: 700, fontFamily: fonts.body,
          background: C.accent,
          color: '#fff',
          border: 'none',
          borderRadius: 12,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          boxShadow: '0 1px 4px rgba(92,61,46,0.12), 0 4px 12px rgba(176,117,64,0.18)',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        {label}
      </button>
      {secondary && (
        <button
          onClick={() => { haptic.selection(); secondary.onClick?.(); }}
          style={{
            width: '100%',
            minHeight: 44,
            fontSize: 14, fontWeight: 700, fontFamily: fonts.body,
            background: 'transparent',
            color: C.textMuted,
            border: 'none',
            cursor: 'pointer',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          {secondary.label}
        </button>
      )}
    </div>
  );
}

export function OnboardingOptionList({ options, value, onSelect, compact = false }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {options.map((opt) => {
        const selected = value === opt.key;
        const Icon = opt.icon;
        return (
          <button
            key={opt.key}
            onClick={() => { haptic.selection(); onSelect(opt.key); }}
            style={{
              width: '100%',
              minHeight: compact ? 50 : 56,
              padding: compact ? '12px 16px' : '14px 18px',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              textAlign: 'left',
              fontSize: 16,
              fontFamily: fonts.body,
              fontWeight: 600,
              color: selected ? C.accent : C.text,
              background: selected ? C.amberBg : C.card,
              border: `1.5px solid ${selected ? C.accent : C.borderLight}`,
              borderRadius: 12,
              cursor: 'pointer',
              transition: 'background .12s, border-color .12s',
              boxShadow: selected
                ? '0 1px 3px rgba(176,117,64,0.12)'
                : '0 1px 2px rgba(92,61,46,0.03)',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {Icon && (
              <span style={{
                width: 36, height: 36, flexShrink: 0,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 10,
                background: selected ? C.accent : C.amberBg,
                color: selected ? '#fff' : C.accent,
                border: selected ? 'none' : '1px solid #E8D5A0',
                transition: 'background .12s, color .12s',
              }}>
                <Icon size={20} strokeWidth={2} />
              </span>
            )}
            <span style={{ flex: 1 }}>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export const onboardingBg = '#FFFFFF';
