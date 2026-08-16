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
const named = namedRecipeReproductionSection();
assert.ok(named.vsKasuyaResolved.applicableCount >= 5, 'Kasuya comparison must grade every stated dimension');
// tempPhase2 and phase1WaterPct are the two axes each named recipe was
// specifically chosen to validate (Kasuya = temp-split signature, Chronicler
// = steep-window shape) — those must stay within tolerance on a healthy adapter.
assert.ok(!named.vsKasuyaResolved.outsideTolerance.includes('tempPhase2C'), 'medium preset must reproduce Kasuya temp-split within tolerance');
assert.ok(!named.vsChronicler.outsideTolerance.includes('phase1WaterPct'), 'medium preset must reproduce Chronicler phase-1 split within tolerance');

// --- compareToNamedRecipe: not-applicable dimensions never silently pass as "within" ---
const chroniclerCmp = compareToNamedRecipe(
  generateV60SwitchRecipe({}, { dose: 20, roast: 'medium', process: 'washed' }),
  NAMED_RECIPE_TARGETS.chronicler,
);
const tempDim = chroniclerCmp.dimensions.find((d) => d.dimension === 'tempPhase1C');
assert.equal(tempDim.applicable, false, 'a source that states no temperature must be marked not-applicable, not treated as a match');
assert.equal(chroniclerCmp.applicableCount, 4, 'the two not-stated temperature dimensions must be excluded from the applicable count');

// --- Fabricated wide-gap target is honestly flagged outside tolerance -----
const gapCmp = compareToNamedRecipe(
  generateV60SwitchRecipe({}, { dose: 20, roast: 'medium' }),
  { label: 'fabricated-gap-target', dose: 20, water: 300, ratio: 30, tempPhase1C: 50, tempPhase2C: 10, valveCloseSeconds: 5, valveOpenSeconds: 5, phase1WaterPct: 0.99 },
);
assert.ok(gapCmp.outsideTolerance.length >= 5, 'a wildly different target must produce multiple outside-tolerance dimensions');
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
