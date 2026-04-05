#!/usr/bin/env node
// Autoresearch Iteration Loop — GPT-5.4 Mini prompt optimization
// Tests prompt variations against the scoring harness, keeps improvements, reverts regressions
// Usage: node scripts/aiden-autoresearch-mini-loop.mjs

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '.env.local');
const envContent = readFileSync(envPath, 'utf8');
const env = {};
for (const line of envContent.split('\n')) {
  const match = line.match(/^([A-Z_]+)=(.*)$/);
  if (match) env[match[1]] = match[2].replace(/^"|"$/g, '');
}

const OPENAI_KEY = env.OPENAI_API_KEY;
if (!OPENAI_KEY) { console.error('Missing OPENAI_API_KEY'); process.exit(1); }

const MODEL = 'gpt-5.4-mini';

// ═══════════════════════════════════════════════
// TEST BEANS (focus on the failure cases + controls)
// ═══════════════════════════════════════════════

const TEST_BEANS = [
  // FAILURE: A3 (invalid grind steps)
  {
    name: 'Mulish', roaster: "Apollon's Gold", origin: 'Ethiopia',
    variety: 'Heirloom', process: 'Washed', roastDate: '2025-12-07',
    bagNotes: 'nectarine / honeysuckle / lavender',
    peakStatus: 'Past Peak (+15d)', daysSinceRoast: 118,
    expectedFamily: 'washed-ethiopia-clarity', isLightWashed: true, isKenyaWashed: false, isPastPeak: true,
  },
  // FAILURE: A3 (invalid grind steps)
  {
    name: 'Gesha Village Lot 74', roaster: 'SEY', origin: 'Ethiopia (Gesha Village, Bench Maji)',
    variety: 'Gesha 1931', process: 'Washed', roastDate: '2026-03-01',
    bagNotes: 'jasmine / bergamot / white peach / lemongrass',
    peakStatus: 'In Peak (55%)', daysSinceRoast: 34,
    expectedFamily: 'washed-gesha-clarity', isLightWashed: true, isKenyaWashed: false, isPastPeak: false,
  },
  // FAILURE: A11 (age adjustment - ratio too low for past peak)
  {
    name: 'Huila Castillo', roaster: 'Onyx Coffee Lab', origin: 'Colombia (Huila)',
    variety: 'Castillo, Caturra', process: 'Washed', roastDate: '2026-01-20',
    bagNotes: 'brown sugar / red apple / nutty / smooth',
    peakStatus: 'Past Peak (+5d)', daysSinceRoast: 74,
    expectedFamily: 'medium-washed', isLightWashed: false, isKenyaWashed: false, isPastPeak: true,
  },
  // CONTROL: Should still pass (honey-anaerobic)
  {
    name: 'El Placer', roaster: 'Dayglow (Promethium)', origin: 'Colombia',
    variety: 'Geisha', process: 'Anaerobic White Honey', roastDate: '2026-02-05',
    bagNotes: 'gardenia flowers / Earl Grey tea / bergamot',
    peakStatus: 'In Peak (67%)', daysSinceRoast: 58,
    expectedFamily: 'honey-anaerobic', isLightWashed: false, isKenyaWashed: false, isPastPeak: false,
  },
  // CONTROL: Kenya (should still pass strict rules)
  {
    name: 'Gichathaini AA', roaster: 'Manhattan Coffee Roasters', origin: 'Kenya (Nyeri)',
    variety: 'SL28, SL34', process: 'Washed', roastDate: '2026-03-10',
    bagNotes: 'blackcurrant / grapefruit / brown sugar / pomelo',
    peakStatus: 'In Peak (45%)', daysSinceRoast: 25,
    expectedFamily: 'washed-kenya-clarity', isLightWashed: true, isKenyaWashed: true, isPastPeak: false,
  },
  // CONTROL: Dark roast
  {
    name: 'Intango Dark', roaster: 'Counter Culture', origin: 'Rwanda (Nyamasheke)',
    variety: 'Bourbon, Mayaguez, Jackson', process: 'Washed', roastDate: '2026-03-05',
    bagNotes: 'dark chocolate / molasses / dried cherry / smoky',
    peakStatus: 'In Peak (40%)', daysSinceRoast: 30,
    expectedFamily: 'dark-roast', isLightWashed: false, isKenyaWashed: false, isPastPeak: false,
  },
];

// ═══════════════════════════════════════════════
// SHARED RESEARCH (from GPT-5.4 baseline run)
// ═══════════════════════════════════════════════

// Load from previous run results
const prevResultsPath = resolve(__dirname, 'autoresearch-results-2026-04-04T20-54-04.json');
let prevResults;
try { prevResults = JSON.parse(readFileSync(prevResultsPath, 'utf8')); } catch {
  console.error('Cannot load previous results for shared research. Run aiden-autoresearch.mjs first.');
  process.exit(1);
}

