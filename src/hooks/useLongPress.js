import { useRef, useCallback, useEffect } from 'react';
import { haptic } from '../lib/haptics';

/**
 * Long-press gesture hook for touch devices.
 * Returns event handlers to spread onto a touchable element.
 *
 * - Tap (< 400ms): calls onTap
 * - Long press (>= 400ms): calls onLongPress with haptic feedback
 * - Touch move / cancel: cancels the timer
 * - Suppresses iOS native context menu
 *
 * Usage:
 *   const handlers = useLongPress({ onTap, onLongPress });
 *   <button {...handlers}>Brew</button>
 */
export function useLongPress({ onTap, onLongPress, delay = 400 }) {
  const timerRef = useRef(null);
  const firedRef = useRef(false);
  const suppressClickRef = useRef(false);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onTouchStart = useCallback((e) => {
    firedRef.current = false;
    suppressClickRef.current = false;
    timerRef.current = setTimeout(() => {
      firedRef.current = true;
      suppressClickRef.current = true;
      timerRef.current = null;
      haptic.medium();
      onLongPress?.(e);
    }, delay);
  }, [onLongPress, delay]);

  const onTouchEnd = useCallback((e) => {
    suppressClickRef.current = true;
    if (firedRef.current) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (timerRef.current) {
      // Timer hasn't fired yet — this is a tap
      clear();
      onTap?.(e);
    }
    // If firedRef.current is true, long press already handled it
  }, [clear, onTap]);

  const onTouchMove = useCallback(() => {
    clear();
  }, [clear]);

  const onTouchCancel = useCallback(() => {
    clear();
  }, [clear]);

  const onContextMenu = useCallback((e) => {
    e.preventDefault();
  }, []);

  const onClick = useCallback((e) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    onTap?.(e);
  }, [onTap]);

  return {
    onClick,
    onTouchStart,
    onTouchEnd,
    onTouchMove,
    onTouchCancel,
    onContextMenu,
  };
}
