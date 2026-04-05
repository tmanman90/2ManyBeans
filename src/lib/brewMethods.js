// Brew method registry — strategy pattern per Architecture Strategist recommendation
// Each tab renders method.label and method.icon based on the user's preference.
// Adding a new brew method (e.g., espresso) requires one entry here, not editing three tabs.
import { lazy } from 'react';

export const BREW_METHODS = {
  aiden: {
    label: 'Brew with Aiden',
    icon: '/images/aiden-icon.png',
    Modal: lazy(() => import('../components/AidenModal').then(m => ({ default: m.AidenModal }))),
    grindLabel: (bean, preferences) => {
      if (!bean.aidenGrind) return null;
      const grinderName = preferences?.grinder === 'fellow-ode-gen2' ? 'Ode Gen 2' : 'Grinder';
      return `${grinderName}: SS ${bean.aidenGrind.singleServe} / Batch ${bean.aidenGrind.batch}`;
    },
  },
  handbrew: {
    label: 'Hand Brew Recipe',
    icon: '/images/handbrew-icon.png',
    Modal: null, // Phase 3: lazy(() => import('../components/HandBrewModal'))
    grindLabel: (bean, preferences) => {
      // Phase 3 will add handBrewRecipe display
      if (!bean.aidenGrind) return null;
      const grinderName = preferences?.grinder === 'fellow-ode-gen2' ? 'Ode Gen 2' : 'Grinder';
      return `${grinderName}: SS ${bean.aidenGrind.singleServe} / Batch ${bean.aidenGrind.batch}`;
    },
  },
};

// Helper: get the active brew method config
export const getBrewMethod = (brewMethodKey) => BREW_METHODS[brewMethodKey] || BREW_METHODS.aiden;
