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
import { buildSourceContextHash, hasSourceInsights } from '../lib/sourceInsights';
import { normalizeRecipeEvidence } from '../lib/recipeEvidence';
import { buildExtractionIntent } from '../lib/extractionIntent';
import { generateKalitaRecipe, KALITA_ENGINE_VERSION, KALITA_RULES_VERSION } from '../lib/kalitaAdapter';
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

  const recipeMatchesSource = (bean, recipe) => {
    if (!recipe) return false;
    if (!hasSourceInsights(bean)) return true;
    const hash = buildSourceContextHash(bean);
    return Boolean(hash && recipe.sourceContextHash === hash);
  };

  const candidateMatchesConfiguration = (recipe, device, dose) => {
    if (!recipe?.candidate) return true;
    return recipe.device === device
      && recipe.engineVersion === KALITA_ENGINE_VERSION
      && recipe.rulesVersion === KALITA_RULES_VERSION
      && recipe.kalitaSize === (preferences?.kalitaSize || '185')
      && recipe.coffeeGrams === dose;
  };

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
    // Kalita is now automatically bean-specific. The legacy GPT path remains
    // an invisible fallback if evidence normalization or candidate generation
    // fails; users do not need to choose between engines.
    const candidateMode = device === 'kalita' ? 'candidate' : 'legacy';
    const requestedDose = Number(bean.userCoffeeGrams || bean.handBrewRecipes?.[device]?.userCoffeeGrams);
    const defaultDose = (preferences?.kalitaSize || '185') === '155' ? 15 : 20;
    const candidateDose = Number.isFinite(requestedDose) && requestedDose > 0 ? requestedDose : defaultDose;

    // Check keyed cache first, fall back to legacy single-recipe field
    const keyedRecipe = bean.handBrewRecipes?.[device];
    const legacyRecipe = bean.handBrewRecipe;
    const cachedCandidate = keyedRecipe ||
      (legacyRecipe && (legacyRecipe.device || 'v60') === device ? legacyRecipe : null);
    const cached = recipeMatchesSource(bean, cachedCandidate) && candidateMatchesConfiguration(cachedCandidate, device, candidateDose)
      ? cachedCandidate : null;
    const sourceHash = buildSourceContextHash(bean);

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
      let recipe;
      let shadowCandidate = null;
      if (device === 'kalita' && (candidateMode === 'candidate' || candidateMode === 'shadow')) {
        try {
          const evidence = normalizeRecipeEvidence(bean, research);
          const intent = buildExtractionIntent(evidence);
          shadowCandidate = generateKalitaRecipe(intent, {
            size: preferences?.kalitaSize,
            dose: candidateDose,
            grinder: grinderKey,
          });
          recipe = candidateMode === 'candidate' ? shadowCandidate : null;
        } catch (candidateError) {
          console.warn('[handBrew] Kalita candidate failed; falling back to GPT:', candidateError?.message || candidateError);
        }
      }
      if (!recipe) {
        recipe = await generateHandBrewRecipe(bean, research, preferences, device);
        if (device === 'kalita' && candidateMode === 'candidate') {
          recipe = { ...recipe, generationStatus: 'fallback', fallbackReason: 'kalita-candidate-unavailable' };
        }
      }
      if (!isActive(rid)) return;
      const recipeData = {
        ...recipe,
        generatedAt: new Date().toISOString(),
        grinder: grinderKey,
        device,
        sourceContextHash: sourceHash,
        ...(recipe.candidate ? {
          engineVersion: recipe.engineVersion,
          rulesVersion: recipe.rulesVersion,
          evidenceHash: recipe.evidenceHash,
        } : {}),
        ...(candidateMode === 'shadow' && shadowCandidate ? { shadowCandidate } : {}),
      };
      setHandBrewRecipe(recipeData);
      setHandBrewError(null);
      if (bean.id) {
        // Shadow candidates remain in memory only. The saved recipe stays on
        // the legacy path until the separately gated cutover is enabled.
        const persistedRecipe = { ...recipeData };
        delete persistedRecipe.shadowCandidate;
        await updateBean(bean.id, {
          handBrewRecipe: persistedRecipe,
          [`handBrewRecipes.${device}`]: persistedRecipe,
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
