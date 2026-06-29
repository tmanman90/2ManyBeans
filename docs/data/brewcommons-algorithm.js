/* ============================================
   Brew Profiles — Fellow Ode 2 + Aiden
   Application Logic & Recommendation Engine
   ============================================ */

(function () {
  'use strict';

  // ── Ode 2 Grind System ────────────────────────────────
  //
  // The Fellow Ode 2 dial has major numbers 1–11, each with
  // three sub-steps: .0, .1, .2
  //
  // So: 1.0, 1.1, 1.2, 2.0, 2.1, 2.2, … 11.0, 11.1, 11.2
  // Total: 33 discrete positions (step index 0–32)
  //
  // Based on Fellow Ode 2 Gen 2 calibration chart:
  // Setting 1 ≈ 150μm, Setting 11 ≈ 1500μm
  // ~45 microns per step across 30 steps
  //
  // microns(step) = 150 + step * 45

  const GRIND_BASE_MICRONS = 150;
  const GRIND_MICRONS_PER_STEP = 45;
  const GRIND_MIN_STEP = 6;   // 3.0 (~420μm) - Fellow's practical minimum
  const GRIND_MAX_STEP = 32;  // 11.2

  function stepToDisplay(step) {
    step = Math.round(step);
    step = Math.max(GRIND_MIN_STEP, Math.min(GRIND_MAX_STEP, step));
    const major = Math.floor(step / 3) + 1;
    const sub = step % 3;
    return `${major}.${sub}`;
  }

  function stepToMicrons(step) {
    step = Math.max(GRIND_MIN_STEP, Math.min(GRIND_MAX_STEP, step));
    return Math.round(GRIND_BASE_MICRONS + step * GRIND_MICRONS_PER_STEP);
  }

  // ── State ──────────────────────────────────────────────
  const state = {
    roast: 'medium',
    origin: 'ethiopia',
    varieties: [],         // Array of selected variety keys
    peaberry: false,       // Peaberry toggle
    decaf: false,          // Decaf toggle
    processing: 'washed',
    elevation: 1400,
    brewSize: 'single',
    sliders: {
      fruit: 50,     // 0 = fruity, 100 = chocolatey
      body: 50,      // 0 = light, 100 = full
      acidity: 50,   // 0 = bright, 100 = smooth
      floral: 50,    // 0 = floral, 100 = nutty
      strength: 50   // 0 = delicate, 100 = bold
    }
  };

  // ── DOM References ─────────────────────────────────────
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const roastBtns = $$('#roastSelector .roast-btn');
  const originSelect = $('#beanOrigin');
  const varietySelect = $('#beanVariety');
  const varietyTagsContainer = $('#varietyTags');
  const peaberryCheck = $('#peaberryCheck');
  const decafCheck = $('#decafCheck');
  const processingBtns = $$('#processingSelector .pill-btn');
  const elevationInput = $('#elevationInput');
  const elevationPresetBtns = $$('#elevationPresets .elevation-preset-btn');
  const brewSizeBtns = $$('#brewSizeSelector .pill-btn');
  const generateBtn = $('#generateBtn');
  const outputPlaceholder = $('#outputPlaceholder');
  const outputResults = $('#outputResults');
  const saveBtn = $('#saveProfileBtn');
  const resetBtn = $('#resetBtn');
  const savedSection = $('#savedSection');
  const savedGrid = $('#savedGrid');

  // ── Recommendation Data ────────────────────────────────

  // Roast level base profiles (grind values now in step-index units, 0–32)
  // Calibrated for Fellow Ode 2 Gen 2 + Aiden single-serve cone:
  //   Light roasts are DENSE → need FINER grind for extraction
  //   Dark roasts are POROUS → extract easily, can go COARSER
  //   Note: Rare to go below 4.0 in practice
  //
  //   Light: 4.1–5.0  → steps 10–12 (finest, user-validated)
  //   Med:   5.0–6.0  → steps 12–15
  //   Dark:  5.2–6.2  → steps 14–17 (coarsest)
  const roastProfiles = {
    'light': {
      grindStepMin: 10, grindStepMax: 12,  // 4.1–5.0 (dense beans, user-validated)
      tempF: 205, tempMax: 205, ratio: 17, bloomRatio: 3,
      bloomDurationSingle: 45, bloomDurationBatch: 35,
      bloomTempF: 205,
      pulsesSingle: 4, pulsesBatch: 5,
      pulseInterval: 23,
      pulseTempDecline: [203, 200, 198, 196],
      pulseTempDeclineBatch: [205, 203, 200, 198, 196]
    },
    'medium-light': {
      grindStepMin: 11, grindStepMax: 14,  // 4.2–5.2
      tempF: 203, tempMax: 205, ratio: 16.5, bloomRatio: 3,
      bloomDurationSingle: 38, bloomDurationBatch: 32,
      bloomTempF: 203,
      pulsesSingle: 3, pulsesBatch: 4,
      pulseInterval: 23,
      pulseTempDecline: [201, 198, 196],
      pulseTempDeclineBatch: [203, 201, 198, 196]
    },
    'medium': {
      grindStepMin: 12, grindStepMax: 15,  // 5.0–6.0
      tempF: 200, tempMax: 203, ratio: 16, bloomRatio: 2,
      bloomDurationSingle: 30, bloomDurationBatch: 30,
      bloomTempF: 200,
      pulsesSingle: 3, pulsesBatch: 3,
      pulseInterval: 23,
      pulseTempDecline: [198, 196, 194],
      pulseTempDeclineBatch: [200, 198, 196]
    },
    'medium-dark': {
      grindStepMin: 13, grindStepMax: 16,  // 5.1–6.1
      tempF: 198, tempMax: 200, ratio: 15.5, bloomRatio: 2,
      bloomDurationSingle: 30, bloomDurationBatch: 28,
      bloomTempF: 198,
      pulsesSingle: 3, pulsesBatch: 2,
      pulseInterval: 23,
      pulseTempDecline: [195, 192, 190],
      pulseTempDeclineBatch: [195, 192]
    },
    'dark': {
      grindStepMin: 14, grindStepMax: 17,  // 5.2–6.2 (porous beans, coarser ok)
      tempF: 190, tempMax: 195, ratio: 15.5, bloomRatio: 2,
      bloomDurationSingle: 30, bloomDurationBatch: 25,
      bloomTempF: 190,
      pulsesSingle: 3, pulsesBatch: 1,
      pulseInterval: 23,
      pulseTempDecline: [188, 185, 183],
      pulseTempDeclineBatch: [190]
    }
  };

  // Origin adjustments (deltas — grindStepDelta is in step units)
  const originAdjustments = {
    'ethiopia':    { tempDelta: +1, grindStepDelta: 0,  ratioDelta: +0.5 },
    'kenya':       { tempDelta: +1, grindStepDelta: 0,  ratioDelta: +0.5 },
    'rwanda':      { tempDelta: +1, grindStepDelta: 0,  ratioDelta: 0 },
    'yemen':       { tempDelta: 0,  grindStepDelta: 0,  ratioDelta: 0 },
    'colombia':    { tempDelta: 0,  grindStepDelta: 0,  ratioDelta: 0 },
    'guatemala':   { tempDelta: 0,  grindStepDelta: 0,  ratioDelta: 0 },
    'costa-rica':  { tempDelta: 0,  grindStepDelta: 0,  ratioDelta: 0 },
    'honduras':    { tempDelta: 0,  grindStepDelta: 0,  ratioDelta: 0 },
    'panama':      { tempDelta: 0,  grindStepDelta: 0,  ratioDelta: 0 },
    'peru':        { tempDelta: 0,  grindStepDelta: 0,  ratioDelta: 0 },
    'mexico':      { tempDelta: 0,  grindStepDelta: 0,  ratioDelta: 0 },
    'brazil':      { tempDelta: -1, grindStepDelta: +1, ratioDelta: -0.5 },
    'indonesia':   { tempDelta: -2, grindStepDelta: +2, ratioDelta: -0.5 },
    'blend':       { tempDelta: 0,  grindStepDelta: 0,  ratioDelta: 0 }
  };

  // Bean variety adjustments (grindStepDelta in step units, tempDelta in °F)
  // Each variety maps to its group defaults, with per-variety overrides where needed.
  const varietyGroupDefaults = {
    'ethiopian-landrace': { grindStepDelta: -2, tempDelta: +2, ratioDelta: +0.5, bloomDelta: +5, pulseDelta: +1 },
    'bourbon':            { grindStepDelta: 0,  tempDelta: +1, ratioDelta: 0,    bloomDelta: 0,  pulseDelta: 0 },
    'typica':             { grindStepDelta: 0,  tempDelta: 0,  ratioDelta: 0,    bloomDelta: 0,  pulseDelta: 0 },
    'gesha':              { grindStepDelta: -2, tempDelta: +2, ratioDelta: +1.0, bloomDelta: +10, pulseDelta: +1 },
    'sl':                 { grindStepDelta: -3, tempDelta: +2, ratioDelta: +0.5, bloomDelta: +5, pulseDelta: 0 },
    'catuai':             { grindStepDelta: 0,  tempDelta: 0,  ratioDelta: 0,    bloomDelta: 0,  pulseDelta: 0 },
    'catimor-sarchimor':  { grindStepDelta: +1, tempDelta: -1, ratioDelta: 0,    bloomDelta: 0,  pulseDelta: 0 },
    'pacamara':           { grindStepDelta: +1, tempDelta: +1, ratioDelta: 0,    bloomDelta: +5, pulseDelta: 0 },
    'f1-modern':          { grindStepDelta: 0,  tempDelta: 0,  ratioDelta: 0,    bloomDelta: 0,  pulseDelta: 0 },
    'not-listed':         { grindStepDelta: 0,  tempDelta: 0,  ratioDelta: 0,    bloomDelta: 0,  pulseDelta: 0 }
  };

  // Map each individual variety value to its group key
  const varietyToGroup = {
    // Ethiopian Landrace
    'ethiopian-landrace': 'ethiopian-landrace',
    'jarc-74158': 'ethiopian-landrace',
    'jarc-74110': 'ethiopian-landrace',
    'jarc-74112': 'ethiopian-landrace',
    'kurume': 'ethiopian-landrace',
    'dega': 'ethiopian-landrace',
    'wush-wush': 'ethiopian-landrace',
    // Bourbon
    'red-bourbon': 'bourbon',
    'yellow-bourbon': 'bourbon',
    'pink-bourbon': 'bourbon',
    'orange-bourbon': 'bourbon',
    'caturra': 'bourbon',
    'villa-sarchi': 'bourbon',
    'pacas': 'bourbon',
    // Typica
    'typica': 'typica',
    'kona': 'typica',
    'blue-mountain': 'typica',
    'maragogipe': 'typica',
    'mundo-novo': 'typica',
    'java': 'typica',
    // Gesha
    'gesha': 'gesha',
    // SL
    'sl28': 'sl',
    'sl34': 'sl',
    // Catuai
    'red-catuai': 'catuai',
    'yellow-catuai': 'catuai',
    // Pacamara
    'pacamara': 'pacamara',
    'maracaturra': 'pacamara',
    // Catimor / Sarchimor
    'catimor': 'catimor-sarchimor',
    'sarchimor': 'catimor-sarchimor',
    'castillo': 'catimor-sarchimor',
    'parainema': 'catimor-sarchimor',
    'ruiru-11': 'catimor-sarchimor',
    'obata': 'catimor-sarchimor',
    'marsellesa': 'catimor-sarchimor',
    // F1 / Modern
    'centroamericano': 'f1-modern',
    'starmaya': 'f1-modern',
    'batian': 'f1-modern',
    'tabi': 'f1-modern',
    // Other
    'not-listed': 'not-listed'
  };

  // Per-variety overrides for varieties that deviate from their group
  const varietyOverrides = {
    'pink-bourbon':  { grindStepDelta: -2, tempDelta: +2, ratioDelta: +0.5, bloomDelta: +5, pulseDelta: +1 },
    'maragogipe':    { grindStepDelta: +1, tempDelta: -1, ratioDelta: 0,    bloomDelta: 0,  pulseDelta: 0 },
    'kona':          { grindStepDelta: +1, tempDelta: -1, ratioDelta: 0,    bloomDelta: 0,  pulseDelta: 0 },
    'castillo':      { grindStepDelta: 0,  tempDelta: 0,  ratioDelta: 0,    bloomDelta: 0,  pulseDelta: 0 },
    'tabi':          { grindStepDelta: 0,  tempDelta: +1, ratioDelta: 0,    bloomDelta: 0,  pulseDelta: 0 },
    'ruiru-11':      { grindStepDelta: -1, tempDelta: +1, ratioDelta: 0,    bloomDelta: 0,  pulseDelta: 0 },
    'batian':        { grindStepDelta: -1, tempDelta: 0,  ratioDelta: 0,    bloomDelta: 0,  pulseDelta: 0 }
  };

  // Get adjustment for a single variety
  function getSingleVarietyAdjustment(varietyKey) {
    if (varietyOverrides[varietyKey]) {
      return varietyOverrides[varietyKey];
    }
    const group = varietyToGroup[varietyKey] || 'not-listed';
    return varietyGroupDefaults[group] || varietyGroupDefaults['not-listed'];
  }

  // Get combined adjustment for multiple varieties (averaged)
  function getVarietyAdjustment(varieties) {
    if (!varieties || varieties.length === 0) {
      return { grindStepDelta: 0, tempDelta: 0, ratioDelta: 0, bloomDelta: 0, pulseDelta: 0 };
    }

    const totals = { grindStepDelta: 0, tempDelta: 0, ratioDelta: 0, bloomDelta: 0, pulseDelta: 0 };

    varieties.forEach(v => {
      const adj = getSingleVarietyAdjustment(v);
      totals.grindStepDelta += adj.grindStepDelta || 0;
      totals.tempDelta += adj.tempDelta || 0;
      totals.ratioDelta += adj.ratioDelta || 0;
      totals.bloomDelta += adj.bloomDelta || 0;
      totals.pulseDelta += adj.pulseDelta || 0;
    });

    const count = varieties.length;
    return {
      grindStepDelta: Math.round(totals.grindStepDelta / count),
      tempDelta: Math.round(totals.tempDelta / count),
      ratioDelta: Math.round((totals.ratioDelta / count) * 2) / 2, // Round to 0.5
      bloomDelta: Math.round(totals.bloomDelta / count),
      pulseDelta: Math.round(totals.pulseDelta / count)
    };
  }

  // Peaberry adjustment (denser than regular beans)
  const peaberryAdjustment = {
    grindStepDelta: -2,  // Finer grind needed
    tempDelta: +2,       // Higher temp for dense beans
    ratioDelta: 0,
    bloomDelta: +5,      // Longer bloom for dense beans
    pulseDelta: +1       // Extra pulse for dense beans
  };

  // Decaf adjustment (optimized for Swiss Water Process - more porous beans)
  const decafAdjustment = {
    grindStepDelta: +1,  // Coarser grind - extracts easier
    tempDelta: -8,       // Lower temp for SWP (target 190-197°F)
    ratioDelta: 0,
    bloomDelta: -5,      // Shorter bloom - faster degassing
    pulseDelta: 0
  };

  // Processing adjustments (grindStepDelta in step units)
  const processingAdjustments = {
    'washed':    { tempDelta: +1, grindStepDelta: -1, ratioDelta: +0.5, bloomDelta: +5, pulseDelta: 0 },
    'natural':   { tempDelta: -2, grindStepDelta: +1, ratioDelta: -0.5, bloomDelta: -5, pulseDelta: -1 },
    'honey':     { tempDelta: -1, grindStepDelta: 0,  ratioDelta: 0,    bloomDelta: 0,  pulseDelta: 0 },
    'anaerobic': { tempDelta: -1, grindStepDelta: 0,  ratioDelta: 0,    bloomDelta: +5, pulseDelta: 0 }
  };

  // Elevation → grind step delta
  // Higher elevation = denser bean = finer grind (fewer steps = finer)
  function getElevationGrindDelta(masl) {
    if (masl >= 1800) return -2;       // Very high: noticeably finer
    if (masl >= 1400) return -1;       // High: slightly finer
    if (masl >= 1000) return 0;        // Medium: baseline
    return +1;                          // Low: coarser
  }

  function getElevationTempDelta(masl) {
    if (masl >= 1800) return +1;       // Dense beans need more heat
    if (masl >= 1400) return 0;
    if (masl >= 1000) return 0;
    return -1;                          // Less dense = less heat needed
  }

  function getElevationPulseDelta(masl) {
    if (masl >= 1800) return +1;       // Dense high-altitude beans need extra pulse
    return 0;
  }

  // Detect high-density varieties that already get finer grinds
  // Skip elevation pulse bonus for these to prevent over-extraction
  function isDenseVarietyProfile(varieties) {
    const denseGroups = ['sl', 'gesha', 'ethiopian-landrace'];
    return varieties.some(v => {
      const group = varietyToGroup[v] || 'not-listed';
      return denseGroups.includes(group);
    });
  }

  // Origin descriptions for tips
  const originDescriptions = {
    'ethiopia':   'Ethiopian beans are known for floral and citrus notes. Washed Ethiopian coffees tend to be tea-like; naturals are berry-forward.',
    'kenya':      'Kenyan coffees typically have bright, wine-like acidity with berry and blackcurrant notes. High density beans that benefit from higher extraction.',
    'rwanda':     'Rwandan coffees often feature bright acidity with red fruit and floral sweetness.',
    'yemen':      'Yemeni beans are complex with wine, chocolate, and dried fruit characteristics. Often naturally processed.',
    'colombia':   'Colombian coffees are versatile with caramel sweetness, medium body, and balanced fruitiness.',
    'brazil':     'Brazilian beans lean chocolatey and nutty with lower acidity. They\'re very forgiving across a wide range of brew parameters.',
    'guatemala':  'Guatemalan coffees offer chocolate, spice, and stone fruit notes with a rich body.',
    'costa-rica': 'Costa Rican beans are clean and balanced with honey sweetness and citrus brightness.',
    'honduras':   'Honduran coffees feature caramel, tropical fruit, and chocolate notes with a smooth body.',
    'panama':     'Panamanian coffees (especially Gesha) are prized for jasmine, bergamot, and stone fruit elegance.',
    'peru':       'Peruvian beans are typically mild with nutty, chocolatey flavors and medium body.',
    'mexico':     'Mexican coffees tend toward chocolate, toffee, and mild fruit with approachable acidity.',
    'indonesia':  'Indonesian (Sumatra) beans are earthy, herbal, and full-bodied. Often darker-roasted; pair well with lower temperatures.',
    'blend':      'Blends are designed for balance. These starting parameters work as a solid baseline for most blends.'
  };

  // Variety group descriptions for tips
  const varietyDescriptions = {
    'ethiopian-landrace': 'Ethiopian heirloom/landrace varieties (including JARC selections like 74158) are among the densest specialty beans. Their high density calls for a finer grind and hotter water to fully extract floral and fruit complexity.',
    'bourbon': 'Bourbon family varieties are sweet, complex, and balanced. Moderately dense and versatile across roast levels.',
    'typica': 'Typica family varieties produce clean, sweet, elegant cups. Standard brewing parameters work well.',
    'gesha': 'Gesha is the most prized specialty variety. Its delicate jasmine, bergamot, and stone fruit notes require careful extraction: grind finer, brew hotter, use a wider ratio (1:17-18), and extend the bloom.',
    'sl': 'SL28 and SL34 are among the densest beans in specialty coffee. Their intense blackcurrant, winey acidity, and juicy body demand significantly finer grinding and higher temperatures.',
    'catuai': 'Catuai is a reliable workhorse variety. Standard brewing parameters work well.',
    'catimor-sarchimor': 'Disease-resistant hybrids with Robusta heritage. Brew slightly coarser and cooler to avoid extracting harsh notes. Castillo and Tabi are exceptions with better cup quality.',
    'pacamara': 'Pacamara has exceptionally large beans. Slightly coarser grind due to bean size, but raise temp and extend bloom for full extraction.',
    'f1-modern': 'Modern F1 hybrids combine disease resistance with improving cup quality. Standard parameters are a good starting point.',
    'not-listed': 'No variety-specific adjustments applied. The profile is based on roast, origin, processing, and elevation.'
  };

  // Processing descriptions for tips
  const processingDescriptions = {
    'washed':    'Washed processing gives a clean, bright cup that highlights origin character. Higher temps and finer grind help extract clarity.',
    'natural':   'Natural processing yields fruity, wine-like sweetness with a heavier body. Pull back on temperature to avoid harsh fermented notes.',
    'honey':     'Honey process balances the sweetness of naturals with the clarity of washed. A moderate approach works well.',
    'anaerobic': 'Anaerobic fermentation creates intense, unique flavors. These beans can be polarizing — dial carefully and avoid over-extraction.'
  };

  // ── Recommendation Engine ──────────────────────────────

  function generateProfile() {
    const base = roastProfiles[state.roast];
    const origin = originAdjustments[state.origin] || originAdjustments['blend'];
    const process = processingAdjustments[state.processing] || processingAdjustments['washed'];
    const varietyAdj = getVarietyAdjustment(state.varieties);
    const isBatch = state.brewSize === 'batch';

    // Taste slider influences (-0.5 to +0.5 range)
    const fruitInfluence = (state.sliders.fruit - 50) / 100;
    const bodyInfluence = (state.sliders.body - 50) / 100;
    const acidityInfluence = (state.sliders.acidity - 50) / 100;
    const floralInfluence = (state.sliders.floral - 50) / 100;
    const strengthInfluence = (state.sliders.strength - 50) / 100;

    // ── Grind Setting (step-index based) ──
    let grindStep = (base.grindStepMin + base.grindStepMax) / 2;
    if (isBatch) grindStep += 6;                     // Batch brews need ~2 major numbers coarser
    grindStep += origin.grindStepDelta;               // Origin effect
    grindStep += process.grindStepDelta;              // Processing effect
    grindStep += varietyAdj.grindStepDelta;           // Variety effect
    if (state.peaberry) grindStep += peaberryAdjustment.grindStepDelta;  // Peaberry effect
    if (state.decaf) grindStep += decafAdjustment.grindStepDelta;  // Decaf effect
    // Skip elevation grind delta for dense varieties to prevent over-stacking
    // (they already get finer grinds from variety adjustments)
    if (!isDenseVarietyProfile(state.varieties)) {
      grindStep += getElevationGrindDelta(state.elevation);
    }
    grindStep += fruitInfluence * 1;                  // Chocolatey → coarser (+1 max)
    grindStep += floralInfluence * 1;                 // Nutty → coarser (+1 max)
    grindStep = Math.round(grindStep);
    grindStep = Math.max(GRIND_MIN_STEP, Math.min(GRIND_MAX_STEP, grindStep));

    const grindDisplay = stepToDisplay(grindStep);
    const microns = stepToMicrons(grindStep);

    // ── Brew Temperature ──
    let tempBase = base.tempF;
    tempBase += origin.tempDelta;
    tempBase += process.tempDelta;
    tempBase += varietyAdj.tempDelta;
    if (state.peaberry) tempBase += peaberryAdjustment.tempDelta;  // Peaberry effect
    if (state.decaf) tempBase += decafAdjustment.tempDelta;  // Decaf effect
    tempBase += getElevationTempDelta(state.elevation);
    tempBase -= fruitInfluence * 3;       // Chocolatey → lower temp
    tempBase -= acidityInfluence * 4;     // Smooth → lower temp
    tempBase -= floralInfluence * 2;      // Nutty → lower temp
    let brewTemp = Math.round(tempBase);
    brewTemp = Math.max(185, Math.min(base.tempMax, brewTemp));  // Roast-specific max temp

    // ── Ratio ──
    let ratioBase = base.ratio;
    ratioBase += origin.ratioDelta;
    ratioBase += process.ratioDelta;
    ratioBase += (varietyAdj.ratioDelta || 0);
    ratioBase -= bodyInfluence * 1;       // Full body → tighter ratio
    ratioBase -= strengthInfluence * 1;   // Bold → tighter ratio
    let ratio = Math.round(ratioBase * 2) / 2;
    ratio = Math.max(14, Math.min(18, ratio));

    // ── Bloom Settings ──
    let bloomRatio = base.bloomRatio;
    let bloomDuration = isBatch ? base.bloomDurationBatch : base.bloomDurationSingle;
    bloomDuration += process.bloomDelta;
    bloomDuration += (varietyAdj.bloomDelta || 0);
    if (state.peaberry) bloomDuration += peaberryAdjustment.bloomDelta;  // Peaberry effect
    if (state.decaf) bloomDuration += decafAdjustment.bloomDelta;  // Decaf effect
    bloomDuration = Math.max(20, Math.min(60, bloomDuration));

    let bloomTemp = brewTemp;  // Bloom uses same temp as brew

    // ── Pulses ──
    let pulseCount = isBatch ? base.pulsesBatch : base.pulsesSingle;
    // Apply bean characteristic adjustments to pulse count
    pulseCount += varietyAdj.pulseDelta || 0;
    pulseCount += process.pulseDelta || 0;
    if (state.peaberry) pulseCount += peaberryAdjustment.pulseDelta || 0;
    // Skip elevation pulse bonus for dense varieties to prevent over-extraction
    // (they already get finer grinds which increases extraction surface area)
    if (!isDenseVarietyProfile(state.varieties)) {
      pulseCount += getElevationPulseDelta(state.elevation);
    }
    // Clamp pulse count to reasonable bounds (1-6 pulses)
    pulseCount = Math.max(1, Math.min(6, pulseCount));
    let pulseInterval = base.pulseInterval;

    let pulseTempList = isBatch
      ? [...(base.pulseTempDeclineBatch || base.pulseTempDecline)]
      : [...base.pulseTempDecline];

    const tempShift = brewTemp - base.tempF;
    pulseTempList = pulseTempList.map(t => {
      let adjusted = t + tempShift;
      return Math.max(183, Math.min(207, Math.round(adjusted)));
    });

    while (pulseTempList.length < pulseCount) {
      const last = pulseTempList[pulseTempList.length - 1] || brewTemp;
      pulseTempList.push(Math.max(183, last - 2));
    }
    pulseTempList = pulseTempList.slice(0, pulseCount);

    // ── Dose ──
    let doseG, waterMl;
    if (isBatch) {
      doseG = 55;
      waterMl = Math.round(doseG * ratio);
    } else {
      doseG = 22;
      waterMl = Math.round(doseG * ratio);
    }

    // ── Tips ──
    const tips = buildTips(state, brewTemp, grindStep, ratio);

    // Build profile object first (without explanation)
    const profile = {
      grindStep,
      grindDisplay,
      microns,
      brewTemp,
      ratio,
      bloomRatio,
      bloomDuration,
      bloomTemp,
      pulseCount,
      pulseInterval,
      pulseTempList,
      doseG,
      waterMl,
      tips
    };

    // Now build explanation with full profile context
    profile.explanation = buildExplanation(state, profile);

    return profile;
  }

  function buildTips(inputState, temp, grindStep, ratio) {
    const tips = [];

    // Origin tip
    if (originDescriptions[inputState.origin]) {
      tips.push({
        icon: '\u{1F30D}',
        text: originDescriptions[inputState.origin]
      });
    }

    // Variety tip(s)
    if (inputState.varieties && inputState.varieties.length > 0) {
      // Get unique groups from selected varieties
      const groups = [...new Set(inputState.varieties.map(v => varietyToGroup[v] || 'not-listed'))];
      groups.forEach(group => {
        if (varietyDescriptions[group] && group !== 'not-listed') {
          tips.push({
            icon: '\u{1FAB4}',
            text: varietyDescriptions[group]
          });
        }
      });
    }

    // Peaberry tip
    if (inputState.peaberry) {
      tips.push({
        icon: '\u{1F330}',
        text: 'Peaberry beans are denser than regular beans because only one seed develops inside the cherry instead of two. This requires finer grinding and higher temperatures for proper extraction, with a longer bloom to allow the dense bean structure to degas.'
      });
    }

    // Decaf tip
    if (inputState.decaf) {
      tips.push({
        icon: '\u2615',
        text: 'Decaf beans are more porous due to the decaffeination process, which makes them extract faster. Use cooler water and a coarser grind to avoid over-extraction and bitterness. Shorter bloom time since decaf degasses more quickly.'
      });
    }

    // Processing tip
    if (processingDescriptions[inputState.processing]) {
      tips.push({
        icon: '\u{2696}\u{FE0F}',
        text: processingDescriptions[inputState.processing]
      });
    }

    // Elevation tip
    if (inputState.elevation >= 1800) {
      tips.push({
        icon: '\u{26F0}\u{FE0F}',
        text: `Grown at ${inputState.elevation} MASL (very high altitude). These beans are exceptionally dense, so the grind has been set finer and temperature higher to ensure full extraction.`
      });
    } else if (inputState.elevation < 1000) {
      tips.push({
        icon: '\u{26F0}\u{FE0F}',
        text: `Grown at ${inputState.elevation} MASL (lower altitude). Less dense beans extract more easily, so the grind has been set coarser and temperature slightly lower.`
      });
    }

    // Roast-specific tip
    if (inputState.roast === 'light' || inputState.roast === 'medium-light') {
      tips.push({
        icon: '\u{1F321}\u{FE0F}',
        text: 'Light roasts are dense and need more heat and finer grinds to extract properly. If the cup tastes sour or thin, try grinding 1 sub-step finer on the Ode 2 (e.g. 4.2 \u{2192} 4.1).'
      });
    } else if (inputState.roast === 'dark' || inputState.roast === 'medium-dark') {
      tips.push({
        icon: '\u{1F525}',
        text: 'Darker roasts extract easily. The hot bloom + cooler brew pulse pattern helps avoid bitterness. If too bitter, go 1 sub-step coarser (e.g. 5.2 \u{2192} 6.0).'
      });
    }

    // Batch vs single tip
    if (inputState.brewSize === 'batch') {
      tips.push({
        icon: '\u{2615}',
        text: 'Batch brewing on the Aiden uses the flat-bottom basket with a Melitta 8-12 cup filter. The coarser grind compensates for longer contact time with a larger bed of coffee.'
      });
    } else {
      tips.push({
        icon: '\u{2615}',
        text: 'Single-serve brewing on the Aiden uses the cone basket with a Melitta #2 filter. The multi-pulse approach mimics a pour-over with declining temperature for complexity.'
      });
    }

    // Dial-in reminder
    tips.push({
      icon: '\u{1F504}',
      text: 'These are starting points. Taste your first brew and adjust: sour/thin \u{2192} grind 1 sub-step finer or raise temp; bitter/harsh \u{2192} grind 1 sub-step coarser or lower temp. Change one variable at a time.'
    });

    return tips;
  }

  // ── Explanation Builder ────────────────────────────────

  function buildExplanation(inputState, profile) {
    const explanations = [];

    // Get labels for display
    const roastLabels = {
      'light': 'light roast',
      'medium-light': 'medium-light roast',
      'medium': 'medium roast',
      'medium-dark': 'medium-dark roast',
      'dark': 'dark roast'
    };
    const roastLabel = roastLabels[inputState.roast] || inputState.roast;

    const originLabel = originSelect?.querySelector(`[value="${inputState.origin}"]`)?.textContent || inputState.origin;

    // Build variety labels from multi-select
    const varietyLabels = (inputState.varieties || []).map(v => {
      const opt = varietySelect?.querySelector(`[value="${v}"]`);
      return opt?.textContent || v;
    }).filter(Boolean);
    const varietyLabel = varietyLabels.length > 0 ? varietyLabels.join(' + ') : '';
    const hasVarieties = inputState.varieties && inputState.varieties.length > 0;
    const varietyAdj = getVarietyAdjustment(inputState.varieties);

    const processLabel = inputState.processing.charAt(0).toUpperCase() + inputState.processing.slice(1);
    const isBatch = inputState.brewSize === 'batch';

    // ── Grind Setting Explanation ──
    let grindReasons = [];

    // Base from roast
    const baseProfile = roastProfiles[inputState.roast];
    const baseGrindMid = (baseProfile.grindStepMin + baseProfile.grindStepMax) / 2;
    grindReasons.push(`The baseline for ${roastLabel} is around ${stepToDisplay(Math.round(baseGrindMid))}`);

    // Batch adjustment
    if (isBatch) {
      grindReasons.push(`batch brewing adds +6 steps (coarser) to compensate for the larger coffee bed and longer contact time`);
    }

    // Variety effect
    if (varietyAdj.grindStepDelta !== 0 && hasVarieties) {
      const direction = varietyAdj.grindStepDelta < 0 ? 'finer' : 'coarser';
      const reason = varietyAdj.grindStepDelta < 0
        ? 'which is dense and needs more surface area for extraction'
        : 'which extracts more easily';
      grindReasons.push(`${varietyLabel} goes ${Math.abs(varietyAdj.grindStepDelta)} step${Math.abs(varietyAdj.grindStepDelta) > 1 ? 's' : ''} ${direction}, ${reason}`);
    }

    // Peaberry effect
    if (inputState.peaberry) {
      grindReasons.push(`Peaberry beans are denser, so ${Math.abs(peaberryAdjustment.grindStepDelta)} steps finer to increase extraction`);
    }

    // Decaf effect
    if (inputState.decaf) {
      grindReasons.push(`Decaf beans are more porous, so ${Math.abs(decafAdjustment.grindStepDelta)} step coarser to slow extraction`);
    }

    // Elevation effect
    const elevDelta = getElevationGrindDelta(inputState.elevation);
    if (elevDelta !== 0) {
      const direction = elevDelta < 0 ? 'finer' : 'coarser';
      const densityDesc = elevDelta < 0 ? 'denser' : 'less dense';
      grindReasons.push(`beans grown at ${inputState.elevation} MASL are ${densityDesc}, so ${Math.abs(elevDelta)} step${Math.abs(elevDelta) > 1 ? 's' : ''} ${direction}`);
    }

    // Processing effect
    const procAdj = processingAdjustments[inputState.processing];
    if (procAdj && procAdj.grindStepDelta !== 0) {
      const direction = procAdj.grindStepDelta < 0 ? 'finer' : 'coarser';
      const reason = procAdj.grindStepDelta < 0
        ? 'to extract the clean, bright flavors'
        : 'since the sugars from the fruit make it extract more easily';
      grindReasons.push(`${processLabel} processing goes ${Math.abs(procAdj.grindStepDelta)} step ${direction} ${reason}`);
    }

    explanations.push({
      param: 'Grind Setting',
      value: profile.grindDisplay,
      summary: `Set to ${profile.grindDisplay} (~${profile.microns}μm) for optimal extraction.`,
      reasons: grindReasons
    });

    // ── Brew Temperature Explanation ──
    let tempReasons = [];

    tempReasons.push(`${roastLabel.charAt(0).toUpperCase() + roastLabel.slice(1)} has a baseline brew temperature of ${baseProfile.tempF}°F`);

    if (varietyAdj.tempDelta !== 0 && hasVarieties) {
      const direction = varietyAdj.tempDelta > 0 ? 'higher' : 'lower';
      const reason = varietyAdj.tempDelta > 0
        ? 'because dense beans need more heat to fully extract'
        : 'to avoid over-extracting';
      tempReasons.push(`${varietyLabel} needs ${Math.abs(varietyAdj.tempDelta)}°F ${direction} ${reason}`);
    }

    // Peaberry effect
    if (inputState.peaberry) {
      tempReasons.push(`Peaberry beans need ${Math.abs(peaberryAdjustment.tempDelta)}°F higher due to their increased density`);
    }

    // Decaf effect
    if (inputState.decaf) {
      tempReasons.push(`Decaf beans need ${Math.abs(decafAdjustment.tempDelta)}°F lower to avoid bitterness from over-extraction`);
    }

    if (procAdj && procAdj.tempDelta !== 0) {
      const direction = procAdj.tempDelta > 0 ? 'higher' : 'lower';
      const reason = procAdj.tempDelta > 0
        ? 'to extract clarity and brightness'
        : 'to avoid harsh or fermented notes';
      tempReasons.push(`${processLabel} processing benefits from ${Math.abs(procAdj.tempDelta)}°F ${direction} ${reason}`);
    }

    const elevTempDelta = getElevationTempDelta(inputState.elevation);
    if (elevTempDelta !== 0) {
      const direction = elevTempDelta > 0 ? 'higher' : 'lower';
      tempReasons.push(`High-altitude beans (${inputState.elevation} MASL) need ${Math.abs(elevTempDelta)}°F ${direction} due to their density`);
    }

    explanations.push({
      param: 'Brew Temperature',
      value: `${profile.brewTemp}°F`,
      summary: `Set to ${profile.brewTemp}°F for balanced extraction without bitterness.`,
      reasons: tempReasons
    });

    // ── Ratio Explanation ──
    let ratioReasons = [];

    ratioReasons.push(`A 1:${baseProfile.ratio} ratio is standard for ${roastLabel}`);

    if (varietyAdj.ratioDelta && varietyAdj.ratioDelta !== 0 && hasVarieties) {
      const direction = varietyAdj.ratioDelta > 0 ? 'wider' : 'tighter';
      const reason = varietyAdj.ratioDelta > 0
        ? 'to preserve delicate flavors without over-concentration'
        : 'for more body';
      ratioReasons.push(`${varietyLabel} benefits from a ${direction} ratio ${reason}`);
    }

    if (procAdj && procAdj.ratioDelta !== 0) {
      const direction = procAdj.ratioDelta > 0 ? 'wider (more water)' : 'tighter (less water)';
      ratioReasons.push(`${processLabel} processing works well with a ${direction} ratio`);
    }

    // Taste slider effects
    if (inputState.sliders.body > 60 || inputState.sliders.strength > 60) {
      ratioReasons.push(`Your preference for ${inputState.sliders.body > 60 ? 'fuller body' : ''}${inputState.sliders.body > 60 && inputState.sliders.strength > 60 ? ' and ' : ''}${inputState.sliders.strength > 60 ? 'bolder strength' : ''} pulls the ratio tighter`);
    } else if (inputState.sliders.body < 40 || inputState.sliders.strength < 40) {
      ratioReasons.push(`Your preference for ${inputState.sliders.body < 40 ? 'lighter body' : ''}${inputState.sliders.body < 40 && inputState.sliders.strength < 40 ? ' and ' : ''}${inputState.sliders.strength < 40 ? 'more delicate cup' : ''} pushes the ratio wider`);
    }

    explanations.push({
      param: 'Coffee-to-Water Ratio',
      value: `1:${profile.ratio.toFixed(1)}`,
      summary: `Using ${profile.doseG}g of coffee to ${profile.waterMl}ml of water.`,
      reasons: ratioReasons
    });

    // ── Bloom Explanation ──
    let bloomReasons = [];

    bloomReasons.push(`A 1:${profile.bloomRatio} bloom ratio (${profile.doseG * profile.bloomRatio}g water for ${profile.doseG}g coffee) saturates the grounds for degassing`);

    const baseBloom = isBatch ? baseProfile.bloomDurationBatch : baseProfile.bloomDurationSingle;
    bloomReasons.push(`${profile.bloomDuration} seconds allows CO₂ to escape from the ${roastLabel} beans`);

    if (varietyAdj.bloomDelta && varietyAdj.bloomDelta !== 0 && hasVarieties) {
      const direction = varietyAdj.bloomDelta > 0 ? 'longer' : 'shorter';
      const reason = varietyAdj.bloomDelta > 0
        ? 'because dense beans need more time to degas and open up'
        : 'since they degas quickly';
      bloomReasons.push(`${varietyLabel} gets a ${direction} bloom ${reason}`);
    }

    // Peaberry effect
    if (inputState.peaberry) {
      bloomReasons.push(`Peaberry beans get ${Math.abs(peaberryAdjustment.bloomDelta)}s longer bloom to allow the dense structure to degas`);
    }

    // Decaf effect
    if (inputState.decaf) {
      bloomReasons.push(`Decaf beans get ${Math.abs(decafAdjustment.bloomDelta)}s shorter bloom since they degas faster`);
    }

    if (procAdj && procAdj.bloomDelta !== 0) {
      const direction = procAdj.bloomDelta > 0 ? 'longer' : 'shorter';
      bloomReasons.push(`${processLabel} processing adjusts bloom ${direction}`);
    }

    // Bloom temp
    bloomReasons.push(`Bloom temperature is ${profile.bloomTemp}°F${inputState.roast === 'dark' || inputState.roast === 'medium-dark' ? ' (hot bloom helps develop sweetness before the cooler brew pulses)' : ''}`);

    explanations.push({
      param: 'Bloom',
      value: `1:${profile.bloomRatio} for ${profile.bloomDuration}s at ${profile.bloomTemp}°F`,
      summary: `Prepares the coffee bed by releasing trapped CO₂ for even extraction.`,
      reasons: bloomReasons
    });

    // ── Pulses Explanation ──
    let pulseReasons = [];

    pulseReasons.push(`${profile.pulseCount} pulse${profile.pulseCount > 1 ? 's' : ''} ${isBatch ? 'for batch brewing (fewer, larger pours)' : 'mimics a pour-over technique for single-serve'}`);

    pulseReasons.push(`${profile.pulseInterval} seconds between pulses allows the water to draw through the coffee bed`);

    // Declining temps
    if (profile.pulseTempList.length > 1) {
      const tempDrop = profile.pulseTempList[0] - profile.pulseTempList[profile.pulseTempList.length - 1];
      pulseReasons.push(`Temperatures decline from ${profile.pulseTempList[0]}°F to ${profile.pulseTempList[profile.pulseTempList.length - 1]}°F (${tempDrop}°F drop)`);
      pulseReasons.push(`This declining profile extracts brighter, more soluble compounds early (at higher temps) and avoids over-extracting bitter compounds later (at lower temps)`);
    }

    if (inputState.roast === 'dark' || inputState.roast === 'medium-dark') {
      pulseReasons.push(`For darker roasts, the cooler brew pulses are especially important to prevent bitterness`);
    }

    explanations.push({
      param: 'Pulse Profile',
      value: `${profile.pulseCount} pulses, ${profile.pulseInterval}s apart`,
      summary: `Staged water delivery for controlled, even extraction.`,
      reasons: pulseReasons
    });

    return explanations;
  }

  // ── Render Output ──────────────────────────────────────

  function renderProfile(profile) {
    outputPlaceholder.classList.add('hidden');
    outputResults.classList.remove('hidden');

    // Ode 2 settings
    $('#grindSetting').textContent = profile.grindDisplay;
    $('#grindNote').textContent = `Ode 2 Gen 2 Burrs (1.0\u201311.2)`;
    $('#grindMicrons').textContent = `~${profile.microns}\u00B5m`;
    $('#coffeeDose').textContent = `${profile.doseG}g \u{2192} ${profile.waterMl}ml`;

    // Aiden settings
    $('#brewTemp').textContent = `${profile.brewTemp}\u00B0F`;
    $('#brewRatio').textContent = `1:${profile.ratio.toFixed(1)}`;
    $('#bloomRatio').textContent = `1:${profile.bloomRatio}`;
    $('#bloomDuration').textContent = `${profile.bloomDuration}s`;
    $('#bloomTemp').textContent = `${profile.bloomTemp}\u00B0F`;
    $('#pulseCount').textContent = profile.pulseCount;
    $('#pulseInterval').textContent = `${profile.pulseInterval}s`;

    // Pulse temperature bars
    renderPulseBars(profile);

    // Tips
    renderTips(profile.tips);

    // Explanation
    renderExplanation(profile.explanation);

    // Scroll to results on mobile
    if (window.innerWidth <= 900) {
      outputResults.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function renderPulseBars(profile) {
    const container = $('#pulseBars');
    container.innerHTML = '';

    const allTemps = [profile.bloomTemp, ...profile.pulseTempList];
    const maxTemp = Math.max(...allTemps);
    const minTemp = Math.min(...allTemps) - 10;
    const range = maxTemp - minTemp || 1;

    const bloomWrapper = createPulseBar(
      'Bloom',
      `${profile.bloomTemp}\u00B0F`,
      profile.bloomTemp,
      minTemp,
      range,
      true
    );
    container.appendChild(bloomWrapper);

    profile.pulseTempList.forEach((temp, i) => {
      const wrapper = createPulseBar(
        `Pulse ${i + 1}`,
        `${temp}\u00B0F`,
        temp,
        minTemp,
        range,
        false
      );
      container.appendChild(wrapper);
    });
  }

  function createPulseBar(label, tempLabel, temp, minTemp, range, isBloom) {
    const wrapper = document.createElement('div');
    wrapper.className = 'pulse-bar-wrapper';

    const tempSpan = document.createElement('span');
    tempSpan.className = 'pulse-bar-temp';
    tempSpan.textContent = tempLabel;

    const bar = document.createElement('div');
    bar.className = `pulse-bar ${isBloom ? 'pulse-bar-bloom' : 'pulse-bar-pulse'}`;
    const heightPercent = ((temp - minTemp) / range) * 70 + 30;
    bar.style.height = '0%';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        bar.style.height = `${heightPercent}%`;
      });
    });

    const labelSpan = document.createElement('span');
    labelSpan.className = 'pulse-bar-label';
    labelSpan.textContent = label;

    wrapper.appendChild(tempSpan);
    wrapper.appendChild(bar);
    wrapper.appendChild(labelSpan);
    return wrapper;
  }

  function renderTips(tips) {
    const container = $('#tipsContent');
    container.innerHTML = '';

    tips.forEach(tip => {
      const item = document.createElement('div');
      item.className = 'tip-item';

      const icon = document.createElement('span');
      icon.className = 'tip-icon';
      icon.textContent = tip.icon;

      const text = document.createElement('span');
      text.className = 'tip-text';
      text.textContent = tip.text;

      item.appendChild(icon);
      item.appendChild(text);
      container.appendChild(item);
    });
  }

  function renderExplanation(explanations) {
    const container = $('#explanationContent');
    if (!container) return;
    container.innerHTML = '';

    explanations.forEach(exp => {
      const block = document.createElement('div');
      block.className = 'explanation-block';

      // Header with param name and value
      const header = document.createElement('div');
      header.className = 'explanation-header';

      const paramName = document.createElement('span');
      paramName.className = 'explanation-param';
      paramName.textContent = exp.param;

      const paramValue = document.createElement('span');
      paramValue.className = 'explanation-value';
      paramValue.textContent = exp.value;

      header.appendChild(paramName);
      header.appendChild(paramValue);

      // Summary
      const summary = document.createElement('p');
      summary.className = 'explanation-summary';
      summary.textContent = exp.summary;

      // Reasons list
      const reasonsList = document.createElement('ul');
      reasonsList.className = 'explanation-reasons';
      exp.reasons.forEach(reason => {
        const li = document.createElement('li');
        li.textContent = reason;
        reasonsList.appendChild(li);
      });

      block.appendChild(header);
      block.appendChild(summary);
      block.appendChild(reasonsList);
      container.appendChild(block);
    });
  }

  // ── Save / Load Profiles ───────────────────────────────

  const STORAGE_KEY = 'brewProfiles_saved_v2';

  function getSavedProfiles() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch {
      return [];
    }
  }

  function saveProfile(name) {
    const profile = generateProfile();
    const saved = getSavedProfiles();
    saved.unshift({
      id: Date.now(),
      name,
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      input: { ...state, sliders: { ...state.sliders } },
      output: profile
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    renderSavedProfiles();
    showToast(`"${name}" saved!`);
  }

  function deleteProfile(id) {
    let saved = getSavedProfiles();
    saved = saved.filter(p => p.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    renderSavedProfiles();
  }

  function loadProfile(id) {
    const saved = getSavedProfiles();
    const profile = saved.find(p => p.id === id);
    if (!profile) return;

    const input = profile.input;

    // Restore state (handle legacy single-variety profiles)
    state.roast = input.roast;
    state.origin = input.origin;
    // Support both old (variety) and new (varieties) format
    if (input.varieties && Array.isArray(input.varieties)) {
      state.varieties = input.varieties;
    } else if (input.variety && input.variety !== 'not-listed') {
      state.varieties = [input.variety];
    } else {
      state.varieties = [];
    }
    state.peaberry = input.peaberry || false;
    state.decaf = input.decaf || false;
    state.processing = input.processing;
    state.elevation = input.elevation || 1400;
    state.brewSize = input.brewSize;
    state.sliders = { ...input.sliders };

    // Update UI
    setActiveButton(roastBtns, state.roast);
    originSelect.value = state.origin;
    // Update multi-select
    updateVarietySelectUI(state.varieties);
    renderVarietyTags();
    if (peaberryCheck) peaberryCheck.checked = state.peaberry;
    if (decafCheck) decafCheck.checked = state.decaf;
    setActiveButton(processingBtns, state.processing);
    elevationInput.value = state.elevation;
    syncElevationPresets(state.elevation);
    setActiveButton(brewSizeBtns, state.brewSize);

    $('#sliderFruit').value = state.sliders.fruit;
    $('#sliderBody').value = state.sliders.body;
    $('#sliderAcidity').value = state.sliders.acidity;
    $('#sliderFloral').value = state.sliders.floral;
    $('#sliderStrength').value = state.sliders.strength;

    // Generate and display
    renderProfile(profile.output);

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderSavedProfiles() {
    const saved = getSavedProfiles();

    if (saved.length === 0) {
      savedSection.classList.add('hidden');
      return;
    }

    savedSection.classList.remove('hidden');
    savedGrid.innerHTML = '';

    saved.forEach(profile => {
      const card = document.createElement('div');
      card.className = 'saved-card';
      card.onclick = () => loadProfile(profile.id);

      const roastLabel = profile.input.roast.replace('-', '-').replace(/^\w/, c => c.toUpperCase());
      const originLabel = originSelect.querySelector(`[value="${profile.input.origin}"]`)?.textContent || profile.input.origin;
      const processLabel = profile.input.processing.charAt(0).toUpperCase() + profile.input.processing.slice(1);
      const sizeLabel = profile.input.brewSize === 'batch' ? 'Batch' : 'Single';

      // Get variety label (support both old and new format)
      let varietyLabel = '';
      if (profile.input.varieties && profile.input.varieties.length > 0) {
        const labels = profile.input.varieties.map(v => {
          const opt = varietySelect.querySelector(`[value="${v}"]`);
          return opt ? opt.textContent : '';
        }).filter(Boolean);
        varietyLabel = labels.join(' + ');
      } else if (profile.input.variety && profile.input.variety !== 'not-listed') {
        const opt = varietySelect.querySelector(`[value="${profile.input.variety}"]`);
        varietyLabel = opt ? opt.textContent : '';
      }

      const output = profile.output;
      const grindLabel = output.grindDisplay || output.grindSetting?.toFixed(1) || '—';

      card.innerHTML = `
        <div class="saved-card-header">
          <span class="saved-card-name">${escapeHtml(profile.name)}</span>
          <span class="saved-card-date">${profile.date}</span>
        </div>
        <div class="saved-card-tags">
          <span class="saved-tag">${roastLabel}</span>
          <span class="saved-tag">${originLabel}</span>
          ${varietyLabel && varietyLabel !== 'Not Listed / Unknown' ? `<span class="saved-tag">${varietyLabel}</span>` : ''}
          <span class="saved-tag">${processLabel}</span>
          <span class="saved-tag">${sizeLabel}</span>
        </div>
        <div class="saved-card-summary">
          Ode 2: ${grindLabel} &middot; Aiden: ${output.brewTemp}&deg;F &middot; 1:${output.ratio.toFixed(1)} &middot; ${output.pulseCount} pulses
        </div>
        <button class="saved-card-delete" onclick="event.stopPropagation()" data-id="${profile.id}" aria-label="Delete profile">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      `;

      card.querySelector('.saved-card-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteProfile(profile.id);
      });

      savedGrid.appendChild(card);
    });
  }

  // ── Toast ──────────────────────────────────────────────

  function showToast(message) {
    let toast = document.querySelector('.toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('visible');
    setTimeout(() => toast.classList.remove('visible'), 2500);
  }

  // ── Save Modal ─────────────────────────────────────────

  function showSaveModal() {
    let overlay = document.querySelector('.modal-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal">
          <h3>Save Brew Profile</h3>
          <p>Give this profile a name so you can find it later.</p>
          <input type="text" class="modal-input" id="profileNameInput" placeholder="e.g. Ethiopian Yirgacheffe — Light" maxlength="60">
          <div class="modal-actions">
            <button class="modal-btn modal-btn-secondary" id="modalCancel">Cancel</button>
            <button class="modal-btn modal-btn-primary" id="modalSave">Save</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      overlay.querySelector('#modalCancel').addEventListener('click', () => {
        overlay.classList.remove('visible');
      });

      overlay.querySelector('#modalSave').addEventListener('click', () => {
        const name = overlay.querySelector('#profileNameInput').value.trim();
        if (name) {
          saveProfile(name);
          overlay.classList.remove('visible');
          overlay.querySelector('#profileNameInput').value = '';
        }
      });

      overlay.querySelector('#profileNameInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          overlay.querySelector('#modalSave').click();
        }
      });

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.classList.remove('visible');
      });
    }

    // Auto-generate name suggestion
    const originLabel = originSelect.querySelector(`[value="${state.origin}"]`)?.textContent || state.origin;
    // Build variety label from multi-select
    let varietyLabel = '';
    if (state.varieties && state.varieties.length > 0) {
      const labels = state.varieties.map(v => {
        const opt = varietySelect.querySelector(`[value="${v}"]`);
        return opt ? opt.textContent : '';
      }).filter(Boolean);
      varietyLabel = labels.join(' + ');
    }
    const roastLabel = state.roast.replace(/(^|\-)(\w)/g, (m, sep, c) => (sep ? '-' : '') + c.toUpperCase());
    const nameParts = [originLabel];
    if (varietyLabel) nameParts.push(varietyLabel);
    if (state.peaberry) nameParts.push('Peaberry');
    if (state.decaf) nameParts.push('Decaf');
    nameParts.push(roastLabel);
    overlay.querySelector('#profileNameInput').value = nameParts.join(' \u2014 ');

    overlay.classList.add('visible');
    setTimeout(() => overlay.querySelector('#profileNameInput').select(), 100);
  }

  // ── Utility ────────────────────────────────────────────

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  function setActiveButton(buttons, value) {
    buttons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.value === value);
    });
  }

  // Render variety tags below the multi-select
  function renderVarietyTags() {
    if (!varietyTagsContainer) return;
    varietyTagsContainer.innerHTML = '';

    state.varieties.forEach(v => {
      const opt = varietySelect?.querySelector(`[value="${v}"]`);
      const label = opt?.textContent || v;

      const tag = document.createElement('span');
      tag.className = 'variety-tag';
      tag.innerHTML = `
        <span class="variety-tag-text">${escapeHtml(label)}</span>
        <button type="button" class="variety-tag-remove" data-value="${v}" aria-label="Remove ${label}">×</button>
      `;

      tag.querySelector('.variety-tag-remove').addEventListener('click', (e) => {
        e.preventDefault();
        const valToRemove = e.target.dataset.value;
        state.varieties = state.varieties.filter(x => x !== valToRemove);
        updateVarietySelectUI(state.varieties);
        renderVarietyTags();
      });

      varietyTagsContainer.appendChild(tag);
    });
  }

  // Update multi-select UI to reflect state.varieties
  function updateVarietySelectUI(varieties) {
    if (!varietySelect) return;
    Array.from(varietySelect.options).forEach(opt => {
      opt.selected = varieties.includes(opt.value);
    });
  }

  function setupButtonGroup(buttons, stateKey) {
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        state[stateKey] = btn.dataset.value;
        setActiveButton(buttons, btn.dataset.value);
      });
    });
  }

  function syncElevationPresets(value) {
    elevationPresetBtns.forEach(btn => {
      const presetVal = parseInt(btn.dataset.value, 10);
      // Highlight the closest preset
      let isActive = false;
      if (presetVal === 800 && value < 1000) isActive = true;
      else if (presetVal === 1400 && value >= 1000 && value < 1600) isActive = true;
      else if (presetVal === 1800 && value >= 1600 && value < 1950) isActive = true;
      else if (presetVal === 2100 && value >= 1950) isActive = true;
      btn.classList.toggle('active', isActive);
    });
  }

  // ── Event Binding ──────────────────────────────────────

  function init() {
    // Button groups
    setupButtonGroup(roastBtns, 'roast');
    setupButtonGroup(processingBtns, 'processing');
    setupButtonGroup(brewSizeBtns, 'brewSize');

    // Origin select
    originSelect.addEventListener('change', () => {
      state.origin = originSelect.value;
    });

    // Variety multi-select
    varietySelect.addEventListener('change', () => {
      const selected = Array.from(varietySelect.selectedOptions).map(opt => opt.value);
      state.varieties = selected;
      renderVarietyTags();
    });

    // Peaberry checkbox
    if (peaberryCheck) {
      peaberryCheck.addEventListener('change', () => {
        state.peaberry = peaberryCheck.checked;
      });
    }

    // Decaf checkbox
    if (decafCheck) {
      decafCheck.addEventListener('change', () => {
        state.decaf = decafCheck.checked;
      });
    }

    // Elevation input
    elevationInput.addEventListener('input', () => {
      const val = parseInt(elevationInput.value, 10);
      if (!isNaN(val)) {
        state.elevation = val;
        syncElevationPresets(val);
      }
    });

    // Elevation presets
    elevationPresetBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const val = parseInt(btn.dataset.value, 10);
        state.elevation = val;
        elevationInput.value = val;
        syncElevationPresets(val);
      });
    });

    // Sliders
    const sliderMap = {
      sliderFruit: 'fruit',
      sliderBody: 'body',
      sliderAcidity: 'acidity',
      sliderFloral: 'floral',
      sliderStrength: 'strength'
    };

    Object.entries(sliderMap).forEach(([id, key]) => {
      const slider = $(`#${id}`);
      slider.addEventListener('input', () => {
        state.sliders[key] = parseInt(slider.value, 10);
      });
    });

    // Tabs
    const tabBtns = $$('.tab-btn');
    const tabPanels = $$('.tab-panel');

    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tabId = btn.dataset.tab;

        // Update button states
        tabBtns.forEach(b => {
          b.classList.toggle('active', b.dataset.tab === tabId);
          b.setAttribute('aria-selected', b.dataset.tab === tabId);
        });

        // Update panel visibility
        tabPanels.forEach(panel => {
          panel.classList.toggle('active', panel.dataset.tab === tabId);
        });
      });
    });

    // Generate
    generateBtn.addEventListener('click', () => {
      const profile = generateProfile();
      renderProfile(profile);
    });

    // Save
    saveBtn.addEventListener('click', () => {
      showSaveModal();
    });

    // Reset
    resetBtn.addEventListener('click', () => {
      outputResults.classList.add('hidden');
      outputPlaceholder.classList.remove('hidden');

      state.roast = 'medium';
      state.origin = 'ethiopia';
      state.varieties = [];
      state.peaberry = false;
      state.decaf = false;
      state.processing = 'washed';
      state.elevation = 1400;
      state.brewSize = 'single';
      state.sliders = { fruit: 50, body: 50, acidity: 50, floral: 50, strength: 50 };

      setActiveButton(roastBtns, 'medium');
      originSelect.value = 'ethiopia';
      // Clear multi-select
      updateVarietySelectUI([]);
      renderVarietyTags();
      if (peaberryCheck) peaberryCheck.checked = false;
      if (decafCheck) decafCheck.checked = false;
      setActiveButton(processingBtns, 'washed');
      elevationInput.value = 1400;
      syncElevationPresets(1400);
      setActiveButton(brewSizeBtns, 'single');
      Object.entries(sliderMap).forEach(([id]) => {
        $(`#${id}`).value = 50;
      });
    });

    // Load saved profiles on startup
    renderSavedProfiles();
  }

  // Boot
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
