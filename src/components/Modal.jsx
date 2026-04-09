// Bottom-sheet overlay — warm shadow + larger radius
// Supports optional `footer` prop for sticky action buttons
// Portal to body so modal escapes any parent stacking context
// Keyboard-aware: on iOS native, pushes entire modal above keyboard via bottom inset
import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { C, fonts, shadows } from '../styles/theme';
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

  if (!open) return null;

  return createPortal(
    <div
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0,
        bottom: kbHeight, // pushes modal container above keyboard
        background: 'rgba(44,24,16,0.4)',
        backdropFilter: 'blur(4px)',
        zIndex: 1000,
        display: 'flex', alignItems: centered ? 'center' : 'flex-end', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: C.bg,
          borderRadius: centered ? 24 : '24px 24px 0 0',
          width: '100%', maxWidth: 480,
          maxHeight: '100%', // fill available space (container already excludes keyboard)
          boxShadow: shadows.modal,
          display: 'flex', flexDirection: 'column',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Fixed header — add safe-area-inset-top for bottom-sheet modals that reach the status bar */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: centered ? '20px 20px 0' : `calc(20px + env(safe-area-inset-top, 0px)) 20px 0`,
          marginBottom: 16, flexShrink: 0,
        }}>
          <div style={{ fontFamily: fonts.title, fontSize: 20, color: C.text }}>{title}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 10 }}>
            <X size={20} color={C.textMuted} />
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
            borderTop: `1px solid ${C.borderLight}`,
            flexShrink: 0,
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
