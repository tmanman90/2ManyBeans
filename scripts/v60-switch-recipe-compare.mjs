// Offline, deterministic Switch recipe comparator (U5).
// No network. Runs generateV60SwitchRecipe() over the evaluation bean matrix
// plus a synthetic roast x dose x process grid, then reports:
//   a) named-recipe reproduction vs Kasuya-resolved and Chronicler parameter
//      points, with explicit tolerances (report distances honestly — the
//      adapter is a deliberate blend of both, so it will NOT match either
//      exactly, per docs/research/2026-08-15-v60-switch-methodology-brief.md §3)
//   b) a structural audit table (preset differentiation + override behavior)
//   c) a determinism check (byte-equivalence across repeated runs)
//
// This mirrors the shape of scripts/kalita-recipe-compare.mjs (contract-based
// normalize -> compare) but is expanded per the U5 task: it runs the adapter
// itself rather than diffing two pre-built recipe objects, because Switch has
// no legacy GPT baseline to diff against yet (R9/R10).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import {
  generateV60SwitchRecipe, validateV60SwitchCandidate, V60_SWITCH_ENGINE_VERSION, V60_SWITCH_RULES_VERSION,
} from '../src/lib/v60SwitchAdapter.js';
import { V60_SWITCH_CLASSIC_BASELINE_MICRONS, V60_SWITCH_PROCESS_OVERRIDE } from '../src/data/v60SwitchConfiguration.js';

const EVALUATION_BEANS_PATH = new URL('../docs/data/v60-switch-recipe-evaluation-beans.json', import.meta.url);

// --- Named-recipe targets (docs/data/v60-switch-source-registry.md) -------
// Tolerances per U5 task spec.
export const TOLERANCES = Object.freeze({
  tempC: 3, timingSeconds: 20, ratio: 0.7, phaseSplitPct: 10,
});

// Revision 2026-08-16 (single-temperature mandate): Coffee Chronicler is now
// the PRIMARY named comparison target for the medium preset — the adapter's
// single kettle temperature (92C) is Chronicler's own stated constant
// temperature, an exact match rather than a Kasuya/Chronicler blend. Kasuya's
// resolved hybrid (still dual-temp in its own published form) is demoted to
// a STRUCTURE-ONLY comparison: temp dimensions do not apply (there is no
// dual-temp concept left in the adapter to compare against Kasuya's
// phase1/phase2 split), so they are marked not-applicable-by-design rather
// than graded pass/fail. See compareToNamedRecipeStructural() below.
export const NAMED_RECIPE_TARGETS = Object.freeze({
  chronicler: {
    label: 'Coffee Chronicler (coffeechronicler.com + timer.coffee, adapted-primary) — PRIMARY single-temp comparison target since Revision 2026-08-16',
    sourceId: 'chronicler-primary',
    mode: 'full',
    dose: 20, water: 300, ratio: 15,
    tempC: 92, // [chronicler-primary] 92C constant — single-temp mandate finding
    valveCloseSeconds: 45, // 0:45
    valveOpenSeconds: 120, // 2:00
    phase1WaterPct: 0.5,
  },
  kasuyaResolved: {
    label: 'Kasuya resolved hybrid (comoricoffee.com + gota.cafe, 2-of-3 corroborated, dual-temp) — STRUCTURE-ONLY since Revision 2026-08-16',
    sourceId: 'kasuya-hybrid-resolved',
    mode: 'structural-only',
    dose: 20, water: 280, ratio: 14,
    valveCloseSeconds: 75, // 1:15
    valveOpenSeconds: 105, // 1:45
    phase1WaterPct: 120 / 280, // 0.4286
  },
});

// Secondary targets — informational only, not tolerance-graded, per the
// brief's §4/§7 note that these are "alternate valid parameter points ...
// useful as U5 shadow-comparison targets", not adapter defaults.
export const SECONDARY_TARGETS = Object.freeze({
  kasuyaSuperHybridV2: {
    label: 'Kasuya Super Hybrid v2 (roastaroma.com/timer.coffee)',
    dose: 20, water: 300, ratio: 15, tempPhase1C: 90, tempPhase2C: '70-80 (range)',
    structure: 'closed-bloom-first, then open-close(2:10)-open(2:55) — different template shape, not directly time-comparable to the shipped open-first two-pour template',
  },
  harioBookletZhangEveryday: {
    label: 'Hario booklet — Zhang everyday (via mcjones.ca)',
    dose: 16, water: 240, ratio: 15, tempPhase1C: 92, tempPhase2C: null,
    structure: 'single-temp open pour, close, open 2:00, finish 3:40 — single-source manufacturer booklet, no independent corroboration',
  },
});

