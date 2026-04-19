#!/usr/bin/env node
// Bean Scan Autoresearch — Karpathy method for prompt optimization
// Iterates on the scan prompt, scores against ground truth, retains/reverts.
//
// Usage:
//   node scripts/bean-scan-autoresearch.mjs --baseline    # Run baseline, generate ground truth
//   node scripts/bean-scan-autoresearch.mjs               # Run autonomous loop (after baseline)
//   node scripts/bean-scan-autoresearch.mjs --rounds 10   # Run N rounds then stop
//
// Prerequisites:
//   - GEMINI_API_KEY in .env.local
//   - Test photos in /Users/talmeltzer/Downloads/Bean Folder/

import { readFileSync, writeFileSync, readdirSync, existsSync, appendFileSync } from 'fs';
import { resolve, dirname, extname } from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// --- Config ---
const PHOTO_DIR = '/Users/talmeltzer/Downloads/Bean Folder';
const PROMPT_FILE = resolve(ROOT, 'scripts', 'bean-scan-prompt.txt');
const BASELINE_FILE = resolve(ROOT, 'scripts', 'bean-scan-prompt.baseline.txt');
const GROUND_TRUTH_FILE = resolve(ROOT, 'scripts', 'bean-scan-ground-truth.json');
const RESULTS_FILE = resolve(ROOT, 'scripts', 'bean-scan-results.tsv');
const MAX_TOKENS = 2500;

// --- Load env ---
const envPath = resolve(ROOT, '.env.local');
const envContent = readFileSync(envPath, 'utf8');
const env = {};
for (const line of envContent.split('\n')) {
  const match = line.match(/^([A-Z_]+)=(.*)$/);
  if (match) env[match[1]] = match[2].replace(/^"|"$/g, '');
}

const GEMINI_KEY = env.GEMINI_API_KEY;
if (!GEMINI_KEY) { console.error('Missing GEMINI_API_KEY in .env.local'); process.exit(1); }

const genAI = new GoogleGenerativeAI(GEMINI_KEY);

// --- Load test photos ---
function loadPhotos() {
  const files = readdirSync(PHOTO_DIR)
    .filter(f => /\.(jpe?g|png|webp|heic)$/i.test(f))
    .sort();

  if (files.length === 0) {
    console.error(`No photos found in ${PHOTO_DIR}`);
    process.exit(1);
  }

  return files.map(f => {
    const path = resolve(PHOTO_DIR, f);
    const data = readFileSync(path);
    const ext = extname(f).toLowerCase();
    const mimeType = ext === '.png' ? 'image/png'
      : ext === '.webp' ? 'image/webp'
      : 'image/jpeg';
    return { name: f, base64: data.toString('base64'), mimeType };
  });
}

// --- Run scan prompt against one photo ---
async function scanPhoto(prompt, photo) {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { maxOutputTokens: MAX_TOKENS },
  });

  const finalPrompt = prompt.replace('{{PHOTO_COUNT}}', '1');

  const result = await model.generateContent({
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType: photo.mimeType, data: photo.base64 } },
        { text: finalPrompt },
      ],
    }],
  });

  const text = result.response.text();
  return text;
}

