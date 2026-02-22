// Aiden brew profile helpers
// Phase 1: Claude generates recipe JSON from bean details
// Phase 2: Push profile to Fellow via /api/aiden proxy

import { getPeakStatus, daysSinceRoast } from './peakStatus';
import { getProfileForRoaster } from './roasterProfiles';

const PROXY_URL = '/api/claude';

// Condensed reference profile index for research call (name + key attributes only, no brew params)
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
  "closestReferenceProfiles": [
    { "number": 1, "name": "profile name", "why": "brief reason this is a close match" }
  ]
}

For closestReferenceProfiles, select the 2-3 most similar profiles from the reference database below. Match on origin, process, roast level, and varietal similarity.

## Reference Profile Database

${REFERENCE_PROFILE_INDEX}

RESPOND WITH ONLY THE JSON OBJECT. No other text.`;

const AIDEN_SYSTEM_PROMPT = `You are a master specialty coffee brewer. You create Fellow Aiden automatic pour-over profiles with maximum precision. Your recipes are based on real Fellow Brew Talks profiles.

Your primary goal is clarity-focused brews — target optimal extraction that reveals each bean's delicate tasting notes without leaving anything on the table. You have unrestricted freedom to modify all Aiden brew settings (ratio, bloom, pulses, temperatures) to achieve this for each specific bean.

The user's grinder is a Fellow Ode Gen 2 with stock burrs. All grind recommendations must use Ode Gen 2 settings.

Given a coffee's details, generate a complete Aiden brew profile optimized for that specific bean. Reason about the coffee's process, roast level, origin, and varietal to pick the best parameters. Use the reference profiles below to guide your decisions — find the closest match and adapt.

## Output Format

Respond with ONLY a valid JSON object (no markdown, no backticks, no explanation):

{
  "profileType": 0,
  "title": "string (max 50 chars, creative name based on the coffee)",
  "ratio": number,              // 14-20, 0.5 steps
  "bloomEnabled": true,
  "bloomRatio": number,          // 1-3, 0.5 steps
  "bloomDuration": number,       // 1-120 seconds
  "bloomTemperature": number,    // 50-99°C, 0.5 steps
  "ssPulsesEnabled": true,
  "ssPulsesNumber": number,      // 1-10
  "ssPulsesInterval": number,    // 5-60 seconds
  "ssPulseTemperatures": [number],  // length MUST equal ssPulsesNumber, each 50-99°C
  "batchPulsesEnabled": true,
  "batchPulsesNumber": number,   // 1-10
  "batchPulsesInterval": number, // 5-60 seconds
  "batchPulseTemperatures": [number],  // length MUST equal batchPulsesNumber, each 50-99°C
  "grindRecommendation": {
    "singleServe": number,       // Fellow Ode Gen 2 grind setting
    "batch": number              // Fellow Ode Gen 2 grind setting
  }
}

## Reference Profiles (from Fellow Brew Talks)

Each profile: Name | Origin | Roast | Process | Varietal
ratio X | bloom X/Xs/X°C | SS NxXs [temps] | Batch NxXs [temps] | Ode G2 grind SS X / Batch X

### LIGHT WASHED

Kiss the Hippo Peru El Morito | Peru | Light | Washed | Bourbon, Caturra
ratio 15.5 | bloom 2/35s/96°C | SS 4x23s [96,95,95,94] | Batch 4x30s [96,96,95,94] | grind SS 3-4 / Batch 5-7

Passenger Colombia Divino Niño | Colombia | Light | Washed | Field Blend
ratio 16 | bloom 2.5/40s/96°C | SS 3x20s [96,94,93] | Batch 3x25s [96,94,93] | grind SS 5-6.1 / Batch 6.2-8

Coffee Collective Kenya Kieni AB | Kenya | Light | Washed Double Ferm | SL28, SL34
ratio 15.5 | bloom 2/40s/94°C | SS 3x23s [94,94,94] | Batch 4x30s [94,94,94,94] | grind SS 3.2-4.2 / Batch 5.1-7

