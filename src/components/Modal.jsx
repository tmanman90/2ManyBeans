// Bottom-sheet overlay — ported from prototype lines 263-276
import { C, fonts } from '../styles/theme';
import { X } from 'lucide-react';

export const Modal = ({ open, onClose, title, children }) => {
  if (!open) return null;
  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(44,24,16,0.4)',
        backdropFilter: 'blur(4px)',
        zIndex: 1000,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: C.bg,
          borderRadius: '20px 20px 0 0',
          padding: '20px 20px 32px',
          width: '100%', maxWidth: 480,
          maxHeight: '80vh', overflow: 'auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontFamily: fonts.title, fontSize: 20, color: C.text }}>{title}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <X size={20} color={C.textMuted} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};