// --- Parse JSON from response ---
function parseResponse(text) {
  const clean = text.replace(/```json|```/g, '').trim();
  const match = clean.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

// --- Fuzzy string match (case-insensitive, trims, handles partial containment) ---
function fuzzyMatch(a, b) {
  if (!a || !b) return false;
  const na = a.toLowerCase().trim();
  const nb = b.toLowerCase().trim();
  if (na === nb) return true;
  // One contains the other (handles "Dayglow (Promethium)" matching "Promethium")
  if (na.includes(nb) || nb.includes(na)) return true;
  return false;
}

// --- Score one result against ground truth ---
function scoreOne(parsed, rawText, truth, baselineAvgLen) {
  const checks = {};

  // 1. VALID_JSON
  checks.VALID_JSON = parsed !== null;

  if (!parsed) {
    checks.ROASTER_MATCH = false;
    checks.NAME_MATCH = false;
    checks.ORIGIN_MATCH = false;
    checks.FIELD_COVERAGE = false;
    checks.TOKEN_EFFICIENT = false;
    return checks;
  }

  // 2. ROASTER_MATCH
  checks.ROASTER_MATCH = fuzzyMatch(parsed.roaster, truth.roaster);

  // 3. NAME_MATCH
  checks.NAME_MATCH = fuzzyMatch(parsed.name, truth.name);

  // 4. ORIGIN_MATCH
  checks.ORIGIN_MATCH = fuzzyMatch(parsed.origin, truth.origin);

  // 5. FIELD_COVERAGE (non-empty fields >= ground truth count)
  const countFields = (obj) => Object.values(obj).filter(v => v !== '' && v !== null && v !== undefined && v !== 0).length;
  checks.FIELD_COVERAGE = countFields(parsed) >= countFields(truth);

  // 6. TOKEN_EFFICIENT (response length < baseline avg * 1.2)
  checks.TOKEN_EFFICIENT = rawText.length < baselineAvgLen * 1.2;

  return checks;
}

// --- Compute total score across all photos ---
function computeScore(results, groundTruth, baselineAvgLen) {
  let yes = 0;
  let total = 0;
  const details = [];

  for (let i = 0; i < results.length; i++) {
    const { parsed, rawText, photo } = results[i];
    const truth = groundTruth[photo.name];
    if (!truth) continue; // skip if no ground truth for this photo

    const checks = scoreOne(parsed, rawText, truth, baselineAvgLen);
    const photoYes = Object.values(checks).filter(Boolean).length;
    yes += photoYes;
    total += Object.keys(checks).length;
    details.push({ photo: photo.name, checks, score: `${photoYes}/${Object.keys(checks).length}` });
  }

  return { yes, total, ratio: total > 0 ? yes / total : 0, details };
}

// --- Run all photos through the prompt ---
async function runAllPhotos(prompt, photos) {
  const results = [];
  for (const photo of photos) {
    try {
      const rawText = await scanPhoto(prompt, photo);
      const parsed = parseResponse(rawText);
      results.push({ photo, rawText, parsed });
    } catch (err) {
      console.log(`  CRASH on ${photo.name}: ${err.message}`);
      results.push({ photo, rawText: '', parsed: null, crash: true });
    }
  }
  return results;
}

// --- Ask Gemini to suggest ONE prompt change ---
async function suggestChange(currentPrompt, scoreDetails, round) {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { maxOutputTokens: 3000 },
  });

  const failureSummary = scoreDetails.details
    .map(d => {
      const fails = Object.entries(d.checks)
        .filter(([, v]) => !v)
        .map(([k]) => k);
      return fails.length > 0 ? `${d.photo}: FAILED ${fails.join(', ')}` : null;
    })
    .filter(Boolean)
    .join('\n');

  const result = await model.generateContent({
    contents: [{
      role: 'user',
      parts: [{ text: `You are making a SMALL, SURGICAL edit to a prompt that scans coffee bag labels.

CRITICAL CONSTRAINT: You must return the SAME prompt below with ONE small modification. Do NOT rewrite it from scratch. Do NOT drastically shorten it. The output must be recognizably the same document with a targeted edit. Think of it like a git diff with a few lines changed.

Examples of good changes:
- Remove one bullet point that seems redundant
- Simplify one sentence without removing its meaning
- Merge two similar instructions into one
- Remove one STEP section if its content is covered elsewhere
- Tighten wording in one paragraph (fewer words, same meaning)

Examples of BAD changes (DO NOT DO):
- Rewriting the entire prompt from scratch
- Reducing the prompt by more than 30%
- Removing the JSON schema
- Removing all the STEP sections at once

CURRENT PROMPT (${currentPrompt.length} chars):
---
${currentPrompt}
---

CURRENT SCORE: ${scoreDetails.yes}/${scoreDetails.total}
ROUND: ${round}

FAILURES THIS ROUND:
${failureSummary || 'None'}

ADDITIONAL RULES:
- The prompt must still produce valid JSON with these fields: roaster, name, origin, variety, process, roastDate, bagSize, bagNotes, producer, region, altitude, farm, roastLevel, cupScore, brewingRec, sourcedBy, shelfLife
- Keep the {{PHOTO_COUNT}} placeholder
- Keep the error response for blurry photos

Return the COMPLETE modified prompt. No explanation, no markdown wrapping, just the raw prompt text.` }],
    }],
  });

  return result.response.text().trim();
}

// --- Log to TSV ---
function logResult(round, score, tokenCount, status, description) {
  const line = `${round}\t${score}\t${tokenCount}\t${status}\t${description}\n`;
  appendFileSync(RESULTS_FILE, line);
}

