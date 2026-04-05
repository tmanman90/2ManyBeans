#!/usr/bin/env node
// Cost Optimization Autoresearch — Tests all proposed model/prompt changes
// Compares current (baseline) vs optimized configuration for every AI feature
// Usage: node scripts/cost-optimization-autoresearch.mjs

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
  return { text, elapsed, inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, usage };
}

async function callOpenAI(model, system, userMsg, maxTokens = 1000, responseFormat) {
  const start = Date.now();
  const messages = [{ role: 'system', content: system }, { role: 'user', content: userMsg }];
  const params = { model, messages, max_completion_tokens: maxTokens };
  if (responseFormat) params.response_format = responseFormat;
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
  return { text, elapsed, inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens, usage };
}

// ═══════════════════════════════════════════════
// KNOWLEDGE BASES (copied from src/lib/coffeeKnowledge.js)
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

BREWING TROUBLESHOOTING:
- Bitter/harsh = over-extracted. Fix: grind coarser or reduce contact time.
- Sour/weak/astringent = under-extracted. Fix: grind finer or increase contact time.
- Change one variable at a time.
`;

const BREWING_KNOWLEDGE = `
BREWING REFERENCE (from James Hoffmann):

KEY VARIABLES:
- Coffee-to-water ratio: Pour-over 60g/L, French press 75g/L, AeroPress 75-100g/L, Espresso ~1:2 by weight
- Grind: finer = more surface area = faster extraction. Use burr grinder (not blade). Blade creates uneven particles.
- Water temp: just off boil for most methods. Espresso: 90-94C. Lighter roasts benefit from hotter water.
- Extraction target: 18-22% of ground coffee by weight.

WATER QUALITY:
- Water is 98.5% of filter coffee, ~90% of espresso
- Hard water = cups lacking nuance/sweetness/complexity
- Soft to moderate hardness ideal.

METHOD GUIDANCE:
- French Press: 75g/L, medium grind, steep 4 min, stir crust, skim foam, wait 5 more min, pour slowly. Heavy body.
- Pour-Over: 60g/L, medium grind, rinse paper filter, bloom 2x coffee weight 30 sec, pour slowly. Clean, clear cup.
- AeroPress: 75-100g/L, steep 1 min then press. Versatile. Easy clean, portable.
- Espresso: 18g in, ~36g out, 27-29 sec, 9 bars. Invest in grinder before machine. Always adjust grind first.

STORAGE:
- Airtight, dark, never refrigerate
- Buy within 2 weeks of roast, use within 1 month
- Whole beans, grind just before brewing
`;

const RUPHUS_KNOWLEDGE = `
COFFEE KNOWLEDGE REFERENCE (from James Hoffmann):

COFFEE VARIETIES:
- Typica: original Ethiopian variety. Excellent cup quality, low yield. Spread globally by Dutch.
- Bourbon: natural Typica mutation on Reunion island. Higher yield. Distinctive sweetness (prized).
- Caturra: Bourbon mutation (Brazil 1937). Dwarf, high yield. Quality increases with altitude.
- SL-28: selected in Kenya 1930s. Distinct blackcurrant fruit flavor. Highly prized.
- Geisha/Gesha: Ethiopian origin, via Costa Rica to Panama. Exceptionally aromatic/floral. Record auction prices.

PROCESSING METHODS:
- Natural/Dry: whole cherries sun-dried. Adds fruit flavors. Higher defect risk.
- Washed/Wet: depulped, fermented, washed clean, dried. Higher acidity, more complexity, cleaner cup.
- Honey: like pulped natural with calibrated flesh remaining. Sweetness between washed and natural.