function getSharedResearch(beanName) {
  return prevResults.phase1?.[beanName]?.['GPT-5.4']?.research;
}

// ═══════════════════════════════════════════════
// VALIDATION
// ═══════════════════════════════════════════════

const VALID_ODE_STEPS = [1,1.1,1.2,2,2.1,2.2,3,3.1,3.2,4,4.1,4.2,5,5.1,5.2,6,6.1,6.2,7,7.1,7.2,8,8.1,8.2,9,9.1,9.2,10,10.1,10.2,11];

const RECIPE_REQUIRED_FIELDS = [
  'profileType', 'title', 'ratio', 'bloomEnabled', 'bloomRatio', 'bloomDuration',
  'bloomTemperature', 'ssPulsesEnabled', 'ssPulsesNumber', 'ssPulsesInterval',
  'ssPulseTemperatures', 'batchPulsesEnabled', 'batchPulsesNumber', 'batchPulsesInterval',
  'batchPulseTemperatures', 'grindRecommendation',
];

function scoreRecipe(recipe, bean) {
  const scores = {};
  let applicable = 0;

  scores.A1 = recipe !== null && RECIPE_REQUIRED_FIELDS.every(f => recipe[f] !== undefined);
  applicable++;
  if (!recipe) return { scores, total: 0, max: 1, applicable: 1 };

  scores.A2 = typeof recipe.ratio === 'number' &&
    typeof recipe.bloomEnabled === 'boolean' &&
    typeof recipe.bloomRatio === 'number' &&
    Array.isArray(recipe.ssPulseTemperatures) &&
    Array.isArray(recipe.batchPulseTemperatures);
  applicable++;

  const gr = recipe.grindRecommendation;
  scores.A3 = gr && VALID_ODE_STEPS.includes(gr.singleServe) && VALID_ODE_STEPS.includes(gr.batch);
  applicable++;

  scores.A4 = gr && gr.batch > gr.singleServe;
  applicable++;

  if (bean.isLightWashed) {
    scores.A5 = recipe.ssPulsesInterval >= 20 && recipe.ssPulsesInterval <= 25;
    applicable++;
  }

  if (bean.isKenyaWashed) {
    scores.A6 = recipe.bloomRatio >= 2.5 && recipe.bloomRatio <= 3.0;
    applicable++;
  }

  if (bean.isLightWashed) {
    scores.A7 = recipe.ratio >= 16.5;
    applicable++;
  }

  scores.A8 = Array.isArray(recipe.ssPulseTemperatures) &&
    recipe.ssPulseTemperatures.length === recipe.ssPulsesNumber;
  applicable++;

  scores.A9 = Array.isArray(recipe.batchPulseTemperatures) &&
    recipe.batchPulseTemperatures.length === recipe.batchPulsesNumber;
  applicable++;

  const allTemps = [
    recipe.bloomTemperature,
    ...(recipe.ssPulseTemperatures || []),
    ...(recipe.batchPulseTemperatures || []),
  ];
  scores.A10 = allTemps.every(t => typeof t === 'number' && t >= 50 && t <= 99);
  applicable++;

  if (bean.isPastPeak) {
    scores.A11 = recipe.ratio >= 17.0;
    applicable++;
  }

  scores.A12 = typeof recipe.bloomDuration === 'number' &&
    recipe.bloomDuration >= 1 && recipe.bloomDuration <= 120;
  applicable++;

  const total = Object.values(scores).filter(v => v === true).length;
  return { scores, total, max: Object.keys(scores).length, applicable };
}

function extractJSON(text) {
  const clean = text.replace(/```json|```/g, '').trim();
  const match = clean.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

// ═══════════════════════════════════════════════
// API CALLER
// ═══════════════════════════════════════════════

async function callMini(system, userMsg) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'system', content: system }, { role: 'user', content: userMsg }],
      max_completion_tokens: 2000,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${JSON.stringify(data).slice(0, 200)}`);
  return data.choices?.[0]?.message?.content || '';
}

// ═══════════════════════════════════════════════
// PROMPT VARIATIONS (autoresearch iterations)
// ═══════════════════════════════════════════════

// Each variation adds/modifies ONE thing in the system prompt
// The base prompt is defined, then each variation patches it

const BASE_ADDITIONS = ''; // Round 0: no additions (baseline)

const VARIATIONS = [
  {
    name: 'Round 1: Emphasize valid grind steps + age ratio',
    patch: `

## CRITICAL REMINDERS FOR THIS MODEL

