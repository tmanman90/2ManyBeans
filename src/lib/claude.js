// Claude API helpers -- all calls go through /api/claude serverless proxy
// No Anthropic SDK in the browser. No API key in client code.
import { today, getPeakStatus, daysOpen } from './peakStatus';
import {
  RUPHUS_KNOWLEDGE,
  TASTING_KNOWLEDGE,
  BREWING_KNOWLEDGE,
  FELLOW_AIDEN_KNOWLEDGE,
  HANDBREW_BREWER_KNOWLEDGE,
  GRINDER_KNOWLEDGE,
  BREW_TROUBLESHOOTING_RULES,
  getOriginContext,
} from './coffeeKnowledge';
import { GRINDER_LABELS } from './brewMethods';
import { summarizeSourceInsights } from './sourceInsights';
import { API_BASE } from './apiBase';
import { fetchWithRetry } from './fetchWithRetry';
import { stripMarkdown } from './textFormat';
import { buildPalateSummary } from './palateSummary.js';
import { formatBrewContext, isMilkDrink } from './brewContext.js';

// Preference enum whitelists. Firestore does not enforce types, so a tampered
// doc could put any string in preferences.brewMethod / preferences.grinder.
// These hard-validate before interpolation.
const VALID_BREW_METHODS = new Set(['aiden', 'espresso', 'v60', 'kalita', 'chemex', 'aeropress', 'french-press', 'handbrew']);
const VALID_GRINDER_KEYS = new Set([
  'fellow-ode-gen2',
  'fellow-opus',
  'baratza-encore-esp',
  'comandante-c40',
  '1zpresso-jx-pro',
  'baratza-virtuoso-plus',
  'other',
]);

function validateBrewMethod(x) {
  return VALID_BREW_METHODS.has(x) ? x : 'aiden';
}

function validateGrinderKey(x) {
  return VALID_GRINDER_KEYS.has(x) ? x : 'fellow-ode-gen2';
}

const PROXY_URL = `${API_BASE}/api/claude`;

export async function callClaude({ system, messages, maxTokens = 1000, model = 'claude-haiku-4-5-20251001', tools, metered = false, feature }) {
  const body = { system, messages, maxTokens, model };
  if (tools) body.tools = tools;
  if (metered) body.metered = true;
  if (feature) body.feature = feature;
  return fetchWithRetry({ url: PROXY_URL, body, serviceName: 'Claude' });
}

// --- Image compression utility ---

export function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      // 1024px is enough for Gemini OCR on bean bag labels. Previously 1500,
      // which decoded to ~9MB of RGBA canvas memory per photo and didn't
      // measurably improve scan quality.
      const MAX_DIM = 1024;
      let { width, height } = img;

      if (width > MAX_DIM || height > MAX_DIM) {
        const scale = MAX_DIM / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          // Nudge WebKit to release the backing store sooner on iOS.
          canvas.width = 0;
          canvas.height = 0;
          if (!blob) return reject(new Error('Compression failed'));
          const reader = new FileReader();
          reader.onload = () => resolve({
            base64: reader.result.split(',')[1],
            mediaType: 'image/jpeg',
            previewUrl: URL.createObjectURL(blob),
          });
          reader.onerror = () => reject(new Error('Failed to read compressed image'));
          reader.readAsDataURL(blob);
        },
        'image/jpeg',
        0.8,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    img.src = url;
  });
}

// --- Bean scanning and web research now in src/lib/gemini.js ---