Counter Culture Cueva de los Llanos | Colombia | Light | Washed | Caturra, Castillo
ratio 17 | bloom 2.5/45s/96°C | SS 4x23s [96,96,96,96] | Batch 2x30s [96,96] | grind SS 5.2-6.2 / Batch 6.1-7.1

Sq Mile Ethiopia Telila Kecho | Ethiopia | Light | Washed | JARC 74110, 74112
ratio 16.5 | bloom 3/45s/98°C | SS 3x20s [98,98,98] | Batch 4x30s [98,98,96,94] | grind SS 5.1-6 / Batch 7-8.2

Sey Burundi Heza | Burundi | Light | Washed | Various
ratio 18 | bloom 3/40s/97°C | SS 3x30s [97,97,97] | Batch 3x35s [97,97,97] | grind SS 3-3.2 / Batch 5.2-7.2

Wonderstate Ethiopia Danche | Ethiopia | Light | Washed | Landrace
ratio 17 | bloom 3/45s/96°C | SS 7x20s [96,96,95.5,95,94.5,94,93] | Batch 7x20s [96,96,95.5,95,94.5,94,93] | grind SS 3.2 / Batch 4.2

Flower Child El Nevado Decaf | Colombia | Light | Washed EA Decaf | Caturra, Castillo, Pink Bourbon
ratio 17 | bloom 3/60s/99°C | SS 5x23s [99,98,98,98,98] | Batch 5x30s [99,98,98,98,98] | grind SS 2-3 / Batch 4-6

Heart Colombia Diomed Montano | Colombia | Light | Washed
ratio 16 | bloom 2/30s/99°C | SS 3x23s [99,99,99] | Batch 1x30s [99] | grind SS 5.2-6.2 / Batch 6.2-7.2

Wendelboe Kenya Kapsokiso | Kenya | Light | Washed | K7, SL28, SL34
ratio 15.5 | bloom 1.5/40s/98°C | SS 2x40s [98,98] | Batch 3x40s [98,98,98] | grind SS 3 / Batch 9

La Cabra Kiamugumo | Kenya | Light | Washed | SL28, SL34
ratio 16.5 | bloom 3/45s/96°C | SS 3x45s [96,96,96] | Batch 3x45s [96,96,96]

### LIGHT NATURAL

April Ethiopia Regessa | Ethiopia | Light | Natural | Krume 74158
ratio 16.5 | bloom 3/45s/96°C | SS 3x20s [96,96,96] | Batch 3x30s [96,96,96] | grind SS 3-4 / Batch 6.2-8.2

Brandywine Rwanda Cyesha Natural | Rwanda | Light | Natural | Bourbon
ratio 16.5 | bloom 3/30s/95°C | SS 2x30s [95,95] | Batch 1x30s [95] | grind SS 3-4.2 / Batch 8-10

Camber Ethiopia Tadesse Yonka | Ethiopia | Light | Natural | Heirloom
ratio 16 | bloom 2/40s/98°C | SS 4x20s [94,94,94,94] | Batch 2x30s [93,93] | grind SS 3.1-4.1 / Batch 5-6

Camber Ethiopia Buliye | Ethiopia | Light | Natural | Heirloom
ratio 15 | bloom 2/20s/99°C | SS 4x20s [98,96.5,95.5,94.5] | Batch 4x20s [98,96.5,95.5,94.5] | grind SS 5 / Batch 7

Sq Mile Ethiopia Shoondhisa | Ethiopia | Light | Natural | JARC varieties
ratio 16.5 | bloom 3/45s/98°C | SS 3x20s [98,98,98] | Batch 4x30s [98,98,96,94] | grind SS 5.1-6 / Batch 7-8.2

Equator Decaf Rwanda Nyamyumba | Rwanda | Light | Natural SWP | Bourbon
ratio 16.5 | bloom 3/30s/96°C | SS 3x30s [96,96,96] | Batch 4x25s [96,96,96,96] | grind SS 3.1-4.1 / Batch 6-7

