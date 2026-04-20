#!/usr/bin/env node

// ═══════════════════════════════════════════════════════════
// GRIND AUTORESEARCH: Karpathy-style evaluation harness
// ═══════════════════════════════════════════════════════════
//
// Immutable evaluation file ("prepare.py").
// Tests grind band changes in aiden.js against:
//   1. Brew Talks reference profiles (ground truth)
//   2. Brew Commons algorithm (taste-test validated)
//   3. Tal's taste test result (3.2 > 4.2 on washed Ethiopia)
//
// Single metric: composite pass rate across all test beans.
// Each bean is scored pass/fail on multiple criteria.

// ── Ground Truth: Brew Talks Reference Profiles ──────────
// These are REAL grind settings from Fellow's official profiles.
// Format: { origin, process, variety_group, grindSS_min, grindSS_max }
const BREW_TALKS_GRINDS = [
  { name: 'Kiss the Hippo Peru', origin: 'peru', process: 'washed', varietyGroup: 'bourbon', ssMin: 3, ssMax: 4 },
  { name: 'Passenger Colombia Divino', origin: 'colombia', process: 'washed', varietyGroup: 'not-listed', ssMin: 5, ssMax: 6.1 },
  { name: 'Coffee Collective Kenya Kieni', origin: 'kenya', process: 'washed', varietyGroup: 'sl', ssMin: 3.2, ssMax: 4.2 },
  { name: 'Counter Culture Colombia', origin: 'colombia', process: 'washed', varietyGroup: 'catimor-sarchimor', ssMin: 5.2, ssMax: 6.2 },
  { name: 'Sq Mile Ethiopia Telila', origin: 'ethiopia', process: 'washed', varietyGroup: 'ethiopian-landrace', ssMin: 5.1, ssMax: 6 },
  { name: 'Sey Burundi Heza', origin: 'burundi', process: 'washed', varietyGroup: 'not-listed', ssMin: 3, ssMax: 3.2 },
  { name: 'Wonderstate Ethiopia Danche', origin: 'ethiopia', process: 'washed', varietyGroup: 'ethiopian-landrace', ssMin: 3.2, ssMax: 3.2 },
  { name: 'Heart Colombia Montano', origin: 'colombia', process: 'washed', varietyGroup: 'not-listed', ssMin: 5.2, ssMax: 6.2 },
  { name: 'Wendelboe Kenya Kapsokiso', origin: 'kenya', process: 'washed', varietyGroup: 'sl', ssMin: 3, ssMax: 3 },
  { name: 'April Ethiopia Regessa', origin: 'ethiopia', process: 'natural', varietyGroup: 'ethiopian-landrace', ssMin: 3, ssMax: 4 },
  { name: 'Camber Ethiopia Yonka', origin: 'ethiopia', process: 'natural', varietyGroup: 'ethiopian-landrace', ssMin: 3.1, ssMax: 4.1 },
  { name: 'Camber Ethiopia Buliye', origin: 'ethiopia', process: 'natural', varietyGroup: 'ethiopian-landrace', ssMin: 5, ssMax: 5 },
  { name: 'Sq Mile Ethiopia Shoondhisa', origin: 'ethiopia', process: 'natural', varietyGroup: 'ethiopian-landrace', ssMin: 5.1, ssMax: 6 },
  { name: 'Counter Culture Intango Dark', origin: 'rwanda', process: 'washed', varietyGroup: 'bourbon', ssMin: 6.1, ssMax: 7.1 },
  { name: 'Methodical Oscuro Dark', origin: 'brazil', process: 'natural', varietyGroup: 'not-listed', ssMin: 8, ssMax: 9 },
  { name: 'Loquat CR Geisha', origin: 'costa-rica', process: 'semi-washed', varietyGroup: 'gesha', ssMin: 4.1, ssMax: 5.1 },
  { name: 'Sightglass Guatemala Cuevitas', origin: 'guatemala', process: 'anaerobic', varietyGroup: 'not-listed', ssMin: 3, ssMax: 4 },
  { name: 'Black & White Fruit Cake', origin: 'costa-rica', process: 'anaerobic', varietyGroup: 'catuai', ssMin: 3.2, ssMax: 3.2 },
  { name: 'Asprotimana Colombia', origin: 'colombia', process: 'washed', varietyGroup: 'catimor-sarchimor', ssMin: 5, ssMax: 5.2 },
  { name: 'Olympia Amparo Pajoy', origin: 'colombia', process: 'washed', varietyGroup: 'bourbon', ssMin: 3, ssMax: 4 },
];

