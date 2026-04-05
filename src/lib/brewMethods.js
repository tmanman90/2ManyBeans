// Brew method registry — strategy pattern per Architecture Strategist recommendation
// Each tab renders method.label based on the user's preference.
// Adding a new brew method (e.g., espresso) requires one entry here, not editing three tabs.

const GRINDER_LABELS = {
  'fellow-ode-gen2': 'Ode Gen 2',
  'fellow-opus': 'Fellow Opus',
  'baratza-encore-esp': 'Encore ESP',
  'comandante-c40': 'Comandante C40',
  '1zpresso-jx-pro': 'JX-Pro',
  'baratza-virtuoso-plus': 'Virtuoso+',
};

export const BREW_METHODS = {
  aiden: {
    label: 'Brew with Aiden',
    icon: '/images/aiden-icon.png',
    grindLabel: (bean, preferences) => {
      if (!bean.aidenGrind) return null;
      const grinderName = GRINDER_LABELS[preferences?.grinder] || 'Grinder';
      return `${grinderName}: SS ${bean.aidenGrind.singleServe} / Batch ${bean.aidenGrind.batch}`;
    },
  },
  handbrew: {
    label: 'Hand Brew Recipe',
    icon: '/images/handbrew-icon.png',
    grindLabel: (bean, preferences) => {
      // Show hand brew recipe grind if available, fall back to aiden grind
      if (bean.handBrewRecipe?.grindSize) {
        const grinderName = GRINDER_LABELS[preferences?.grinder] || 'Grinder';
        const gs = bean.handBrewRecipe.grindSize;
        const microns = gs.microns ? ` (~${gs.microns}µm)` : '';
        return `${grinderName}: ${gs.setting} ${gs.description}${microns}`;
      }
      if (!bean.aidenGrind) return null;
      const grinderName = GRINDER_LABELS[preferences?.grinder] || 'Grinder';
      return `${grinderName}: SS ${bean.aidenGrind.singleServe} / Batch ${bean.aidenGrind.batch}`;
    },
  },
};

// Helper: get the active brew method config
export const getBrewMethod = (brewMethodKey) => BREW_METHODS[brewMethodKey] || BREW_METHODS.aiden;
