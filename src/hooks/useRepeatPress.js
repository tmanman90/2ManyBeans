// Press-and-hold repeat hook for stepper buttons (+/-).
//
// Fires onTick immediately on press, then after `initialDelay` begins
// repeating at `interval` ms until release, pointerleave, pointercancel,
// or unmount. Matches iOS UIStepper cadence (500ms/120ms by default).
//
// Design choices (see plan §Research Insights for citations):
// - Pointer events, NOT touch events. Capacitor 8 + iOS 15+ fully supports
//   PE, and `pointerleave` gives us swipe-off cancellation for free.
// - NO setPointerCapture. Capture suppresses pointerleave, defeating the
//   swipe-off UX we want for a stepper.
// - Cleanup lives in useEffect([pressing]), not in event handlers. React-
//   idiomatic, survives disable / unmount / prop changes / race conditions.
// - Haptic every 5 ticks (picker-wheel detent), NOT per-tick. Taptic Engine
//   cannot render cleanly below ~80ms; per-tick at 120ms becomes a buzz.
// - `canTick` is checked every tick — returning false stops the tick and
//   fires `onBoundary` (typically haptic.medium() for range-limit bump).
//   Do NOT disable the button mid-hold; WebKit synthesizes pointercancel
//   and stops dispatching events, which can leak intervals.

import { useCallback, useEffect, useRef, useState } from 'react';
import { haptic } from '../lib/haptics';

export function useRepeatPress({
  onTick,
  canTick = () => true,
  onBoundary,
  initialDelay = 500,
  interval = 120,
}) {
  const [pressing, setPressing] = useState(false);
  const tickCountRef = useRef(0);

  // Latest-ref pattern — the effect's callbacks MUST NOT be deps, or the
  // interval tears down and rebuilds every render (parent passes fresh
  // useCallback identities every tick because they close over `dose`).
  // One ref holding all three callbacks is simpler than three parallel refs
  // + three update effects. The deps-less useEffect runs on every render so
  // the closure always sees the current callbacks.
  const cbRef = useRef({ onTick, canTick, onBoundary });
  useEffect(() => {
    cbRef.current = { onTick, canTick, onBoundary };
  });

  useEffect(() => {
    if (!pressing) return undefined;

    // One-shot boundary: once we hit the limit during a hold, fire the bump
    // haptic exactly once, then no-op the rest of the hold. Prevents the
    // 120ms haptic spam Codex flagged.
    let boundaryFired = false;

    const fireTick = () => {
      if (!cbRef.current.canTick()) {
        if (!boundaryFired) {
          boundaryFired = true;
          if (cbRef.current.onBoundary) cbRef.current.onBoundary();
        }
        return;
      }
      cbRef.current.onTick();
      tickCountRef.current += 1;
      if (tickCountRef.current % 5 === 0) {
        haptic.selection().catch(() => {});
      }
    };

    // First tick on press + initial haptic
    fireTick();
    haptic.light().catch(() => {});

    let intervalId = null;
    const delayId = setTimeout(() => {
      intervalId = setInterval(fireTick, interval);
    }, initialDelay);

    return () => {
      clearTimeout(delayId);
      if (intervalId) clearInterval(intervalId);
      tickCountRef.current = 0;
    };
  }, [pressing, initialDelay, interval]);

  const onPointerDown = useCallback((e) => {
    e.preventDefault();
    setPressing(true);
  }, []);
  const onPointerUp = useCallback(() => setPressing(false), []);
  const onPointerCancel = useCallback(() => setPressing(false), []);
  const onPointerLeave = useCallback(() => setPressing(false), []);
  const onContextMenu = useCallback((e) => e.preventDefault(), []);

  return {
    onPointerDown,
    onPointerUp,
    onPointerCancel,
    onPointerLeave,
    onContextMenu,
  };
}
