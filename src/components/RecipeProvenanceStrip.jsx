import { C, radius } from '../styles/theme';

export function RecipeProvenanceStrip({ provenance = {}, onUndo }) {
  if (!['apply', 'promote'].includes(provenance.source)) return null;
  const slot = provenance.slotKey ? ` · ${provenance.slotKey}` : '';
  return <div data-recipe-provenance="true" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 10px', borderRadius: radius.sm, background: C.accentSoft, color: C.textMuted, fontSize: 12 }}>
    <span>Changed by Professor Ruphus{slot}{provenance.revisionId ? ` · ${provenance.revisionId}` : ''}</span>
    {onUndo && <button type="button" onClick={onUndo} style={{ minHeight: 36, border: 0, background: 'transparent', color: C.accent, fontWeight: 700 }}>Undo</button>}
  </div>;
}
