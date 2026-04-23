// Roaster profiles — expanded from 14 to 60+ with tiered fuzzy matching

export const ROAST_STYLE_CATEGORIES = {
  'nordic-ultra-light': { degasMin: 10, degasMax: 14, peakStart: 21, peakEnd: 60, label: 'Nordic / Ultra-Light' },
  'specialty-light':    { degasMin: 7, degasMax: 14, peakStart: 14, peakEnd: 60, label: 'Specialty Light' },
  'medium':             { degasMin: 5, degasMax: 10, peakStart: 10, peakEnd: 45, label: 'Medium' },
  'dark':               { degasMin: 3, degasMax: 7, peakStart: 7, peakEnd: 30, label: 'Dark' },
  'extended-rest':      { degasMin: 35, degasMax: 45, peakStart: 60, peakEnd: 90, label: 'Extended Rest' },
};

// Each roaster maps to a style category key
const ROASTER_STYLE_MAP = {
  // Nordic / Ultra-Light
  "Koppi": 'nordic-ultra-light',
  "Prodigal": 'nordic-ultra-light',
  "La Cabra": 'nordic-ultra-light',
  "Coffee Collective": 'nordic-ultra-light',
  "Drop Coffee": 'nordic-ultra-light',
  "Tim Wendelboe": 'nordic-ultra-light',
  "April Coffee": 'nordic-ultra-light',
  "Gardelli": 'nordic-ultra-light',
  "Casino Mocca": 'nordic-ultra-light',
  "Square Mile": 'nordic-ultra-light',
  "The Barn": 'nordic-ultra-light',
  "Friedhats": 'nordic-ultra-light',
  "Nomad": 'nordic-ultra-light',
  "Manhattan Coffee Roasters": 'nordic-ultra-light',
  "Nordic Approach": 'nordic-ultra-light',

  // Specialty Light
  "SEY": 'specialty-light',
  "Onyx": 'specialty-light',
  "Dayglow": 'specialty-light',
  "Dayglow Promethium": 'specialty-light',
  "Leaves Tokyo": 'specialty-light',
  "Momos Coffee": 'specialty-light',
  "Wonderstate": 'specialty-light',
  "George Howell": 'specialty-light',
  "Counter Culture": 'specialty-light',
  "Intelligentsia": 'specialty-light',
  "Stumptown": 'specialty-light',
  "Heart": 'specialty-light',
  "Proud Mary": 'specialty-light',
  "Little Wolf": 'specialty-light',
  "Passenger": 'specialty-light',
  "Regalia": 'specialty-light',
  "Devocion": 'specialty-light',
  "Black & White": 'specialty-light',
  "Brandywine": 'specialty-light',
  "Sightglass": 'specialty-light',
  "Verve": 'specialty-light',
  "Blue Bottle": 'specialty-light',
  "Equator": 'specialty-light',
  "Temple": 'specialty-light',
  "Huckleberry": 'specialty-light',
  "Cat & Cloud": 'specialty-light',
  "Methodical": 'specialty-light',
  "Tandem": 'specialty-light',
  "Ruby": 'specialty-light',
  "Madcap": 'specialty-light',
  "Ceremony": 'specialty-light',
  "PT's": 'specialty-light',
  "Merit": 'specialty-light',
  "Olympia": 'specialty-light',
  "Sweet Bloom": 'specialty-light',
  "Luna": 'specialty-light',
  "JBC": 'specialty-light',
  "Parlor": 'specialty-light',

  // Medium
  "Peet's": 'medium',
  "La Colombe": 'medium',
  "Lavazza": 'medium',
  "Illy": 'medium',

  // Extended Rest
  "Apollon's Gold": 'extended-rest',
};

// Build ROASTER_PROFILES from style map
export const ROASTER_PROFILES = {};
for (const [name, styleKey] of Object.entries(ROASTER_STYLE_MAP)) {
  const style = ROAST_STYLE_CATEGORIES[styleKey];
  ROASTER_PROFILES[name] = {
    degasMin: style.degasMin,
    degasMax: style.degasMax,
    peakStart: style.peakStart,
    peakEnd: style.peakEnd,
    category: style.label,
    guidance: `${style.label} · Degas ${style.degasMin}–${style.degasMax}d · Peak ${style.peakStart}–${style.peakEnd}d`,
  };
}

