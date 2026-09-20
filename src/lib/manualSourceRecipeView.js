// View-only envelope for rendering an admitted manual source in the ordinary
// recipe sheet. The source projection remains the authority for execution,
// timing, units, and lineage; this module only supplies the fields the shared
// recipe renderer already understands.

import { adaptedDoseBounds } from './ruphus/techniqueOptions.js';
import { manualSourceDisplay } from './manualSourceProjection.js';

const finite = (value) => typeof value === 'number' && Number.isFinite(value);

function quantityLabel(quantity) {
  if (!quantity || !quantity.unit || quantity.value == null) return null;
  const value = quantity.value;
  const rendered = value && typeof value === 'object' && finite(value.min) && finite(value.max)
    ? `${value.min}–${value.max}`
    : value;
  return `${rendered}${quantity.unit}`;
}

function triggerLabel(trigger, clockOrigin) {
  if (!trigger) return null;
  if (trigger.type === 'manual') return 'Begin when ready';
  if (trigger.type === 'condition') return `When observed: ${trigger.condition}`;
  if (trigger.type === 'after') {
    const event = String(trigger.event || '').replace(/:complete$/, '').replace(/[-_]/g, ' ');
    return trigger.seconds === 0
      ? `Immediately after ${event} finishes`
      : `${trigger.seconds}s after ${event} finishes`;
  }
  if (trigger.type === 'elapsed' && finite(trigger.seconds)) {
    const origin = clockOrigin === 'first-water'
      ? 'from the first water'
      : clockOrigin ? `from ${String(clockOrigin).replaceAll('-', ' ')}` : 'on the source clock';
    const minutes = Math.floor(trigger.seconds / 60);
    const seconds = String(trigger.seconds % 60).padStart(2, '0');
    return `At ${minutes}:${seconds} ${origin}`;
  }
  return null;
}

function temperatureLabel(temperature) {
  if (!temperature) return null;
  const value = temperature.value;
  const unit = temperature.unit || 'C';
  if (finite(value)) return `${value}°${unit}`;
  if (value && finite(value.min) && finite(value.max)) return `${value.min}–${value.max}°${unit}`;
  if (temperature.description) return temperature.description;
  return null;
}

function sourceDoseBounds(projection) {
  const source = projection?.sourceSnapshot || projection?.sourceExecution || {};
  const sourceDose = finite(source.coffeeGrams) ? source.coffeeGrams : null;
  const adapted = adaptedDoseBounds(projection?.sourceSnapshot);
  if (!adapted || sourceDose == null) return sourceDose == null ? null : [sourceDose, sourceDose];
  const outside = sourceDose < adapted[0] || sourceDose > adapted[1];
  const currentDose = finite(projection?.coffeeGrams) ? projection.coffeeGrams : sourceDose;
  const within = currentDose >= adapted[0] && currentDose <= adapted[1];
  return outside && !within ? [sourceDose, sourceDose] : adapted;
}

function finishRange(projection) {
  const finish = projection?.finish;
  if (!finite(finish?.minSeconds) || !finite(finish?.maxSeconds)) return null;
  return [finish.minSeconds, finish.maxSeconds];
}

function finishLabel(projection, range) {
  if (!range) return null;
  const [min, max] = range;
  const clockOrigin = projection?.clock?.origin;
  const format = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  const target = min === max ? format(min) : `${format(min)}–${format(max)}`;
  const origin = clockOrigin === 'first-water' ? 'from first water' : clockOrigin ? `from ${String(clockOrigin).replaceAll('-', ' ')}` : 'on the source clock';
  return `Source finish target: around ${target} ${origin}. Confirm the bed has drained; this is not an automatic stop.`;
}

