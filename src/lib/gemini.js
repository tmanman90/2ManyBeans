// Gemini API helpers -- all calls go through /api/gemini serverless proxy
// No Google SDK in the browser. No API key in client code.
import { API_BASE } from './apiBase';
import { fetchWithRetry } from './fetchWithRetry';

const PROXY_URL = `${API_BASE}/api/gemini`;

export async function callGemini({ model, contents, systemInstruction, maxTokens = 1500, tools, retries = 2, metered = false }) {
  const body = { model, contents, systemInstruction, maxTokens };
  if (tools) body.tools = tools;
  // `metered: true` opts in to the free-tier quota counter on the server.
  // Only the bean-scan call site sets this flag — research enrichment,
  // chat image analysis, and other Gemini calls do NOT count against the
  // user's free scan quota. See review todo 005.
  if (metered) body.metered = true;
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
- Roast dates (look for "roasted on", "roast date", handwritten/stamped dates, stickers -- common formats: "17 Feb 2026", "Feb 17", "02/17/2026", "2026-02-17")
- Best-by / consume-by / shelf life info (e.g. "consume within 3 months", "best within 6 weeks of roast", "90 days")
- Weight/bag size

STEP 3 -- CURATOR vs ROASTER:
IMPORTANT: Some images may show a SUBSCRIPTION SERVICE or CURATOR brand (e.g., Dayglow, Trade, Angels' Cup, Yes Plz, Cat & Cloud marketplace) -- this is NOT the roaster. The actual roaster is the company that ROASTED the coffee (usually on the label/box itself).
- If a curator/subscription service is present: set "roaster" to "Curator (Actual Roaster)" format, e.g., "Dayglow (Promethium Coffee)"
- Set "sourcedBy" to the curator name alone, e.g., "Dayglow"
- NEVER use the curator name as the coffee name

STEP 4 -- CROSS-REFERENCE:
Cross-reference information across all provided images. Back labels often have details missing from the front.

STEP 5 -- COFFEE NAME:
- If the bag has an explicit coffee name or lot name, use it
- If there is NO explicit name, construct one from farm/estate + variety, e.g., "El Placer Geisha", "La Palma Caturra"
- If only variety is known, use origin + variety, e.g., "Colombia Geisha"
- NEVER use the roaster name or curator name as the coffee name

STEP 6 -- STRUCTURED OUTPUT:
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
  "roastLevel": "light, medium-light, medium, medium-dark, or dark -- if indicated",
  "cupScore": "any accolades: SCA cup score, Q grade, competition wins, championships, awards (e.g. '87.5', '1st Place Italian Roasting Championship 2026', 'Best of Panama 2025')",
  "brewingRec": "any brewing recommendations on the bag",
  "sourcedBy": "subscription service or curator if different from roaster",
  "shelfLife": "shelf life or consume-by guidance from the bag (e.g. '3 months', '90 days', 'best within 6 weeks of roast')",
  "roastedIn": "country or city where the coffee was ROASTED (not the origin country of the beans) -- look for 'roasted in', 'torrefazione', roastery location, city/country on the roaster's branding"
}

If a field is not visible, use an empty string (or 100 for bagSize). For roastDate: look for "roasted on", "roast date", handwritten/stamped dates, date stickers -- convert to YYYY-MM-DD. Common formats: "17 Feb 2026", "Feb 17", "02/17/2026". If NO explicit roast date is found anywhere on the bag, return an EMPTY STRING -- do NOT guess or use today's date. Do NOT use best-before dates as roast date.`;

  // Bean scan IS the metered action for the aiScans free-tier counter.
  // This call burns one credit. Research enrichment + image analysis are
  // separate calls that don't pass `metered: true`.
  const data = await callGemini({
    contents: [{
      parts: [...imageParts, { text: scanPrompt }],
    }],
    maxTokens: 2500,
    metered: true,
  });

  const text = data.text || '';
  const clean = text.replace(/```json|```/g, '').trim();
  const jsonMatch = clean.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Could not read the label. Please try a clearer photo.');
  }
  const parsed = JSON.parse(jsonMatch[0]);

  if (parsed.error) {
    throw new Error(parsed.error);
  }

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
  "redditNotes": "community tasting notes or reviews from Reddit if found"
}` }],
    }],
    tools: [{ googleSearch: {} }],
    maxTokens: 1500,
  });

  const text = data.text || '';
  const clean = text.replace(/```json|```/g, '').trim();
  const jsonMatch = clean.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in research response');
  }

  return JSON.parse(jsonMatch[0]);
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
