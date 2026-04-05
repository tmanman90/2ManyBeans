// Bottom-sheet overlay — warm shadow + larger radius
// Supports optional `footer` prop for sticky action buttons
// Portal to body so modal escapes any parent stacking context
import { createPortal } from 'react-dom';
import { C, fonts, shadows } from '../styles/theme';
import { X } from 'lucide-react';

export const Modal = ({ open, onClose, title, children, footer, centered }) => {
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