// ── Brew Commons outputs for Tal's beans (taste-test validated) ──
const BC_VALIDATED = [
  { name: 'Elto Elora Station', origin: 'ethiopia', variety: '74158', process: 'washed', bcGrind: 3.2, talVerdict: 'winner' },
  { name: 'Koppi Pink Bourbon', origin: 'colombia', variety: 'pink-bourbon', process: 'washed', bcGrind: 3.1, talVerdict: 'pending' },
  { name: 'Apollon Mulish', origin: 'ethiopia', variety: 'heirloom', process: 'washed', bcGrind: 3.2, talVerdict: 'pending' },
  { name: 'Apollon El Triangulo Geisha', origin: 'honduras', variety: 'gesha', process: 'washed', bcGrind: 3.2, talVerdict: 'pending' },
  { name: 'Apollon San Isidro Geisha', origin: 'costa-rica', variety: 'gesha', process: 'washed', bcGrind: 3.2, talVerdict: 'pending' },
  { name: 'Wonderstate Layampata', origin: 'peru', variety: 'gesha', process: 'washed', bcGrind: 3.2, talVerdict: 'pending' },
  { name: 'Leaves Kenya Gichathaini', origin: 'kenya', variety: 'sl', process: 'washed', bcGrind: 3.1, talVerdict: 'pending' },
  { name: 'Apollon Santa Teresa SL28', origin: 'costa-rica', variety: 'sl', process: 'honey', bcGrind: 3.2, talVerdict: 'pending' },
  { name: 'Cat & Cloud Nelin Guzman', origin: 'honduras', variety: 'parainema', process: 'anaerobic-natural', bcGrind: 4.2, talVerdict: 'aligned' },
  { name: 'Apollon San Jose Pacamara', origin: 'nicaragua', variety: 'pacamara', process: 'natural', bcGrind: 5.0, talVerdict: 'pending' },
  { name: 'Apollon Chelchele Natural', origin: 'ethiopia', variety: 'ethiopian-landrace', process: 'natural', bcGrind: 4.1, talVerdict: 'pending' },
  { name: 'Dayglow Rareglow Geisha', origin: 'colombia', variety: 'gesha', process: 'natural', bcGrind: 4.1, talVerdict: 'pending' },
];

// ── ODE STEP SYSTEM ──────────────────────────────────────
const ODE_GEN2_STEPS = [
  1, 1.1, 1.2, 2, 2.1, 2.2, 3, 3.1, 3.2, 4, 4.1, 4.2,
  5, 5.1, 5.2, 6, 6.1, 6.2, 7, 7.1, 7.2, 8, 8.1, 8.2,
  9, 9.1, 9.2, 10, 10.1, 10.2, 11,
];

function nearestOdeStep(target) {
  let closest = ODE_GEN2_STEPS[0];
  let minDist = Math.abs(target - closest);
  for (const step of ODE_GEN2_STEPS) {
    const dist = Math.abs(target - step);
    if (dist < minDist) { closest = step; minDist = dist; }
  }
  return closest;
}

// ── LOAD CURRENT AIDEN.JS BANDS ──────────────────────────
// This reads the ACTUAL current state of aiden.js to evaluate
const fs = require('fs');
const aidenPath = process.argv[2] || '/Users/talmeltzer/Documents/VIBE CODING/Coffee-App-Build/src/lib/aiden.js';
const aidenSrc = fs.readFileSync(aidenPath, 'utf-8');

// Extract FAMILY_GRIND_BANDS from current source
function extractBands(src) {
  const match = src.match(/const FAMILY_GRIND_BANDS\s*=\s*\{([\s\S]*?)\};/);
  if (!match) { console.error('ERROR: Could not find FAMILY_GRIND_BANDS in aiden.js'); process.exit(1); }

  const bands = {};
  const entries = match[1].matchAll(/'([^']+)':\s*\{\s*ssMin:\s*([\d.]+),\s*ssMax:\s*([\d.]+),\s*batchMin:\s*([\d.]+),\s*batchMax:\s*([\d.]+)\s*\}/g);
  for (const e of entries) {
    bands[e[1]] = {
      ssMin: parseFloat(e[2]),
      ssMax: parseFloat(e[3]),
      batchMin: parseFloat(e[4]),
      batchMax: parseFloat(e[5]),
    };
  }
  return bands;
}

