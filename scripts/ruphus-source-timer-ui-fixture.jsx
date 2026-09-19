import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/styles/global.css';
import { HandBrewModal } from '../src/components/HandBrewModal.jsx';
import { UserPreferencesProvider } from '../src/hooks/useUserProfile.jsx';
import { SWITCH_SOURCES } from '../src/data/manualSources/switch.js';
import { KALITA_SOURCES } from '../src/data/manualSources/kalita.js';
import { projectManualSource } from '../src/lib/manualSourceProjection.js';
import { generateManualSourceTechniqueOption } from '../src/lib/ruphus/techniqueOptions.js';

const params = new URLSearchParams(window.location.search);
const onyx23 = params.has('onyx23');
const source = onyx23
  ? KALITA_SOURCES.find((record) => record.id === 'onyx-monarch-wave-185')
  : SWITCH_SOURCES.find((record) => record.id === 'hario-switch-03-matt-winton-hybrid-24-2022');
const projection = onyx23
  ? generateManualSourceTechniqueOption('onyx-monarch-wave-185', {}, {
    device: 'kalita', variant: 'wave', size: '185', model: 'Wave', filter: 'wave-185', mode: 'hot', dose: 23,
  }).recipe.sourceProjection
  : projectManualSource(source, {
    device: 'v60', variant: 'switch', size: '03', model: 'V60 Switch', filter: 'v60-03-paper', material: 'glass', mode: 'hot',
  });
const unsupported = params.has('unsupported');
const fixtureProjection = unsupported
  ? {
    ...projection,
    timerReady: false,
    readiness: { ...projection.readiness, timerReady: false, blockers: [...projection.readiness.blockers, 'fixture-unsupported-timing'] },
  }
  : projection;
const recipe = Object.freeze({ sourceProjection: fixtureProjection });

function Fixture() {
  const [sourceTimerState, setSourceTimerState] = useState(null);
  const [tastingStarted, setTastingStarted] = useState(false);
  return (
    <UserPreferencesProvider value={{ preferences: { grinder: 'fellow-ode-gen2' }, updatePreferences: async () => {} }}>
      <main data-source-timer-fixture="true">
        <output data-source-events>{JSON.stringify(sourceTimerState?.events || {})}</output>
        <output data-tasting-started>{String(tastingStarted)}</output>
        <HandBrewModal
          open
          recipe={recipe}
          bean={{ id: 'fixture-bean', name: 'Source Timer Coffee' }}
          attemptId="fixture-attempt"
          revisionId="fixture-revision"
          sourceTimerState={sourceTimerState}
          onSourceTimerStateChange={setSourceTimerState}
          onSaveTimingEvent={async () => ({ status: 'saved' })}
          onStartTasting={() => setTastingStarted(true)}
          onClose={() => {}}
        />
      </main>
    </UserPreferencesProvider>
  );
}

createRoot(document.getElementById('root')).render(<Fixture />);
