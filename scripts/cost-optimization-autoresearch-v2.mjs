#!/usr/bin/env node
// Cost Optimization Autoresearch v2 — Knowledge-grounded scoring
// Tests model quality on actual coffee knowledge (not just formatting)
// Also tests prompt tuning variations for Haiku tasting coach
// Usage: node scripts/cost-optimization-autoresearch-v2.mjs

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '.env.local');
const envContent = readFileSync(envPath, 'utf8');
const env = {};
for (const line of envContent.split('\n')) {
  const match = line.match(/^([A-Z_]+)=(.*)$/);
  if (match) env[match[1]] = match[2].replace(/^"|"$/g, '');
}

const ANTHROPIC_KEY = env.ANTHROPIC_API_KEY;
const OPENAI_KEY = env.OPENAI_API_KEY;

if (!ANTHROPIC_KEY) { console.error('Missing ANTHROPIC_API_KEY in .env.local'); process.exit(1); }
if (!OPENAI_KEY) { console.error('Missing OPENAI_API_KEY in .env.local'); process.exit(1); }

// ═══════════════════════════════════════════════
// API CALLERS
// ═══════════════════════════════════════════════

async function callAnthropic(model, system, messages, maxTokens = 1000) {
  const start = Date.now();
  const body = { model, max_tokens: maxTokens, messages };
  if (system) body.system = system;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
  const elapsed = Date.now() - start;
  const data = await res.json();
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  const text = data.content?.map(c => c.text || '').join('') || '';
  const usage = data.usage || {};
  return { text, elapsed, inputTokens: usage.input_tokens, outputTokens: usage.output_tokens };
}

async function callOpenAI(model, system, userMsg, maxTokens = 1000) {
  const start = Date.now();
  const messages = [{ role: 'system', content: system }, { role: 'user', content: userMsg }];
  const params = { model, messages, max_completion_tokens: maxTokens };
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify(params),
  });
  const elapsed = Date.now() - start;
  const data = await res.json();
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  const text = data.choices?.[0]?.message?.content || '';
  const usage = data.usage || {};
  return { text, elapsed, inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens };
}

// ═══════════════════════════════════════════════
// KNOWLEDGE BASES (from src/lib/coffeeKnowledge.js)
// ═══════════════════════════════════════════════

const TASTING_KNOWLEDGE = `
COFFEE TASTING REFERENCE (from James Hoffmann):

HOW TASTING WORKS:
- Mouth detects basic tastes: acidity, sweetness, bitterness, saltiness
- Olfactory bulb (nasal cavity) detects flavors/aromas: chocolate, berries, caramel, florals
- Key technique: focus on one attribute at a time, don't try to process everything at once
- Most important skill-building method: COMPARATIVE TASTING (two coffees side by side makes differences obvious)
- Flavors are easier to discern in warm coffee, not hot

TASTING ATTRIBUTES:
- Sweetness: Highly desirable. More = better. Does not come from residual sugars (destroyed in roasting) but from aromatic compounds created by caramelization and Maillard reactions.
- Acidity: Pleasant acidity = crisp, juicy, refreshing (like a great apple). Unpleasant = sour. Higher-altitude coffees are more acidic AND more flavorful. Hardest concept for novices.
- Mouthfeel/Body: Physical weight and texture. Light/tea-like to rich/creamy/heavy. Metal-filtered methods (French press) = heavier body. Paper-filtered = cleaner/lighter.
- Balance: Are all tastes harmonious? No single element dominates.
- Finish/Aftertaste: How long flavors linger. Clean, pleasant, lingering = good. Flat, woody, cardboard = stale/low quality.

FLAVOR DESCRIPTOR CATEGORIES:
- Fruity: berry (blueberry, strawberry, raspberry), stone fruit (peach, apricot), citrus (lemon, orange, grapefruit), tropical (mango, passionfruit), dried fruit (raisin, date)
- Nutty: almond, hazelnut, walnut, peanut
- Chocolatey: dark chocolate, milk chocolate, cocoa, cacao nib
- Caramel/Sweet: caramel, brown sugar, honey, maple, molasses, toffee
- Floral: jasmine, rose, lavender, bergamot, chamomile
- Spice: cinnamon, clove, black pepper, cardamom
- Roast-derived: toast, grain, cereal, smoky, ashy (increase with darker roasts)

FLAVOR TENDENCIES BY ORIGIN:
- Latin American: clean, balanced, nutty/chocolatey, moderate acidity
- East African (Ethiopia, Kenya): bright acidity, fruity, floral, complex
- Indonesian: heavy body, earthy, lower acidity

BY PROCESS:
- Washed: cleaner, brighter acidity, more complexity
- Natural: heavier body, fruitier/fermented notes (blueberry, strawberry, tropical), can be wild/funky
- Honey: sweetness and body between washed and natural

BY ROAST LEVEL:
- Light: preserves origin character (acidity, fruit, florals). Most terroir expression.
- Medium: balances origin character with sweetness. Broadly appealing.
- Dark: generic "roast" flavors dominate (bitter, smoky). Origin characteristics lost.

BY ALTITUDE:
- Higher altitude = denser beans = more acidic = more complex flavor
- Lower altitude = softer acidity, heavier body, simpler flavors

BREWING TROUBLESHOOTING:
- Bitter/harsh = over-extracted. Fix: grind coarser or reduce contact time.
- Sour/weak/astringent = under-extracted. Fix: grind finer or increase contact time.
- Change one variable at a time.
`;

const BREWING_KNOWLEDGE = `
BREWING REFERENCE (from James Hoffmann):

KEY VARIABLES:
- Coffee-to-water ratio: Pour-over 60g/L, French press 75g/L, AeroPress 75-100g/L, Espresso ~1:2 by weight
- Grind: finer = more surface area = faster extraction. Use burr grinder (not blade).
- Water temp: just off boil for most methods. Lighter roasts benefit from hotter water.
- Extraction target: 18-22% of ground coffee by weight.

METHOD GUIDANCE:
- Pour-Over: 60g/L, medium grind, rinse paper filter, bloom 2x coffee weight 30 sec, pour slowly. Clean, clear cup.
- AeroPress: 75-100g/L, steep 1 min then press. Versatile.
- French Press: 75g/L, medium grind, steep 4 min. Heavy body.

STORAGE:
- Airtight, dark, never refrigerate
- Buy within 2 weeks of roast, use within 1 month
- Whole beans, grind just before brewing
`;

