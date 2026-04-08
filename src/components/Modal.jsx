// Bottom-sheet overlay — warm shadow + larger radius
// Supports optional `footer` prop for sticky action buttons
// Portal to body so modal escapes any parent stacking context
// Keyboard-aware: listens for iOS keyboard events to adjust maxHeight and auto-scroll
import { createPortal } from 'react-dom';
import { useEffect, useRef } from 'react';
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
  const modalRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    if (!Capacitor.isNativePlatform()) return;

    let canceled = false;
    let showPromise, hidePromise;

    getKeyboard().then(({ Keyboard }) => {
      if (canceled) return;

      showPromise = Keyboard.addListener('keyboardDidShow', info => {
        if (canceled) return;
        if (modalRef.current) {
          modalRef.current.style.maxHeight = `calc(90vh - ${info.keyboardHeight}px)`;
        }
        // Auto-scroll focused input into view after body resize settles
        setTimeout(() => {
          if (canceled) return;
          const el = document.activeElement;
          if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) {
            el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        }, 50);
      });

      hidePromise = Keyboard.addListener('keyboardDidHide', () => {
        if (canceled) return;
        if (modalRef.current) {
          modalRef.current.style.maxHeight = '90vh';
        }
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
        position: 'fixed', inset: 0,
        background: 'rgba(44,24,16,0.4)',
        backdropFilter: 'blur(4px)',
        zIndex: 1000,
        display: 'flex', alignItems: centered ? 'center' : 'flex-end', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        ref={modalRef}
        style={{
          background: C.bg,
          borderRadius: centered ? 24 : '24px 24px 0 0',
          width: '100%', maxWidth: 480,
          maxHeight: '90vh',
          boxShadow: shadows.modal,
          display: 'flex', flexDirection: 'column',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Fixed header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '20px 20px 0', marginBottom: 16, flexShrink: 0,
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
            padding: `12px 20px calc(20px + env(safe-area-inset-bottom, 0px))`,
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
