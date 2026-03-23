// Claude API helpers — all calls go through /api/claude serverless proxy
// No Anthropic SDK in the browser. No API key in client code.
import { today, getPeakStatus, daysOpen } from './peakStatus';
import { TASTING_KNOWLEDGE, BREWING_KNOWLEDGE, getOriginContext } from './coffeeKnowledge';
import { API_BASE } from './apiBase';

const PROXY_URL = `${API_BASE}/api/claude`;

const FRIENDLY_ERRORS = {
  429: 'AI is rate-limited — please wait a moment and try again',
  529: 'AI service is temporarily busy — please try again in a moment',
  503: 'AI service is temporarily unavailable — please try again shortly',
};

export async function callClaude({ system, messages, maxTokens = 1000, model = 'claude-sonnet-4-6', tools, retries = 2 }) {
  const body = { system, messages, maxTokens, model };
  if (tools) body.tools = tools;

  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      // Exponential backoff: 1s, 2s
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }

    const response = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (response.ok) {
      return response.json();
    }

    // Retry on transient errors
    if ([429, 529, 503].includes(response.status) && attempt < retries) {
      lastError = response.status;
      continue;
    }

    const friendly = FRIENDLY_ERRORS[response.status];
    if (friendly) throw new Error(friendly);

    // Try to get server error detail
    try {
      const data = await response.json();
      throw new Error(data.error || `Claude API error: ${response.status}`);
    } catch (e) {
      if (e.message && e.message !== 'Unexpected token') throw e;
      throw new Error(`Claude API error: ${response.status}`);
    }
  }

  // All retries exhausted
  const friendly = FRIENDLY_ERRORS[lastError];
  throw new Error(friendly || `Claude API error: ${lastError}`);
}

// --- Image compression utility ---

export function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX_DIM = 1500;
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
    system: `You're a concise specialty coffee advisor. Given a current rotation and candidate beans, write a brief 2-4 sentence analysis of why each candidate would complement the rotation. Consider: timing urgency (fading beans first), flavor variety (different origins/processes from what's active), and peak window. Be warm and opinionated. No headers or bullets — just a flowing paragraph.`,
    messages: [{ role: 'user', content: `Current rotation:\n${activeDesc || "(empty)"}\n\nTop candidates:\n${recDesc}\n\nWhy would each be a good pick?` }],
    maxTokens: 400,
  });
  return data.content?.map(c => c.text || '').join('') || '';
}

export function buildTastingSystemPrompt(beanName, allBeans = [], selectedBean, tastings) {
  const beanList = allBeans.length > 0
    ? `\n\nAVAILABLE BEANS:\n${allBeans.map(b => `- "${b.name}" by ${b.roaster}`).join('\n')}`
    : '';

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

  return `You are a patient, encouraging coffee tasting COACH helping a novice taster log a tasting. The pre-selected bean is: ${beanName}.${beanList}
${beanSection}${originSection}${pastSection}
${TASTING_KNOWLEDGE}

CRITICAL RULES:
- Tal is learning to taste. NEVER ask vague questions like "how is it?" or "what do you notice?"
- ALWAYS give specific instructions: what to do physically, what to pay attention to, and multiple-choice options to pick from
- Teach tasting vocabulary naturally by labeling what he describes (e.g. "That funky smell? That's classic natural process fermentation!")
- Be warm, encouraging, and brief (2-3 sentences + options per turn, plus reveal sentences when applicable)
- If Tal mentions a DIFFERENT bean name than the pre-selected one, use that bean instead for the extraction
- No emojis in your responses

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
6. BREW DIAL-IN - Don't ask "what would you change?" Instead, run a quick diagnostic:
   "Quick check: was the cup (a) too sour/bright, (b) too bitter/harsh, (c) too weak/watery, or (d) pretty good as-is?"
   Then TELL them the fix: sour = finer grind or hotter water, bitter = coarser or cooler, weak = more coffee, good = keep it.

After covering these areas (typically 3-4 exchanges), end your message with EXACTLY:

---EXTRACT---
{"beanName":"exact bean name from AVAILABLE BEANS list","aroma":"...","firstSip":"...","acidity":"...","sweetness":"...","body":"...","finish":"...","oneWord":"...","notes":"...","changeTomorrow":"...","rating":0}
---END---

For beanName: use the bean the user is clearly tasting. Match it EXACTLY to one of the AVAILABLE BEANS names. If unclear, use the pre-selected bean name.
For rating, suggest 1-5 stars based on enthusiasm. 0 if unclear.
Keep values concise (2-8 words). Use "" for fields not discussed.`;
}

