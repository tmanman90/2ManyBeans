import { C, radius, shadows, type as typeScale } from '../../../styles/theme';
import { ArtifactAction } from './ArtifactAction';

export function ActionReceiptCard({ artifact = {}, onAction, actionPending = false }) {
  const status = artifact.status || 'succeeded';
  const canUndo = status === 'succeeded' && artifact.undoAvailable === true;
  const canPromote = ['succeeded', 'attempt_tasted'].includes(status) && artifact.promoteAvailable === true && Boolean(onAction);
  const canStart = artifact.mode === 'apply_proposal' && artifact.executionAvailable === true && Boolean(onAction);
  const completedCopy = status === 'succeeded' ? {
    apply_proposal: ['Recipe updated', 'Your saved recipe is ready for your next brew.'],
    promote_attempt: ['Recipe updated', 'This trial is now your saved recipe.'],
    undo_revision: ['Change undone', 'Your previous recipe is restored.'],
    keep_current: ['Recipe kept', 'Your saved recipe is unchanged.'],
    brew_once: ['Ready to try', 'Use this version for one brew. Your saved recipe is unchanged.'],
  }[artifact.mode] : null;
  return <div data-artifact="action_receipt" data-status={status} style={{ width: '100%', padding: 14, border: `1px solid ${C.hairline}`, borderRadius: radius.lg, boxShadow: shadows.e1, background: C.cream }}>
    <div style={typeScale.h3}>{artifact.title || completedCopy?.[0] || 'Recipe change'}</div>
    <div style={{ color: C.textMuted, marginTop: 6 }}>{artifact.message || completedCopy?.[1] || 'Check the result before continuing.'}</div>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
      {canUndo && <ArtifactAction action="undo_revision" label="Undo" status={status} onClick={() => onAction?.({ mode: 'undo_revision', artifact })} />}
      {canStart && <ArtifactAction action="start_attempt" label={artifact.slotKey === 'aiden' ? 'Prepare in Fellow' : 'Start brew'} status={status} onClick={() => onAction?.({ mode: 'start_attempt', artifact })} />}
      {canPromote && <ArtifactAction action="promote_attempt" label="Make this my recipe" status={actionPending ? 'applying' : status} disabled={actionPending} onClick={() => onAction?.({ mode: 'promote_attempt', artifact })} />}
    </div>
  </div>;
}