const RUPHUS_KNOWLEDGE = `
COFFEE KNOWLEDGE REFERENCE (from James Hoffmann):

COFFEE VARIETIES:
- Typica: original Ethiopian variety. Excellent cup quality, low yield.
- Bourbon: natural Typica mutation on Reunion island. Distinctive sweetness.
- SL-28: selected in Kenya 1930s. Distinct blackcurrant fruit flavor. Highly prized.
- SL-34: from French Mission Bourbon, Kenya. Fruit flavors.
- Geisha/Gesha: Ethiopian origin. Exceptionally aromatic/floral. Record auction prices.
- Caturra: Bourbon mutation. Dwarf, high yield. Quality increases with altitude.
- Castillo: Colombian hybrid, disease resistant. Decent cup quality.

PROCESSING METHODS:
- Natural/Dry: whole cherries sun-dried. Adds fruit flavors (blueberry, strawberry). Higher defect risk.
- Washed/Wet: depulped, fermented, washed, dried. Higher acidity, more complexity, cleaner cup.
- Honey: like pulped natural with calibrated flesh remaining. Sweetness between washed and natural.
- Anaerobic: fermented in oxygen-free environment. Can produce intense, unique flavors.

ROASTING:
- Light: high acidity, origin preserved, complex aromatics.
- Medium: balanced, sweetness often peaks.
- Dark: generic roast flavors dominate, origin lost.

KEY ORIGINS:
- Ethiopia: birthplace of coffee. Yirgacheffe (floral, Earl Grey-like), Sidama (fruity). Heirloom varieties.
- Kenya: SL-28/SL-34. Blackcurrant, grapefruit, bright acidity. Washed process.
- Colombia: Huila, Narino, Cauca. Caturra/Castillo. Range from chocolatey to fruity.
`;

// ═══════════════════════════════════════════════
// TEST DATA
// ═══════════════════════════════════════════════

const TEST_BEANS = [
  {
    name: 'Gesha Village Lot 74', roaster: 'SEY', origin: 'Ethiopia (Gesha Village, Bench Maji)',
    variety: 'Gesha 1931', process: 'Washed', roastDate: '2026-03-01',
    bagNotes: 'jasmine / bergamot / white peach / lemongrass',
    region: 'Bench Maji', altitude: '1900-2100 masl', roastLevel: 'light',
    // KNOWLEDGE GROUND TRUTH for scoring
    expectedFlavors: ['floral', 'jasmine', 'bergamot', 'citrus', 'tea', 'peach', 'delicate', 'aromatic'],
    expectedAcidity: 'high', // Gesha = high acidity, bright
    expectedBody: 'light', // Gesha = light/tea-like
    originKnowledge: ['ethiopia', 'birthplace', 'heirloom', 'yirgacheffe', 'altitude', 'complex'],
    varietyKnowledge: ['gesha', 'geisha', 'floral', 'aromatic', 'panama', 'auction', 'prized'],
    processKnowledge: ['washed', 'clean', 'bright', 'acidity', 'complexity'],
  },
  {
    name: 'Gichathaini AA', roaster: 'Manhattan Coffee Roasters', origin: 'Kenya (Nyeri)',
    variety: 'SL28, SL34', process: 'Washed', roastDate: '2026-03-10',
    bagNotes: 'blackcurrant / grapefruit / brown sugar / pomelo',
    region: 'Nyeri', altitude: '1700-1900 masl', roastLevel: 'light',
    expectedFlavors: ['blackcurrant', 'grapefruit', 'berry', 'citrus', 'bright', 'brown sugar', 'pomelo'],
    expectedAcidity: 'high', // Kenya = famously bright acidity
    expectedBody: 'medium',
    originKnowledge: ['kenya', 'nyeri', 'sl-28', 'sl28', 'sl-34', 'bright', 'complex', 'berry'],
    varietyKnowledge: ['sl-28', 'sl28', 'sl-34', 'blackcurrant', 'fruit', 'prized', 'kenya'],
    processKnowledge: ['washed', 'clean', 'bright', 'acidity'],
  },
  {
    name: 'Worka Sakaro', roaster: 'April Coffee', origin: 'Ethiopia (Gedeb, Yirgacheffe)',
    variety: 'Heirloom', process: 'Natural', roastDate: '2026-02-20',
    bagNotes: 'blueberry / strawberry jam / dark chocolate / wine',
    region: 'Gedeb, Yirgacheffe', altitude: '2000-2200 masl', roastLevel: 'light',
    expectedFlavors: ['blueberry', 'strawberry', 'berry', 'chocolate', 'wine', 'fruit', 'jam', 'ferment'],
    expectedAcidity: 'medium-high', // Natural reduces acidity slightly vs washed
    expectedBody: 'medium', // Natural = heavier body than washed
    originKnowledge: ['ethiopia', 'yirgacheffe', 'heirloom', 'altitude', 'aromatic'],
    varietyKnowledge: ['heirloom', 'ethiopia', 'diversity', 'genetic'],
    processKnowledge: ['natural', 'dry', 'fruit', 'blueberry', 'strawberry', 'body', 'ferment'],
  },
  {
    name: 'Huila Castillo', roaster: 'Onyx Coffee Lab', origin: 'Colombia (Huila)',
    variety: 'Castillo, Caturra', process: 'Washed', roastDate: '2026-01-20',
    bagNotes: 'brown sugar / red apple / nutty / smooth',
    region: 'Huila', altitude: '1600-1800 masl', roastLevel: 'medium',
    expectedFlavors: ['brown sugar', 'apple', 'nutty', 'chocolate', 'caramel', 'smooth', 'balanced'],
    expectedAcidity: 'moderate', // Colombia medium = moderate acidity
    expectedBody: 'medium',
    originKnowledge: ['colombia', 'huila', 'caturra', 'castillo', 'balanced', 'chocolate'],
    varietyKnowledge: ['castillo', 'caturra', 'colombian', 'yield', 'disease'],
    processKnowledge: ['washed', 'clean', 'bright'],
  },
  {
    name: 'El Placer', roaster: 'Dayglow (Promethium)', origin: 'Colombia',
    variety: 'Geisha', process: 'Anaerobic White Honey', roastDate: '2026-02-05',
    bagNotes: 'gardenia flowers / Earl Grey tea / bergamot',
    region: 'Unknown', altitude: '1700-1900 masl', roastLevel: 'light',
    expectedFlavors: ['floral', 'gardenia', 'earl grey', 'tea', 'bergamot', 'sweet', 'honey'],
    expectedAcidity: 'medium-high',
    expectedBody: 'medium',
    originKnowledge: ['colombia', 'geisha', 'gesha'],
    varietyKnowledge: ['geisha', 'gesha', 'floral', 'aromatic', 'prized'],
    processKnowledge: ['honey', 'anaerobic', 'sweet', 'ferment', 'body', 'fruit', 'unique', 'intense'],
  },
];

// ═══════════════════════════════════════════════
// TASTING CONVERSATIONS (with expected knowledge checks per turn)
// ═══════════════════════════════════════════════

