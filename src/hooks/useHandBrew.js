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
import { V60_ENGINE_VERSION, V60_RULES_VERSION, V60_CONFIGURATION_KEY, V60_PHASE_CONTRACT_VERSION, validateV60Candidate } from '../lib/v60Adapter';
import { V60_ICED_ENGINE_VERSION, V60_ICED_RULES_VERSION, V60_ICED_CONFIGURATION_KEY, V60_ICED_PHASE_CONTRACT_VERSION, validateV60IcedCandidate } from '../lib/v60IcedAdapter';
import { V60_SOURCE_REGISTRY_VERSION } from '../data/v60SourceRegistry';
import { V60_ICED_SOURCE_REGISTRY_VERSION } from '../data/v60IcedSourceRegistry';
import { generateV60HotWithFallback, generateV60IcedWithFallback, v60DoseForRequest } from '../lib/v60Generation';
import { usePreferences } from './useUserProfile';
import { useSubscription } from '../contexts/SubscriptionContext';
import { usePaywall } from './usePaywall.jsx';

export function useHandBrew(updateBean, saveHandBrewTiming) {
  const mountedRef = useRef(true);
  const activeRequestRef = useRef(null);
  const timingSaveInFlightRef = useRef(null);
  const doseDebounceRef = useRef(null);
  const requestedFingerprintRef = useRef(null);
  useEffect(() => {
    // React Strict Mode intentionally mounts, cleans up, and mounts effects
    // again in development. Restore the live flag during setup so the second
    // mount can finish a recipe request instead of leaving an empty modal.
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (doseDebounceRef.current) clearTimeout(doseDebounceRef.current);
    };
  }, []);

  const { preferences, updatePreferences } = usePreferences();
  const { hasPro } = useSubscription();
  const { openPaywall } = usePaywall();
  const [handBrewModal, setHandBrewModal] = useState(false);
  const [handBrewRecipe, setHandBrewRecipe] = useState(null);
  const [handBrewIcedRecipe, setHandBrewIcedRecipe] = useState(null);
  const [handBrewIcedLoading, setHandBrewIcedLoading] = useState(false);
  const [handBrewIcedError, setHandBrewIcedError] = useState(null);
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
    if (!recipe?.candidate) return false;
    if (recipe.device !== device || recipe.coffeeGrams !== dose) return false;
    if (device === 'kalita') {
      return recipe.engineVersion === KALITA_ENGINE_VERSION
        && recipe.rulesVersion === KALITA_RULES_VERSION
        && recipe.kalitaSize === (activePreferences?.kalitaSize || '185');
    }
    return recipe.mode === 'hot'
      && recipe.engineVersion === V60_ENGINE_VERSION
      && recipe.rulesVersion === V60_RULES_VERSION
      && recipe.configurationKey === V60_CONFIGURATION_KEY
      && recipe.sourceRegistryVersion === V60_SOURCE_REGISTRY_VERSION
      && recipe.phaseContractVersion === V60_PHASE_CONTRACT_VERSION
      && validateV60Candidate(recipe).valid;
  };

  const icedCandidateMatchesConfiguration = (recipe, dose, bean, research) => {
    if (!recipe?.candidate || recipe.device !== 'v60' || recipe.mode !== 'iced') return false;
    if (recipe.coffeeGrams !== dose || recipe.engineVersion !== V60_ICED_ENGINE_VERSION || recipe.rulesVersion !== V60_ICED_RULES_VERSION) return false;
    if (recipe.configurationKey !== V60_ICED_CONFIGURATION_KEY || recipe.grinder !== (preferences?.grinder || 'fellow-ode-gen2')) return false;
    if (recipe.sourceRegistryVersion !== V60_ICED_SOURCE_REGISTRY_VERSION || recipe.phaseContractVersion !== V60_ICED_PHASE_CONTRACT_VERSION) return false;
    if (!validateV60IcedCandidate(recipe).valid) return false;
    return recipe.sourceContextHash === buildSourceContextHash({ ...bean, beanResearch: research });
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
    if (doseDebounceRef.current) {
      clearTimeout(doseDebounceRef.current);
      doseDebounceRef.current = null;
    }
    requestedFingerprintRef.current = null;
    const device = deviceOverride || getBrewDevice();
    const requestResearch = cachedResearch || bean.beanResearch || null;
    // Replace, rather than retain, per-bean research before any cache path can
    // return. A later dose change must never regenerate Bean B with Bean A's
    // research left in hook state.
    setHandBrewResearch(requestResearch);
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
    const defaultDose = device === 'kalita' ? ((activePreferences?.kalitaSize || '185') === '155' ? 15 : 20) : 15;
    const candidateDose = device === 'v60'
      ? v60DoseForRequest(requestedDose, defaultDose)
      : (Number.isFinite(requestedDose) && requestedDose > 0 ? requestedDose : defaultDose);

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
        const cachedIcedValid = icedCandidateMatchesConfiguration(cachedIced, candidateDose, bean, requestResearch);
        setHandBrewIcedRecipe(cachedIcedValid ? cachedIced : null);
        setHandBrewIcedError(cachedIcedValid ? null : 'Saved iced recipe is missing or stale; regenerate it.');
        setHandBrewIcedLoading(false);
        setHandBrewLoading(false);
        setHandBrewPhase(null);
        return;
      }
    }

    // Legacy records remain readable compatibility data. They are never a
    // deterministic cache hit and are not rewritten until the user explicitly
    // regenerates or edits the dose.
    if (!forceRegenerate && cachedCandidate && cachedCandidate.candidate !== true && (recipeMatchesSource(bean, cachedCandidate) || !cachedCandidate.sourceContextHash)) {
      const rid = Symbol('handbrew-legacy');
      activeRequestRef.current = rid;
      setHandBrewBean(bean);
      setHandBrewRecipe(cachedCandidate);
      setHandBrewIcedRecipe(bean.handBrewIcedRecipes?.[device] || null);
      setHandBrewIcedError(null);
      setHandBrewIcedLoading(false);
      setHandBrewError(null);
      setHandBrewModal(true);
      setHandBrewLoading(false);
      setHandBrewPhase(null);
      return;
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
    setHandBrewIcedError(null);
    setHandBrewIcedLoading(device === 'v60');
    setHandBrewLoading(true);

    // Step 1: Research (skip if cached)
    let research = requestResearch;
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
      let icedGenerationError = null;
      if (device === 'v60' && candidateMode === 'candidate') {
        const evidence = normalizeRecipeEvidence(bean, research);
        const intent = buildExtractionIntent(evidence);
        const icedResult = generateV60IcedWithFallback({ intent, configuration: { dose: candidateDose, grinder: grinderKey } });
        icedRecipe = icedResult.recipe;
        icedGenerationError = icedResult.recipe ? null : icedResult.error;
      }
      if (device === 'v60' && !recipe) {
        const evidence = normalizeRecipeEvidence(bean, research);
        const intent = buildExtractionIntent(evidence);
        const hotResult = generateV60HotWithFallback({ intent, configuration: { dose: candidateDose, grinder: grinderKey }, evidence });
        recipe = hotResult.recipe;
        if (!recipe) throw new Error(`V60 regeneration unavailable: ${hotResult.error?.message || 'deterministic candidate and fallback failed'}`);
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
      if (device === 'v60') {
        setHandBrewIcedLoading(false);
        setHandBrewIcedError(icedGenerationError ? `Iced V60 regeneration unavailable: ${icedGenerationError.message || icedGenerationError}` : null);
      }
      if (icedRecipe) setHandBrewIcedRecipe({ ...icedRecipe, generatedAt: recipeData.generatedAt, sourceContextHash: recipeData.sourceContextHash, grinder: grinderKey });
      setHandBrewError(null);
      if (bean.id) {
        // Shadow candidates remain in memory only. The saved recipe stays on
        // the legacy path until the separately gated cutover is enabled.
        const persistedRecipe = { ...recipeData };
        delete persistedRecipe.shadowCandidate;
        await updateBean(bean.id, {
          handBrewRecipe: persistedRecipe,
          [`handBrewRecipes.${device}`]: persistedRecipe,
          ...(icedRecipe ? { [`handBrewIcedRecipes.${device}`]: { ...icedRecipe, generatedAt: recipeData.generatedAt, sourceContextHash: recipeData.sourceContextHash, grinder: grinderKey } } : {}),
        });
      }
    } catch (err) {
      if (!isActive(rid)) return;
      setHandBrewIcedLoading(false);
      setHandBrewError(err.message || "Couldn't generate a recipe");
    }
    if (isActive(rid)) {
      setHandBrewLoading(false);
      setHandBrewPhase(null);
    }
  };

  const regenerateIced = async () => {
    if (!handBrewBean || getBrewDevice() !== 'v60') return;
    const rid = Symbol('handbrew-iced');
    activeRequestRef.current = rid;
    const grinderKey = preferences?.grinder || 'fellow-ode-gen2';
    const requestedDose = handBrewRecipe?.coffeeGrams || handBrewBean.userCoffeeGrams;
    const candidateDose = v60DoseForRequest(requestedDose, 15);
    setHandBrewIcedLoading(true);
    setHandBrewIcedError(null);
    try {
      const research = handBrewResearch || handBrewBean.beanResearch || null;
      const evidence = normalizeRecipeEvidence(handBrewBean, research);
      const intent = buildExtractionIntent(evidence);
      const result = generateV60IcedWithFallback({ intent, configuration: { dose: candidateDose, grinder: grinderKey } });
      if (!result.recipe) throw new Error(result.error?.message || 'deterministic candidate and fallback failed');
      if (!isActive(rid)) return;
      const hydrated = { ...result.recipe, generatedAt: new Date().toISOString(), sourceContextHash: buildSourceContextHash({ ...handBrewBean, beanResearch: research }), grinder: grinderKey };
      setHandBrewIcedRecipe(hydrated);
      setHandBrewIcedError(null);
      if (handBrewBean.id) await updateBean(handBrewBean.id, { [`handBrewIcedRecipes.v60`]: hydrated });
    } catch (err) {
      if (isActive(rid)) setHandBrewIcedError(`Iced V60 regeneration unavailable: ${err.message || err}`);
    } finally {
      if (isActive(rid)) setHandBrewIcedLoading(false);
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
    if (doseDebounceRef.current) {
      clearTimeout(doseDebounceRef.current);
      doseDebounceRef.current = null;
    }
    requestedFingerprintRef.current = null;
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
    // A tap invalidates every in-flight mode request before React state or
    // persistence can observe the stale recipe. The next generation owns the
    // full dose/device/mode fingerprint.
    activeRequestRef.current = null;
    const fingerprint = `${handBrewRecipe?.device || 'v60'}:${newDose}:${handBrewRecipe?.mode || 'hot'}:${preferences?.grinder || 'fellow-ode-gen2'}`;
    requestedFingerprintRef.current = fingerprint;
    setUserCoffeeGrams(newDose);
    if (handBrewRecipe?.device === 'v60' && handBrewBean) {
      if (doseDebounceRef.current) clearTimeout(doseDebounceRef.current);
      doseDebounceRef.current = setTimeout(() => {
        doseDebounceRef.current = null;
        if (!mountedRef.current || requestedFingerprintRef.current !== fingerprint) return;
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
    handBrewModal, handBrewRecipe, handBrewIcedRecipe, handBrewIcedLoading, handBrewIcedError, handBrewLoading, handBrewError,
    handBrewPhase, handBrewBean, handBrewResearch,
    handleBrewHandBrew, closeHandBrewModal,
    handleKalitaSizeChange,
    userCoffeeGrams,
    setUserCoffeeGrams,
    handleCoffeeGramsChange,
    persistDose,
    saveTimingEvent,
    onRetryIced: regenerateIced,
    onRetry: handBrewBean ? () => handleBrewHandBrew(handBrewBean, handBrewResearch, false, handBrewRecipe?.device) : undefined,
    onRegenerate: handBrewBean ? () => handleBrewHandBrew(handBrewBean, handBrewResearch, true, handBrewRecipe?.device) : undefined,
  };
}
