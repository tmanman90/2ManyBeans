// Brew method registry — strategy pattern per Architecture Strategist recommendation
// Each tab renders method.label based on the user's preference.
// Adding a new brew method requires one entry here, not editing three tabs.

// Valid Fellow Ode Gen 2 grind steps (31 positions)
export const ODE_GEN2_STEPS = [
  1, 1.1, 1.2, 2, 2.1, 2.2, 3, 3.1, 3.2, 4, 4.1, 4.2,
  5, 5.1, 5.2, 6, 6.1, 6.2, 7, 7.1, 7.2, 8, 8.1, 8.2,
  9, 9.1, 9.2, 10, 10.1, 10.2, 11,
];

export function nearestOdeStep(target, preferCoarser = true) {
  let closest = ODE_GEN2_STEPS[0];
  let minDist = Math.abs(target - closest);
  for (const step of ODE_GEN2_STEPS) {
    const dist = Math.abs(target - step);
    if (dist < minDist || (dist === minDist && preferCoarser && step > closest)) {
      closest = step;
      minDist = dist;
    }
  }
  return closest;
}

export const GRINDER_LABELS = {
  'fellow-ode-gen2': 'Ode Gen 2',
  'fellow-opus': 'Fellow Opus',
  'baratza-encore-esp': 'Encore ESP',
  'comandante-c40': 'Comandante C40',
  '1zpresso-jx-pro': 'JX-Pro',
  'baratza-virtuoso-plus': 'Virtuoso+',
};

// Grinder micron scales — THE single source of truth for setting↔micron math.
// Semantics: microns(setting) = base + (setting - 1) * perStep, where `base`
// is the micron value AT setting/click 1. Calibrated against Honest Coffee
// Guide measured ranges (2026-07); click grinders use per-click values.
//   ode-gen2:  275-1160µm over dial 1-11
//   opus:      230-1160µm over dial 1-11 (quarter-step clicks)
//   encore-esp: 230-1380µm over 0-40  (base = value at 1)
//   comandante: ~30µm/click, 0-1090µm
//   jx-pro:    ~4.6µm/click, 0-915µm over ~200 clicks
//   virtuoso+: 200-1200µm over 0-40 (base = value at 1)
export const GRINDER_MICRON_SCALES = {
  'fellow-ode-gen2': { base: 275, perStep: 88.5 },
  'fellow-opus': { base: 230, perStep: 93 },
  'baratza-encore-esp': { base: 259, perStep: 28.75 },
  'comandante-c40': { base: 30, perStep: 30 },
  '1zpresso-jx-pro': { base: 4.6, perStep: 4.6 },
  'baratza-virtuoso-plus': { base: 225, perStep: 25 },
};

// Approximate microns for any known grinder's setting (linear per scale above)
export function grinderSettingToMicrons(setting, grinderKey) {
  const g = GRINDER_MICRON_SCALES[grinderKey];
  if (!g || setting == null || isNaN(setting)) return null;
  return Math.round(g.base + (setting - 1) * g.perStep);
}

// Approximate micron value for Ode Gen 2 step (derived from the scale table)
export function odeStepToMicrons(step) {
  return grinderSettingToMicrons(step, 'fellow-ode-gen2');
}

// Translate Ode Gen 2 step to another grinder's setting via micron intermediary
// Comandante uses clicks (e.g., "22 clicks"), JX-Pro uses rotation notation
const CLICK_GRINDERS = new Set(['comandante-c40', '1zpresso-jx-pro']);

function formatGrinderSetting(rawSetting, grinderKey) {
  if (grinderKey === '1zpresso-jx-pro') {
    const clicks = Math.round(rawSetting);
    const turns = Math.floor(clicks / 40);
    const remainder = clicks % 40;
    const num = Math.floor(remainder / 10);
    const sub = remainder % 10;
    return `${turns}.${num}.${sub}`;
  }
  if (grinderKey === 'comandante-c40') {
    return `${Math.round(rawSetting)} clicks`;
  }
  return rawSetting;
}

export function odeStepToGrinderSetting(odeStep, grinderKey) {
  if (grinderKey === 'fellow-ode-gen2') return { setting: odeStep, label: 'Ode Gen 2' };
  const microns = odeStepToMicrons(odeStep);
  const g = GRINDER_MICRON_SCALES[grinderKey];
  if (!g) return { microns, description: descriptorForMicrons(microns) };
  const rawSetting = Math.round(((microns - g.base) / g.perStep + 1) * 10) / 10;
  const clamped = Math.max(1, rawSetting);
  const display = CLICK_GRINDERS.has(grinderKey) ? formatGrinderSetting(clamped, grinderKey) : clamped;
  return { setting: display, label: GRINDER_LABELS[grinderKey], microns };
}

