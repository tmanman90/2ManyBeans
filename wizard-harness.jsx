// Intelligent-tasting-wizard verification harness — renders the real TastingTab with mock beans +
// a SINGLE tasting (so palate level = 1 → Tier-3 flavor chips are GATED, exercising the unlock).
// No Firebase/auth/AI. onAddTasting captures the saved record to window.__SAVED__ so the gate can
// assert the wizard writes the existing record shape with a real 6-axis fingerprint.
// Driven by scripts/verify-wizard.mjs.
import { createRoot } from 'react-dom/client';
import './src/styles/global.css';
import { UserPreferencesProvider } from './src/hooks/useUserProfile';
import { SubscriptionProvider } from './src/contexts/SubscriptionContext';
import { PaywallProvider } from './src/hooks/usePaywall.jsx';
import { AuthContext } from './src/contexts/AuthContext';
import { TastingTab } from './src/tabs/TastingTab';

const beans = [
  { id: 'b1', roaster: 'Onyx', name: 'Geometry Blend', origin: 'Ethiopia', process: 'Natural', roastLevel: 'Light', altitude: '1950m', status: 'ACTIVE', jarSlot: 1 },
  { id: 'b2', roaster: 'Sey', name: 'Kenya Karinga', origin: 'Kenya', process: 'Washed', status: 'SEALED' },
];

// One cup → palateLevel = 1 (Tier-3 locked). Lets the gate verify the family-first path + unlock copy.
const tastings = [
  { id: 't1', beanId: 'b1', date: '2026-06-20', rating: 4, oneWord: 'Floral', aroma: 'Jasmine', acidity: 'Bright', body: 'Light', finish: 'Clean', notes: 'Tea-like.', tastingScores: { fragranceAroma: 8, acidity: 8, sweetness: 5, body: 3, flavor: 7, balance: 6 } },
];

const noop = () => {};
window.__SAVED__ = null;
const onAddTasting = async (record) => { window.__SAVED__ = record; return 'new-id'; };

createRoot(document.getElementById('root')).render(
  <AuthContext value={{ user: null, logOut: () => {} }}>
    <SubscriptionProvider uid={null}>
      <PaywallProvider>
        <UserPreferencesProvider value={{ preferences: { brewMethod: 'aiden', canisterCount: 3 } }}>
          <TastingTab
            beans={beans} tastings={tastings}
            onAddTasting={onAddTasting} onUpdateTasting={async () => 'id'} onDeleteTasting={async () => 'id'}
            pendingTastingBeanId={null} onPendingTastingConsumed={noop}
            isDemo={false} onDemoAction={noop}
          />
        </UserPreferencesProvider>
      </PaywallProvider>
    </SubscriptionProvider>
  </AuthContext>
);
