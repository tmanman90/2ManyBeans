import { C, radius, shadows, type as typeScale } from '../../../styles/theme';
export function CurrentRecipeCard({ recipe = {}, title = 'Current recipe' }) {
  const water = recipe.waterGrams ?? recipe.water;
  const rows = [['Water', water != null ? `${water} g` : null], ['Ratio', recipe.ratio], ['Temperature', recipe.waterTemp?.celsius != null ? `${recipe.waterTemp.celsius}°C` : recipe.temperatureC], ['Grind', recipe.grindSize?.setting ?? recipe.grind], ['Dose', recipe.coffeeGrams != null ? `${recipe.coffeeGrams} g` : recipe.dose]];
  return <div data-artifact="current_recipe" style={{ padding: 14, border: `1px solid ${C.hairline}`, borderRadius: radius.lg, boxShadow: shadows.e1, background: C.cream }}>
    <div style={typeScale.h3}>{title}</div>
    {rows.filter(([, value]) => value != null).map(([label, value]) => <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, paddingTop: 7, fontVariantNumeric: 'tabular-nums' }}><span style={{ color: C.textMuted }}>{label}</span><span>{String(value)}</span></div>)}
    {Array.isArray(recipe.steps) && recipe.steps.length > 0 && <ol>{recipe.steps.map((step, index) => <li key={index}>{[step.time, step.action].filter(Boolean).join(' · ')}</li>)}</ol>}
  </div>;
}
