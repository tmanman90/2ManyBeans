// Archive trophy-redesign verification harness — renders the real ArchiveTab with
// multi-year FINISHED mock beans (5★ unforgettable cups + a no-photo case, no Firebase/auth).
// Driven by scripts/verify-archive.mjs.
import { createRoot } from 'react-dom/client';
import './src/styles/global.css';
import { UserPreferencesProvider } from './src/hooks/useUserProfile';
import { SubscriptionProvider } from './src/contexts/SubscriptionContext';
import { PaywallProvider } from './src/hooks/usePaywall.jsx';
import { AuthContext } from './src/contexts/AuthContext';
import { ArchiveTab } from './src/tabs/ArchiveTab';

const PHOTO = '/images/demo/bags/stereoscope-card-v3.png';
const mk = (id, roaster, name, finishDate, photo, extra = {}) => ({
  id, roaster, name, status: 'FINISHED', finishDate, roastDate: '2026-01-01', openDate: '2026-01-10',
  origin: 'Colombia', region: 'Huila', process: 'Washed', variety: 'Caturra', roastLevel: 'Light',
  bagSize: 250, photoUrl: photo ? PHOTO : null, bagNotes: 'Apple, Cherry, Caramel', ...extra,
});

// Two years; some 5★ (via tastings), one 5★ WITHOUT a photo (morph fallback case).
const beans = [
  mk('a1', 'Arcane', 'Kotowa Estate', '2026-05-10', true, { aidenRecipe: { ratio: '1:16', bloomTime: '45s', pulseCount: 4 } }),
  mk('a2', 'Zephyr', 'Ceremony Blend', '2026-03-02', true),
  mk('a3', 'Stereoscope', 'Colombia El Diviso', '2026-01-15', false),
  mk('a4', 'Apollon', 'Gesha One', '2025-11-20', true),
  mk('a5', 'Onyx', 'Mystery Box', '2025-08-05', true),
  mk('a6', 'Sey', 'Old Faithful', '2025-02-01', true),
  // a7: rated but NO words (no oneWord/notes/aroma) → must degrade to a meta line, not an empty quote.
  mk('a7', 'Kurasu', 'Kenya Peaberry', '2025-05-15', true, { origin: 'Kenya', process: 'Natural' }),
];

// Best rating per bean: a1/a3/a5 = 5★ (unforgettable cups). Rich fields so the
// tasting-hero (rating + one-word + pull-quote) and the card-back full tasting render.
const tastings = [
  { id: 't1', beanId: 'a1', date: '2026-05-01', rating: 5, oneWord: 'Silky', notes: 'Stunning jammy cherry, syrupy body.', aroma: 'Cherry, Jam', body: 'Full', acidity: 'Bright', finish: 'Long', method: 'V60' },
  { id: 't2', beanId: 'a2', date: '2026-02-20', rating: 4, oneWord: 'Clean', notes: 'Bright citrus, tea-like.', body: 'Light', finish: 'Crisp' },
  { id: 't3', beanId: 'a3', date: '2026-01-10', rating: 5, oneWord: 'Wild', notes: 'Funky tropical, boozy.' },
  { id: 't4', beanId: 'a4', date: '2025-11-10', rating: 3, oneWord: 'Fine', notes: 'Pleasant, forgettable.' },
  { id: 't5', beanId: 'a5', date: '2025-08-01', rating: 5, oneWord: 'Floral', notes: 'Best ever — jasmine and peach.' },
  { id: 't7', beanId: 'a7', date: '2025-05-10', rating: 4 }, // rated, no words → meta fallback
];
const noop = () => {};

createRoot(document.getElementById('root')).render(
  <AuthContext value={{ user: null, logOut: () => {} }}>
    <SubscriptionProvider uid={null}>
      <PaywallProvider>
        <UserPreferencesProvider value={{ preferences: { brewMethod: 'aiden', canisterCount: 3 } }}>
          <ArchiveTab
            beans={beans} tastings={tastings}
            updateBean={noop} deleteBean={noop}
            getBeanById={(id) => beans.find(b => b.id === id)}
            uid="harness" isDemo={false} onDemoAction={noop}
          />
        </UserPreferencesProvider>
      </PaywallProvider>
    </SubscriptionProvider>
  </AuthContext>
);
