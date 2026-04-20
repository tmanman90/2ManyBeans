import { useRef, useCallback } from 'react';
import { C } from '../styles/theme';

export const SwipeDownHandle = ({ onClose, color = C.cardMuted }) => {
  const startY = useRef(null);
  const startT = useRef(null);
  const dyRef = useRef(0);
  const pillRef = useRef(null);
  const rafRef = useRef(null);

  const applyTransform = useCallback(() => {
    rafRef.current = null;
    if (pillRef.current) {
      pillRef.current.style.transform = dyRef.current
        ? `translateY(${dyRef.current * 0.25}px)` : 'none';
    }
  }, []);

  return (
    <div
      onClick={() => onClose?.()}
      onTouchStart={e => {
        startY.current = e.touches[0].clientY;
        startT.current = Date.now();
        dyRef.current = 0;
        if (pillRef.current) {
          pillRef.current.style.transition = 'none';
          pillRef.current.style.transform = 'none';
        }
      }}
      onTouchMove={e => {
        if (startY.current == null) return;
        const delta = e.touches[0].clientY - startY.current;
        if (delta > 0) dyRef.current = Math.min(delta, 200);
        if (rafRef.current == null) rafRef.current = requestAnimationFrame(applyTransform);
      }}
      onTouchEnd={e => {
        if (startY.current == null) return;
        const finalDy = (e.changedTouches[0]?.clientY ?? 0) - startY.current;
        const elapsed = Math.max(1, Date.now() - (startT.current ?? Date.now()));
        const velocity = finalDy / elapsed;
        if (finalDy > 70 || velocity > 0.3) {
          onClose?.();
        } else {
          dyRef.current = 0;
          if (pillRef.current) {
            pillRef.current.style.transition = 'transform 0.18s';
            pillRef.current.style.transform = 'none';
          }
        }
        startY.current = null;
        startT.current = null;
      }}
      style={{
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        padding: '8px 0 6px', cursor: 'pointer',
        touchAction: 'none',
      }}
    >
      <div ref={pillRef} style={{
        width: 40, height: 4, borderRadius: 2, background: color,
      }} />
    </div>
  );
};
