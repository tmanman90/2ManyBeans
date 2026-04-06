// Button variants — tactile depth with warm shadows
import { C, fonts, shadows } from '../styles/theme';
import { haptic } from '../lib/haptics';

export const Btn = ({ children, onClick, variant = 'primary', style = {}, disabled = false, ...rest }) => {
  const handleClick = (e) => {
    if (disabled || !onClick) return;
    if (variant === 'primary') haptic.light();
    else if (variant === 'danger') haptic.medium();
    onClick(e);
  };

  const base = {
    border: 'none',
    borderRadius: 12,
    cursor: disabled ? 'default' : 'pointer',
    fontFamily: fonts.body,
    fontWeight: 600,
    fontSize: 13,
    transition: 'all 0.15s',
    opacity: disabled ? 0.5 : 1,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
  };
  const variants = {
    primary: { ...base, background: C.accent, color: '#fff', padding: '12px 20px', boxShadow: shadows.button },
    secondary: { ...base, background: C.borderLight, color: C.text, padding: '12px 20px' },
    ghost: { ...base, background: 'rgba(160,113,75,0.06)', color: C.accent, padding: '10px 14px' },
    danger: { ...base, background: C.redBg, color: C.red, padding: '12px 20px' },
    small: { ...base, background: C.borderLight, color: C.text, padding: '6px 12px', fontSize: 12 },
  };
  return (
    <button onClick={handleClick} disabled={disabled} style={{ ...variants[variant], ...style }} {...rest}>
      {children}
    </button>
  );
};