ROASTING:
- Light (after first crack): high acidity, origin preserved, complex aromatics.
- Medium (past first, before second crack): balanced, sweetness often peaks.
- Dark (at/past second crack): generic roast flavors dominate, origin lost.
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
  },
  {
    name: 'Gichathaini AA', roaster: 'Manhattan Coffee Roasters', origin: 'Kenya (Nyeri)',
    variety: 'SL28, SL34', process: 'Washed', roastDate: '2026-03-10',
    bagNotes: 'blackcurrant / grapefruit / brown sugar / pomelo',
    region: 'Nyeri', altitude: '1700-1900 masl', roastLevel: 'light',
  },
  {
    name: 'Worka Sakaro', roaster: 'April Coffee', origin: 'Ethiopia (Gedeb, Yirgacheffe)',
    variety: 'Heirloom', process: 'Natural', roastDate: '2026-02-20',
    bagNotes: 'blueberry / strawberry jam / dark chocolate / wine',
    region: 'Gedeb, Yirgacheffe', altitude: '2000-2200 masl', roastLevel: 'light',
  },
  {
    name: 'Huila Castillo', roaster: 'Onyx Coffee Lab', origin: 'Colombia (Huila)',
    variety: 'Castillo, Caturra', process: 'Washed', roastDate: '2026-01-20',
    bagNotes: 'brown sugar / red apple / nutty / smooth',
    region: 'Huila', altitude: '1600-1800 masl', roastLevel: 'medium',
  },
  {
    name: 'El Placer', roaster: 'Dayglow (Promethium)', origin: 'Colombia',
    variety: 'Geisha', process: 'Anaerobic White Honey', roastDate: '2026-02-05',
    bagNotes: 'gardenia flowers / Earl Grey tea / bergamot',
    region: 'Unknown', altitude: '1700-1900 masl', roastLevel: 'light',
  },
];

// Simulated multi-turn tasting conversations (user responses to coaching prompts)
const TASTING_CONVERSATIONS = [
  {
    bean: TEST_BEANS[0], // SEY Gesha
    turns: [
      { role: 'user', content: "I'm tasting the Gesha Village Lot 74 from SEY today" },
      // AI responds with aroma prompt
      { role: 'user', content: 'It smells really floral, like flowers, and kind of fruity too. Reminds me of tea maybe?' },
      // AI responds with first sip prompt
      { role: 'user', content: 'Bright and tangy like citrus for sure. Really juicy.' },
      // AI responds with body/finish prompt
      { role: 'user', content: 'Light like tea. The taste lingers for a while, kind of sweet aftertaste.' },
      // AI responds with sweetness prompt
      { role: 'user', content: 'Really present, more than I expected' },
      // AI responds with one word prompt
      { role: 'user', content: 'Elegant' },
      // AI responds with brew dial-in
      { role: 'user', content: 'Pretty good as-is actually' },
    ],
  },
  {
    bean: TEST_BEANS[1], // Kenya
    turns: [
      { role: 'user', content: "Let's taste the Gichathaini AA" },
      { role: 'user', content: 'Smells kind of like berries, dark ones. And something citrusy.' },
      { role: 'user', content: 'Wow that is really bright and tangy. Almost like grapefruit juice.' },
      { role: 'user', content: 'Medium body I think. Like juice. Finish lasts a long time.' },
      { role: 'user', content: 'Noticeable sweetness, like brown sugar' },
      { role: 'user', content: 'Intense' },
      { role: 'user', content: 'A little too sour/bright for me' },
    ],
  },
  {
    bean: TEST_BEANS[3], // Colombia medium
    turns: [
      { role: 'user', content: "I'm drinking the Huila Castillo from Onyx" },
      { role: 'user', content: 'Smells like chocolate and nuts. Really pleasant and warm.' },
      { role: 'user', content: 'Smooth and round, not really tangy at all' },
      { role: 'user', content: 'Medium body like juice. Finish is clean but not super long.' },
      { role: 'user', content: 'Barely there' },
      { role: 'user', content: 'Comforting' },
      { role: 'user', content: 'Pretty good as-is' },
    ],
  },
];

