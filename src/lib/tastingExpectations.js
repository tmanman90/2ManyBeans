// tastingExpectations — the wizard's "intelligence." Pure, deterministic, no AI.
// Given a bean, predict() returns a STRUCTURED expected flavor profile (per-axis 0–10
// levels + labels, hero descriptors, per-step coaching cues, a one-line summary) derived
// from origin × process × roast × altitude. Grounds Ruphus's predict-then-confirm coaching.
// Source: docs/research/2026-06-29-tasting-methodology-brief.md (Hoffmann §7/§2/§3/§8) +
// the prose in coffeeKnowledge.js ORIGIN_PROFILES, structured here into queryable data.

// --- Per-origin baselines (acidity / body / sweetness on 0–10 + hero descriptors) ---
const ORIGINS = {
  ethiopia:        { acidity: 8, body: 3, sweetness: 6, hero: ['jasmine', 'bergamot', 'citrus', 'peach'], note: 'floral and tea-like' },
  kenya:           { acidity: 9, body: 6, sweetness: 6, hero: ['blackcurrant', 'berry', 'tomato'], note: 'intense and juicy' },
  colombia:        { acidity: 6, body: 6, sweetness: 7, hero: ['caramel', 'red fruit', 'cocoa'], note: 'balanced and sweet' },
  brazil:          { acidity: 3, body: 8, sweetness: 7, hero: ['chocolate', 'peanut', 'nutty'], note: 'heavy and chocolatey' },
  guatemala:       { acidity: 6, body: 6, sweetness: 7, hero: ['cocoa', 'brown sugar', 'orange'], note: 'cocoa with gentle fruit' },
  'costa rica':    { acidity: 6, body: 4, sweetness: 7, hero: ['honey', 'citrus', 'almond'], note: 'clean and sweet' },
  'el salvador':   { acidity: 5, body: 5, sweetness: 8, hero: ['caramel', 'red apple', 'almond'], note: 'soft and very sweet' },
  honduras:        { acidity: 6, body: 5, sweetness: 7, hero: ['caramel', 'stone fruit', 'cocoa'], note: 'lively and juicy' },
  panama:          { acidity: 7, body: 3, sweetness: 7, hero: ['jasmine', 'bergamot', 'tropical'], note: 'floral and delicate' },
  rwanda:          { acidity: 7, body: 5, sweetness: 7, hero: ['red apple', 'grape', 'berry'], note: 'juicy and floral' },
  burundi:         { acidity: 7, body: 5, sweetness: 7, hero: ['berry', 'grapefruit', 'red fruit'], note: 'bright and juicy' },
  tanzania:        { acidity: 7, body: 5, sweetness: 6, hero: ['berry', 'citrus', 'black tea'], note: 'bright and lively' },
  indonesia:       { acidity: 2, body: 9, sweetness: 5, hero: ['earthy', 'cedar', 'spice'], note: 'heavy and earthy' },
  sumatra:         { acidity: 2, body: 9, sweetness: 5, hero: ['earthy', 'cedar', 'spice'], note: 'heavy and earthy' },
  india:           { acidity: 3, body: 8, sweetness: 6, hero: ['dark chocolate', 'spice', 'nutty'], note: 'heavy and low-acid' },
  yemen:           { acidity: 6, body: 7, sweetness: 6, hero: ['dried fruit', 'spice', 'cocoa'], note: 'wild and complex' },
  mexico:          { acidity: 5, body: 5, sweetness: 7, hero: ['caramel', 'toffee', 'chocolate'], note: 'sweet and mild' },
  peru:            { acidity: 5, body: 5, sweetness: 6, hero: ['cocoa', 'almond', 'caramel'], note: 'clean and soft' },
  nicaragua:       { acidity: 6, body: 5, sweetness: 7, hero: ['cocoa', 'red fruit', 'honey'], note: 'clean and fruity' },
  'papua new guinea': { acidity: 6, body: 6, sweetness: 7, hero: ['brown sugar', 'tropical fruit', 'creamy'], note: 'buttery and sweet' },
  uganda:          { acidity: 5, body: 6, sweetness: 7, hero: ['dark fruit', 'cocoa', 'sweet'], note: 'sweet with dark fruit' },
};
const DEFAULT_ORIGIN = { acidity: 6, body: 5, sweetness: 6, hero: ['caramel', 'fruit', 'cocoa'], note: 'balanced' };

