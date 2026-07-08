import { Coffee, Save } from 'lucide-react';
import { Btn } from '../Btn';
import { C, fonts, radius, shadows, type as typeScale } from '../../styles/theme';

function text(value) {
  return String(value || '').slice(0, 200).trim();
}

export function recipeSummary(recipe) {
  const steps = Array.isArray(recipe?.steps) ? recipe.steps.slice(0, 12).map(text).filter(Boolean) : [];
  return [
    `Recipe: ${text(recipe?.title)}`,
    `Method: ${text(recipe?.method)} | Ratio: ${text(recipe?.ratio)} | Temp: ${text(recipe?.temp)} | Grind: ${text(recipe?.grind)}`,
    steps.length ? `Steps: ${steps.join(' / ')}` : '',
    text(recipe?.reasoning) ? `Why: ${text(recipe.reasoning)}` : '',
  ].filter(Boolean).join('\n');
}

export function RecipeCard({ recipe, brewBean, saveBean, onBrew, onSave, saving = false }) {
  if (!recipe) return null;

  const meta = [
    ['Method', recipe.method],
    ['Ratio', recipe.ratio],
    ['Temp', recipe.temp],
    ['Grind', recipe.grind],
  ].filter(([, value]) => text(value));
  const steps = Array.isArray(recipe.steps) ? recipe.steps.slice(0, 12).map(text).filter(Boolean) : [];

  return (
    <div
      data-recipe-card="true"
      style={{
        marginTop: 8,
        marginLeft: 38,
        maxWidth: '82%',
        background: C.cream,
        border: `1px solid ${C.hairline}`,
        borderRadius: radius.lg,
        boxShadow: shadows.e1,
        padding: '14px 14px 12px',
      }}
    >
      <div style={{ fontFamily: fonts.heading, fontSize: 17, fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.16, color: C.text }}>
        {text(recipe.title)}
      </div>
      <div style={{ height: 1, background: C.hairline, margin: '11px 0' }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '9px 12px', marginBottom: 11 }}>
        {meta.map(([label, value]) => (
          <div key={label} style={{ minWidth: 0, fontVariantNumeric: 'tabular-nums' }}>
            <div style={{ ...typeScale.label, color: C.textLight, marginBottom: 2 }}>{label}</div>
            <div style={{ ...typeScale.body, color: C.text, fontVariantNumeric: 'tabular-nums' }}>{text(value)}</div>
          </div>
        ))}
      </div>
      {steps.length > 0 && (
        <ol style={{ listStyle: 'none', display: 'grid', gap: 6, marginBottom: recipe.reasoning ? 10 : 12 }}>
          {steps.map((step, idx) => (
            <li key={`${idx}-${step}`} style={{ display: 'grid', gridTemplateColumns: '18px 1fr', gap: 7, ...typeScale.body, lineHeight: 1.5, color: C.text, fontVariantNumeric: 'tabular-nums' }}>
              <span style={{ color: C.accent, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{idx + 1}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      )}
      {text(recipe.reasoning) && (
        <div style={{ ...typeScale.caption, color: C.textMuted, fontStyle: 'italic', lineHeight: 1.4, marginBottom: 12 }}>
          {text(recipe.reasoning)}
        </div>
      )}
      {(brewBean || saveBean) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, minHeight: 44, alignItems: 'center' }}>
          {brewBean && <Btn variant="small" onClick={() => onBrew?.(brewBean)} style={{ minHeight: 44 }}><Coffee size={12} /> Brew this</Btn>}
          {saveBean && (
            <Btn variant="small" onClick={() => onSave?.(saveBean, recipe)} disabled={saving} style={{ minHeight: 44 }}>
              <Save size={12} /> {saving ? 'Saving…' : 'Save to bean notes'}
            </Btn>
          )}
        </div>
      )}
    </div>
  );
}
