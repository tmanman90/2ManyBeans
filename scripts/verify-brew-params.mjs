#!/usr/bin/env node
// Brew parameter verification harness — gates plan 2026-07-19-002 (R1-R15)
// plus re-asserts the Aiden pin (R16 lives in verify-grind-calibration.mjs).
// Text/code assertions on source; functional checks where importable.
// Run: node scripts/verify-brew-params.mjs

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
let failures = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  PASS  ${name}`); }
  catch (e) { failures++; console.error(`  FAIL  ${name}\n        ${e.message.split('\n')[0]}`); }
};

const handbrew = read('src/lib/handbrew.js');
const knowledge = read('src/lib/coffeeKnowledge.js');
const aiden = read('src/lib/aiden.js');

console.log('\n[R1] Family temp bands intersect device range (not replaced)');
check('getDeviceFamilyDefaults intersects family tempC with device tempRange', () => {
  assert.ok(!/if \(config\.tempRange\) \{\s*result\.tempC = `\$\{config\.tempRange\[0\]\}-\$\{config\.tempRange\[1\]\}`;\s*\}/.test(handbrew),
    'device tempRange still REPLACES family tempC (dead-band bug)');
  assert.match(handbrew, /intersectTempBand|intersect.*tempC|Math\.max\(famLo, devLo\)/,
    'no intersection logic found');
});

console.log('\n[R2] Hand-brew troubleshooting directions');
check('sour/weak/astringent no longer conflated to "grind finer"', () => {
  assert.ok(!/Sour\/weak\/astringent.*grind finer/i.test(knowledge), 'conflated line still present');
  assert.match(knowledge, /[Ww]eak[^\n]*(dose|ratio)/, 'weak must route to dose/ratio');
  assert.match(knowledge, /[Aa]stringen[^\n]*coarser/, 'astringent must route to coarser');
});

console.log('\n[R3] Kasuya 4:6 fidelity');
check('Kasuya blocks carry 93C, medium-coarse, ~30s/drain cadence, 4/5-pour variants', () => {
  const kasuyaBlocks = handbrew.match(/[Kk]asuya[^\n]*\n?[^\n]*/g)?.join('\n') || '';
  assert.match(handbrew, /93\s*C|93°C/, 'missing 93C');
  assert.match(handbrew, /medium-coarse/i, 'missing medium-coarse');
  assert.ok(!/5 pours at 45s intervals/.test(handbrew), 'old fixed 45s five-pour text still present');
  assert.match(handbrew, /30s|drain|dry/i, 'missing ~30s / drain cadence');
});

console.log('\n[R4] French press ratio range');
check('french-press ratioRange is [13, 17]', () => {
  const m = handbrew.match(/'french-press':\s*\{[\s\S]*?ratioRange:\s*\[(\d+),\s*(\d+)\]/);
  assert.ok(m, 'french-press ratioRange not found');
  assert.deepEqual([Number(m[1]), Number(m[2])], [13, 17]);
});

console.log('\n[R5] Dark-roast hand-brew family');
check('dark-roast: ratio 1:15.5-1:16.5, temp 88-91, no "wider ratio"', () => {
  const block = handbrew.match(/'dark-roast':\s*\{[\s\S]*?\},/)[0];
  assert.match(block, /1:15\.5[^']*1:16\.5/, 'ratio not 1:15.5 to 1:16.5');
  assert.match(block, /88-91/, 'temp not 88-91');
  assert.ok(!/wider ratio/i.test(block), '"wider ratio" note still present');
});

console.log('\n[R6] Clean-natural hand-brew family');
check('clean-natural-fruit: ratio 1:15.5-1:16.5, temp stays hot (95-98)', () => {
  const block = handbrew.match(/'clean-natural-fruit':\s*\{[\s\S]*?\},/)[0];
  assert.match(block, /1:15\.5[^']*1:16\.5/, 'ratio not updated');
  assert.match(block, /9[4-6]-9[6-8]/, 'temp band not hot');
});

console.log('\n[R7] Aeropress mode-specific ratios');
check('prompt/technique text permits bypass concentrate ~1:6', () => {
  assert.match(handbrew, /1:6|concentrate.*dilute/i, 'no concentrate ratio guidance');
  assert.match(handbrew, /standard[^\n]*1:1[2-8]|1:1[2-8][^\n]*standard/i, 'no standard-mode range');
});

console.log('\n[R8] Attribution honesty');
check('Hoffmann attribution qualified; V60 bloom ~45s staged', () => {
  assert.ok(!/POUR-OVER METHODOLOGY \(from James Hoffmann\)/.test(knowledge), 'blanket attribution still present');
  assert.match(knowledge, /Hoffmann-inspired|app-adapted|Atlas-derived/, 'no qualified attribution');
  assert.match(knowledge, /45\s*s|45s|30-45/, 'bloom duration guidance missing 45s');
});

console.log('\n[R9] Grinder prose: starts vs limits');
check('GRINDER_KNOWLEDGE distinguishes starting points from valid/enforcement ranges', () => {
  assert.match(knowledge, /start(ing)? point|starts?\b[^\n]*enforc|valid range|limits?\b/i, 'no starts-vs-limits language');
});

console.log('\n[R10-R15] Aiden prompt edits (P2)');
check('R10: curve rule is match-reference-shape, no universal mandate', () => {
  assert.ok(!/### Temperature Curve — MANDATORY/.test(aiden), 'curve mandate heading still present');
  assert.match(aiden, /reference profile.{0,80}(shape|curve)|(shape|curve).{0,80}reference profile/is, 'no match-reference-shape rule');
  assert.ok(!/FLAT.{0,40}MANDATORY/is.test(aiden), 'flat must not become a new mandate');
});
check('R11: washed clarity enforcement scoped to light', () => {
  assert.ok(!/if \(isWashed\(bean\)\) \{\s*if \(recipe\.ratio < 16\.5\) recipe\.ratio = 16\.5;/.test(aiden),
    'unscoped all-washed ratio floor still present');
});
check('R12: Kenya override softened to guard floors', () => {
  assert.ok(!/if \(recipe\.ratio < 17\) recipe\.ratio = 17;/.test(aiden), 'Kenya ratio hard floor still present');
});
check('R13: age auto-deltas removed', () => {
  assert.ok(!/Fading \/ Past Peak: ratio \+0\.5/.test(aiden), 'age delta table still present');
  assert.ok(!/Stale: ratio \+1 to \+1\.5/.test(aiden), 'stale delta still present');
});
check('R14: batch pulse fallback = 4', () => {
  assert.match(aiden, /batchPulsesNumber \?\? 4/, 'fallback not unified at 4');
});
check('R15: clean-natural Aiden bloom warmed/shortened', () => {
  const block = aiden.match(/CLEAN NATURAL FRUIT[\s\S]{0,700}/)[0];
  assert.match(block, /94-96°C|94-96C/, 'bloom temp not 94-96');
  assert.match(block, /35-45s/, 'bloom time not 35-45s');
  assert.match(block, /16\.5 to 17\.0|16\.5-17/, 'ratio not 16.5-17.0');
});

console.log('\n[Guard] Aiden deterministic grind + bands untouched (full pin in verify-grind-calibration)');
check('FAMILY_GRIND_BANDS block unchanged', () => {
  assert.match(aiden, /'washed-floral-clarity':\s*\{ ssMin: 3\.2, ssMax: 3\.2, batchMin: 5,\s*batchMax: 6\.2 \}/);
  assert.match(aiden, /'dark-roast':\s*\{ ssMin: 5,\s*ssMax: 9,\s*batchMin: 6,\s*batchMax: 9\.2 \}/);
});
check('deterministic grind enforcement functions present and unmodified in signature', () => {
  assert.match(aiden, /function enforceDeterministicGrind/);
  assert.match(aiden, /nearestOdeStep/);
});

console.log(failures === 0 ? '\nAll brew-param checks passed' : `\n${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
