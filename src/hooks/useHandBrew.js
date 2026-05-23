// Hand brew hook — mirrors useAidenBrew request-token pattern.
//
// Each handleBrewHandBrew call generates a fresh requestId. If a later call
// starts (different bean, regenerate, modal reopen) while an earlier one is
// still awaiting research or recipe generation, the stale chain's `setX`
// updates are ignored so recipe/error state from an abandoned brew can't land
// on the bean currently displayed.
import { useState, useRef, useEffect, useCallback } from 'react';
import { researchBean } from '../lib/beanResearch';
import { generateHandBrewRecipe, repairHandBrewRecipe } from '../lib/handbrew';
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
  const [userCoffeeGrams, setUserCoffeeGrams] = useState(undefined);
  useEffect(() => {
    if (handBrewRecipe == null) return;
    setUserCoffeeGrams(handBrewRecipe.userCoffeeGrams);
  }, [handBrewRecipe]);

  const isActive = (rid) => mountedRef.current && activeRequestRef.current === rid;

  // Resolve the brew device from preferences (default to v60 for non-aiden methods)
  const getBrewDevice = () => {
    const m = preferences?.brewMethod;
    if (!m || m === 'aiden') return 'v60';
    if (m === 'handbrew') return 'v60';
    return m;
  };

  const handleBrewHandBrew = async (bean, cachedResearch = null, forceRegenerate = false, deviceOverride = null) => {
    const device = deviceOverride || getBrewDevice();
    const grinderKey = preferences?.grinder || 'fellow-ode-gen2';

    // Check keyed cache first, fall back to legacy single-recipe field
    const keyedRecipe = bean.handBrewRecipes?.[device];
    const legacyRecipe = bean.handBrewRecipe;
    const cached = keyedRecipe ||
      (legacyRecipe && (legacyRecipe.device || 'v60') === device ? legacyRecipe : null);

    if (!forceRegenerate && cached) {
      const cachedGrinder = cached.grinder || 'fellow-ode-gen2';
      if (cachedGrinder === grinderKey) {
        const rid = Symbol('handbrew');
        activeRequestRef.current = rid;
        setHandBrewBean(bean);
        setHandBrewError(null);
        setHandBrewModal(true);
        let hydrated = cached;
        if (cached.timerReady == null) {
          hydrated = JSON.parse(JSON.stringify(cached));
          const family = hydrated.family || bean.beanResearch?.cupStructureFamily || 'medium-washed';
          const roastLevel = hydrated.roastLevel || bean.beanResearch?.roastLevel || '';
          repairHandBrewRecipe(hydrated, grinderKey, family, roastLevel, device);
        }
        setHandBrewRecipe(hydrated);
        setHandBrewLoading(false);
        setHandBrewPhase(null);
        return;
      }
    }

    if (!hasPro) {
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

    // Step 1: Research (skip if cached)
    let research = cachedResearch || bean.beanResearch || null;
    if (!research) {
      setHandBrewPhase('research');
      try {
        research = await researchBean(bean);
        if (!isActive(rid)) return;
        setHandBrewResearch(research);
        if (bean.id) {
          await updateBean(bean.id, { beanResearch: research });
        }
      } catch (err) {
        console.warn('Bean research failed, continuing without enrichment:', err.message);
        research = null;
      }
    }
    if (!isActive(rid)) return;

    // Step 2: Generate recipe with device context
    setHandBrewPhase('recipe');
    try {
      const recipe = await generateHandBrewRecipe(bean, research, preferences, device);
      if (!isActive(rid)) return;
      const recipeData = {
        ...recipe,
        generatedAt: new Date().toISOString(),
        grinder: grinderKey,
        device,
      };
      setHandBrewRecipe(recipeData);
      setHandBrewError(null);
      if (bean.id) {
        await updateBean(bean.id, {
          handBrewRecipe: recipeData,
          [`handBrewRecipes.${device}`]: recipeData,
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
    activeRequestRef.current = null;
    setHandBrewModal(false);
  };

  const persistDose = useCallback(async (newDose) => {
    if (typeof newDose !== 'number' || newDose <= 0) return;
    setHandBrewRecipe((prev) =>
      prev ? { ...prev, userCoffeeGrams: newDose } : prev
    );
    if (!handBrewBean?.id) return;
    try {
      const dev = handBrewRecipe?.device || 'v60';
      await updateBean(handBrewBean.id, {
        'handBrewRecipe.userCoffeeGrams': newDose,
        [`handBrewRecipes.${dev}.userCoffeeGrams`]: newDose,
      });
      if (mountedRef.current) {
        setHandBrewRecipe((prev) =>
          prev ? { ...prev, userCoffeeGrams: newDose } : prev
        );
      }
    } catch (err) {
      console.warn('[handBrew] persistDose failed:', err?.message || err);
    }
  }, [handBrewBean, handBrewRecipe, updateBean]);

  return {
    handBrewModal, handBrewRecipe, handBrewLoading, handBrewError,
    handBrewPhase, handBrewBean, handBrewResearch,
    handleBrewHandBrew, closeHandBrewModal,
    userCoffeeGrams,
    setUserCoffeeGrams,
    persistDose,
    onRetry: handBrewBean ? () => handleBrewHandBrew(handBrewBean, handBrewResearch, false, handBrewRecipe?.device) : undefined,
    onRegenerate: handBrewBean ? () => handleBrewHandBrew(handBrewBean, handBrewResearch, true, handBrewRecipe?.device) : undefined,
  };
}