export const DEFAULT_PROFILE = {
  degasMin: 7, degasMax: 14, peakStart: 14, peakEnd: 60,
  category: "Specialty Light (default)",
  guidance: "Specialty Light · Degas 7–14d · Peak 14–60d (est.)",
};

// Short-name aliases for common roasters
export const ROASTER_ALIASES = {
  'sey': 'SEY',
  "pt's": "PT's",
  "pts": "PT's",
  "pts coffee": "PT's",
  'bw': 'Black & White',
  'b&w': 'Black & White',
  'cc': 'Counter Culture',
  'gcr': 'George Howell',
  'manhattan': 'Manhattan Coffee Roasters',
  'cat and cloud': 'Cat & Cloud',
};

const NOISE_WORDS = new Set(['coffee', 'roasters', 'roasting', 'co', 'the', 'company']);

function normalize(str) {
  return str.toLowerCase().trim();
}

function scoreRoasterMatch(input, candidate) {
  const a = normalize(input), b = normalize(candidate);
  if (a === b) return 100;
  if (b.startsWith(a) && a.length >= 3) return 85;
  if (a.startsWith(b) && b.length >= 3) return 80;
  const aWords = a.split(/\s+/), bWords = b.split(/\s+/);
  if (aWords.length > 1 && aWords.every(w => bWords.includes(w))) return 75;
  const sigA = aWords.filter(w => !NOISE_WORDS.has(w) && w.length >= 3);
  const sigB = bWords.filter(w => !NOISE_WORDS.has(w) && w.length >= 3);
  for (const sw of sigA) {
    if (sigB.some(cw => cw === sw)) return 70;
  }
  return 0;
}

export const getProfileForRoaster = (roasterName, bean = null) => {
  if (!roasterName) return DEFAULT_PROFILE;

  // Direct match
  if (ROASTER_PROFILES[roasterName]) return ROASTER_PROFILES[roasterName];

  const lower = normalize(roasterName);

  // Alias lookup
  const aliasTarget = ROASTER_ALIASES[lower];
  if (aliasTarget && ROASTER_PROFILES[aliasTarget]) return ROASTER_PROFILES[aliasTarget];

  // Explicit user-set roaster style beats automated fuzzy matching
  if (bean?.roasterStyle && ROAST_STYLE_CATEGORIES[bean.roasterStyle]) {
    const style = ROAST_STYLE_CATEGORIES[bean.roasterStyle];
    return { ...style, category: style.label, guidance: `${style.label} (user-set)` };
  }

  // Tiered fuzzy match
  let bestScore = 0;
  let bestMatch = null;
  for (const key of Object.keys(ROASTER_PROFILES)) {
    const score = scoreRoasterMatch(roasterName, key);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = key;
    }
  }
  if (bestScore >= 60 && bestMatch) return ROASTER_PROFILES[bestMatch];

  // Infer from bean's roast level
  if (bean?.roastLevel) {
    const rl = normalize(bean.roastLevel);
    if (rl.includes('light') || rl.includes('nordic')) {
      return { ...ROAST_STYLE_CATEGORIES['specialty-light'], category: 'Specialty Light (inferred)', guidance: `Inferred from roast level: ${bean.roastLevel}` };
    }
    if (rl.includes('medium')) {
      return { ...ROAST_STYLE_CATEGORIES['medium'], category: 'Medium (inferred)', guidance: `Inferred from roast level: ${bean.roastLevel}` };
    }
    if (rl.includes('dark')) {
      return { ...ROAST_STYLE_CATEGORIES['dark'], category: 'Dark (inferred)', guidance: `Inferred from roast level: ${bean.roastLevel}` };
    }
  }

  return DEFAULT_PROFILE;
};
