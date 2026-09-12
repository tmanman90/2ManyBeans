import { C, radius, shadows, type as typeScale } from '../../../styles/theme';
import { ArtifactAction } from './ArtifactAction';
import { CurrentRecipeCard } from './CurrentRecipeCard';

export function ActionReceiptCard({ artifact = {}, onAction, actionPending = false }) {
  const status = artifact.status || 'succeeded';
  const canUndo = status === 'succeeded' && artifact.undoAvailable === true;
  const canPromote = ['ready', 'succeeded', 'attempt_tasted'].includes(status) && artifact.promoteAvailable === true && Boolean(onAction);
  const canStart = status === 'succeeded' && artifact.mode === 'apply_proposal' && artifact.executionAvailable === true && Boolean(onAction);
  const completedCopy = status === 'undone' ? ['Recipe update undone', 'This update is no longer your saved recipe.'] : status === 'succeeded' ? {
    apply_proposal: ['Recipe updated', 'Your saved recipe is ready for your next brew.'],
    promote_attempt: ['Recipe updated', 'This trial is now your saved recipe.'],
    undo_revision: ['Change undone', artifact.restoredSourceState === 'absent' ? 'The new recipe was removed. No recipe is saved for this brewer.' : 'Your previous recipe is restored.'],
    keep_current: ['Recipe kept', 'Your saved recipe is unchanged.'],
    brew_once: ['Ready to try', artifact.sourceState === 'absent' ? 'Use this version for one brew. Nothing has been saved.' : 'Use this version for one brew. Your saved recipe is unchanged.'],
  }[artifact.mode] : null;
  return <div data-artifact="action_receipt" data-status={status} style={{ width: '100%', padding: 14, border: `1px solid ${C.hairline}`, borderRadius: radius.lg, boxShadow: shadows.e1, background: C.cream }}>
    <div style={typeScale.h3}>{status === 'undone' ? completedCopy[0] : artifact.title || completedCopy?.[0] || 'Recipe change'}</div>
    <div style={{ color: C.textMuted, marginTop: 6 }}>{status === 'undone' ? completedCopy[1] : artifact.message || completedCopy?.[1] || 'Check the result before continuing.'}</div>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
      {canUndo && <ArtifactAction action="undo_revision" label="Undo" status={status} onClick={() => onAction?.({ mode: 'undo_revision', artifact })} />}
      {canStart && <ArtifactAction action="start_attempt" label={artifact.slotKey === 'aiden' ? 'Prepare in Fellow' : 'Start brew'} status={status} onClick={() => onAction?.({ mode: 'start_attempt', artifact })} />}
      {canPromote && <ArtifactAction action="promote_attempt" label="Make this my recipe" status={actionPending ? 'applying' : status} disabled={actionPending} onClick={() => onAction?.({ mode: 'promote_attempt', artifact })} />}
    </div>
    {artifact.recipe && <details key={`${artifact.id}:${artifact.promoteAvailable === true}`} style={{ marginTop: 8 }}><summary style={{ minHeight: 44, padding: '12px 0', cursor: 'pointer', color: C.textMuted }}>Review trial recipe</summary><CurrentRecipeCard recipe={artifact.recipe} title="Trial recipe" /></details>}
  </div>;
}