// =============================================
// BASELINE MODE
// =============================================
async function runBaseline() {
  console.log('\n=== Bean Scan Autoresearch — BASELINE ===\n');

  const photos = loadPhotos();
  console.log(`Loaded ${photos.length} test photos from ${PHOTO_DIR}`);

  const prompt = readFileSync(PROMPT_FILE, 'utf8');
  console.log(`Prompt: ${prompt.length} chars\n`);

  console.log('Running baseline scan against all photos...\n');
  const results = await runAllPhotos(prompt, photos);

  // Build ground truth from baseline results
  const groundTruth = {};
  for (const { photo, parsed, rawText } of results) {
    if (parsed && !parsed.error) {
      groundTruth[photo.name] = parsed;
      console.log(`${photo.name}:`);
      console.log(`  Roaster: ${parsed.roaster || '(empty)'}`);
      console.log(`  Name: ${parsed.name || '(empty)'}`);
      console.log(`  Origin: ${parsed.origin || '(empty)'}`);
      console.log(`  Variety: ${parsed.variety || '(empty)'}`);
      console.log(`  Process: ${parsed.process || '(empty)'}`);
      console.log(`  Roast Date: ${parsed.roastDate || '(empty)'}`);
      console.log(`  Bag Size: ${parsed.bagSize || '(empty)'}`);
      console.log(`  Notes: ${parsed.bagNotes || '(empty)'}`);
      console.log(`  Producer: ${parsed.producer || '(empty)'}`);
      console.log(`  Region: ${parsed.region || '(empty)'}`);
      console.log(`  Response length: ${rawText.length} chars`);
      console.log();
    } else {
      console.log(`${photo.name}: FAILED TO PARSE`);
      if (parsed?.error) console.log(`  Error: ${parsed.error}`);
      console.log();
    }
  }

  // Save ground truth
  writeFileSync(GROUND_TRUTH_FILE, JSON.stringify(groundTruth, null, 2));
  console.log(`Ground truth saved to: ${GROUND_TRUTH_FILE}`);
  console.log('Review and correct the ground truth file before running the loop.\n');

  // Compute baseline average response length
  const avgLen = results.reduce((sum, r) => sum + r.rawText.length, 0) / results.length;
  console.log(`Baseline avg response length: ${Math.round(avgLen)} chars`);

  // Save baseline metadata
  const meta = { avgResponseLength: avgLen, photoCount: photos.length, promptLength: prompt.length };
  writeFileSync(resolve(ROOT, 'scripts', 'bean-scan-baseline-meta.json'), JSON.stringify(meta, null, 2));

  // Init results TSV
  writeFileSync(RESULTS_FILE, 'round\tscore\ttoken_count\tstatus\tdescription\n');

  // Compute and log baseline score (perfect since ground truth IS the baseline)
  const baselineScore = computeScore(results, groundTruth, avgLen);
  logResult(0, `${baselineScore.yes}/${baselineScore.total}`, prompt.length, 'keep', 'baseline');
  console.log(`Baseline score: ${baselineScore.yes}/${baselineScore.total}`);

  console.log('\n=== Baseline complete. Review ground truth, then run without --baseline ===\n');
}

