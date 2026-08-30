import { C, radius, shadows, type as typeScale } from '../../styles/theme';
import { buildRuphusOpening } from '../../lib/ruphus/opening';

export function RuphusOpening({ dataLoaded = false, coffees = [], profile = null, starterPrompts = [], onSend = null }) {
  const text = buildRuphusOpening({ dataLoaded, coffees, profile });
  return <section data-ruphus-opening="true" data-loaded={dataLoaded ? 'true' : 'false'} style={{ margin: '8px 0 4px', background: C.cream, border: `1px solid ${C.hairline}`, borderRadius: radius.xl, boxShadow: shadows.e2, padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 10 }}>
    <img src="/images/ruphus-avatar.png" alt="Professor Ruphus" style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', objectPosition: 'center top', border: `1px solid ${C.borderLight}`, boxShadow: shadows.e1 }} />
    <div style={{ ...typeScale.h3, color: C.text }}>Professor Ruphus</div>
    <div style={{ ...typeScale.bodyL, color: C.textMuted, lineHeight: 1.55 }}>{text}</div>
    {dataLoaded && onSend && starterPrompts.map((prompt) => <button key={prompt} type="button" onClick={() => onSend(prompt)} style={{ minHeight: 44, border: `1px solid ${C.hairline}`, borderRadius: radius.pill, background: 'transparent', padding: '7px 14px', color: C.text }}>{prompt}</button>)}
  </section>;
}
