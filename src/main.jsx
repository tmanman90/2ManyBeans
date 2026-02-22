import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/global.css';
import { useAuth } from './hooks/useAuth';
import { useAppData } from './hooks/useAppData';
import { SignInScreen } from './components/SignInScreen';
import { LoadingScreen } from './components/LoadingScreen';
import { App } from './App';

const Root = () => {
  const { user, loading: authLoading, signIn, logOut } = useAuth();
  const {
    beans, tastings,
    addBean, updateBean, deleteBean,
    addTasting, updateTasting, deleteTasting,
    openBean, finishBean, seedTalData,
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
      seedTalData={seedTalData}
    />
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
