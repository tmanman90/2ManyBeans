import { Btn } from '../../Btn';

export function ArtifactAction({ action, label, status = 'ready', onClick, disabled = false }) {
  const unavailable = disabled || ['checking', 'applying', 'stale', 'superseded', 'unavailable', 'failed'].includes(status);
  const loading = status === 'applying';
  return <Btn variant={action === 'apply_proposal' ? 'primary' : 'small'} onClick={onClick} disabled={unavailable} aria-label={label} style={{ minHeight: 44 }}>{loading ? 'Working…' : label}</Btn>;
}
