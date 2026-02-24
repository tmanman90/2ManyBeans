// Claude API helpers — all calls go through /api/claude serverless proxy
// No Anthropic SDK in the browser. No API key in client code.
import { today, getPeakStatus, daysOpen } from './peakStatus';

const PROXY_URL = '/api/claude';

async function callClaude({ system, messages, maxTokens = 1000, model = 'claude-sonnet-4-20250514', tools }) {
  const body = { system, messages, maxTokens, model };
  if (tools) body.tools = tools;

  const response = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status}`);
  }
  return response.json();
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

// --- Bean label scanning (multi-photo, deep analysis) ---

export async function scanBeanLabel(photos) {
  const imageBlocks = photos.map(p => ({
    type: 'image',
    source: { type: 'base64', media_type: p.mediaType, data: p.base64 },
  }));

  const data = await callClaude({
    messages: [{
      role: 'user',
      content: [
        ...imageBlocks,
        {
          type: 'text',
          text: `You are an expert specialty coffee label reader. You have been given ${photos.length} photo(s) of a coffee bag.

STEP 1 — QUALITY CHECK:
If ALL images are too blurry, dark, or unreadable to extract meaningful information, respond with ONLY:
{"error": "Photo too blurry or unreadable. Please take a clearer photo."}

STEP 2 — EXHAUSTIVE TEXT EXTRACTION:
Read EVERY piece of text visible across ALL images — front label, back label, side panels, small print, stamps, stickers, handwritten notes, QR code labels, everything.

CRITICAL: Text on coffee packaging is often ROTATED, VERTICAL, SIDEWAYS, or in unusual orientations. Scan the entire image in all directions. Do NOT skip text just because it's rotated 90°, upside-down, or along an edge. Read every word on every surface.

Pay special attention to:
- Varietal names in different fonts/sizes/orientations (e.g., GEISHA, BOURBON, SL28, CATURRA, TYPICA)
- Processing methods (often printed vertically or on side panels) — read the EXACT text, don't simplify
- Producer/farm names that may be in smaller text or rotated
- Altitude/elevation (e.g., "1800-2100 masl")
- Region names (e.g., Huila, Yirgacheffe, Nyeri)
- Roast level indicators
- Tasting/flavor notes
- Roast dates, best-by dates
- Weight/bag size