export async function getRecBlurb(activeDesc, recDesc) {
  const data = await callClaude({
    system: `You're a concise specialty coffee advisor. Given a current rotation and candidate beans, write a brief 2-4 sentence analysis of why each candidate would complement the rotation. Consider: timing urgency (fading beans first), flavor variety (different origins/processes from what's active), and peak window. Be warm and opinionated.

FORMATTING: Plain text only. NO markdown. NEVER use asterisks (*), pound signs (#), or any markdown formatting -- your output renders as literal text in a mobile card and markdown syntax shows up as garbage. Write in flowing sentences, no headers, no bullets, no bold, no italic.`,
    messages: [{ role: 'user', content: `Current rotation:\n${activeDesc || "(empty)"}\n\nTop candidates:\n${recDesc}\n\nWhy would each be a good pick?` }],
    maxTokens: 400,
    feature: 'recommendation',
  });
  const raw = data.content?.map(c => c.text || '').join('') || '';
  // Belt-and-suspenders: strip any markdown that slipped through the prompt.
  return stripMarkdown(raw);
}

// Sanitize a string before interpolating it into a Claude system prompt.
// - Strips anything outside the whitelist (blocks control chars, newlines,
//   angle brackets, curly braces, backticks, most punctuation).
// - The colon is whitelisted because recipe fields use it heavily:
//   handBrewRecipe.ratio is "1:15.5", totalBrewTime is "2:45", etc. None
//   of the extraction markers we care about (---BEAN_SCAN---, ---EXTRACT---,
//   ---END---) contain a colon, so it is safe to allow.
// - Collapses runs of 3+ dashes to "--" so a malicious bag note cannot
//   inject a fake marker that parseBeanScan in ChatTab.jsx:22 or the
//   tasting extraction regex would match. The character class alone is
//   not sufficient because `-` is in the whitelist.
function sanitize(str, maxLen = 100) {
  const base = (str || '').slice(0, maxLen).replace(/[^\w .\-',():/]/g, '');
  return base.replace(/-{3,}/g, '--');
}

// Format a number-or-string field as a clean display number, or return null
// if it isn't a finite value. Coerces the legacy string-typed aidenGrind
// values that may still live on old bean docs.
function numOrNull(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

// Format an array of pulse temperatures as "95/94/93", with defensive bounds
// and per-element finite-ness checks.
function formatPulseTemps(arr) {
  if (!Array.isArray(arr)) return '';
  return arr
    .slice(0, 10)
    .map(numOrNull)
    .filter(n => n !== null)
    .join('/');
}

// Build the full Aiden recipe line for an active bean. Returns a string or
// null (when no recipe exists). Field whitelist + sanitize + Number.isFinite
// guards match the deepened plan.
function formatAidenRecipeLine(bean) {
  const r = bean?.aidenRecipe;
  const hasFull = r && numOrNull(r.ratio) !== null;

  // Legacy fallback: aidenGrind numbers exist but no full recipe yet.
  if (!hasFull) {
    const ss = numOrNull(bean?.aidenGrind?.singleServe);
    const batch = numOrNull(bean?.aidenGrind?.batch);
    if (ss === null) return null;
    return `    Aiden grind: SS ${ss}${batch !== null ? ` / Batch ${batch}` : ''}. (Full recipe not generated yet; tap Brew to generate.)`;
  }

  const title = sanitize(r.title, 60);
  const ratio = numOrNull(r.ratio);
  const bloomRatio = numOrNull(r.bloomRatio);
  const bloomTemp = numOrNull(r.bloomTemperature);
  const bloomDur = numOrNull(r.bloomDuration);
  const ssCount = numOrNull(r.ssPulsesNumber);
  const ssInterval = numOrNull(r.ssPulsesInterval);
  const ssTemps = formatPulseTemps(r.ssPulseTemperatures);
  const batchCount = numOrNull(r.batchPulsesNumber);
  const batchInterval = numOrNull(r.batchPulsesInterval);
  const batchTemps = formatPulseTemps(r.batchPulseTemperatures);
  const gSS = numOrNull(r.grindRecommendation?.singleServe);
  const gBatch = numOrNull(r.grindRecommendation?.batch);

  const parts = [];
  if (title) parts.push(`"${title}"`);
  if (ratio !== null) parts.push(`1:${ratio}`);
  if (bloomRatio !== null && bloomTemp !== null && bloomDur !== null) {
    parts.push(`bloom ${bloomRatio}x ${bloomTemp}C ${bloomDur}s`);
  }
  if (ssCount !== null && ssInterval !== null && ssTemps) {
    parts.push(`SS ${ssCount} pulses [${ssTemps}]C ${ssInterval}s intervals`);
  }
  if (batchCount !== null && batchInterval !== null && batchTemps) {
    parts.push(`Batch ${batchCount} pulses [${batchTemps}]C ${batchInterval}s intervals`);
  }
  if (gSS !== null) {
    parts.push(`Ode grind SS ${gSS}${gBatch !== null ? ` / Batch ${gBatch}` : ''}`);
  }

  return `    Aiden recipe: ${parts.join(', ')}.`;
}

// Build the full hand-brew recipe line for an active bean. Returns a string
// or null (when no recipe exists). R14 mismatch marker intentionally cut
// from v2 per the deepen-plan simplicity review.
function formatHandBrewRecipeLine(bean) {
  const r = bean?.handBrewRecipe;
  if (!r) return null;

  const title = sanitize(r.title, 60);
  const technique = sanitize(r.technique, 30);
  const ratio = sanitize(r.ratio, 20); // hand-brew ratio is a string like "1:15.5"
  const celsius = numOrNull(r.waterTemp?.celsius);
  const grindSetting = sanitize(r.grindSize?.setting, 30);
  const grindDesc = sanitize(r.grindSize?.description, 50);
  const microns = numOrNull(r.grindSize?.microns);
  const totalTime = sanitize(r.totalBrewTime, 20);
  const reasoning = sanitize(r.reasoning, 200);

  const parts = [];
  if (title) parts.push(`"${title}"`);
  if (technique) parts.push(`${technique} technique`);
  if (ratio) parts.push(ratio);
  if (celsius !== null) parts.push(`${celsius}C`);
  if (grindSetting) {
    const grindBits = [grindSetting];
    if (grindDesc) grindBits.push(`(${grindDesc}${microns !== null ? `, ${microns}um` : ''})`);
    parts.push(`grind ${grindBits.join(' ')}`);
  }
  if (totalTime) parts.push(`${totalTime} total`);

  const line = `    Hand-brew recipe: ${parts.join(', ')}.`;
  return reasoning ? `${line} Reasoning: ${reasoning}` : line;
}

function formatEspressoRecipeLine(bean) {
  const recipe = bean?.espressoRecipe;
  if (!recipe || typeof recipe !== 'object') return null;
  const dose = numOrNull(recipe.doseGrams);
  const output = numOrNull(recipe.yieldGrams);
  const ratio = numOrNull(recipe.ratio);
  const range = Array.isArray(recipe.timeRangeSeconds) && recipe.timeRangeSeconds.length === 2
    ? `${recipe.timeRangeSeconds[0]}–${recipe.timeRangeSeconds[1]}s ${recipe.timeBasis === 'machine_start_to_stop' ? 'machine start to stop' : ''}`.trim()
    : '';
  const temperature = recipe.temperature && typeof recipe.temperature === 'object' && Number.isInteger(recipe.temperature.offsetF)
    ? `machine default ${recipe.temperature.offsetF >= 0 ? '+' : ''}${recipe.temperature.offsetF}°F`
    : '';
  const parts = [dose !== null ? `${dose}g in` : null, output !== null ? `${output}g out` : null, ratio !== null ? `1:${ratio}` : null, range || null, temperature || null].filter(Boolean);
  if (!parts.length) return null;
  return `    Espresso recipe: ${parts.join(', ')}.`;
}

export function buildChatContext(beans, tastings, preferences, firstName) {
  // Null-safe preference resolution with enum validation. Firestore is
  // free-form, so validate before any interpolation.
  const prefs = preferences || {};
  const brewMethod = validateBrewMethod(prefs.brewMethod);
  const grinderKey = validateGrinderKey(prefs.grinder);
  const canisterCount = numOrNull(prefs.canisterCount) ?? 3;
  const grinderLabel =
    grinderKey === 'other'
      ? sanitize(prefs.grinderCustomName, 50) || 'Custom grinder'
      : GRINDER_LABELS[grinderKey] || 'Fellow Ode Gen 2';
  const DEVICE_LABELS = { v60: 'V60 pour-over', kalita: 'Kalita Wave pour-over', chemex: 'Chemex pour-over', aeropress: 'Aeropress', 'french-press': 'French Press', handbrew: 'Hand-brew (manual pour-over)' };
  const brewerLabel = brewMethod === 'aiden' ? 'Fellow Aiden' : brewMethod === 'espresso' ? 'Espresso' : (DEVICE_LABELS[brewMethod] || 'Manual brew');
  const brewerRef = brewMethod === 'aiden' ? 'FELLOW AIDEN' : brewMethod === 'espresso' ? 'ESPRESSO' : 'HAND-BREW';

  const active = beans
    .filter(b => b.status === 'ACTIVE')
    .map(b => {
      const ps = getPeakStatus(b);
      const sourceSummary = summarizeSourceInsights(b, { maxChars: 160 });
      const summary = `  Jar #${b.jarSlot}: ${sanitize(b.roaster)} -- ${sanitize(b.name)} (${sanitize(b.origin)}) | ${sanitize(b.variety)} ${sanitize(b.process)} | ${ps.days}d post-roast (${ps.label}) | Opened: ${sanitize(b.openDate, 20)} (${daysOpen(b.openDate)}d ago) | Notes: ${sanitize(b.bagNotes, 200)}${sourceSummary ? ` | Source: ${sanitize(sourceSummary, 160)}` : ''}`;
      const recipeLine = brewMethod === 'espresso'
        ? formatEspressoRecipeLine(b)
        : brewMethod !== 'aiden' ? formatHandBrewRecipeLine(b) : formatAidenRecipeLine(b);
      return recipeLine ? `${summary}\n${recipeLine}` : summary;
    })
    .join('\n');

  const sealed = beans.filter(b => b.status === 'SEALED').map(b => {
    const ps = getPeakStatus(b);
    const sourceSummary = summarizeSourceInsights(b, { maxChars: 140 });
    return `  ${sanitize(b.roaster)} -- ${sanitize(b.name)} (${sanitize(b.origin)}) | ${sanitize(b.variety)} ${sanitize(b.process)} | ${numOrNull(b.bagSize)}g | ${ps.days}d post-roast (${ps.label}) | Notes: ${sanitize(b.bagNotes, 200)}${sourceSummary ? ` | Source: ${sanitize(sourceSummary, 140)}` : ''}`;
  }).join('\n');

  const finished = beans.filter(b => b.status === 'FINISHED').slice(0, 5).map(b =>
    `  ${sanitize(b.roaster)} -- ${sanitize(b.name)} (${sanitize(b.origin)}) | Finished: ${sanitize(b.finishDate, 20)}`
  ).join('\n');

  const originLines = [];
  const seenOrigins = new Set();
  beans
    .filter(b => b.status === 'ACTIVE')
    .forEach(b => {
      const origin = sanitize(b.origin, 60);
      const key = origin.toLowerCase();
      if (!origin || seenOrigins.has(key) || originLines.length >= 3) return;
      const context = getOriginContext(origin);
      if (!context) return;
      seenOrigins.add(key);
      originLines.push(`  ${origin}: ${sanitize(context, 500)}`);
    });
  const originContext = originLines.length
    ? `\n\nORIGIN CONTEXT:\n${originLines.join('\n')}`
    : '';

  const recentTastings = tastings.slice(0, 5).map(t => {
    const bean = beans.find(x => x.id === t.beanId);
    // Clamp rating to [0,5] integer before String.repeat — tampered Firestore
    // data could set it negative or infinite and trigger a RangeError.
    const ratingN = numOrNull(t.rating);
    const stars = ratingN !== null ? '\u2605'.repeat(Math.max(0, Math.min(5, Math.floor(ratingN)))) : '';
    const context = t.cupContext ? formatBrewContext(t.cupContext) : '';
    const milkContext = t.cupContext && isMilkDrink(t.cupContext) ? ' (milk drink; sensory notes are for the finished drink)' : '';
    return `  ${sanitize(t.date, 20)}: ${sanitize(bean?.name) || '?'}${context ? ` -- ${sanitize(context, 180)}` : ''}${milkContext} -- ${sanitize(t.oneWord, 50)} ${stars} -- ${sanitize(t.notes, 200)}`;
  }).join('\n');

  // Static block: persona + shared knowledge + brewer/grinder references +
  // rules + photo handling. User-agnostic so the prompt cache hits across
  // all users and preference changes. DO NOT interpolate preferences here.
  const staticBlock = `You are Professor Ruphus, the user's friendly and knowledgeable coffee guide. You're warm but concise, opinionated about good coffee, and always helpful. You have access to their real, current coffee data.

Your responses render in a mobile chat bubble as plain text. Write in conversational paragraphs. Do not use markdown formatting: no bold, italic, headers, or bullet lists. Use line breaks to separate thoughts.

${BREWING_KNOWLEDGE}
${FELLOW_AIDEN_KNOWLEDGE}
${HANDBREW_BREWER_KNOWLEDGE}
${GRINDER_KNOWLEDGE}
${BREW_TROUBLESHOOTING_RULES}
${RUPHUS_KNOWLEDGE}
${TASTING_KNOWLEDGE}

Rotation rules:
- Keep 3 beans active (Jar #1-#3)
- Priority: (1) Already opened, (2) In/approaching peak window, (3) Smaller bags first
- Apollon's Gold: Degas 35-45 days, Peak 60-90 days post-roast, 1:17.5-1:19 ratio, 90-93C
- Other roasters without guidance: rest 7-14 days, general peak 14-60 days
- After opening: finish within 2-4 weeks; 100g bags within 7-14 days
- Bag-stated guidance always overrides defaults
- Do not suggest beans that are already finished or opened. Only recommend from sealed inventory.

User setup: the dynamic USER SETUP block below names the user's brewer and grinder. Read the matching FELLOW AIDEN or HAND-BREW entry and the matching GRINDERS entry above before giving any brew advice.
If a user first name is provided in the dynamic block, greet them by first name naturally when appropriate, not every turn.

Recipe recall and action handoff: when the user asks about "my recipe" or "the current brew" for an active jar, cite the full stored recipe verbatim by parameter (not paraphrased). Example: "your Aiden profile for jar 2 is 1:17, 2.5x bloom at 94C for 45s, three SS pulses at 95/94/93C every 22s, Ode grind SS 4.5." Ruphus is advisory; any suggested change is applied by tapping the Brew button on the bean card to regenerate, or by editing the Aiden manually. Do not imply you can write recipes to the device.

Aiden grind recommendations are in Ode Gen 2 units: aidenRecipe.grindRecommendation values are always on the Fellow Ode Gen 2 scale. If the user's grinder is not Fellow Ode Gen 2, give grind advice as a direction word (finer or coarser) and tell the user to read the absolute number from their own grinder's entry under GRINDERS. Do not invent Opus or Comandante numbers from an Ode number.

RECIPE_CARD marker:
- Only when giving a complete, concrete brew recipe, end with this exact marker payload:
---RECIPE_CARD---
{"title":"...","method":"...","ratio":"...","temp":"...","grind":"finer/coarser direction plus setting guidance","steps":["..."],"reasoning":"..."}
---END_RECIPE---
- Required fields: title, method, ratio, temp, grind, steps, reasoning.
- grind must include direction words such as finer or coarser.
- steps must be at most 6 short strings.
- After the marker, continue with no repetition of the recipe numbers in prose.
- If the answer is general advice, troubleshooting, a scan summary, or a question, do not emit this marker.

Live web answers:
- When a question genuinely needs current web information, such as roaster lineups, product availability, releases, or news, respond with ONLY this marker and no prose before or after:
---NEEDS_SEARCH---{"query":"short web search query"}---END_SEARCH---
- Never emit NEEDS_SEARCH when answering from the provided user, rotation, tasting, recipe, scan, or web-search context.

Past tastings: if RECENT TASTINGS below shows prior tastings of an active bean, reference them for continuity when dialing in. Example: "you got muddled last time at 5.2 and liked it coarser."
Palate summary: use the dynamic PALATE block to shape recommendations, never recite it back.

Be concise, warm, and opinionated. If recommending a bean, explain why based on timing and variety.

LENGTH CONTRACT (strict): default to 2-5 short sentences per reply. Give ONE clear recommendation with the single strongest reason; do not tour every jar or list all options unless the user explicitly asks for a rundown. Cite a stored recipe verbatim only when the user asks for the recipe or accepts your suggestion to brew. End with at most one short follow-up question, and only when it earns its place. Go longer ONLY when the user asks for detail, a comparison, or a full recipe.

Photo handling:
When the user sends photos of a coffee bag, scan the label carefully and present what you find. Then include structured data using markers:

---BEAN_SCAN---
{"roaster":"...","name":"...","origin":"...","variety":"...","process":"...","roastDate":"YYYY-MM-DD or empty","bagSize":number,"bagNotes":"tasting notes from bag","producer":"...","region":"...","altitude":"...","farm":"...","roastLevel":"...","cupScore":"...","brewingRec":"...","sourcedBy":"...","roastedIn":"...","sourceInsights":{"sourceType":"bag | pamphlet | card | insert | mixed","sourceSummary":"...","roasterContext":"...","selectorContext":"...","tastingCommittee":"...","sensoryDescriptors":["..."],"sensoryAxes":{"fragranceAroma":7,"acidity":7,"sweetness":7,"body":7,"flavor":7,"balance":7},"brewGuidance":"...","provenance":"...","extractedTextSummary":"...","extractionWarnings":"...","brewRecipes":[{"id":"...","mode":"hot|iced","device":"v60","configuration":"V60 02","status":"original|scaled|adapted|aggregated|corroboration","author":"...","canonicalUrl":"canonical URL printed/verified in source, or empty","publication":"publication/version/date","doseGrams":number,"ratio":number,"temperatureC":number or null,"grind":"...","geometry":"...","cadence":"...","agitation":"...","guideSeconds":number or null,"hotWaterGrams":number or null,"iceGrams":number or null,"finalWaterGrams":number or null,"steps":[{"timeSeconds":number,"waterTotal":number,"action":"exact timed pour copy"}],"postBrewInstruction":"untimed post-brew instruction or empty","adaptation":"...","changedFields":["..."]}]}}
---END_SCAN---

Rules for photo scanning:
- Read ALL text in ALL orientations (rotated, vertical, sideways)
- Distinguish curator/subscription brands from the actual roaster
- If a pamphlet/card/insert appears with the bag, preserve its insight in sourceInsights instead of only bagNotes
- If a source sheet mentions multiple coffees, only attach the section matching the scanned bean
- If no explicit coffee name, construct from farm + variety or origin + variety
- Use empty string for unknown fields, 100 for unknown bagSize
- Use sourceInsights: null when no source insert/card/pamphlet context is visible
- If the photo is NOT a coffee bag, respond normally with no markers
- If photos are too blurry, ask for clearer photos
- After the scan data, briefly summarize what you found and offer next steps`;

  // Dynamic block: user-specific. USER SETUP FIRST so every later block is
  // read through the lens of the user's actual brewer/grinder.
  const dynamicBlock = `USER SETUP:
  Brewer: ${brewerLabel} -- read the ${brewerRef} entry in the static block above.
  Grinder: ${grinderLabel} -- read the matching entry under GRINDERS above.
  Canister count: ${canisterCount}
${firstName ? `  User first name: ${sanitize(firstName, 30)}\n` : ''}

TODAY: ${today()}

PALATE:
${buildPalateSummary(tastings) || '  (none yet)'}

ACTIVE ROTATION (Jars):
${active || '  (none)'}

SEALED INVENTORY:
${sealed || '  (none)'}

RECENTLY FINISHED:
${finished || '  (none)'}

RECENT TASTINGS:
${recentTastings || '  (none)'}${originContext}`;

  return [
    { type: 'text', text: staticBlock, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: dynamicBlock },
  ];
}

export async function prepareChatMessagesForClaude(history, { onImageDescribeStart } = {}) {
  // Route images through Gemini for vision, then pass text description to Claude
  const recentMessages = history.slice(-8);
  const lastMsg = recentMessages[recentMessages.length - 1];
  let hasImages = false;

  if (lastMsg?.role === 'user' && Array.isArray(lastMsg.content)) {
    hasImages = lastMsg.content.some(block => block.type === 'image');
    if (hasImages) {
      try {
        onImageDescribeStart?.();
        const { describeImage } = await import('./gemini');
        const photos = lastMsg.content
          .filter(block => block.type === 'image')
          .map(block => ({ base64: block.source.data, mediaType: block.source.media_type }));
        const textBlocks = lastMsg.content.filter(block => block.type === 'text');
        const userText = textBlocks.map(b => b.text).join(' ');

        const imageDescription = await describeImage(photos);

        // Replace image blocks with Gemini's text description
        recentMessages[recentMessages.length - 1] = {
          role: 'user',
          content: `[Image analysis: ${imageDescription}]\n\n${userText}`,
        };
      } catch (e) {
        console.warn('Gemini image routing failed, sending images directly to Claude:', e.message);
      }
    }
  }

  return { messages: recentMessages, hasImages };
}

// reactToTastingStep — additive, NON-GATING Ruphus reaction for one beat of the guided tasting
// wizard. The wizard's deterministic coaching always renders; if this resolves, it swaps in a
// warmer, bean-specific line. Pro-gated at the call site (free users get the full deterministic
// flow). Returns a short plain-text reaction, or '' on any failure (caller ignores empties).
export async function reactToTastingStep({ bean, step, userText, expected, brewContext = null }) {
  if (!userText || !step) return '';
  const beanName = sanitize(bean?.name || bean?.roaster || 'this coffee', 80);
  const origin = sanitize(bean?.origin || '', 60);
  const espresso = brewContext?.method === 'espresso';
  const drink = brewContext?.drinkType === 'with_milk' ? ' with milk' : '';
  const expectedLine = !espresso && expected?.cues?.[step.key] ? sanitize(String(expected.cues[step.key]).replace(/-{3,}/g, '--'), 180) : '';
  const system = `You are Professor Ruphus, a warm, witty master coffee taster mentoring a NOVICE through tasting one specific cup, one attribute at a time.
You are reacting to their observation on the "${sanitize(step.title, 30)}" step for ${beanName}${origin ? ` (${origin})` : ''}${espresso ? `, an espresso${drink}` : ''}.
${expectedLine ? `For context, you expected: ${expectedLine}` : ''}
Reply in ONE or TWO short sentences. Affirm what they noticed, gently sharpen it, and if useful nudge toward what to feel next. Encouraging, specific, never a lecture. No markdown, no lists, no emoji.`;
  try {
    const data = await callClaude({
      system,
      messages: [{ role: 'user', content: String(userText).slice(0, 400) }],
      maxTokens: 110,
      feature: 'tastingCoach',
    });
    const raw = data.content?.map(c => c.text || '').join('') || '';
    return stripMarkdown(raw).trim();
  } catch {
    return '';
  }
}