const round2 = (value) => Math.round(value * 100) / 100;

// --- (a) Named-recipe reproduction ----------------------------------------
// `mode: 'full'` targets (Chronicler) are graded numerically on every stated
// dimension. `mode: 'structural-only'` targets (Kasuya, since Revision
// 2026-08-16) skip temperature dimensions entirely — the single-temp mandate
// removed the dual-temp concept Kasuya's own recipe depends on, so grading a
// temperature diff against it would be comparing two different things, not
// a real miss.
export function compareToNamedRecipe(recipe, target) {
  const isStructural = target.mode === 'structural-only';
  const phase1Grams = recipe.steps[0]?.waterTotal ?? null;
  const valveCloseAt = recipe.steps.find((s) => /close the valve/i.test(s.action))?.timeSeconds ?? null;
  const valveOpenAt = recipe.steps.find((s) => /open the valve/i.test(s.action))?.timeSeconds ?? null;
  const adapterRatio = Number(recipe.ratio.split(':')[1]);
  const adapterPhase1Pct = phase1Grams != null ? phase1Grams / recipe.waterGrams : null;

  const dims = [
    distance('ratio', adapterRatio, target.ratio, TOLERANCES.ratio, 'x:1'),
    distance('tempC', recipe.waterTemp.celsius, isStructural ? null : target.tempC, TOLERANCES.tempC, '°C',
      isStructural ? 'not applicable by design — structure-only comparison; single-temp mandate removed the dual-temp concept Kasuya\'s own recipe depends on' : undefined),
    distance('valveCloseSeconds', valveCloseAt, target.valveCloseSeconds, TOLERANCES.timingSeconds, 's'),
    distance('valveOpenSeconds', valveOpenAt, target.valveOpenSeconds, TOLERANCES.timingSeconds, 's'),
    distance('phase1WaterPct', adapterPhase1Pct != null ? round2(adapterPhase1Pct * 100) : null, round2(target.phase1WaterPct * 100), TOLERANCES.phaseSplitPct, 'pp'),
  ];
  const applicableDims = dims.filter((d) => d.applicable);
  const outsideTolerance = applicableDims.filter((d) => !d.withinTolerance);
  return {
    target: target.label, sourceId: target.sourceId, mode: target.mode || 'full',
    dimensions: dims,
    withinCount: applicableDims.length - outsideTolerance.length,
    applicableCount: applicableDims.length,
    outsideTolerance: outsideTolerance.map((d) => d.dimension),
    wildlyOff: outsideTolerance.filter((d) => d.absDiff > d.tolerance * 2).map((d) => d.dimension),
  };
}

function distance(dimension, adapterValue, targetValue, tolerance, unit, note) {
  if (targetValue == null || adapterValue == null) {
    return { dimension, adapter: adapterValue ?? null, target: targetValue ?? null, applicable: false, note: note || 'not stated by source', unit };
  }
  const diff = round2(adapterValue - targetValue);
  return {
    dimension, adapter: adapterValue, target: targetValue, applicable: true,
    diff, absDiff: Math.abs(diff), tolerance, unit,
    withinTolerance: Math.abs(diff) <= tolerance,
  };
}

