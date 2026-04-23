// Bean research helpers — shared by Aiden and Hand Brew
// Extracted from aiden.js because researchBean() is grinder/brewer agnostic.

import { getPeakStatus, daysSinceRoast } from './peakStatus';
import { getProfileForRoaster } from './roasterProfiles';
import { API_BASE } from './apiBase';
import { fetchWithRetry } from './fetchWithRetry';

const PROXY_URL = `${API_BASE}/api/openai`;

const REFERENCE_PROFILE_INDEX = `
1. Kiss the Hippo Peru El Morito — Peru, Light, Washed, Bourbon/Caturra
2. Passenger Colombia Divino Niño — Colombia, Light, Washed, Field Blend
3. Coffee Collective Kenya Kieni AB — Kenya, Light, Washed Double Ferm, SL28/SL34
4. Counter Culture Cueva de los Llanos — Colombia, Light, Washed, Caturra/Castillo
5. Sq Mile Ethiopia Telila Kecho — Ethiopia, Light, Washed, JARC 74110/74112
6. Sey Burundi Heza — Burundi, Light, Washed, Various
7. Wonderstate Ethiopia Danche — Ethiopia, Light, Washed, Landrace
8. Flower Child El Nevado Decaf — Colombia, Light, Washed EA Decaf, Caturra/Castillo/Pink Bourbon
9. Heart Colombia Diomed Montano — Colombia, Light, Washed
10. Wendelboe Kenya Kapsokiso — Kenya, Light, Washed, K7/SL28/SL34
11. La Cabra Kiamugumo — Kenya, Light, Washed, SL28/SL34
12. April Ethiopia Regessa — Ethiopia, Light, Natural, Krume 74158
13. Brandywine Rwanda Cyesha Natural — Rwanda, Light, Natural, Bourbon
14. Camber Ethiopia Tadesse Yonka — Ethiopia, Light, Natural, Heirloom
15. Camber Ethiopia Buliye — Ethiopia, Light, Natural, Heirloom
16. Sq Mile Ethiopia Shoondhisa — Ethiopia, Light, Natural, JARC varieties
17. Equator Decaf Rwanda Nyamyumba — Rwanda, Light, Natural SWP, Bourbon
18. Brandywine Felloween IV — Ethiopia, Light, Natural, 74158/Heirloom
19. Santa Felisa by Bean & Bean — Guatemala, Light, Natural, Yellow Catuai
20. Proud Mary Ethiopia Yirg Adado — Ethiopia, Medium, Natural, Heirloom
21. Equator Thailand Mae Chedi — Thailand, Light, Anaerobic Natural, Chiang Mai
22. Special Guests Andres Cardona Purple Honey — Colombia, Light, Natural Honey Co-Ferment, Castillo
23. Sightglass Guatemala Cuevitas — Guatemala, Medium, Anaerobic Washed, San Ramon/Pacas
24. Black & White Fruit Cake — Costa Rica, Medium, Cinnamon Anaerobic, Caturra/Catuai
25. Onyx Honey Advent — Various, Various, Honey, Various
26. Verve Miel de Flores — Honduras, Light, Honey, Pacas/Catuai/Catimor
27. Loquat Costa Rica Finca Inés Geisha — Costa Rica, Light, Semi-Washed, Geisha
28. Loquat Costa Rica San Roque — Costa Rica, Light-Med, Semi-Washed, San Roque
29. Asprotimana Colombia Huila — Colombia, Medium, Washed, Castillo/Caturra
30. Linea Guatemala La Esperanza — Guatemala, Med-Light, Washed, Bourbon
31. Olympia Amparo Pajoy — Colombia, Medium, Washed, Caturra
32. Counter Culture Intango Dark — Rwanda, Dark, Washed, Bourbon/Mayaguez/Jackson
33. Methodical Oscuro Dark — Brazil, Dark, Natural, Mundo Novo/Catuai
34. KOS Armando Leivas Dark — Guatemala, Med-Dark, Washed, Caturra
`.trim();

