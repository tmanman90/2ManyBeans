// Intelligent-tasting-wizard verification harness — renders the real TastingTab with mock beans +
// a SINGLE tasting (so palate level = 1 → Tier-3 flavor chips are GATED, exercising the unlock).
// No Firebase/auth/AI. onAddTasting captures the saved record to window.__SAVED__ so the gate can
// assert the wizard writes the existing record shape with a real 6-axis fingerprint.
// Driven by scripts/verify-wizard.mjs.
import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import './src/styles/global.css';
import { UserPreferencesProvider } from './src/hooks/useUserProfile';
import { SubscriptionContext } from './src/contexts/SubscriptionContext';
import { PaywallProvider } from './src/hooks/usePaywall.jsx';
import { AuthContext } from './src/contexts/AuthContext';
import { TastingTab } from './src/tabs/TastingTab';
import { TastingWizard } from './src/components/tasting/TastingWizard';
import { initialAnswers } from './src/lib/tastingWizardSteps';

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
const evidenceMode = new URLSearchParams(window.location.search).get('evidence');
const drivenEvidenceModes = new Set(['bone-hidden', 'bone-revealed', 'loader-matrix', 'chat-thread', 'resume-prompt']);
if (evidenceMode === 'loader-matrix' || evidenceMode === 'chat-thread') {
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input?.url;
    if (String(url || '').includes('/api/claude')) return new Promise(() => {});
    return originalFetch(input, init);
  };
}
const subscription = {
  hasPro: true,
  hasUltra: false,
  plan: 'pro',
  status: 'active',
  cancelAtPeriodEnd: false,
  freeUsage: { aiScans: 0, tasteTests: 0, productShots: 0 },
  loading: false,
  firestoreLoaded: true,
  rcHydrated: true,
};

createRoot(document.getElementById('root')).render(
  <AuthContext value={{ user: null, logOut: () => {} }}>
    <SubscriptionContext.Provider value={subscription}>
      <PaywallProvider>
        <UserPreferencesProvider value={{ preferences: { brewMethod: 'aiden', canisterCount: 3 } }}>
          {['bone-hidden', 'bone-revealed', 'loader-matrix', 'chat-thread'].includes(evidenceMode) ? (
            <EvidenceWizard mode={evidenceMode} />
          ) : (
            <TastingHarness />
          )}
        </UserPreferencesProvider>
      </PaywallProvider>
    </SubscriptionContext.Provider>
  </AuthContext>
);

function TastingHarness() {
  const [wizardDraft, setWizardDraft] = useState(() => (evidenceMode === 'draft-switch' ? seededWizardDraft() : null));
  const [mounted, setMounted] = useState(true);

  useEffect(() => {
    window.__SET_TASTING_TAB_MOUNTED__ = setMounted;
    return () => { delete window.__SET_TASTING_TAB_MOUNTED__; };
  }, []);

  return (
    <>
      <EvidenceDriver />
      {mounted ? (
        <TastingTab
          beans={beans} tastings={tastings}
          onAddTasting={onAddTasting} onUpdateTasting={async () => 'id'} onDeleteTasting={async () => 'id'}
          wizardDraft={wizardDraft} onWizardDraftChange={setWizardDraft}
          pendingTastingBeanId={null} onPendingTastingConsumed={noop}
          isDemo={false} onDemoAction={noop}
        />
      ) : (
        <div data-other-tab="true">Other tab mounted</div>
      )}
    </>
  );
}

function EvidenceWizard({ mode }) {
  const answers = initialAnswers();
  answers.aromaChips = ['Berry'];
  answers.scores.fragranceAroma = 5;
  answers.text.firstsip = 'Bright & light';
  if (mode !== 'bone-hidden') answers.scores.acidity = 5;
  const draft = {
    beanId: 'b1',
    phase: 'steps',
    idx: 2,
    answers,
    revealedSteps: mode === 'bone-hidden' ? {} : { acidity: true },
  };
  return (
    <TastingWizard
      bean={beans[0]}
      beans={beans}
      tastings={tastings}
      draft={draft}
      isPro={mode === 'loader-matrix' || mode === 'chat-thread'}
      reduce={false}
      onSave={noop}
      onClose={noop}
      onSwitchToManual={noop}
      onDraftChange={noop}
    />
  );
}

function EvidenceDriver() {
  useEffect(() => {
    const mode = new URLSearchParams(window.location.search).get('evidence');
    if (!drivenEvidenceModes.has(mode)) return undefined;

    let cancelled = false;
    const wait = async (ms) => {
      await new Promise(resolve => setTimeout(resolve, ms));
      if (cancelled) throw new Error('evidence driver cancelled');
    };
    const button = (label) => [...document.querySelectorAll('button')]
      .find(b => (b.textContent || '').toLowerCase().includes(label.toLowerCase()));
    const clickButton = async (label) => {
      const target = button(label);
      if (!target) throw new Error(`Missing button: ${label}`);
      target.click();
      await wait(360);
    };
    const clickSlider = async () => {
      const sliders = [...document.querySelectorAll('[role="slider"]')];
      const target = sliders[sliders.length - 1];
      if (!target) throw new Error('Missing slider');
      const rect = target.getBoundingClientRect();
      const x = rect.left + rect.width * 0.5;
      const y = rect.top + rect.height * 0.5;
      target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, buttons: 1 }));
      target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y }));
      await wait(220);
    };

    const driveToAcidity = async () => {
      await wait(700);
      await clickButton('Start guided tasting');
      await wait(520);
      await clickButton("Let's taste it");
      await wait(520);
      await clickButton('Fruity');
      await clickButton('Berry');
      await clickSlider();
      await clickButton('Next');
      await wait(520);
      await clickButton('Next');
      await wait(520);
      await clickButton('Bright & light');
      await clickButton('Next');
      await wait(520);
    };

    const run = async () => {
      try {
        await driveToAcidity();
        if (mode === 'bone-hidden') {
          window.__EVIDENCE_READY__ = mode;
          return;
        }
        await clickSlider();
        await clickButton('Next');
        if (mode === 'bone-revealed') {
          window.__EVIDENCE_READY__ = mode;
          return;
        }
        if (mode === 'loader-matrix' || mode === 'chat-thread') {
          await wait(90);
          window.__EVIDENCE_READY__ = mode;
          return;
        }
        if (mode === 'resume-prompt') {
          await wait(120);
          document.querySelector('button[aria-label="Close"]')?.click();
          await wait(320);
          await clickButton('Leave');
          await wait(520);
          window.__EVIDENCE_READY__ = mode;
        }
      } catch (err) {
        window.__EVIDENCE_ERROR__ = err?.message || String(err);
      }
    };

    run();
    return () => { cancelled = true; };
  }, []);

  return null;
}

function seededWizardDraft() {
  const answers = initialAnswers();
  answers.aromaChips = ['Berry'];
  answers.scores.fragranceAroma = 5;
  answers.text.firstsip = 'Bright & light';
  answers.scores.acidity = 5;
  return {
    beanId: 'b1',
    phase: 'steps',
    idx: 2,
    answers,
    revealedSteps: { acidity: true },
  };
}
