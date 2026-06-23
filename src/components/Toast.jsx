// Lightweight toast/snackbar — portal to body, auto-dismiss
//
// Two visual variants:
//   - success (default): green accent on near-white card surface
//   - error: red/terracotta accent on near-white card surface
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence } from 'framer-motion';
import { m, spring } from '../lib/motion';
import { C, fonts, shadows, radius } from '../styles/theme';

// Icon glyphs (inline SVG, no external dep)
const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="8" cy="8" r="7.25" stroke="currentColor" strokeWidth="1.5" />
    <path d="M4.75 8.25 L7 10.5 L11.25 5.75" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const AlertIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="8" cy="8" r="7.25" stroke="currentColor" strokeWidth="1.5" />
    <path d="M8 4.5 L8 8.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <circle cx="8" cy="11" r="0.875" fill="currentColor" />
  </svg>
);

const VARIANTS = {
  success: {
    iconColor: C.green,
    iconBg: C.greenBg,
    text: C.text,
    accent: C.green,
    Icon: CheckIcon,
  },
  error: {
    iconColor: C.red,
    iconBg: C.redBg,
    text: C.text,
    accent: C.red,
    Icon: AlertIcon,
  },
};

export const Toast = ({ message, open, onClose, variant = 'success' }) => {
  useEffect(() => {
    if (!open) return;
    // Errors linger a bit longer so the user actually reads them.
    const timer = setTimeout(onClose, variant === 'error' ? 4000 : 2500);
    return () => clearTimeout(timer);
  }, [open, onClose, message, variant]);

  const palette = VARIANTS[variant] || VARIANTS.success;
  const { Icon } = palette;

  return createPortal(
    <AnimatePresence>
      {open && message && (
        <m.div
          key={`toast-${variant}`}
          initial={{ opacity: 0, y: -12, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.96 }}
          transition={spring.snappy}
          style={{
            position: 'fixed',
            top: 'calc(env(safe-area-inset-top, 0px) + 16px)',
            left: '50%',
            x: '-50%',
            zIndex: 2000,
            // Constrain width so long error messages wrap instead of
            // overflowing the viewport on narrow iPhones.
            maxWidth: 'calc(100vw - 32px)',
            // Pointer events so the user can tap through if they don't want it.
            pointerEvents: 'none',
          }}
        >
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: C.cream,
            borderRadius: radius.pill,
            boxShadow: shadows.e3,
            border: `1px solid ${C.borderLight}`,
            padding: '10px 18px 10px 12px',
            // Allow wrap for long error messages; keep compact for short ones.
            whiteSpace: 'normal',
          }}>
            {/* Accent icon badge */}
            <div style={{
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 28,
              height: 28,
              borderRadius: radius.pill,
              background: palette.iconBg,
              color: palette.iconColor,
            }}>
              <Icon />
            </div>
            {/* Message text */}
            <span style={{
              fontFamily: fonts.body,
              fontSize: 14,
              fontWeight: 600,
              lineHeight: 1.35,
              color: palette.text,
              textAlign: 'left',
            }}>
              {message}
            </span>
          </div>
        </m.div>
      )}
    </AnimatePresence>,
    document.body
  );
};
