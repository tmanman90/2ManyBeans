import { C, fonts, type as typeScale } from '../../styles/theme';

export function RuphusMessage({ text, children, legacy = false }) {
  return <div data-ruphus-message={legacy ? 'legacy' : 'agent-v3'} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '8px 14px', color: C.text, fontFamily: fonts.body, ...(legacy ? { background: C.cream, borderRadius: 16 } : {}) }}><img src="/images/ruphus-avatar.png" alt="Professor Ruphus" style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} /><div style={{ ...typeScale.body, lineHeight: 1.5, whiteSpace: 'pre-wrap', minWidth: 0 }}>{text}{children}</div></div>;
}
