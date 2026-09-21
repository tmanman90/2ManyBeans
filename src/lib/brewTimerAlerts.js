// Observe the displayed timer so standard and source-backed recipes share cues.
export function createTimerStepAlertTracker() {
  let previous = null;
  return {
    reset() { previous = null; },
    update({ open, phase, stepIndex, readiness }) {
      const alert = Boolean(open && phase === 'running'
        && previous?.open && previous.phase === 'running'
        && (stepIndex > previous.stepIndex
          || (stepIndex === previous.stepIndex && previous.readiness === 'countdown'
            && ['ready', 'checkpoint-passed'].includes(readiness))));
      previous = { open, phase, stepIndex, readiness };
      return alert;
    },
  };
}
