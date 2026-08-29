import { C, radius, shadows, type as typeScale } from '../../../styles/theme';

export function FellowHandoffCard({ artifact = {}, onAction }) {
  const uncertain = artifact.status === 'uncertain' || artifact.status === 'failed';
  return <div data-artifact="fellow_handoff_result" data-status={artifact.status || 'prepared'} style={{ width: '100%', padding: 14, border: `1px solid ${C.hairline}`, borderRadius: radius.lg, boxShadow: shadows.e1, background: C.cream }}>
    <div style={typeScale.h3}>Fellow preparation</div>
    <div style={{ color: C.textMuted, marginTop: 6 }}>{artifact.message || (uncertain ? 'Preparation needs a check before retrying.' : 'Coffee prepared the profile handoff.')}</div>
    {uncertain && <button type="button" onClick={() => onAction?.({ mode: 'prepare_attempt', artifact })} style={{ marginTop: 12, minHeight: 44, border: `1px solid ${C.hairline}`, borderRadius: radius.pill, padding: '0 14px', background: C.card, color: C.text }}>Check Fellow again</button>}
  </div>;
}
