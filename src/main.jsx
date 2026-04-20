import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import './styles/global.css';
import { Capacitor } from '@capacitor/core';
import { useAuth } from './hooks/useAuth';
import { useUserProfile, UserPreferencesProvider } from './hooks/useUserProfile.jsx';
import { useAppData } from './hooks/useAppData';
import { SignInScreen } from './components/SignInScreen';
import { LoadingScreen } from './components/LoadingScreen';
import { App } from './App';
import { AiDataConsentModal } from './components/AiDataConsentModal';
import { AuthContext } from './contexts/AuthContext';
import { SubscriptionProvider } from './contexts/SubscriptionContext';
import { PaywallProvider, usePaywall } from './hooks/usePaywall.jsx';
import { cacheClear, cacheClearLastUid } from './lib/offlineCache';
import { logInRevenueCat, logOutRevenueCat } from './lib/revenuecat';

// Module-scope lazy load (must NOT be inside component body). The new
// onboarding flow replaces the single-page wizard — see docs/plans/
// 2026-04-12-009-feat-onboarding-13-screen-rebuild-plan.md. Keeping the
// `OnboardingWizard` chunk reference would prevent tree-shaking; the old
// file is deleted in Phase 5 once the new flow is verified on TestFlight.
const OnboardingFlow = React.lazy(() => import('./components/onboarding/OnboardingFlow'));
const PaywallSheet = React.lazy(() => import('./components/PaywallSheet').then((m) => ({ default: m.PaywallSheet })));

// Mounts the actual paywall UI. Kept out of <Root> so it can read the
// PaywallContext without triggering extra renders of the app shell.
function PaywallMount() {
  const { paywallContext, close } = usePaywall();
  const open = paywallContext !== null;
  return (
    <React.Suspense fallback={null}>
      <PaywallSheet open={open} context={paywallContext} onClose={close} />
    </React.Suspense>
  );
}

// Notify Capgo that the app loaded successfully (prevents rollback)
if (Capacitor.isNativePlatform()) {
  import('@capgo/capacitor-updater').then(({ CapacitorUpdater }) => {
    CapacitorUpdater.notifyAppReady();
  });
}

