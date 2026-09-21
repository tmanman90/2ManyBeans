import { useEffect, useRef } from 'react';
import { haptic } from '../lib/haptics';
import { createTimerStepAlertTracker } from '../lib/brewTimerAlerts';

export function useBrewTimerAlerts(open, phase, stepIndex) {
  const tracker = useRef(null);
  if (!tracker.current) tracker.current = createTimerStepAlertTracker();
  useEffect(() => {
    if (tracker.current.update({ open, phase, stepIndex })) {
      haptic.timerStep().catch(() => {});
    }
  }, [open, phase, stepIndex]);
  // Manual controls already supply their own feedback.
  return () => tracker.current.reset();
}
