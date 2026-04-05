// Shared Aiden brew hook — used by RotationTab, InventoryTab, ChatTab
import { useState } from 'react';
import { generateAidenRecipe, researchBean, pushToAiden } from '../lib/aiden';

export function useAidenBrew(updateBean) {
  const [aidenModal, setAidenModal] = useState(false);
  const [aidenRecipe, setAidenRecipe] = useState(null);
  const [aidenResult, setAidenResult] = useState(null);
  const [aidenLoading, setAidenLoading] = useState(false);
  const [aidenError, setAidenError] = useState(null);
  const [aidenBean, setAidenBean] = useState(null);
  const [aidenResearch, setAidenResearch] = useState(null);
  const [aidenPhase, setAidenPhase] = useState(null);

  const handlePushToAiden = async (recipe) => {
    setAidenError(null);
    setAidenResult(null);
    setAidenLoading(true);
    try {
      const result = await pushToAiden(recipe);
      setAidenResult(result);
      if (result.grindRecommendation) {
        setAidenRecipe(prev => ({ ...prev, grindRecommendation: result.grindRecommendation }));
      }
    } catch (fellowErr) {
      setAidenError(fellowErr.message || "Couldn't push to Aiden");
    }
    setAidenLoading(false);
  };

  const handleBrewWithAiden = async (bean, cachedResearch = null) => {
    setAidenBean(bean);
    setAidenRecipe(null);
    setAidenResult(null);
    setAidenError(null);
    setAidenLoading(true);
    setAidenModal(true);

    // Step 1: Research (skip if cached)
    let research = cachedResearch;
    if (!research) {
      setAidenPhase('research');
      try {
        research = await researchBean(bean);
        setAidenResearch(research);
      } catch (err) {
        console.warn('Bean research failed, continuing without enrichment:', err.message);
        research = null;
      }
    }

    // Step 2: Recipe
    setAidenPhase('recipe');
    try {
      const recipe = await generateAidenRecipe(bean, research);
      setAidenRecipe(recipe);
      setAidenError(null);
      // Persist grind recommendation to the bean
      if (recipe.grindRecommendation && bean.id) {
        await updateBean(bean.id, { aidenGrind: recipe.grindRecommendation });
      }
      // Step 3: Push to Fellow
      setAidenPhase('push');
      await handlePushToAiden(recipe);
    } catch (err) {
      setAidenError(err.message || "Couldn't generate a recipe");
      setAidenLoading(false);
    }
    setAidenPhase(null);
  };

  const closeAidenModal = () => setAidenModal(false);

  return {
    aidenModal, aidenRecipe, aidenResult, aidenLoading, aidenError,
    aidenPhase, aidenBean, aidenResearch,
    handleBrewWithAiden, closeAidenModal,
    onRetry: aidenBean ? () => handleBrewWithAiden(aidenBean, aidenResearch) : undefined,
    onRetryPush: aidenRecipe ? () => handlePushToAiden(aidenRecipe) : undefined,
  };
}