export function namedRecipeReproductionSection() {
  const mediumRecipe = generateV60SwitchRecipe({}, { dose: 20, roast: 'medium', grinder: 'fellow-ode-gen2', process: 'washed' });
  return {
    adapterConfig: { dose: 20, roast: 'medium', grinder: 'fellow-ode-gen2', process: 'washed' },
    adapterOutputSummary: {
      ratio: mediumRecipe.ratio, waterGrams: mediumRecipe.waterGrams,
      tempC: mediumRecipe.waterTemp.celsius,
      totalBrewTimeSeconds: mediumRecipe.totalBrewTimeSeconds, reasonCodes: mediumRecipe.reasonCodes,
    },
    vsChronicler: compareToNamedRecipe(mediumRecipe, NAMED_RECIPE_TARGETS.chronicler),
    vsKasuyaResolved: compareToNamedRecipe(mediumRecipe, NAMED_RECIPE_TARGETS.kasuyaResolved),
    secondaryTargets: SECONDARY_TARGETS,
    designNote: 'Since Revision 2026-08-16 (single-temperature mandate), the medium preset\'s single kettle temperature (92C) is Chronicler\'s own stated constant temperature — an exact match, not a blend. Chronicler is graded on every stated dimension as the primary target. Kasuya\'s resolved hybrid is a structure-only comparison: its own recipe is still dual-temp, so its temperature dimension is not-applicable-by-design rather than graded, while ratio/timing/phase-split dimensions stay graded normally (some expected to sit outside tolerance, since the adapter no longer targets reproducing Kasuya\'s numbers — see mode on each comparison).',
  };
}

// --- Adapter output normalization (fail-closed, mirrors kalita-recipe-compare.mjs) ---
export function normalizeSwitchRecipeForReport(recipe) {
  const validation = validateV60SwitchCandidate(recipe);
  if (!validation.valid) return { state: 'error', validationFailures: validation.errors };
  return { state: 'valid', recipe };
}

// --- (b) Structural audit ---------------------------------------------------
function structuralRow(id, config) {
  let generated;
  try {
    generated = generateV60SwitchRecipe({}, config);
  } catch (error) {
    return { id, config, state: 'error', error: error.message };
  }
  const normalized = normalizeSwitchRecipeForReport(generated);
  if (normalized.state === 'error') {
    return { id, config, state: 'error', validationFailures: normalized.validationFailures };
  }
  const recipe = normalized.recipe;
  const valveCloseAt = recipe.steps.find((s) => /close the valve/i.test(s.action))?.timeSeconds ?? null;
  const valveOpenAt = recipe.steps.find((s) => /open the valve/i.test(s.action))?.timeSeconds ?? null;
  const phase1Grams = recipe.steps[0]?.waterTotal ?? null;
  return {
    id, state: 'valid',
    requestedDose: config.dose ?? null, requestedRoast: config.roast ?? null, requestedProcess: config.process ?? null, requestedGrinder: config.grinder ?? null,
    resolvedDose: recipe.coffeeGrams, resolvedRoastPreset: recipe.roastPreset, resolvedProcess: recipe.process,
    ratio: recipe.ratio, waterGrams: recipe.waterGrams, waterCapped: recipe.reasonCodes.includes('SWITCH_WATER_CAP_APPLIED'),
    tempC: recipe.waterTemp.celsius,
    valveCloseSeconds: valveCloseAt, valveOpenSeconds: valveOpenAt, steepDurationSeconds: valveOpenAt != null && valveCloseAt != null ? valveOpenAt - valveCloseAt : null,
    phase1WaterPct: phase1Grams != null ? round2((phase1Grams / recipe.waterGrams) * 100) : null,
    grindSetting: recipe.grindSize.setting, grindMicrons: recipe.grindSize.microns,
    grindOffsetFromClassicMicrons: recipe.grindSize.microns - V60_SWITCH_CLASSIC_BASELINE_MICRONS,
    totalBrewTimeSeconds: recipe.totalBrewTimeSeconds,
    reasonCodes: recipe.reasonCodes, fallback: !!recipe.fallback,
  };
}

function loadEvaluationBeans() {
  return JSON.parse(readFileSync(EVALUATION_BEANS_PATH, 'utf8'));
}

function beanToConfig(bean) {
  return { dose: bean.dose, grinder: bean.grinder, roast: bean.roastLevel, process: bean.process };
}