const TASTING_CONVERSATIONS = [
  {
    bean: TEST_BEANS[0], // SEY Gesha - floral/delicate
    turns: [
      {
        user: "I'm tasting the Gesha Village Lot 74 from SEY today",
        knowledgeChecks: {
          K1_asksAroma: { test: t => /aroma|smell|nose|sniff|fragrance/i.test(t), desc: 'Asks about aroma (guided flow step 1)' },
          K2_givesOptions: { test: t => /\?.*(?:bright|floral|sweet|nutty|fruity|earthy|chocolat)/i.test(t), desc: 'Provides specific multiple-choice options' },
          K3_noPreReveal: { test: t => !/jasmine|bergamot|lemongrass|white peach/i.test(t), desc: 'Does NOT reveal bag notes before user answers' },
        },
      },
      {
        user: 'It smells really floral, like flowers, and kind of fruity too. Reminds me of tea maybe?',
        knowledgeChecks: {
          K4_validatesAroma: { test: t => /floral|flower|tea/i.test(t), desc: 'Acknowledges/validates what user described' },
          K5_labelsVocab: { test: t => /gesha|geisha|jasmine|bergamot|variety|washed|aromatic/i.test(t), desc: 'Labels with coffee vocabulary (connects floral to Gesha variety)' },
          K6_revealsBagNotes: { test: t => /bag|roaster|label|jasmine|bergamot|white peach|lemongrass|notes/i.test(t), desc: 'Reveals bag notes AFTER user answers (withhold-then-reveal)' },
          K7_transitionsToSip: { test: t => /sip|tongue|taste|bright|tangy|smooth/i.test(t), desc: 'Transitions to first sip step' },
        },
      },
      {
        user: 'Bright and tangy like citrus for sure. Really juicy.',
        knowledgeChecks: {
          K8_identifiesAcidity: { test: t => /acid|bright|crisp|juicy|citrus/i.test(t), desc: 'Correctly identifies this as acidity (Hoffmann: pleasant acidity = crisp, juicy, refreshing)' },
          K9_connectsToOrigin: { test: t => /ethiopia|east\s*africa|altitude|high.*altitude|gesha|light.*roast|washed/i.test(t), desc: 'Connects acidity to origin/altitude/process (Hoffmann: East African = bright acidity, higher altitude = more acidic)' },
          K10_transitionsBody: { test: t => /body|mouth|feel|heavy|light.*tea|medium.*juice|thick.*milk|weight|texture/i.test(t), desc: 'Transitions to body/finish step' },
        },
      },
      {
        user: 'Light like tea. The taste lingers for a while, kind of sweet aftertaste.',
        knowledgeChecks: {
          K11_confirmsLightBody: { test: t => /light|tea|delicate|clean|paper.*filter|pour.*over/i.test(t), desc: 'Confirms light body is expected (Hoffmann: paper-filtered = lighter body; Gesha = tea-like)' },
          K12_finishKnowledge: { test: t => /linger|finish|aftertaste|long|pleasant|clean/i.test(t), desc: 'Discusses finish quality (Hoffmann: clean, pleasant, lingering = good)' },
          K13_sweetenessTransition: { test: t => /sweet|how sweet|barely|noticeable|present/i.test(t), desc: 'Transitions to sweetness step' },
        },
      },
      {
        user: 'Really present, more than I expected',
        knowledgeChecks: {
          K14_sweetnessKnowledge: { test: t => /sweet|caramel|maillard|aromatic|compound|roast/i.test(t), desc: 'Discusses sweetness correctly (Hoffmann: sweetness from aromatic compounds, not residual sugars)' },
          K15_oneWordTransition: { test: t => /one word|word.*describe|single word/i.test(t), desc: 'Transitions to one-word step' },
        },
      },
      {
        user: 'Elegant',
        knowledgeChecks: {
          K16_acknowledgesWord: { test: t => /elegant|fitting|perfect|great|suits|captures/i.test(t), desc: 'Acknowledges the one-word choice' },
          K17_brewDialin: { test: t => /sour|bitter|weak|watery|good|dial|brew|change|adjust/i.test(t), desc: 'Transitions to brew dial-in diagnostic' },
        },
      },
      {
        user: 'Pretty good as-is actually',
        knowledgeChecks: {
          K18_correctAdvice: { test: t => /keep|good|dialed|same|no change|nothing|great|stick/i.test(t), desc: 'Correctly advises to keep settings (not change anything)' },
          K19_extractMarkers: { test: t => /---EXTRACT---/.test(t) && /---END---/.test(t), desc: 'Includes structured extraction markers' },
          K20_validJSON: {
            test: t => {
              try {
                const m = t.match(/---EXTRACT---\s*([\s\S]*?)\s*---END---/);
                if (!m) return false;
                const j = JSON.parse(m[1]);
                return !!(j.beanName && j.aroma && j.oneWord);
              } catch { return false; }
            },
            desc: 'Valid JSON in extraction with required fields',
          },
        },
      },
    ],
  },
  {
    bean: TEST_BEANS[1], // Kenya - bright/berry
    turns: [
      {
        user: "Let's taste the Gichathaini AA",
        knowledgeChecks: {
          K1_asksAroma: { test: t => /aroma|smell|nose|sniff|fragrance/i.test(t), desc: 'Asks about aroma' },
          K3_noPreReveal: { test: t => !/blackcurrant|pomelo/i.test(t), desc: 'Does NOT reveal bag notes' },
        },
      },
      {
        user: 'Smells kind of like berries, dark ones. And something citrusy.',
        knowledgeChecks: {
          K4_validatesAroma: { test: t => /berr|dark.*fruit|citrus/i.test(t), desc: 'Validates user perception' },
          K5_labelsVocab: { test: t => /blackcurrant|sl-?28|sl-?34|kenya|currant|dark.*berry/i.test(t), desc: 'Connects berries to SL-28 (Hoffmann: SL-28 = distinct blackcurrant fruit flavor)' },
          K6_revealsBagNotes: { test: t => /blackcurrant|grapefruit|pomelo|brown sugar|bag|roaster|notes/i.test(t), desc: 'Reveals bag notes after answer' },
        },
      },
      {
        user: 'Wow that is really bright and tangy. Almost like grapefruit juice.',
        knowledgeChecks: {
          K8_identifiesAcidity: { test: t => /acid|bright|crisp|juicy/i.test(t), desc: 'Identifies as acidity' },
          K9_connectsToOrigin: { test: t => /kenya|east.*africa|altitude|sl-?28|washed|bright.*acidity/i.test(t), desc: 'Connects to Kenya/SL-28 (Hoffmann: East African = bright acidity, complex)' },
        },
      },
      {
        user: 'Medium body I think. Like juice. Finish lasts a long time.',
        knowledgeChecks: {
          K11_bodyKnowledge: { test: t => /medium|juice|body/i.test(t), desc: 'Confirms medium body assessment' },
          K12_finishKnowledge: { test: t => /linger|finish|long|pleasant/i.test(t), desc: 'Discusses lingering finish (Hoffmann: long finish = good quality)' },
        },
      },
      {
        user: 'Noticeable sweetness, like brown sugar',
        knowledgeChecks: {
          K14_sweetnessKnowledge: { test: t => /sweet|brown sugar|caramel|sugar/i.test(t), desc: 'Acknowledges brown sugar sweetness' },
          K6b_revealsMatch: { test: t => /bag|roaster|match|notes|brown sugar/i.test(t), desc: 'Notes match with bag notes (brown sugar is on the bag)' },
        },
      },
      {
        user: 'Intense',
        knowledgeChecks: {
          K17_brewDialin: { test: t => /sour|bitter|weak|good|dial|brew|change/i.test(t), desc: 'Moves to brew dial-in' },
        },
      },
      {
        user: 'A little too sour/bright for me',
        knowledgeChecks: {
          K21_correctSourFix: { test: t => /finer|grind.*finer|hotter|higher.*temp|longer.*time|more.*time/i.test(t), desc: 'CRITICAL: sour = under-extracted = grind FINER or hotter water (Hoffmann: sour/weak = under-extracted. Fix: grind finer or increase contact time)' },
          K22_noWrongAdvice: { test: t => !/coarser|cooler|lower.*temp|less.*time/i.test(t), desc: 'Does NOT give wrong advice (coarser would make sour WORSE)' },
          K19_extractMarkers: { test: t => /---EXTRACT---/.test(t) && /---END---/.test(t), desc: 'Includes extraction markers' },
        },
      },
    ],
  },
  {
    bean: TEST_BEANS[3], // Colombia medium - chocolatey/nutty
    turns: [
      {
        user: "I'm drinking the Huila Castillo from Onyx",
        knowledgeChecks: {
          K1_asksAroma: { test: t => /aroma|smell|nose|sniff|fragrance/i.test(t), desc: 'Asks about aroma' },
          K3_noPreReveal: { test: t => !/brown sugar|red apple|nutty/i.test(t), desc: 'Does NOT reveal bag notes' },
        },
      },
      {
        user: 'Smells like chocolate and nuts. Really pleasant and warm.',
        knowledgeChecks: {
          K4_validates: { test: t => /chocolate|nut|warm|pleasant/i.test(t), desc: 'Validates chocolate/nut perception' },
          K5_labelsVocab: { test: t => /latin|colombia|medium|roast|typical|caturra|castillo|caramel|nutty|chocolate/i.test(t), desc: 'Connects to origin profile (Hoffmann: Latin American = nutty/chocolatey)' },
          K6_revealsBagNotes: { test: t => /brown sugar|red apple|bag|roaster|notes|label/i.test(t), desc: 'Reveals bag notes' },
        },
      },
      {
        user: 'Smooth and round, not really tangy at all',
        knowledgeChecks: {
          K8_identifiesLowAcidity: { test: t => /low|soft|smooth|mellow|moderate|gentle|round/i.test(t), desc: 'Correctly identifies low/moderate acidity' },
          K9b_connectsToMedium: { test: t => /medium|roast|colombia|balanced|sweetness/i.test(t), desc: 'Connects to medium roast profile (Hoffmann: medium = balanced, sweetness peaks)' },
        },
      },
      {
        user: 'Medium body like juice. Finish is clean but not super long.',
        knowledgeChecks: {
          K11_bodyKnowledge: { test: t => /medium|body/i.test(t), desc: 'Confirms medium body' },
          K12_finishKnowledge: { test: t => /clean|finish|short|quick|brief/i.test(t), desc: 'Discusses clean but shorter finish' },
        },
      },
      {
        user: 'Barely there',
        knowledgeChecks: {
          K14_sweetnessNote: { test: t => /sweet|subtle|mild|light|less/i.test(t), desc: 'Notes lower sweetness' },
        },
      },
      {
        user: 'Comforting',
        knowledgeChecks: {
          K17_brewDialin: { test: t => /sour|bitter|weak|good|dial|brew|change/i.test(t), desc: 'Moves to brew dial-in' },
        },
      },
      {
        user: 'Pretty good as-is',
        knowledgeChecks: {
          K18_correctAdvice: { test: t => /keep|good|same|no change|stick|dialed/i.test(t), desc: 'Advises to keep settings' },
          K19_extractMarkers: { test: t => /---EXTRACT---/.test(t) && /---END---/.test(t), desc: 'Extraction markers present' },
        },
      },
    ],
  },
];

