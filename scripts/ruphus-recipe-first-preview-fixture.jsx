import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/styles/global.css';
import { UserPreferencesProvider } from '../src/hooks/useUserProfile.jsx';
import { RecipeProposalCard } from '../src/components/chat/artifacts/RecipeProposalCard.jsx';
import { HandBrewModal } from '../src/components/HandBrewModal.jsx';
import { generateKalitaRecipe } from '../src/lib/kalitaAdapter.js';
import { createRecipePreview } from '../src/lib/ruphus/recipePreview.js';
import { generateV60TechniqueOption } from '../src/lib/ruphus/techniqueOptions.js';
import { clearRecipePreviewDraft, readRecipePreviewDraft, writeRecipePreviewDraft } from '../src/lib/ruphus/recipePreviewDraft.js';

const uid = 'ruphus-recipe-first-fixture';
const proposalId = 'changed-ratio-fixture';
const bean = { id: 'fixture-coffee', name: 'Changed Ratio Coffee' };
const techniqueMode = new URLSearchParams(window.location.search).has('technique');
const canonical = generateKalitaRecipe({}, { size: '155', dose: 13 });
const selected = techniqueMode ? generateV60TechniqueOption('kasuya-coarse-pulses', {}, { dose: 20 }) : null;
const proposed = selected ? { ...selected.recipe, techniqueLabel: 'Tetsu Kasuya 4:6' } : createRecipePreview({ recipe: canonical, dose: 13, targetRatio: 15 });
const artifact = { id: proposalId, type: 'recipe_proposal', status: 'proposed', slotKey: techniqueMode ? 'v60_hot' : 'kalita_hot', coffeeId: bean.id, coffeeName: bean.name, before: canonical, after: proposed, ...(techniqueMode ? { techniqueExperiment: { name: 'Tetsu Kasuya 4:6', kind: 'v60_technique' } } : {}) };
const forceStartError = new URLSearchParams(window.location.search).has('start-error');
const forceStartStale = new URLSearchParams(window.location.search).has('start-stale');

function Fixture() {
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState(null);
  const [previewStale, setPreviewStale] = useState(false);
  const [startCount, setStartCount] = useState(0);
  const [saveCount, setSaveCount] = useState(0);
  const openPreview = () => {
    const draft = readRecipePreviewDraft({ uid, proposalId });
    const dose = draft?.dose || proposed.coffeeGrams;
    const recipe = createRecipePreview({ recipe: proposed, dose, ratio: proposed.ratio });
    writeRecipePreviewDraft({ uid, proposalId, coffeeId: bean.id, slotKey: artifact.slotKey, dose, sourceRevisionId: 'revision-1' });
    setPreview({ recipe, dose });
  };
  const closePreview = () => { setPreview(null); setPreviewError(null); setPreviewStale(false); };
  const changeDose = (dose) => {
    const recipe = createRecipePreview({ recipe: proposed, dose, ratio: proposed.ratio });
    writeRecipePreviewDraft({ uid, proposalId, coffeeId: bean.id, slotKey: artifact.slotKey, dose, sourceRevisionId: 'revision-1' });
    setPreview({ recipe, dose });
  };
  return <UserPreferencesProvider value={{ preferences: { grinder: 'fellow-ode-gen2' }, updatePreferences: async () => {} }}>
    <main data-preview-fixture="true" style={{ minHeight: '100vh', padding: 20, background: '#F5EEE6' }}>
      <RecipeProposalCard proposal={artifact} onPreview={openPreview} />
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
  </UserPreferencesProvider>;
}

createRoot(document.getElementById('root')).render(<Fixture />);
