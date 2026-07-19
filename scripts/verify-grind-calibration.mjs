#!/usr/bin/env node
// Grind calibration verification harness
//
// Guards the 2026-07 recalibration (Honest Coffee Guide measured ranges):
//  1. Functional anchors on the single source of truth (brewMethods.js)
//  2. Codebase consistency scan — no stray micron formulas or legacy scales
//  3. Hand-brew floor math (Kalita fines-aware starts) via extracted tables
//  4. Aiden regression guard — FAMILY_GRIND_BANDS and the deterministic
//     grind path must NOT change (Tal's Aiden recipes are dialed in)
//
// Run: node scripts/verify-grind-calibration.mjs

import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GRINDER_MICRON_SCALES,
  odeStepToMicrons,
  grinderSettingToMicrons,
  odeStepToGrinderSetting,
  descriptorForMicrons,
} from '../src/lib/brewMethods.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
let failures = 0;
const check = (name, fn) => {
  try {
    fn();
    console.log(`  PASS  ${name}`);
  } catch (e) {
    failures++;
    console.error(`  FAIL  ${name}\n        ${e.message}`);
  }
};

console.log('\n[1] Calibration anchors (single source of truth)');

check('Ode Gen 2: 275µm at 1, 1160µm at 11 (HCG measured range)', () => {
  assert.equal(odeStepToMicrons(1), 275);
  assert.equal(odeStepToMicrons(11), 1160);
});
check('Ode Gen 2 setting 5 ≈ 630µm (bottom of Kalita 600-700 window)', () => {
  assert.ok(Math.abs(odeStepToMicrons(5) - 630) <= 10);
});
check('Ode Gen 2 setting 7 ≈ 800µm (tylerxcoffee real-world anchor)', () => {
  assert.ok(Math.abs(odeStepToMicrons(7) - 800) <= 15);
});
check('Opus range 230-1160 over dial 1-11', () => {
  assert.equal(grinderSettingToMicrons(1, 'fellow-opus'), 230);
  assert.equal(grinderSettingToMicrons(11, 'fellow-opus'), 1160);
});
check('Comandante ~30µm/click', () => {
  assert.equal(grinderSettingToMicrons(22, 'comandante-c40'), 660);
});
check('Cross-grinder translation roundtrips within one native step', () => {
  for (const key of Object.keys(GRINDER_MICRON_SCALES)) {
    if (key === 'fellow-ode-gen2') continue;
    const src = odeStepToMicrons(5.1);
    const { setting } = odeStepToGrinderSetting(5.1, key);
    const numeric = typeof setting === 'string'
      ? (key === '1zpresso-jx-pro'
        ? setting.split('.').reduce((acc, part, i) => acc + Number(part) * [40, 10, 1][i], 0)
        : parseFloat(setting))
      : setting;
    const back = grinderSettingToMicrons(numeric, key);
    assert.ok(
      Math.abs(back - src) <= GRINDER_MICRON_SCALES[key].perStep + 1,
      `${key}: ${src}µm -> ${setting} -> ${back}µm`
    );
  }
});
check('Descriptor bands stable', () => {
  assert.equal(descriptorForMicrons(629), 'Medium');
  assert.equal(descriptorForMicrons(720), 'Medium-Coarse');
  assert.equal(descriptorForMicrons(450), 'Medium-Fine');
});

console.log('\n[2] Codebase consistency scan');

const collectSrcFiles = (dir, out = []) => {
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = join(dir, name);
    const st = statSync(join(ROOT, rel));
    if (st.isDirectory()) collectSrcFiles(rel, out);
    else if (/\.(jsx?|mjs)$/.test(name)) out.push(rel);
  }
  return out;
};
const srcFiles = collectSrcFiles('src');

check('GRINDER_MICRON_SCALES defined exactly once (brewMethods.js)', () => {
  const defs = srcFiles.filter((f) => /export const GRINDER_MICRON_SCALES/.test(read(f)));
  assert.deepEqual(defs, [join('src', 'lib', 'brewMethods.js')]);
});