STEP 3 — CURATOR vs ROASTER:
IMPORTANT: Some images may show a SUBSCRIPTION SERVICE or CURATOR brand (e.g., Dayglow, Trade, Angels' Cup, Yes Plz, Cat & Cloud marketplace) — this is NOT the roaster. The actual roaster is the company that ROASTED the coffee (usually on the label/box itself).
- If a curator/subscription service is present: set "roaster" to "Curator (Actual Roaster)" format, e.g., "Dayglow (Promethium Coffee)"
- Set "sourcedBy" to the curator name alone, e.g., "Dayglow"
- NEVER use the curator name as the coffee name

STEP 4 — CROSS-REFERENCE:
Cross-reference information across all provided images. Back labels often have details missing from the front.

STEP 5 — COFFEE NAME:
- If the bag has an explicit coffee name or lot name, use it
- If there is NO explicit name, construct one from farm/estate + variety, e.g., "El Placer Geisha", "La Palma Caturra"
- If only variety is known, use origin + variety, e.g., "Colombia Geisha"
- NEVER use the roaster name or curator name as the coffee name

STEP 6 — STRUCTURED OUTPUT:
Respond with ONLY a valid JSON object (no markdown, no backticks, no explanation):

{
  "roaster": "roaster/brand name (or 'Curator (Roaster)' format if subscription)",
  "name": "coffee name, lot name, or constructed Farm+Variety name",
  "origin": "country",
  "variety": "coffee variety/cultivar if shown",
  "process": "EXACT processing method as printed on bag (e.g. Washed, Natural, Honey, Anaerobic Honey, Anaerobic Natural, White Honey, Anaerobic White Honey, Advanced Natural, or Other)",
  "roastDate": "YYYY-MM-DD if shown, otherwise empty string",
  "bagSize": number in grams (default 100 if not shown),
  "bagNotes": "tasting notes from the bag, separated by ' / '",
  "producer": "farm or producer name if shown",
  "region": "specific region/area within the country if shown",
  "altitude": "altitude if shown (e.g. '1800-2100 masl')",
  "farm": "specific farm/estate name if shown",
  "roastLevel": "light, medium-light, medium, medium-dark, or dark — if indicated",
  "cupScore": "SCA cup score if shown (e.g. '87.5')",
  "brewingRec": "any brewing recommendations on the bag",
  "sourcedBy": "subscription service or curator if different from roaster"
}

If a field is not visible, use an empty string (or 100 for bagSize). For roastDate, look for "roasted on", "roast date", or any date that appears to be a roast date — convert to YYYY-MM-DD. Do NOT use best-before dates as roast date.`,
        },
      ],
    }],
    maxTokens: 1200,
  });

  const text = data.content?.map(c => c.text || '').join('') || '';
  const clean = text.replace(/```json|```/g, '').trim();
  const parsed = JSON.parse(clean);

  if (parsed.error) {
    throw new Error(parsed.error);
  }

  return parsed;
}

// --- Web search research for bean enrichment ---

export async function researchBeanOnline(extractedData) {
  const { roaster, name, origin, variety, sourcedBy } = extractedData;
  const searchParts = [roaster, name, origin, variety, sourcedBy].filter(Boolean);
  if (searchParts.length < 2) {
    throw new Error('Not enough data to search');
  }

  const searchContext = searchParts.join(' ');

  const data = await callClaude({
    system: `You are a specialty coffee researcher. Search for this EXACT coffee online and fill in missing details.

CRITICAL RULES:
- Only fill fields where you are CONFIDENT in the data — no guessing
- Bag data takes precedence — you are only filling EMPTY fields
- Be careful not to attribute information from a different coffee by the same roaster
- If you find conflicting information, prefer the roaster's own website
- Return ONLY a valid JSON object (no markdown, no backticks)`,
    messages: [{
      role: 'user',
      content: `Search online for this specialty coffee and find additional details:

Coffee: ${searchContext}
${roaster ? `Roaster: ${roaster}` : ''}
${name ? `Name: ${name}` : ''}
${origin ? `Origin: ${origin}` : ''}
${variety ? `Variety: ${variety}` : ''}
${sourcedBy ? `Sourced by: ${sourcedBy}` : ''}

Return a JSON object with ONLY fields you found reliable data for. Empty string for anything uncertain:

{
  "altitude": "e.g. '1800-2100 masl'",
  "region": "specific region within the country",
  "farm": "farm or estate name",
  "roastLevel": "light, medium-light, medium, medium-dark, or dark",
  "cupScore": "SCA score if available",
  "brewingRec": "any brewing recommendations from the roaster",
  "variety": "variety if found and not already known",
  "process": "process if found and not already known",
  "sourcedBy": "retailer/selector if applicable",
  "producer": "producer name if found"
}`,
    }],
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
    maxTokens: 1500,
  });

  // Extract text blocks from response (skip tool_use/tool_result blocks)
  const textParts = (data.content || [])
    .filter(block => block.type === 'text')
    .map(block => block.text || '')
    .join('');

  const clean = textParts.replace(/```json|```/g, '').trim();
  // Find JSON in the response
  const jsonMatch = clean.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in research response');
  }

  return JSON.parse(jsonMatch[0]);
}

// --- Existing functions (unchanged) ---

export async function getRecBlurb(activeDesc, recDesc) {
  const data = await callClaude({
    system: `You're a concise specialty coffee advisor. Given a current rotation and candidate beans, write a brief 2-4 sentence analysis of why each candidate would complement the rotation. Consider: timing urgency (fading beans first), flavor variety (different origins/processes from what's active), and peak window. Be warm and opinionated. No headers or bullets — just a flowing paragraph.`,
    messages: [{ role: 'user', content: `Current rotation:\n${activeDesc || "(empty)"}\n\nTop candidates:\n${recDesc}\n\nWhy would each be a good pick?` }],
    maxTokens: 400,
  });
  return data.content?.map(c => c.text || '').join('') || '';
}

export function buildTastingSystemPrompt(beanName, allBeans = []) {
  const beanList = allBeans.length > 0
    ? `\n\nAVAILABLE BEANS:\n${allBeans.map(b => `- "${b.name}" by ${b.roaster}`).join('\n')}`
    : '';

  return `You are a patient, encouraging coffee tasting COACH helping a novice taster log a tasting. The pre-selected bean is: ${beanName}.${beanList}

CRITICAL RULES:
- Tal is learning to taste. NEVER ask vague questions like "how is it?" or "what do you notice?"
- ALWAYS give specific instructions: what to do physically, what to pay attention to, and multiple-choice options to pick from
- Teach tasting vocabulary naturally by labeling what he describes (e.g. "That funky smell? That's classic natural process fermentation!")
- Be warm, encouraging, and brief (2-3 sentences + options per turn)
- If Tal mentions a DIFFERENT bean name than the pre-selected one, use that bean instead for the extraction

GUIDED FLOW (follow this order across your turns):
1. AROMA — already asked in first message. When he responds, validate and label what he described, then move to step 2.
2. FIRST SIP — "Take a sip and let it sit on your tongue for a sec. Is it: bright/tangy like citrus? Smooth and round? Sharp/sour? Sweet right away?"
3. BODY & FINISH — "How heavy does it feel in your mouth? Light like tea, medium like juice, or thick like milk? And after you swallow — does the taste disappear quickly or linger?"
4. SWEETNESS — "How sweet is it? Barely there, noticeable, or really present?"
5. ONE WORD — "If you had to describe this whole cup in one word, what would it be?"
6. BREW DIAL-IN — Don't ask "what would you change?" Instead, run a quick diagnostic:
   "Quick check — was the cup: (a) too sour/bright, (b) too bitter/harsh, (c) too weak/watery, or (d) pretty good as-is?"
   Then TELL them the fix: sour→finer grind or hotter water, bitter→coarser or cooler, weak→more coffee, good→keep it.

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
    maxTokens: 800,
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

Be concise, warm, and opinionated. If recommending a bean, explain WHY based on timing and variety.`;
}

export async function sendChatMessage(systemPrompt, history) {
  const data = await callClaude({
    system: systemPrompt,
    messages: history.slice(-10),
    maxTokens: 1000,
  });
  return data.content?.map(c => c.text || '').join('') || 'Sorry, something went wrong.';
}
