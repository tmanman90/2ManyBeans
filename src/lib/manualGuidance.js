// Source fidelity and suitability for a timed guide are separate checks.
// Physical actions can be confirmed immediately; every intervening wait needs
// an elapsed checkpoint or a duration. Only the final drainage may be untimed.
export function manualGuidanceReadiness(record) {
  const blockers = Array.isArray(record?.guidedTimingBlockers) ? [...record.guidedTimingBlockers] : [];
  const stages = Array.isArray(record?.stages) ? record.stages : [];
  if (!stages.length) blockers.push('This recipe has no brewing schedule.');
  for (const [index, stage] of stages.entries()) {
    if (!stage?.trigger) { blockers.push('A brewing step is missing its timing instruction.'); continue; }
    if (stage.trigger.type === 'condition' && !(stage.kind === 'finish' && index === stages.length - 1)) {
      blockers.push(`${stage.label}: the source uses an observation instead of a timed cue.`);
    }
  }
  return { ready: blockers.length === 0, blockers };
}
