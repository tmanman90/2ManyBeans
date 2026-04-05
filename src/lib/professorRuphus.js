// Professor Ruphus — story generation (GPT-5.4) + tasting score conversion (GPT-5.4 Mini)
import { callOpenAI } from './openai';
import { RUPHUS_KNOWLEDGE, getOriginContext } from './coffeeKnowledge';

/**
 * Generate a Professor Ruphus educational story for a bean.
 * @param {object} bean - Bean data (roaster, name, origin, variety, process, etc.)
 * @param {object} opts - { useWebSearch: boolean } — ignored now (GPT-5.4 uses training knowledge)
 * @returns {object} story object { intro, roaster, coffee, process, lookFor, flavorProfile, generatedAt }
 */
export async function generateRuphusStory(bean, { useWebSearch = false } = {}) {
  const beanContext = [
    bean.roaster && `Roaster: ${bean.roaster}`,
    bean.name && `Name: ${bean.name}`,
    bean.origin && `Origin: ${bean.origin}`,
    bean.variety && `Variety: ${bean.variety}`,
    bean.process && `Process: ${bean.process}`,
    bean.region && `Region: ${bean.region}`,
    bean.farm && `Farm: ${bean.farm}`,
    bean.altitude && `Altitude: ${bean.altitude}`,
    bean.roastLevel && `Roast Level: ${bean.roastLevel}`,
    bean.bagNotes && `Tasting Notes on Bag: ${bean.bagNotes}`,
    bean.sourcedBy && `Sourced By: ${bean.sourcedBy}`,
    bean.cupScore && `Cup Score: ${bean.cupScore}`,
    bean.producer && `Producer: ${bean.producer}`,
  ].filter(Boolean).join('\n');

  const originContext = getOriginContext(bean.origin);
  const originSection = originContext ? `\nORIGIN CONTEXT FOR ${(bean.origin || '').toUpperCase()}:\n${originContext}\n` : '';

  const systemPrompt = `You are Professor Ruphus, a friendly golden retriever who is a coffee professor.
You write short, warm educational lessons about specific coffees for a novice enthusiast.

${RUPHUS_KNOWLEDGE}
${originSection}

HALLUCINATION PREVENTION — THIS IS CRITICAL:
1. ROASTER section: ONLY include facts you are confident about from widely known public knowledge. If you are not confident, set to null. NEVER fabricate roaster histories or founding stories.
2. COFFEE/FARM section: Only use facts from the bean data provided. General knowledge about the region/country is fine. Don't invent farm details.
3. PROCESS section: General coffee knowledge is fine and encouraged. Explaining what "Anaerobic White Honey" means is always safe — this is educational.
4. LOOK FOR section: Connecting variety + process + origin to expected flavors is safe general knowledge.
5. FLAVOR PROFILE: Base on general expectations for this variety + process + origin combination. These are educational estimates.
6. When data is thin, set sections to null rather than guess. In the intro, acknowledge naturally, e.g.: "I couldn't dig up much on this roaster, but let me tell you what makes this coffee interesting..."

TONE: Warm, enthusiastic, slightly nerdy professor who really loves coffee. First person ("I", "let me tell you"). Brief — the whole lesson should be a 60-90 second read (~200-300 words total across all sections).`;

  const data = await callOpenAI({
    model: 'gpt-5.4-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Write a Professor Ruphus lesson about this coffee:

${beanContext}

Respond with ONLY a valid JSON object (no markdown, no backticks, no explanation):

{
  "intro": "One-liner speech bubble greeting (15 words max). Be enthusiastic about this specific coffee.",
  "roaster": "2-3 sentences about the roaster. ONLY if you have reliable info. null otherwise.",
  "coffee": "2-3 sentences about the farm, region, and altitude context. null if no meaningful context.",
  "process": "2-3 sentences explaining what this processing method means and how it affects the cup. null if process is unknown.",
  "lookFor": "2-3 sentences connecting this variety + process + origin to expected flavor characteristics.",
  "flavorProfile": {
    "fragranceAroma": 7,
    "acidity": 7,
    "sweetness": 7,
    "body": 7,
    "flavor": 7,
    "balance": 7
  }
}

Replace the 7s with your actual 1-10 estimates. Use null for any section you can't fill reliably.`,
      },
    ],
    maxTokens: 1200,
  });

  const text = data.text || '';
  const clean = text.replace(/```json|```/g, '').trim();
  const jsonMatch = clean.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in story response');
  }

  const story = JSON.parse(jsonMatch[0]);
  story.generatedAt = new Date().toISOString();
  return story;
}

/**
 * Convert tasting text descriptions to numeric scores for spider chart overlay.
 * Non-blocking — caller should fire-and-forget with error handling.
 * Uses GPT-5.4 Mini with structured output for guaranteed valid JSON.
 */
export async function convertTastingScores(tasting, bean) {
  const notes = [
    tasting.aroma && `Aroma: ${tasting.aroma}`,
    tasting.acidity && `Acidity: ${tasting.acidity}`,
    tasting.sweetness && `Sweetness: ${tasting.sweetness}`,
    tasting.body && `Body: ${tasting.body}`,
    tasting.firstSip && `Flavor/First Sip: ${tasting.firstSip}`,
    tasting.finish && `Finish: ${tasting.finish}`,
    tasting.oneWord && `One-word summary: ${tasting.oneWord}`,
    tasting.rating && `Overall rating: ${tasting.rating}/5`,
  ].filter(Boolean).join('\n');

  if (!notes) {
    throw new Error('No tasting notes to convert');
  }

  const data = await callOpenAI({
    model: 'gpt-5.4-mini',
    messages: [
      {
        role: 'system',
        content: 'Convert coffee tasting notes into numeric scores (1-10) for a flavor profile chart. Base scores on the descriptive text. If a field is empty or vague, estimate based on other fields and the bean characteristics. Return ONLY valid JSON.',
      },
      {
        role: 'user',
        content: `Bean: ${bean.name || 'Unknown'} (${[bean.origin, bean.variety, bean.process].filter(Boolean).join(', ')})

Tasting notes:
${notes}

Return ONLY JSON:
{"fragranceAroma": N, "acidity": N, "sweetness": N, "body": N, "flavor": N, "balance": N}`,
      },
    ],
    maxTokens: 200,
    responseFormat: { type: 'json_object' },
  });

  const text = data.text || '';
  const clean = text.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}
