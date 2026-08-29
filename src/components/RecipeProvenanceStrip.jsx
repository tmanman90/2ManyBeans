import { C, radius } from '../styles/theme';

export function RecipeProvenanceStrip({ provenance = {}, onUndo }) {
  return <div data-recipe-provenance="true" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 10px', borderRadius: radius.sm, background: C.accentSoft, color: C.textMuted, fontSize: 12 }}>
    <span>Changed by Professor Ruphus{provenance.revisionId ? ` · ${provenance.revisionId}` : ''}</span>
    {onUndo && <button type="button" onClick={onUndo} style={{ minHeight: 36, border: 0, background: 'transparent', color: C.accent, fontWeight: 700 }}>Undo</button>}
  </div>;
}
