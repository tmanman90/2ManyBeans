// Button variants — tactile depth with warm shadows
import { C, fonts, shadows } from '../styles/theme';

export const Btn = ({ children, onClick, variant = 'primary', style = {}, disabled = false }) => {
  const base = {
    border: 'none',
    borderRadius: 10,
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
    primary: { ...base, background: C.accent, color: '#fff', padding: '10px 18px', boxShadow: shadows.button },
    secondary: { ...base, background: C.borderLight, color: C.text, padding: '10px 18px' },
    ghost: { ...base, background: 'rgba(160,113,75,0.06)', color: C.accent, padding: '8px 12px' },
    danger: { ...base, background: C.redBg, color: C.red, padding: '10px 18px' },
    small: { ...base, background: C.borderLight, color: C.text, padding: '6px 12px', fontSize: 12 },
  };
  return (
    <button onClick={onClick} disabled={disabled} style={{ ...variants[variant], ...style }}>
      {children}
    </button>
  );
};
