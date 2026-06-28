// Tasting editorial-100x verification harness — renders the real TastingTab with mock
// beans + tastings (no Firebase/auth/AI). Driven by scripts/verify-tasting.mjs.
import { createRoot } from 'react-dom/client';
import './src/styles/global.css';
import { UserPreferencesProvider } from './src/hooks/useUserProfile';
import { SubscriptionProvider } from './src/contexts/SubscriptionContext';
import { PaywallProvider } from './src/hooks/usePaywall.jsx';
import { AuthContext } from './src/contexts/AuthContext';
import { TastingTab } from './src/tabs/TastingTab';

const beans = [
  { id: 'b1', roaster: 'Arcane', name: 'Kotowa Estate', origin: 'Panama', process: 'Washed', status: 'ACTIVE', jarSlot: 1, photoUrl: '/images/demo/bags/stereoscope-card-v3.png' },
  { id: 'b2', roaster: 'Onyx', name: 'Geometry Blend', origin: 'Ethiopia', process: 'Natural', status: 'ACTIVE', jarSlot: 2 },
  { id: 'b3', roaster: 'Sey', name: 'Kenya Karinga', origin: 'Kenya', process: 'Washed', status: 'SEALED' },
];

// Varied tastings: one with real 6-axis tastingScores (full fingerprint), one with only
// qualitative axes (presence fingerprint), one sparse (rating only → no fingerprint, degrade).
const tastings = [
  { id: 't1', beanId: 'b1', date: '2026-06-20', rating: 5, oneWord: 'Silky', aroma: 'Cherry, Jam', acidity: 'Bright', sweetness: 'High', body: 'Full', finish: 'Long', firstSip: 'Juicy', notes: 'Syrupy ripe cherry, stunning.', tastingScores: { fragranceAroma: 8, acidity: 7, sweetness: 6, body: 7, flavor: 8, balance: 7 } },
  { id: 't2', beanId: 'b2', date: '2026-05-12', rating: 4, oneWord: 'Floral', aroma: 'Jasmine', acidity: 'Sparkling', body: 'Light', finish: 'Clean', notes: 'Tea-like and bright.' },
  { id: 't3', beanId: 'b3', date: '2026-04-01', rating: 4, notes: 'Solid, classic Kenyan.' },
];
const noop = () => {};
const noopAsync = async () => 'id';

createRoot(document.getElementById('root')).render(
  <AuthContext value={{ user: null, logOut: () => {} }}>
    <SubscriptionProvider uid={null}>
      <PaywallProvider>
        <UserPreferencesProvider value={{ preferences: { brewMethod: 'aiden', canisterCount: 3 } }}>
          <TastingTab
            beans={beans} tastings={tastings}
            onAddTasting={noopAsync} onUpdateTasting={noopAsync} onDeleteTasting={noopAsync}
            pendingTastingBeanId={null} onPendingTastingConsumed={noop}
            isDemo={false} onDemoAction={noop}
          />
        </UserPreferencesProvider>
      </PaywallProvider>
    </SubscriptionProvider>
  </AuthContext>
);