export function descriptorForMicrons(microns) {
  if (microns < 300) return 'Fine';
  if (microns < 500) return 'Medium-Fine';
  if (microns < 700) return 'Medium';
  if (microns < 900) return 'Medium-Coarse';
  return 'Coarse';
}

// Resolve aiden grind (stored as Ode Gen 2 steps) into display values for the
// user's grinder + display mode. Single source for BeanCard, BeanDetailCard,
// and AidenModal — never render aidenGrind steps directly in UI.
export function formatAidenGrindValues(aidenGrind, preferences) {
  if (!aidenGrind) return null;
  const useMicrons = preferences?.grindSizeDisplay === 'microns';
  const grinderKey = preferences?.grinder;
  const grinderName = GRINDER_LABELS[grinderKey] || preferences?.grinderCustomName || 'Grinder';

  if (useMicrons) {
    const ss = `~${odeStepToMicrons(aidenGrind.singleServe)}µm`;
    const batch = `~${odeStepToMicrons(aidenGrind.batch)}µm`;
    return { grinderName, singleServe: ss, batch, singleServeText: ss, batchText: batch, mode: 'microns' };
  }

  // Translate to user's grinder if not Ode Gen 2
  if (grinderKey && grinderKey !== 'fellow-ode-gen2' && GRINDER_MICRON_SCALES[grinderKey]) {
    const ss = odeStepToGrinderSetting(aidenGrind.singleServe, grinderKey);
    const batch = odeStepToGrinderSetting(aidenGrind.batch, grinderKey);
    return {
      grinderName,
      singleServe: String(ss.setting),
      batch: String(batch.setting),
      singleServeText: `~${ss.setting}`,
      batchText: `~${batch.setting}`,
      mode: 'grinder',
    };
  }

  return {
    grinderName,
    singleServe: String(aidenGrind.singleServe),
    batch: String(aidenGrind.batch),
    singleServeText: String(aidenGrind.singleServe),
    batchText: String(aidenGrind.batch),
    mode: 'ode',
  };
}

export function formatAidenGrindLabel(aidenGrind, preferences) {
  const v = formatAidenGrindValues(aidenGrind, preferences);
  if (!v) return null;
  if (v.mode === 'microns') return `SS ${v.singleServeText} / Batch ${v.batchText}`;
  return `${v.grinderName}: SS ${v.singleServeText} / Batch ${v.batchText}`;
}

// Format grind label for aiden grind data (singleServe/batch steps)
function formatAidenGrind(bean, preferences) {
  return formatAidenGrindLabel(bean.aidenGrind, preferences);
}

// Format grind label for hand brew recipe data (has setting, description, and optional microns)
function formatHandBrewGrind(gs, preferences) {
  const useMicrons = preferences?.grindSizeDisplay === 'microns';
  const isOtherGrinder = !GRINDER_LABELS[preferences?.grinder];
  const grinderName = GRINDER_LABELS[preferences?.grinder] || preferences?.grinderCustomName || 'Grinder';

  if (useMicrons && gs.microns) {
    return isOtherGrinder
      ? `${gs.description}, ~${gs.microns}µm`
      : `${grinderName}: ~${gs.microns}µm`;
  }
  if (isOtherGrinder) {
    const microns = gs.microns ? ` (~${gs.microns}µm)` : '';
    return `${gs.description}${microns}`;
  }
  return `${grinderName}: ${gs.setting} ${gs.description}`;
}

const handBrewGrindLabel = (bean, preferences) => {
  if (bean.handBrewRecipe?.grindSize) {
    return formatHandBrewGrind(bean.handBrewRecipe.grindSize, preferences);
  }
  return formatAidenGrind(bean, preferences);
};

export const BREW_METHODS = {
  aiden: {
    label: 'Brew with Aiden',
    icon: '/images/aiden-icon.png',
    category: 'machine',
    grindLabel: (bean, preferences) => formatAidenGrind(bean, preferences),
  },
  v60: {
    label: 'V60 Recipe',
    icon: '/images/v60-icon.webp',
    category: 'pourover',
    grindLabel: handBrewGrindLabel,
  },
  kalita: {
    label: 'Kalita Wave Recipe',
    icon: '/images/kalita-icon.webp',
    category: 'pourover',
    grindLabel: handBrewGrindLabel,
  },
  chemex: {
    label: 'Chemex Recipe',
    icon: '/images/chemex-icon.webp',
    category: 'pourover',
    grindLabel: handBrewGrindLabel,
  },
  aeropress: {
    label: 'Aeropress Recipe',
    icon: '/images/aeropress-icon.webp',
    category: 'immersion',
    grindLabel: handBrewGrindLabel,
  },
  'french-press': {
    label: 'French Press Recipe',
    icon: '/images/frenchpress-icon.webp',
    category: 'immersion',
    grindLabel: handBrewGrindLabel,
  },
};

