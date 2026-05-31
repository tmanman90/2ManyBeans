import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import './styles/global.css';
import { Capacitor } from '@capacitor/core';
import { useAuth } from './hooks/useAuth';
import { useUserProfile, UserPreferencesProvider } from './hooks/useUserProfile.jsx';
import { useAppData } from './hooks/useAppData';
import { useDemoAppData } from './hooks/useDemoAppData';
import { SignInScreen } from './components/SignInScreen';
import { LoadingScreen } from './components/LoadingScreen';
import { App } from './App';
import { AiDataConsentModal } from './components/AiDataConsentModal';
import { AuthContext } from './contexts/AuthContext';
import { SubscriptionProvider } from './contexts/SubscriptionContext';
import { PaywallProvider, usePaywall } from './hooks/usePaywall.jsx';
import { cacheClear, cacheClearLastUid } from './lib/offlineCache';
import { logInRevenueCat, logOutRevenueCat } from './lib/revenuecat';
import { C, fonts } from './styles/theme';

// Module-scope lazy load (must NOT be inside component body). The new
// onboarding flow replaces the single-page wizard — see docs/plans/
// 2026-04-12-009-feat-onboarding-13-screen-rebuild-plan.md. Keeping the
// `OnboardingWizard` chunk reference would prevent tree-shaking; the old
// file is deleted in Phase 5 once the new flow is verified on TestFlight.
const OnboardingFlow = React.lazy(() => import('./components/onboarding/OnboardingFlow'));
const PaywallSheet = React.lazy(() => import('./components/PaywallSheet').then((m) => ({ default: m.PaywallSheet })));

class RootErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    console.error('[startup] Root render failed', error);
  }

  handleReload = () => {
    try { window.location.reload(); } catch { /* ignore */ }
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={{
        minHeight: '100dvh',
        background: C.bg,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 24px',
        fontFamily: fonts.body,
        textAlign: 'center',
      }}>
        <div style={{ fontFamily: fonts.title, fontSize: 32, color: C.accent, marginBottom: 12 }}>
          2manybeans
        </div>
        <div style={{ fontSize: 15, color: C.textMuted, marginBottom: 24, maxWidth: 300, lineHeight: 1.45 }}>
          The app hit a startup issue. Reload to try again.
        </div>
        <button
          onClick={this.handleReload}
          style={{
            minHeight: 44,
            padding: '12px 26px',
            fontSize: 16,
            fontWeight: 700,
            fontFamily: fonts.body,
            background: C.accent,
            color: '#fff',
            border: 'none',
            borderRadius: 12,
            cursor: 'pointer',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          Reload
        </button>
      </div>
    );
  }
}

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

function NativeReadyNotifier() {
  useEffect(() => {
    let cancelled = false;
    let raf1 = null;
    let raf2 = null;

    const notifyReady = () => {
      window.__tmbStartupReady = true;
      if (!Capacitor.isNativePlatform()) return;
      import('@capgo/capacitor-updater')
        .then(({ CapacitorUpdater }) => CapacitorUpdater.notifyAppReady())
        .catch((err) => {
          console.warn('[startup] Failed to notify Capgo app ready', err);
        });
    };

    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        if (!cancelled) notifyReady();
      });
    });

    return () => {
      cancelled = true;
      if (raf1) cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, []);

  return null;
}

function ReadyFrame({ children }) {
  return (
    <>
      <NativeReadyNotifier />
      {children}
    </>
  );
}

const DEMO_PROFILE = {
  displayName: 'Coffee Explorer',
  onboardingComplete: true,
  tourCompleted: true,
  aiDataConsent: true,
};

const DEMO_PREFS_CONTEXT = {
  preferences: {
    grinder: 'fellow-ode-gen2',
    grinderCustomName: null,
    brewMethod: 'aiden',
    grindSizeDisplay: 'default',
    canisterCount: 3,
  },
  updatePreferences: () => {},
  fellowConnected: false,
};

function DemoSignInPrompt({ onSignIn, onDismiss }) {
  return (
    <div
      onClick={onDismiss}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.card, borderRadius: 20, padding: '28px 24px',
          maxWidth: 320, width: '100%', textAlign: 'center',
          boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        }}
      >
        <div style={{
          fontFamily: fonts.title, fontSize: 24, color: C.accent,
          marginBottom: 8, lineHeight: 1.1,
        }}>
          Create your free account
        </div>
        <div style={{
          fontSize: 14, color: C.textMuted, lineHeight: 1.5, marginBottom: 20,
        }}>
          Sign in to save your beans, log tastings, and unlock all features.
        </div>
        <button
          onClick={onSignIn}
          style={{
            width: '100%', minHeight: 48, borderRadius: 12,
            background: C.accent, color: '#fff', border: 'none',
            fontFamily: fonts.body, fontSize: 16, fontWeight: 700,
            cursor: 'pointer', marginBottom: 10,
          }}
        >
          Sign In
        </button>
        <button
          onClick={onDismiss}
          style={{
            width: '100%', minHeight: 44, borderRadius: 12,
            background: 'transparent', color: C.textMuted, border: `1.5px solid ${C.border}`,
            fontFamily: fonts.body, fontSize: 15, fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Keep Exploring
        </button>
      </div>
    </div>
  );
}

