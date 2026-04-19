// Tasting vocabulary glossary — seeds the teach-me sheet and the Ruphus
// {{term:key}} markers in the system prompt. Keep keys lowercase, short,
// hyphen-free; they're what the AI emits and the parser consumes.
export const TASTING_GLOSSARY = {
  smell: {
    title: 'Smell (aroma)',
    tagline: 'Most of what you "taste" is actually smell.',
    body: 'Before you sip, bring the cup to your nose. Breathe in slow — don\'t overthink it. Whatever familiar thing it reminds you of (fruit, bread, flowers, nuts) is the right answer.',
    examples: ['floral', 'stone fruit', 'chocolate', 'nutty', 'herbal', 'bready'],
    aliases: ['smell', 'aroma', 'smelling'],
  },
  aroma: {
    title: 'Aroma',
    tagline: 'What the cup smells like before and during the sip.',
    body: 'Aroma and smell overlap, but aroma includes retronasal notes — the scents you pick up from inside your mouth as you sip. Breathe out through your nose after swallowing to catch them.',
    examples: ['floral', 'fruity', 'chocolatey', 'nutty', 'spiced', 'earthy'],
    aliases: ['aroma', 'aromas', 'aromatic'],
  },
  jasmine: {
    title: 'Jasmine',
    tagline: 'A soft, sweet, tea-like floral note.',
    body: 'Common in washed Ethiopian coffees. If it reminds you of jasmine tea or honeysuckle, that\'s it. Distinct from "rose" (heavier, more perfumed) or "lavender" (herbal edge).',
    examples: ['Think: jasmine tea', 'Think: honeysuckle', 'Not: rose perfume'],
    aliases: ['jasmine', 'jasmine-like'],
  },
  acidity: {
    title: 'Acidity',
    tagline: 'The bright, lively sparkle — not sourness.',
    body: 'Think of the difference between apple juice (bright) and flat water (dull). Good acidity feels juicy and clean, like biting into fruit. It\'s how alive the cup feels.',
    examples: ['bright (lemon, lime)', 'crisp (apple, pear)', 'juicy (stone fruit)', 'soft (mellow, low)'],
    aliases: ['acidity', 'acidic', 'bright', 'brightness'],
  },
  sweetness: {
    title: 'Sweetness',
    tagline: 'Not sugar — the natural sweetness of ripe fruit or caramel.',
    body: 'Good coffee has real sweetness baked in. Think of honey, brown sugar, ripe fruit, or caramel. It\'s separate from acidity and shows up most as the cup cools.',
    examples: ['honey', 'brown sugar', 'caramel', 'ripe fruit', 'molasses'],
    aliases: ['sweetness', 'sweet', 'sweeter'],
  },
  body: {
    title: 'Body',
    tagline: 'How heavy the coffee feels in your mouth.',
    body: 'Close your eyes and pay attention to weight and texture. Light body feels like tea. Medium like orange juice. Heavy like whole milk or syrup. Not about flavor — about feel.',
    examples: ['light (tea-like)', 'medium (juice)', 'heavy (milk, syrup)', 'silky', 'creamy'],
    aliases: ['body', 'mouthfeel', 'texture', 'weight'],
  },
  finish: {
    title: 'Finish',
    tagline: 'What\'s left after you swallow.',
    body: 'Swallow, then wait a beat. Does the flavor disappear instantly, or does it linger? A long clean finish is a hallmark of quality coffee. A short or drying finish is a clue about brew or age.',
    examples: ['long & clean', 'short', 'drying', 'lingering fruit', 'cocoa tail'],
    aliases: ['finish', 'aftertaste', 'aftertastes', 'lingering'],
  },
  aftertaste: {
    title: 'Aftertaste',
    tagline: 'The echo of the cup 20 seconds later.',
    body: 'Cousin to finish, but longer. What are you still tasting half a minute after the sip? That echo is a big part of whether you reach for another cup.',
    examples: ['chocolate echo', 'dry and short', 'fruity lingering', 'clean and faded'],
    aliases: ['aftertaste', 'aftertastes'],
  },
  balance: {
    title: 'Balance',
    tagline: 'Does any one thing dominate, or do the pieces fit?',
    body: 'A balanced cup has acidity, sweetness, and body in rough proportion — nothing sticks out as too much. Imbalance isn\'t bad, it\'s a clue (too acidic → try finer grind, too bitter → coarser).',
    examples: ['balanced', 'too acidic', 'too bitter', 'flat / muted'],
    aliases: ['balance', 'balanced', 'imbalanced'],
  },
};

// Ordered list of term keys the system prompt tells Ruphus about.
export const GLOSSARY_KEYS = Object.keys(TASTING_GLOSSARY);

// Step keys must match the UI spine order in TastingTab.jsx (TASTING_STEPS).
// Ruphus emits {{step:KEY}} markers at the top of any message that BEGINS
// a new step. The UI walks messages monotonically to drive the spine.
export const STEP_KEY_TO_INDEX = {
  'smell': 0,
  'first-sip': 1,
  'acidity': 2,
  'sweetness': 3,
  'body': 4,
  'finish': 5,
};

const STEP_MARKER_RE = /\{\{step:([a-z-]+)\}\}/gi;