// Deprecated alias — existing users with 'handbrew' preference get V60 behavior
BREW_METHODS.handbrew = BREW_METHODS.v60;

// Derive BREW_DEVICES from BREW_METHODS (all non-aiden entries)
export const BREW_DEVICES = Object.entries(BREW_METHODS)
  .filter(([key]) => key !== 'aiden' && key !== 'handbrew')
  .map(([key, val]) => ({ key, label: val.label.replace(' Recipe', '') }));

// Helper: get the active brew method config
export const getBrewMethod = (brewMethodKey) => BREW_METHODS[brewMethodKey] || BREW_METHODS.aiden;

// Helper: check if a brew method key is a manual (non-aiden) method
export const isManualBrewMethod = (key) => key !== 'aiden' && BREW_METHODS[key];

// Normalize recipe step times for the BrewTimer contract: parse each step's
// time into strictly ascending timeSeconds. Models often emit two steps at
// the same moment ("0:00 rinse filter" + "0:00 add coffee") — nudge small
// overlaps (<=15s) forward by 5s instead of discarding the whole timer;
// demote timerReady only for genuinely broken sequences.
export function normalizeStepTimes(steps) {
  const repairs = [];
  let timerReady = true;
  let last = -1;
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const parsed = parseTimeString(step.time);
    if (parsed == null) {
      timerReady = false;
      repairs.push(`Step ${i} has unparseable time "${step.time}"`);
      step.timeSeconds = null;
      continue;
    }
    let assigned = parsed;
    if (assigned <= last) {
      if (last - assigned <= 15) {
        assigned = last + 5;
        repairs.push(`Step ${i} time "${step.time}" nudged to ${assigned}s (same-moment or overlapping step)`);
      } else {
        timerReady = false;
        repairs.push(`Step ${i} time "${step.time}" is not strictly after previous (${last}s)`);
        step.timeSeconds = null;
        continue;
      }
    }
    step.timeSeconds = assigned;
    last = assigned;
  }
  return { timerReady, lastStepSeconds: last >= 0 ? last : null, repairs };
}

// Parse "m:ss", "m:ss-m:ss" ranges (midpoint), "90s", "2 min" into seconds.
// Single source — handbrew repair and flashBrewTransform both consume this.
export function parseTimeString(str) {
  if (str == null) return null;
  const s = String(str).trim();
  if (!s) return null;

  const frag = /(?<!\d)(\d{1,2}):(\d{2})(?!\d)/;

  const rangeMatch = s.match(new RegExp(frag.source + String.raw`\s*[-–—]\s*` + frag.source));
  if (rangeMatch) {
    const m1 = parseInt(rangeMatch[1], 10);
    const s1 = parseInt(rangeMatch[2], 10);
    const m2 = parseInt(rangeMatch[3], 10);
    const s2 = parseInt(rangeMatch[4], 10);
    if (s1 >= 60 || s2 >= 60) return null;
    const a = m1 * 60 + s1;
    const b = m2 * 60 + s2;
    return Math.round((a + b) / 2);
  }

  if (/\d+:\d+\s*[-–—]\s*\d+:\d+/.test(s)) return null;

  const mmss = s.match(frag);
  if (mmss) {
    const mins = parseInt(mmss[1], 10);
    const secs = parseInt(mmss[2], 10);
    if (secs >= 60) return null;
    return mins * 60 + secs;
  }

  const minsMatch = s.match(/([\d.]+)\s*(?:minutes?|mins?|m)\b/i);
  if (minsMatch) {
    const val = parseFloat(minsMatch[1]);
    if (!isNaN(val) && val >= 0 && val <= 99) return Math.round(val * 60);
  }

  const secsMatch = s.match(/([\d.]+)\s*(?:seconds?|secs?|s)\b/i);
  if (secsMatch) {
    const val = parseFloat(secsMatch[1]);
    if (!isNaN(val) && val >= 0 && val <= 99 * 60) return Math.round(val);
  }

  return null;
}
