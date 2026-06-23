// Floating brew method menu — appears on long-press of Brew button
// Shows Aiden + all 5 manual brew devices
import { useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Coffee, Droplets } from 'lucide-react';
import { C, glass, fonts, shadows, radius } from '../styles/theme';
import { m, popIn } from '../lib/motion';
import { BREW_DEVICES } from '../lib/brewMethods';

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

  const rowStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 14px',
    cursor: 'pointer',
    borderRadius: radius.pill,
    fontSize: 14,
    fontFamily: fonts.body,
    fontWeight: 600,
    color: C.text,
    minHeight: 44,
    transition: 'background 0.14s ease',
    WebkitTapHighlightColor: 'transparent',
  };

  return (
    <AnimatePresence>
      {open && (
        <m.div
          ref={menuRef}
          {...popIn}
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            marginBottom: 8,
            background: glass.sheet,
            backdropFilter: glass.blur,
            WebkitBackdropFilter: glass.blur,
            borderRadius: radius.lg,
            boxShadow: shadows.e3,
            border: `1px solid ${glass.chromeBorder}`,
            overflow: 'hidden',
            zIndex: 10,
            minWidth: 210,
            maxHeight: 340,
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
            padding: '6px',
            transformOrigin: 'bottom left',
          }}
        >
          <div
            onClick={() => { onAiden(); onClose(); }}
            style={rowStyle}
            onMouseEnter={e => { e.currentTarget.style.background = C.accentSoft; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            <span style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 28,
              height: 28,
              borderRadius: radius.xs,
              background: C.accentSoft,
              flexShrink: 0,
            }}>
              <Coffee size={14} color={C.accent} />
            </span>
            Aiden Recipe
          </div>
          {BREW_DEVICES.map((device) => (
            <div
              key={device.key}
              onClick={() => { onHandBrew(device.key); onClose(); }}
              style={rowStyle}
              onMouseEnter={e => { e.currentTarget.style.background = C.bgDeep; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              <span style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 28,
                height: 28,
                borderRadius: radius.xs,
                background: C.borderLight,
                flexShrink: 0,
              }}>
                <Droplets size={14} color={C.textMuted} />
              </span>
              {device.label}
            </div>
          ))}
        </m.div>
      )}
    </AnimatePresence>
  );
};
