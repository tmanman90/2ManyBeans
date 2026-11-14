import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'framer-motion';
import '../src/styles/global.css';
import { HandBrewModal } from '../src/components/HandBrewModal.jsx';
import { UserPreferencesProvider } from '../src/hooks/useUserProfile.jsx';
import { SWITCH_SOURCES } from '../src/data/manualSources/switch.js';
import { KALITA_SOURCES } from '../src/data/manualSources/kalita.js';
import { generateKalitaRecipe } from '../src/lib/kalitaAdapter.js';
import { projectManualSource } from '../src/lib/manualSourceProjection.js';
import { buildTimingEvent } from '../src/lib/brewTimingMemory.js';
import { generateManualSourceTechniqueOption } from '../src/lib/ruphus/techniqueOptions.js';
import { previewSavedSourceDose, savedSourceDosePersistence } from '../src/lib/savedSourceDose.js';

const params = new URLSearchParams(window.location.search);
const ordinaryMode = params.has('ordinary');
const onyx23 = params.has('onyx23');
const source = onyx23
  ? KALITA_SOURCES.find((record) => record.id === 'onyx-monarch-wave-185')
  : SWITCH_SOURCES.find((record) => record.id === 'hario-switch-03-matt-winton-hybrid-24-2022');
const generatedSource = generateManualSourceTechniqueOption(source.id, onyx23
  ? { grindAdjustmentMicrons: -20, evidenceHash: 'fixture-high-density', reasonCodes: ['high-density'] }
  : {}, onyx23 ? {
    device: 'kalita', variant: 'wave', size: '185', model: 'Wave', filter: 'wave-185', mode: 'hot', dose: 23, grinder: 'fellow-ode-gen2',
  } : {
    device: 'v60', variant: 'switch', size: '03', model: 'V60 Switch', filter: 'v60-03-paper', material: 'glass', mode: 'hot',
  }).recipe;
const projection = generatedSource.sourceProjection;
const unsupported = params.has('unsupported');
const fixtureProjection = unsupported
  ? {
    ...projection,
    timerReady: false,
    readiness: { ...projection.readiness, timerReady: false, blockers: [...projection.readiness.blockers, 'fixture-unsupported-timing'] },
  }
  : projection;
const initialSourceRecipe = Object.freeze({ ...generatedSource, sourceProjection: fixtureProjection });