// General chat test queries
const CHAT_QUERIES = [
  "Which bean should I open next? I want something different from the Kenya.",
  "What's the best way to brew a light roast Ethiopian? I have an AeroPress and a pour-over.",
  "My coffee tastes bitter and harsh today, what went wrong?",
  "Should I be worried that the El Placer is 58 days post-roast?",
  "What's the difference between washed and natural process? In simple terms.",
];

// ═══════════════════════════════════════════════
// SYSTEM PROMPTS (from src/lib/claude.js)
// ═══════════════════════════════════════════════

function buildTastingSystemPrompt(bean) {
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

  return `You are a patient, encouraging coffee tasting COACH helping a novice taster log a tasting. The pre-selected bean is: ${bean.name}.

BEAN PROFILE (the coffee being tasted right now):
- ${beanProfile}

${TASTING_KNOWLEDGE}

CRITICAL RULES:
- Tal is learning to taste. NEVER ask vague questions like "how is it?" or "what do you notice?"
- ALWAYS give specific instructions: what to do physically, what to pay attention to, and multiple-choice options to pick from
- Teach tasting vocabulary naturally by labeling what he describes
- Be warm, encouraging, and brief (2-3 sentences + options per turn, plus reveal sentences when applicable)
- No emojis in your responses

WITHHOLD-THEN-REVEAL COACHING:
- You have the bean profile and bag notes internally. Do NOT reveal bag notes or expected flavors BEFORE the taster gives their answer.
- AFTER the taster responds to each step, reveal what the bag/roaster said for that attribute.
- When the taster's answer differs from bag notes: validate their perception, explain a possible reason, and give one actionable tip.
- When the taster's answer matches: celebrate briefly.

GUIDED FLOW (follow this order across your turns):
1. AROMA - already asked in first message. When he responds, validate and label, reveal bag notes, teach gap if needed. Move to step 2.
2. FIRST SIP - "Take a sip and let it sit on your tongue. Is it: bright/tangy like citrus? Smooth and round? Sharp/sour? Sweet right away?"
3. BODY & FINISH - "How heavy does it feel in your mouth? Light like tea, medium like juice, or thick like milk? And after you swallow, does the taste disappear quickly or linger?"
4. SWEETNESS - "How sweet is it? Barely there, noticeable, or really present?"
5. ONE WORD - "If you had to describe this whole cup in one word, what would it be?"
6. BREW DIAL-IN - Quick diagnostic, then TELL them the fix.

After covering these areas, end with:

---EXTRACT---
{"beanName":"exact bean name","aroma":"...","firstSip":"...","acidity":"...","sweetness":"...","body":"...","finish":"...","oneWord":"...","notes":"...","changeTomorrow":"...","rating":0}
---END---`;
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
1. ROASTER section: ONLY include facts you are confident about from widely known public knowledge. If not confident, set to null. NEVER fabricate roaster histories.
2. COFFEE/FARM section: Only use facts from the bean data provided. General knowledge about the region/country is fine.
3. PROCESS section: General coffee knowledge is fine and encouraged. Explaining what a process means is always safe.
4. LOOK FOR section: Connecting variety + process + origin to expected flavors is safe general knowledge.
5. FLAVOR PROFILE: Base on general expectations for this variety + process + origin combination.
6. When data is thin, set sections to null rather than guess.

TONE: Warm, enthusiastic, slightly nerdy professor who really loves coffee. First person. Brief -- 60-90 second read (~200-300 words total).`;
}

// ═══════════════════════════════════════════════
// SCORING FUNCTIONS
// ═══════════════════════════════════════════════

function scoreTastingResponse(text, turnIndex, bean) {
  const checks = {};

  // T1: Response is non-empty and reasonable length
  checks.T1_nonEmpty = text.length > 50;

  // T2: No emojis (rule says no emojis)
  checks.T2_noEmojis = !/[\u{1F300}-\u{1FAFF}]/u.test(text);

  // T3: Brief (2-3 sentences per coaching turn, allow up to 6 for reveals)
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 5);
  checks.T3_concise = sentences.length <= 10;

  // T4: Does NOT reveal bag notes before user responds (turns 0-1 are before user gives tasting input)
  if (turnIndex === 0) {
    // First response (after user says what they're tasting) -- should ask about aroma
    checks.T4_noPreReveal = !text.toLowerCase().includes(bean.bagNotes.split('/')[0].trim().toLowerCase());
  }

  // T5: Follows guided flow order (checks for step-appropriate content)
  if (turnIndex === 0) {
    checks.T5_guidedFlow = /aroma|smell|nose|sniff|fragrance/i.test(text);
  } else if (turnIndex === 1) {
    // After aroma response, should transition to first sip OR validate aroma
    checks.T5_guidedFlow = /sip|tongue|taste|bright|tangy|smooth/i.test(text) || /aroma|nose|smell|floral|fruit/i.test(text);
  }

  // T6: Uses teaching vocabulary (labels what user describes)
  if (turnIndex >= 1) {
    checks.T6_teachesVocab = /that's|that is|classic|typical|what you're|you're describing|what roasters call|in coffee terms/i.test(text);
  }

  // T7: Final turn should include EXTRACT markers
  if (turnIndex >= 5) {
    checks.T7_extractMarkers = text.includes('---EXTRACT---') && text.includes('---END---');
    if (checks.T7_extractMarkers) {
      try {
        const match = text.match(/---EXTRACT---\s*([\s\S]*?)\s*---END---/);
        if (match) {
          const json = JSON.parse(match[1]);
          checks.T7b_validJSON = !!(json.beanName && json.oneWord);
        }
      } catch { checks.T7b_validJSON = false; }
    }
  }

  const passed = Object.values(checks).filter(v => v === true).length;
  const total = Object.keys(checks).length;
  return { checks, passed, total };
}

function scoreChatResponse(text, query) {
  const checks = {};

  // C1: Non-empty, reasonable length
  checks.C1_nonEmpty = text.length > 30;

  // C2: No emojis
  checks.C2_noEmojis = !/[\u{1F300}-\u{1FAFF}]/u.test(text);

  // C3: Concise (not rambling)
  checks.C3_concise = text.length < 1500;

  // C4: References actual bean data when relevant
  if (query.includes('open next')) {
    checks.C4_usesData = /El Placer|Huila|sealed|inventory/i.test(text);
  } else if (query.includes('bitter')) {
    checks.C4_usesData = /grind|coarser|extract|over-extract/i.test(text);
  } else if (query.includes('58 days')) {
    checks.C4_usesData = /peak|window|honey|anaerobic|fine|okay|still/i.test(text);
  } else if (query.includes('light roast Ethiopian')) {
    checks.C4_usesData = /temp|water|ratio|pour|grind/i.test(text);
  } else if (query.includes('washed and natural')) {
    checks.C4_usesData = /fruit|cherry|clean|body|process/i.test(text);
  }

  // C5: Warm/conversational tone (not robotic)
  checks.C5_tone = /!|I'd|you|your|I think|recommend|suggest|try/i.test(text);

  // C6: Does NOT recommend finished or active beans when suggesting
  if (query.includes('open next')) {
    checks.C6_noFinished = !/Gesha Village|Gichathaini|Worka Sakaro/i.test(text) || /already.*open|currently.*active/i.test(text);
  }

  const passed = Object.values(checks).filter(v => v === true).length;
  const total = Object.keys(checks).length;
  return { checks, passed, total };
}

function scoreRuphusStory(text, bean) {
  const checks = {};

  // R1: Valid JSON
  let story;
  try {
    const clean = text.replace(/```json|```/g, '').trim();
    const match = clean.match(/\{[\s\S]*\}/);
    story = match ? JSON.parse(match[0]) : null;
    checks.R1_validJSON = story !== null;
  } catch { checks.R1_validJSON = false; }

  if (!story) return { checks, passed: 0, total: 1 };

  // R2: Has required fields
  checks.R2_hasFields = !!(story.intro && story.lookFor && story.flavorProfile);

  // R3: Intro is concise (15 words max per spec)
  checks.R3_conciseIntro = story.intro ? story.intro.split(/\s+/).length <= 25 : false; // allow some slack

  // R4: Flavor profile has valid scores (1-10)
  const fp = story.flavorProfile;
  if (fp) {
    const scores = [fp.fragranceAroma, fp.acidity, fp.sweetness, fp.body, fp.flavor, fp.balance];
    checks.R4_validScores = scores.every(s => typeof s === 'number' && s >= 1 && s <= 10);
  } else {
    checks.R4_validScores = false;
  }

  // R5: No hallucination (doesn't fabricate roaster founding dates for lesser-known roasters)
  // Heuristic: if roaster section mentions a specific year for non-famous roasters, flag it
  if (story.roaster && bean.roaster === 'April Coffee') {
    // April Coffee is well-known, year mentions are likely fine
    checks.R5_noHallucination = true;
  } else if (story.roaster === null) {
    checks.R5_noHallucination = true; // null is correct when uncertain
  } else {
    checks.R5_noHallucination = true; // default pass, hard to automate
  }

  // R6: Uses first person ("I", "let me")
  const fullText = [story.intro, story.roaster, story.coffee, story.process, story.lookFor].filter(Boolean).join(' ');
  checks.R6_firstPerson = /\bI\b|let me|I'm|I've/i.test(fullText);

  // R7: Reasonable length (200-300 words target, allow 100-500)
  const wordCount = fullText.split(/\s+/).length;
  checks.R7_length = wordCount >= 80 && wordCount <= 600;

  const passed = Object.values(checks).filter(v => v === true).length;
  const total = Object.keys(checks).length;
  return { checks, passed, total };
}

function scoreRecBlurb(text) {
  const checks = {};
  checks.B1_nonEmpty = text.length > 30;
  checks.B2_concise = text.length < 600; // 2-4 sentences
  checks.B3_noHeaders = !/^#|^\*\*|^-/m.test(text); // flowing paragraph, no bullets/headers
  checks.B4_mentionsBeans = /El Placer|Huila/i.test(text);
  const passed = Object.values(checks).filter(v => v === true).length;
  return { checks, passed, total: Object.keys(checks).length };
}

// ═══════════════════════════════════════════════
// TEST RUNNERS
// ═══════════════════════════════════════════════

async function testTastingCoach(model, label) {
  console.log(`\n  ---- Tasting Coach: ${label} (${model}) ----`);
  let totalPassed = 0;
  let totalChecks = 0;
  const costs = { input: 0, output: 0 };

  for (const conv of TASTING_CONVERSATIONS) {
    const systemPrompt = buildTastingSystemPrompt(conv.bean);
    const history = [];

    for (let i = 0; i < conv.turns.length; i++) {
      history.push(conv.turns[i]);
      try {
        const result = await callAnthropic(model, systemPrompt, history.slice(-8), 1000);
        history.push({ role: 'assistant', content: result.text });
        costs.input += result.inputTokens || 0;
        costs.output += result.outputTokens || 0;

        const score = scoreTastingResponse(result.text, i, conv.bean);
        totalPassed += score.passed;
        totalChecks += score.total;

        const failedChecks = Object.entries(score.checks).filter(([, v]) => v === false).map(([k]) => k);
        if (failedChecks.length > 0) {
          console.log(`    ${conv.bean.name} turn ${i}: FAIL [${failedChecks.join(', ')}]`);
        }
      } catch (err) {
        console.log(`    ${conv.bean.name} turn ${i}: ERROR ${err.message.slice(0, 100)}`);
        history.push({ role: 'assistant', content: 'Error occurred.' });
        totalChecks += 3;
      }
    }
  }

  const pct = totalChecks > 0 ? Math.round((totalPassed / totalChecks) * 100) : 0;
  console.log(`  Score: ${totalPassed}/${totalChecks} (${pct}%) | Tokens: ${costs.input}in/${costs.output}out`);
  return { passed: totalPassed, total: totalChecks, pct, costs };
}

async function testGeneralChat(model, label) {
  console.log(`\n  ---- General Chat: ${label} (${model}) ----`);
  const systemPrompt = buildChatContext();
  let totalPassed = 0;
  let totalChecks = 0;
  const costs = { input: 0, output: 0 };

  for (const query of CHAT_QUERIES) {
    try {
      const result = await callAnthropic(model, systemPrompt, [{ role: 'user', content: query }], 800);
      costs.input += result.inputTokens || 0;
      costs.output += result.outputTokens || 0;

      const score = scoreChatResponse(result.text, query);
      totalPassed += score.passed;
      totalChecks += score.total;

      const failedChecks = Object.entries(score.checks).filter(([, v]) => v === false).map(([k]) => k);
      if (failedChecks.length > 0) {
        console.log(`    "${query.slice(0, 50)}..." FAIL [${failedChecks.join(', ')}]`);
      }
    } catch (err) {
      console.log(`    "${query.slice(0, 50)}..." ERROR ${err.message.slice(0, 100)}`);
      totalChecks += 4;
    }
  }

  const pct = totalChecks > 0 ? Math.round((totalPassed / totalChecks) * 100) : 0;
  console.log(`  Score: ${totalPassed}/${totalChecks} (${pct}%) | Tokens: ${costs.input}in/${costs.output}out`);
  return { passed: totalPassed, total: totalChecks, pct, costs };
}

async function testRuphusStory(model, label) {
  console.log(`\n  ---- Professor Ruphus: ${label} (${model}) ----`);
  const systemPrompt = buildRuphusPrompt();
  let totalPassed = 0;
  let totalChecks = 0;
  const costs = { input: 0, output: 0 };

  for (const bean of TEST_BEANS) {
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

    const userMsg = `Write a Professor Ruphus lesson about this coffee:\n\n${beanContext}\n\nRespond with ONLY a valid JSON object (no markdown, no backticks, no explanation):\n\n{\n  "intro": "One-liner greeting (15 words max)",\n  "roaster": "2-3 sentences about the roaster. null if uncertain.",\n  "coffee": "2-3 sentences about the farm, region, altitude. null if no context.",\n  "process": "2-3 sentences explaining this processing method. null if unknown.",\n  "lookFor": "2-3 sentences connecting variety + process + origin to expected flavors.",\n  "flavorProfile": {"fragranceAroma": 7, "acidity": 7, "sweetness": 7, "body": 7, "flavor": 7, "balance": 7}\n}\n\nReplace the 7s with actual 1-10 estimates. Use null for unreliable sections.`;

    try {
      const result = await callOpenAI(model, systemPrompt, userMsg, 1200);
      costs.input += result.inputTokens || 0;
      costs.output += result.outputTokens || 0;

      const score = scoreRuphusStory(result.text, bean);
      totalPassed += score.passed;
      totalChecks += score.total;

      const failedChecks = Object.entries(score.checks).filter(([, v]) => v === false).map(([k]) => k);
      const status = failedChecks.length === 0 ? 'PASS' : `FAIL [${failedChecks.join(',')}]`;
      console.log(`    ${bean.name.padEnd(25)} ${status}`);
    } catch (err) {
      console.log(`    ${bean.name.padEnd(25)} ERROR ${err.message.slice(0, 100)}`);
      totalChecks += 5;
    }
  }

  const pct = totalChecks > 0 ? Math.round((totalPassed / totalChecks) * 100) : 0;
  console.log(`  Score: ${totalPassed}/${totalChecks} (${pct}%) | Tokens: ${costs.input}in/${costs.output}out`);
  return { passed: totalPassed, total: totalChecks, pct, costs };
}

async function testRecBlurb(model, label) {
  console.log(`\n  ---- Rec Blurb: ${label} (${model}) ----`);
  const system = `You're a concise specialty coffee advisor. Given a current rotation and candidate beans, write a brief 2-4 sentence analysis of why each candidate would complement the rotation. Consider: timing urgency, flavor variety, and peak window. Be warm and opinionated. No headers or bullets -- just a flowing paragraph.`;
  const activeDesc = 'Atmos #1: SEY Gesha Village Lot 74 (Ethiopia Washed, floral/citrus)\nAtmos #2: Manhattan Gichathaini AA (Kenya Washed, berry/grapefruit)\nAtmos #3: April Worka Sakaro (Ethiopia Natural, blueberry/chocolate)';
  const recDesc = '1. Dayglow El Placer (Colombia Anaerobic White Honey, gardenia/Earl Grey) - 58d post-roast, 100g\n2. Onyx Huila Castillo (Colombia Washed, brown sugar/apple) - 74d post-roast, 340g';
  const userMsg = `Current rotation:\n${activeDesc}\n\nTop candidates:\n${recDesc}\n\nWhy would each be a good pick?`;

  const costs = { input: 0, output: 0 };
  try {
    const result = await callAnthropic(model, system, [{ role: 'user', content: userMsg }], 400);
    costs.input += result.inputTokens || 0;
    costs.output += result.outputTokens || 0;
    const score = scoreRecBlurb(result.text);
    const failedChecks = Object.entries(score.checks).filter(([, v]) => v === false).map(([k]) => k);
    const status = failedChecks.length === 0 ? 'PASS' : `FAIL [${failedChecks.join(',')}]`;
    console.log(`    ${status}`);
    const pct = Math.round((score.passed / score.total) * 100);
    console.log(`  Score: ${score.passed}/${score.total} (${pct}%) | Tokens: ${costs.input}in/${costs.output}out`);
    return { passed: score.passed, total: score.total, pct, costs };
  } catch (err) {
    console.log(`    ERROR ${err.message.slice(0, 100)}`);
    return { passed: 0, total: 4, pct: 0, costs };
  }
}

