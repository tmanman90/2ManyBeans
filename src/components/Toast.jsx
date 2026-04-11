// Lightweight toast/snackbar — portal to body, auto-dismiss
//
// Two visual variants:
//   - success (default): green background, for positive confirmations
//   - error: red background, replaces alert() for user-facing error reporting
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { C, fonts } from '../styles/theme';

const VARIANTS = {
  success: { bg: C.greenBg, text: C.green, border: C.green },
  error:   { bg: '#FDECEC', text: C.red,    border: C.red },
};

export const Toast = ({ message, open, onClose, variant = 'success' }) => {
  useEffect(() => {
    if (!open) return;
    // Errors linger a bit longer so the user actually reads them.
    const timer = setTimeout(onClose, variant === 'error' ? 4000 : 2500);
    return () => clearTimeout(timer);
  }, [open, onClose, message, variant]);

  if (!open || !message) return null;

  const palette = VARIANTS[variant] || VARIANTS.success;

  return createPortal(
    <div style={{
      position: 'fixed',
      top: 'calc(env(safe-area-inset-top, 0px) + 16px)',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 2000,
      animation: 'toastSlideIn 0.25s ease-out',
      // Constrain width so long error messages wrap instead of overflowing
      // the viewport on narrow iPhones.
      maxWidth: 'calc(100vw - 32px)',
    }}>
      <div style={{
        background: palette.bg,
        color: palette.text,
        fontFamily: fonts.body,
        fontSize: 14,
        fontWeight: 600,
        padding: '10px 20px',
        borderRadius: 12,
        border: `1px solid ${palette.border}`,
        boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
        // Allow wrap for long error messages; keep single-line for short ones.
        whiteSpace: 'normal',
        textAlign: 'center',
      }}>
        {message}
      </div>
    </div>,
    document.body
  );
};
