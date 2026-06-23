// Bottom-sheet overlay — frosted glass, spring presentation, warm scrim
// Supports optional `footer` prop for sticky action buttons
// Portal to body so modal escapes any parent stacking context
// Keyboard-aware: on iOS native, pushes entire modal above keyboard via bottom inset
import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { C, fonts, shadows, glass, radius } from '../styles/theme';
import { m, spring } from '../lib/motion';
import { AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

// Cache the dynamic import so it only resolves once
let keyboardModulePromise;
function getKeyboard() {
  if (!keyboardModulePromise) keyboardModulePromise = import('@capacitor/keyboard');
  return keyboardModulePromise;
}

export const Modal = ({ open, onClose, title, children, footer, centered }) => {
  const [kbHeight, setKbHeight] = useState(0);

  useEffect(() => {
    if (!open) {
      setKbHeight(0);
      return;
    }
    if (!Capacitor.isNativePlatform()) return;

    let canceled = false;
    let showPromise, hidePromise;

    getKeyboard().then(({ Keyboard }) => {
      if (canceled) return;

      showPromise = Keyboard.addListener('keyboardDidShow', info => {
        if (canceled) return;
        setKbHeight(info.keyboardHeight);
        // Auto-scroll focused input into view after layout settles
        setTimeout(() => {
          if (canceled) return;
          const el = document.activeElement;
          if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) {
            el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        }, 80);
      });

      hidePromise = Keyboard.addListener('keyboardDidHide', () => {
        if (canceled) return;
        setKbHeight(0);
      });
    });

    return () => {
      canceled = true;
      showPromise?.then(h => h.remove());
      hidePromise?.then(h => h.remove());
    };
  }, [open]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <m.div
          key="modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0,
            bottom: kbHeight, // pushes modal container above keyboard
            background: glass.scrim,
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            zIndex: 1000,
            display: 'flex', alignItems: centered ? 'center' : 'flex-end', justifyContent: 'center',
          }}
          onClick={onClose}
        >
          <m.div
            initial={centered ? { opacity: 0, scale: 0.94, y: 8 } : { y: '100%' }}
            animate={centered ? { opacity: 1, scale: 1, y: 0 } : { y: 0 }}
            exit={centered ? { opacity: 0, scale: 0.96, y: 8 } : { y: '100%' }}
            transition={spring.soft}
            style={{
              background: glass.sheet,
              backdropFilter: glass.blurStrong,
              WebkitBackdropFilter: glass.blurStrong,
              borderRadius: centered ? radius.xl : `${radius.xl}px ${radius.xl}px 0 0`,
              border: `1px solid ${glass.chromeBorder}`,
              width: '100%', maxWidth: 480,
              maxHeight: '100%', // fill available space (container already excludes keyboard)
              boxShadow: shadows.modal,
              display: 'flex', flexDirection: 'column',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Grabber handle for bottom sheets */}
            {!centered && (
              <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'center', paddingTop: `calc(8px + env(safe-area-inset-top, 0px))` }}>
                <div style={{ width: 36, height: 5, borderRadius: radius.pill, background: C.border, opacity: 0.6 }} />
              </div>
            )}

            {/* Fixed header */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: centered ? '20px 20px 0' : `${title ? '14px' : '4px'} 16px 0 20px`,
              marginBottom: title ? 16 : 0, flexShrink: 0,
            }}>
              <div style={{ fontFamily: fonts.heading, fontSize: 21, fontWeight: 600, letterSpacing: '-0.01em', color: C.text }}>{title}</div>
              <button onClick={onClose} aria-label="Close" style={{ background: 'rgba(0,0,0,0.04)', border: 'none', cursor: 'pointer', padding: 0, width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', WebkitTapHighlightColor: 'transparent' }}>
                <X size={18} color={C.textMuted} />
              </button>
            </div>

            {/* Scrollable body */}
            <div style={{
              overflowY: 'auto', flex: 1, minHeight: 0,
              padding: footer ? '0 20px' : `0 20px calc(20px + env(safe-area-inset-bottom, 0px))`,
              overscrollBehavior: 'contain',
            }}>
              {children}
            </div>

            {/* Sticky footer */}
            {footer && (
              <div style={{
                padding: `12px 20px calc(${kbHeight > 0 ? '12px' : '20px'} + ${kbHeight > 0 ? '0px' : 'env(safe-area-inset-bottom, 0px)'})`,
                borderTop: `1px solid ${glass.chromeBorder}`,
                flexShrink: 0,
              }}>
                {footer}
              </div>
            )}
          </m.div>
        </m.div>
      )}
    </AnimatePresence>,
    document.body
  );
};
