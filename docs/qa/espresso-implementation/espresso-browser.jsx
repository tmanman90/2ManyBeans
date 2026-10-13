import React, { StrictMode, useEffect, useState } from 'react';
import '../../../src/styles/global.css';
import { createRoot } from 'react-dom/client';
import { connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';
import { connectFirestoreEmulator, collection, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../../../src/firebase.js';
import { UserPreferencesProvider, useUserProfile } from '../../../src/hooks/useUserProfile.jsx';
import { useEspressoBrew } from '../../../src/hooks/useEspressoBrew.js';
import { EspressoModal } from '../../../src/components/EspressoModal.jsx';
import { MotionConfig } from 'framer-motion';

// Verification-only owner glue. Real production hook, modal, auth, profile and
// command endpoint; all persisted records belong to a local demo project.
connectAuthEmulator(auth, 'http://127.0.0.1:59099', { disableWarnings: true });
connectFirestoreEmulator(db, '127.0.0.1', 58080);
const { user } = await signInWithEmailAndPassword(auth, 'espresso-browser@example.test', 'local-fixture-only-123');

function RecipeFixture({ beans, updatePreferences }) {
  const espresso = useEspressoBrew();
  return <>
    <button onClick={() => espresso.handleBrewEspresso(beans.find(bean => bean.id === 'browser-a'))}>Open bean A</button>
    <button onClick={() => espresso.handleBrewEspresso(beans.find(bean => bean.id === 'browser-b'))}>Open bean B</button>
    <button onClick={() => updatePreferences({ espressoGrinder: 'external', espressoGrinderModel: 'Fixture external grinder', espressoSetupConfirmed: true })}>Select external grinder</button>
    <button onClick={() => updatePreferences({ espressoGrinder: 'integrated', espressoSetupConfirmed: true })}>Select built-in grinder</button>
    <output data-beans-loaded>{beans.length}</output>
    <output data-current-bean>{espresso.espressoBean?.id || ''}</output>
    <EspressoModal open={espresso.espressoModal} onClose={espresso.closeEspressoModal}
      bean={espresso.espressoBean} recipe={espresso.espressoRecipe} loading={espresso.espressoLoading}
      error={espresso.espressoError} phase={espresso.espressoPhase} notice={espresso.espressoNotice}
      onRetry={espresso.onRetry} onRegenerate={espresso.onRegenerate}
      onSave={espresso.saveEspressoRecipe} onUndo={espresso.undoEspressoRecipe}
      onDoseChange={espresso.editEspressoDose} onYieldChange={espresso.editEspressoYield}
      onGrindChange={espresso.editEspressoGrind} onTemperatureChange={espresso.editEspressoTemperature}
    />
  </>;
}

function Fixture() {
  const profile = useUserProfile(user.uid);
  const [beans, setBeans] = useState([]);
  useEffect(() => onSnapshot(collection(db, 'users', user.uid, 'beans'), snap => setBeans(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })))), []);
  return <UserPreferencesProvider value={profile.contextValue}><RecipeFixture beans={beans} updatePreferences={profile.updatePreferences} /></UserPreferencesProvider>;
}
createRoot(document.getElementById('root')).render(<StrictMode><MotionConfig reducedMotion="user"><Fixture /></MotionConfig></StrictMode>);