// --- Process modifiers (Hoffmann §2 / §8) ---
const PROCESS = {
  washed:        { dA: +1, dB: -1, clean: true, addHero: [] },
  natural:       { dA: -2, dB: +2, clean: false, addHero: ['blueberry', 'strawberry', 'tropical fruit'] },
  honey:         { dA: 0,  dB: +1, dS: +1, clean: true, addHero: ['honey'] },
  'pulped natural': { dA: 0, dB: +1, dS: +1, clean: true, addHero: ['honey'] },
  'semi-washed': { dA: -2, dB: +2, clean: false, addHero: ['earthy', 'spice'] },
};

// --- Roast modifiers (Hoffmann §3) ---
const ROAST = {
  light:  { dA: +1, originBoost: true, addHero: [] },
  medium: { dS: +1, addHero: [] },
  'medium-light': { dA: +1, dS: +1, addHero: [] },
  'medium-dark':  { dA: -1, addHero: ['toast', 'dark chocolate'] },
  dark:   { dA: -2, mute: true, addHero: ['toast', 'dark chocolate', 'smoky'] },
};

const clamp = (n) => Math.max(0, Math.min(10, Math.round(n)));
const norm = (s) => String(s || '').toLowerCase().trim();

function originBaseline(bean) {
  const o = norm(bean?.origin);
  if (!o) return DEFAULT_ORIGIN;
  // exact, then contains (handles "Ethiopia Yirgacheffe", "Sumatra Mandheling")
  if (ORIGINS[o]) return ORIGINS[o];
  const key = Object.keys(ORIGINS).find(k => o.includes(k) || k.includes(o));
  return key ? ORIGINS[key] : DEFAULT_ORIGIN;
}

function processMod(bean) {
  const p = norm(bean?.process);
  if (!p) return null;
  if (p.includes('natural') && !p.includes('pulped')) return PROCESS.natural;
  if (p.includes('honey') || p.includes('pulped')) return PROCESS.honey;
  if (p.includes('semi') || p.includes('giling') || p.includes('wet-hull')) return PROCESS['semi-washed'];
  if (p.includes('wash')) return PROCESS.washed;
  return null;
}

function roastMod(bean) {
  const r = norm(bean?.roastLevel);
  if (!r) return null;
  if (r.includes('dark')) return r.includes('medium') ? ROAST['medium-dark'] : ROAST.dark;
  if (r.includes('light')) return r.includes('medium') ? ROAST['medium-light'] : ROAST.light;
  if (r.includes('medium')) return ROAST.medium;
  return null;
}

