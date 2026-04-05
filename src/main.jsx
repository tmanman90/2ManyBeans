import React, { useMemo } from 'react';
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

// Notify Capgo that the app loaded successfully (prevents rollback)
if (Capacitor.isNativePlatform()) {
  import('@capgo/capacitor-updater').then(({ CapacitorUpdater }) => {
    CapacitorUpdater.notifyAppReady();
  });
}

const Root = () => {
  const { user, loading: authLoading, signInWithGoogle, signInWithApple, logOut } = useAuth();

  const {
    profile, profileLoaded, preferences, isOnboarded,
    createProfile, migrateExistingUser, updatePreferences,
    updateProfile, completeOnboarding, contextValue,
  } = useUserProfile(user?.uid);

  const {
    beans, tastings,
    addBean, updateBean, deleteBean,
    addTasting, updateTasting, deleteTasting,
    openBean, finishBean, returnBean, seedTalData,
    loaded: dataLoaded,
  } = useAppData(user?.uid);

  const authValue = useMemo(() => ({ user, logOut }), [user, logOut]);

  // Gate 1: Auth loading
  if (authLoading) return <LoadingScreen />;

  // Gate 2: Not signed in
  if (!user) return <SignInScreen onSignInWithGoogle={signInWithGoogle} onSignInWithApple={signInWithApple} />;

  // Gate 3: Profile loading
  if (!profileLoaded) return <LoadingScreen />;

  // Gate 4: No profile doc exists, need to determine if new or existing user
  if (!profile) {
    if (dataLoaded && beans.length > 0) {
      migrateExistingUser(user);
      return <LoadingScreen />;
    }
    if (!dataLoaded) return <LoadingScreen />;
  }

  // Gate 5: Onboarding not complete
  if (!isOnboarded) {
    const OnboardingWizard = React.lazy(() => import('./components/OnboardingWizard'));
    return (
      <React.Suspense fallback={<LoadingScreen />}>
        <OnboardingWizard
          user={user}
          profile={profile}
          createProfile={createProfile}
          completeOnboarding={completeOnboarding}
        />
      </React.Suspense>
    );
  }

  // Gate 6: Waiting for Firestore data
  if (!dataLoaded) return <LoadingScreen />;

  return (
    <AuthContext value={authValue}>
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
        />
      </UserPreferencesProvider>
    </AuthContext>
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
