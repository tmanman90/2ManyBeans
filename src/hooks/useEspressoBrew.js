import { useCallback, useEffect, useRef, useState } from 'react';
import { usePreferences } from './useUserProfile';
import { executeRecipeCommand } from '../lib/recipeCommands';
import { editEspressoRecipe, espressoSetupKey, resolveEspressoRecipe } from '../lib/espressoRecipes';
import { clone, recipeSourceHash } from '../lib/ruphus/contracts';

// Espresso deliberately has its own request/cache path. It never enters the
// hand-brew generator, and an equipment change cannot reuse the prior setup's
// numeric targets.
export function useEspressoBrew() {
  const { preferences } = usePreferences();
  const mountedRef = useRef(true);
  const requestRef = useRef(null);
  const operationRef = useRef(null);
  // A mutation request is frozen for transport retries only. A later Save of
  // the same values is a new operation and receives a new UUID/action key.
  const mutationRef = useRef(null);
  const [espressoModal, setEspressoModal] = useState(false);
  const [espressoRecipe, setEspressoRecipe] = useState(null);
  const [espressoBean, setEspressoBean] = useState(null);
  const [espressoLoading, setEspressoLoading] = useState(false);
  const [espressoError, setEspressoError] = useState(null);
  const [espressoPhase, setEspressoPhase] = useState(null);
  const [espressoNotice, setEspressoNotice] = useState(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestRef.current = null;
      operationRef.current = null;
      mutationRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!espressoBean || !espressoRecipe) return;
    if (espressoRecipe.setupKey !== espressoSetupKey(preferences)) {
      requestRef.current = null;
      operationRef.current = null;
      mutationRef.current = null;
      setEspressoRecipe(null);
      setEspressoError('Your espresso setup changed. Confirm it before using numeric targets.');
      setEspressoPhase('setup');
    }
  }, [espressoBean, espressoRecipe, preferences]);

  const active = (requestId) => mountedRef.current && requestRef.current === requestId;

  const handleBrewEspresso = useCallback(async (bean, forceRegenerate = false) => {
    const requestId = Symbol('espresso-recipe');
    requestRef.current = requestId;
    operationRef.current = requestId;
    mutationRef.current = null;
    setEspressoBean(bean || null);
    setEspressoModal(true);
    setEspressoError(null);
    setEspressoNotice(null);
    setEspressoPhase('checking');
    setEspressoLoading(true);
    const resolved = resolveEspressoRecipe({ bean, setup: preferences, forceRegenerate });
    if (!active(requestId)) return null;
    if (!resolved.ok) {
      setEspressoRecipe(null);
      setEspressoError(resolved.message || 'Confirm your espresso setup before using numeric targets.');
      setEspressoPhase('setup');
      setEspressoLoading(false);
      return resolved;
    }
    setEspressoRecipe(resolved.recipe);
    setEspressoPhase(resolved.cached ? 'saved' : 'recipe');
    setEspressoLoading(false);
    return resolved;
  }, [preferences]);

  const saveEspressoRecipe = useCallback(async (patch = {}) => {
    if (!espressoBean?.id || !espressoRecipe) return { ok: false, code: 'bean_required' };
    const edited = editEspressoRecipe(espressoRecipe, patch);
    if (!edited.ok) {
      setEspressoError(edited.errors?.join(' ') || 'Check the espresso targets.');
      return edited;
    }
    const recipe = edited.recipe;
    const operationId = Symbol('espresso-save');
    operationRef.current = operationId;
    requestRef.current = operationId;
    const request = Object.freeze({
      actionId: crypto.randomUUID(),
      mode: 'replace_active_recipe',
      coffeeId: espressoBean.id,
      slotKey: 'espresso',
      recipe: clone(recipe),
      patch: { espressoRecipe: clone(recipe) },
      expectedRevisionId: espressoBean.activeRevisionIds?.espresso || undefined,
      expectedRevisionHash: espressoBean.activeRevisionIds?.espresso ? undefined : recipeSourceHash(null, 'espresso'),
    });
    mutationRef.current = { kind: 'save', request };
    setEspressoLoading(true);
    setEspressoError(null);
    try {
      const result = await executeRecipeCommand(request);
      if (mountedRef.current && operationRef.current === operationId) {
        setEspressoRecipe(result.bean?.espressoRecipe || recipe);
        setEspressoBean(result.bean || null);
        setEspressoNotice(result.receipt || null);
        setEspressoPhase('saved');
        setEspressoLoading(false);
        mutationRef.current = null;
      }
      return result;
    } catch (error) {
      if (mountedRef.current && operationRef.current === operationId) {
        setEspressoError(error.message || 'Could not save this espresso recipe.');
        setEspressoLoading(false);
      }
      throw error;
    }
  }, [espressoBean, espressoRecipe]);

  const undoEspressoRecipe = useCallback(async () => {
    const revisionId = espressoBean?.activeRevisionIds?.espresso;
    if (!espressoBean?.id || !revisionId) return { ok: false, code: 'nothing_to_undo' };
    const operationId = Symbol('espresso-undo');
    operationRef.current = operationId;
    requestRef.current = operationId;
    const request = Object.freeze({
      actionId: crypto.randomUUID(),
      mode: 'undo_revision',
      clientIntent: 'espresso_direct_undo',
      coffeeId: espressoBean.id,
      slotKey: 'espresso',
      expectedRevisionId: revisionId,
    });
    mutationRef.current = { kind: 'undo', request };
    setEspressoLoading(true);
    try {
      const result = await executeRecipeCommand(request);
      const canonicalBean = result.bean || null;
      const restored = canonicalBean?.espressoRecipe || null;
      const displayed = restored
        ? { ok: true, recipe: restored, source: 'user_saved' }
        : canonicalBean
          ? resolveEspressoRecipe({ bean: canonicalBean, setup: preferences })
          : { ok: false };
      if (mountedRef.current && operationRef.current === operationId) {
        // Use the canonical returned bean so an absence Undo cannot be masked
        // by merging the deleted espressoRecipe back into local state.
        setEspressoBean(canonicalBean);
        setEspressoRecipe(displayed.ok ? displayed.recipe : null);
        setEspressoNotice(result.receipt || null);
        setEspressoPhase(displayed.ok && displayed.source === 'user_saved' ? 'saved' : 'recipe');
        setEspressoLoading(false);
        mutationRef.current = null;
      }
      return result;
    } catch (error) {
      if (mountedRef.current && operationRef.current === operationId) {
        setEspressoError(error.message || 'Could not undo this espresso recipe.');
        setEspressoLoading(false);
      }
      throw error;
    }
  }, [espressoBean, preferences]);

  const retryEspressoMutation = useCallback(async () => {
    const pending = mutationRef.current;
    if (!pending) return espressoBean ? handleBrewEspresso(espressoBean, false) : null;
    const operationId = Symbol(`espresso-${pending.kind}-retry`);
    operationRef.current = operationId;
    requestRef.current = operationId;
    setEspressoLoading(true);
    setEspressoError(null);
    try {
      const result = await executeRecipeCommand(pending.request);
      if (mountedRef.current && operationRef.current === operationId) {
        if (pending.kind === 'save') {
          const recipe = result.bean?.espressoRecipe || pending.request.recipe;
          setEspressoRecipe(recipe);
          setEspressoBean(result.bean || null);
          setEspressoPhase('saved');
        } else {
          const canonicalBean = result.bean || null;
          const restored = canonicalBean?.espressoRecipe || null;
          const displayed = restored
            ? { ok: true, recipe: restored, source: 'user_saved' }
            : canonicalBean
              ? resolveEspressoRecipe({ bean: canonicalBean, setup: preferences })
              : { ok: false };
          setEspressoBean(canonicalBean);
          setEspressoRecipe(displayed.ok ? displayed.recipe : null);
          setEspressoPhase(displayed.ok && displayed.source === 'user_saved' ? 'saved' : 'recipe');
        }
        setEspressoNotice(result.receipt || null);
        setEspressoLoading(false);
        mutationRef.current = null;
      }
      return result;
    } catch (error) {
      if (mountedRef.current && operationRef.current === operationId) {
        setEspressoError(error.message || `Could not retry this espresso ${pending.kind}.`);
        setEspressoLoading(false);
      }
      throw error;
    }
  }, [espressoBean, handleBrewEspresso, preferences]);

  const closeEspressoModal = useCallback(() => {
    requestRef.current = null;
    operationRef.current = null;
    mutationRef.current = null;
    setEspressoModal(false);
    setEspressoLoading(false);
  }, []);

  const editDose = useCallback((doseGrams) => {
    if (!espressoRecipe) return;
    const edited = editEspressoRecipe(espressoRecipe, { doseGrams });
    if (!edited.ok) {
      setEspressoError(edited.errors?.join(' ') || 'Dose must be between 16g and 19g.');
      return;
    }
    setEspressoRecipe(edited.recipe);
  }, [espressoRecipe]);

  const editYield = useCallback((yieldGrams) => {
    if (!espressoRecipe) return;
    const edited = editEspressoRecipe(espressoRecipe, { yieldGrams });
    if (!edited.ok) {
      setEspressoError(edited.errors?.join(' ') || 'Output mass must be positive.');
      return;
    }
    setEspressoRecipe(edited.recipe);
  }, [espressoRecipe]);

  return {
    espressoModal,
    espressoRecipe,
    espressoBean,
    espressoLoading,
    espressoError,
    espressoPhase,
    espressoNotice,
    handleBrewEspresso,
    closeEspressoModal,
    saveEspressoRecipe,
    undoEspressoRecipe,
    editEspressoDose: editDose,
    editEspressoYield: editYield,
    onRetry: espressoBean ? retryEspressoMutation : undefined,
    onRegenerate: espressoBean ? () => handleBrewEspresso(espressoBean, true) : undefined,
  };
}