// Synthetic roast x dose x process x grinder grid — explicit coverage the
// evaluation-bean matrix doesn't guarantee (15g floor, 30g ceiling, every
// roast x anaerobic-override pairing, two representative grinders).
function syntheticMatrixConfigs() {
  const roasts = ['light', 'medium', 'dark'];
  const doses = [15, 18, 20, 25, 30];
  const processes = ['washed', 'anaerobic'];
  const grinders = ['fellow-ode-gen2', 'comandante-c40'];
  const configs = [];
  for (const roast of roasts) {
    for (const dose of doses) {
      for (const process of processes) {
        for (const grinder of grinders) {
          configs.push({
            id: `synthetic-${roast}-${dose}g-${process}-${grinder}`,
            config: { dose, roast, process, grinder },
          });
        }
      }
    }
  }
  return configs;
}

export function structuralAuditSection() {
  const beans = loadEvaluationBeans();
  const beanRows = beans.map((bean) => structuralRow(bean.id, beanToConfig(bean)));
  const syntheticRows = syntheticMatrixConfigs().map(({ id, config }) => structuralRow(id, config));
  return { beanMatrixRows: beanRows, syntheticMatrixRows: syntheticRows, allRows: [...beanRows, ...syntheticRows] };
}

// Differentiation + override checks over the structural rows — flags
// anomalies rather than asserting (this is a report, not a test).
// Two designed sources of convergence are excluded from the anomaly count
// and reported separately instead:
//  1. Rows where the 340g Switch-03 capacity cap fired
//     (SWITCH_WATER_CAP_APPLIED): resolveSwitchWater() deliberately clamps
//     water and recomputes the effective ratio at high doses (see its doc
//     comment in src/data/v60SwitchConfiguration.js), so two roast presets
//     converging on the same capped ratio is designed capacity behavior.
//  2. Roast-ratio/temp convergence under the anaerobic override: the
//     override applies a ratio floor (16.5-17) and a temperature ceiling
//     (88-91C) "regardless of roast level" (brief §5, R5) on top of the
//     roast preset, so when a preset's own ratio/temp already sits at or
//     past that band, two or three roasts land on the identical clamped
//     value. Verified directly against V60_SWITCH_PROCESS_OVERRIDE.
// Both are reported in expectedConvergence for transparency, not silently
// dropped — they are real, human-reviewable findings, just not defects.
export function differentiationChecks(allRows) {
  const anomalies = [];
  const expectedCapacityCapCollisions = [];
  const expectedProcessOverrideConvergence = [];
  const valid = allRows.filter((r) => r.state === 'valid');

  // Roast differentiation: same dose/grinder/process, distinct roast -> distinct ratio + total time.
  const byKey = new Map();
  for (const row of valid) {
    if (!row.requestedRoast || !['light', 'medium', 'dark'].includes(row.resolvedRoastPreset)) continue;
    const key = `${row.resolvedDose}|${row.requestedGrinder}|${row.requestedProcess}`;
    if (!byKey.has(key)) byKey.set(key, new Map());
    byKey.get(key).set(row.resolvedRoastPreset, row);
  }
  let roastGroupsChecked = 0;
  for (const [key, byRoast] of byKey) {
    if (byRoast.size < 2) continue;
    roastGroupsChecked += 1;
    const rows = [...byRoast.values()];
    const anyCapped = rows.some((r) => r.waterCapped);
    const isAnaerobicGroup = key.endsWith('|anaerobic');
    const ratios = rows.map((r) => r.ratio);
    const totals = rows.map((r) => r.totalBrewTimeSeconds);
    if (new Set(ratios).size !== ratios.length) {
      const message = `roast-ratio-collision at ${key}: ${ratios.join(', ')}`;
      if (anyCapped) expectedCapacityCapCollisions.push(message);
      else if (isAnaerobicGroup) expectedProcessOverrideConvergence.push(message);
      else anomalies.push(message);
    }
    if (new Set(totals).size !== totals.length) anomalies.push(`roast-totalTime-collision at ${key}: ${totals.join(', ')}`);
  }

  // Anaerobic override: same dose/roast/grinder, washed vs anaerobic -> temp in band, grind coarser, ratio lengthened.
  const byOverrideKey = new Map();
  for (const row of valid) {
    if (!['light', 'medium', 'dark'].includes(row.resolvedRoastPreset)) continue;
    const key = `${row.resolvedDose}|${row.resolvedRoastPreset}|${row.requestedGrinder}`;
    if (!byOverrideKey.has(key)) byOverrideKey.set(key, {});
    byOverrideKey.get(key)[row.requestedProcess === 'anaerobic' ? 'anaerobic' : 'baseline'] = row;
  }
  let overridePairsChecked = 0;
  for (const [key, pair] of byOverrideKey) {
    if (!pair.anaerobic || !pair.baseline) continue;
    overridePairsChecked += 1;
    const { anaerobic, baseline } = pair;
    if (anaerobic.tempC < V60_SWITCH_PROCESS_OVERRIDE.anaerobicTempCapMinC || anaerobic.tempC > V60_SWITCH_PROCESS_OVERRIDE.anaerobicTempCapMaxC) {
      anomalies.push(`anaerobic-temp-out-of-band at ${key}: ${anaerobic.tempC}C`);
    }
    if (anaerobic.grindMicrons <= baseline.grindMicrons) anomalies.push(`anaerobic-grind-not-coarsened at ${key}`);
    if (Number(anaerobic.ratio.split(':')[1]) < V60_SWITCH_PROCESS_OVERRIDE.anaerobicRatioMin) {
      const message = `anaerobic-ratio-not-lengthened at ${key}`;
      if (anaerobic.waterCapped) expectedCapacityCapCollisions.push(message);
      else anomalies.push(message);
    }
    if (!anaerobic.reasonCodes.includes('SWITCH_ANAEROBIC_OVERRIDE')) anomalies.push(`anaerobic-missing-reason-code at ${key}`);
  }

  return {
    roastGroupsChecked, overridePairsChecked, anomalies,
    expectedCapacityCapCollisions, expectedProcessOverrideConvergence,
  };
}

