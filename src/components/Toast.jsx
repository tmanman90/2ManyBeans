// Lightweight toast/snackbar — portal to body, auto-dismiss
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { C, fonts } from '../styles/theme';

export const Toast = ({ message, open, onClose }) => {
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(onClose, 2500);
    return () => clearTimeout(timer);
  }, [open, onClose]);

  if (!open || !message) return null;

  return createPortal(
    <div style={{
      position: 'fixed',
      top: 'calc(env(safe-area-inset-top, 0px) + 16px)',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 2000,
      animation: 'toastSlideIn 0.25s ease-out',
    }}>
      <div style={{
        background: C.greenBg,
        color: C.green,
        fontFamily: fonts.body,
        fontSize: 14,
        fontWeight: 600,
        padding: '10px 20px',
        borderRadius: 12,
        border: `1px solid ${C.green}`,
        boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
        whiteSpace: 'nowrap',
      }}>
        {message}
      </div>
    </div>,
    document.body
  );
};
