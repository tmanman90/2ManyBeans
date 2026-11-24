// The celebration sheets mounted the way the app mounts them, for
// scripts/verify-celebration-sheets.mjs:
//   - FinishBagPrompt as RotationTab.jsx does: `open` follows the bean being
//     finished, and onClose clears it (and would show the toast).
//   - CelebrationSheet as RotationTab.jsx does for a rated bag: `open` follows
//     the celebrating bean; the automatic close shows the toast, the X does not.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/styles/global.css';
import { FinishBagPrompt } from '../../src/components/FinishBagPrompt.jsx';
import { CelebrationSheet } from '../../src/components/CelebrationSheet.jsx';

const BEANS = {
  A: { id: 'bean-a', name: 'Bombe Bensa', roaster: 'Moving Coffee' },
  B: { id: 'bean-b', name: 'Carmen Estate', roaster: 'Onyx' },
};
window.__log = [];
const log = (event) => window.__log.push({ ...event, at: Math.round(performance.now()) });

function Harness() {
  const [finishPrompt, setFinishPrompt] = useState(null);
  const [celebratingBean, setCelebratingBean] = useState(null);
  return (
    <>
      <button id="openA" onClick={() => setFinishPrompt(BEANS.A)}>Finish A</button>
      <button id="openB" onClick={() => setFinishPrompt(BEANS.B)}>Finish B</button>
      <button id="celebrateA" onClick={() => setCelebratingBean(BEANS.A)}>Celebrate A</button>
      <button id="celebrateB" onClick={() => setCelebratingBean(BEANS.B)}>Celebrate B</button>
      <FinishBagPrompt
        open={!!finishPrompt}
        onClose={(msg) => { log({ type: 'close', bean: finishPrompt?.id || null, msg: msg || null }); setFinishPrompt(null); }}
        bean={finishPrompt}
        onFinish={async (id) => log({ type: 'finish', bean: id })}
        onAddTasting={async (tasting) => { log({ type: 'tasting', bean: tasting.beanId }); return `t-${tasting.beanId}`; }}
        onUpdateTasting={() => {}}
      />
      <CelebrationSheet
        open={!!celebratingBean}
        clip="ruphus-fist-pump"
        title="Bag finished!"
        subtitle="On to the next one, brewer."
        afterPlayMs={2200}
        onDone={() => { log({ type: 'sheet-done', bean: celebratingBean?.id || null }); setCelebratingBean(null); }}
        onClose={() => { log({ type: 'sheet-close', bean: celebratingBean?.id || null }); setCelebratingBean(null); }}
      />
    </>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);
