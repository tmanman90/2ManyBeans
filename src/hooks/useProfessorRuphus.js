// Shared hook for Professor Ruphus Learn flow — used across Rotation, Inventory, Archive tabs
import { useState, useCallback } from 'react';
import { generateRuphusStory } from '../lib/professorRuphus';

export const useProfessorRuphus = (updateBean, tastings = []) => {
  const [ruphusOpen, setRuphusOpen] = useState(false);
  const [ruphusBean, setRuphusBean] = useState(null);
  const [ruphusStory, setRuphusStory] = useState(null);
  const [ruphusLoading, setRuphusLoading] = useState(false);
  const [ruphusError, setRuphusError] = useState(null);

  const generateStory = useCallback(async (bean, useWebSearch) => {
    setRuphusLoading(true);
    setRuphusError(null);
    try {
      const story = await generateRuphusStory(bean, { useWebSearch });
      setRuphusStory(story);
      // Persist to Firestore (skip for ephemeral beans without an id)
      if (updateBean && bean.id) {
        await updateBean(bean.id, { story });
      }
    } catch (err) {
      console.error('Professor Ruphus story generation failed:', err);
      setRuphusError(err.message || "Couldn't generate the lesson");
    }
    setRuphusLoading(false);
  }, [updateBean]);

  const handleLearn = useCallback((bean) => {
    setRuphusBean(bean);
    setRuphusOpen(true);
    setRuphusError(null);

    if (bean.story) {
      // Cached — show immediately
      setRuphusStory(bean.story);
      setRuphusLoading(false);
    } else {
      // On-demand — generate with web search (no prior research)
      setRuphusStory(null);
      generateStory(bean, true);
    }
  }, [generateStory]);

  const handleRefresh = useCallback(() => {
    if (!ruphusBean) return;
    setRuphusStory(null);
    generateStory(ruphusBean, true);
  }, [ruphusBean, generateStory]);

  const closeRuphus = useCallback(() => {
    setRuphusOpen(false);
  }, []);

  // Find tasting scores for the current bean (best rated tasting with scores)
  const tastingScores = ruphusBean
    ? (() => {
        const beanTastings = tastings
          .filter(t => t.beanId === ruphusBean.id && t.tastingScores)
          .sort((a, b) => (b.rating || 0) - (a.rating || 0));
        return beanTastings[0]?.tastingScores || null;
      })()
    : null;

  return {
    handleLearn,
    closeRuphus,
    ruphusProps: {
      open: ruphusOpen,
      onClose: closeRuphus,
      bean: ruphusBean,
      story: ruphusStory,
      loading: ruphusLoading,
      error: ruphusError,
      onRetry: () => ruphusBean && generateStory(ruphusBean, true),
      onRefresh: handleRefresh,
      tastingScores,
    },
  };
};
