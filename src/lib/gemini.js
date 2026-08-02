// Gemini API helpers -- all calls go through /api/gemini serverless proxy
// No Google SDK in the browser. No API key in client code.
import { API_BASE } from './apiBase';
import { fetchWithRetry } from './fetchWithRetry';
import { normalizeSourceInsights } from './sourceInsights';

const PROXY_URL = `${API_BASE}/api/gemini`;

export async function callGemini({ model, contents, systemInstruction, maxTokens = 1500, tools, retries = 2, metered = false, feature, responseMimeType }) {
  const body = { model, contents, systemInstruction, maxTokens };
  if (tools) body.tools = tools;
  if (metered) body.metered = true;
  if (feature) body.feature = feature;
  if (responseMimeType) body.responseMimeType = responseMimeType;
  return fetchWithRetry({ url: PROXY_URL, body, retries, serviceName: 'Gemini' });
}

// --- Bean label scanning (multi-photo, deep analysis) via Gemini 2.5 Flash ---

export async function scanBeanLabel(photos) {
  const imageParts = photos.map(p => ({
    inlineData: { mimeType: p.mediaType, data: p.base64 },
  }));

  const scanPrompt = `You are an expert specialty coffee label reader. You have been given ${photos.length} photo(s) of a coffee bag.

STEP 1 -- QUALITY CHECK:
If ALL images are too blurry, dark, or unreadable to extract meaningful information, respond with ONLY:
{"error": "Photo too blurry or unreadable. Please take a clearer photo."}

STEP 2 -- EXHAUSTIVE TEXT EXTRACTION:
Read EVERY piece of text visible across ALL images -- front label, back label, side panels, small print, stamps, stickers, handwritten notes, QR code labels, everything.

CRITICAL: Text on coffee packaging is often ROTATED, VERTICAL, SIDEWAYS, or in unusual orientations. Scan the entire image in all directions. Do NOT skip text just because it's rotated 90, upside-down, or along an edge. Read every word on every surface.

Pay special attention to:
- Varietal names in different fonts/sizes/orientations (e.g., GEISHA, BOURBON, SL28, CATURRA, TYPICA)
- Processing methods (often printed vertically or on side panels) -- read the EXACT text, don't simplify
- Producer/farm names that may be in smaller text or rotated
- Altitude/elevation (e.g., "1800-2100 masl")
- Region names (e.g., Huila, Yirgacheffe, Nyeri)
- Roast level indicators
- Tasting/flavor notes
- Roast dates (look for "roasted on", "roast date", handwritten/stamped dates, stickers -- common formats: "17 Feb 2026", "Feb 17", "02/17/2026", "2026-02-17", "JUN 05 2026")
  - Date text may be separated from the words "Roast Date" by a line break, stamp, seal, or rotated side panel. Read the label plus the adjacent printed/stamped date together.
  - Month names may be all-caps month abbreviations, e.g. "JUN 05 2026" means 2026-06-05.
- Best-by / consume-by / shelf life info (e.g. "consume within 3 months", "best within 6 weeks of roast", "90 days")
- Weight/bag size
- Pamphlet/card/source insert language, including tasting committee notes, roaster explanations, sensory charts, brew suggestions, selector notes, and farm/provenance stories

STEP 3 -- DATE CANDIDATE SWEEP:
Before choosing roastDate, visually find every date-looking text string across all images. This includes numeric dates, month-word dates, all-caps month stamps, handwritten dates, printed stickers, side-panel stamps, and dates next to seals or icons.
For each date candidate, classify what it most likely means from its nearest label and local visual context:
- Roast date: labels or nearby words like "roast date", "roasted on", "roasted", "roasting date", "roasted in [place] on [date]", or a stamped date immediately adjacent to "Roast Date".
- Best-by / consume-by / shelf-life: labels like "best by", "best before", "use by", "consume by", "enjoy by", "expiry", "BB", or "EXP". Do NOT use these as roastDate.
- Harvest / crop / lot / competition date: labels like "harvest", "crop", "arrival", "auction", "lot", "selected", or "competition". Do NOT use these as roastDate.
- If multiple roast-date candidates are visible, prefer the one physically closest to a roast-date label or the actual coffee bag label over a pamphlet or marketing text.
- If a date-looking string is visible but the nearest label clearly says best-by, harvest, lot, or expiry, keep roastDate empty unless another explicit roast date exists.
- If a date is visually next to "Roast Date" but separated by a line break, rotated orientation, stamp, logo, or seal, still treat it as the roast date.

STEP 4 -- CURATOR vs ROASTER:
IMPORTANT: Some images may show a SUBSCRIPTION SERVICE or CURATOR brand (e.g., Dayglow, Trade, Angels' Cup, Yes Plz, Cat & Cloud marketplace) -- this is NOT the roaster. The actual roaster is the company that ROASTED the coffee (usually on the label/box itself).
- If a curator/subscription service is present: set "roaster" to "Curator (Actual Roaster)" format, e.g., "Dayglow (Promethium Coffee)"
- Set "sourcedBy" to the curator name alone, e.g., "Dayglow"
- NEVER use the curator name as the coffee name

STEP 5 -- CROSS-REFERENCE:
Cross-reference information across all provided images. Back labels often have details missing from the front.
If an image is a pamphlet/card/insert that discusses the same coffee, treat it as high-priority source evidence. If the same sheet mentions multiple coffees, only extract source insights that match the target coffee by name, variety, origin, process, or roaster.

STEP 6 -- COFFEE NAME:
- If the bag has an explicit coffee name or lot name, use it
- If there is NO explicit name, construct one from farm/estate + variety, e.g., "El Placer Geisha", "La Palma Caturra"
- If only variety is known, use origin + variety, e.g., "Colombia Geisha"
- NEVER use the roaster name or curator name as the coffee name

STEP 7 -- STRUCTURED OUTPUT:
Respond with ONLY a valid JSON object (no markdown, no backticks, no explanation):
Keep all narrative sourceInsight fields concise. Do not transcribe full paragraphs from pamphlets/cards/inserts; summarize them.

{
  "roaster": "roaster/brand name (or 'Curator (Roaster)' format if subscription)",
  "name": "coffee name, lot name, or constructed Farm+Variety name",
  "origin": "country",
  "variety": "coffee variety/cultivar if shown",
  "process": "EXACT processing method as printed on bag (e.g. Washed, Natural, Honey, Black Honey, White Honey, Anaerobic Washed, Anaerobic Natural, Anaerobic Honey, Anaerobic White Honey, Advanced Natural, Carbonic Maceration, Lactic Fermentation, Double Washed, Wet-Hulled, Infused / Co-Fermented, or Other)",
  "roastDate": "YYYY-MM-DD if shown, otherwise empty string",
  "bagSize": number in grams (default 100 if not shown),
  "bagNotes": "tasting notes from the bag, separated by ' / '",
  "producer": "farm or producer name if shown",
  "region": "specific region/area within the country if shown",
  "altitude": "altitude if shown (e.g. '1800-2100 masl')",
  "farm": "specific farm/estate name if shown",
  "roastLevel": "light, medium-light, medium, medium-dark, or dark -- if indicated",
  "cupScore": "any accolades: SCA cup score, Q grade, competition wins, championships, awards (e.g. '87.5', '1st Place Italian Roasting Championship 2026', 'Best of Panama 2025')",
  "brewingRec": "any brewing recommendations on the bag",
  "sourcedBy": "subscription service or curator if different from roaster",
  "shelfLife": "shelf life or consume-by guidance from the bag (e.g. '3 months', '90 days', 'best within 6 weeks of roast')",
  "roastedIn": "country or city where the coffee was ROASTED (not the origin country of the beans) -- look for 'roasted in', 'torrefazione', roastery location, city/country on the roaster's branding",
  "sourceInsights": {
    "sourceType": "bag | pamphlet | card | insert | mixed",
    "sourceSummary": "concise summary of the pamphlet/card/source interpretation for THIS coffee",
    "roasterContext": "roaster philosophy, intent, or direct roaster language about this coffee",
    "selectorContext": "curator/selector context if present",
    "tastingCommittee": "committee, evaluator, or cupping-panel notes if present",
    "sensoryDescriptors": ["descriptor 1", "descriptor 2"],
    "sensoryAxes": {
      "fragranceAroma": number from 1-10 if shown,
      "acidity": number from 1-10 if shown,
      "sweetness": number from 1-10 if shown,
      "body": number from 1-10 if shown,
      "flavor": number from 1-10 if shown,
      "balance": number from 1-10 if shown,
      "aftertaste": number from 1-10 if shown
    },
    "brewGuidance": "source brew guidance, ratios, temperatures, grind hints, or extraction advice if present",
    "provenance": "producer, farm, region, altitude, selection, or production story from the source",
    "extractedTextSummary": "bounded summary of other relevant source text",
    "extractionWarnings": "ambiguity warnings, such as a sheet containing multiple coffees",
    "brewRecipes": [{"id":"source recipe id","mode":"hot or iced","device":"v60","configuration":"V60 02 if stated","status":"original | scaled | adapted | aggregated","author":"original author","canonicalUrl":"canonical URL","publication":"publication context","doseGrams": number,"ratio": number,"temperatureC": number or null,"grind":"exact description or empty","geometry":"pour geometry or empty","cadence":"timed cadence or empty","agitation":"agitation or empty","guideSeconds": number or null,"adaptation":"changes made by the app or empty","changedFields":["field names"]}]
  }
}

If a field is not visible, use an empty string (or 100 for bagSize). If no pamphlet/card/source insight is visible, set "sourceInsights" to null. For roastDate: first perform the DATE CANDIDATE SWEEP above, then return the best roast-date candidate only when visual context supports it. Look for "roasted on", "roast date", "roasting date", handwritten/stamped dates, date stickers -- convert to YYYY-MM-DD. Common formats: "17 Feb 2026", "Feb 17", "02/17/2026", "JUN 05 2026". Dates may be printed vertically or separated from the words "Roast Date"; all-caps month stamps like "JUN 05 2026" should be returned as "2026-06-05". If NO explicit roast date is found anywhere on the bag, return an EMPTY STRING -- do NOT guess or use today's date. Do NOT use best-by, best-before, expiry, harvest, crop, lot, arrival, auction, or competition dates as roastDate.`;

  // Bean scan IS the metered action for the aiScans free-tier counter.
  // This call burns one credit. Research enrichment + image analysis are
  // separate calls that don't pass `metered: true`.
  const data = await callGemini({
    contents: [{
      parts: [...imageParts, { text: scanPrompt }],
    }],
    maxTokens: 4000,
    metered: true,
    feature: 'beanScan',
    responseMimeType: 'application/json',
  });

  const text = data.text || '';
  const clean = text.replace(/```(?:json)?/gi, '').trim();
  const jsonMatch = clean.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    if (data.finishReason === 'MAX_TOKENS') {
      throw new Error('The scan found a lot of label text and ran long. Please try again with fewer photos, or crop the insert closer.');
    }
    throw new Error('The scan result came back in a format I could not read. Please try again.');
  }
  let parsed;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    if (data.finishReason === 'MAX_TOKENS') {
      throw new Error('The scan found a lot of label text and ran long. Please try again with fewer photos, or crop the insert closer.');
    }
    throw new Error('The scan result came back incomplete. Please try again.');
  }

  if (parsed.error) {
    throw new Error(parsed.error);
  }

  parsed.sourceInsights = normalizeSourceInsights(parsed.sourceInsights);
  return parsed;
}

// --- Web search + Reddit research for bean enrichment via Gemini search grounding ---

// `metered` defaults to false because this function is most often called
// as the post-scan enrichment step (already charged). Set `metered: true`
// when called standalone from the AI Fill manual-entry flow, where it IS
// the chargeable action.
export async function researchBeanOnline(extractedData, { metered = false } = {}) {
  const { roaster, name, origin, variety, sourcedBy } = extractedData;
  const searchParts = [roaster, name, origin, variety, sourcedBy].filter(Boolean);
  if (searchParts.length < 2) {
    throw new Error('Not enough data to search');
  }

  const searchContext = searchParts.join(' ');

  const data = await callGemini({
    systemInstruction: `You are a specialty coffee researcher. Search for this EXACT coffee online and fill in missing details. Also search Reddit (r/coffee, r/specialtycoffee, r/pourover) for community reviews and tasting notes.

CRITICAL RULES:
- Only fill fields where you are CONFIDENT in the data -- no guessing
- Bag data takes precedence -- you are only filling EMPTY fields
- Be careful not to attribute information from a different coffee by the same roaster
- If you find conflicting information, prefer the roaster's own website
- Include any Reddit community tasting notes or reviews you find in the redditNotes field
- Return ONLY a valid JSON object (no markdown, no backticks)`,
    metered,
    contents: [{
      parts: [{ text: `Search online for this specialty coffee and find additional details:

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
  "cupScore": "SCA score, competition wins, awards, or championships if available",
  "brewingRec": "any brewing recommendations from the roaster",
  "variety": "variety if found and not already known",
  "process": "process if found and not already known",
  "sourcedBy": "retailer/selector if applicable",
  "producer": "producer name if found",
  "roastedIn": "city/country where the coffee is roasted (roastery location)",
  "roasterLocation": "city and/or country where the roastery is based",
  "roasterDescription": "1-2 sentence description of the roaster's style and focus",
  "roasterFounded": "year founded if known",
  "redditNotes": "community tasting notes or reviews from Reddit if found"
}` }],
    }],
    tools: [{ googleSearch: {} }],
    maxTokens: 1500,
    feature: 'webResearch',
  });

  const text = data.text || '';
  const clean = text.replace(/```json|```/g, '').trim();
  const jsonMatch = clean.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in research response');
  }

  return JSON.parse(jsonMatch[0]);
}

export async function searchWeb(query) {
  const data = await callGemini({
    model: 'gemini-2.5-flash',
    contents: [{ role: 'user', parts: [{ text: query }] }],
    tools: [{ googleSearch: {} }],
    feature: 'chatSearch',
    maxTokens: 800,
  });

  const chunks = (data.groundingMetadata?.groundingChunks || [])
    .map(chunk => ({
      title: chunk.web?.title || '',
      uri: chunk.web?.uri || '',
    }))
    .filter(chunk => chunk.title || chunk.uri);

  return {
    summaryText: data.text || '',
    chunks,
  };
}

// --- Product shot generation (server-side: generate + convert + upload + write to Firestore) ---
// Returns { photoUrl } string. Server handles everything including Firebase Storage upload.

export async function generateProductShot(photo, beanId, { skipFirestoreWrite = false } = {}) {
  const data = await fetchWithRetry({
    url: `${API_BASE}/api/product-shot`,
    body: { photo: { base64: photo.base64, mimeType: photo.mediaType }, beanId, skipFirestoreWrite },
    serviceName: 'Product Shot',
    retries: 0,
    timeout: 90000, // server has 90s maxDuration
  });

  if (!data.photoUrl) {
    throw new Error('No photo URL returned');
  }

  return data.photoUrl;
}

// Delete an orphaned product shot from Storage (for cancel/rescan cleanup)
export async function deleteProductShot(beanId) {
  return fetchWithRetry({
    url: `${API_BASE}/api/product-shot`,
    body: { action: 'delete', beanId },
    serviceName: 'Product Shot Cleanup',
    retries: 0,
    timeout: 10000,
  }).catch(() => {}); // best-effort, silent on failure
}

// --- Vision description for chat image routing ---

export async function describeImage(photos) {
  const imageParts = photos.map(p => ({
    inlineData: { mimeType: p.mediaType, data: p.base64 },
  }));

  const data = await callGemini({
    contents: [{
      parts: [
        ...imageParts,
        { text: 'Describe this image in detail. If it is a coffee bag, read all visible text including roaster name, coffee name, origin, variety, process, roast date, tasting notes, and any other information. Include text from all orientations (rotated, vertical, sideways).' },
      ],
    }],
    maxTokens: 800,
    feature: 'imageAnalysis',
  });

  return data.text || '';
}

// --- Summarize bag tasting notes into a short phrase ---

export async function summarizeNotes(bagNotes) {
  if (!bagNotes || bagNotes === '(not logged)') return null;

  try {
    const data = await callGemini({
      contents: [{
        role: 'user',
        parts: [{ text: `Summarize these coffee tasting notes as 3-4 comma-separated descriptors (max 40 chars total). Format: "word, word, word" - always use commas between descriptors, lowercase, no period. Output only the phrase. Notes: ${bagNotes}` }],
      }],
      systemInstruction: 'You return ONLY a final short phrase. Never show reasoning, thinking, or explanation. Never use prefixes like THINK:, THOUGHTS:, ANSWER:. Output the answer directly.',
      metered: false,
      maxTokens: 500,
      feature: 'noteSummary',
    });

    let text = (data.text || '').trim();
    text = text.replace(/^(THINK|THOUGHTS?|ANSWER|REASONING)[:\s]*/i, '').trim();
    text = text.split('\n')[0].trim();
    if (text.length > 40) {
      const cut = text.slice(0, 40);
      const lastSpace = cut.lastIndexOf(' ');
      text = lastSpace > 20 ? cut.slice(0, lastSpace) : cut;
    }
    if (text.length < 4) return null;
    return text || null;
  } catch {
    return null;
  }
}
