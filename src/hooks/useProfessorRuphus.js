// Shared hook for Professor Ruphus Learn flow — used across Rotation, Inventory, Archive tabs
import { useState, useCallback } from 'react';
import { generateRuphusStory } from '../lib/professorRuphus';
import { researchBeanOnline, summarizeNotes } from '../lib/gemini';
import { ENRICHABLE_FIELDS, isBagNotesEmpty } from '../lib/beanFields';

// Module-level set of bean IDs currently being enriched. Prevents a
// double-tap on the Ruphus button from firing two concurrent Gemini calls
// before the enrichedAt cache lands in Firestore.
const inflightEnrichmentIds = new Set();

const ENRICHMENT_TIMEOUT = 15000;
const ROASTER_CONTEXT_FIELDS = ['roasterLocation', 'roasterDescription', 'roasterFounded', 'redditNotes'];

function hasStoredRoasterContext(bean) {
  return bean.enrichedAt && ROASTER_CONTEXT_FIELDS.some(f => bean[f]);
}

async function runEnrichment(bean, getBeanById, updateBean, { forceResearch = false } = {}) {
  if (!updateBean || !getBeanById) return null;
  if (inflightEnrichmentIds.has(bean.id)) return null;

  if (!forceResearch && hasStoredRoasterContext(bean)) {
    return {
      roasterLocation: bean.roasterLocation,
      roasterDescription: bean.roasterDescription,
      roasterFounded: bean.roasterFounded,
      redditNotes: bean.redditNotes,
    };
  }

  inflightEnrichmentIds.add(bean.id);
  try {
    const enrichPromise = (async () => {
      const research = await researchBeanOnline(bean, { metered: true });

      const current = await getBeanById(bean.id);
      if (current) {
        const updates = {};
        for (const field of ENRICHABLE_FIELDS) {
          if (!current[field] && research[field]) {
            updates[field] = research[field];
          }
        }

        if (isBagNotesEmpty(current) && research.redditNotes) {
          const summary = await summarizeNotes(research.redditNotes);
          if (summary) updates.bagNotes = summary;
        }

        updates.enrichedAt = new Date().toISOString();
        await updateBean(bean.id, updates);
      }

      return research;
    })();

    const timeout = new Promise(r => setTimeout(() => r(null), ENRICHMENT_TIMEOUT));
    return await Promise.race([enrichPromise, timeout]);
  } catch (err) {
    console.log('Ruphus enrichment skipped:', err.message);
    return null;
  } finally {
    inflightEnrichmentIds.delete(bean.id);
  }
}

export const useProfessorRuphus = (updateBean, tastings = [], getBeanById = null) => {
  const [ruphusOpen, setRuphusOpen] = useState(false);
  const [ruphusBean, setRuphusBean] = useState(null);
  const [ruphusStory, setRuphusStory] = useState(null);
  const [ruphusLoading, setRuphusLoading] = useState(false);
  const [ruphusResearching, setRuphusResearching] = useState(false);
  const [ruphusError, setRuphusError] = useState(null);

  const enrichAndGenerate = useCallback(async (bean, { forceResearch = false } = {}) => {
    setRuphusLoading(true);
    setRuphusError(null);
    const willResearch = forceResearch || !hasStoredRoasterContext(bean);
    setRuphusResearching(willResearch);
    try {
      const enrichment = await runEnrichment(bean, getBeanById, updateBean, { forceResearch });
      setRuphusResearching(false);

      // Re-read the bean to pick up any fields enrichment wrote
      let enrichedBean = bean;
      if (enrichment && getBeanById) {
        enrichedBean = await getBeanById(bean.id) || bean;
      }

      // Step 2: generate story with enrichment context
      const story = await generateRuphusStory(enrichedBean, {
        useWebSearch: true,
        enrichment,
      });
      setRuphusStory(story);
      if (updateBean && bean.id) {
        await updateBean(bean.id, { story });
      }
    } catch (err) {
      console.error('Professor Ruphus story generation failed:', err);
      setRuphusError(err.message || "Couldn't generate the lesson");
    }
    setRuphusResearching(false);
    setRuphusLoading(false);
  }, [updateBean, getBeanById]);

  const handleLearn = useCallback((bean) => {
    setRuphusBean(bean);
    setRuphusOpen(true);
    setRuphusError(null);

    if (bean.story && bean.enrichedAt) {
      setRuphusStory(bean.story);
      setRuphusLoading(false);
    } else {
      setRuphusStory(null);
      enrichAndGenerate(bean);
    }
  }, [enrichAndGenerate]);

  const handleRefresh = useCallback(() => {
    if (!ruphusBean) return;
    setRuphusStory(null);
    enrichAndGenerate(ruphusBean, { forceResearch: true });
  }, [ruphusBean, enrichAndGenerate]);

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
      researching: ruphusResearching,
      error: ruphusError,
      onRetry: () => ruphusBean && enrichAndGenerate(ruphusBean),
      onRefresh: handleRefresh,
      tastingScores,
    },
  };
};
