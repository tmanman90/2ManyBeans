import { X } from 'lucide-react';
import { C, fonts, type as typeScale } from '../../styles/theme';

export function RuphusContextHeader({ context, onClear }) {
  if (!context) return null;
  const label = [context.coffeeName || context.coffeeId, context.method || context.slotKey, context.revisionId ? `rev ${context.revisionId}` : null].filter(Boolean).join(' · ');
  return <div data-ruphus-context-header="true" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 40, padding: '6px 12px', borderBottom: `1px solid ${C.hairline}`, color: C.textMuted }}><span style={{ ...typeScale.caption, fontFamily: fonts.body, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span><button type="button" aria-label="Clear Professor Ruphus context" onClick={onClear} style={{ minWidth: 44, minHeight: 44, border: 0, background: 'transparent', color: C.textMuted }}><X size={16} aria-hidden="true" /></button></div>;
}