check('odeStepToMicrons defined exactly once and derives from the table', () => {
  const defs = srcFiles.filter((f) => /function odeStepToMicrons/.test(read(f)));
  assert.equal(defs.length, 1);
  assert.match(read(defs[0]), /odeStepToMicrons\(step\) \{\s*return grinderSettingToMicrons\(step, 'fellow-ode-gen2'\)/);
});

check('No legacy micron scales anywhere in src/', () => {
  const legacy = [/base:\s*200,\s*perStep:\s*70/, /200 \+ \(step - 1\) \* 70/, /base:\s*150,\s*perStep:\s*150/, /400-500 microns\. Medium: 500-650/];
  for (const f of srcFiles) {
    const text = read(f);
    for (const pat of legacy) {
      assert.ok(!pat.test(text), `legacy scale pattern ${pat} found in ${f}`);
    }
  }
});

check('No raw aidenGrind/grindRecommendation steps rendered in UI', () => {
  for (const f of srcFiles.filter((x) => x.includes('components'))) {
    const text = read(f);
    assert.ok(
      !/value=\{(?:iced)?[rR]ecipe\.grindRecommendation\.(singleServe|batch)\}/.test(text),
      `raw grindRecommendation render in ${f}`
    );
  }
});

check('Hand-brew repair reconciles microns with setting', () => {
  const text = read('src/lib/handbrew.js');
  assert.match(text, /grinderSettingToMicrons\(finalSetting, grinderKey\)/);
  assert.match(text, /recipe\.grindSize\.microns = trueMicrons/);
});

console.log('\n[3] Hand-brew floor math (extracted from handbrew.js)');

const handbrewText = read('src/lib/handbrew.js');
const extractObject = (text, marker) => {
  const start = text.indexOf(marker);
  assert.ok(start !== -1, `${marker} not found`);
  const braceStart = text.indexOf('{', start);
  let depth = 0;
  for (let i = braceStart; i < text.length; i++) {
    if (text[i] === '{') depth++;
    if (text[i] === '}') depth--;
    if (depth === 0) return new Function(`return ${text.slice(braceStart, i + 1)}`)();
  }
  throw new Error(`unbalanced braces after ${marker}`);
};
const starts = extractObject(handbrewText, 'const GRINDER_POUROVER_STARTS');
const devices = extractObject(handbrewText, 'export const BREW_DEVICE_CONFIGS');

const floorFor = (grinderKey, tier, device, highFines) => {
  const grinder = starts[grinderKey];
  const config = devices[device];
  let rawOffset = config?.grindOffset || 0;
  if (config?.restrictedFlow && highFines) rawOffset += 0.5;
  const odePerStep = GRINDER_MICRON_SCALES['fellow-ode-gen2'].perStep;
  const targetPerStep = GRINDER_MICRON_SCALES[grinderKey]?.perStep || odePerStep;
  const adjusted = Math.round((grinder.pourOverStart[tier] + (rawOffset * odePerStep) / targetPerStep) * 10) / 10;
  const floor = config?.type === 'immersion-pressure' ? 1 : grinder.validRange.min;
  return Math.max(floor, Math.min(grinder.validRange.max, adjusted));
};

check('Kalita + dense washed light on Ode Gen 2 starts at 6.0 (~715µm)', () => {
  assert.equal(floorFor('fellow-ode-gen2', 'light', 'kalita', true), 6);
  assert.ok(Math.abs(grinderSettingToMicrons(6, 'fellow-ode-gen2') - 715) <= 15);
});
check('Kalita + natural light on Ode Gen 2 starts at 5.5', () => {
  assert.equal(floorFor('fellow-ode-gen2', 'light', 'kalita', false), 5.5);
});
check('V60 light start unchanged at 4.5 (research-validated)', () => {
  assert.equal(floorFor('fellow-ode-gen2', 'light', 'v60', true), 4.5);
});
check('Kalita config: restrictedFlow, +1.0 offset, drawdown target present', () => {
  assert.equal(devices.kalita.restrictedFlow, true);
  assert.equal(devices.kalita.grindOffset, 1.0);
  assert.equal(devices.kalita.drawdownTarget, '3:00-3:45');
});
check('Opus pour-over range widened to 3-8.5 (HCG)', () => {
  assert.equal(starts['fellow-opus'].validRange.max, 8.5);
});

console.log('\n[4] Aiden regression guard (dialed-in recipes must not move)');

const aidenText = read('src/lib/aiden.js');
check('FAMILY_GRIND_BANDS unchanged (exact pinned values)', () => {
  const bands = extractObject(aidenText, 'const FAMILY_GRIND_BANDS');
  assert.deepEqual(bands['washed-floral-clarity'], { ssMin: 3.2, ssMax: 3.2, batchMin: 5, batchMax: 6.2 });
  assert.deepEqual(bands['clean-natural-fruit'], { ssMin: 4.2, ssMax: 4.2, batchMin: 6.2, batchMax: 6.2 });
  assert.deepEqual(bands['processed-clarity'], { ssMin: 4.2, ssMax: 5, batchMin: 6.2, batchMax: 7.1 });
  assert.deepEqual(bands['generic-washed'], { ssMin: 4.2, ssMax: 5.2, batchMin: 6, batchMax: 7.2 });
  assert.deepEqual(bands['dark-roast'], { ssMin: 5, ssMax: 9, batchMin: 6, batchMax: 9.2 });
});
check('Aiden grind path stays dial-native (no micron imports)', () => {
  assert.ok(!/GRINDER_MICRON_SCALES|odeStepToMicrons|grinderSettingToMicrons/.test(aidenText));
});

console.log('\n[5] AI knowledge blocks agree with calibration');

const knowledgeText = read('src/lib/coffeeKnowledge.js');
check('GRINDER_KNOWLEDGE carries corrected Ode calibration + flat-bed rule', () => {
  assert.match(knowledgeText, /~275µm at 1/);
  assert.match(knowledgeText, /Flat-bed brewers \(Kalita\) run COARSER/);
});
check('Troubleshooting rules include the stall rule', () => {
  assert.match(knowledgeText, /Stalled \/ choked pour-over/);
});

console.log(failures === 0 ? '\nAll grind calibration checks passed' : `\n${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