const RESEARCH_SYSTEM_PROMPT = `You are a specialty coffee expert with deep knowledge of origins, roasters, processing methods, and extraction science. Given a coffee's details, research and analyze the bean using your knowledge.

Respond with ONLY a valid JSON object (no markdown, no backticks, no explanation):

{
  "altitude": "estimated masl range (e.g. '1800-2100 masl')",
  "roastLevel": "ultra-light | light | light-medium | medium | medium-dark | dark",
  "roasterStyle": "brief description of this roaster's typical approach and philosophy",
  "processingNuance": "expanded processing details relevant to extraction",
  "densityEstimate": "high | medium | low (based on altitude, variety, and roast)",
  "flavorExpectations": "what flavors to optimize for in brewing",
  "extractionNotes": "practical brewing implications (water temp, grind, timing considerations)",
  "cupStructureFamily": "one of: washed-floral-clarity | washed-kenya-clarity | washed-ethiopia-clarity | clean-natural-fruit | processed-clarity | medium-washed | dark-roast",
  "closestReferenceProfiles": [
    { "number": 1, "name": "profile name", "why": "brief reason this is a close match" }
  ]
}

IMPORTANT: cupStructureFamily is based on the coffee's CUP STRUCTURE, not just its country of origin.
- "washed-floral-clarity" = washed Gesha, washed floral Pink Bourbon, washed floral heirloom, washed floral Colombia. Notes: jasmine, bergamot, white florals, lavender, honeysuckle, nectarine, peach, white grape, tea-like citrus lift.
- "washed-kenya-clarity" = washed Kenya SL28/SL34/Batian/Ruiru with pomelo, hibiscus, cane sugar, berry. Often slightly finer than washed floral Ethiopia.
- "washed-ethiopia-clarity" = classic washed Ethiopia with bergamot, white florals, citrus, tea, white grape, nectarine. Very similar to washed floral clarity. Can produce tea-tannin dryness if pushed too fine or too hot late.
- "clean-natural-fruit" = natural Ethiopia with strawberry, mango, lychee, tropical fruit, clean sweetness. Slightly coarser than washed florals to protect from jammy heaviness.
- "processed-clarity" = honey, anaerobic, co-ferment, white honey, experimental, floral tea-like processed Gesha. Slightly coarser than washed florals to protect from syrupy heaviness and drying finish.
- "medium-washed" = medium roast washed coffees prioritizing body over clarity
- "dark-roast" = any dark or medium-dark roast
- A washed Colombia Gesha with floral/tea-like character = "washed-floral-clarity" (NOT a separate Colombia family)
- A washed floral Colombia or Guatemala with jasmine/bergamot = "washed-floral-clarity"
- When in doubt between clarity and body families, choose the clarity family (finer grind is safer than coarser)

For closestReferenceProfiles, select the 2-3 most similar profiles from the reference database below. Match on cup structure, process, roast level, and varietal similarity (not just origin).

## Reference Profile Database

${REFERENCE_PROFILE_INDEX}

RESPOND WITH ONLY THE JSON OBJECT. No other text.`;

// Sanitize user-controlled bean fields before prompt injection
function sanitize(str, maxLen = 100) {
  return (str || '').slice(0, maxLen).replace(/[^\w\s\-'.,()\/]/g, '');
}

export function buildBeanDescription(bean) {
  const ps = getPeakStatus(bean);
  const dsr = daysSinceRoast(bean.roastDate, bean);
  const profile = getProfileForRoaster(bean.roaster, bean);

  return {
    text: [
      `Roaster: ${sanitize(bean.roaster)}`,
      `Name: ${sanitize(bean.name)}`,
      `Origin: ${sanitize(bean.origin)}`,
      bean.variety ? `Variety: ${sanitize(bean.variety)}` : null,
      `Process: ${sanitize(bean.process)}`,
      bean.roastDate ? `Roast date: ${bean.roastDate} (${dsr}d ago)` : null,
      `Peak status: ${ps.label}`,
      `Roaster category: ${profile.category}`,
      bean.bagNotes ? `Bag tasting notes: ${sanitize(bean.bagNotes, 200)}` : null,
      bean.producer ? `Producer: ${sanitize(bean.producer)}` : null,
      bean.altitude ? `Altitude: ${sanitize(bean.altitude)}` : null,
      bean.roastLevel ? `Roast level: ${sanitize(bean.roastLevel)}` : null,
      bean.farm ? `Farm: ${sanitize(bean.farm)}` : null,
      bean.brewingRec ? `Roaster brewing recommendation: ${sanitize(bean.brewingRec, 200)}` : null,
    ].filter(Boolean).join('\n'),
    profile,
  };
}

export async function researchBean(bean) {
  const { text: beanDescription } = buildBeanDescription(bean);

  const data = await fetchWithRetry({
    url: PROXY_URL,
    body: {
      model: 'gpt-5.4-mini',
      messages: [
        { role: 'system', content: RESEARCH_SYSTEM_PROMPT },
        { role: 'user', content: `Research this coffee bean:\n\n${beanDescription}` },
      ],
      maxTokens: 600,
      feature: 'beanResearch',
    },
    retries: 2,
    serviceName: 'OpenAI',
  });
  const text = data.text || '';
  const clean = text.replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(clean);
  } catch {
    throw new Error('Bean research returned invalid data. Please try again.');
  }
}
