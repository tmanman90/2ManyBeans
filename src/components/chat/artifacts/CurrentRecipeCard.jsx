import { C, radius, shadows, type as typeScale } from '../../../styles/theme';

const TECHNIQUE_LABELS = Object.freeze({
  hoffmann: 'Hoffmann Classic',
  'kasuya-46': 'Kasuya 4:6',
  'center-pour': 'Center Pour',
  'low-agitation-center': 'Low-Agitation Center Pour',
  'center-to-spiral-pulse': 'Center-to-Spiral Pulse',
  'bloom-led-pulse': 'Bloom-Led Pulse',
  'low-agitation-no-swirl': 'Low-Agitation, No Swirl',
});

const quantity = (value, unit) => {
  if (value == null) return null;
  if (value && typeof value === 'object' && Number.isFinite(value.min) && Number.isFinite(value.max)) return `${value.min}–${value.max}${unit}`;
  return `${value}${unit}`;
};

const grindLabel = (value) => {
  if (value == null) return null;
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (typeof value !== 'object' || Array.isArray(value)) return null;
  if (value.description) return String(value.description);
  if (typeof value.native === 'string') return value.native;
  if (value.native && typeof value.native === 'object') return [value.native.grinder, value.native.setting, value.native.generation].filter(Boolean).join(': ');
  return Number.isFinite(value.microns) ? `~${value.microns}µm` : value.setting != null ? String(value.setting) : null;
};

const techniqueLabel = (recipe) => {
  const value = recipe.techniqueLabel || recipe.techniqueName || recipe.sourceLineage?.title || recipe.technique;
  if (!value) return null;
  return TECHNIQUE_LABELS[value] || String(value).replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
};

export function CurrentRecipeCard({ recipe = {}, title = 'Current recipe' }) {
  const nativeWater = recipe.sourceProjection?.water;
  const water = nativeWater?.unit ? quantity(nativeWater.value, nativeWater.unit)
    : recipe.waterMilliliters != null ? quantity(recipe.waterMilliliters, 'mL')
      : recipe.waterGrams != null || recipe.water != null ? quantity(recipe.waterGrams ?? recipe.water, ' g') : null;
  const grind = grindLabel(recipe.sourceProjection?.grind || recipe.grindSize || recipe.grind);
  const rows = [
    ['Water', water],
    ['Ratio', recipe.ratio],
    ['Temperature', recipe.waterTemp?.celsius != null ? `${recipe.waterTemp.celsius}°C` : recipe.temperatureC],
    ['Grind', grind],
    ['Dose', recipe.coffeeGrams != null ? `${recipe.coffeeGrams} g` : recipe.dose != null ? `${recipe.dose} g` : null],
    ['Technique', techniqueLabel(recipe)],
  ];
  return <div data-artifact="current_recipe" style={{ padding: 14, border: `1px solid ${C.hairline}`, borderRadius: radius.lg, boxShadow: shadows.e1, background: C.cream }}>
    <div style={typeScale.h3}>{title}</div>
    {rows.filter(([, value]) => value != null).map(([label, value]) => <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, paddingTop: 7, fontVariantNumeric: 'tabular-nums' }}><span style={{ color: C.textMuted }}>{label}</span><span>{String(value)}</span></div>)}
    {Array.isArray(recipe.steps) && recipe.steps.length > 0 && <ol style={{ margin: '16px 0 0', paddingLeft: 20, lineHeight: 1.5 }}>{recipe.steps.map((step, index) => <li key={index} style={{ paddingLeft: 4, marginBottom: 12 }}>{[step.time, step.action].filter(Boolean).join(' · ')}</li>)}</ol>}
  </div>;
}
