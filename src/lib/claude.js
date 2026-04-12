// Claude API helpers -- all calls go through /api/claude serverless proxy
// No Anthropic SDK in the browser. No API key in client code.
import { today, getPeakStatus, daysOpen } from './peakStatus';
import {
  TASTING_KNOWLEDGE,
  BREWING_KNOWLEDGE,
  FELLOW_AIDEN_KNOWLEDGE,
  HANDBREW_BREWER_KNOWLEDGE,
  GRINDER_KNOWLEDGE,
  BREW_TROUBLESHOOTING_RULES,
  getOriginContext,
} from './coffeeKnowledge';
import { GRINDER_LABELS } from './brewMethods';
import { API_BASE } from './apiBase';
import { fetchWithRetry } from './fetchWithRetry';
import { stripMarkdown } from './textFormat';

// Preference enum whitelists. Firestore does not enforce types, so a tampered
// doc could put any string in preferences.brewMethod / preferences.grinder.
// These hard-validate before interpolation.
const VALID_BREW_METHODS = new Set(['aiden', 'handbrew']);
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

export async function callClaude({ system, messages, maxTokens = 1000, model = 'claude-haiku-4-5-20251001', tools, metered = false }) {
  const body = { system, messages, maxTokens, model };
  if (tools) body.tools = tools;
  // `metered: true` opts in to the free-tier quota counter on the server.
  // Only the FIRST message of a guided tasting coach session sets this —
  // multi-turn replies and ChatTab messages do NOT count against the
  // user's free taste-test quota. See review todo 005.
  if (metered) body.metered = true;
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
  });
  const raw = data.content?.map(c => c.text || '').join('') || '';
  // Belt-and-suspenders: strip any markdown that slipped through the prompt.
  return stripMarkdown(raw);
}

