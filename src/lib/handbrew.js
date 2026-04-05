// Hand brew recipe generation — Hoffmann-informed pour-over recipes via GPT-5.4
// Mirrors the Aiden two-step pattern: researchBean() -> generateHandBrewRecipe()

import { API_BASE } from './apiBase';
import { fetchWithRetry } from './fetchWithRetry';
import { buildBeanDescription } from './beanResearch';
import { HANDBREW_KNOWLEDGE, getOriginContext } from './coffeeKnowledge';

const PROXY_URL = `${API_BASE}/api/openai`;

// Grinder display names for prompt injection
const GRINDER_LABELS = {
  'fellow-ode-gen2': 'Fellow Ode Gen 2 (31 positions, 1-11 with .1/.2 sub-steps)',
  'fellow-opus': 'Fellow Opus (41+ settings, 1-6 with 10 clicks per number)',
  'baratza-encore-esp': 'Baratza Encore ESP (40 steps, 1-40)',
  'comandante-c40': 'Comandante C40 MK4 (~40 clicks, 0-40)',
  '1zpresso-jx-pro': '1Zpresso JX-Pro (~200 clicks, 0-200)',
  'baratza-virtuoso-plus': 'Baratza Virtuoso+ (40 steps, 1-40)',
};

// Sanitize user-controlled bean fields before prompt injection
function sanitize(str, maxLen = 100) {
  return (str || '').slice(0, maxLen).replace(/[^\w\s\-'.,()\/]/g, '');
}

function buildHandBrewPrompt(preferences) {
  const grinderKey = preferences?.grinder || 'fellow-ode-gen2';
  const grinderName = GRINDER_LABELS[grinderKey] || preferences?.grinderCustomName || 'Unknown grinder';

  return `You are a specialty coffee brew guide trained on James Hoffmann's methods.

USER'S EQUIPMENT:
- Grinder: ${grinderName}
- Brew method: Pour-over (V60 / Chemex / Kalita / generic cone)

${HANDBREW_KNOWLEDGE}

GRIND SIZE RULES:
- Recommend grind size in the user's grinder's native notation (e.g., "4.0" for Ode Gen 2, "24" for Comandante)
- Light roasts: finer end of range (higher extraction needed)
- Dark roasts: coarser end of range (give up flavor easily)
- Natural/honey process: slightly coarser (higher solubility)
- Washed: standard range
- Also include approximate micron value for the recommended setting

OUTPUT FORMAT (JSON only, no markdown, no backticks, no explanation):
{
  "method": "pour-over",
  "coffeeGrams": number,
  "waterGrams": number,
  "ratio": "1:16.7",
  "grindSize": { "setting": "4.0", "description": "Medium-fine", "microns": 450 },
  "waterTemp": { "celsius": 97, "fahrenheit": 207 },
  "steps": [
    { "time": "0:00", "action": "Bloom: pour 60g water, swirl gently", "waterTotal": 60 },
    { "time": "0:30", "action": "First pour: slow spiral to 200g", "waterTotal": 200 },
    { "time": "1:15", "action": "Second pour: spiral to 350g", "waterTotal": 350 },
    { "time": "2:00", "action": "Final pour: to 500g, gentle swirl", "waterTotal": 500 },
    { "time": "3:00-3:30", "action": "Drawdown complete. Flat bed = good extraction.", "waterTotal": 500 }
  ],
  "totalBrewTime": "3:00-3:30",
  "tips": "Light roast from Ethiopia, expect floral/citrus. If tea-like, grind 1 step finer.",
  "title": "Ethiopian Yirgacheffe Pour-Over"
}

RESPOND WITH ONLY THE JSON OBJECT.`;
}

export async function generateHandBrewRecipe(bean, research, preferences) {
  const { text: beanDescription } = buildBeanDescription(bean);
  const originProfile = getOriginContext(bean.origin);

  let userContent = `Generate a hand brew pour-over recipe for this bean:\n\n${sanitize(beanDescription, 500)}`;

  if (originProfile) {
    userContent += `\n\nOrigin profile: ${originProfile}`;
  }

  if (research) {
    const researchContext = [
      research.roastLevel ? `Roast level: ${sanitize(research.roastLevel)}` : null,
      research.processingNuance ? `Processing: ${sanitize(research.processingNuance)}` : null,
      research.densityEstimate ? `Density: ${sanitize(research.densityEstimate)}` : null,
      research.flavorExpectations ? `Flavors: ${sanitize(research.flavorExpectations)}` : null,
      research.extractionNotes ? `Extraction notes: ${sanitize(research.extractionNotes)}` : null,
      research.cupStructureFamily ? `Cup structure: ${sanitize(research.cupStructureFamily)}` : null,
    ].filter(Boolean).join('\n');

    userContent += `\n\n## Research Context\n\n${researchContext}`;
  }

  const systemPrompt = buildHandBrewPrompt(preferences);

  const data = await fetchWithRetry({
    url: PROXY_URL,
    body: {
      model: 'gpt-5.4',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      maxTokens: 1000,
    },
    retries: 2,
    serviceName: 'OpenAI',
  });

  const text = data.text || '';
  const clean = text.replace(/```json|```/g, '').trim();
  const parsed = JSON.parse(clean);
  return validateRecipe(parsed);
}

// Lightweight validation: JSON parsed + required fields exist
function validateRecipe(recipe) {
  if (!recipe.coffeeGrams || !recipe.waterGrams || !recipe.steps) {
    throw new Error('Recipe missing required fields (coffeeGrams, waterGrams, steps)');
  }
  if (!Array.isArray(recipe.steps) || recipe.steps.length === 0) {
    throw new Error('Recipe must include at least one brew step');
  }
  return recipe;
}
