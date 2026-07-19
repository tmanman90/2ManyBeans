// Liquid Glass action button (Apple iOS 26 material language): a translucent
// tinted glass with a specular top sheen, backdrop blur, inner light edge, and
// layered depth shadows. Tuned for the warm caramel system. transform/opacity
// press only. Spreads ...rest so long-press handlers / aria pass through.
import { m, spring } from '../lib/motion';
import { fonts } from '../styles/theme';

export function GlassButton({
  children,
  trailing,
  onClick,
  fullWidth,
  compact,
  disabled,
  style = {},
  ...rest
}) {
  const hasTrailing = trailing !== undefined && trailing !== null;
  const materialStyle = disabled
    ? {
      border: '1px solid rgba(255,255,255,0.16)',
      color: 'rgba(255,247,238,0.58)',
      background: 'linear-gradient(176deg, rgba(126,113,104,0.48) 0%, rgba(101,91,85,0.45) 48%, rgba(75,68,64,0.44) 100%)',
      WebkitBackdropFilter: 'blur(8px) saturate(70%)',
      backdropFilter: 'blur(8px) saturate(70%)',
      boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.12), 0 1px 2px rgba(40,30,24,0.10)',
      textShadow: 'none',
    }
    : {
      border: '1px solid rgba(255,255,255,0.30)',
      color: '#FFF7EE',
      background: 'linear-gradient(176deg, rgba(184,120,70,0.94) 0%, rgba(150,90,48,0.95) 45%, rgba(74,47,30,0.96) 100%)',
      WebkitBackdropFilter: 'blur(14px) saturate(170%)',
      backdropFilter: 'blur(14px) saturate(170%)',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.52), inset 0 -2px 6px rgba(40,20,8,0.32), 0 1px 2px rgba(70,41,26,0.20), 0 12px 28px rgba(120,70,34,0.34)',
      textShadow: '0 1px 2px rgba(40,20,8,0.32)',
    };

  return (
    <m.button
      onClick={onClick}
      disabled={disabled}
      data-component="glass-button"
      data-glass-button="primary"
      data-glass-disabled={disabled ? 'true' : 'false'}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      transition={spring.snappy}
      style={{
        position: 'relative',
        ...materialStyle,
        cursor: disabled ? 'default' : 'pointer',
        borderRadius: compact ? 13 : 17,
        padding: compact ? '10px 16px' : '15px 22px',
        minHeight: 44,
        width: fullWidth ? '100%' : undefined,
        fontFamily: fonts.body, fontWeight: 700, fontSize: compact ? 13 : 15, letterSpacing: '0.01em',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        WebkitTapHighlightColor: 'transparent',
        opacity: disabled ? 0.82 : 1,
        flexShrink: 0,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        ...style,
      }}
      {...rest}
    >
      {!disabled && <>
        {/* specular top sheen */}
        <span aria-hidden style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '52%', background: 'linear-gradient(180deg, rgba(255,255,255,0.36) 0%, rgba(255,255,255,0.04) 100%)', borderTopLeftRadius: 'inherit', borderTopRightRadius: 'inherit', pointerEvents: 'none' }} />
        {/* warm corner glow */}
        <span aria-hidden style={{ position: 'absolute', inset: 0, background: 'radial-gradient(130% 90% at 16% -10%, rgba(255,238,214,0.26), transparent 58%)', pointerEvents: 'none' }} />
      </>}
      <span style={{
        position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center',
        justifyContent: hasTrailing ? 'space-between' : 'center', gap: 8,
        width: hasTrailing ? '100%' : undefined,
      }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, minWidth: 0 }}>{children}</span>
        {hasTrailing && <span style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>{trailing}</span>}
      </span>
    </m.button>
  );
}