const Root = () => {
  const migrationStarted = useRef(false);
  const { user, loading: authLoading, signInWithGoogle, signInWithApple, logOut } = useAuth();

  const {
    profile, profileLoaded, profileLoadError, preferences, isOnboarded,
    createProfile, migrateExistingUser, updatePreferences,
    updateProfile, completeOnboarding, contextValue,
  } = useUserProfile(user?.uid);

  // DEV-only: force onboarding re-entry via a local flag that the
  // Settings "Replay onboarding" button toggles. Never writes to
  // Firestore — the old `resetOnboarding` approach bled the flag
  // across devices because profile docs are shared, so a dev-mode
  // replay on localhost could strand the same user in onboarding on
  // their production phone. The flag is evaluated every render, but
  // it only ever reads localStorage once per mount so repeated
  // renders are cheap.
  const devForceOnboarding = useMemo(() => {
    if (!import.meta.env.DEV) return false;
    try {
      return localStorage.getItem('__dev_force_onboarding_v1') === '1';
    } catch {
      return false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const {
    beans, tastings,
    addBean, updateBean, deleteBean,
    addTasting, updateTasting, deleteTasting,
    openBean, finishBean, returnBean, getBeanById, seedTalData, refetch,
    loaded: dataLoaded,
  } = useAppData(user?.uid);

  // Track last known uid so cache clears even if auth state clears first
  const lastUidRef = useRef(user?.uid);
  useEffect(() => { if (user?.uid) lastUidRef.current = user.uid; }, [user?.uid]);

  const handleLogOut = useCallback(async () => {
    if (lastUidRef.current) cacheClear(lastUidRef.current);
    cacheClearLastUid();
    // Clear RevenueCat session so the next user doesn't inherit this one's
    // entitlements on a shared device.
    try { await logOutRevenueCat(); } catch {}
    // Clear the Google/Apple SDK sessions on native. Without this, the iOS
    // Google Sign-In SDK silently re-uses the last-signed-in account on the
    // next SocialLogin.login() call, skipping the account picker entirely.
    // Sign out at the SDK level so a real picker appears for the next user.
    if (Capacitor.isNativePlatform()) {
      try {
        const { SocialLogin } = await import('@capgo/capacitor-social-login');
        await SocialLogin.logout({ provider: 'google' });
      } catch (err) {
        // Plugin may throw if user wasn't signed in via Google — safe to ignore.
        console.warn('[main] SocialLogin google logout failed', err?.message || err);
      }
      try {
        const { SocialLogin } = await import('@capgo/capacitor-social-login');
        await SocialLogin.logout({ provider: 'apple' });
      } catch {
        // Apple sessions are managed by iOS, this is best-effort.
      }
    }
    return logOut();
  }, [logOut]);

  // Tie the RevenueCat subscriber to the Firebase UID. Runs every time the
  // authed user changes; RC SDK is idempotent on repeat logIn calls.
  useEffect(() => {
    if (!user?.uid) return;
    logInRevenueCat(user.uid).catch((err) => {
      console.error('[main] RevenueCat logIn failed', err);
    });
  }, [user?.uid]);

  const authValue = useMemo(() => ({ user, logOut: handleLogOut }), [user, handleLogOut]);

  // Gate 1: Auth loading
  if (authLoading) return <LoadingScreen />;

  // Gate 2: Not signed in
  if (!user) return <SignInScreen onSignInWithGoogle={signInWithGoogle} onSignInWithApple={signInWithApple} />;

  // Gate 3: Profile loading
  if (!profileLoaded) return <LoadingScreen />;

  // Gate 3b: Profile load failed after retries (don't confuse with "doesn't exist")
  if (profileLoadError) return <LoadingScreen message="Connection issue. Retrying..." />;

  // Gate 4: No profile doc exists, need to determine if new or existing user
  if (!profile) {
    if (dataLoaded && beans.length > 0) {
      if (!migrationStarted.current) {
        migrationStarted.current = true;
        migrateExistingUser(user).catch(err => {
          console.error('[Migration] Failed:', err);
          migrationStarted.current = false; // allow retry on next render
        });
      }
      return <LoadingScreen />;
    }
    if (!dataLoaded) return <LoadingScreen />;
  }

  // Gates 5 and 6 are rendered INSIDE the provider stack so the onboarding
  // flow (gate 5) can call usePaywall() and useSubscription() just like the
  // main app (gate 6). The providers were previously mounted only around
  // gate 6, which made them out-of-scope for the onboarding component tree.
  return (
    <AuthContext value={authValue}>
      <SubscriptionProvider uid={user.uid}>
        <PaywallProvider>
          {(!isOnboarded || devForceOnboarding) ? (
            // Gate 5: Onboarding not complete — 13-screen rebuild.
            // Also enters here when the DEV replay flag is set.
            <React.Suspense fallback={<LoadingScreen />}>
              <OnboardingFlow
                user={user}
                profile={profile}
                createProfile={createProfile}
                completeOnboarding={completeOnboarding}
              />
            </React.Suspense>
          ) : profile?.aiDataConsent !== true ? (
            // Gate 5.5: AI data consent (Apple Guideline 5.1.2(i)).
            // Catches both new users (post-onboarding) and existing
            // users who completed onboarding before this gate existed.
            <AiDataConsentModal updateProfile={updateProfile} />
          ) : !dataLoaded ? (
            // Gate 6a: Waiting for Firestore data
            <LoadingScreen />
          ) : (
            // Gate 6b: Main app
            <UserPreferencesProvider value={contextValue}>
              <App
                uid={user.uid}
                beans={beans}
                tastings={tastings}
                addBean={addBean}
                updateBean={updateBean}
                deleteBean={deleteBean}
                addTasting={addTasting}
                updateTasting={updateTasting}
                deleteTasting={deleteTasting}
                openBean={openBean}
                finishBean={finishBean}
                returnBean={returnBean}
                getBeanById={getBeanById}
                profile={profile}
                updateProfile={updateProfile}
                refetchBeans={refetch}
              />
            </UserPreferencesProvider>
          )}
          {/* PaywallMount lives inside PaywallProvider but outside the gate
              ternary so the RevenueCat sheet renders during BOTH onboarding
              (R13 paywall) and the main app. Previously it was only mounted
              in Gate 6b, which left R13 white-screened because openPaywall
              set context but nothing rendered the sheet. */}
          <PaywallMount />
        </PaywallProvider>
      </SubscriptionProvider>
    </AuthContext>
  );
};

// Dev-only test routes — hash-based, tree-shaken from prod builds
const TestShareCardLazy = import.meta.env.DEV
  ? React.lazy(() => import('./pages/TestShareCard').then(m => ({ default: m.TestShareCard })))
  : null;

const DevRouter = () => {
  if (window.location.hash === '#/test-share-card' && TestShareCardLazy) {
    return (
      <React.Suspense fallback={<div style={{ color: '#fff', padding: 40 }}>Loading test page...</div>}>
        <TestShareCardLazy />
      </React.Suspense>
    );
  }
  return <Root />;
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {import.meta.env.DEV ? <DevRouter /> : <Root />}
  </React.StrictMode>
);