// altitude string → meters (first number), null if absent
function altitudeMeters(bean) {
  const m = String(bean?.altitude || '').match(/(\d[\d,]{2,})/);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

// --- Axis labels (novice vocabulary, from tastingGlossary) ---
const LABELS = {
  acidity:   [[2, 'gentle'], [4, 'soft & mellow'], [6, 'crisp, like apple'], [8, 'bright, like lemon'], [10, 'vibrant & punchy']],
  sweetness: [[2, 'subtle'], [4, 'present'], [6, 'sweet, like honey'], [8, 'rich, like caramel'], [10, 'lush & syrupy']],
  body:      [[2, 'light, like tea'], [4, 'medium-light'], [6, 'medium, like juice'], [8, 'full, like cream'], [10, 'thick & syrupy']],
  finish:    [[3, 'short'], [6, 'medium'], [8, 'long & clean'], [10, 'lingering']],
};
function labelFor(axis, level) {
  const row = LABELS[axis].find(([ceil]) => level <= ceil);
  return (row || LABELS[axis][LABELS[axis].length - 1])[1];
}

// Predict the expected profile for a bean. Always returns a valid object (graceful default).
export function predict(bean) {
  const base = originBaseline(bean);
  const proc = processMod(bean);
  const roast = roastMod(bean);
  const alt = altitudeMeters(bean);

  let acidity = base.acidity, body = base.body, sweetness = base.sweetness;
  if (proc) { acidity += proc.dA || 0; body += proc.dB || 0; sweetness += proc.dS || 0; }
  if (roast) { acidity += roast.dA || 0; sweetness += roast.dS || 0; }
  if (alt != null) { if (alt >= 1600) acidity += 1; else if (alt > 0 && alt < 1000) { acidity -= 1; body += 1; } }

  acidity = clamp(acidity); body = clamp(body); sweetness = clamp(sweetness);
  // finish trends with acidity+sweetness quality; specialty defaults to a clean medium-long
  const finish = clamp(Math.round((acidity + sweetness) / 2) + 1);

  // hero descriptors: origin + process-added + roast-added (deduped, capped). Dark roast mutes origin.
  let hero = roast?.mute ? [] : [...base.hero];
  if (proc?.addHero) hero.push(...proc.addHero);
  if (roast?.addHero) hero.push(...roast.addHero);
  hero = [...new Set(hero)].slice(0, 4);

  // The other three radar axes (intensity-style) — expected levels so every wizard slider gets a
  // predict-then-confirm ghost marker. Aromatic/flavor intensity track origin brightness + roast;
  // specialty coffee defaults to good balance, dented when acidity & sweetness are far apart.
  const fragranceAroma = clamp(4 + Math.round(base.acidity / 2) + (roast?.originBoost ? 1 : 0) - (roast?.mute ? 3 : 0));
  const flavor = clamp(5 + (proc === PROCESS.natural ? 2 : 0) + (roast?.originBoost ? 1 : 0) - (roast?.mute ? 2 : 0));
  const balance = clamp(8 - Math.round(Math.abs(acidity - sweetness) / 3));

  const axes = {
    fragranceAroma: { level: fragranceAroma },
    acidity:   { level: acidity,   label: labelFor('acidity', acidity) },
    sweetness: { level: sweetness, label: labelFor('sweetness', sweetness) },
    body:      { level: body,      label: labelFor('body', body) },
    flavor:    { level: flavor },
    finish:    { level: finish,    label: labelFor('finish', finish) },
    balance:   { level: balance },
  };

  const originName = bean?.origin || 'this coffee';
  const procName = proc === PROCESS.natural ? 'natural' : proc === PROCESS.honey ? 'honey' : proc === PROCESS['semi-washed'] ? 'wet-hulled' : proc === PROCESS.washed ? 'washed' : '';
  const altAdj = alt != null && alt >= 1600 ? 'high-altitude ' : '';
  const summary = `${altAdj}${procName ? procName + ' ' : ''}${originName} — expect ${axes.acidity.label.split(',')[0]} acidity, ${axes.body.label.split(',')[0]} body${hero.length ? `, and notes of ${hero.slice(0, 3).join(', ')}` : ''}.`;

  // Per-step coaching cues — what to hunt for at each beat.
  const cues = {
    smell: hero.length ? `Smell for ${hero.slice(0, 2).join(' and ')} — ${base.note}.` : `Take it in — what's the first thing it reminds you of?`,
    acidity: acidity >= 7 ? `This should feel alive and bright — like biting fruit. Find the sparkle.` : acidity <= 3 ? `This one's mellow — don't hunt for brightness, just notice if it's there.` : `Look for a gentle, crisp liveliness.`,
    sweetness: `Sweetness grows as it cools — ${axes.sweetness.label}.`,
    body: body >= 7 ? `Should feel heavy and full — like cream or syrup.` : body <= 3 ? `Should feel light and delicate — like tea.` : `Somewhere in the middle — like juice.`,
    flavor: hero.length ? `The roaster and origin point to ${hero.join(', ')}. Do any show up?` : `Breathe out through your nose — what flavor appears?`,
    finish: `Notice how long it lingers after you swallow.`,
  };

  return { axes, heroDescriptors: hero, cues, summary, clean: proc ? proc.clean !== false : true };
}
