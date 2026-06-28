// Chat "Ruphus's study" verification harness — renders the real ChatTab with a fixed
// PRO subscription value (so handleSend reaches the optimistic user bubble + thinking
// indicator) and mock beans/tastings. No live AI key — the send call errors after the
// bubbles render, which the verify script accounts for. Driven by scripts/verify-chat.mjs.
import { createRoot } from 'react-dom/client';
import './src/styles/global.css';
import { UserPreferencesProvider } from './src/hooks/useUserProfile';
import { SubscriptionContext } from './src/contexts/SubscriptionContext';
import { PaywallProvider } from './src/hooks/usePaywall.jsx';
import { AuthContext } from './src/contexts/AuthContext';
import { ChatTab } from './src/tabs/ChatTab';

const PRO = {
  hasPro: true, hasUltra: false, plan: 'pro', status: 'active', cancelAtPeriodEnd: false,
  freeUsage: { aiScans: 0, tasteTests: 0, productShots: 0 },
  loading: false, firestoreLoaded: true, rcHydrated: true,
};

const beans = [
  { id: 'b1', roaster: 'Arcane', name: 'Kotowa Estate', origin: 'Panama', process: 'Washed', status: 'ACTIVE', jarSlot: 1 },
  { id: 'b2', roaster: 'Onyx', name: 'Geometry Blend', origin: 'Ethiopia', process: 'Natural', status: 'SEALED' },
];
const tastings = [{ id: 't1', beanId: 'b1', date: '2026-06-20', rating: 5, oneWord: 'Silky' }];
const noop = () => {};
const noopAsync = async () => {};

createRoot(document.getElementById('root')).render(
  <AuthContext value={{ user: null, logOut: () => {} }}>
    <SubscriptionContext value={PRO}>
      <PaywallProvider>
        <UserPreferencesProvider value={{ preferences: { brewMethod: 'aiden', canisterCount: 3 } }}>
          <ChatTab
            beans={beans} tastings={tastings}
            addBean={noopAsync} updateBean={noopAsync} addTasting={noopAsync} updateTasting={noopAsync}
            isActive={true} onStartTastingSession={noop} isDemo={false} onDemoAction={noop}
          />
        </UserPreferencesProvider>
      </PaywallProvider>
    </SubscriptionContext>
  </AuthContext>
);
