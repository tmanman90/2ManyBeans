import assert from 'node:assert/strict';
import {
  buildReport, renderMarkdown, namedRecipeReproductionSection, structuralAuditSection,
  determinismSection, compareToNamedRecipe, normalizeSwitchRecipeForReport, NAMED_RECIPE_TARGETS,
} from './v60-switch-recipe-compare.mjs';
import { generateV60SwitchRecipe } from '../src/lib/v60SwitchAdapter.js';

// --- Comparator runs end to end -------------------------------------------
const report = buildReport();
assert.ok(report.named && report.structural && report.determinism, 'report must have all three sections');
assert.ok(report.structural.allRows.length > 0, 'structural audit must produce rows');
assert.equal(report.errorRows.length, 0, 'a healthy adapter run must produce zero error rows');
assert.ok(typeof renderMarkdown(report) === 'string' && renderMarkdown(report).includes('Named-recipe reproduction'));

// --- Output is stable / valid across repeated builds ----------------------
const reportAgain = buildReport();
assert.deepEqual(report, reportAgain, 'buildReport() must be deterministic (same input, same output)');
assert.equal(renderMarkdown(report), renderMarkdown(reportAgain), 'markdown rendering must be stable');

// --- Determinism section itself reports true on the healthy adapter -------
const det = determinismSection();
assert.equal(det.perConfigByteEquivalent, true);
assert.equal(det.wholeReportByteEquivalent, true);

// --- Named-recipe comparison: known-good medium recipe stays sane ---------
// Revision 2026-08-16: Chronicler is the primary, fully-graded target
// (single kettle temperature now matches Chronicler's own stated 92C
// exactly). Kasuya is a structure-only comparison — its temp dimension is
// not-applicable-by-design, everything else stays graded.
const named = namedRecipeReproductionSection();
assert.equal(named.vsChronicler.mode, 'full');
assert.equal(named.vsKasuyaResolved.mode, 'structural-only');
assert.equal(named.vsChronicler.applicableCount, 5, 'Chronicler (full mode) must grade every stated dimension, including temperature');
assert.equal(named.vsKasuyaResolved.applicableCount, 4, 'Kasuya (structural-only) must exclude the not-applicable temperature dimension from the applicable count');
const kasuyaTempDim = named.vsKasuyaResolved.dimensions.find((d) => d.dimension === 'tempC');
assert.equal(kasuyaTempDim.applicable, false, 'Kasuya\'s temperature dimension must be marked not-applicable-by-design, not graded');
assert.ok(!named.vsKasuyaResolved.outsideTolerance.includes('tempC'), 'a not-applicable dimension must never appear in outsideTolerance');
// The two axes this revision specifically claims: Chronicler's temperature
// (exact match) and phase-1 split (steep-window shape) must stay within
// tolerance on a healthy adapter.
assert.ok(!named.vsChronicler.outsideTolerance.includes('tempC'), 'medium preset must match Chronicler\'s single temperature within tolerance');
assert.ok(!named.vsChronicler.outsideTolerance.includes('phase1WaterPct'), 'medium preset must reproduce Chronicler phase-1 split within tolerance');

// --- compareToNamedRecipe: not-applicable dimensions never silently pass as "within" ---
// Chronicler now states a temperature (92C, exact match) — use a synthetic
// partial target to independently exercise the not-stated-temperature path
// (e.g. a source that never publishes a temperature at all).
const noTempTarget = { label: 'synthetic-no-temp-target', mode: 'full', dose: 20, water: 300, ratio: 15, valveCloseSeconds: 45, valveOpenSeconds: 120, phase1WaterPct: 0.5 };
const noTempCmp = compareToNamedRecipe(
  generateV60SwitchRecipe({}, { dose: 20, roast: 'medium', process: 'washed' }),
  noTempTarget,
);
const tempDim = noTempCmp.dimensions.find((d) => d.dimension === 'tempC');
assert.equal(tempDim.applicable, false, 'a source that states no temperature must be marked not-applicable, not treated as a match');
assert.equal(noTempCmp.applicableCount, 4, 'the not-stated temperature dimension must be excluded from the applicable count');

// --- Chronicler itself: exact temperature match ---------------------------
const chroniclerCmp = compareToNamedRecipe(
  generateV60SwitchRecipe({}, { dose: 20, roast: 'medium', process: 'washed' }),
  NAMED_RECIPE_TARGETS.chronicler,
);
const chroniclerTempDim = chroniclerCmp.dimensions.find((d) => d.dimension === 'tempC');
assert.equal(chroniclerTempDim.applicable, true, 'Chronicler states a temperature — must be graded, not marked not-applicable');
assert.equal(chroniclerTempDim.diff, 0, 'the medium preset\'s single temperature must match Chronicler\'s stated 92C exactly');

// --- Fabricated wide-gap target is honestly flagged outside tolerance -----
const gapCmp = compareToNamedRecipe(
  generateV60SwitchRecipe({}, { dose: 20, roast: 'medium' }),
  { label: 'fabricated-gap-target', mode: 'full', dose: 20, water: 300, ratio: 30, tempC: 50, valveCloseSeconds: 5, valveOpenSeconds: 5, phase1WaterPct: 0.99 },
);
assert.ok(gapCmp.outsideTolerance.length >= 4, 'a wildly different target must produce multiple outside-tolerance dimensions');
assert.ok(gapCmp.wildlyOff.length >= 1, 'a >2x tolerance gap must be flagged wildlyOff, not silently averaged away');

// --- Unknown/malformed adapter output is reported as an error, not a win --
const brokenRecipe = { device: 'v60', variant: 'switch', mode: 'hot', isIced: false }; // missing everything else
const normalized = normalizeSwitchRecipeForReport(brokenRecipe);
assert.equal(normalized.state, 'error', 'a malformed recipe object must be reported as an error state');
assert.ok(Array.isArray(normalized.validationFailures) && normalized.validationFailures.length > 0);

// structuralRow (exercised indirectly via structuralAuditSection) must also
// fail closed when generation itself throws, not crash the comparator run.
const structural = structuralAuditSection();
assert.ok(structural.allRows.every((row) => row.state === 'valid' || (row.state === 'error' && (row.error || row.validationFailures))));

// A malformed config that trips the adapter's own guard (dose far out of
// bounds) must surface as an error row when run through the same code path
// the comparator uses, never a silently-passing "win".
let threw = false;
try { generateV60SwitchRecipe({}, { dose: 999, roast: 'medium' }); } catch { threw = true; }
assert.ok(threw, 'out-of-bounds dose must throw at the adapter boundary, confirming the comparator relies on a real fail-closed guard');

console.log('v60 switch recipe comparator test passed');