// =============================================
// AUTONOMOUS LOOP
// =============================================
async function runLoop(maxRounds) {
  console.log('\n=== Bean Scan Autoresearch — LOOP ===\n');

  if (!existsSync(GROUND_TRUTH_FILE)) {
    console.error('No ground truth file. Run with --baseline first.');
    process.exit(1);
  }

  const photos = loadPhotos();
  const groundTruth = JSON.parse(readFileSync(GROUND_TRUTH_FILE, 'utf8'));
  const meta = JSON.parse(readFileSync(resolve(ROOT, 'scripts', 'bean-scan-baseline-meta.json'), 'utf8'));
  const baselineAvgLen = meta.avgResponseLength;

  console.log(`Loaded ${photos.length} photos, ${Object.keys(groundTruth).length} ground truth entries`);
  console.log(`Baseline avg response length: ${Math.round(baselineAvgLen)} chars`);
  console.log(`Max rounds: ${maxRounds === Infinity ? 'unlimited (Ctrl+C to stop)' : maxRounds}\n`);

  // Read current best prompt and score
  let bestPrompt = readFileSync(PROMPT_FILE, 'utf8');
  let bestResults = await runAllPhotos(bestPrompt, photos);
  let bestScore = computeScore(bestResults, groundTruth, baselineAvgLen);

  console.log(`Starting score: ${bestScore.yes}/${bestScore.total} (${bestPrompt.length} chars)\n`);

  let round = 1;
  while (round <= maxRounds) {
    console.log(`--- Round ${round} ---`);

    // Agent suggests ONE change
    console.log('  Asking Gemini for a prompt change...');
    let newPrompt;
    try {
      newPrompt = suggestChange(bestPrompt, bestScore, round);
      newPrompt = await newPrompt;
    } catch (err) {
      console.log(`  CRASH getting suggestion: ${err.message}`);
      logResult(round, `${bestScore.yes}/${bestScore.total}`, bestPrompt.length, 'crash', `suggestion failed: ${err.message}`);
      round++;
      continue;
    }

    // Validate the new prompt has the required placeholder
    if (!newPrompt.includes('{{PHOTO_COUNT}}')) {
      console.log('  INVALID: missing {{PHOTO_COUNT}} placeholder, skipping');
      logResult(round, `${bestScore.yes}/${bestScore.total}`, newPrompt.length, 'discard', 'missing PHOTO_COUNT placeholder');
      round++;
      continue;
    }

    // Guard: reject if prompt shrunk by more than 30% (rewrite, not edit)
    if (newPrompt.length < bestPrompt.length * 0.7) {
      console.log(`  REJECTED: prompt shrunk by ${Math.round((1 - newPrompt.length / bestPrompt.length) * 100)}% (max 30%), likely a rewrite`);
      logResult(round, `${bestScore.yes}/${bestScore.total}`, newPrompt.length, 'discard', `rewrite rejected: ${newPrompt.length} chars (${Math.round((1 - newPrompt.length / bestPrompt.length) * 100)}% smaller)`);
      round++;
      continue;
    }

    console.log(`  New prompt: ${newPrompt.length} chars (was ${bestPrompt.length})`);

    // Run evaluation
    console.log('  Evaluating against all photos...');
    const newResults = await runAllPhotos(newPrompt, photos);
    const newScore = computeScore(newResults, groundTruth, baselineAvgLen);

    console.log(`  Score: ${newScore.yes}/${newScore.total} (was ${bestScore.yes}/${bestScore.total})`);

    // Print failures
    for (const d of newScore.details) {
      const fails = Object.entries(d.checks).filter(([, v]) => !v).map(([k]) => k);
      if (fails.length > 0) {
        console.log(`    ${d.photo}: FAILED ${fails.join(', ')}`);
      }
    }

    // Decide: keep or revert
    const improved = newScore.yes > bestScore.yes;
    const simplicityWin = newScore.yes === bestScore.yes && newPrompt.length < bestPrompt.length;

    if (improved || simplicityWin) {
      const reason = improved ? 'score improved' : 'simplicity win';
      console.log(`  KEEP (${reason})`);
      bestPrompt = newPrompt;
      bestScore = newScore;
      bestResults = newResults;
      writeFileSync(PROMPT_FILE, newPrompt);
      logResult(round, `${newScore.yes}/${newScore.total}`, newPrompt.length, 'keep',
        `${reason}: ${summarizeChange(bestPrompt, newPrompt)}`);
    } else {
      console.log('  DISCARD');
      logResult(round, `${newScore.yes}/${newScore.total}`, newPrompt.length, 'discard',
        summarizeChange(bestPrompt, newPrompt));
    }

    console.log();
    round++;
  }

  console.log(`\n=== Loop finished after ${round - 1} rounds ===`);
  console.log(`Final score: ${bestScore.yes}/${bestScore.total}`);
  console.log(`Final prompt: ${bestPrompt.length} chars (baseline: ${meta.promptLength})`);
  console.log(`Results log: ${RESULTS_FILE}\n`);
}

// --- Summarize change (short description) ---
function summarizeChange(oldPrompt, newPrompt) {
  const lenDiff = newPrompt.length - oldPrompt.length;
  const direction = lenDiff < 0 ? `${Math.abs(lenDiff)} chars shorter` : `${lenDiff} chars longer`;
  return direction;
}

// =============================================
// MAIN
// =============================================
const args = process.argv.slice(2);

if (args.includes('--baseline')) {
  runBaseline().catch(e => { console.error(e); process.exit(1); });
} else {
  const roundsIdx = args.indexOf('--rounds');
  const maxRounds = roundsIdx >= 0 ? parseInt(args[roundsIdx + 1], 10) : Infinity;
  runLoop(maxRounds).catch(e => { console.error(e); process.exit(1); });
}