// General chat queries with knowledge-grounded checks
const CHAT_TESTS = [
  {
    query: "Which bean should I open next? I want something different from the Kenya.",
    knowledgeChecks: {
      C1_recommendsSealed: { test: t => /El Placer|Huila/i.test(t), desc: 'Recommends from SEALED inventory (El Placer or Huila Castillo)' },
      C2_explainsWhy: { test: t => /honey|anaerobic|process|different|contrast|flavor|variety|chocolate|nutty|floral/i.test(t), desc: 'Explains WHY based on flavor contrast with Kenya' },
      C3_mentionsTiming: { test: t => /peak|days|roast|window|age|fresh|past|fading|open.*soon|100g|small/i.test(t), desc: 'Considers timing/peak window in recommendation' },
      C4_noActiveRecs: { test: t => {
        // Should not recommend beans already in active rotation as "next to open"
        const recActive = /open.*(?:Gesha Village|Gichathaini|Worka Sakaro)|(?:Gesha Village|Gichathaini|Worka Sakaro).*next/i.test(t);
        return !recActive;
      }, desc: 'Does NOT recommend already-open beans as next to open' },
    },
  },
  {
    query: "What's the best way to brew a light roast Ethiopian? I have an AeroPress and a pour-over.",
    knowledgeChecks: {
      C5_methodKnowledge: { test: t => /pour.?over|aeropress|60.*g|75.*g|bloom|grind|medium|fine/i.test(t), desc: 'Shows correct method knowledge (Hoffmann ratios, grind, bloom)' },
      C6_tempAdvice: { test: t => /hot|hotter|high.*temp|boil|just off|205|96|95|lighter.*roast.*hotter/i.test(t), desc: 'Recommends hotter water for light roast (Hoffmann: lighter roasts benefit from hotter water)' },
      C7_originAware: { test: t => /ethiop|floral|fruit|bright|acidity|delicate|clarity/i.test(t), desc: 'Connects to Ethiopian flavor profile' },
      C8_concise: { test: t => t.length < 1500, desc: 'Concise response' },
    },
  },
  {
    query: "My coffee tastes bitter and harsh today, what went wrong?",
    knowledgeChecks: {
      C9_correctDiagnosis: { test: t => /over.?extract/i.test(t), desc: 'Correctly identifies bitter/harsh as over-extraction (Hoffmann: bitter/harsh = over-extracted)' },
      C10_correctFix: { test: t => /coarser|grind.*coarser|less.*time|reduce.*time|lower.*temp|cooler/i.test(t), desc: 'Recommends correct fix: coarser grind OR less contact time (Hoffmann fix for over-extraction)' },
      C11_noWrongFix: { test: t => !/(?:grind|go).*finer|more.*time|increase.*time|hotter/i.test(t), desc: 'Does NOT recommend wrong fix (finer grind = MORE extraction = MORE bitter)' },
      C12_oneVariable: { test: t => /one.*(?:variable|thing|change)|at a time/i.test(t) || t.length < 800, desc: 'Mentions changing one variable at a time or keeps advice focused' },
    },
  },
  {
    query: "Should I be worried that the El Placer is 58 days post-roast?",
    knowledgeChecks: {
      C13_knowsProcess: { test: t => /honey|anaerobic|process|experiment/i.test(t), desc: 'References the honey/anaerobic process' },
      C14_peakKnowledge: { test: t => /peak|window|fresh|age|month|weeks|soon|before/i.test(t), desc: 'Discusses peak window timeline' },
      C15_actionable: { test: t => /open|use|brew|soon|priority|next|consider|don't wait|hurry/i.test(t), desc: 'Gives actionable advice' },
    },
  },
  {
    query: "What's the difference between washed and natural process? In simple terms.",
    knowledgeChecks: {
      C16_washedCorrect: { test: t => /washed.*(?:clean|bright|acidity|complex)|(?:clean|bright|acidity|complex).*washed/i.test(t), desc: 'Correctly describes washed: cleaner, brighter acidity (Hoffmann)' },
      C17_naturalCorrect: { test: t => /natural.*(?:fruit|berry|body|heavy|blueberry|strawberry|ferment)|(?:fruit|berry|body|heavy).*natural/i.test(t), desc: 'Correctly describes natural: fruitier, heavier body (Hoffmann)' },
      C18_noReversal: { test: t => {
        // Washed should NOT be described as "fruity/heavy" and Natural should NOT be "clean/bright"
        const washedFruity = /washed.*(?:fruity|heavy body|funky)/i.test(t);
        const naturalClean = /natural.*(?:clean cup|bright acidity|more complex)/i.test(t);
        return !washedFruity && !naturalClean;
      }, desc: 'Does NOT reverse the descriptions (common knowledge error)' },
      C19_simple: { test: t => t.length < 1000, desc: 'Keeps explanation simple as requested' },
    },
  },
];

// Ruphus test beans with knowledge ground truth
const RUPHUS_TESTS = TEST_BEANS.map(bean => ({
  bean,
  knowledgeChecks: {
    R1_validJSON: { test: null, desc: 'Valid JSON response' }, // checked separately
    R2_hasFields: { test: null, desc: 'Has required fields (intro, lookFor, flavorProfile)' },
    R3_correctProcess: {
      keywords: bean.processKnowledge,
      desc: `Correctly describes ${bean.process} process`,
    },
    R4_correctOrigin: {
      keywords: bean.originKnowledge,
      desc: `Shows knowledge of ${bean.origin}`,
    },
    R5_correctVariety: {
      keywords: bean.varietyKnowledge,
      desc: `Shows knowledge of ${bean.variety} variety`,
    },
    R6_reasonableFlavors: {
      test: null, // checked against expectedFlavors
      desc: 'Flavor expectations align with variety/process/origin',
    },
    R7_noHallucination: {
      test: null, // checked in scoring function
      desc: 'Does not fabricate specific details (founding dates, etc.)',
    },
  },
}));

// ═══════════════════════════════════════════════
// SYSTEM PROMPTS
// ═══════════════════════════════════════════════

function buildTastingSystemPrompt(bean, variant = 'default') {
  const beanProfile = [
    bean.roaster && `Roaster: ${bean.roaster}`,
    bean.name && `Name: ${bean.name}`,
    bean.origin && `Origin: ${bean.origin}`,
    bean.region && `Region: ${bean.region}`,
    bean.process && `Process: ${bean.process}`,
    bean.variety && `Variety: ${bean.variety}`,
    bean.altitude && `Altitude: ${bean.altitude}`,
    bean.roastDate && `Roast Date: ${bean.roastDate}`,
    bean.bagNotes && `Bag Notes: ${bean.bagNotes}`,
    bean.roastLevel && `Roast Level: ${bean.roastLevel}`,
  ].filter(Boolean).join('\n- ');

  const base = `You are a patient, encouraging coffee tasting COACH helping a novice taster log a tasting. The pre-selected bean is: ${bean.name}.

BEAN PROFILE (the coffee being tasted right now):
- ${beanProfile}

${TASTING_KNOWLEDGE}

CRITICAL RULES:
- Tal is learning to taste. NEVER ask vague questions like "how is it?" or "what do you notice?"
- ALWAYS give specific instructions: what to do physically, what to pay attention to, and multiple-choice options to pick from
- Teach tasting vocabulary naturally by labeling what he describes (e.g. "That funky smell? That's classic natural process fermentation!")
- Be warm, encouraging, and brief (2-3 sentences + options per turn, plus reveal sentences when applicable)
- No emojis in your responses

WITHHOLD-THEN-REVEAL COACHING:
- You have the bean profile and bag notes internally. Do NOT reveal bag notes or expected flavors BEFORE the taster gives their answer.
- AFTER the taster responds to each step, reveal what the bag/roaster said for that attribute.
- When the taster's answer differs from bag notes: validate their perception, explain a possible reason (age, grind, process, altitude), and give one actionable tip. ("Teach the gap")
- When the taster's answer matches: celebrate briefly ("That's exactly what the roaster had too").

GUIDED FLOW (follow this order across your turns):
1. AROMA - already asked in first message. When he responds, validate and label what he described, then reveal what the bag says and teach the gap if needed. Move to step 2.
2. FIRST SIP - "Take a sip and let it sit on your tongue for a sec. Is it: bright/tangy like citrus? Smooth and round? Sharp/sour? Sweet right away?"
3. BODY & FINISH - "How heavy does it feel in your mouth? Light like tea, medium like juice, or thick like milk? And after you swallow, does the taste disappear quickly or linger?"
4. SWEETNESS - "How sweet is it? Barely there, noticeable, or really present?"
5. ONE WORD - "If you had to describe this whole cup in one word, what would it be?"
6. BREW DIAL-IN - "Quick check: was the cup (a) too sour/bright, (b) too bitter/harsh, (c) too weak/watery, or (d) pretty good as-is?" Then TELL them the fix.

After covering these areas, end your message with EXACTLY:

---EXTRACT---
{"beanName":"exact bean name","aroma":"...","firstSip":"...","acidity":"...","sweetness":"...","body":"...","finish":"...","oneWord":"...","notes":"...","changeTomorrow":"...","rating":0}
---END---`;

  // Prompt tuning variants for Haiku
  if (variant === 'v1_brevity') {
    return base + `

IMPORTANT REMINDERS:
- Keep each response to 2-3 SHORT sentences plus the coaching question. Do not write paragraphs.
- When labeling flavors, use phrases like "That's called...", "What you're describing is...", "In coffee terms, that's..."
- You MUST include the ---EXTRACT--- / ---END--- block on the final turn. This is mandatory.`;
  }

  if (variant === 'v2_stronger') {
    return base + `

ABSOLUTE REQUIREMENTS:
1. BREVITY: Maximum 4 sentences per turn (coaching + reveal + transition). Paragraphs are WRONG.
2. VOCABULARY LABELING: Every turn after the first MUST include one phrase like "That's what coffee people call..." or "In tasting terms, that's..." or "The technical word for that is..."
3. EXTRACTION: On the LAST turn (after brew dial-in), you MUST end with ---EXTRACT--- JSON ---END---. No exceptions. If you don't include it, the tasting is lost.
4. BREW TROUBLESHOOTING: Sour/bright = under-extracted (grind FINER, hotter water). Bitter/harsh = over-extracted (grind COARSER, cooler water). NEVER reverse these.`;
  }

  if (variant === 'v3_examples') {
    return base + `

FORMAT REQUIREMENTS:
- Maximum 4 sentences per turn. Example good response:
  "Nice catch on the berry notes! That dark fruit quality is classic SL-28 from Kenya, often described as blackcurrant. The roaster's notes say 'blackcurrant / grapefruit' -- so you're right on target. Now take a sip: is it bright/tangy like citrus, smooth and round, or sharp/sour?"
- Always label vocabulary: "That's called X" / "In coffee terms, that's Y" / "Coffee people would say Z"
- CRITICAL: The FINAL turn MUST contain ---EXTRACT--- {...JSON...} ---END--- markers. Without these, the tasting data is lost forever.
- Brew fixes: sour = grind FINER. Bitter = grind COARSER. Never mix these up.`;
  }

  return base; // default
}

function buildChatContext() {
  return `You are Tal's coffee assistant. You have access to his REAL, CURRENT coffee data. NEVER suggest beans that are already finished or opened. Only recommend from SEALED inventory.

${BREWING_KNOWLEDGE}

TODAY: 2026-04-04

ACTIVE ROTATION (Atmos canisters):
  Atmos #1: SEY -- Gesha Village Lot 74 (Ethiopia) | Gesha 1931 Washed | 34d post-roast (In Peak) | Opened: 2026-03-25 (10d ago) | Notes: jasmine / bergamot / white peach / lemongrass
  Atmos #2: Manhattan Coffee Roasters -- Gichathaini AA (Kenya) | SL28, SL34 Washed | 25d post-roast (In Peak) | Opened: 2026-03-28 (7d ago) | Notes: blackcurrant / grapefruit / brown sugar / pomelo
  Atmos #3: April Coffee -- Worka Sakaro (Ethiopia) | Heirloom Natural | 43d post-roast (In Peak) | Opened: 2026-04-01 (3d ago) | Notes: blueberry / strawberry jam / dark chocolate / wine

SEALED INVENTORY:
  Dayglow (Promethium) -- El Placer (Colombia) | Geisha Anaerobic White Honey | 100g | 58d post-roast (In Peak) | Notes: gardenia flowers / Earl Grey tea / bergamot
  Onyx Coffee Lab -- Huila Castillo (Colombia) | Castillo, Caturra Washed | 340g | 74d post-roast (Past Peak) | Notes: brown sugar / red apple / nutty / smooth

RECENTLY FINISHED:
  (none)

RECENT TASTINGS:
  2026-04-03: Gesha Village Lot 74 -- elegant, floral, tea-like -- 5 stars
  2026-04-02: Gichathaini AA -- intense, bright, berry -- 4 stars

ROTATION RULES:
- Keep 3 beans active (Atmos #1-#3)
- Priority: (1) Already opened, (2) In/approaching peak window, (3) Smaller bags first
- After opening (Atmos): finish within 2-4 weeks; 100g bags within 7-14 days
- Bag-stated guidance always overrides defaults

Be concise, warm, and opinionated. If recommending a bean, explain WHY based on timing and variety.`;
}

function buildRuphusPrompt() {
  return `You are Professor Ruphus, a friendly golden retriever who is a coffee professor.
You write short, warm educational lessons about specific coffees for a novice enthusiast.

${RUPHUS_KNOWLEDGE}

HALLUCINATION PREVENTION:
1. ROASTER section: ONLY include facts you are confident about. If not confident, set to null.
2. COFFEE/FARM section: Only use facts from the bean data provided. General knowledge about the region is fine.
3. PROCESS section: General coffee knowledge is fine. Explaining what a process means is always safe.
4. LOOK FOR section: Connecting variety + process + origin to expected flavors is safe general knowledge.
5. FLAVOR PROFILE: Base on general expectations for this variety + process + origin.
6. When data is thin, set sections to null.

TONE: Warm, enthusiastic, slightly nerdy. First person. Brief -- 60-90 second read (~200-300 words total).`;
}

// ═══════════════════════════════════════════════
// SCORING
// ═══════════════════════════════════════════════

function runChecks(text, checks) {
  const results = {};
  for (const [name, check] of Object.entries(checks)) {
    if (check.test) {
      results[name] = { pass: check.test(text), desc: check.desc };
    }
    // keyword checks handled differently
    if (check.keywords) {
      const lower = text.toLowerCase();
      const hits = check.keywords.filter(k => lower.includes(k.toLowerCase()));
      results[name] = { pass: hits.length >= 1, desc: check.desc, hits };
    }
  }
  return results;
}

function scoreRuphusResponse(text, bean, checks) {
  const results = {};
  let story;

  // Parse JSON
  try {
    const clean = text.replace(/```json|```/g, '').trim();
    const match = clean.match(/\{[\s\S]*\}/);
    story = match ? JSON.parse(match[0]) : null;
    results.R1_validJSON = { pass: story !== null, desc: 'Valid JSON' };
  } catch {
    results.R1_validJSON = { pass: false, desc: 'Valid JSON' };
  }

  if (!story) return results;

  // Required fields
  results.R2_hasFields = { pass: !!(story.intro && story.lookFor && story.flavorProfile), desc: 'Has required fields' };

  // Knowledge checks via full text
  const fullText = [story.intro, story.roaster, story.coffee, story.process, story.lookFor].filter(Boolean).join(' ');

  // Process knowledge
  const processHits = bean.processKnowledge.filter(k => fullText.toLowerCase().includes(k));
  results.R3_correctProcess = { pass: processHits.length >= 2, desc: checks.R3_correctProcess.desc, hits: processHits };

  // Origin knowledge
  const originHits = bean.originKnowledge.filter(k => fullText.toLowerCase().includes(k));
  results.R4_correctOrigin = { pass: originHits.length >= 2, desc: checks.R4_correctOrigin.desc, hits: originHits };

  // Variety knowledge
  const varietyHits = bean.varietyKnowledge.filter(k => fullText.toLowerCase().includes(k));
  results.R5_correctVariety = { pass: varietyHits.length >= 1, desc: checks.R5_correctVariety.desc, hits: varietyHits };

  // Flavor alignment (lookFor section should reference expected flavors)
  const lookFor = (story.lookFor || '').toLowerCase();
  const flavorHits = bean.expectedFlavors.filter(f => lookFor.includes(f));
  results.R6_reasonableFlavors = { pass: flavorHits.length >= 2, desc: 'Flavor expectations align with bean profile', hits: flavorHits };

  // Hallucination check (no specific founding years for obscure roasters)
  const yearPattern = /(?:founded|established|started|opened|since|began).*(?:19|20)\d{2}/i;
  const hasYear = yearPattern.test(story.roaster || '');
  // Only flag if roaster isn't well-known
  const wellKnown = ['onyx', 'counter culture', 'intelligentsia', 'stumptown', 'blue bottle'].some(r => bean.roaster.toLowerCase().includes(r));
  results.R7_noHallucination = { pass: !hasYear || wellKnown || story.roaster === null, desc: 'No fabricated details' };

  // Flavor profile scores reasonable
  const fp = story.flavorProfile;
  if (fp) {
    const scores = [fp.fragranceAroma, fp.acidity, fp.sweetness, fp.body, fp.flavor, fp.balance];
    const allValid = scores.every(s => typeof s === 'number' && s >= 1 && s <= 10);
    // Check acidity makes sense for the bean
    let acidityOk = true;
    if (bean.expectedAcidity === 'high' && fp.acidity < 6) acidityOk = false;
    if (bean.expectedAcidity === 'moderate' && (fp.acidity > 8 || fp.acidity < 3)) acidityOk = false;
    results.R8_flavorScores = { pass: allValid && acidityOk, desc: 'Flavor profile scores valid and acidity matches bean type' };
  } else {
    results.R8_flavorScores = { pass: false, desc: 'Flavor profile scores valid' };
  }

  return results;
}

// ═══════════════════════════════════════════════
// TEST RUNNERS
// ═══════════════════════════════════════════════

async function testTastingCoach(model, label, variant = 'default') {
  console.log(`\n  ---- Tasting Coach: ${label} (${model}, prompt: ${variant}) ----`);
  let totalPassed = 0;
  let totalChecks = 0;
  const costs = { input: 0, output: 0 };
  const failDetails = [];

  for (const conv of TASTING_CONVERSATIONS) {
    const systemPrompt = buildTastingSystemPrompt(conv.bean, variant);
    const history = [];

    for (let i = 0; i < conv.turns.length; i++) {
      const turn = conv.turns[i];
      history.push({ role: 'user', content: turn.user });
      try {
        const result = await callAnthropic(model, systemPrompt, history.slice(-8), 1000);
        history.push({ role: 'assistant', content: result.text });
        costs.input += result.inputTokens || 0;
        costs.output += result.outputTokens || 0;

        const checkResults = runChecks(result.text, turn.knowledgeChecks);
        for (const [name, r] of Object.entries(checkResults)) {
          totalChecks++;
          if (r.pass) {
            totalPassed++;
          } else {
            failDetails.push({ bean: conv.bean.name, turn: i, check: name, desc: r.desc });
          }
        }
      } catch (err) {
        console.log(`    ${conv.bean.name} turn ${i}: ERROR ${err.message.slice(0, 100)}`);
        history.push({ role: 'assistant', content: 'Error occurred.' });
        totalChecks += Object.keys(turn.knowledgeChecks).length;
      }
    }
  }

  const pct = totalChecks > 0 ? Math.round((totalPassed / totalChecks) * 100) : 0;
  console.log(`  Score: ${totalPassed}/${totalChecks} (${pct}%) | Tokens: ${costs.input}in/${costs.output}out`);
  if (failDetails.length > 0) {
    console.log(`  Failures:`);
    for (const f of failDetails) {
      console.log(`    ${f.bean} turn ${f.turn}: ${f.check} -- ${f.desc}`);
    }
  }
  return { passed: totalPassed, total: totalChecks, pct, costs, failDetails };
}

async function testGeneralChat(model, label) {
  console.log(`\n  ---- General Chat: ${label} (${model}) ----`);
  const systemPrompt = buildChatContext();
  let totalPassed = 0;
  let totalChecks = 0;
  const costs = { input: 0, output: 0 };
  const failDetails = [];

  for (const test of CHAT_TESTS) {
    try {
      const result = await callAnthropic(model, systemPrompt, [{ role: 'user', content: test.query }], 800);
      costs.input += result.inputTokens || 0;
      costs.output += result.outputTokens || 0;

      const checkResults = runChecks(result.text, test.knowledgeChecks);
      for (const [name, r] of Object.entries(checkResults)) {
        totalChecks++;
        if (r.pass) {
          totalPassed++;
        } else {
          failDetails.push({ query: test.query.slice(0, 50), check: name, desc: r.desc });
        }
      }
    } catch (err) {
      console.log(`    "${test.query.slice(0, 50)}..." ERROR ${err.message.slice(0, 100)}`);
      totalChecks += Object.keys(test.knowledgeChecks).length;
    }
  }

  const pct = totalChecks > 0 ? Math.round((totalPassed / totalChecks) * 100) : 0;
  console.log(`  Score: ${totalPassed}/${totalChecks} (${pct}%) | Tokens: ${costs.input}in/${costs.output}out`);
  if (failDetails.length > 0) {
    console.log(`  Failures:`);
    for (const f of failDetails) {
      console.log(`    "${f.query}..." ${f.check} -- ${f.desc}`);
    }
  }
  return { passed: totalPassed, total: totalChecks, pct, costs, failDetails };
}

async function testRuphusStory(model, label) {
  console.log(`\n  ---- Professor Ruphus: ${label} (${model}) ----`);
  const systemPrompt = buildRuphusPrompt();
  let totalPassed = 0;
  let totalChecks = 0;
  const costs = { input: 0, output: 0 };
  const failDetails = [];

  for (const test of RUPHUS_TESTS) {
    const bean = test.bean;
    const beanContext = [
      bean.roaster && `Roaster: ${bean.roaster}`,
      bean.name && `Name: ${bean.name}`,
      bean.origin && `Origin: ${bean.origin}`,
      bean.variety && `Variety: ${bean.variety}`,
      bean.process && `Process: ${bean.process}`,
      bean.region && `Region: ${bean.region}`,
      bean.altitude && `Altitude: ${bean.altitude}`,
      bean.roastLevel && `Roast Level: ${bean.roastLevel}`,
      bean.bagNotes && `Tasting Notes on Bag: ${bean.bagNotes}`,
    ].filter(Boolean).join('\n');

    const userMsg = `Write a Professor Ruphus lesson about this coffee:\n\n${beanContext}\n\nRespond with ONLY a valid JSON object:\n{\n  "intro": "One-liner greeting (15 words max)",\n  "roaster": "2-3 sentences about the roaster. null if uncertain.",\n  "coffee": "2-3 sentences about the farm, region, altitude. null if no context.",\n  "process": "2-3 sentences explaining this processing method. null if unknown.",\n  "lookFor": "2-3 sentences connecting variety + process + origin to expected flavors.",\n  "flavorProfile": {"fragranceAroma": 7, "acidity": 7, "sweetness": 7, "body": 7, "flavor": 7, "balance": 7}\n}\nReplace 7s with actual 1-10 estimates.`;

    try {
      const result = await callOpenAI(model, systemPrompt, userMsg, 1200);
      costs.input += result.inputTokens || 0;
      costs.output += result.outputTokens || 0;

      const checkResults = scoreRuphusResponse(result.text, bean, test.knowledgeChecks);
      for (const [name, r] of Object.entries(checkResults)) {
        totalChecks++;
        if (r.pass) {
          totalPassed++;
        } else {
          failDetails.push({ bean: bean.name, check: name, desc: r.desc, hits: r.hits });
        }
      }
    } catch (err) {
      console.log(`    ${bean.name}: ERROR ${err.message.slice(0, 100)}`);
      totalChecks += 8;
    }
  }

  const pct = totalChecks > 0 ? Math.round((totalPassed / totalChecks) * 100) : 0;
  console.log(`  Score: ${totalPassed}/${totalChecks} (${pct}%) | Tokens: ${costs.input}in/${costs.output}out`);
  if (failDetails.length > 0) {
    console.log(`  Failures:`);
    for (const f of failDetails) {
      console.log(`    ${f.bean}: ${f.check} -- ${f.desc}${f.hits ? ` (hits: ${f.hits.join(', ')})` : ''}`);
    }
  }
  return { passed: totalPassed, total: totalChecks, pct, costs, failDetails };
}

// ═══════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════

async function main() {
  console.log('='.repeat(80));
  console.log('COST OPTIMIZATION AUTORESEARCH v2 — Knowledge-Grounded Scoring');
  console.log('Tests actual coffee knowledge, not just formatting');
  console.log('='.repeat(80));

  const results = {};

  // ── TEST 1: Tasting Coach — Sonnet baseline ──
  console.log('\n' + '='.repeat(80));
  console.log('TEST 1: TASTING COACH');
  console.log('='.repeat(80));
  results.tasting_sonnet = await testTastingCoach('claude-sonnet-4-6', 'Sonnet Baseline');
  results.tasting_haiku_default = await testTastingCoach('claude-haiku-4-5-20251001', 'Haiku Default');
  results.tasting_haiku_v1 = await testTastingCoach('claude-haiku-4-5-20251001', 'Haiku v1 (brevity)', 'v1_brevity');
  results.tasting_haiku_v2 = await testTastingCoach('claude-haiku-4-5-20251001', 'Haiku v2 (stronger)', 'v2_stronger');
  results.tasting_haiku_v3 = await testTastingCoach('claude-haiku-4-5-20251001', 'Haiku v3 (examples)', 'v3_examples');

  // ── TEST 2: General Chat ──
  console.log('\n' + '='.repeat(80));
  console.log('TEST 2: GENERAL CHAT');
  console.log('='.repeat(80));
  results.chat_sonnet = await testGeneralChat('claude-sonnet-4-6', 'Sonnet Baseline');
  results.chat_haiku = await testGeneralChat('claude-haiku-4-5-20251001', 'Haiku');

  // ── TEST 3: Professor Ruphus ──
  console.log('\n' + '='.repeat(80));
  console.log('TEST 3: PROFESSOR RUPHUS');
  console.log('='.repeat(80));
  results.ruphus_54 = await testRuphusStory('gpt-5.4', 'GPT-5.4 Baseline');
  results.ruphus_mini = await testRuphusStory('gpt-5.4-mini', 'GPT-5.4 Mini');

  // ── FINAL SUMMARY ──
  console.log('\n' + '='.repeat(80));
  console.log('FINAL RESULTS — KNOWLEDGE-GROUNDED SCORING');
  console.log('='.repeat(80));

  const pricing = {
    'claude-sonnet-4-6': { input: 3.00, output: 15.00 },
    'claude-haiku-4-5-20251001': { input: 0.80, output: 4.00 },
    'gpt-5.4': { input: 2.50, output: 10.00 },
    'gpt-5.4-mini': { input: 0.40, output: 1.60 },
  };

  function costStr(costs, model) {
    const p = pricing[model];
    const c = ((costs.input / 1_000_000) * p.input + (costs.output / 1_000_000) * p.output);
    return `$${c.toFixed(4)}`;
  }

  console.log('\n  TASTING COACH:');
  console.log(`    Sonnet Baseline:    ${results.tasting_sonnet.pct}% (${results.tasting_sonnet.passed}/${results.tasting_sonnet.total}) — ${costStr(results.tasting_sonnet.costs, 'claude-sonnet-4-6')}`);
  console.log(`    Haiku Default:      ${results.tasting_haiku_default.pct}% (${results.tasting_haiku_default.passed}/${results.tasting_haiku_default.total}) — ${costStr(results.tasting_haiku_default.costs, 'claude-haiku-4-5-20251001')}`);
  console.log(`    Haiku v1 (brevity): ${results.tasting_haiku_v1.pct}% (${results.tasting_haiku_v1.passed}/${results.tasting_haiku_v1.total}) — ${costStr(results.tasting_haiku_v1.costs, 'claude-haiku-4-5-20251001')}`);
  console.log(`    Haiku v2 (stronger):${results.tasting_haiku_v2.pct}% (${results.tasting_haiku_v2.passed}/${results.tasting_haiku_v2.total}) — ${costStr(results.tasting_haiku_v2.costs, 'claude-haiku-4-5-20251001')}`);
  console.log(`    Haiku v3 (examples):${results.tasting_haiku_v3.pct}% (${results.tasting_haiku_v3.passed}/${results.tasting_haiku_v3.total}) — ${costStr(results.tasting_haiku_v3.costs, 'claude-haiku-4-5-20251001')}`);

  // Find best Haiku variant
  const haikuVariants = [
    { name: 'Default', r: results.tasting_haiku_default },
    { name: 'v1 (brevity)', r: results.tasting_haiku_v1 },
    { name: 'v2 (stronger)', r: results.tasting_haiku_v2 },
    { name: 'v3 (examples)', r: results.tasting_haiku_v3 },
  ];
  const bestHaiku = haikuVariants.sort((a, b) => b.r.pct - a.r.pct)[0];
  const qualDelta = bestHaiku.r.pct - results.tasting_sonnet.pct;
  console.log(`    >>> Best Haiku: ${bestHaiku.name} at ${bestHaiku.r.pct}% (delta: ${qualDelta >= 0 ? '+' : ''}${qualDelta}% vs Sonnet)`);

  console.log('\n  GENERAL CHAT:');
  console.log(`    Sonnet: ${results.chat_sonnet.pct}% (${results.chat_sonnet.passed}/${results.chat_sonnet.total}) — ${costStr(results.chat_sonnet.costs, 'claude-sonnet-4-6')}`);
  console.log(`    Haiku:  ${results.chat_haiku.pct}% (${results.chat_haiku.passed}/${results.chat_haiku.total}) — ${costStr(results.chat_haiku.costs, 'claude-haiku-4-5-20251001')}`);

  console.log('\n  PROFESSOR RUPHUS:');
  console.log(`    GPT-5.4:      ${results.ruphus_54.pct}% (${results.ruphus_54.passed}/${results.ruphus_54.total}) — ${costStr(results.ruphus_54.costs, 'gpt-5.4')}`);
  console.log(`    GPT-5.4 Mini: ${results.ruphus_mini.pct}% (${results.ruphus_mini.passed}/${results.ruphus_mini.total}) — ${costStr(results.ruphus_mini.costs, 'gpt-5.4-mini')}`);

  console.log('\n  VERDICT:');
  const verdicts = [
    { name: 'General Chat -> Haiku', delta: results.chat_haiku.pct - results.chat_sonnet.pct },
    { name: 'Ruphus -> Mini', delta: results.ruphus_mini.pct - results.ruphus_54.pct },
    { name: `Tasting -> Haiku (${bestHaiku.name})`, delta: qualDelta },
  ];

  for (const v of verdicts) {
    const status = v.delta >= -3 ? 'SHIP IT' : v.delta >= -10 ? 'REVIEW' : 'REJECT';
    console.log(`    ${v.name}: ${v.delta >= 0 ? '+' : ''}${v.delta}% — ${status}`);
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
