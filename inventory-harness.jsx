// Inventory roaster-rails verification harness — renders the real InventoryTab with
// multi-roaster SEALED mock data (no Firebase/auth). Driven by scripts/verify-inventory.mjs.
import { createRoot } from 'react-dom/client';
import './src/styles/global.css';
import { UserPreferencesProvider } from './src/hooks/useUserProfile';
import { SubscriptionProvider } from './src/contexts/SubscriptionContext';
import { PaywallProvider } from './src/hooks/usePaywall.jsx';
import { AuthContext } from './src/contexts/AuthContext';
import { InventoryTab } from './src/tabs/InventoryTab';

const mk = (id, roaster, name) => ({
  id, roaster, name, status: 'SEALED', origin: 'Colombia', region: 'Huila', process: 'Washed',
  variety: 'Caturra', roastLevel: 'Light', bagSize: 250, roastDate: '2026-06-12',
  photoUrl: '/images/demo/bags/stereoscope-card-v3.png', peakStart: 14, peakEnd: 60,
  bagNotes: 'Apple, Candy, Cherry',
});

// Deliberately out of alpha order in the array, to prove the tab sorts them.
const beans = [
  mk('z1', 'Zephyr Coffee', 'Zephyr One'),
  mk('z2', 'Zephyr Coffee', 'Zephyr Two'),
  mk('a1', "Apollon's Gold", 'Gold One'),
  mk('a2', "Apollon's Gold", 'Gold Two'),
  mk('a3', "Apollon's Gold", 'Gold Three'),
  mk('m1', 'Stereoscope', 'Colombia El Diviso – Ombligon'),
];
const noop = () => {};

createRoot(document.getElementById('root')).render(
  <AuthContext value={{ user: null, logOut: () => {} }}>
    <SubscriptionProvider uid={null}>
      <PaywallProvider>
        <UserPreferencesProvider value={{ preferences: { brewMethod: 'aiden', canisterCount: 3 } }}>
          <InventoryTab
            uid="harness" beans={beans} tastings={[]}
            onOpenBean={noop} onAddBean={noop} updateBean={noop} deleteBean={noop} onFinishBean={noop}
            addTasting={noop} updateTasting={noop} getBeanById={(id) => beans.find(b => b.id === id)}
            onStartTastingSession={noop} isDemo={false} onDemoAction={noop}
          />
        </UserPreferencesProvider>
      </PaywallProvider>
    </SubscriptionProvider>
  </AuthContext>
);
