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
import { buildSourceContextHash } from '../lib/sourceInsights';
import { normalizeRecipeEvidence } from '../lib/recipeEvidence';
import { buildExtractionIntent } from '../lib/extractionIntent';
import { generateKalitaRecipe, KALITA_ENGINE_VERSION, KALITA_RULES_VERSION } from '../lib/kalitaAdapter';
import { generateV60Recipe, generateV60Fallback, V60_ENGINE_VERSION, V60_RULES_VERSION, V60_CONFIGURATION_KEY } from '../lib/v60Adapter';
import { generateV60IcedRecipe, generateV60IcedFallback } from '../lib/v60IcedAdapter';
import { usePreferences } from './useUserProfile';
import { useSubscription } from '../contexts/SubscriptionContext';
import { usePaywall } from './usePaywall.jsx';

export function useHandBrew(updateBean, saveHandBrewTiming) {
  const mountedRef = useRef(true);
  const activeRequestRef = useRef(null);
  const timingSaveInFlightRef = useRef(null);
  const doseDebounceRef = useRef(null);
  useEffect(() => () => { mountedRef.current = false; if (doseDebounceRef.current) clearTimeout(doseDebounceRef.current); }, []);

  const { preferences, updatePreferences } = usePreferences();
  const { hasPro } = useSubscription();
  const { openPaywall } = usePaywall();
  const [handBrewModal, setHandBrewModal] = useState(false);
  const [handBrewRecipe, setHandBrewRecipe] = useState(null);
  const [handBrewIcedRecipe, setHandBrewIcedRecipe] = useState(null);
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
    const hash = buildSourceContextHash(bean);
    if (!hash) return !recipe.sourceContextHash;
    return recipe.sourceContextHash === hash;
  };

  const candidateMatchesConfiguration = (recipe, device, dose, activePreferences = preferences) => {
    if (!recipe?.candidate) return true;
    if (recipe.device !== device || recipe.coffeeGrams !== dose) return false;
    if (device === 'kalita') {
      return recipe.engineVersion === KALITA_ENGINE_VERSION
        && recipe.rulesVersion === KALITA_RULES_VERSION
        && recipe.kalitaSize === (activePreferences?.kalitaSize || '185');
    }
    return recipe.mode === 'hot'
      && recipe.engineVersion === V60_ENGINE_VERSION
      && recipe.rulesVersion === V60_RULES_VERSION
      && recipe.configurationKey === V60_CONFIGURATION_KEY;
  };

  // Resolve the brew device from preferences (default to v60 for non-aiden methods)
  const getBrewDevice = () => {
    const m = preferences?.brewMethod;
    if (!m || m === 'aiden') return 'v60';
    if (m === 'handbrew') return 'v60';
    return m;
  };

  const handleBrewHandBrew = async (
    bean,
    cachedResearch = null,
    forceRegenerate = false,
    deviceOverride = null,
    generationOverrides = {},
  ) => {
    const device = deviceOverride || getBrewDevice();
    const activePreferences = {
      ...preferences,
      ...(generationOverrides.kalitaSize ? { kalitaSize: generationOverrides.kalitaSize } : {}),
    };
    const grinderKey = activePreferences?.grinder || 'fellow-ode-gen2';
    // Kalita is now automatically bean-specific. The legacy GPT path remains
    // an invisible fallback if evidence normalization or candidate generation
    // fails; users do not need to choose between engines.
    const candidateMode = device === 'kalita' || device === 'v60' ? 'candidate' : 'legacy';
    const requestedDose = generationOverrides.doseOverride ?? Number(bean.userCoffeeGrams || bean.handBrewRecipes?.[device]?.userCoffeeGrams);
    const defaultDose = (activePreferences?.kalitaSize || '185') === '155' ? 15 : 20;
    const candidateDose = Number.isFinite(requestedDose) && requestedDose > 0 ? requestedDose : defaultDose;

    // Check keyed cache first, fall back to legacy single-recipe field
    const keyedRecipe = bean.handBrewRecipes?.[device];
    const legacyRecipe = bean.handBrewRecipe;
    const cachedCandidate = keyedRecipe ||
      (legacyRecipe && (legacyRecipe.device || 'v60') === device ? legacyRecipe : null);
    const kalitaCacheEligible = device !== 'kalita' || cachedCandidate?.candidate === true;
    const cached = kalitaCacheEligible
      && recipeMatchesSource(bean, cachedCandidate)
      && candidateMatchesConfiguration(cachedCandidate, device, candidateDose, activePreferences)
      ? cachedCandidate : null;

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
        const cachedIced = bean.handBrewIcedRecipes?.[device];
        setHandBrewIcedRecipe(cachedIced?.candidate && cachedIced.coffeeGrams === candidateDose ? cachedIced : null);
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
    setHandBrewIcedRecipe(null);
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
            size: activePreferences?.kalitaSize,
            dose: candidateDose,
            grinder: grinderKey,
          });
          recipe = candidateMode === 'candidate' ? shadowCandidate : null;
        } catch (candidateError) {
          console.warn('[handBrew] Kalita candidate failed; falling back to GPT:', candidateError?.message || candidateError);
        }
      }
      let icedRecipe = null;
      if (device === 'v60' && candidateMode === 'candidate') {
        try {
          const evidence = normalizeRecipeEvidence(bean, research);
          const intent = buildExtractionIntent(evidence);
          icedRecipe = generateV60IcedRecipe(intent, { dose: candidateDose, grinder: grinderKey });
        } catch (icedError) {
          try {
            icedRecipe = generateV60IcedFallback({ dose: candidateDose, grinder: grinderKey }, icedError?.message || 'iced-candidate-failed');
          } catch (fallbackError) {
            console.warn('[handBrew] Iced V60 candidate and fallback failed:', fallbackError?.message || fallbackError);
          }
        }
      }
      if (device === 'v60' && !recipe) {
        try {
          const evidence = normalizeRecipeEvidence(bean, research);
          const intent = buildExtractionIntent(evidence);
          recipe = generateV60Recipe(intent, { dose: candidateDose, grinder: grinderKey }, evidence);
        } catch (candidateError) {
          try {
            recipe = generateV60Fallback({ dose: candidateDose, grinder: grinderKey }, candidateError?.message || 'candidate-failed');
          } catch (fallbackError) {
            console.warn('[handBrew] V60 candidate and fallback failed; preserving legacy path:', fallbackError?.message || fallbackError);
          }
        }
      }
      if (!recipe) {
        recipe = await generateHandBrewRecipe(bean, research, activePreferences, device);
        if (device === 'kalita' && candidateMode === 'candidate') {
          recipe = { ...recipe, generationStatus: 'fallback', fallbackReason: 'kalita-candidate-unavailable' };
        }
      }
      if (!isActive(rid)) return;
      const recipeData = {
        ...recipe,
        ...(recipe.candidate ? { userCoffeeGrams: candidateDose } : {}),
        generatedAt: new Date().toISOString(),
        grinder: grinderKey,
        device,
        sourceContextHash: buildSourceContextHash({ ...bean, beanResearch: research }),
        ...(recipe.candidate ? {
          engineVersion: recipe.engineVersion,
          rulesVersion: recipe.rulesVersion,
          evidenceHash: recipe.evidenceHash,
        } : {}),
        ...(candidateMode === 'shadow' && shadowCandidate ? { shadowCandidate } : {}),
      };
      setHandBrewRecipe(recipeData);
      if (icedRecipe) setHandBrewIcedRecipe({ ...icedRecipe, generatedAt: recipeData.generatedAt, sourceContextHash: recipeData.sourceContextHash });
      setHandBrewError(null);
      if (bean.id) {
        // Shadow candidates remain in memory only. The saved recipe stays on
        // the legacy path until the separately gated cutover is enabled.
        const persistedRecipe = { ...recipeData };
        delete persistedRecipe.shadowCandidate;
        await updateBean(bean.id, {
          handBrewRecipe: persistedRecipe,
          [`handBrewRecipes.${device}`]: persistedRecipe,
          ...(icedRecipe ? { [`handBrewIcedRecipes.${device}`]: { ...icedRecipe, generatedAt: recipeData.generatedAt, sourceContextHash: recipeData.sourceContextHash } } : {}),
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

  const handleKalitaSizeChange = async (size) => {
    const nextSize = String(size);
    if (!['155', '185'].includes(nextSize) || handBrewRecipe?.device !== 'kalita' || !handBrewBean) return;

    try {
      await updatePreferences({ kalitaSize: nextSize });
    } catch (err) {
      console.warn('[handBrew] Kalita size preference failed:', err?.message || err);
      setHandBrewError('Could not save the Wave size. Try again.');
      return;
    }

    setUserCoffeeGrams(undefined);
    await handleBrewHandBrew(
      handBrewBean,
      handBrewResearch,
      true,
      'kalita',
      { kalitaSize: nextSize, doseOverride: nextSize === '155' ? 15 : 20 },
    );
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

  const handleCoffeeGramsChange = (newDose) => {
    if (typeof newDose !== 'number' || newDose <= 0) return;
    setUserCoffeeGrams(newDose);
    if (handBrewRecipe?.candidate && handBrewRecipe.device === 'v60' && handBrewBean) {
      if (doseDebounceRef.current) clearTimeout(doseDebounceRef.current);
      doseDebounceRef.current = setTimeout(() => {
        handleBrewHandBrew(handBrewBean, handBrewResearch, true, 'v60', { doseOverride: newDose });
      }, 350);
    }
  };

  const saveTimingEvent = useCallback(async (snapshot) => {
    if (!handBrewBean?.id || !saveHandBrewTiming) return { status: 'ephemeral' };
    if (timingSaveInFlightRef.current) return timingSaveInFlightRef.current;
    const pending = saveHandBrewTiming(handBrewBean.id, snapshot);
    timingSaveInFlightRef.current = pending;
    try {
      return await pending;
    } finally {
      if (timingSaveInFlightRef.current === pending) timingSaveInFlightRef.current = null;
    }
  }, [handBrewBean?.id, saveHandBrewTiming]);

  return {
    handBrewModal, handBrewRecipe, handBrewIcedRecipe, handBrewLoading, handBrewError,
    handBrewPhase, handBrewBean, handBrewResearch,
    handleBrewHandBrew, closeHandBrewModal,
    handleKalitaSizeChange,
    userCoffeeGrams,
    setUserCoffeeGrams,
    handleCoffeeGramsChange,
    persistDose,
    saveTimingEvent,
    onRetry: handBrewBean ? () => handleBrewHandBrew(handBrewBean, handBrewResearch, false, handBrewRecipe?.device) : undefined,
    onRegenerate: handBrewBean ? () => handleBrewHandBrew(handBrewBean, handBrewResearch, true, handBrewRecipe?.device) : undefined,
  };
}
