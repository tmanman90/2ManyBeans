import { useEffect, useRef } from 'react';
import { haptic } from '../lib/haptics';
import { createTimerStepAlertTracker } from '../lib/brewTimerAlerts';

export function useBrewTimerAlerts(open, phase, stepIndex, readiness) {
  const tracker = useRef(null);
  if (!tracker.current) tracker.current = createTimerStepAlertTracker();
  useEffect(() => {
    if (tracker.current.update({ open, phase, stepIndex, readiness })) {
      haptic.timerStep().catch(() => {});
    }
  }, [open, phase, stepIndex, readiness]);
  // Manual controls already supply their own feedback.
  return () => tracker.current.reset();
}