// Extract variety delta logic if it exists (for v2 changes)
function hasVarietyDeltas(src) {
  return src.includes('VARIETY_GRIND_DELTAS') || src.includes('varietyGrindDelta');
}

const bands = extractBands(aidenSrc);
const hasDeltas = hasVarietyDeltas(aidenSrc);

// ── CLASSIFY FAMILY (mirrors aiden.js logic) ─────────────
function classifyFamily(bean) {
  const origin = (bean.origin || '').toLowerCase();
  const process = (bean.process || '').toLowerCase();
  const variety = (bean.variety || '').toLowerCase();
  const roastLevel = (bean.roastLevel || '').toLowerCase();
  const notes = (bean.bagNotes || '').toLowerCase();

  if (roastLevel.includes('dark') || roastLevel === 'medium-dark') return 'dark-roast';
  if (roastLevel === 'medium' && (process.includes('washed') || (!process.includes('natural') && !process.includes('honey')))) return 'medium-washed';

  if (process.includes('honey') || process.includes('anaerobic')) return 'processed-clarity';
  if (variety.includes('gesha') || variety.includes('geisha')) return 'washed-floral-clarity';
  if (variety.includes('pink bourbon') || variety.includes('pink-bourbon')) return 'washed-floral-clarity';
  if (process.includes('natural') && origin.includes('ethiopia')) return 'clean-natural-fruit';
  if (!process.includes('natural')) {
    if (origin.includes('kenya')) return 'washed-kenya-clarity';
    if (origin.includes('ethiopia')) return 'washed-ethiopia-clarity';
    if (notes.includes('jasmine') || notes.includes('floral')) return 'washed-floral-clarity';
  }
  if (process.includes('natural')) return 'clean-natural-fruit';
  return 'generic-washed';
}

// ── COMPUTE GRIND (mirrors enforceDeterministicGrind) ────
function computeGrind(bean) {
  const family = classifyFamily(bean);
  const band = bands[family];
  if (!band) return { grind: null, family, error: 'no band for family' };

  const ssMid = (band.ssMin + band.ssMax) / 2;
  const ss = nearestOdeStep(ssMid);
  return { grind: ss, family, band };
}

// ── EVALUATION CRITERIA ──────────────────────────────────

