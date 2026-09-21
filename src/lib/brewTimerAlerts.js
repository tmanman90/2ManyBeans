// Observe the displayed timer so standard and source-backed recipes share cues.
export function createTimerStepAlertTracker() {
  let previous = null;
  return {
    reset() { previous = null; },
    update({ open, phase, stepIndex }) {
      const alert = Boolean(open && phase === 'running'
        && previous?.open && previous.phase === 'running'
        && stepIndex > previous.stepIndex);
      previous = { open, phase, stepIndex };
      return alert;
    },
  };
}
