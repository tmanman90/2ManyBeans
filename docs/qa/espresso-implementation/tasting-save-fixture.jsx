import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'framer-motion';
import { TastingWizard } from '../../../src/components/tasting/TastingWizard.jsx';
import { initialAnswers } from '../../../src/lib/tastingWizardSteps.js';
import '../../../src/styles/global.css';

// Explicit component-boundary fault fixture. Actual wizard; save transport is
// controlled by the browser test. Real App persistence is exercised separately.
const bean = { id: 'failure-cup', name: 'Failure-path cup', roastLevel: 'medium' };
const answers = initialAnswers();
Object.keys(answers.scores).forEach(key => { answers.scores[key] = 6; });
answers.notes = 'Keep these observations.';
answers.oneWord = 'Cocoa';
function Fixture() {
  const [draft, setDraft] = useState({ beanId: bean.id, phase: 'reveal', idx: 7, answers, brewContext: { version: 1, method: 'espresso', drinkType: 'straight' } });
  const [open, setOpen] = useState(true);
  const [saved, setSaved] = useState(null);
  const save = async record => {
    const response = await fetch('/fixture-tasting-save', { method: 'POST', body: JSON.stringify(record) });
    if (!response.ok) return false;
    setSaved(record); setDraft(null); setOpen(false); return true;
  };
  return <>
    {!open && <button onClick={() => setOpen(true)}>{draft ? 'Resume draft' : 'Start guided tasting'}</button>}
    <output data-fixture-state>{JSON.stringify({ draft, saved })}</output>
    {open && <TastingWizard bean={bean} beans={[bean]} draft={draft} reduce isPro={false}
      onDraftChange={setDraft} onSave={save} onClose={() => setOpen(false)} />}
  </>;
}
createRoot(document.getElementById('root')).render(<MotionConfig reducedMotion="always"><Fixture /></MotionConfig>);
