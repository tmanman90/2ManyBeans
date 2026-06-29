// Liquid Glass action button (Apple iOS 26 material language): a translucent
// tinted glass with a specular top sheen, backdrop blur, inner light edge, and
// layered depth shadows. Tuned for the warm caramel system. transform/opacity
// press only. Spreads ...rest so long-press handlers / aria pass through.
import { m, spring } from '../lib/motion';
import { fonts } from '../styles/theme';

export function GlassButton({ children, onClick, fullWidth, compact, disabled, style = {}, ...rest }) {
  return (
    <m.button
      onClick={onClick}
      disabled={disabled}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      transition={spring.snappy}
      style={{
        position: 'relative',
        border: '1px solid rgba(255,255,255,0.30)',
        cursor: disabled ? 'default' : 'pointer',
        borderRadius: compact ? 13 : 17,
        padding: compact ? '10px 16px' : '15px 22px',
        width: fullWidth ? '100%' : undefined,
        color: '#FFF7EE',
        fontFamily: fonts.body, fontWeight: 700, fontSize: compact ? 13 : 15, letterSpacing: '0.01em',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        background: 'linear-gradient(176deg, rgba(184,120,70,0.94) 0%, rgba(150,90,48,0.95) 45%, rgba(74,47,30,0.96) 100%)',
        WebkitBackdropFilter: 'blur(14px) saturate(170%)', backdropFilter: 'blur(14px) saturate(170%)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.52), inset 0 -2px 6px rgba(40,20,8,0.32), 0 1px 2px rgba(70,41,26,0.20), 0 12px 28px rgba(120,70,34,0.34)',
        textShadow: '0 1px 2px rgba(40,20,8,0.32)',
        WebkitTapHighlightColor: 'transparent',
        opacity: disabled ? 0.5 : 1,
        overflow: 'hidden',
        ...style,
      }}
      {...rest}
    >
      {/* specular top sheen */}
      <span aria-hidden style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '52%', background: 'linear-gradient(180deg, rgba(255,255,255,0.36) 0%, rgba(255,255,255,0.04) 100%)', borderTopLeftRadius: 'inherit', borderTopRightRadius: 'inherit', pointerEvents: 'none' }} />
      {/* warm corner glow */}
      <span aria-hidden style={{ position: 'absolute', inset: 0, background: 'radial-gradient(130% 90% at 16% -10%, rgba(255,238,214,0.26), transparent 58%)', pointerEvents: 'none' }} />
      <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, zIndex: 1 }}>{children}</span>
    </m.button>
  );
}
