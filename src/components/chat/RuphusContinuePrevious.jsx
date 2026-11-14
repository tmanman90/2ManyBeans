import { C, radius, type as typeScale } from '../../styles/theme';

export function RuphusContinuePrevious({ session, onContinue, firstLine = '' }) {
  if (!session) return null;
  const date = session.lastActivityAt ? new Date(session.lastActivityAt).toLocaleDateString() : '';
  return <section data-ruphus-continue="true" style={{ padding: '12px 14px', border: `1px solid ${C.hairline}`, borderRadius: radius.lg, background: C.cream, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
    <div><div style={{ ...typeScale.caption, color: C.textMuted }}>Earlier conversation{date ? ` · ${date}` : ''}</div>{firstLine && <div style={{ ...typeScale.body }}>{firstLine}</div>}</div>
    <button type="button" onClick={onContinue} style={{ minHeight: 44, border: 0, borderRadius: radius.pill, padding: '0 14px', background: C.accent, color: C.cream }}>Continue</button>
  </section>;
}
