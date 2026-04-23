// Shared Aiden brew hook — used by RotationTab, InventoryTab, ChatTab
//
// Re-entrancy model:
// Every call to handleBrewWithAiden generates a fresh requestId and stores it in
// activeRequestRef. If the user opens a new brew (different bean, regenerate, etc.)
// while an earlier one is still awaiting the network, the earlier request's requestId
// no longer matches activeRequestRef.current and every one of its `setX` calls bails
// out. Same thing for handlePushToAiden. This prevents recipe/result state from an
// abandoned async chain from landing on a bean the user has since moved on from, and
// prevents a stale push from persisting aidenLink on the wrong Firestore doc.
import { useState, useRef, useEffect, useCallback } from 'react';
import { generateAidenRecipe, pushToAiden } from '../lib/aiden';
import { researchBean } from '../lib/beanResearch';
import { useSubscription } from '../contexts/SubscriptionContext';
import { usePaywall } from './usePaywall.jsx';

export function useAidenBrew(updateBean) {
  const mountedRef = useRef(true);
  const activeRequestRef = useRef(null);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const { hasPro, hasUltra } = useSubscription();
  const { openPaywall } = usePaywall();

  const [aidenModal, setAidenModal] = useState(false);
  const [aidenRecipe, setAidenRecipe] = useState(null);
  const [aidenResult, setAidenResult] = useState(null);
  const [aidenLoading, setAidenLoading] = useState(false);
  const [aidenError, setAidenError] = useState(null);
  const [aidenBean, setAidenBean] = useState(null);
  const [aidenResearch, setAidenResearch] = useState(null);
  const [aidenPhase, setAidenPhase] = useState(null);
  const [icedResult, setIcedResult] = useState(null);
  const [icedLoading, setIcedLoading] = useState(false);
  const [icedError, setIcedError] = useState(null);

  // Returns true if this async chain should still be applying state updates.
  const isActive = (requestId) => mountedRef.current && activeRequestRef.current === requestId;

  const handlePushToAiden = async (recipe, beanOverride = null, requestId = null) => {
    // Pushing to the Fellow Aiden account is an Ultra-only feature. Recipe
    // generation (generateAidenRecipe, Pro-gated) produces a recipe that Pro
    // users see in the modal; clicking the Push button is what requires Ultra.
    if (!hasUltra) {
      // Reset loading/phase so the modal isn't stuck spinning behind the paywall.
      setAidenLoading(false);
      setAidenPhase(null);
      openPaywall({ feature: 'aiden', promote: 'ultra' });
      return;
    }

    // If caller didn't pass a requestId, start a new chain (external retry button etc.).
    const rid = requestId ?? Symbol('push');
    if (!requestId) activeRequestRef.current = rid;

    if (!isActive(rid)) return;
    setAidenError(null);
    setAidenResult(null);
    setAidenLoading(true);
    const targetBean = beanOverride || aidenBean;
    try {
      const result = await pushToAiden(recipe, targetBean);
      if (!isActive(rid)) return;
      setAidenResult(result);
      if (result.grindRecommendation) {
        setAidenRecipe(prev => ({ ...prev, grindRecommendation: result.grindRecommendation }));
      }
      // Persist the brew.link so we don't push again next time (non-blocking, don't hide push success).
      // targetBean.id is captured in closure so the Firestore write always lands on the correct bean
      // even if the user has since moved on to a different one -- we just don't render A's result.
      if (result.link && targetBean?.id) {
        updateBean(targetBean.id, { aidenLink: result.link, aidenUsedRelay: result.usedRelay || false })
          .catch(err => console.warn('Failed to persist aidenLink:', err.message));
      }
    } catch (fellowErr) {
      if (!isActive(rid)) return;
      setAidenError(fellowErr.message || "Couldn't push to Aiden");
    }
    if (isActive(rid)) setAidenLoading(false);
  };

  const handlePushIced = useCallback(async (icedRecipe) => {
    if (!hasUltra) {
      openPaywall({ feature: 'aiden', promote: 'ultra' });
      return;
    }
    const rid = Symbol('icedPush');
    activeRequestRef.current = rid;
    const targetBean = aidenBean;
    setIcedError(null);
    setIcedResult(null);
    setIcedLoading(true);
    try {
      const result = await pushToAiden(icedRecipe, targetBean, { isIced: true });
      if (!isActive(rid)) return;
      setIcedResult(result);
      if (result.link && targetBean?.id) {
        updateBean(targetBean.id, { aidenIcedLink: result.link, aidenIcedUsedRelay: result.usedRelay || false })
          .catch(err => console.warn('Failed to persist aidenIcedLink:', err.message));
      }
    } catch (err) {
      if (!isActive(rid)) return;
      setIcedError(err.message || "Couldn't push iced profile");
    }
    if (isActive(rid)) setIcedLoading(false);
  }, [hasUltra, openPaywall, aidenBean, updateBean]);

  const handleBrewWithAiden = async (bean, cachedResearch = null, forceRegenerate = false) => {
    // Cached recipe with no push pending: free to show (just displays stored data).
    const hasCachedRecipeOnly = !forceRegenerate && bean.aidenRecipe && bean.aidenLink;
    if (!hasCachedRecipeOnly && !hasPro) {
      // Cancel any in-flight chain so its tail effects don't land after
      // the paywall opens (and possibly persist a Pro-gated recipe to a
      // user who no longer has Pro).
      activeRequestRef.current = null;
      openPaywall({ feature: 'generic', promote: 'pro' });
      return;
    }

    const rid = Symbol('brew');
    activeRequestRef.current = rid;

    setAidenBean(bean);
    setAidenResult(null);
    setAidenError(null);
    setIcedResult(bean.aidenIcedLink ? { link: bean.aidenIcedLink, usedRelay: bean.aidenIcedUsedRelay || false } : null);
    setIcedError(null);
    setIcedLoading(false);
    setAidenModal(true);

    // Show cached recipe immediately if available (skip generation)
    if (!forceRegenerate && bean.aidenRecipe) {
      if (!isActive(rid)) return;
      setAidenRecipe(bean.aidenRecipe);

      // If we already have a brew.link for this bean, show it directly (no re-push)
      if (bean.aidenLink) {
        if (!isActive(rid)) return;
        setAidenResult({ link: bean.aidenLink, usedRelay: bean.aidenUsedRelay || false });
        setAidenLoading(false);
        setAidenPhase(null);
        return;
      }

      // No link yet, push to Fellow (handlePushToAiden persists the link)
      if (!isActive(rid)) return;
      setAidenPhase('push');
      await handlePushToAiden(bean.aidenRecipe, bean, rid);
      if (isActive(rid)) setAidenPhase(null);
      return;
    }

    if (!isActive(rid)) return;
    setAidenRecipe(null);
    setAidenLoading(true);

    // Step 1: Research (skip if cached)
    let research = cachedResearch;
    if (!research) {
      setAidenPhase('research');
      try {
        research = await researchBean(bean);
        if (!isActive(rid)) return;
        setAidenResearch(research);
      } catch (err) {
        console.warn('Bean research failed, continuing without enrichment:', err.message);
        research = null;
      }
    }
    if (!isActive(rid)) return;

    // Step 2: Recipe
    setAidenPhase('recipe');
    try {
      const recipe = await generateAidenRecipe(bean, research);
      if (!isActive(rid)) return;
      setAidenRecipe(recipe);
      setAidenError(null);
      if (bean.id) {
        const persist = {
          aidenRecipe: { ...recipe, generatedAt: new Date().toISOString() },
          aidenLink: null, aidenUsedRelay: null,
          aidenIcedLink: null, aidenIcedUsedRelay: null,
        };
        if (recipe.grindRecommendation) persist.aidenGrind = recipe.grindRecommendation;
        await updateBean(bean.id, persist);
      }
      if (!isActive(rid)) return;
      // Step 3: Push to Fellow (pass bean explicitly to avoid stale closure)
      setAidenPhase('push');
      await handlePushToAiden(recipe, bean, rid);
    } catch (err) {
      if (!isActive(rid)) return;
      setAidenError(err.message || "Couldn't generate a recipe");
      setAidenLoading(false);
    }
    if (isActive(rid)) setAidenPhase(null);
  };

  const closeAidenModal = () => {
    // Cancel any in-flight request so its tail doesn't re-populate state after close.
    activeRequestRef.current = null;
    setAidenModal(false);
  };

  return {
    aidenModal, aidenRecipe, aidenResult, aidenLoading, aidenError,
    aidenPhase, aidenBean, aidenResearch,
    icedResult, icedLoading, icedError,
    handleBrewWithAiden, closeAidenModal,
    onRetry: aidenBean ? () => handleBrewWithAiden(aidenBean, aidenResearch) : undefined,
    onRetryPush: aidenRecipe ? () => handlePushToAiden(aidenRecipe) : undefined,
    onRegenerate: aidenBean ? () => handleBrewWithAiden(aidenBean, aidenResearch, true) : undefined,
    onPushCached: (recipe) => handlePushToAiden(recipe),
    onPushIced: handlePushIced,
    onRetryIcedPush: () => setIcedError(null),
  };
}
