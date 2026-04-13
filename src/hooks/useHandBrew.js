// Hand brew hook — mirrors useAidenBrew request-token pattern.
//
// Each handleBrewHandBrew call generates a fresh requestId. If a later call
// starts (different bean, regenerate, modal reopen) while an earlier one is
// still awaiting research or recipe generation, the stale chain's `setX`
// updates are ignored so recipe/error state from an abandoned brew can't land
// on the bean currently displayed. Firestore writes use the closure-captured
// bean.id so they always target the right doc regardless of render state.
import { useState, useRef, useEffect, useCallback } from 'react';
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
  // Lifted dose override. Hydrated from the recipe on every NON-NULL recipe
  // identity change (cached load, regenerate success). We intentionally do
  // NOT clear when `handBrewRecipe` goes null mid-regeneration — otherwise
  // the stepper briefly falls back to `min` (10g) while the loading spinner
  // takes over, producing a visible "dose dropped to 10" flash. When the
  // new recipe arrives, we hydrate from its (possibly absent) userCoffeeGrams.
  const [userCoffeeGrams, setUserCoffeeGrams] = useState(undefined);
  useEffect(() => {
    if (handBrewRecipe == null) return;
    setUserCoffeeGrams(handBrewRecipe.userCoffeeGrams);
  }, [handBrewRecipe]);

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
      // Cancel any in-flight chain so its tail effects don't land on the
      // wrong bean after the paywall opens.
      activeRequestRef.current = null;
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

  // Persist the user's dose override to Firestore. Called by HandBrewModal
  // on modal close and on Start Brew press (via onPersistDose prop). Updates
  // local recipe state AND writes to the bean doc via dot-path merge so
  // the change survives reopening. Skipped for ephemeral beans (no id) —
  // QuickRecipeFlow.handleAutoSave persists those on the initial save.
  //
  // Race guard: a concurrent useAppData onSnapshot firing between the local
  // merge and the Firestore ack can stomp the merged override. We re-assert
  // after the write resolves, gated on mountedRef, to stomp any intermediate
  // snapshot churn.
  const persistDose = useCallback(async (newDose) => {
    if (typeof newDose !== 'number' || newDose <= 0) return;
    setHandBrewRecipe((prev) =>
      prev ? { ...prev, userCoffeeGrams: newDose } : prev
    );
    if (!handBrewBean?.id) return;
    try {
      await updateBean(handBrewBean.id, {
        'handBrewRecipe.userCoffeeGrams': newDose,
      });
      if (mountedRef.current) {
        setHandBrewRecipe((prev) =>
          prev ? { ...prev, userCoffeeGrams: newDose } : prev
        );
      }
    } catch (err) {
      console.warn('[handBrew] persistDose failed:', err?.message || err);
    }
  }, [handBrewBean, updateBean]);

  return {
    handBrewModal, handBrewRecipe, handBrewLoading, handBrewError,
    handBrewPhase, handBrewBean, handBrewResearch,
    handleBrewHandBrew, closeHandBrewModal,
    userCoffeeGrams,
    setUserCoffeeGrams,
    persistDose,
    onRetry: handBrewBean ? () => handleBrewHandBrew(handBrewBean, handBrewResearch) : undefined,
    onRegenerate: handBrewBean ? () => handleBrewHandBrew(handBrewBean, handBrewResearch, true) : undefined,
  };
}
