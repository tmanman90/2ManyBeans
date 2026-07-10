// Onboarding-100x verification harness — mounts the REAL <OnboardingFlow> standalone
// under vite with a fake authed user. No real Firebase Auth session, no RevenueCat, no
// camera/Gemini calls — scripts/verify-onboarding.mjs drives the full 13-screen flow
// end to end via the injectable adapter `window.__ONBOARDING_TEST__` (see the seam
// comments at each call site in src/components/onboarding/**: R10Demo.jsx,
// RedemptionInline.jsx, useOnboardingPaywall.js, OnboardingFlow.jsx). Undefined in
// production = zero behavior change.
//
// Firestore/Auth ARE still imported transitively (OnboardingFlow -> firebase.js,
// onboardingAnalytics.js) but never touched: auth.currentUser is null (no sign-in
// happens here) so logOnboardingEvent() no-ops, and the fake user has no email so
// finish()'s emailList mirror write is also a no-op. The terminal profile write itself
// goes through the finishProfile test seam, never through real createProfile/
// completeOnboarding Firestore calls.
import { createRoot } from 'react-dom/client';
import { useEffect, useMemo, useState } from 'react';
import './src/styles/global.css';
import { SubscriptionContext } from './src/contexts/SubscriptionContext';
import { PaywallProvider } from './src/hooks/usePaywall.jsx';
import { RedeemError } from './src/lib/redeemCode';
import OnboardingFlow from './src/components/onboarding/OnboardingFlow';

// Exposes the REAL RedeemError class so the Playwright driver (running arbitrary
// functions in the browser context via page.evaluate) can construct real instances
// for the redeemCode() override. RedemptionInline's catch block does
// `err instanceof RedeemError` — a plain `{code}` object would silently fall through
// to the generic error copy instead of the per-code A6 string.
window.__ONBOARDING_TEST_HELPERS__ = { RedeemError };

const FAKE_USER = {
  uid: 'harness-uid',
  displayName: 'Harness Tester',
  email: null, // keeps OnboardingFlow.finish()'s emailList mirror write a no-op
  photoURL: null,
  providerData: [{ providerId: 'google.com' }],
};

// Default capture target when a scenario doesn't inject its own
// window.__ONBOARDING_TEST__.finishProfile override.
window.__SAVED_PROFILE__ = null;
async function defaultFinishProfile(answers) {
  window.__SAVED_PROFILE__ = answers;
}

// URL presets so the U12 SIMULATOR evidence capture can drive the harness by
// tapping alone (no Playwright context to inject mocks). ?preset=scan|redeem
// configures the scan/redeem seams; ?step=rN seeds the app's own resume
// mechanism. Evidence-only sugar — verify-onboarding.mjs injects its own
// mocks via addInitScript and never passes these params.
(() => {
  const params = new URLSearchParams(window.location.search);
  const preset = params.get('preset');
  const step = params.get('step');
  if (!preset && !step) return;
  const w = window;
  w.__ONBOARDING_TEST__ = w.__ONBOARDING_TEST__ || {};
  if (preset === 'scan') {
    w.__ONBOARDING_TEST__.captureBagPhoto = async () => 'data:image/jpeg;base64,';
    w.__ONBOARDING_TEST__.scanBeanLabel = async () => {
      await new Promise((r) => setTimeout(r, 1400)); // let the loader frame exist
      return {
        roaster: 'MOVING COFFEE', name: 'Bombe Bensa', origin: 'Ethiopia',
        variety: 'Heirloom & Landrace', process: 'Natural', roastDate: '2026-06-20',
        bagNotes: 'Crunchy apricot / Lemon zest / Rainier cherry',
      };
    };
  }
  if (preset === 'redeem') {
    w.__ONBOARDING_TEST__.redeemCode = async () => {
      await new Promise((r) => setTimeout(r, 500));
      // Flip the mock entitlement right after the "server" grants it, so the
      // celebration beat is reachable by tapping alone.
      setTimeout(() => w.__ONBOARDING_TEST__?.paywall?.simulateEntitlement?.(), 100);
      return { ok: true };
    };
    w.__ONBOARDING_TEST__.paywall = { ...(w.__ONBOARDING_TEST__.paywall || {}), status: 'ready' };
  }
  if (step) {
    const base = {
      goal: 'v60', pain: 'inconsistent',
      tinderCards: [
        { id: 'c1_sweetness', swipe: 'yes' }, { id: 'c2_acidity', swipe: 'yes' },
        { id: 'c3_body', swipe: 'no' }, { id: 'c4_clean_funky', swipe: 'yes' },
        { id: 'c5_fruit_nutty', swipe: 'no' },
      ],
      preferences: { grinder: 'fellow-ode-gen2', grinderCustomName: null, brewMethod: 'v60', displayName: null },
      cameraPermission: preset === 'scan' ? 'granted' : 'denied',
      palateChart: { sweetness: 0.6, acidity: 0.6, body: -0.6, clean_funky: 0.6, fruit_nutty: -0.6 },
      pendingScanBean: null, marketingConsent: false, completedVia: null, postCompleteAction: 'none',
    };
    localStorage.setItem('onboarding_state_v1_harness-uid', JSON.stringify({ step, answers: base }));
  }
})();

function Harness() {
  const [hasPro, setHasPro] = useState(false);

  // Merge `simulateEntitlement` onto whatever the driver already set via
  // page.addInitScript (e.g. `paywall.status`) — never clobber it. Also seeds a
  // default finishProfile so scenarios that don't care about the terminal write
  // still resolve instead of hitting real Firestore.
  useEffect(() => {
    const w = window;
    w.__ONBOARDING_TEST__ = w.__ONBOARDING_TEST__ || {};
    w.__ONBOARDING_TEST__.paywall = {
      ...(w.__ONBOARDING_TEST__.paywall || {}),
      simulateEntitlement: () => setHasPro(true),
    };
    if (!w.__ONBOARDING_TEST__.finishProfile) {
      w.__ONBOARDING_TEST__.finishProfile = defaultFinishProfile;
    }
  }, []);

  const subscriptionValue = useMemo(() => ({
    hasPro,
    hasUltra: false,
    plan: hasPro ? 'pro_monthly' : null,
    status: hasPro ? 'active' : null,
    cancelAtPeriodEnd: false,
    freeUsage: { aiScans: 0, tasteTests: 0, productShots: 0 },
    loading: false,
    firestoreLoaded: true,
    rcHydrated: true,
  }), [hasPro]);

  return (
    <SubscriptionContext.Provider value={subscriptionValue}>
      <PaywallProvider>
        <OnboardingFlow
          user={FAKE_USER}
          profile={null}
          createProfile={async (payload) => { window.__SAVED_PROFILE__ = { via: 'createProfile', ...payload }; }}
          completeOnboarding={async (answers) => { window.__SAVED_PROFILE__ = { via: 'completeOnboarding', ...answers }; }}
        />
      </PaywallProvider>
    </SubscriptionContext.Provider>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);
