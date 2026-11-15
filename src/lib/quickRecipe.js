// Quick Recipe: which brewers it offers, and the Archive record it leaves behind.
import { BREW_DEVICES, isEspressoBrewMethod, isManualBrewMethod } from './brewMethods.js';
import { buildNewBeanData } from './beanBuilder.js';
import { today } from './peakStatus.js';

// Every brewer the app can make a recipe for, in the order the picker shows them.
export const QUICK_RECIPE_BREWERS = [
  { key: 'aiden', label: 'Aiden' },
  ...BREW_DEVICES,
  { key: 'espresso', label: 'Espresso' },
];

// The brewer a Quick Recipe starts on: the one picked in Settings.
export const quickRecipeStartBrewer = (brewMethod) => {
  if (isEspressoBrewMethod(brewMethod)) return 'espresso';
  return isManualBrewMethod(brewMethod) ? brewMethod : 'aiden';
};

// Which recipe pipeline (and modal) a brewer uses.
export const quickRecipeMethod = (brewer) => (
  brewer === 'aiden' || brewer === 'espresso' ? brewer : 'handbrew'
);

// A scanned bean is kept in the Archive (finished today) so the app remembers
// it was brewed. "Save to Inventory" later moves it to sealed inventory.
export const buildQuickRecipeRecord = (scanData) => ({
  ...buildNewBeanData(scanData),
  status: 'FINISHED',
  finishDate: today(),
});
