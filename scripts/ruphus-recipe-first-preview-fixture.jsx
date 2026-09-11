import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig, useReducedMotion } from 'framer-motion';
import '../src/styles/global.css';
import { UserPreferencesProvider } from '../src/hooks/useUserProfile.jsx';
import { ArtifactRenderer } from '../src/components/chat/ArtifactRenderer.jsx';
import { HistoricalRecipeInspector } from '../src/tabs/ChatTab.jsx';
import { HandBrewModal } from '../src/components/HandBrewModal.jsx';
import { generateKalitaRecipe } from '../src/lib/kalitaAdapter.js';
import { createRecipePreview } from '../src/lib/ruphus/recipePreview.js';
import { generateV60TechniqueOption } from '../src/lib/ruphus/techniqueOptions.js';
import { generateManualSourceTechniqueOption } from '../src/lib/ruphus/techniqueOptions.js';
import { clearRecipePreviewDraft, readRecipePreviewDraft, writeRecipePreviewDraft } from '../src/lib/ruphus/recipePreviewDraft.js';

const uid = 'ruphus-recipe-first-fixture';
const bean = { id: 'fixture-coffee', name: 'Changed Ratio Coffee' };
const techniqueMode = new URLSearchParams(window.location.search).has('technique');
const sourceMode = new URLSearchParams(window.location.search).has('source');
const proposalId = sourceMode ? 'source-hario-preview-fixture' : 'changed-ratio-fixture';
const runtimeTurn = window.__ruphusTechniqueTurn;
const canonical = generateKalitaRecipe({}, { size: '155', dose: 13 });
const selected = techniqueMode ? generateV60TechniqueOption('kasuya-coarse-pulses', {}, { dose: 20 }) : null;
const sourceOption = sourceMode ? generateManualSourceTechniqueOption('hario-switch-03-matt-winton-hybrid-24-2022', {}, {
  device: 'v60', variant: 'switch', size: '03', model: 'V60 Switch', filter: 'v60-03-paper', material: 'glass', mode: 'hot',
}) : null;
const proposed = sourceOption?.recipe || (selected ? { ...selected.recipe, techniqueLabel: 'Tetsu Kasuya 4:6' } : createRecipePreview({ recipe: canonical, dose: 13, targetRatio: 15 }));
const artifact = sourceMode
  ? { id: proposalId, type: 'recipe_proposal', status: 'proposed', slotKey: 'v60_hot', coffeeId: bean.id, coffeeName: bean.name, before: canonical, after: proposed, sourceRevisionId: String(sourceOption.recipe.sourceRevision), sourceHash: 'hario-switch-03-matt-winton-hybrid-24-2022-revision-1', techniqueExperiment: { name: sourceOption.recipe.techniqueLabel, kind: 'manual_source_technique', sourceId: sourceOption.recipe.sourceId } }
  : runtimeTurn?.frames?.find(frame => frame.type === 'artifact_ready')?.artifact || { id: proposalId, type: 'recipe_proposal', status: 'proposed', slotKey: techniqueMode ? 'v60_hot' : 'kalita_hot', coffeeId: bean.id, coffeeName: bean.name, before: canonical, after: proposed, ...(techniqueMode ? { techniqueExperiment: { name: 'Tetsu Kasuya 4:6', kind: 'v60_technique' } } : {}) };
const forceStartError = new URLSearchParams(window.location.search).has('start-error');
const forceStartStale = new URLSearchParams(window.location.search).has('start-stale');
const historical = new URLSearchParams(window.location.search).has('historical');

