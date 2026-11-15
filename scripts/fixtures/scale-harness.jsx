// Brew timer with the fake scale (served with VITE_FAKE_SCALE=1) for
// scripts/verify-scale-ui.mjs. A Kalita 185 recipe, 20 g, with one earlier
// scale brew of the bean so the summary draws the dotted reference line.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrewTimer } from '../../src/components/BrewTimer.jsx';
import { AuthContext } from '../../src/contexts/AuthContext.jsx';
import { generateKalitaRecipe } from '../../src/lib/kalitaAdapter.js';

const recipe = generateKalitaRecipe({}, { size: '185', dose: 20, grinder: 'fellow-ode-gen2' });
const earlierCurve = Array.from({ length: 200 }, (_, second) => Math.min(318, second < 12 ? second * 5 : second < 40 ? 60 : second < 58 ? 60 + (second - 40) * 4.6 : second < 90 ? 144 : 144 + (second - 90) * 5));
const bean = {
  id: 'fixture-kenya',
  name: 'Kenya AA, washed',
  handBrewTimingMemory: [{
    sessionId: 'earlier', beanId: 'fixture-kenya', device: 'kalita', mode: 'hot', createdAt: 1000,
    scaleSummary: { protocol: 'fake', firstWaterAtMs: 1000, curve: earlierCurve, perStep: [], finalWaterG: 318 },
  }],
};

function Harness() {
  const [open, setOpen] = useState(true);
  window.__saved = window.__saved || [];
  return (
    <>
      <button id="reopen" onClick={() => setOpen(true)}>Reopen</button>
      <BrewTimer
        open={open}
        recipe={recipe}
        bean={bean}
        onClose={() => setOpen(false)}
        onStartTasting={() => setOpen(false)}
        onSaveTimingEvent={async (event) => { window.__saved.push(event); return { status: 'saved' }; }}
      />
    </>
  );
}

createRoot(document.getElementById('root')).render(
  <AuthContext.Provider value={{ user: null }}>
    <Harness />
  </AuthContext.Provider>,
);
