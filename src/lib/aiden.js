// Aiden brew profile helpers
// Phase 1: GPT-5.4 generates recipe JSON from bean details
// Phase 2: Push profile to Fellow via /api/aiden proxy

import { ruphusApiUrl } from './apiBase';
import { fetchWithRetry } from './fetchWithRetry';
import { buildBeanDescription } from './beanResearch';
import { assertValidAidenProfile, toAidenProfile } from './aidenProfileValidation';
import { AIDEN_SYSTEM_PROMPT, repairGeneratedAidenProfile } from './aidenCore.js';
export { buildAidenTitle } from './aidenProfileValidation';

const PROXY_URL = ruphusApiUrl('/api/openai');

// buildBeanDescription and researchBean moved to beanResearch.js

export async function generateAidenRecipe(bean, research = null) {
  const { text: beanDescription } = buildBeanDescription(bean);

  let userContent = `Generate an Aiden brew profile for this bean:\n\n${beanDescription}`;

  if (research) {
    const researchContext = [
      research.altitude ? `Altitude: ${research.altitude}` : null,
      research.roastLevel ? `Roast level: ${research.roastLevel}` : null,
      research.roasterStyle ? `Roaster style: ${research.roasterStyle}` : null,
      research.processingNuance ? `Processing nuance: ${research.processingNuance}` : null,
      research.densityEstimate ? `Density estimate: ${research.densityEstimate}` : null,
      research.flavorExpectations ? `Flavor expectations: ${research.flavorExpectations}` : null,
      research.extractionNotes ? `Extraction notes: ${research.extractionNotes}` : null,
    ].filter(Boolean).join('\n');

    const profileMatches = research.closestReferenceProfiles
      ?.map(p => `- #${p.number} ${p.name}: ${p.why}`)
      .join('\n') || '';

    userContent += `\n\n## Research Context\n\n${researchContext}`;
    if (profileMatches) {
      userContent += `\n\nClosest reference profiles (use as starting point, then adapt):\n${profileMatches}`;
    }
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    const data = await fetchWithRetry({
      url: PROXY_URL,
      body: {
        model: 'gpt-5.4-mini',
        messages: [
          { role: 'system', content: AIDEN_SYSTEM_PROMPT },
          { role: 'user', content: userContent },
        ],
        maxTokens: 2000,
        responseFormat: { type: 'json_object' },
        feature: 'aidenRecipe',
      },
      retries: 2,
      serviceName: 'OpenAI',
    });

    try {
      const parsed = JSON.parse(data.text || '');
      return repairGeneratedAidenProfile(bean, parsed, research);
    } catch {
      if (attempt === 0) continue;
      throw new Error('Recipe generation returned invalid data. Please try again.');
    }
  }
}

export async function pushToAiden(recipe, bean = null, { isIced = false } = {}) {
  const profile = toAidenProfile(recipe, bean, { isIced });
  assertValidAidenProfile(profile);

  const result = await fetchWithRetry({
    url: ruphusApiUrl('/api/aiden'),
    body: profile,
    retries: 1,
    serviceName: 'Fellow',
  });
  return { ...result, grindRecommendation: recipe?.grindRecommendation || null };
}

export async function prepareAidenAttempt(attemptId, { recovery = null } = {}) {
  if (!attemptId) throw new Error('Aiden attempt ID is required.');
  // The server owns retry/reconciliation for attempt preparation. Retrying
  // this request client-side could duplicate a provider create after response
  // loss; relaunching the same attempt is the recovery action.
  const result = await fetchWithRetry({ url: ruphusApiUrl('/api/aiden'), body: { attemptId, ...(recovery ? { recovery, actionId: `new_profile_${attemptId}` } : {}) }, retries: 0, serviceName: 'Fellow' });
  return result;
}
