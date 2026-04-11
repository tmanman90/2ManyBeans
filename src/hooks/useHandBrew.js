// Hand brew hook — mirrors useAidenBrew request-token pattern.
//
// Each handleBrewHandBrew call generates a fresh requestId. If a later call
// starts (different bean, regenerate, modal reopen) while an earlier one is
// still awaiting research or recipe generation, the stale chain's `setX`
// updates are ignored so recipe/error state from an abandoned brew can't land
// on the bean currently displayed. Firestore writes use the closure-captured
// bean.id so they always target the right doc regardless of render state.
import { useState, useRef, useEffect } from 'react';
import { researchBean } from '../lib/beanResearch';
import { generateHandBrewRecipe } from '../lib/handbrew';
import { usePreferences } from './useUserProfile';
import { useSubscription } from '../contexts/SubscriptionContext';
import { usePaywall } from './usePaywall.jsx';

export function useHandBrew(updateBean) {
  const mountedRef = useRef(true);
  const activeRequestRef = useRef(null);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const { preferences } = usePreferences();
  const { hasPro } = useSubscription();
  const { openPaywall } = usePaywall();
  const [handBrewModal, setHandBrewModal] = useState(false);
  const [handBrewRecipe, setHandBrewRecipe] = useState(null);
  const [handBrewLoading, setHandBrewLoading] = useState(false);
  const [handBrewError, setHandBrewError] = useState(null);
  const [handBrewBean, setHandBrewBean] = useState(null);
  const [handBrewResearch, setHandBrewResearch] = useState(null);
  const [handBrewPhase, setHandBrewPhase] = useState(null);

  const isActive = (rid) => mountedRef.current && activeRequestRef.current === rid;

  const handleBrewHandBrew = async (bean, cachedResearch = null, forceRegenerate = false) => {
    // Show cached recipe immediately if available, even for free users.
    // The cached recipe already exists — no API cost to display it.
    if (!forceRegenerate && bean.handBrewRecipe) {
      const rid = Symbol('handbrew');
      activeRequestRef.current = rid;
      setHandBrewBean(bean);
      setHandBrewError(null);
      setHandBrewModal(true);
      setHandBrewRecipe(bean.handBrewRecipe);
      setHandBrewLoading(false);
      setHandBrewPhase(null);
      return;
    }

    // Recipe generation costs AI tokens. Pro or Ultra required.
    if (!hasPro) {
      openPaywall({ feature: 'generic', promote: 'pro' });
      return;
    }

    const rid = Symbol('handbrew');
    activeRequestRef.current = rid;

    setHandBrewBean(bean);
    setHandBrewError(null);
    setHandBrewModal(true);

    if (!isActive(rid)) return;
    setHandBrewRecipe(null);
    setHandBrewLoading(true);

    // Step 1: Research (skip if cached on bean doc or passed in)
    let research = cachedResearch || bean.beanResearch || null;
    if (!research) {
      setHandBrewPhase('research');
      try {
        research = await researchBean(bean);
        if (!isActive(rid)) return;
        setHandBrewResearch(research);
        // Cache research on bean doc for future use
        if (bean.id) {
          await updateBean(bean.id, { beanResearch: research });
        }
      } catch (err) {
        console.warn('Bean research failed, continuing without enrichment:', err.message);
        research = null;
      }
    }
    if (!isActive(rid)) return;

    // Step 2: Generate recipe
    setHandBrewPhase('recipe');
    try {
      const recipe = await generateHandBrewRecipe(bean, research, preferences);
      if (!isActive(rid)) return;
      setHandBrewRecipe(recipe);
      setHandBrewError(null);
      // Persist recipe to bean doc (include grinder key for cache invalidation)
      if (bean.id) {
        await updateBean(bean.id, {
          handBrewRecipe: {
            ...recipe,
            generatedAt: new Date().toISOString(),
            grinder: preferences?.grinder || 'fellow-ode-gen2',
          },
        });
      }
    } catch (err) {
      if (!isActive(rid)) return;
      setHandBrewError(err.message || "Couldn't generate a recipe");
    }
    if (isActive(rid)) {
      setHandBrewLoading(false);
      setHandBrewPhase(null);
    }
  };

  const closeHandBrewModal = () => {
    // Cancel any in-flight request so tail effects don't repopulate state after close.
    activeRequestRef.current = null;
    setHandBrewModal(false);
  };

  return {
    handBrewModal, handBrewRecipe, handBrewLoading, handBrewError,
    handBrewPhase, handBrewBean, handBrewResearch,
    handleBrewHandBrew, closeHandBrewModal,
    onRetry: handBrewBean ? () => handleBrewHandBrew(handBrewBean, handBrewResearch) : undefined,
    onRegenerate: handBrewBean ? () => handleBrewHandBrew(handBrewBean, handBrewResearch, true) : undefined,
  };
}