export function buildTastingSystemPrompt(beanName, allBeans = [], selectedBean, tastings) {
  const beanList = allBeans.length > 0
    ? `\n\nAVAILABLE BEANS:\n${allBeans.map(b => `- "${b.name}" by ${b.roaster}`).join('\n')}`
    : '';

  // Current brew recipe on the bean (Aiden Opus or hand-brew). Surfaces so the
  // coach never re-asks what's already attached. Try hand-brew first but fall
  // through to Aiden if hand-brew produced no usable fields. Numeric grind
  // values may arrive as strings from persisted data, so coerce before check.
  let currentBrewLine = null;
  const hbr = selectedBean?.handBrewRecipe;
  if (hbr) {
    const parts = [
      hbr.method && `method ${hbr.method}`,
      hbr.ratio && `ratio ${hbr.ratio}`,
      hbr.waterTemp?.celsius && `${hbr.waterTemp.celsius}C`,
      hbr.grindSize?.setting && `grind ${hbr.grindSize.setting}${hbr.grindSize.description ? ` (${hbr.grindSize.description})` : ''}`,
      hbr.totalBrewTime && `time ${hbr.totalBrewTime}`,
    ].filter(Boolean).join(', ');
    if (parts) currentBrewLine = `Current hand-brew recipe: ${parts}`;
  }
  if (!currentBrewLine && selectedBean?.aidenGrind) {
    const g = selectedBean.aidenGrind;
    const ss = Number(g.singleServe);
    const batch = Number(g.batch);
    if (Number.isFinite(ss)) {
      const bits = [`Single-Serve ${ss}`];
      if (Number.isFinite(batch)) bits.push(`Batch ${batch}`);
      currentBrewLine = `Current Fellow Aiden / Opus grind: ${bits.join(' / ')} (Opus scale: LOWER number = FINER grind)`;
    }
  }

  // BEAN PROFILE block
  const beanProfile = selectedBean ? [
    selectedBean.roaster && `Roaster: ${selectedBean.roaster}`,
    selectedBean.name && `Name: ${selectedBean.name}`,
    selectedBean.origin && `Origin: ${selectedBean.origin}`,
    selectedBean.region && `Region: ${selectedBean.region}`,
    selectedBean.process && `Process: ${selectedBean.process}`,
    selectedBean.variety && `Variety: ${selectedBean.variety}`,
    selectedBean.altitude && `Altitude: ${selectedBean.altitude}`,
    selectedBean.roastDate && `Roast Date: ${selectedBean.roastDate} (${getPeakStatus(selectedBean).days}d post-roast, ${getPeakStatus(selectedBean).label})`,
    selectedBean.openDate && `Days Open: ${daysOpen(selectedBean.openDate)}`,
    selectedBean.bagNotes && `Bag Notes: ${selectedBean.bagNotes}`,
    selectedBean.roastLevel && `Roast Level: ${selectedBean.roastLevel}`,
    selectedBean.cupScore && `Cup Score: ${selectedBean.cupScore}`,
    selectedBean.brewingRec && `Brewing Rec: ${selectedBean.brewingRec}`,
    currentBrewLine,
  ].filter(Boolean).join('\n- ') : '';
  const beanSection = beanProfile
    ? `\nBEAN PROFILE (the coffee being tasted right now):\n- ${beanProfile}\n`
    : '';

  // ORIGIN CONTEXT block
  const originContext = getOriginContext(selectedBean?.origin);
  const originSection = originContext
    ? `\nORIGIN CONTEXT FOR ${(selectedBean.origin || '').toUpperCase()}:\n${originContext}\n`
    : '';

  // PAST TASTINGS block
  const pastTastings = (tastings || [])
    .filter(t => t.beanId === selectedBean?.id)
    .sort((a, b) => b.date > a.date ? 1 : -1)
    .slice(0, 3);
  const pastSection = pastTastings.length > 0
    ? `\nPREVIOUS TASTINGS OF THIS BEAN:\n${pastTastings.map(t =>
        `- ${t.date}: ${[t.aroma && `aroma: ${t.aroma}`, t.body && `body: ${t.body}`, t.oneWord && `"${t.oneWord}"`, t.rating && `${t.rating} stars`].filter(Boolean).join(', ')}`
      ).join('\n')}\n`
    : '';

  // Static block: tasting knowledge + rules + guided flow (cached)
  const staticBlock = `You are a patient, encouraging coffee tasting COACH helping a novice taster log a tasting.

${TASTING_KNOWLEDGE}

CRITICAL RULES:
- Tal is learning to taste. NEVER ask vague questions like "how is it?" or "what do you notice?"
- ALWAYS give specific instructions: what to do physically, what to pay attention to, and multiple-choice options to pick from
- Teach tasting vocabulary naturally by labeling what he describes (e.g. "That funky smell? That's classic natural process fermentation!")
- Be warm, encouraging, and brief. Max 4 sentences per turn (plus reveal sentences when applicable).
- ALWAYS label the tasting vocabulary word for what the user described. This is mandatory every turn.
- If Tal mentions a DIFFERENT bean name than the pre-selected one, use that bean instead for the extraction
- No emojis in your responses

FORMATTING RULES (strict):
- Plain text only. NO markdown whatsoever.
- NEVER use asterisks (*). No **bold**, no *italic*, no bullet stars.
- NEVER use pound signs (#) for headers.
- Use line breaks between thoughts. Use dashes (-) for lists only when presenting multiple-choice options.
- Your output is rendered in a mobile chat bubble as literal text; any markdown syntax shows up as garbage.

NEVER RE-ASK WHAT YOU ALREADY KNOW:
- BEAN PROFILE above already contains the user's current brew recipe (Aiden grind, hand-brew method, etc.) when one exists.
- Do NOT ask "what's your brew method / grind / ratio" if BEAN PROFILE lists them.
- Instead, confirm briefly in ONE sentence: "You're on Aiden Opus at SS 4.2 -- sound right, or did you change it?" and move on.
- Only ask for brew details if BEAN PROFILE has no current brew recipe at all.

${BREW_TROUBLESHOOTING_RULES}
${GRINDER_KNOWLEDGE}

WITHHOLD-THEN-REVEAL COACHING:
- You have the bean profile and bag notes internally. Do NOT reveal bag notes or expected flavors BEFORE the taster gives their answer.
- AFTER the taster responds to each step, reveal what the bag/roaster said for that attribute.
- When the taster's answer differs from bag notes: validate their perception, explain a possible reason (age, grind, process, altitude), and give one actionable tip. ("Teach the gap")
- When the taster's answer matches: celebrate briefly ("That's exactly what the roaster had too").
- Use origin context at your discretion when it genuinely adds educational value. Don't force it every turn.
- Only mention peak status/freshness if the taster's observations suggest aging effects (muted, flat, less fruit). Don't lead with "this is past peak."
- Reference past tastings for continuity when relevant ("You got earthy last time too").

GUIDED FLOW (follow this order across your turns):
1. AROMA - already asked in first message. When he responds, validate and label what he described, then reveal what the bag says and teach the gap if needed. Move to step 2.
2. FIRST SIP - "Take a sip and let it sit on your tongue for a sec. Is it: bright/tangy like citrus? Smooth and round? Sharp/sour? Sweet right away?"
3. BODY & FINISH - "How heavy does it feel in your mouth? Light like tea, medium like juice, or thick like milk? And after you swallow, does the taste disappear quickly or linger?"
4. SWEETNESS - "How sweet is it? Barely there, noticeable, or really present?"
5. ONE WORD - "If you had to describe this whole cup in one word, what would it be?"
6. BREW DIAL-IN - Don't ask "what would you change?" and don't ask what their current grind is (you already know it from BEAN PROFILE). Instead, run a quick diagnostic:
   "Quick check: was the cup (a) too sour/bright, (b) too bitter/harsh, (c) too weak/watery, or (d) pretty good as-is?"
   Then TELL them the fix using the BREW TROUBLESHOOTING rules above, expressed as a specific number change on THEIR grinder (see GRINDER DIRECTION). Example: "Bump Opus SS from 4.2 down to 3.5 -- that's finer, which pulls more out and kills the sour edge."

EXTRACTION (mandatory on final turn):
After covering these areas (typically 3-4 exchanges), you MUST end your message with EXACTLY:

---EXTRACT---
{"beanName":"exact bean name from AVAILABLE BEANS list","aroma":"...","firstSip":"...","acidity":"...","sweetness":"...","body":"...","finish":"...","oneWord":"...","notes":"...","changeTomorrow":"...","rating":0}
---END---

For beanName: use the bean the user is clearly tasting. Match it EXACTLY to one of the AVAILABLE BEANS names. If unclear, use the pre-selected bean name.
For rating, suggest 1-5 stars based on enthusiasm. 0 if unclear.
Keep values concise (2-8 words). Use "" for fields not discussed.`;

  // Dynamic block: bean-specific data (uncached, changes per session)
  const dynamicBlock = `The pre-selected bean is: ${beanName}.${beanList}
${beanSection}${originSection}${pastSection}`;

  return [
    { type: 'text', text: staticBlock, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: dynamicBlock },
  ];
}

