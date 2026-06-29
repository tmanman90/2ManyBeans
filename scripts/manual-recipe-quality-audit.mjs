import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { scaleRecipeForDose } from '../src/lib/recipeScaling.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function loadHandbrewModule() {
  const tmp = await mkdtemp(path.join(tmpdir(), 'manual-recipe-audit-'));
  const brewMethodsSource = await readFile(path.join(repoRoot, 'src/lib/brewMethods.js'), 'utf8');
  const handbrewSource = await readFile(path.join(repoRoot, 'src/lib/handbrew.js'), 'utf8');

  await writeFile(path.join(tmp, 'brewMethods.mjs'), brewMethodsSource);

  const transformed = handbrewSource
    .replace("import { API_BASE } from './apiBase';", "const API_BASE = '';")
    .replace("import { fetchWithRetry } from './fetchWithRetry';", "const fetchWithRetry = async () => { throw new Error('Network is disabled in manual recipe audit'); };")
    .replace("import { buildBeanDescription } from './beanResearch';", "const buildBeanDescription = () => ({ text: '' });")
    .replace("import { HANDBREW_POUROVER_KNOWLEDGE, getOriginContext } from './coffeeKnowledge';", "const HANDBREW_POUROVER_KNOWLEDGE = ''; const getOriginContext = () => null;")
    .replace("import { classifyFamilyFallback } from './beanFields';", "const classifyFamilyFallback = (_bean, fallback) => fallback;")
    .replace("import { GRINDER_MICRON_SCALES, nearestOdeStep } from './brewMethods';", "import { GRINDER_MICRON_SCALES, nearestOdeStep } from './brewMethods.mjs';");

  const handbrewPath = path.join(tmp, 'handbrew.mjs');
  await writeFile(handbrewPath, transformed);

  try {
    return await import(pathToFileURL(handbrewPath));
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function ratioDivisor(recipe) {
  const match = recipe.ratio?.match(/1:([\d.]+)/);
  return match ? Number(match[1]) : NaN;
}

function lastPositiveWaterTotal(recipe) {
  return (recipe.steps || [])
    .map((step) => step.waterTotal)
    .filter((value) => Number.isFinite(value) && value > 0)
    .at(-1);
}

function firstNumberFrom(regex, text) {
  const match = text?.match(regex);
  return match ? Number(match[1]) : null;
}

function assertDeviceRecipe(recipe, device, configs) {
  const config = configs[device];
  const ratio = ratioDivisor(recipe);
  const expectedMethod = config.type === 'pourover' ? 'pour-over' : config.type;
  assert.equal(recipe.method, expectedMethod, `${device} method does not match device`);
  assert.ok(config.techniques.includes(recipe.technique), `${device} technique is not allowed for device`);
  assert.ok(ratio >= config.ratioRange[0] && ratio <= config.ratioRange[1], `${device} ratio out of range`);
  assert.ok(recipe.waterTemp.celsius >= config.tempRange[0] && recipe.waterTemp.celsius <= config.tempRange[1], `${device} temp out of range`);
  assert.ok(recipe.totalBrewTimeSeconds >= config.minBrewTime, `${device} brew time below min`);
  assert.ok(recipe.totalBrewTimeSeconds <= config.maxBrewTime, `${device} brew time above max`);
  assert.equal(recipe.waterGrams, Math.round(recipe.coffeeGrams * ratio), `${device} water does not match dose x ratio`);
  assert.equal(lastPositiveWaterTotal(recipe), recipe.waterGrams, `${device} final waterTotal does not match waterGrams`);
  assert.equal(recipe.timerReady, true, `${device} timer is not ready`);

  let previous = 0;
  for (const step of recipe.steps || []) {
    if (Number.isFinite(step.waterTotal) && step.waterTotal > 0) {
      assert.ok(step.waterTotal >= previous, `${device} waterTotal went backwards`);
      previous = step.waterTotal;
    }

    const coffeeInAction = firstNumberFrom(/\badd\s+(\d+(?:\.\d+)?)\s*g(?:rams?)?\s+coffee\b/i, step.action);
    if (coffeeInAction != null) {
      assert.equal(coffeeInAction, recipe.coffeeGrams, `${device} action coffee grams stale`);
    }

    const bloomWater = firstNumberFrom(/\bbloom with\s+(\d+(?:\.\d+)?)\s*g(?:rams?)?\s+water\b/i, step.action);
    if (bloomWater != null) {
      assert.equal(bloomWater, step.waterTotal, `${device} bloom action water grams stale`);
    }

    const totalWater = firstNumberFrom(/\b(\d+(?:\.\d+)?)\s*g(?:rams?)?\s+total water\b/i, step.action);
    if (totalWater != null) {
      assert.equal(totalWater, step.waterTotal, `${device} action total water grams stale`);
    }
  }
}

function assertFamilyRecipe(recipe, device, family, roast) {
  const setting = Number(recipe.grindSize?.setting);
  const ratio = ratioDivisor(recipe);
  const isPourover = ['v60', 'kalita', 'chemex'].includes(device);
  const isLightDense =
    roast === 'light' &&
    (family.includes('washed-kenya') || family.includes('washed-ethiopia') || family.includes('washed-floral'));

  if (isLightDense && isPourover) {
    const maxOde = { v60: 4.2, kalita: 4.2, chemex: 6.2 }[device];
    assert.ok(recipe.waterTemp.celsius >= 96, `${device}/${family} too cool for dense light coffee`);
    assert.ok(setting <= maxOde, `${device}/${family} too coarse for dense light coffee`);
  }

  if ((family === 'dark-roast' || roast === 'dark') && isPourover) {
    const minOde = { v60: 6.2, kalita: 6.2, chemex: 7.2 }[device];
    const maxTemp = { v60: 93, kalita: 93, chemex: 96 }[device];
    assert.ok(setting >= minOde, `${device}/${family} too fine for dark coffee`);
    assert.ok(recipe.waterTemp.celsius <= maxTemp, `${device}/${family} too hot for dark coffee`);
    assert.ok(ratio >= 17, `${device}/${family} ratio too tight for dark pour-over`);
  }

  if (device === 'french-press') {
    assert.equal(recipe.technique, 'hoffmann-french-press');
    assert.ok(recipe.totalBrewTimeSeconds >= 540 && recipe.totalBrewTimeSeconds <= 720);
  }
}

function sampleRecipe(overrides = {}) {
  return {
    method: 'pour-over',
    technique: 'center-pour',
    coffeeGrams: 18,
    waterGrams: 288,
    ratio: '1:16',
    grindSize: { setting: '4.2', description: 'Medium-fine', microns: 594 },
    waterTemp: { celsius: 95, fahrenheit: 203 },
    steps: [
      { time: '0:00', action: 'Add 18g coffee and level the bed.', waterTotal: 0 },
      { time: '0:30', action: 'Bloom with 36g water.', waterTotal: 36 },
      { time: '1:15', action: 'Pour to 150g total water.', waterTotal: 150 },
      { time: '2:00', action: 'Continue to 240g total water.', waterTotal: 240 },
      { time: '2:30', action: 'Finish to 288g total water.', waterTotal: 288 },
      { time: '3:00', action: 'Allow drawdown to complete.', waterTotal: 288 },
    ],
    totalBrewTime: '3:15',
    title: 'Audit recipe',
    tips: '',
    reasoning: '',
    ...overrides,
  };
}

function runDoseScalingRegression() {
  const scaled = scaleRecipeForDose(sampleRecipe(), 21);

  assert.equal(scaled.coffeeGrams, 21);
  assert.equal(scaled.waterGrams, 336);
  assert.deepEqual(scaled.steps.map((step) => step.waterTotal), [0, 42, 175, 280, 336, 336]);
  assert.match(scaled.steps[0].action, /21g coffee/);
  assert.match(scaled.steps[1].action, /42g water/);
  assert.match(scaled.steps[2].action, /175g total water/);
  assert.match(scaled.steps[3].action, /280g total water/);
  assert.match(scaled.steps[4].action, /336g total water/);
}

function runRepairRegressions({ repairHandBrewRecipe, BREW_DEVICE_CONFIGS }) {
  const scenarios = [
    {
      name: 'kalita light washed Kenya does not ship at Ode 5',
      device: 'kalita',
      family: 'washed-kenya-clarity',
      roast: 'light',
      recipe: sampleRecipe({
        coffeeGrams: 21,
        waterGrams: 350,
        grindSize: { setting: '5', description: 'Medium-fine', microns: 650 },
        totalBrewTime: '2:20',
      }),
      verify(recipe) {
        assert.equal(recipe.grindSize.setting, '4.2');
        assert.equal(recipe.waterGrams, 336);
        assert.equal(recipe.totalBrewTime, '3:36');
      },
    },
    {
      name: 'v60 light washed recipes stay extracted and coherent',
      device: 'v60',
      family: 'washed-ethiopia-clarity',
      roast: 'light',
      recipe: sampleRecipe({
        ratio: '1:19',
        waterGrams: 300,
        grindSize: { setting: '5.1', description: 'Medium', microns: 665 },
        waterTemp: { celsius: 101, fahrenheit: 214 },
        totalBrewTime: '2:00',
      }),
      verify(recipe) {
        assert.equal(recipe.ratio, '1:18');
        assert.equal(recipe.grindSize.setting, '4.2');
        assert.equal(recipe.waterTemp.celsius, 100);
      },
    },
    {
      name: 'dark v60 recipes avoid hot fine over-extraction',
      device: 'v60',
      family: 'dark-roast',
      roast: 'dark',
      recipe: sampleRecipe({
        coffeeGrams: 20,
        ratio: '1:15',
        waterGrams: 300,
        grindSize: { setting: '4.2', description: 'Medium-fine', microns: 594 },
        waterTemp: { celsius: 98, fahrenheit: 208 },
      }),
      verify(recipe) {
        assert.equal(recipe.ratio, '1:17');
        assert.equal(recipe.waterGrams, 340);
        assert.equal(recipe.grindSize.setting, '6.2');
        assert.equal(recipe.waterTemp.celsius, 93);
      },
    },
    {
      name: 'chemex allows coarser grind but clamps long brews',
      device: 'chemex',
      family: 'washed-floral-clarity',
      roast: 'light',
      recipe: sampleRecipe({
        coffeeGrams: 30,
        waterGrams: 470,
        grindSize: { setting: '7', description: 'Medium-coarse', microns: 760 },
        waterTemp: { celsius: 94, fahrenheit: 201 },
        totalBrewTime: '7:00',
      }),
      verify(recipe) {
        assert.equal(recipe.grindSize.setting, '6.2');
        assert.equal(recipe.waterTemp.celsius, 96);
        assert.equal(recipe.totalBrewTime, '6:00');
      },
    },
    {
      name: 'aeropress keeps short pressure brews inside method bounds',
      device: 'aeropress',
      family: 'clean-natural-fruit',
      roast: 'medium',
      recipe: sampleRecipe({
        method: 'immersion-pressure',
        technique: 'standard',
        coffeeGrams: 17,
        waterGrams: 240,
        ratio: '1:12',
        grindSize: { setting: '3.1', description: 'Fine-medium', microns: 520 },
        waterTemp: { celsius: 78, fahrenheit: 172 },
        steps: [
          { time: '0:00', action: 'Add coffee and water.', waterTotal: 204 },
          { time: '0:35', action: 'Stir and press.', waterTotal: 204 },
        ],
        totalBrewTime: '0:40',
      }),
      verify(recipe) {
        assert.equal(recipe.waterTemp.celsius, 80);
        assert.equal(recipe.totalBrewTime, '0:50');
      },
    },
    {
      name: 'french press preserves Hoffmann long-settle method',
      device: 'french-press',
      family: 'medium-washed',
      roast: 'medium',
      recipe: sampleRecipe({
        method: 'full-immersion',
        technique: 'hoffmann-french-press',
        coffeeGrams: 30,
        waterGrams: 360,
        ratio: '1:12',
        grindSize: { setting: '5.2', description: 'Medium', microns: 650 },
        steps: [
          { time: '0:00', action: 'Add all water.', waterTotal: 360 },
          { time: '4:00', action: 'Break crust and skim foam.', waterTotal: 360 },
          { time: '8:00', action: 'Pour gently without plunging fully.', waterTotal: 360 },
        ],
        totalBrewTime: '8:00',
      }),
      verify(recipe) {
        assert.equal(recipe.ratio, '1:13');
        assert.equal(recipe.waterGrams, 390);
        assert.equal(recipe.totalBrewTime, '12:00');
      },
    },
  ];

  for (const scenario of scenarios) {
    const recipe = clone(scenario.recipe);
    repairHandBrewRecipe(recipe, 'fellow-ode-gen2', scenario.family, scenario.roast, scenario.device);
    assertDeviceRecipe(recipe, scenario.device, BREW_DEVICE_CONFIGS);
    scenario.verify(recipe);
  }
}

function representativeCandidate({ device, family, roast }) {
  const method = device === 'aeropress'
    ? 'immersion-pressure'
    : device === 'french-press'
      ? 'full-immersion'
      : 'pour-over';
  const technique = {
    v60: 'hoffmann',
    kalita: 'center-pour',
    chemex: 'hoffmann-chemex',
    aeropress: 'standard',
    'french-press': 'hoffmann-french-press',
  }[device];

  const candidate = sampleRecipe({
    method,
    technique,
    coffeeGrams: device === 'chemex' ? 30 : 18,
    ratio: '1:16',
    waterTemp: { celsius: 95, fahrenheit: 203 },
    grindSize: { setting: '5', description: 'Medium', microns: 650 },
  });

  if (device === 'aeropress') {
    Object.assign(candidate, {
      ratio: '1:12',
      steps: [
        { time: '0:00', action: 'Add 18g coffee and water.', waterTotal: 216 },
        { time: '1:30', action: 'Stir and press.', waterTotal: 216 },
      ],
      totalBrewTime: '2:00',
    });
  }

  if (device === 'french-press') {
    Object.assign(candidate, {
      ratio: '1:14',
      grindSize: { setting: '4.2', description: 'Medium', microns: 594 },
      steps: [
        { time: '0:00', action: 'Add 18g coffee and all water.', waterTotal: 252 },
        { time: '4:00', action: 'Break crust and skim foam.', waterTotal: 252 },
        { time: '9:00', action: 'Pour gently without plunging fully.', waterTotal: 252 },
      ],
      totalBrewTime: '10:00',
    });
  }

  if (family === 'dark-roast' || roast === 'dark') {
    candidate.ratio = '1:15';
    candidate.waterTemp = { celsius: 98, fahrenheit: 208 };
    candidate.grindSize = { setting: '4.2', description: 'Medium-fine', microns: 594 };
  }

  return candidate;
}

function runRepresentativeMatrix({ repairHandBrewRecipe, BREW_DEVICE_CONFIGS }) {
  const devices = ['v60', 'kalita', 'chemex', 'aeropress', 'french-press'];
  const beans = [
    { family: 'washed-kenya-clarity', roast: 'light' },
    { family: 'washed-ethiopia-clarity', roast: 'light' },
    { family: 'clean-natural-fruit', roast: 'medium-light' },
    { family: 'medium-washed', roast: 'medium' },
    { family: 'dark-roast', roast: 'dark' },
  ];

  for (const bean of beans) {
    for (const device of devices) {
      const recipe = representativeCandidate({ device, ...bean });
      repairHandBrewRecipe(recipe, 'fellow-ode-gen2', bean.family, bean.roast, device);
      assertDeviceRecipe(recipe, device, BREW_DEVICE_CONFIGS);
      assertFamilyRecipe(recipe, device, bean.family, bean.roast);
    }
  }
}

async function runHistoricalGenerationCorpus({ repairHandBrewRecipe, BREW_DEVICE_CONFIGS }) {
  const corpusPath = path.join(repoRoot, 'scripts/model-cost-results-2026-04-05T16-47-25.json');
  const corpus = JSON.parse(await readFile(corpusPath, 'utf8'));
  let checked = 0;

  for (let i = 0; i < corpus.handbrewResults.length; i++) {
    const bean = corpus.beans[i];
    const family = bean.expectedFamily;
    const roast = family === 'dark-roast'
      ? 'dark'
      : family === 'medium-washed'
        ? 'medium'
        : 'light';

    for (const result of Object.values(corpus.handbrewResults[i])) {
      if (!result?.success || !result.recipe?.steps) continue;
      const recipe = clone(result.recipe);
      repairHandBrewRecipe(recipe, 'fellow-ode-gen2', family, roast, 'v60');
      assertDeviceRecipe(recipe, 'v60', BREW_DEVICE_CONFIGS);
      assertFamilyRecipe(recipe, 'v60', family, roast);
      checked += 1;
    }
  }

  assert.ok(checked >= 20, `historical generation corpus too small: ${checked}`);
}

const handbrew = await loadHandbrewModule();
runDoseScalingRegression();
runRepairRegressions(handbrew);
runRepresentativeMatrix(handbrew);
await runHistoricalGenerationCorpus(handbrew);

console.log('Manual recipe quality audit passed');