function DemoBannerWithPaywall({ onExitDemo }) {
  const { openPaywall } = usePaywall();
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0,
      zIndex: 1000,
      background: C.amberBg,
      borderBottom: '1px solid #E8D5A0',
      padding: `calc(env(safe-area-inset-top, 0px) + 6px) 16px 6px`,
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      fontSize: 13, color: C.text, fontFamily: fonts.body,
    }}>
      <span>Exploring demo mode</span>
      <button
        onClick={() => openPaywall({ feature: 'generic', promote: 'pro' })}
        style={{
          background: 'transparent', color: C.accent, border: `1.5px solid ${C.accent}`,
          borderRadius: 8, padding: '4px 12px',
          fontFamily: fonts.body, fontSize: 12, fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        View Plans
      </button>
      <button
        onClick={onExitDemo}
        style={{
          background: C.accent, color: '#fff', border: 'none',
          borderRadius: 8, padding: '4px 12px',
          fontFamily: fonts.body, fontSize: 12, fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        Sign In
      </button>
    </div>
  );
}

function DemoRoot({ onExitDemo }) {
  const [showPrompt, setShowPrompt] = useState(false);
  const onWriteAttempt = useCallback(() => setShowPrompt(true), []);

  const {
    beans, tastings, loaded,
    addBean, updateBean, deleteBean,
    addTasting, updateTasting, deleteTasting,
    openBean, finishBean, returnBean,
    getBeanById, refetch,
  } = useDemoAppData(onWriteAttempt);

  const demoAuthValue = useMemo(() => ({ user: null, logOut: () => {} }), []);

  return (
    <AuthContext value={demoAuthValue}>
      <SubscriptionProvider uid={null}>
        <PaywallProvider>
          <UserPreferencesProvider value={DEMO_PREFS_CONTEXT}>
            <DemoBannerWithPaywall onExitDemo={onExitDemo} />
            <div style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 32px)' }}>
              <App
                uid="demo"
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
                profile={DEMO_PROFILE}
                updateProfile={() => {}}
                refetchBeans={refetch}
                isDemo
                onDemoAction={onWriteAttempt}
              />
            </div>
          </UserPreferencesProvider>
          <PaywallMount />
          {showPrompt && (
            <DemoSignInPrompt
              onSignIn={onExitDemo}
              onDismiss={() => setShowPrompt(false)}
            />
          )}
        </PaywallProvider>
      </SubscriptionProvider>
    </AuthContext>
  );
}

const Root = () => {
  const migrationStarted = useRef(false);
  const [demoMode, setDemoMode] = useState(false);
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
    try { await logOutRevenueCat(); } catch { /* non-fatal logout cleanup */ }
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
  if (authLoading) return <ReadyFrame><LoadingScreen /></ReadyFrame>;

  // Gate 2: Not signed in
  if (!user && !demoMode) return <ReadyFrame><SignInScreen onSignInWithGoogle={signInWithGoogle} onSignInWithApple={signInWithApple} onExploreDemo={() => setDemoMode(true)} /></ReadyFrame>;
  if (!user && demoMode) return <ReadyFrame><DemoRoot onExitDemo={() => setDemoMode(false)} /></ReadyFrame>;

  // Gate 3: Profile loading
  if (!profileLoaded) return <ReadyFrame><LoadingScreen /></ReadyFrame>;

  // Gate 3b: Profile load failed after retries (don't confuse with "doesn't exist")
  if (profileLoadError) return <ReadyFrame><LoadingScreen message="Connection issue. Retrying..." /></ReadyFrame>;

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
      return <ReadyFrame><LoadingScreen /></ReadyFrame>;
    }
    if (!dataLoaded) return <ReadyFrame><LoadingScreen /></ReadyFrame>;
  }

  // Gates 5 and 6 are rendered INSIDE the provider stack so the onboarding
  // flow (gate 5) can call usePaywall() and useSubscription() just like the
  // main app (gate 6). The providers were previously mounted only around
  // gate 6, which made them out-of-scope for the onboarding component tree.
  return (
    <ReadyFrame>
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
    </ReadyFrame>
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
    <RootErrorBoundary>
      {import.meta.env.DEV ? <DevRouter /> : <Root />}
    </RootErrorBoundary>
  </React.StrictMode>
);