// --- (c) Determinism ----------------------------------------------------
export function determinismSection() {
  const configs = [
    { dose: 20, roast: 'light' }, { dose: 20, roast: 'medium' }, { dose: 20, roast: 'dark' },
    { dose: 18, roast: 'medium', process: 'anaerobic' }, { dose: 30, roast: 'dark', grinder: 'comandante-c40' },
  ];
  const runs = configs.map((config) => ({
    config,
    run1: JSON.stringify(generateV60SwitchRecipe({}, config)),
    run2: JSON.stringify(generateV60SwitchRecipe({}, config)),
  }));
  const allByteEquivalent = runs.every((r) => r.run1 === r.run2);
  // Whole-report determinism: two independently-built reports (excluding this
  // very determinism section, which is inherently about repeated calls) must
  // serialize identically.
  const reportA = JSON.stringify({ named: namedRecipeReproductionSection(), structural: structuralAuditSection() });
  const reportB = JSON.stringify({ named: namedRecipeReproductionSection(), structural: structuralAuditSection() });
  return {
    perConfigByteEquivalent: allByteEquivalent,
    perConfigResults: runs.map((r) => ({ config: r.config, byteEquivalent: r.run1 === r.run2 })),
    wholeReportByteEquivalent: reportA === reportB,
  };
}

// --- Report assembly -----------------------------------------------------
export function buildReport() {
  const named = namedRecipeReproductionSection();
  const structural = structuralAuditSection();
  const differentiation = differentiationChecks(structural.allRows);
  const determinism = determinismSection();
  const errorRows = structural.allRows.filter((r) => r.state === 'error');
  return {
    engineVersion: V60_SWITCH_ENGINE_VERSION, rulesVersion: V60_SWITCH_RULES_VERSION,
    named, structural, differentiation, determinism,
    errorRows,
    summary: {
      totalRows: structural.allRows.length,
      validRows: structural.allRows.length - errorRows.length,
      errorRows: errorRows.length,
      anomalyCount: differentiation.anomalies.length,
      determinismPass: determinism.perConfigByteEquivalent && determinism.wholeReportByteEquivalent,
      // Chronicler is the primary, fully-graded target since Revision
      // 2026-08-16 — any outside-tolerance dimension here is a real signal.
      namedRecipeOutsideToleranceChronicler: named.vsChronicler.outsideTolerance,
      namedRecipeWildlyOffChronicler: named.vsChronicler.wildlyOff,
      // Kasuya is structure-only (informational, not gating — see
      // compareToNamedRecipe's mode handling and the design note above):
      // outside-tolerance dimensions here (typically ratio/timing, since the
      // adapter no longer targets reproducing Kasuya's dual-temp numbers)
      // are recorded for visibility, never treated as a stop-ship signal.
      // Nothing in this report's exit-code check reads these two fields.
      namedRecipeStructuralOnlyInfoKasuya: named.vsKasuyaResolved.outsideTolerance,
      namedRecipeStructuralOnlyWildlyOffKasuya: named.vsKasuyaResolved.wildlyOff,
    },
  };
}

