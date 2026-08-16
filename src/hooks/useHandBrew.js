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
import { generateKalitaRecipe, KALITA_ENGINE_VERSION, KALITA_RULES_VERSION, KALITA_PHASE_CONTRACT_VERSION, validateKalitaCandidate } from '../lib/kalitaAdapter';
import { KALITA_ICED_ENGINE_VERSION, KALITA_ICED_RULES_VERSION, KALITA_ICED_PHASE_CONTRACT_VERSION, kalitaIcedConfigurationKey, validateKalitaIcedCandidate } from '../lib/kalitaIcedAdapter';
import { KALITA_ICED_SOURCE_REGISTRY_VERSION } from '../data/kalitaIcedSourceRegistry';
import { generateKalitaIcedWithFallback } from '../lib/kalitaIcedGeneration';
import { V60_ENGINE_VERSION, V60_RULES_VERSION, V60_CONFIGURATION_KEY, V60_PHASE_CONTRACT_VERSION, validateV60Candidate } from '../lib/v60Adapter';
import { V60_ICED_ENGINE_VERSION, V60_ICED_RULES_VERSION, V60_ICED_CONFIGURATION_KEY, V60_ICED_PHASE_CONTRACT_VERSION, validateV60IcedCandidate } from '../lib/v60IcedAdapter';
import { V60_SWITCH_ENGINE_VERSION, V60_SWITCH_RULES_VERSION, V60_SWITCH_PHASE_CONTRACT_VERSION, validateV60SwitchCandidate } from '../lib/v60SwitchAdapter';
import { V60_SWITCH_CONFIGURATION_KEY } from '../data/v60SwitchConfiguration';
import { V60_SOURCE_REGISTRY_VERSION } from '../data/v60SourceRegistry';
import { V60_ICED_SOURCE_REGISTRY_VERSION } from '../data/v60IcedSourceRegistry';
import { V60_SWITCH_SOURCE_REGISTRY_VERSION } from '../data/v60SwitchSourceRegistry';
import { generateV60HotWithFallback, generateV60IcedWithFallback, v60DoseForRequest, v60SwitchDoseForRequest } from '../lib/v60Generation';
import { usePreferences } from './useUserProfile';
import { useSubscription } from '../contexts/SubscriptionContext';
import { usePaywall } from './usePaywall.jsx';
import { createKeyedLatestWriteQueue } from '../lib/latestWriteQueue';
import { canUseCachedHotRecipe, kalitaDefaultDose, v60SwitchDefaultDose, resolveIcedRetryConfiguration } from '../lib/handBrewCachePolicy';