// Send a tasting coach message. Pass `firstMessage: true` for the first
// message in a new session to charge the free-tier credit; subsequent
// turns in the same session pass `firstMessage: false` and don't charge.
export async function sendTastingMessage(systemPrompt, history, { firstMessage = false } = {}) {
  const data = await callClaude({
    metered: firstMessage,
    system: systemPrompt,
    messages: history.slice(-8),
    maxTokens: 1000,
  });
  const raw = data.content?.map(c => c.text || '').join('') || 'Sorry, something went wrong.';
  // Strip markdown at the API boundary so every caller gets clean plain text.
  // Must preserve the ---EXTRACT---...---END--- marker, which doesn't contain
  // markdown anyway, and stripMarkdown leaves those lines untouched.
  return stripMarkdown(raw);
}

// Sanitize a string before interpolating it into a Claude system prompt.
// - Strips anything outside the whitelist (blocks control chars, newlines,
//   angle brackets, curly braces, backticks, most punctuation).
// - Collapses runs of 3+ dashes to "--" so a malicious bag note cannot
//   inject a fake ---BEAN_SCAN--- / ---EXTRACT--- / ---END--- marker that
//   parseBeanScan in ChatTab.jsx:22 or the tasting extraction regex would
//   match. The character-class alone is not sufficient because `-` is in
//   the whitelist.
function sanitize(str, maxLen = 100) {
  const base = (str || '').slice(0, maxLen).replace(/[^\w .\-',()/]/g, '');
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

export function buildChatContext(beans, tastings, preferences) {
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
  const brewerLabel = brewMethod === 'handbrew' ? 'Hand-brew (manual pour-over)' : 'Fellow Aiden';
  const brewerRef = brewMethod === 'handbrew' ? 'HAND-BREW' : 'FELLOW AIDEN';

  const active = beans
    .filter(b => b.status === 'ACTIVE')
    .map(b => {
      const ps = getPeakStatus(b);
      const summary = `  Jar #${b.jarSlot}: ${sanitize(b.roaster)} -- ${sanitize(b.name)} (${sanitize(b.origin)}) | ${sanitize(b.variety)} ${sanitize(b.process)} | ${ps.days}d post-roast (${ps.label}) | Opened: ${b.openDate} (${daysOpen(b.openDate)}d ago) | Notes: ${sanitize(b.bagNotes, 200)}`;
      const recipeLine =
        brewMethod === 'handbrew' ? formatHandBrewRecipeLine(b) : formatAidenRecipeLine(b);
      return recipeLine ? `${summary}\n${recipeLine}` : summary;
    })
    .join('\n');

  const sealed = beans.filter(b => b.status === 'SEALED').map(b => {
    const ps = getPeakStatus(b);
    return `  ${sanitize(b.roaster)} -- ${sanitize(b.name)} (${sanitize(b.origin)}) | ${sanitize(b.variety)} ${sanitize(b.process)} | ${b.bagSize}g | ${ps.days}d post-roast (${ps.label}) | Notes: ${sanitize(b.bagNotes, 200)}`;
  }).join('\n');

  const finished = beans.filter(b => b.status === 'FINISHED').slice(0, 5).map(b =>
    `  ${sanitize(b.roaster)} -- ${sanitize(b.name)} (${sanitize(b.origin)}) | Finished: ${b.finishDate}`
  ).join('\n');

  const recentTastings = tastings.slice(0, 5).map(t => {
    const bean = beans.find(x => x.id === t.beanId);
    return `  ${t.date}: ${sanitize(bean?.name) || '?'} -- ${sanitize(t.oneWord, 50)} ${t.rating ? '\u2605'.repeat(t.rating) : ''} -- ${sanitize(t.notes, 200)}`;
  }).join('\n');

  // Static block: persona + shared knowledge + brewer/grinder references +
  // rules + photo handling. User-agnostic so the prompt cache hits across
  // all users and preference changes. DO NOT interpolate preferences here.
  const staticBlock = `You are Professor Ruphus, Tal's friendly and knowledgeable coffee guide. You're warm but concise, opinionated about good coffee, and always helpful. You have access to his real, current coffee data.

Your responses render in a mobile chat bubble as plain text. Write in conversational paragraphs. Do not use markdown formatting: no bold, italic, headers, or bullet lists. Use line breaks to separate thoughts.

${BREWING_KNOWLEDGE}
${FELLOW_AIDEN_KNOWLEDGE}
${HANDBREW_BREWER_KNOWLEDGE}
${GRINDER_KNOWLEDGE}
${BREW_TROUBLESHOOTING_RULES}

Rotation rules:
- Keep 3 beans active (Jar #1-#3)
- Priority: (1) Already opened, (2) In/approaching peak window, (3) Smaller bags first
- Apollon's Gold: Degas 35-45 days, Peak 60-90 days post-roast, 1:17.5-1:19 ratio, 90-93C
- Other roasters without guidance: rest 7-14 days, general peak 14-60 days
- After opening: finish within 2-4 weeks; 100g bags within 7-14 days
- Bag-stated guidance always overrides defaults
- Do not suggest beans that are already finished or opened. Only recommend from sealed inventory.

User setup: the dynamic USER SETUP block below names the user's brewer and grinder. Read the matching FELLOW AIDEN or HAND-BREW entry and the matching GRINDERS entry above before giving any brew advice.

Recipe recall and action handoff: when the user asks about "my recipe" or "the current brew" for an active jar, cite the full stored recipe verbatim by parameter (not paraphrased). Example: "your Aiden profile for jar 2 is 1:17, 2.5x bloom at 94C for 45s, three SS pulses at 95/94/93C every 22s, Ode grind SS 4.5." Ruphus is advisory; any suggested change is applied by tapping the Brew button on the bean card to regenerate, or by editing the Aiden manually. Do not imply you can write recipes to the device.

Aiden grind recommendations are in Ode Gen 2 units: aidenRecipe.grindRecommendation values are always on the Fellow Ode Gen 2 scale. If the user's grinder is not Fellow Ode Gen 2, give grind advice as a direction word (finer or coarser) and tell the user to read the absolute number from their own grinder's entry under GRINDERS. Do not invent Opus or Comandante numbers from an Ode number.

Past tastings: if RECENT TASTINGS below shows prior tastings of an active bean, reference them for continuity when dialing in. Example: "you got muddled last time at 5.2 and liked it coarser."

Be concise, warm, and opinionated. If recommending a bean, explain why based on timing and variety.

Photo handling:
When the user sends photos of a coffee bag, scan the label carefully and present what you find. Then include structured data using markers:

---BEAN_SCAN---
{"roaster":"...","name":"...","origin":"...","variety":"...","process":"...","roastDate":"YYYY-MM-DD or empty","bagSize":number,"bagNotes":"tasting notes from bag","producer":"...","region":"...","altitude":"...","farm":"...","roastLevel":"...","cupScore":"...","brewingRec":"...","sourcedBy":"..."}
---END_SCAN---

Rules for photo scanning:
- Read ALL text in ALL orientations (rotated, vertical, sideways)
- Distinguish curator/subscription brands from the actual roaster
- If no explicit coffee name, construct from farm + variety or origin + variety
- Use empty string for unknown fields, 100 for unknown bagSize
- If the photo is NOT a coffee bag, respond normally with no markers
- If photos are too blurry, ask for clearer photos
- After the scan data, briefly summarize what you found and offer next steps`;

  // Dynamic block: user-specific. USER SETUP FIRST so every later block is
  // read through the lens of the user's actual brewer/grinder.
  const dynamicBlock = `USER SETUP:
  Brewer: ${brewerLabel} -- read the ${brewerRef} entry in the static block above.
  Grinder: ${grinderLabel} -- read the matching entry under GRINDERS above.
  Canister count: ${canisterCount}

TODAY: ${today()}

ACTIVE ROTATION (Jars):
${active || '  (none)'}

SEALED INVENTORY:
${sealed || '  (none)'}

RECENTLY FINISHED:
${finished || '  (none)'}

RECENT TASTINGS:
${recentTastings || '  (none)'}`;

  return [
    { type: 'text', text: staticBlock, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: dynamicBlock },
  ];
}

export async function sendChatMessage(systemPrompt, history) {
  // Route images through Gemini for vision, then pass text description to Claude
  const recentMessages = history.slice(-8);
  const lastMsg = recentMessages[recentMessages.length - 1];

  if (lastMsg?.role === 'user' && Array.isArray(lastMsg.content)) {
    const hasImages = lastMsg.content.some(block => block.type === 'image');
    if (hasImages) {
      try {
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

  const data = await callClaude({
    system: systemPrompt,
    messages: recentMessages,
    maxTokens: 800,
  });
  const raw = data.content?.map(c => c.text || '').join('') || 'Sorry, something went wrong.';
  // Preserve the ---BEAN_SCAN---...---END_SCAN--- marker (it's plain JSON, no
  // markdown) and strip any stray bold/italic from the conversational text.
  return stripMarkdown(raw);
}
