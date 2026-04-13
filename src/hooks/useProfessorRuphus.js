// Shared hook for Professor Ruphus Learn flow — used across Rotation, Inventory, Archive tabs
import { useState, useCallback } from 'react';
import { generateRuphusStory } from '../lib/professorRuphus';
import { researchBeanOnline, summarizeNotes } from '../lib/gemini';
import { ENRICHABLE_FIELDS, isBagNotesEmpty, beanNeedsRuphusEnrichment } from '../lib/beanFields';

// Silent background enrichment fired alongside the Ruphus story.
// Reuses the same Gemini search-grounding path as Add Bean / AI Fill, with
// metered:false because this is a background convenience, not a user-initiated
// research action. Re-reads bean state at write time so concurrent user edits
// are never clobbered. Fails silently per the spec.
async function runSilentEnrichment(bean, getBeanById, updateBean) {
  if (!updateBean || !getBeanById) return;
  if (!beanNeedsRuphusEnrichment(bean)) return;

  try {
    const research = await researchBeanOnline(bean, { metered: false });

    // Re-read latest bean state — user may have edited fields while the slide-up
    // was open, or a concurrent refetch may have filled some fields.
    const current = getBeanById(bean.id);
    if (!current) return; // bean was deleted mid-flight

    const updates = {};
    for (const field of ENRICHABLE_FIELDS) {
      if (!current[field] && research[field]) {
        updates[field] = research[field];
      }
    }

    // bagNotes is special: researchBeanOnline returns redditNotes (community
    // reviews), not a comma-separated descriptor phrase. Pipe through
    // summarizeNotes to produce the "blueberry, chocolate, stone fruit" shape
    // the NOTES card field expects.
    if (isBagNotesEmpty(current) && research.redditNotes) {
      const summary = await summarizeNotes(research.redditNotes);
      if (summary) updates.bagNotes = summary;
    }

    // Only write if we actually have new data. Always stamp enrichedAt on
    // success so subsequent Ruphus presses on this bean skip the call.
    if (Object.keys(updates).length > 0) {
      updates.enrichedAt = new Date().toISOString();
      await updateBean(bean.id, updates);
    } else {
      // Research succeeded but returned nothing usable. Still cache so we
      // don't keep calling Gemini for a bean with no public information.
      await updateBean(bean.id, { enrichedAt: new Date().toISOString() });
    }
  } catch (err) {
    // R7: swallow silently. Do NOT write enrichedAt on error so the next
    // Ruphus press retries.
    console.log('Silent Ruphus enrichment skipped:', err.message);
  }
}

export const useProfessorRuphus = (updateBean, tastings = [], getBeanById = null) => {
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

    // Fire silent enrichment in parallel with the story. No await — the story
    // UI does not wait on enrichment, and enrichment errors don't affect it.
    runSilentEnrichment(bean, getBeanById, updateBean);

    if (bean.story) {
      // Cached — show immediately
      setRuphusStory(bean.story);
      setRuphusLoading(false);
    } else {
      // On-demand — generate with web search (no prior research)
      setRuphusStory(null);
      generateStory(bean, true);
    }
  }, [generateStory, getBeanById, updateBean]);

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