export function useHandBrew(updateBean, saveHandBrewTiming) {
  const mountedRef = useRef(true);
  const activeRequestRef = useRef(null);
  const timingSaveInFlightRef = useRef(null);
  const doseDebounceRef = useRef(null);
  const requestedFingerprintRef = useRef(null);
  const recipeWriteQueueRef = useRef(null);
  if (!recipeWriteQueueRef.current) recipeWriteQueueRef.current = createKeyedLatestWriteQueue();
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
  // Iced Switch is out of scope for this slice (plan Scope Boundaries). This
  // flag is distinct from handBrewIcedError: it means "iced is not offered
  // for the current hot variant," not "iced generation failed." Never set
  // together with a populated handBrewIcedRecipe/handBrewIcedError.
  const [handBrewIcedUnsupported, setHandBrewIcedUnsupported] = useState(false);
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

  const queueLatestRecipeWrite = (beanId, payload) => {
    return recipeWriteQueueRef.current.enqueue(beanId, {
      write: () => updateBean(beanId, payload),
    });
  };

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
        && recipe.mode === 'hot'
        && recipe.kalitaSize === (activePreferences?.kalitaSize || '185')
        && recipe.configurationKey === `kalita:${recipe.kalitaSize}:wave-paper:hot`
        && recipe.phaseContractVersion === KALITA_PHASE_CONTRACT_VERSION
        && validateKalitaCandidate(recipe).valid;
    }
    if (device === 'v60') {
      // Legacy compatibility (R8/R9): a cached recipe without variant
      // metadata (recipe.variant undefined) is classic. The configurationKey
      // comparison is what actually enforces "never cross-serve" — the
      // Switch key (v60:03:...:switch:hot) and classic key (v60:02:...)
      // never match each other, so a variant flip always misses cache.
      const requestedVariant = activePreferences?.v60Variant === 'switch' ? 'switch' : 'classic';
      if (requestedVariant === 'switch') {
        return recipe.mode === 'hot'
          && (recipe.variant || 'classic') === 'switch'
          && recipe.engineVersion === V60_SWITCH_ENGINE_VERSION
          && recipe.rulesVersion === V60_SWITCH_RULES_VERSION
          && recipe.configurationKey === V60_SWITCH_CONFIGURATION_KEY
          && recipe.sourceRegistryVersion === V60_SWITCH_SOURCE_REGISTRY_VERSION
          && recipe.phaseContractVersion === V60_SWITCH_PHASE_CONTRACT_VERSION
          && validateV60SwitchCandidate(recipe).valid;
      }
      return recipe.mode === 'hot'
        && (recipe.variant || 'classic') === 'classic'
        && recipe.engineVersion === V60_ENGINE_VERSION
        && recipe.rulesVersion === V60_RULES_VERSION
        && recipe.configurationKey === V60_CONFIGURATION_KEY
        && recipe.sourceRegistryVersion === V60_SOURCE_REGISTRY_VERSION
        && recipe.phaseContractVersion === V60_PHASE_CONTRACT_VERSION
        && validateV60Candidate(recipe).valid;
    }
    return false;
  };

  const icedCandidateMatchesConfiguration = (recipe, device, dose, bean, research, activePreferences = preferences) => {
    if (!recipe?.candidate || recipe.device !== device || recipe.mode !== 'iced' || recipe.coffeeGrams !== dose) return false;
    const grinderKey = activePreferences?.grinder || 'fellow-ode-gen2';
    if (recipe.grinder !== grinderKey) return false;
    if (device === 'kalita') {
      const size = activePreferences?.kalitaSize || '185';
      if (recipe.kalitaSize !== size || recipe.configurationKey !== kalitaIcedConfigurationKey(size)) return false;
      if (recipe.engineVersion !== KALITA_ICED_ENGINE_VERSION || recipe.rulesVersion !== KALITA_ICED_RULES_VERSION) return false;
      if (recipe.sourceRegistryVersion !== KALITA_ICED_SOURCE_REGISTRY_VERSION || recipe.phaseContractVersion !== KALITA_ICED_PHASE_CONTRACT_VERSION) return false;
      if (!validateKalitaIcedCandidate(recipe).valid) return false;
    } else if (device === 'v60') {
      if (recipe.engineVersion !== V60_ICED_ENGINE_VERSION || recipe.rulesVersion !== V60_ICED_RULES_VERSION) return false;
      if (recipe.configurationKey !== V60_ICED_CONFIGURATION_KEY) return false;
      if (recipe.sourceRegistryVersion !== V60_ICED_SOURCE_REGISTRY_VERSION || recipe.phaseContractVersion !== V60_ICED_PHASE_CONTRACT_VERSION) return false;
      if (!validateV60IcedCandidate(recipe).valid) return false;
    } else return false;
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
      ...(generationOverrides.v60Variant ? { v60Variant: generationOverrides.v60Variant } : {}),
    };
    const grinderKey = activePreferences?.grinder || 'fellow-ode-gen2';
    const v60Variant = activePreferences?.v60Variant === 'switch' ? 'switch' : 'classic';
    const isV60Switch = device === 'v60' && v60Variant === 'switch';
    // Kalita is now automatically bean-specific. The legacy GPT path remains
    // an invisible fallback if evidence normalization or candidate generation
    // fails; users do not need to choose between engines.
    const candidateMode = device === 'kalita' || device === 'v60' ? 'candidate' : 'legacy';
    const requestedDose = generationOverrides.doseOverride ?? Number(bean.userCoffeeGrams || bean.handBrewRecipes?.[device]?.userCoffeeGrams);
    const defaultDose = device === 'kalita'
      ? kalitaDefaultDose(activePreferences?.kalitaSize || '185')
      : isV60Switch ? v60SwitchDefaultDose() : 15;
    const candidateDose = device === 'v60'
      ? (isV60Switch ? v60SwitchDoseForRequest(requestedDose, defaultDose) : v60DoseForRequest(requestedDose, defaultDose))
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

    const candidateIced = bean.handBrewIcedRecipes?.[device];
    // Iced Switch is out of scope (plan Scope Boundaries): a Switch hot
    // request never treats a cached iced entry as valid, regardless of its
    // own shape, so it can never be silently served next to a Switch hot
    // recipe.
    const candidateIcedValid = !isV60Switch
      && icedCandidateMatchesConfiguration(candidateIced, device, candidateDose, bean, requestResearch, activePreferences);
    const preservedChillingMethod = ['brew-over-ice', 'chill-after'].includes(generationOverrides.chillingMethod)
      ? generationOverrides.chillingMethod
      : ['brew-over-ice', 'chill-after'].includes(candidateIced?.chillingMethod)
        ? candidateIced.chillingMethod
        : undefined;
    if (canUseCachedHotRecipe({
      forceRegenerate,
      cachedRecipe: cached,
      cachedGrinder: cached?.grinder || 'fellow-ode-gen2',
      activeGrinder: grinderKey,
    })) {
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
        setHandBrewIcedUnsupported(isV60Switch);
        if (candidateIcedValid) {
          setHandBrewIcedRecipe(candidateIced);
          setHandBrewIcedError(null);
          setHandBrewIcedLoading(false);
        } else if (isV60Switch) {
          // Iced Switch is out of scope: never fall through to the classic
          // V60 iced engine for a Switch hot request (would silently serve a
          // classic-derived iced recipe next to a Switch hot recipe).
          setHandBrewIcedRecipe(null);
          setHandBrewIcedError(null);
          setHandBrewIcedLoading(false);
        } else if (device === 'kalita' || device === 'v60') {
          // Hot and iced caches are independent. Keep the valid hot recipe on
          // screen while deterministically repairing a missing/stale iced slot.
          setHandBrewIcedLoading(true);
          const evidence = normalizeRecipeEvidence(bean, requestResearch);
          const intent = buildExtractionIntent(evidence);
          const icedResult = device === 'kalita'
            ? generateKalitaIcedWithFallback({ intent, configuration: {
              size: activePreferences?.kalitaSize,
              dose: candidateDose,
              grinder: grinderKey,
              chillingMethod: preservedChillingMethod,
            } })
            : generateV60IcedWithFallback({ intent, configuration: { dose: candidateDose, grinder: grinderKey } });
          if (icedResult.recipe) {
            const generatedAt = new Date().toISOString();
            const sourceContextHash = buildSourceContextHash({ ...bean, beanResearch: requestResearch });
            const repairedIced = { ...icedResult.recipe, generatedAt, sourceContextHash, grinder: grinderKey };
            setHandBrewIcedRecipe(repairedIced);
            setHandBrewIcedError(null);
            if (bean.id) queueLatestRecipeWrite(bean.id, { [`handBrewIcedRecipes.${device}`]: repairedIced })
              .catch((writeError) => console.warn('[handBrew] iced cache repair persistence failed:', writeError?.message || writeError));
          } else {
            setHandBrewIcedRecipe(null);
            setHandBrewIcedError(`Iced ${device === 'kalita' ? 'Kalita' : 'V60'} regeneration unavailable: ${icedResult.error?.message || icedResult.error}`);
          }
          setHandBrewIcedLoading(false);
        }
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
      setHandBrewIcedUnsupported(false);
      setHandBrewError(null);
      setHandBrewModal(true);
      setHandBrewLoading(false);
      setHandBrewPhase(null);
      return;
    }

    if (!hasPro) {
      activeRequestRef.current = null;
      openPaywall({ feature: 'recipe', promote: 'pro' });
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
    setHandBrewIcedUnsupported(false);
    setHandBrewIcedLoading(device === 'v60' || device === 'kalita');
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
      let sharedIntent = null;
      if (device === 'kalita' || device === 'v60') {
        const evidence = normalizeRecipeEvidence(bean, research);
        sharedIntent = buildExtractionIntent(evidence);
      }
      if (device === 'kalita' && (candidateMode === 'candidate' || candidateMode === 'shadow')) {
        try {
          shadowCandidate = generateKalitaRecipe(sharedIntent, {
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
      if (device === 'kalita' && candidateMode === 'candidate') {
        const icedResult = generateKalitaIcedWithFallback({
          intent: sharedIntent,
          configuration: {
            size: activePreferences?.kalitaSize,
            dose: candidateDose,
            grinder: grinderKey,
            chillingMethod: preservedChillingMethod,
          },
        });
        icedRecipe = icedResult.recipe;
        icedGenerationError = icedResult.recipe ? null : icedResult.error;
      }
      // Iced Switch is out of scope (plan Scope Boundaries): a Switch hot
      // request skips iced generation entirely rather than falling through
      // to the classic V60 02 iced engine, which would silently pair a
      // classic-derived iced recipe with a Switch hot recipe.
      if (device === 'v60' && candidateMode === 'candidate' && !isV60Switch) {
        const icedResult = generateV60IcedWithFallback({ intent: sharedIntent, configuration: { dose: candidateDose, grinder: grinderKey } });
        icedRecipe = icedResult.recipe;
        icedGenerationError = icedResult.recipe ? null : icedResult.error;
      }
      if (device === 'v60' && !recipe) {
        const evidence = normalizeRecipeEvidence(bean, research);
        const hotResult = generateV60HotWithFallback({
          intent: sharedIntent,
          configuration: { dose: candidateDose, grinder: grinderKey, variant: v60Variant },
          evidence,
          variant: v60Variant,
        });
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
      if (device === 'v60' || device === 'kalita') {
        setHandBrewIcedLoading(false);
        setHandBrewIcedError(icedGenerationError ? `Iced ${device === 'kalita' ? 'Kalita' : 'V60'} regeneration unavailable: ${icedGenerationError.message || icedGenerationError}` : null);
        setHandBrewIcedUnsupported(isV60Switch);
      }
      if (icedRecipe) setHandBrewIcedRecipe({ ...icedRecipe, generatedAt: recipeData.generatedAt, sourceContextHash: recipeData.sourceContextHash, grinder: grinderKey });
      setHandBrewError(null);
      if (bean.id) {
        // Shadow candidates remain in memory only. The saved recipe stays on
        // the legacy path until the separately gated cutover is enabled.
        const persistedRecipe = { ...recipeData };
        delete persistedRecipe.shadowCandidate;
        queueLatestRecipeWrite(bean.id, {
          handBrewRecipe: persistedRecipe,
          [`handBrewRecipes.${device}`]: persistedRecipe,
          ...(icedRecipe ? { [`handBrewIcedRecipes.${device}`]: { ...icedRecipe, generatedAt: recipeData.generatedAt, sourceContextHash: recipeData.sourceContextHash, grinder: grinderKey } } : {}),
        }).catch((writeError) => console.warn('[handBrew] recipe persistence failed:', writeError?.message || writeError));
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
    if (!handBrewBean) return;
    const retryConfig = resolveIcedRetryConfiguration({ recipe: handBrewRecipe, bean: handBrewBean, preferences });
    const { device, size, dose: candidateDose, grinder: grinderKey } = retryConfig;
    if (!['v60', 'kalita'].includes(device)) return;
    // Iced Switch is out of scope (plan Scope Boundaries): a retry against a
    // Switch hot recipe must never fall through to the classic V60 iced
    // engine. `retryConfig.variant` is the informational field U3 threaded
    // in for exactly this check.
    if (device === 'v60' && retryConfig.variant === 'switch') {
      setHandBrewIcedRecipe(null);
      setHandBrewIcedError(null);
      setHandBrewIcedUnsupported(true);
      return;
    }
    const rid = Symbol('handbrew-iced');
    activeRequestRef.current = rid;
    setHandBrewIcedLoading(true);
    setHandBrewIcedError(null);
    try {
      const research = handBrewResearch || handBrewBean.beanResearch || null;
      const evidence = normalizeRecipeEvidence(handBrewBean, research);
      const intent = buildExtractionIntent(evidence);
      const result = device === 'kalita'
        ? generateKalitaIcedWithFallback({ intent, configuration: {
          size,
          dose: candidateDose,
          grinder: grinderKey,
          chillingMethod: handBrewIcedRecipe?.chillingMethod,
        } })
        : generateV60IcedWithFallback({ intent, configuration: { dose: candidateDose, grinder: grinderKey } });
      if (!result.recipe) throw new Error(result.error?.message || 'deterministic candidate and fallback failed');
      if (!isActive(rid)) return;
      const hydrated = { ...result.recipe, generatedAt: new Date().toISOString(), sourceContextHash: buildSourceContextHash({ ...handBrewBean, beanResearch: research }), grinder: grinderKey };
      setHandBrewIcedRecipe(hydrated);
      setHandBrewIcedError(null);
      if (handBrewBean.id) queueLatestRecipeWrite(handBrewBean.id, { [`handBrewIcedRecipes.${device}`]: hydrated })
        .catch((writeError) => console.warn('[handBrew] iced recipe persistence failed:', writeError?.message || writeError));
    } catch (err) {
      if (isActive(rid)) setHandBrewIcedError(`Iced ${device === 'kalita' ? 'Kalita' : 'V60'} regeneration unavailable: ${err.message || err}`);
    } finally {
      if (isActive(rid)) setHandBrewIcedLoading(false);
    }
  };

  const handleKalitaIcedChillingMethodChange = async (chillingMethod) => {
    if (!['brew-over-ice', 'chill-after'].includes(chillingMethod)
      || handBrewRecipe?.device !== 'kalita'
      || !handBrewBean
      || handBrewIcedRecipe?.chillingMethod === chillingMethod) return;

    const size = handBrewIcedRecipe?.kalitaSize || preferences?.kalitaSize || '185';
    const candidateDose = handBrewIcedRecipe?.coffeeGrams
      || handBrewRecipe?.userCoffeeGrams
      || handBrewRecipe?.coffeeGrams
      || kalitaDefaultDose(size);
    const grinderKey = preferences?.grinder || 'fellow-ode-gen2';
    const rid = Symbol('handbrew-iced-chilling-method');
    activeRequestRef.current = rid;
    setHandBrewIcedLoading(true);
    setHandBrewIcedError(null);
    try {
      const research = handBrewResearch || handBrewBean.beanResearch || null;
      const evidence = normalizeRecipeEvidence(handBrewBean, research);
      const intent = buildExtractionIntent(evidence);
      const result = generateKalitaIcedWithFallback({
        intent,
        configuration: { size, dose: candidateDose, grinder: grinderKey, chillingMethod },
      });
      if (!result.recipe) throw new Error(result.error?.message || 'deterministic candidate and fallback failed');
      if (!isActive(rid)) return;
      const hydrated = {
        ...result.recipe,
        generatedAt: new Date().toISOString(),
        sourceContextHash: buildSourceContextHash({ ...handBrewBean, beanResearch: research }),
        grinder: grinderKey,
      };
      setHandBrewIcedRecipe(hydrated);
      if (handBrewBean.id) {
        try {
          await queueLatestRecipeWrite(handBrewBean.id, { 'handBrewIcedRecipes.kalita': hydrated });
        } catch (writeError) {
          if (isActive(rid)) {
            setHandBrewIcedRecipe(handBrewIcedRecipe);
            setHandBrewIcedError('Could not save the chilling method. Your previous recipe is still selected.');
          }
          console.warn('[handBrew] iced chilling method persistence failed:', writeError?.message || writeError);
        }
      }
    } catch (err) {
      if (isActive(rid)) setHandBrewIcedError(`Could not change the chilling method: ${err.message || err}`);
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

  const handleV60VariantChange = async (variant) => {
    const nextVariant = ['classic', 'switch'].includes(variant) ? variant : 'classic';
    if (handBrewRecipe?.device !== 'v60' || !handBrewBean) return;

    try {
      await updatePreferences({ v60Variant: nextVariant });
    } catch (err) {
      console.warn('[handBrew] V60 variant preference failed:', err?.message || err);
      setHandBrewError('Could not save the V60 variant. Try again.');
      return;
    }

    setUserCoffeeGrams(undefined);
    await handleBrewHandBrew(
      handBrewBean,
      handBrewResearch,
      true,
      'v60',
      { v60Variant: nextVariant, doseOverride: nextVariant === 'switch' ? v60SwitchDefaultDose() : 15 },
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

  const attachHandBrewBeanId = useCallback((beanId) => {
    if (!beanId) return;
    setHandBrewBean((current) => current ? { ...current, id: beanId } : current);
  }, []);

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
    const chillingMethod = handBrewIcedRecipe?.chillingMethod;
    setUserCoffeeGrams(newDose);
    if (['v60', 'kalita'].includes(handBrewRecipe?.device) && handBrewBean) {
      setHandBrewIcedRecipe(null);
      setHandBrewIcedError(null);
      setHandBrewIcedLoading(true);
      if (doseDebounceRef.current) clearTimeout(doseDebounceRef.current);
      doseDebounceRef.current = setTimeout(() => {
        doseDebounceRef.current = null;
        if (!mountedRef.current || requestedFingerprintRef.current !== fingerprint) return;
        handleBrewHandBrew(handBrewBean, handBrewResearch, true, handBrewRecipe.device, { doseOverride: newDose, chillingMethod });
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
    handBrewModal, handBrewRecipe, handBrewIcedRecipe, handBrewIcedLoading, handBrewIcedError, handBrewIcedUnsupported, handBrewLoading, handBrewError,
    handBrewPhase, handBrewBean, handBrewResearch,
    handleBrewHandBrew, closeHandBrewModal,
    handleKalitaSizeChange,
    handleV60VariantChange,
    handleKalitaIcedChillingMethodChange,
    attachHandBrewBeanId,
    userCoffeeGrams,
    setUserCoffeeGrams,
    handleCoffeeGramsChange,
    persistDose,
    saveTimingEvent,
    onRetryIced: regenerateIced,
    onRetry: handBrewBean ? () => handleBrewHandBrew(handBrewBean, handBrewResearch, false, handBrewRecipe?.device, {
      chillingMethod: handBrewRecipe?.device === 'kalita' ? handBrewIcedRecipe?.chillingMethod : undefined,
    }) : undefined,
    onRegenerate: handBrewBean ? () => handleBrewHandBrew(handBrewBean, handBrewResearch, true, handBrewRecipe?.device, {
      chillingMethod: handBrewRecipe?.device === 'kalita' ? handBrewIcedRecipe?.chillingMethod : undefined,
    }) : undefined,
  };
}
