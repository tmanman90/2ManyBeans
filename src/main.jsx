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
import { AuthContext } from './contexts/AuthContext';
import { SubscriptionProvider } from './contexts/SubscriptionContext';
import { PaywallProvider, usePaywall } from './hooks/usePaywall.jsx';
import { cacheClear, cacheClearLastUid } from './lib/offlineCache';
import { logInRevenueCat, logOutRevenueCat } from './lib/revenuecat';

// Module-scope lazy load (must NOT be inside component body)
const OnboardingWizard = React.lazy(() => import('./components/OnboardingWizard'));
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

  const {
    beans, tastings,
    addBean, updateBean, deleteBean,
    addTasting, updateTasting, deleteTasting,
    openBean, finishBean, returnBean, seedTalData, refetch,
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

  // Gate 5: Onboarding not complete
  if (!isOnboarded) {
    return (
      <React.Suspense fallback={<LoadingScreen />}>
        <OnboardingWizard
          user={user}
          profile={profile}
          createProfile={createProfile}
          updateProfile={updateProfile}
        />
      </React.Suspense>
    );
  }

  // Gate 6: Waiting for Firestore data
  if (!dataLoaded) return <LoadingScreen />;

  return (
    <AuthContext value={authValue}>
      <SubscriptionProvider uid={user.uid}>
        <PaywallProvider>
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
              profile={profile}
              updateProfile={updateProfile}
              refetchBeans={refetch}
            />
            <PaywallMount />
          </UserPreferencesProvider>
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
