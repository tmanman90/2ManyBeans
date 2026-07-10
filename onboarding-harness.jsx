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