### Grind Steps Must Be EXACT
Your grindRecommendation values MUST be chosen from this EXACT list. Do NOT interpolate or round to values not on this list:
1, 1.1, 1.2, 2, 2.1, 2.2, 3, 3.1, 3.2, 4, 4.1, 4.2, 5, 5.1, 5.2, 6, 6.1, 6.2, 7, 7.1, 7.2, 8, 8.1, 8.2, 9, 9.1, 9.2, 10, 10.1, 10.2, 11
Values like 4.8, 5.6, 3.5, 6.8 are INVALID. Pick the nearest valid step from the list above.

### Past Peak / Fading Beans MUST Have Higher Ratio
If the bean is Past Peak or Fading, the ratio MUST be at least 17.0 (add +0.5 to +1.0 above the family baseline). A ratio of 16.5 or below is WRONG for past peak beans.`,
  },
  {
    name: 'Round 2: Add worked example of valid grind output',
    patch: `

## CRITICAL REMINDERS FOR THIS MODEL

### Grind Steps Must Be EXACT
Pick ONLY from: 1, 1.1, 1.2, 2, 2.1, 2.2, 3, 3.1, 3.2, 4, 4.1, 4.2, 5, 5.1, 5.2, 6, 6.1, 6.2, 7, 7.1, 7.2, 8, 8.1, 8.2, 9, 9.1, 9.2, 10, 10.1, 10.2, 11
WRONG: 4.8, 5.6, 3.5, 6.8 (these are NOT valid Ode Gen 2 steps)
CORRECT example: "grindRecommendation": { "singleServe": 4.2, "batch": 6.2 }

### Past Peak / Fading: Ratio MUST Be >= 17.0
If Peak Status contains "Past Peak" or "Fading": ratio = baseline + 0.5 to +1.0, minimum 17.0. A ratio of 16.5 or below is WRONG for aged beans.`,
  },
  {
    name: 'Round 3: Stronger grind constraint + age example',
    patch: `

## ABSOLUTE CONSTRAINTS (violations = recipe rejected)

1. GRIND VALUES: You may ONLY output grindRecommendation values from this closed set:
   {1, 1.1, 1.2, 2, 2.1, 2.2, 3, 3.1, 3.2, 4, 4.1, 4.2, 5, 5.1, 5.2, 6, 6.1, 6.2, 7, 7.1, 7.2, 8, 8.1, 8.2, 9, 9.1, 9.2, 10, 10.1, 10.2, 11}
   Any other number (4.3, 4.8, 5.3, 5.6, 6.5, 6.8, etc.) will be REJECTED.

2. PAST PEAK AGE ADJUSTMENT: If "Past Peak" or "Fading" appears in Peak Status:
   - ratio MUST be >= 17.0 (even for medium-washed family where baseline is 16)
   - bloomRatio MUST be >= family baseline + 0.5
   Example: Medium washed bean, Past Peak -> ratio: 17.0, bloomRatio: 2.5 (not 16.5/2.0)`,
  },
];

// ═══════════════════════════════════════════════
// RUN A SINGLE ROUND
// ═══════════════════════════════════════════════

async function runRound(baseSystemPrompt, roundName) {
  console.log(`\n  ${'─'.repeat(80)}`);
  console.log(`  ${roundName}`);
  console.log(`  ${'─'.repeat(80)}`);

  let totalPassed = 0;
  let totalApplicable = 0;
  const fails = [];

  for (const bean of TEST_BEANS) {
    const research = getSharedResearch(bean.name);
    if (!research) {
      console.log(`  SKIP ${bean.name}: no shared research`);
      continue;
    }

    let userMsg = `Generate an Aiden brew profile for this coffee:\n\nName: ${bean.name}\nRoaster: ${bean.roaster}\nOrigin: ${bean.origin}\nVariety: ${bean.variety}\nProcess: ${bean.process}\nRoast Date: ${bean.roastDate}\nDays Since Roast: ${bean.daysSinceRoast}\nPeak Status: ${bean.peakStatus}\nBag Notes: ${bean.bagNotes}`;
    userMsg += `\n\n## Research Context\nCup Structure Family: ${research.cupStructureFamily}\nAltitude: ${research.altitude}\nRoast Level: ${research.roastLevel}\nDensity: ${research.densityEstimate}\nFlavor Expectations: ${research.flavorExpectations}`;
    if (research.closestReferenceProfiles?.length) {
      userMsg += '\n\nClosest reference profiles:';
      for (const ref of research.closestReferenceProfiles) {
        userMsg += `\n- #${ref.number} ${ref.name}: ${ref.why}`;
      }
    }

    try {
      const text = await callMini(baseSystemPrompt, userMsg);
      const recipe = extractJSON(text);
      const { scores, total, applicable } = scoreRecipe(recipe, bean);
      totalPassed += total;
      totalApplicable += applicable;

      const failedChecks = Object.entries(scores).filter(([, v]) => v === false).map(([k]) => k);
      const status = failedChecks.length === 0 ? 'PASS' : `FAIL [${failedChecks.join(',')}]`;
      const details = [];
      if (failedChecks.includes('A3')) {
        const gr = recipe?.grindRecommendation;
        details.push(`grind SS:${gr?.singleServe} Batch:${gr?.batch}`);
      }
      if (failedChecks.includes('A11')) {
        details.push(`ratio:${recipe?.ratio}`);
      }
      console.log(`  ${bean.name.padEnd(25)} ${status}${details.length ? ' (' + details.join(', ') + ')' : ''}`);
      if (failedChecks.length) fails.push({ bean: bean.name, checks: failedChecks, recipe });
    } catch (err) {
      console.log(`  ${bean.name.padEnd(25)} ERROR: ${err.message.slice(0, 100)}`);
      totalApplicable += 8; // approximate
    }
  }

  const pct = totalApplicable > 0 ? Math.round((totalPassed / totalApplicable) * 100) : 0;
  console.log(`\n  Score: ${totalPassed}/${totalApplicable} (${pct}%)`);
  return { totalPassed, totalApplicable, pct, fails };
}