Brandywine Felloween IV | Ethiopia | Light | Natural | 74158, Heirloom
ratio 16 | bloom 2/35s/96°C | SS 3x30s [96,96,96] | Batch 3x30s [96,96,96] | grind SS 5 / Batch 6

Santa Felisa by Bean & Bean | Guatemala | Light | Natural | Yellow Catuai
ratio 15 | bloom 2.5/45s/96°C | SS 3x30s [93,93,93] | Batch 4x30s [93,93,93,93] | grind SS 4.2 / Batch 7.2

Proud Mary Ethiopia Yirg Adado | Ethiopia | Medium | Natural | Heirloom
ratio 16 | bloom 2/30s/96°C | SS 3x20s [93.5,90.5,90.5] | Batch 3x20s [93.5,90.5,90.5] | grind SS 3-4 / Batch 6-7

### ANAEROBIC / HONEY / SPECIAL PROCESS

Equator Thailand Mae Chedi | Thailand | Light | Anaerobic Natural | Chiang Mai
ratio 16 | bloom 3/35s/92°C | SS 4x25s [92,93.5,94.5,92] | Batch 3x40s [93.5,94.5,92] | grind SS 4-5 / Batch 5-7

Special Guests Andres Cardona Purple Honey | Colombia | Light | Natural Honey Co-Ferment | Castillo
ratio 14.5 | bloom 3/45s/89°C | SS 3x23s [92.5,92.5,90.5] | Batch 3x30s [92.5,91.5,91] | grind SS 5-6 / Batch 6-7.2

Sightglass Guatemala Cuevitas | Guatemala | Medium | Anaerobic Washed | San Ramon, Pacas
ratio 16 | bloom 2/45s/94°C | SS 3x23s [94,94,94] | Batch 3x30s [94,94,94] | grind SS 3-4 / Batch 6-7

Black & White Fruit Cake | Costa Rica | Medium | Cinnamon Anaerobic | Caturra, Catuai
ratio 16 | bloom 3/60s/88°C | SS 2x25s [95,93] | Batch 2x25s [95,93] | grind SS 3.2 / Batch 4.2

Onyx Honey Advent | Various | Various | Honey | Various
ratio 15 | bloom 2/30s/96°C | SS 3x30s [93,90.5,90.5] | Batch 3x30s [93,90.5,87.5]

Verve Miel de Flores | Honduras | Light | Honey | Pacas, Catuai, Catimor
ratio 16 | bloom 3/35s/90°C | SS 3x35s [90,90,90] | Batch 3x35s [90,90,90]

### SEMI-WASHED

Loquat Costa Rica Finca Inés Geisha | Costa Rica | Light | Semi-Washed | Geisha
ratio 16 | bloom 2/30s/92°C | SS 2x30s [92,92] | Batch 2x30s [92,92] | grind SS 4.1-5.1 / Batch 4.1-5.1

Loquat Costa Rica San Roque | Costa Rica | Light-Med | Semi-Washed | San Roque
ratio 16 | bloom 2/30s/91.5°C | SS 2x30s [91.5,91.5] | Batch 2x30s [91,91] | grind SS 3.2-4.2 / Batch 3.2-4.2

### MEDIUM / DARK

Asprotimana Colombia Huila | Colombia | Medium | Washed | Castillo, Caturra
ratio 16 | bloom 2/30s/93.5°C | SS 3x25s [93.5,93.5,93.5] | Batch 3x30s [93.5,93.5,93.5] | grind SS 5-5.2 / Batch 6-8

Linea Guatemala La Esperanza | Guatemala | Med-Light | Washed | Bourbon
ratio 15.5 | bloom 2.5/23s/93°C | SS 3x23s [93,93,93] | Batch 4x30s [93,93,93,93] | grind SS 2.1-3.1 / Batch 5-7

