// Brew method registry — strategy pattern per Architecture Strategist recommendation
// Each tab renders method.label based on the user's preference.
// Adding a new brew method requires one entry here, not editing three tabs.

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

function grinderSettingToMicrons(setting, grinderKey) {
  const g = GRINDER_MICRON_SCALES[grinderKey];
  if (!g) return null;
  return Math.round(g.base + (setting - 1) * g.perStep);
}

// Translate Ode Gen 2 step to another grinder's setting via micron intermediary
export function odeStepToGrinderSetting(odeStep, grinderKey) {
  if (grinderKey === 'fellow-ode-gen2') return { setting: odeStep, label: 'Ode Gen 2' };
  const microns = odeStepToMicrons(odeStep);
  const g = GRINDER_MICRON_SCALES[grinderKey];
  if (!g) return { microns, description: descriptorForMicrons(microns) };
  const setting = Math.round(((microns - g.base) / g.perStep + 1) * 10) / 10;
  const clamped = Math.max(1, setting);
  return { setting: clamped, label: GRINDER_LABELS[grinderKey], microns };
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