function evaluate() {
  const results = [];
  let totalScore = 0;
  let totalChecks = 0;

  console.log('═'.repeat(100));
  console.log('GRIND AUTORESEARCH — EVALUATION RUN');
  console.log('═'.repeat(100));
  console.log(`Bands loaded from: ${aidenPath}`);
  console.log(`Variety deltas: ${hasDeltas ? 'YES' : 'NO'}`);
  console.log('');

  // Print current bands
  console.log('Current FAMILY_GRIND_BANDS:');
  for (const [family, band] of Object.entries(bands)) {
    console.log(`  ${family.padEnd(28)} SS: ${band.ssMin}-${band.ssMax}  Batch: ${band.batchMin}-${band.batchMax}`);
  }
  console.log('');

  // ── Test 1: Brew Talks coverage ──
  // For each Brew Talks profile, check if our grind for that family
  // falls within the profile's documented range.
  console.log('── TEST 1: Brew Talks Reference Coverage ──');
  let btPass = 0, btTotal = 0;

  for (const bt of BREW_TALKS_GRINDS) {
    btTotal++;
    const family = classifyFamily({ origin: bt.origin, process: bt.process, variety: bt.varietyGroup });
    const { grind } = computeGrind({ origin: bt.origin, process: bt.process, variety: bt.varietyGroup });

    // Check: is our grind within or close to the BT range?
    // "Close" = within 1 step, because BT profiles have huge variance
    const inRange = grind >= bt.ssMin - 1 && grind <= bt.ssMax + 1;
    if (inRange) btPass++;

    const status = inRange ? 'PASS' : 'FAIL';
    if (!inRange) {
      console.log(`  ${status} ${bt.name.padEnd(35)} BT: ${bt.ssMin}-${bt.ssMax} | Ours: ${grind} (${family})`);
    }
  }
  console.log(`  Result: ${btPass}/${btTotal} within range (${(btPass/btTotal*100).toFixed(0)}%)`);
  console.log('');

  // ── Test 2: BC alignment on taste-tested beans ──
  // For beans where BC was taste-validated (or pending validation on similar profiles),
  // check if our grind is within 0.5 steps of BC.
  console.log('── TEST 2: Brew Commons Alignment (taste-validated direction) ──');
  let bcPass = 0, bcTotal = 0;

  for (const bcBean of BC_VALIDATED) {
    bcTotal++;
    const { grind, family } = computeGrind(bcBean);
    const delta = Math.abs(grind - bcBean.bcGrind);

    // For the taste-tested bean, we want to be AT or finer than BC
    // For others, within 0.5 steps is acceptable
    let pass;
    if (bcBean.talVerdict === 'winner') {
      pass = grind <= bcBean.bcGrind + 0.2; // Must not be more than 0.2 coarser than BC
    } else if (bcBean.talVerdict === 'aligned') {
      pass = delta <= 0.2; // Already aligned, don't regress
    } else {
      pass = delta <= 0.5; // Pending: within 0.5 is acceptable
    }

    if (pass) bcPass++;
    const status = pass ? 'PASS' : 'FAIL';
    const verdictTag = bcBean.talVerdict === 'winner' ? ' [TASTE-TESTED]' : '';
    console.log(`  ${status} ${bcBean.name.padEnd(35)} BC: ${bcBean.bcGrind} | Ours: ${grind} | Delta: ${delta.toFixed(1)} (${family})${verdictTag}`);
  }
  console.log(`  Result: ${bcPass}/${bcTotal} aligned (${(bcPass/bcTotal*100).toFixed(0)}%)`);
  console.log('');

  // ── Test 3: Regression checks ──
  // Make sure we didn't break non-specialty beans
  console.log('── TEST 3: Regression Checks (medium/dark beans still correct) ──');
  const regressionBeans = [
    { name: 'Generic medium washed Colombia', origin: 'Colombia', process: 'Washed', variety: 'Caturra', roastLevel: 'medium', expect: { min: 5, max: 5.2 }, family: 'medium-washed' },
    { name: 'Dark natural Brazil', origin: 'Brazil', process: 'Natural', variety: '', roastLevel: 'dark', expect: { min: 5, max: 9 }, family: 'dark-roast' },
    { name: 'Anaerobic honey Ethiopia', origin: 'Ethiopia', process: 'Anaerobic Honey', variety: '74158', expect: { min: 4, max: 5 }, family: 'processed-clarity' },
  ];

  let regPass = 0, regTotal = 0;
  for (const rb of regressionBeans) {
    regTotal++;
    const { grind, family } = computeGrind(rb);
    const pass = grind >= rb.expect.min && grind <= rb.expect.max;
    if (pass) regPass++;
    const status = pass ? 'PASS' : 'FAIL';
    console.log(`  ${status} ${rb.name.padEnd(40)} Expected: ${rb.expect.min}-${rb.expect.max} | Got: ${grind} (${family})`);
  }
  console.log(`  Result: ${regPass}/${regTotal} pass (${(regPass/regTotal*100).toFixed(0)}%)`);
  console.log('');

  // ── Test 4: Tal's taste test (hard constraint) ──
  console.log('── TEST 4: Tal\'s Taste Test (hard constraint) ──');
  const elora = computeGrind({ origin: 'Ethiopia', variety: '74158', process: 'Classic Washed' });
  const eloraPass = elora.grind <= 3.2;
  console.log(`  ${eloraPass ? 'PASS' : 'FAIL'} Elto Elora Station (washed Ethiopia 74158): grind = ${elora.grind} (need <= 3.2, Tal confirmed 3.2 > 4.2)`);
  console.log('');

  // ── Composite Score ──
  const total = btTotal + bcTotal + regTotal + 1;
  const passed = btPass + bcPass + regPass + (eloraPass ? 1 : 0);
  const score = (passed / total * 100).toFixed(1);

  console.log('═'.repeat(100));
  console.log(`COMPOSITE SCORE: ${passed}/${total} (${score}%)`);
  console.log('═'.repeat(100));

  if (!eloraPass) {
    console.log('BLOCKER: Tal\'s taste test FAILED. Elora must grind at 3.2 or finer.');
  }

  const bcFails = BC_VALIDATED.filter(b => {
    const { grind } = computeGrind(b);
    return Math.abs(grind - b.bcGrind) > 0.5;
  });
  if (bcFails.length > 0) {
    console.log(`WARNING: ${bcFails.length} beans more than 0.5 steps from BC. These may need attention.`);
  }

  console.log('');
  return { score: parseFloat(score), passed, total, eloraPass };
}

evaluate();