// ═══════════════════════════════════════════════
// MAIN — Autoresearch Loop
// ═══════════════════════════════════════════════

async function main() {
  console.log('Autoresearch Iteration Loop — GPT-5.4 Mini Prompt Optimization');
  console.log(`Testing ${VARIATIONS.length + 1} prompt variations x ${TEST_BEANS.length} beans`);
  console.log(`Failure targets: A3 (invalid grind steps), A11 (past peak age adjustment)`);

  const AIDEN_SYSTEM = readFileSync(resolve(__dirname, 'aiden-autoresearch.mjs'), 'utf8')
    .match(/const AIDEN_SYSTEM = `([\s\S]*?)`;/)?.[1];

  if (!AIDEN_SYSTEM) {
    console.error('Could not extract AIDEN_SYSTEM from aiden-autoresearch.mjs');
    process.exit(1);
  }

  const results = [];

  // Round 0: Baseline (no changes)
  console.log('\n' + '='.repeat(80));
  console.log('BASELINE RUN (current prompt, no changes)');
  console.log('='.repeat(80));
  const baseline = await runRound(AIDEN_SYSTEM, 'Round 0: Baseline (no changes)');
  results.push({ round: 0, name: 'Baseline', ...baseline });

  // Iteration rounds
  let bestPct = baseline.pct;
  let bestPrompt = AIDEN_SYSTEM;
  let bestRound = 0;

  for (let i = 0; i < VARIATIONS.length; i++) {
    const v = VARIATIONS[i];
    console.log('\n' + '='.repeat(80));
    console.log(`ITERATION ${i + 1}: ${v.name}`);
    console.log('='.repeat(80));

    const modifiedPrompt = AIDEN_SYSTEM + v.patch;
    const result = await runRound(modifiedPrompt, v.name);
    results.push({ round: i + 1, name: v.name, ...result });

    if (result.pct > bestPct) {
      console.log(`\n  >>> IMPROVEMENT: ${bestPct}% -> ${result.pct}% — KEEPING this change`);
      bestPct = result.pct;
      bestPrompt = modifiedPrompt;
      bestRound = i + 1;
    } else if (result.pct === bestPct && result.fails.length < (results[bestRound]?.fails?.length ?? Infinity)) {
      console.log(`\n  >>> SAME SCORE but fewer failures — KEEPING this change`);
      bestPrompt = modifiedPrompt;
      bestRound = i + 1;
    } else {
      console.log(`\n  >>> NO IMPROVEMENT (${result.pct}% vs best ${bestPct}%) — REVERTING`);
    }
  }

  // Final summary
  console.log('\n' + '='.repeat(80));
  console.log('AUTORESEARCH RESULTS');
  console.log('='.repeat(80));

  console.log('\n  Round-by-round:');
  for (const r of results) {
    const marker = r.round === bestRound ? ' <<<' : '';
    console.log(`  Round ${r.round}: ${r.pct}% — ${r.name}${marker}`);
    if (r.fails.length) {
      for (const f of r.fails) {
        console.log(`    ${f.bean}: ${f.checks.join(', ')}`);
      }
    }
  }

  console.log(`\n  Best round: ${bestRound} (${bestPct}%)`);

  if (bestRound > 0) {
    // Save the winning patch
    const patchPath = resolve(__dirname, 'mini-prompt-patch.txt');
    const patch = VARIATIONS[bestRound - 1].patch;
    writeFileSync(patchPath, patch);
    console.log(`  Winning patch saved to: ${patchPath}`);
    console.log(`\n  Patch content:`);
    console.log(patch);
  } else {
    console.log('  No improvement found. Baseline prompt is already optimal for these test cases.');
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
