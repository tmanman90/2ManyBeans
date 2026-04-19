#!/usr/bin/env node
// Share Card Autoresearch — Karpathy method for visual design iteration
// Screenshots each card variant via Playwright, scores with Gemini 2.5 Flash vision
// Usage: node scripts/share-card-autoresearch.mjs [--url http://localhost:5173]
//
// Prerequisites:
//   - Vite dev server running (npm run dev)
//   - GEMINI_API_KEY in .env.local
//   - npx playwright install chromium (one-time)

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { GoogleGenerativeAI } from '@google/generative-ai';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// Load env
const envPath = resolve(ROOT, '.env.local');
const envContent = readFileSync(envPath, 'utf8');
const env = {};
for (const line of envContent.split('\n')) {
  const match = line.match(/^([A-Z_]+)=(.*)$/);
  if (match) env[match[1]] = match[2].replace(/^"|"$/g, '');
}

const GEMINI_KEY = env.GEMINI_API_KEY;
if (!GEMINI_KEY) { console.error('Missing GEMINI_API_KEY in .env.local'); process.exit(1); }

const BASE_URL = process.argv.includes('--url')
  ? process.argv[process.argv.indexOf('--url') + 1]
  : 'http://localhost:5173';

const CARD_IDS = ['full', 'minimal', 'longname'];
const OUTPUT_DIR = resolve(ROOT, 'scripts', 'share-card-scores');

const SCORING_PROMPT = `You are evaluating a coffee app share card design. The card shows a brew recipe overlaid on an illustrated chalkboard background with a dog character (Ruphus) below.

Score this share card image. Answer YES or NO for each criterion, then provide a brief explanation:

1. LEGIBILITY: Can you read ALL text clearly against the chalkboard background? (white chalk-style text should be crisp and easy to read)
2. BOUNDS: Is all text within the chalkboard area? (no text overlapping the wooden frame, shelves, Ruphus, or counter)
3. HIERARCHY: Is the bean name the most prominent text, with recipe params secondary?
4. SPACING: Is there adequate spacing between text elements? (no cramping, no excessive gaps)
5. BALANCE: Does the overall composition look intentional and aesthetically pleasing?

For any NO answer, suggest a SPECIFIC CSS fix. Be precise with pixel values. Examples:
- "Increase bean name font size from 28px to 32px"
- "Move text zone top from 50px to 40px"
- "Reduce gap between params from 12px to 8px"
- "Increase left/right padding from 55px to 65px"

Respond in this exact format (plain text, NOT JSON):

LEGIBILITY: YES/NO - brief explanation
BOUNDS: YES/NO - brief explanation
HIERARCHY: YES/NO - brief explanation
SPACING: YES/NO - brief explanation
BALANCE: YES/NO - brief explanation
SCORE: N/5
SUGGESTIONS:
- specific fix 1
- specific fix 2`;

async function scoreImage(genAI, imageBase64) {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { maxOutputTokens: 4000 },
  });

  const result = await model.generateContent({
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType: 'image/png', data: imageBase64 } },
        { text: SCORING_PROMPT },
      ],
    }],
  });

  const text = result.response.text();

  // Parse plain text response
  const parseCriterion = (name) => {
    const re = new RegExp(`${name}:\\s*(YES|NO)\\s*[-:]?\\s*(.*)`, 'i');
    const m = text.match(re);
    return m ? { pass: m[1].toUpperCase() === 'YES', note: m[2].trim() } : { pass: false, note: 'not found' };
  };

  const legibility = parseCriterion('LEGIBILITY');
  const bounds = parseCriterion('BOUNDS');
  const hierarchy = parseCriterion('HIERARCHY');
  const spacing = parseCriterion('SPACING');
  const balance = parseCriterion('BALANCE');

  const scoreMatch = text.match(/SCORE:\s*(\d)\/5/i);
  const score = scoreMatch ? `${scoreMatch[1]}/5` : '0/5';

  // Extract suggestions (lines starting with -)
  const suggestions = [];
  const sugSection = text.split(/SUGGESTIONS?:/i)[1];
  if (sugSection) {
    for (const line of sugSection.split('\n')) {
      const trimmed = line.replace(/^[\s-]+/, '').trim();
      if (trimmed && !trimmed.startsWith('SCORE') && !trimmed.startsWith('LEGIB')) {
        suggestions.push(trimmed);
      }
    }
  }

  return { legibility, bounds, hierarchy, spacing, balance, score, suggestions, raw: text };
}

async function main() {
  console.log('\n=== Share Card Autoresearch ===\n');

  mkdirSync(OUTPUT_DIR, { recursive: true });

  // Launch browser
  console.log('Launching Playwright...');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1200 } });

  // Navigate to test page
  const testUrl = `${BASE_URL}/#/test-share-card`;
  console.log(`Navigating to ${testUrl}`);
  await page.goto(testUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000); // Wait for fonts + images

  // Init Gemini
  const genAI = new GoogleGenerativeAI(GEMINI_KEY);

  const results = {};
  let allPass = true;

  for (const cardId of CARD_IDS) {
    console.log(`\nScoring "${cardId}" card...`);

    // Screenshot just this card element
    const cardEl = page.locator(`[data-card-id="${cardId}"]`);
    const screenshotPath = resolve(OUTPUT_DIR, `${cardId}.png`);
    await cardEl.screenshot({ path: screenshotPath });

    // Read as base64 for Gemini
    const imageBase64 = readFileSync(screenshotPath).toString('base64');

    // Score with Gemini
    const score = await scoreImage(genAI, imageBase64);
    results[cardId] = score;

    const passed = score.score === '5/5';
    if (!passed) allPass = false;

    console.log(`  Score: ${score.score}`);
    if (score.legibility) console.log(`  Legibility: ${score.legibility.pass ? 'YES' : 'NO'} — ${score.legibility.note || ''}`);
    if (score.bounds) console.log(`  Bounds: ${score.bounds.pass ? 'YES' : 'NO'} — ${score.bounds.note || ''}`);
    if (score.hierarchy) console.log(`  Hierarchy: ${score.hierarchy.pass ? 'YES' : 'NO'} — ${score.hierarchy.note || ''}`);
    if (score.spacing) console.log(`  Spacing: ${score.spacing.pass ? 'YES' : 'NO'} — ${score.spacing.note || ''}`);
    if (score.balance) console.log(`  Balance: ${score.balance.pass ? 'YES' : 'NO'} — ${score.balance.note || ''}`);

    if (score.suggestions?.length) {
      console.log(`  Suggestions:`);
      score.suggestions.forEach(s => console.log(`    - ${s}`));
    }
  }

  // Save full results
  const resultsPath = resolve(OUTPUT_DIR, `results-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to: ${resultsPath}`);

  // Summary
  console.log('\n=== Summary ===');
  console.log(`All pass: ${allPass ? 'YES' : 'NO'}`);
  for (const [id, score] of Object.entries(results)) {
    console.log(`  ${id}: ${score.score}`);
  }

  if (!allPass) {
    console.log('\n=== Aggregated Suggestions ===');
    const allSuggestions = new Set();
    for (const score of Object.values(results)) {
      (score.suggestions || []).forEach(s => allSuggestions.add(s));
    }
    allSuggestions.forEach(s => console.log(`  - ${s}`));
  }

  await browser.close();
  console.log('\nDone.\n');
  process.exit(allPass ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