// Parse a Ruphus message for step markers. Returns:
//   { stepKey: 'smell' | ... | null, strippedText: string }
// - Last valid marker wins when the model emits more than one (shouldn't per
//   prompt rule, but defensive).
// - Unknown keys leave stepKey null but still strip from rendered text, so
//   prompt drift never bleeds a raw marker into the UI.
export function parseStepMarker(text) {
  if (!text) return { stepKey: null, strippedText: '' };
  const matches = [...text.matchAll(STEP_MARKER_RE)];
  if (matches.length === 0) return { stepKey: null, strippedText: text };
  let stepKey = null;
  for (const m of matches) {
    const k = m[1].toLowerCase();
    if (STEP_KEY_TO_INDEX[k] != null) stepKey = k;
  }
  const strippedText = text.replace(STEP_MARKER_RE, '').replace(/\n{3,}/g, '\n\n').trim();
  return { stepKey, strippedText };
}

// Build an alias → canonical-key lookup for the fallback keyword scanner.
const ALIAS_MAP = (() => {
  const out = {};
  for (const [key, entry] of Object.entries(TASTING_GLOSSARY)) {
    for (const alias of entry.aliases || [key]) {
      out[alias.toLowerCase()] = key;
    }
  }
  return out;
})();

// Parse a Ruphus message: split on {{term:key}} markers, returning an array
// of { type: 'text' | 'term', text, termKey }. Unknown termKeys render as
// plain text so prompt drift never produces broken UI.
export function parseTermMarkers(text) {
  if (!text) return [{ type: 'text', text: '' }];
  const pattern = /\{\{term:([a-z_-]+)\}\}([^{]+?)\{\{\/term\}\}/gi;
  const parts = [];
  let lastIndex = 0;
  let m;
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > lastIndex) parts.push({ type: 'text', text: text.slice(lastIndex, m.index) });
    const termKey = m[1].toLowerCase();
    const inner = m[2];
    if (TASTING_GLOSSARY[termKey]) {
      parts.push({ type: 'term', text: inner, termKey });
    } else {
      parts.push({ type: 'text', text: inner });
    }
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < text.length) parts.push({ type: 'text', text: text.slice(lastIndex) });
  return parts;
}

// Fallback: if Ruphus forgets to mark terms, auto-link the first occurrence
// of each known alias per message. Returns the same part-array shape so
// the renderer can stay one code path.
export function autoLinkTerms(text) {
  if (!text) return [{ type: 'text', text: '' }];
  const aliases = Object.keys(ALIAS_MAP).sort((a, b) => b.length - a.length);
  const linked = new Set();
  const parts = [];
  let cursor = 0;
  const lower = text.toLowerCase();
  while (cursor < text.length) {
    let hit = null;
    for (const alias of aliases) {
      if (linked.has(ALIAS_MAP[alias])) continue;
      const idx = lower.indexOf(alias, cursor);
      if (idx === -1) continue;
      // Word-boundary check: char before and after must not be alphanumeric.
      const before = idx > 0 ? text[idx - 1] : ' ';
      const after = text[idx + alias.length] || ' ';
      if (/[a-z0-9]/i.test(before) || /[a-z0-9]/i.test(after)) continue;
      if (!hit || idx < hit.idx) hit = { idx, alias };
    }
    if (!hit) {
      parts.push({ type: 'text', text: text.slice(cursor) });
      break;
    }
    if (hit.idx > cursor) parts.push({ type: 'text', text: text.slice(cursor, hit.idx) });
    parts.push({
      type: 'term',
      text: text.slice(hit.idx, hit.idx + hit.alias.length),
      termKey: ALIAS_MAP[hit.alias],
    });
    linked.add(ALIAS_MAP[hit.alias]);
    cursor = hit.idx + hit.alias.length;
  }
  return parts;
}

// Extract interim scorecard hints from recent Ruphus messages. Scans for
// axis-labeled phrases like "aroma: jasmine, stone fruit" or common
// descriptors. Returns { aroma, acidity, sweet, body, finish } with either
// a short string or null.
const AXIS_PATTERNS = {
  aroma: [/aroma[:\-—]\s*([^.\n]{3,60})/i, /smell[:\-—]?\s*(?:of\s+)?([^.\n]{3,60})/i],
  acidity: [/acidity[:\-—]\s*([^.\n]{3,60})/i, /(?:bright|crisp|juicy|tart|soft|mellow)\s+acidity/i],
  sweet: [/sweetness[:\-—]\s*([^.\n]{3,60})/i, /(?:honeyed|caramel|sugary|syrupy|fruit[-\s]?sweet)/i],
  body: [/body[:\-—]\s*([^.\n]{3,60})/i, /(?:light|medium|heavy|silky|creamy|syrupy|tea-like)\s+body/i],
  finish: [/finish[:\-—]\s*([^.\n]{3,60})/i, /aftertaste[:\-—]\s*([^.\n]{3,60})/i],
};

export function scanScorecard(messages) {
  const out = { aroma: null, acidity: null, sweet: null, body: null, finish: null };
  if (!messages || messages.length === 0) return out;
  const recent = messages.filter(m => m.role === 'assistant').slice(-3).map(m => m.content).join('\n');
  for (const [axis, patterns] of Object.entries(AXIS_PATTERNS)) {
    for (const p of patterns) {
      const match = recent.match(p);
      if (match) {
        const raw = (match[1] || match[0]).trim().replace(/[.,;]$/, '');
        out[axis] = raw.length > 48 ? raw.slice(0, 48) + '…' : raw;
        break;
      }
    }
  }
  return out;
}
