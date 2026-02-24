// Claude API helpers — all calls go through /api/claude serverless proxy
// No Anthropic SDK in the browser. No API key in client code.
import { today, getPeakStatus, daysOpen } from './peakStatus';

const PROXY_URL = '/api/claude';

async function callClaude({ system, messages, maxTokens = 1000, model = 'claude-sonnet-4-20250514' }) {
  const response = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ system, messages, maxTokens, model }),
  });
  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status}`);
  }
  return response.json();
}

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

export async function scanBeanLabel(base64, mediaType) {
  const data = await callClaude({
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
        { type: 'text', text: `You are reading a specialty coffee bag label. Extract all info you can find and respond ONLY with a JSON object (no markdown, no backticks, no explanation). Use these exact keys:

{
  "roaster": "roaster/brand name",
  "name": "coffee name or lot name",
  "origin": "country and region if shown",
  "variety": "coffee variety/cultivar if shown",
  "process": "processing method (Washed, Natural, Honey, Anaerobic Honey, Anaerobic Natural, White Honey, Advanced Natural, or Other)",
  "roastDate": "YYYY-MM-DD if shown, otherwise empty string",
  "bagSize": number in grams (default 100 if not shown),
  "bagNotes": "tasting notes from the bag, separated by ' / '",
  "producer": "farm or producer name if shown"
}

If a field is not visible on the label, use an empty string (or 100 for bagSize). For roastDate, look for "roasted on", "roast date", or any date that appears to be a roast date — convert to YYYY-MM-DD format. For best-before dates, do NOT use those as roast date.` }
      ]
    }],
    maxTokens: 1000,
  });
  const text = data.content?.map(c => c.text || '').join('') || '';
  const clean = text.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}
