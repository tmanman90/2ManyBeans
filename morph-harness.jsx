// Hero-morph verification harness — renders ShelfCard + BeanDetailCard inside one
// LayoutGroup so the shared-element bag morph runs exactly as in RotationTab, with
// no Firebase/auth. Driven by scripts/verify-morph.mjs (Playwright). Committed (not
// a throwaway) so the v2-harness gate is reproducible.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import './src/styles/global.css';
import { UserPreferencesProvider } from './src/hooks/useUserProfile';
import { ShelfCard } from './src/components/ShelfCard';
import { BeanDetailCard } from './src/components/BeanDetailCard';

const bean = {
  id: 'morph-demo', roaster: 'Stereoscope', name: 'COLOMBIA El Diviso - Ombligon',
  origin: 'Colombia', region: 'Bruselas, Huila', process: 'Mosto Anaerobic Natural',
  variety: 'Ombligon', farm: 'Finca El Diviso', producer: 'José Uribe',
  altitude: '1,900 masl', cupScore: '88', roastLevel: 'Light', bagSize: 100,
  roastDate: '2026-06-09', photoUrl: '/images/demo/bags/stereoscope-card-v3.png',
  peakStart: 14, peakEnd: 60, bagNotes: 'Blue Raspberry, Apple, Candy, Punchy, Cacao Nibs',
};

const actions = (
  <div style={{ padding: '12px 18px 14px', display: 'flex', flexDirection: 'column', gap: 9 }}>
    <div style={{ borderTop: '1px solid rgba(70,41,26,0.10)' }} />
    <div style={{ height: 50, borderRadius: 14, background: 'linear-gradient(176deg,#B87846,#4A2F1E)' }} />
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
      {['Taste', 'Learn', 'Finish'].map(l => <div key={l} style={{ height: 48, borderRadius: 12, background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.65)' }} />)}
    </div>
  </div>
);

function App() {
  const [detail, setDetail] = useState(null);
  const [originRect, setOriginRect] = useState(null);
  return (
    <>
      <div style={{ maxWidth: 346, margin: '20px auto' }} data-testid="shelf">
        <ShelfCard bean={bean} actions={actions} onOpenDetail={(b, rect) => { setOriginRect(rect || null); setDetail(b); }} />
      </div>
      {detail && (
        <BeanDetailCard bean={detail} tastings={[]} originRect={originRect} onClose={() => setDetail(null)} />
      )}
    </>
  );
}

createRoot(document.getElementById('root')).render(
  <UserPreferencesProvider value={{ preferences: { brewMethod: 'fellow-ode-gen2' } }}>
    <App />
  </UserPreferencesProvider>
);
