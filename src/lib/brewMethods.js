// Brew method registry — strategy pattern per Architecture Strategist recommendation
// Each tab renders method.label based on the user's preference.
// Adding a new brew method (e.g., espresso) requires one entry here, not editing three tabs.

export const GRINDER_LABELS = {
  'fellow-ode-gen2': 'Ode Gen 2',
  'fellow-opus': 'Fellow Opus',
  'baratza-encore-esp': 'Encore ESP',
  'comandante-c40': 'Comandante C40',
  '1zpresso-jx-pro': 'JX-Pro',
  'baratza-virtuoso-plus': 'Virtuoso+',
};

// Format grind label for aiden grind data (singleServe/batch steps only, no microns)
function formatAidenGrind(bean, preferences) {
  if (!bean.aidenGrind) return null;
  const grinderName = GRINDER_LABELS[preferences?.grinder] || preferences?.grinderCustomName || 'Grinder';
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

export const BREW_METHODS = {
  aiden: {
    label: 'Brew with Aiden',
    icon: '/images/aiden-icon.png',
    grindLabel: (bean, preferences) => formatAidenGrind(bean, preferences),
  },
  handbrew: {
    label: 'Hand Brew Recipe',
    icon: '/images/handbrew-icon.png',
    grindLabel: (bean, preferences) => {
      if (bean.handBrewRecipe?.grindSize) {
        return formatHandBrewGrind(bean.handBrewRecipe.grindSize, preferences);
      }
      return formatAidenGrind(bean, preferences);
    },
  },
};

// Helper: get the active brew method config
export const getBrewMethod = (brewMethodKey) => BREW_METHODS[brewMethodKey] || BREW_METHODS.aiden;