export function manualSourceRecipeView(recipe, { dose = null } = {}) {
  const projection = recipe?.sourceProjection;
  if (!projection) return recipe || null;
  const execution = projection.sourceExecution || projection;
  const display = manualSourceDisplay(projection);
  const source = projection.sourceSnapshot || execution;
  const sourceConfiguration = projection.sourceConfiguration || projection.equipment || source.equipment || {};
  const displayedDose = finite(dose) ? dose : (finite(recipe.coffeeGrams) ? recipe.coffeeGrams : projection.coffeeGrams ?? source.coffeeGrams);
  const water = display.water || projection.water || null;
  const sourceStages = display.stages || [];
  const steps = sourceStages.map((stage) => {
    const waterLabel = quantityLabel(stage.water);
    const timingLabel = triggerLabel(stage.trigger, projection.clock?.origin);
    const action = stage.label || (waterLabel ? `Add water to ${waterLabel}` : 'Continue the source method');
    return {
      ...stage,
      name: ({ pour: 'Pour', valve: 'Valve', finish: 'Finish', agitate: 'Action', press: 'Press', dilute: 'Dilute' }[stage.kind] || 'Source step'),
      action,
      time: timingLabel || 'When ready',
      ...(finite(stage.trigger?.seconds) ? { timeSeconds: stage.trigger.seconds } : {}),
      ...(stage.water && finite(stage.water.value) ? { waterTotal: stage.water.value, waterUnit: stage.water.unit } : {}),
      sourceTimingLabel: timingLabel,
      sourceQuantityLabel: waterLabel,
    };
  });
  const sourceLineage = {
    ...(projection.sourceLineage || {}),
    ...(recipe.sourceLineage || {}),
    ...(projection.adaptation?.disclosure && !recipe.sourceLineage?.adaptation
      ? { adaptation: projection.adaptation.disclosure }
      : {}),
  };
  const sourceAuthor = source.author || sourceLineage.author || null;
  const sourceWaterLabel = quantityLabel(water);
  const sourceIceValue = execution.water?.iceGrams ?? source.water?.iceGrams;
  const sourceIceLabel = finite(sourceIceValue) ? `${sourceIceValue}g` : null;
  const range = finishRange(projection);
  const prepSteps = (projection.preparation || execution.preparation || []).map((step) => ({ action: typeof step === 'string' ? step : step.action }));
  const postBrewSteps = (projection.aftercare || execution.aftercare || []).map((step) => ({ action: typeof step === 'string' ? step : step.action }));
  const sourceGrind = recipe.grindSize || projection.grind || source.grind || null;

  return {
    ...recipe,
    // The projection is deliberately carried through unchanged: shared timer
    // execution and timing persistence read it as the source authority.
    sourceProjection: projection,
    sourceLineage,
    device: recipe.device || sourceConfiguration.device || (sourceConfiguration.brewer === 'switch' ? 'v60' : sourceConfiguration.brewer),
    variant: recipe.variant || (sourceConfiguration.variant || (sourceConfiguration.brewer === 'switch' ? 'switch' : undefined)),
    v60Size: recipe.v60Size || (sourceConfiguration.size && sourceConfiguration.device === 'v60' ? sourceConfiguration.size : undefined),
    title: recipe.title || source.title || 'Source recipe',
    mode: recipe.mode || projection.mode || source.mode || 'hot',
    isIced: recipe.isIced === true || projection.mode === 'iced' || source.mode === 'iced',
    techniqueLabel: recipe.techniqueLabel || source.title || 'Source-backed method',
    sourceAuthor,
    sourceWater: water,
    sourceWaterLabel,
    sourceIceLabel,
    coffeeGrams: displayedDose,
    waterGrams: water?.unit === 'g' && finite(water.value) ? water.value : undefined,
    waterMilliliters: water?.unit === 'mL' && finite(water.value) ? water.value : undefined,
    ratio: water?.unit === 'g' && finite(water.value) && finite(displayedDose) ? `1:${(water.value / displayedDose).toFixed(1)}` : null,
    waterTemp: undefined,
    sourceTemperatureLabel: temperatureLabel(projection.temperature || execution.temperature || source.temperature),
    grindSize: sourceGrind,
    prepSteps,
    steps,
    postBrewSteps,
    guideRangeSeconds: range && range[0] !== range[1] ? range : undefined,
    totalBrewTimeSeconds: range ? range[1] : undefined,
    totalBrewTime: undefined,
    sourceFinishLabel: finishLabel(projection, range),
    timerReady: projection.timerReady === true && Boolean(projection.sourceExecution),
    sourceDoseBounds: sourceDoseBounds(projection),
    // Source-backed qualitative methods must not inherit candidate copy from
    // a generic recipe envelope.
    candidate: false,
    generationStatus: undefined,
    reasoning: recipe.reasoning || (projection.adaptation?.disclosure
      ? 'Scaled to your dose, keeping the original pour pattern and timing. Treat the timing as a guide and finish when the coffee has drained.'
      : sourceLineage.disclosure || null),
    tips: recipe.tips || projection.finish?.guidance || null,
    sourceConfiguration,
  };
}

export default manualSourceRecipeView;
