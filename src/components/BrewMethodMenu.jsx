// Floating brew method menu — appears on long-press of Brew button
// Shows Aiden, all 5 manual brew devices and Espresso.
// Rendered in a portal: the bean cards clip their overflow for rounded corners,
// and seven rows are taller than the space above the button inside a card.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence } from 'framer-motion';
import { Coffee, Droplets } from 'lucide-react';
import { C, glass, fonts, shadows, radius } from '../styles/theme';
import { m, popIn } from '../lib/motion';
import { BREW_DEVICES } from '../lib/brewMethods';

export const BrewMethodMenu = ({ open, onClose, onAiden, onHandBrew, onEspresso }) => {
  const menuRef = useRef(null);
  const anchorRef = useRef(null);
  const [place, setPlace] = useState(null);

  // Anchor above the parent (the Brew button wrapper), measured when opened.
  useLayoutEffect(() => {
    if (!open) return;
    const rect = anchorRef.current?.parentElement?.getBoundingClientRect();
    if (!rect) return;
    setPlace({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - 218)),
      bottom: window.innerHeight - rect.top + 8,
      spaceAbove: rect.top - 8,
    });
  }, [open]);

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
    <>
    <span ref={anchorRef} hidden />
    {createPortal(
    <AnimatePresence>
      {open && place && (
        <m.div
          ref={menuRef}
          {...popIn}
          style={{
            position: 'fixed',
            bottom: place.bottom,
            left: place.left,
            background: glass.sheet,
            backdropFilter: glass.blur,
            WebkitBackdropFilter: glass.blur,
            borderRadius: radius.lg,
            boxShadow: shadows.e3,
            border: `1px solid ${glass.chromeBorder}`,
            overflow: 'hidden',
            zIndex: 1000,
            minWidth: 210,
            maxHeight: `min(380px, calc(${place.spaceAbove}px - env(safe-area-inset-top, 0px)))`,
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
          <button
            type="button"
            onClick={() => { onEspresso?.(); onClose(); }}
            aria-label="Espresso Recipe"
            style={{ ...rowStyle, width: '100%', border: 'none', background: 'transparent', textAlign: 'left' }}
            onMouseEnter={e => { e.currentTarget.style.background = C.accentSoft; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: radius.xs, background: C.accentSoft, flexShrink: 0 }}>
              <Droplets size={14} color={C.accent} />
            </span>
            Espresso Recipe
          </button>
        </m.div>
      )}
    </AnimatePresence>,
    document.body,
    )}
    </>
  );
};
