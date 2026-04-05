import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/global.css';
import { Capacitor } from '@capacitor/core';
import { useAuth } from './hooks/useAuth';
import { useAppData } from './hooks/useAppData';
import { SignInScreen } from './components/SignInScreen';
import { LoadingScreen } from './components/LoadingScreen';
import { App } from './App';

// Notify Capgo that the app loaded successfully (prevents rollback)
if (Capacitor.isNativePlatform()) {
  import('@capgo/capacitor-updater').then(({ CapacitorUpdater }) => {
    CapacitorUpdater.notifyAppReady();
  });
}

const Root = () => {
  const { user, loading: authLoading, signIn, logOut } = useAuth();
  const {
    beans, tastings,
    addBean, updateBean, deleteBean,
    addTasting, updateTasting, deleteTasting,
    openBean, finishBean, returnBean, seedTalData,
    loaded: dataLoaded,
  } = useAppData(user?.uid);

  // Auth loading
  if (authLoading) return <LoadingScreen />;

  // Not signed in
  if (!user) return <SignInScreen onSignIn={signIn} />;

  // Waiting for Firestore data
  if (!dataLoaded) return <LoadingScreen />;

  return (
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
      seedTalData={seedTalData}
    />
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
