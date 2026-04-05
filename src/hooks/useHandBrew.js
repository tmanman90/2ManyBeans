// Hand brew hook — mirrors useAidenBrew pattern with mounted-ref guard
import { useState, useRef, useEffect } from 'react';
import { researchBean } from '../lib/beanResearch';
import { generateHandBrewRecipe } from '../lib/handbrew';
import { usePreferences } from './useUserProfile';

export function useHandBrew(updateBean) {
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const { preferences } = usePreferences();
  const [handBrewModal, setHandBrewModal] = useState(false);
  const [handBrewRecipe, setHandBrewRecipe] = useState(null);
  const [handBrewLoading, setHandBrewLoading] = useState(false);
  const [handBrewError, setHandBrewError] = useState(null);
  const [handBrewBean, setHandBrewBean] = useState(null);
  const [handBrewResearch, setHandBrewResearch] = useState(null);
  const [handBrewPhase, setHandBrewPhase] = useState(null);

  const handleBrewHandBrew = async (bean, cachedResearch = null) => {
    setHandBrewBean(bean);
    setHandBrewRecipe(null);
    setHandBrewError(null);
    setHandBrewLoading(true);
    setHandBrewModal(true);

    // Step 1: Research (skip if cached on bean doc or passed in)
    let research = cachedResearch || bean.beanResearch || null;
    if (!research) {
      setHandBrewPhase('research');
      try {
        research = await researchBean(bean);
        if (!mountedRef.current) return;
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
    if (!mountedRef.current) return;

    // Step 2: Generate recipe
    setHandBrewPhase('recipe');
    try {
      const recipe = await generateHandBrewRecipe(bean, research, preferences);
      if (!mountedRef.current) return;
      setHandBrewRecipe(recipe);
      setHandBrewError(null);
      // Persist recipe to bean doc
      if (bean.id) {
        await updateBean(bean.id, {
          handBrewRecipe: { ...recipe, generatedAt: new Date().toISOString() },
        });
      }
    } catch (err) {
      if (!mountedRef.current) return;
      setHandBrewError(err.message || "Couldn't generate a recipe");
    }
    if (mountedRef.current) {
      setHandBrewLoading(false);
      setHandBrewPhase(null);
    }
  };

  const closeHandBrewModal = () => setHandBrewModal(false);

  return {
    handBrewModal, handBrewRecipe, handBrewLoading, handBrewError,
    handBrewPhase, handBrewBean, handBrewResearch,
    handleBrewHandBrew, closeHandBrewModal,
    onRetry: handBrewBean ? () => handleBrewHandBrew(handBrewBean, handBrewResearch) : undefined,
    onRegenerate: handBrewBean ? () => handleBrewHandBrew(handBrewBean, handBrewResearch) : undefined,
  };
}
