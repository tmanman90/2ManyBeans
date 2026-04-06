// Floating brew method menu — appears on long-press of Brew button
// Two options: Aiden Recipe (machine) and Hand Brew (pour-over)
import { useEffect, useRef } from 'react';
import { Coffee, Droplets } from 'lucide-react';
import { C, fonts, shadows } from '../styles/theme';

export const BrewMethodMenu = ({ open, onClose, onAiden, onHandBrew }) => {
  const menuRef = useRef(null);

  // Dismiss on outside tap
  useEffect(() => {
    if (!open) return;
    const handleTap = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener('touchstart', handleTap, true);
    document.addEventListener('mousedown', handleTap, true);
    return () => {
      document.removeEventListener('touchstart', handleTap, true);
      document.removeEventListener('mousedown', handleTap, true);
    };
  }, [open, onClose]);

  if (!open) return null;

  const rowStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '12px 16px',
    cursor: 'pointer',
    borderRadius: 10,
    fontSize: 14,
    fontFamily: fonts.body,
    fontWeight: 600,
    color: C.text,
    minHeight: 44,
  };

  return (
    <div ref={menuRef} style={{
      position: 'absolute',
      bottom: '100%',
      left: 0,
      marginBottom: 6,
      background: C.card,
      borderRadius: 14,
      boxShadow: shadows.modal,
      border: `1px solid ${C.borderLight}`,
      overflow: 'hidden',
      zIndex: 10,
      minWidth: 200,
    }}>
      <div
        onClick={() => { onAiden(); onClose(); }}
        style={rowStyle}
      >
        <Coffee size={16} color={C.accent} />
        Aiden Recipe
      </div>
      <div style={{ height: 1, background: C.borderLight }} />
      <div
        onClick={() => { onHandBrew(); onClose(); }}
        style={rowStyle}
      >
        <Droplets size={16} color={C.accent} />
        Hand Brew Recipe
      </div>
    </div>
  );
};