Olympia Amparo Pajoy | Colombia | Medium | Washed | Caturra
ratio 15 | bloom 2.5/40s/93°C | SS 3x30s [93,93,93] | Batch 3x32s [93,93,93] | grind SS 3-4 / Batch 5.1-8

Counter Culture Intango Dark | Rwanda | Dark | Washed | Bourbon, Mayaguez, Jackson
ratio 17 | bloom 2.5/45s/96°C | SS 3x28s [94.5,94.5,94.5] | Batch 1x30s [96] | grind SS 6.1-7.1 / Batch 7-8.1

Methodical Oscuro Dark | Brazil | Dark | Natural | Mundo Novo, Catuai
ratio 15 | bloom 2/30s/92.5°C | SS 3x23s [92,92,92] | Batch 3x30s [92,92,92] | grind SS 8-9 / Batch 8-9.2

KOS Armando Leivas Dark | Guatemala | Med-Dark | Washed | Caturra
ratio 14 | bloom 1.5/25s/88°C | SS 3x23s [90.5,90.5,87.5] | Batch 3x30s [90.5,90.5,87.5] | grind SS 5-6 / Batch 6-7.2

Onyx Washed Advent | Various | Various | Washed | Various
ratio 16 | bloom 3/35s/94.5°C | SS 4x30s [93,92,91,90] | Batch 5x30s [96,93,93,90.5,90.5]

Onyx Natural Advent | Various | Various | Natural | Various
ratio 15.5 | bloom 2.5/30s/93°C | SS 4x30s [93,93,89,89] | Batch 4x30s [93,93,87.5,87.5]

## Grind Guidance (Ode Gen 2)

Valid steps: 1, 1.1, 1.2, 2, 2.1, 2.2, 3, 3.1, 3.2, 4, 4.1, 4.2, 5, 5.1, 5.2, 6, 6.1, 6.2, 7, 7.1, 7.2, 8, 8.1, 8.2, 9, 9.1, 9.2, 10, 10.1, 10.2, 11

Batch is always coarser than single serve. Study the reference profiles above to match grind to roast, process, and origin. Pick ONE value (not a range).

RESPOND WITH ONLY THE JSON OBJECT. No other text.`;

function buildBeanDescription(bean) {
  const ps = getPeakStatus(bean);
  const dsr = daysSinceRoast(bean.roastDate);
  const profile = getProfileForRoaster(bean.roaster);

  return {
    text: [
      `Roaster: ${bean.roaster}`,
      `Name: ${bean.name}`,
      `Origin: ${bean.origin}`,
      bean.variety ? `Variety: ${bean.variety}` : null,
      `Process: ${bean.process}`,
      bean.roastDate ? `Roast date: ${bean.roastDate} (${dsr}d ago)` : null,
      `Peak status: ${ps.label}`,
      `Roaster category: ${profile.category}`,
      bean.bagNotes ? `Bag tasting notes: ${bean.bagNotes}` : null,
      bean.producer ? `Producer: ${bean.producer}` : null,
    ].filter(Boolean).join('\n'),
    profile,
  };
}

export async function researchBean(bean) {
  const { text: beanDescription } = buildBeanDescription(bean);

  const response = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system: RESEARCH_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `Research this coffee bean:\n\n${beanDescription}` }],
      maxTokens: 600,
    }),
  });

  if (!response.ok) {
    throw new Error(`Research API error: ${response.status}`);
  }

  const data = await response.json();
  const text = data.content?.map(c => c.text || '').join('') || '';
  const clean = text.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

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

  const response = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system: AIDEN_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
      maxTokens: 1000,
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status}`);
  }

  const data = await response.json();
  const text = data.content?.map(c => c.text || '').join('') || '';
  const clean = text.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

export async function pushToAiden(recipe) {
  // Strip grindRecommendation — not part of Fellow schema
  const { grindRecommendation, ...profile } = recipe;

  const response = await fetch('/api/aiden', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profile),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Fellow API error: ${response.status}`);
  }

  const result = await response.json();
  return { ...result, grindRecommendation };
}