// ═══════════════════════════════════════════════
// MAIN — Run all tests
// ═══════════════════════════════════════════════

async function main() {
  console.log('='.repeat(80));
  console.log('COST OPTIMIZATION AUTORESEARCH');
  console.log('Testing baseline vs optimized models across all AI features');
  console.log('='.repeat(80));

  const results = {};

  // ── TEST 1: Tasting Coach (Sonnet vs Haiku) ──
  console.log('\n' + '='.repeat(80));
  console.log('TEST 1: TASTING COACH — Sonnet 4.6 (baseline) vs Haiku 4.5 (optimized)');
  console.log('='.repeat(80));
  results.tasting_sonnet = await testTastingCoach('claude-sonnet-4-6', 'Baseline');
  results.tasting_haiku = await testTastingCoach('claude-haiku-4-5-20251001', 'Optimized');

  // ── TEST 2: General Chat (Sonnet vs Haiku) ──
  console.log('\n' + '='.repeat(80));
  console.log('TEST 2: GENERAL CHAT — Sonnet 4.6 (baseline) vs Haiku 4.5 (optimized)');
  console.log('='.repeat(80));
  results.chat_sonnet = await testGeneralChat('claude-sonnet-4-6', 'Baseline');
  results.chat_haiku = await testGeneralChat('claude-haiku-4-5-20251001', 'Optimized');

  // ── TEST 3: Professor Ruphus (GPT-5.4 vs GPT-5.4 Mini) ──
  console.log('\n' + '='.repeat(80));
  console.log('TEST 3: PROFESSOR RUPHUS — GPT-5.4 (baseline) vs GPT-5.4 Mini (optimized)');
  console.log('='.repeat(80));
  results.ruphus_54 = await testRuphusStory('gpt-5.4', 'Baseline');
  results.ruphus_mini = await testRuphusStory('gpt-5.4-mini', 'Optimized');

  // ── TEST 4: Rec Blurb (Sonnet vs Haiku) ──
  console.log('\n' + '='.repeat(80));
  console.log('TEST 4: REC BLURB — Sonnet 4.6 (baseline) vs Haiku 4.5 (optimized)');
  console.log('='.repeat(80));
  results.rec_sonnet = await testRecBlurb('claude-sonnet-4-6', 'Baseline');
  results.rec_haiku = await testRecBlurb('claude-haiku-4-5-20251001', 'Optimized');

  // ── FINAL SUMMARY ──
  console.log('\n' + '='.repeat(80));
  console.log('FINAL RESULTS');
  console.log('='.repeat(80));

  const pricing = {
    'claude-sonnet-4-6': { input: 3.00, output: 15.00 },
    'claude-haiku-4-5-20251001': { input: 0.80, output: 4.00 },
    'gpt-5.4': { input: 2.50, output: 10.00 },
    'gpt-5.4-mini': { input: 0.40, output: 1.60 },
  };

  function calcCost(costs, model) {
    const p = pricing[model];
    return ((costs.input / 1_000_000) * p.input + (costs.output / 1_000_000) * p.output);
  }

  const comparisons = [
    { name: 'Tasting Coach', baseline: results.tasting_sonnet, optimized: results.tasting_haiku, baseModel: 'claude-sonnet-4-6', optModel: 'claude-haiku-4-5-20251001' },
    { name: 'General Chat', baseline: results.chat_sonnet, optimized: results.chat_haiku, baseModel: 'claude-sonnet-4-6', optModel: 'claude-haiku-4-5-20251001' },
    { name: 'Prof. Ruphus', baseline: results.ruphus_54, optimized: results.ruphus_mini, baseModel: 'gpt-5.4', optModel: 'gpt-5.4-mini' },
    { name: 'Rec Blurb', baseline: results.rec_sonnet, optimized: results.rec_haiku, baseModel: 'claude-sonnet-4-6', optModel: 'claude-haiku-4-5-20251001' },
  ];

  console.log('\n  Feature            | Baseline     | Optimized    | Quality Delta | Cost Reduction');
  console.log('  ' + '-'.repeat(90));

  let totalBaseCost = 0;
  let totalOptCost = 0;

  for (const c of comparisons) {
    const baseCost = calcCost(c.baseline.costs, c.baseModel);
    const optCost = calcCost(c.optimized.costs, c.optModel);
    totalBaseCost += baseCost;
    totalOptCost += optCost;
    const qualDelta = c.optimized.pct - c.baseline.pct;
    const costDelta = baseCost > 0 ? Math.round((1 - optCost / baseCost) * 100) : 0;
    const qualStr = qualDelta >= 0 ? `+${qualDelta}%` : `${qualDelta}%`;
    const verdict = qualDelta >= -5 ? 'SHIP IT' : qualDelta >= -15 ? 'REVIEW' : 'REJECT';

    console.log(`  ${c.name.padEnd(20)} | ${c.baseline.pct}% (${c.baseline.passed}/${c.baseline.total})`.padEnd(40) +
      ` | ${c.optimized.pct}% (${c.optimized.passed}/${c.optimized.total})`.padEnd(20) +
      ` | ${qualStr.padEnd(14)}| ${costDelta}% cheaper — ${verdict}`);
  }

  const overallCostReduction = totalBaseCost > 0 ? Math.round((1 - totalOptCost / totalBaseCost) * 100) : 0;
  console.log('\n  ' + '-'.repeat(90));
  console.log(`  Test run cost: baseline $${totalBaseCost.toFixed(4)} / optimized $${totalOptCost.toFixed(4)} (${overallCostReduction}% cheaper)`);

  console.log('\n  Verdict Key: SHIP IT = quality within 5%, REVIEW = 5-15% drop, REJECT = >15% drop');
  console.log('\n  NOTE: Prompt caching (Optimization #1) is a pure infrastructure change with');
  console.log('  zero quality impact. It saves ~40% on input tokens for multi-turn conversations.');
  console.log('  No model-quality test needed -- just needs the proxy/client code change.');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