function Fixture() {
  const reducedMotion = useReducedMotion();
  const [sent, setSent] = useState(!runtimeTurn);
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState(null);
  const [previewStale, setPreviewStale] = useState(false);
  const [startCount, setStartCount] = useState(0);
  const [saveCount, setSaveCount] = useState(0);
  const [inspectedId, setInspectedId] = useState(null);
  const previewOriginRef = useRef(null);
  const historicalOriginRef = useRef(null);
  const openPreview = () => {
    previewOriginRef.current = document.activeElement;
    const draft = readRecipePreviewDraft({ uid, proposalId });
    const dose = draft?.dose || proposed.coffeeGrams;
    const recipe = createRecipePreview({ recipe: proposed, dose });
    writeRecipePreviewDraft({ uid, proposalId, coffeeId: bean.id, slotKey: artifact.slotKey, dose, sourceRevisionId: 'revision-1' });
    setPreview({ recipe, dose });
  };
  const closePreview = () => {
    setPreview(null); setPreviewError(null); setPreviewStale(false);
    requestAnimationFrame(() => previewOriginRef.current?.focus());
  };
  const changeDose = (dose) => {
    const recipe = createRecipePreview({ recipe: proposed, dose });
    writeRecipePreviewDraft({ uid, proposalId, coffeeId: bean.id, slotKey: artifact.slotKey, dose, sourceRevisionId: 'revision-1' });
    setPreview({ recipe, dose });
  };
  useEffect(() => {
    if (!inspectedId) return undefined;
    const frame = requestAnimationFrame(() => document.querySelector('[data-historical-inspection="true"]')?.focus());
    return () => cancelAnimationFrame(frame);
  }, [inspectedId]);
  const inspect = (item) => {
    historicalOriginRef.current = document.activeElement;
    setInspectedId(item.id);
  };
  const closeHistorical = () => {
    setInspectedId(null);
    requestAnimationFrame(() => historicalOriginRef.current?.focus());
  };
  return <MotionConfig reducedMotion="user">
    <UserPreferencesProvider value={{ preferences: { grinder: 'fellow-ode-gen2' }, updatePreferences: async () => {} }}>
      <main data-preview-fixture="true" data-source-backed={sourceMode ? 'true' : 'false'} data-reduced-motion={String(reducedMotion)} style={{ minHeight: '100vh', padding: 20, background: '#F5EEE6' }}>
      {runtimeTurn && <section aria-label="Technique conversation">
        <p>{runtimeTurn.userText}</p>
        {!sent && <button type="button" onClick={() => setSent(true)} style={{ minHeight: 44 }}>Send technique request</button>}
        {sent && <p data-runtime-reply>{runtimeTurn.frames.filter(frame => frame.type === 'text_delta').map(frame => frame.text).join('')}</p>}
      </section>}
      {sent && <ArtifactRenderer artifact={historical ? { ...artifact, status: 'superseded' } : artifact} onPreview={openPreview} onInspect={inspect} />}
      {inspectedId && <div data-inspected-id={inspectedId}><HistoricalRecipeInspector proposal={artifact} onClose={closeHistorical} /></div>}
      <div style={{ display: 'none' }} aria-hidden="true">
        <button type="button" data-reset onClick={() => { clearRecipePreviewDraft({ uid, proposalId }); setPreview(null); setStartCount(0); setSaveCount(0); }}>Reset fixture</button>
        <output data-start-count>{startCount}</output><output data-save-count>{saveCount}</output>
      </div>
      <HandBrewModal
        open={Boolean(preview)}
        previewMode
        onClose={closePreview}
        recipe={preview?.recipe}
        bean={bean}
        deviceKey={techniqueMode ? 'v60' : 'kalita'}
        userCoffeeGrams={preview?.dose}
        onCoffeeGramsChange={changeDose}
        previewError={previewError}
        previewStale={previewStale}
        onPreviewStart={() => {
          if (forceStartStale) {
            setPreviewStale(true);
            setPreviewError('Your saved recipe changed, so this preview is out of date. Return to chat and ask Ruphus for a fresh recipe.');
            return;
          }
          if (forceStartError) {
            setPreviewError('This preview could not be started. Review it and try again.');
            return;
          }
          setStartCount((value) => value + 1);
        }}
        onPreviewSave={() => setSaveCount((value) => value + 1)}
      />
      </main>
    </UserPreferencesProvider>
  </MotionConfig>;
}

createRoot(document.getElementById('root')).render(<Fixture />);
