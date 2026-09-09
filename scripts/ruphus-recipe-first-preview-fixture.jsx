import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/styles/global.css';
import { UserPreferencesProvider } from '../src/hooks/useUserProfile.jsx';
import { RecipeProposalCard } from '../src/components/chat/artifacts/RecipeProposalCard.jsx';
import { HandBrewModal } from '../src/components/HandBrewModal.jsx';
import { generateKalitaRecipe } from '../src/lib/kalitaAdapter.js';
import { createRecipePreview } from '../src/lib/ruphus/recipePreview.js';
import { clearRecipePreviewDraft, readRecipePreviewDraft, writeRecipePreviewDraft } from '../src/lib/ruphus/recipePreviewDraft.js';

const uid = 'ruphus-recipe-first-fixture';
const proposalId = 'changed-ratio-fixture';
const bean = { id: 'fixture-coffee', name: 'Changed Ratio Coffee' };
const canonical = generateKalitaRecipe({}, { size: '155', dose: 13 });
const proposed = createRecipePreview({ recipe: canonical, dose: 13, targetRatio: 15 });
const artifact = { id: proposalId, type: 'recipe_proposal', status: 'proposed', slotKey: 'kalita_hot', coffeeId: bean.id, coffeeName: bean.name, before: canonical, after: proposed };

function Fixture() {
  const [preview, setPreview] = useState(null);
  const [startCount, setStartCount] = useState(0);
  const [saveCount, setSaveCount] = useState(0);
  const openPreview = () => {
    const draft = readRecipePreviewDraft({ uid, proposalId });
    const dose = draft?.dose || proposed.coffeeGrams;
    const recipe = createRecipePreview({ recipe: proposed, dose, ratio: proposed.ratio });
    writeRecipePreviewDraft({ uid, proposalId, coffeeId: bean.id, slotKey: artifact.slotKey, dose, sourceRevisionId: 'revision-1' });
    setPreview({ recipe, dose });
  };
  const closePreview = () => setPreview(null);
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
        deviceKey="kalita"
        userCoffeeGrams={preview?.dose}
        onCoffeeGramsChange={changeDose}
        onPreviewStart={() => setStartCount((value) => value + 1)}
        onPreviewSave={() => setSaveCount((value) => value + 1)}
      />
    </main>
  </UserPreferencesProvider>;
}

createRoot(document.getElementById('root')).render(<Fixture />);
