// Shared presentation facts for source-backed recipe surfaces. Never infer
// author provenance or convert source volume into a mass-based brew ratio.
export function recipeCardMetadata(recipe = {}, slot = '') {
  const projection = recipe.sourceProjection;
  const equipment = projection?.equipment || {};
  const configuration = projection?.sourceConfiguration || {};
  const isSwitch = equipment.brewer === 'switch'
    || recipe.v60Variant === 'switch' || recipe.variant === 'switch';
  const size = configuration.size || equipment.size || recipe.kalitaSize;
  const brewer = isSwitch ? `Switch ${size || ''}`.trim()
    : slot.startsWith('kalita') ? `Kalita ${size || ''}`.trim()
      : slot === 'aiden' ? 'Aiden' : slot.startsWith('v60') ? 'V60' : 'Recipe';
  const brewerLabel = slot.endsWith('_iced') ? `Iced ${brewer}` : brewer;
  if (!projection) return { brewerLabel, sourceSummary: null, adaptationLabel: null };

  const dose = projection.coffeeGrams;
  const water = projection.water;
  const sourceSummary = Number.isFinite(dose) && Number.isFinite(water?.value)
    && ['g', 'mL'].includes(water.unit)
    ? `${dose}g coffee · ${water.value}${water.unit} water`
    : Number.isFinite(dose) ? `${dose}g coffee` : null;
  const adaptationLabel = projection.adaptation?.status === 'original' ? 'Original source recipe'
    : projection.adaptation?.status === 'scaled' ? `Scaled to ${dose}g`
      : projection.adaptation?.status === 'adapted' ? 'App-adapted recipe' : null;
  return { brewerLabel, sourceSummary, adaptationLabel };
}
