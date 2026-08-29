import { C, radius, shadows, type as typeScale } from '../../../styles/theme';
import { ArtifactAction } from './ArtifactAction';

export function ActionReceiptCard({ artifact = {}, onAction }) {
  const status = artifact.status || 'succeeded';
  const canUndo = status === 'succeeded' && artifact.undoAvailable === true;
  const canPromote = status === 'attempt_tasted' && artifact.promoteAvailable === true;
  return <div data-artifact="action_receipt" data-status={status} style={{ width: '100%', padding: 14, border: `1px solid ${C.hairline}`, borderRadius: radius.lg, boxShadow: shadows.e1, background: C.cream }}>
    <div style={typeScale.h3}>{artifact.title || (artifact.mode === 'brew_once' ? 'Brew once' : 'Recipe change')}</div>
    <div style={{ color: C.textMuted, marginTop: 6 }}>{artifact.message || 'Coffee saved the exact action result.'}</div>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
      {canUndo && <ArtifactAction action="undo_revision" label="Undo" status={status} onClick={() => onAction?.({ mode: 'undo_revision', artifact })} />}
      {canPromote && <ArtifactAction action="promote_attempt" label="Make this my recipe" status={status} onClick={() => onAction?.({ mode: 'promote_attempt', artifact })} />}
    </div>
  </div>;
}
