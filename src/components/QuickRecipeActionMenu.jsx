// Floating Quick Recipe action menu — appears on long-press of the header CTA.
import { useEffect, useRef } from 'react';
import { Camera, Plus } from 'lucide-react';
import { C, fonts, shadows } from '../styles/theme';

export const QuickRecipeActionMenu = ({ open, onClose, onQuickRecipe, onAddBean }) => {
  const menuRef = useRef(null);

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
    borderRadius: 0,
    fontSize: 14,
    fontFamily: fonts.body,
    fontWeight: 700,
    color: C.text,
    minHeight: 44,
    whiteSpace: 'nowrap',
  };

  const choose = (action) => {
    action?.();
    onClose();
  };

  return (
    <div
      ref={menuRef}
      style={{
        position: 'absolute',
        top: '100%',
        right: 0,
        marginTop: 6,
        background: C.card,
        borderRadius: 14,
        boxShadow: shadows.modal,
        border: `1px solid ${C.borderLight}`,
        overflow: 'hidden',
        zIndex: 20,
        minWidth: 178,
      }}
    >
      <div onClick={() => choose(onQuickRecipe)} style={rowStyle}>
        <Camera size={16} color={C.accent} />
        Quick Recipe
      </div>
      <div style={{ height: 1, background: C.borderLight }} />
      <div onClick={() => choose(onAddBean)} style={rowStyle}>
        <Plus size={16} color={C.accent} />
        Add Bean
      </div>
    </div>
  );
};