function Fixture() {
  const [sourceTimerState, setSourceTimerState] = useState(null);
  const [tastingStarted, setTastingStarted] = useState(false);
  const [ordinaryOpen, setOrdinaryOpen] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(!ordinaryMode);
  const [ordinaryReviewMode, setOrdinaryReviewMode] = useState(true);
  const [ordinarySaved, setOrdinarySaved] = useState(false);
  const [ordinaryDose, setOrdinaryDose] = useState(13);
  const [timingEvent, setTimingEvent] = useState(null);
  const [sourceRecipe, setSourceRecipe] = useState(initialSourceRecipe);
  const [sourceDoseUpdate, setSourceDoseUpdate] = useState(null);
  const ordinaryRecipe = useMemo(
    () => generateKalitaRecipe({}, { size: '155', dose: ordinaryDose }),
    [ordinaryDose],
  );
  const recipe = ordinaryMode ? ordinaryRecipe : sourceRecipe;
  const bean = { id: ordinaryMode ? 'ordinary-fixture-bean' : 'fixture-bean', name: ordinaryMode ? 'Ordinary Flow Coffee' : 'Source Timer Coffee' };
  const saveTiming = async (snapshot) => {
    const event = buildTimingEvent(snapshot);
    setTimingEvent(event);
    return { status: event ? 'saved' : 'failed' };
  };
  return (
    <UserPreferencesProvider value={{ preferences: { grinder: 'fellow-ode-gen2' }, updatePreferences: async () => {} }}>
      <main data-source-timer-fixture="true" data-ordinary-flow={String(ordinaryMode)} style={{ minHeight: '100dvh', padding: 'env(safe-area-inset-top, 0px) 20px env(safe-area-inset-bottom, 0px)' }}>
        <output data-source-events>{JSON.stringify(sourceTimerState?.events || {})}</output>
        <output data-tasting-started>{String(tastingStarted)}</output>
        <output data-expected-grind>{sourceRecipe.grindSize?.setting || ''}</output>
        <output data-source-dose-update>{JSON.stringify(sourceDoseUpdate)}</output>
        {ordinaryMode && (
          <section data-ordinary-return-card aria-label="Ordinary recipe card" style={{ maxWidth: 480, margin: '0 auto', padding: 20 }}>
            <h1>{ordinaryRecipe.title}</h1>
            <p>{ordinaryRecipe.coffeeGrams}g coffee · {ordinaryRecipe.waterGrams}g water</p>
            <button type="button" onClick={() => { setOrdinarySaved(false); setOrdinaryReviewMode(true); setOrdinaryOpen(true); }} style={{ minHeight: 44, padding: '10px 16px' }}>View recipe</button>
            <output data-card-returned>{String(tastingStarted && !ordinaryOpen)}</output>
          </section>
        )}
        {!ordinaryMode && (
          <section data-source-return-card aria-label="Source recipe card" style={{ maxWidth: 480, margin: '0 auto', padding: 20 }}>
            <h1>{sourceRecipe.sourceProjection.sourceSnapshot.title}</h1>
            <p>Source-backed recipe · {sourceRecipe.sourceProjection.sourceId}</p>
            <button type="button" onClick={() => setSourceOpen(true)} style={{ minHeight: 44, padding: '10px 16px' }}>View source recipe</button>
            <output data-source-card-returned>{String(tastingStarted && !sourceOpen)}</output>
          </section>
        )}
        <HandBrewModal
          open={ordinaryMode ? ordinaryOpen : sourceOpen}
          previewMode={ordinaryMode && ordinaryReviewMode}
          recipe={recipe}
          bean={bean}
          attemptId={null}
          revisionId={ordinaryMode ? null : 'fixture-revision'}
          userCoffeeGrams={ordinaryMode ? ordinaryDose : sourceRecipe.coffeeGrams}
          onCoffeeGramsChange={ordinaryMode ? setOrdinaryDose : undefined}
          onSourceCoffeeGramsChange={ordinaryMode ? undefined : dose => setSourceRecipe(previous => previewSavedSourceDose(previous, dose))}
          onPersistDose={ordinaryMode ? async () => {} : dose => setSourceDoseUpdate(savedSourceDosePersistence(sourceRecipe, dose).update)}
          sourceTimerState={sourceTimerState}
          onSourceTimerStateChange={setSourceTimerState}
          onSaveTimingEvent={saveTiming}
          onPreviewSave={ordinaryMode ? () => { setOrdinarySaved(true); setOrdinaryReviewMode(false); } : undefined}
          onStartTasting={() => {
            setTastingStarted(true);
            if (ordinaryMode) setOrdinaryOpen(false);
            else setSourceOpen(false);
          }}
          onClose={() => { if (ordinaryMode) setOrdinaryOpen(false); else setSourceOpen(false); }}
        />
        {ordinaryMode && <output data-timing-status>{timingEvent ? 'saved' : 'pending'}</output>}
        {ordinaryMode && <output data-timing-event>{JSON.stringify(timingEvent || {})}</output>}
        {ordinaryMode && <output data-preview-saved>{String(ordinarySaved)}</output>}
        {!ordinaryMode && <output data-source-timing-status>{timingEvent ? 'saved' : 'pending'}</output>}
        {!ordinaryMode && <output data-source-timing-event>{JSON.stringify(timingEvent || {})}</output>}
      </main>
    </UserPreferencesProvider>
  );
}

createRoot(document.getElementById('root')).render(<MotionConfig reducedMotion="user"><Fixture /></MotionConfig>);
