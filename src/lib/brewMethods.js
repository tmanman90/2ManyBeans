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

// Grinder micron scales — data-driven, not per-grinder formulas
export const GRINDER_MICRON_SCALES = {
  'fellow-ode-gen2': { base: 200, perStep: 70 },
  'fellow-opus': { base: 150, perStep: 150 },
  'baratza-encore-esp': { base: 100, perStep: 29.5 },
  'comandante-c40': { base: 25, perStep: 25 },
  '1zpresso-jx-pro': { base: -4, perStep: 5.2 },
  'baratza-virtuoso-plus': { base: 150, perStep: 29.5 },
};

// Approximate micron value for Ode Gen 2 step (linear: ~200µm at 1, +70µm per step)
export function odeStepToMicrons(step) {
  return Math.round(200 + (step - 1) * 70);
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

function descriptorForMicrons(microns) {
  if (microns < 300) return 'Fine';
  if (microns < 500) return 'Medium-Fine';
  if (microns < 700) return 'Medium';
  if (microns < 900) return 'Medium-Coarse';
  return 'Coarse';
}

// Format grind label for aiden grind data (singleServe/batch steps)
function formatAidenGrind(bean, preferences) {
  if (!bean.aidenGrind) return null;
  const useMicrons = preferences?.grindSizeDisplay === 'microns';
  const grinderKey = preferences?.grinder;
  const grinderName = GRINDER_LABELS[grinderKey] || preferences?.grinderCustomName || 'Grinder';

  if (useMicrons) {
    const ssMicrons = odeStepToMicrons(bean.aidenGrind.singleServe);
    const batchMicrons = odeStepToMicrons(bean.aidenGrind.batch);
    return `SS ~${ssMicrons}µm / Batch ~${batchMicrons}µm`;
  }

  // Translate to user's grinder if not Ode Gen 2
  if (grinderKey && grinderKey !== 'fellow-ode-gen2' && GRINDER_MICRON_SCALES[grinderKey]) {
    const ss = odeStepToGrinderSetting(bean.aidenGrind.singleServe, grinderKey);
    const batch = odeStepToGrinderSetting(bean.aidenGrind.batch, grinderKey);
    return `${grinderName}: SS ~${ss.setting} / Batch ~${batch.setting}`;
  }

  return `${grinderName}: SS ${bean.aidenGrind.singleServe} / Batch ${bean.aidenGrind.batch}`;
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