function fmt(dim) {
  if (!dim.applicable) return `${dim.dimension}: n/a (${dim.note})`;
  const flag = dim.withinTolerance ? 'within' : 'OUTSIDE';
  return `${dim.dimension}: adapter=${dim.adapter}${dim.unit} target=${dim.target}${dim.unit} diff=${dim.diff}${dim.unit} tol=±${dim.tolerance}${dim.unit} [${flag}]`;
}

export function renderMarkdown(report) {
  const lines = [];
  lines.push('# V60 Switch recipe comparator — offline output');
  lines.push('');
  lines.push(`Engine: \`${report.engineVersion}\` / Rules: \`${report.rulesVersion}\``);
  lines.push('');
  lines.push('## a. Named-recipe reproduction (medium preset, dose=20g, washed)');
  lines.push('');
  lines.push(`Adapter output: ratio ${report.named.adapterOutputSummary.ratio}, temp ${report.named.adapterOutputSummary.tempC}C (single kettle temperature), total ${report.named.adapterOutputSummary.totalBrewTimeSeconds}s`);
  lines.push('');
  for (const cmp of [report.named.vsChronicler, report.named.vsKasuyaResolved]) {
    lines.push(`### vs ${cmp.target} [mode: ${cmp.mode}]`);
    for (const dim of cmp.dimensions) lines.push(`- ${fmt(dim)}`);
    lines.push(`- outside tolerance: ${cmp.outsideTolerance.length ? cmp.outsideTolerance.join(', ') : 'none'}`);
    lines.push(`- wildly off (>2x tolerance): ${cmp.wildlyOff.length ? cmp.wildlyOff.join(', ') : 'none'}`);
    lines.push('');
  }
  lines.push('## b. Structural audit');
  lines.push('');
  lines.push(`rows: ${report.structural.allRows.length} (bean matrix ${report.structural.beanMatrixRows.length}, synthetic ${report.structural.syntheticMatrixRows.length})`);
  lines.push(`differentiation groups checked: ${report.differentiation.roastGroupsChecked} roast groups, ${report.differentiation.overridePairsChecked} anaerobic-override pairs`);
  lines.push(`anomalies: ${report.differentiation.anomalies.length ? report.differentiation.anomalies.join('; ') : 'none'}`);
  lines.push(`expected capacity-cap collisions (340g Switch-03 ceiling, not defects — see resolveSwitchWater): ${report.differentiation.expectedCapacityCapCollisions.length ? report.differentiation.expectedCapacityCapCollisions.join('; ') : 'none'}`);
  lines.push(`expected process-override convergence (anaerobic ratio floor / temp ceiling, not defects — see V60_SWITCH_PROCESS_OVERRIDE): ${report.differentiation.expectedProcessOverrideConvergence.length ? report.differentiation.expectedProcessOverrideConvergence.join('; ') : 'none'}`);
  lines.push('');
  lines.push('## c. Determinism');
  lines.push('');
  lines.push(`per-config byte-equivalent: ${report.determinism.perConfigByteEquivalent}`);
  lines.push(`whole-report byte-equivalent: ${report.determinism.wholeReportByteEquivalent}`);
  lines.push('');
  lines.push('## Errors');
  lines.push('');
  lines.push(report.errorRows.length ? JSON.stringify(report.errorRows, null, 2) : 'none');
  return lines.join('\n');
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] || '')) {
  const report = buildReport();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(renderMarkdown(report));
  }
  if (report.errorRows.length || report.differentiation.anomalies.length || !report.summary.determinismPass) {
    process.exitCode = 1;
  }
}