export async function sendTastingMessage(systemPrompt, history) {
  const data = await callClaude({
    system: systemPrompt,
    messages: history.slice(-10),
    maxTokens: 1000,
  });
  return data.content?.map(c => c.text || '').join('') || 'Sorry, something went wrong.';
}

export function buildChatContext(beans, tastings) {
  const active = beans.filter(b => b.status === 'ACTIVE').map(b => {
    const ps = getPeakStatus(b);
    return `  Atmos #${b.atmosSlot}: ${b.roaster} — ${b.name} (${b.origin}) | ${b.variety} ${b.process} | ${ps.days}d post-roast (${ps.label}) | Opened: ${b.openDate} (${daysOpen(b.openDate)}d ago) | Notes: ${b.bagNotes}`;
  }).join('\n');

  const sealed = beans.filter(b => b.status === 'SEALED').map(b => {
    const ps = getPeakStatus(b);
    return `  ${b.roaster} — ${b.name} (${b.origin}) | ${b.variety} ${b.process} | ${b.bagSize}g | ${ps.days}d post-roast (${ps.label}) | Notes: ${b.bagNotes}`;
  }).join('\n');

  const finished = beans.filter(b => b.status === 'FINISHED').slice(0, 5).map(b =>
    `  ${b.roaster} — ${b.name} (${b.origin}) | Finished: ${b.finishDate}`
  ).join('\n');

  const recentTastings = tastings.slice(0, 5).map(t => {
    const bean = beans.find(x => x.id === t.beanId);
    return `  ${t.date}: ${bean?.name || '?'} — ${t.oneWord || ''} ${t.rating ? '★'.repeat(t.rating) : ''} — ${t.notes || ''}`;
  }).join('\n');

  return `You are Tal's coffee assistant. You have access to his REAL, CURRENT coffee data. NEVER suggest beans that are already finished or opened. Only recommend from SEALED inventory.

${BREWING_KNOWLEDGE}

TODAY: ${today()}

ACTIVE ROTATION (Atmos canisters):
${active || '  (none)'}

SEALED INVENTORY:
${sealed || '  (none)'}

RECENTLY FINISHED:
${finished || '  (none)'}

RECENT TASTINGS:
${recentTastings || '  (none)'}

ROTATION RULES:
- Keep 3 beans active (Atmos #1–#3)
- Priority: (1) Already opened, (2) In/approaching peak window, (3) Smaller bags first
- Apollon's Gold: Degas 35–45 days, Peak 60–90 days post-roast, 1:17.5–1:19 ratio, 90–93°C
- Other roasters without guidance: rest 7–14 days, general peak 14–60 days
- After opening (Atmos): finish within 2–4 weeks; 100g bags within 7–14 days
- Bag-stated guidance always overrides defaults

Be concise, warm, and opinionated. If recommending a bean, explain WHY based on timing and variety.

PHOTO HANDLING:
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
}

export async function sendChatMessage(systemPrompt, history) {
  // Route images through Gemini for vision, then pass text description to Claude
  const recentMessages = history.slice(-10);
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
    maxTokens: 1200,
  });
  return data.content?.map(c => c.text || '').join('') || 'Sorry, something went wrong.';
}
