// Machine-readable, human-audited V60 Switch 03 source registry.
// Companion to docs/data/v60-switch-source-registry.md (the prose registry
// this file's ids and evidence tiers are drawn from). Mirrors the shape of
// src/data/v60SourceRegistry.js: a frozen SOURCES array + lookup helpers.
// Numeric fields are starting evidence, not universal guarantees — the
// adapter records which source(s) justify each preset via sourceIds.

export const V60_SWITCH_SOURCE_REGISTRY_VERSION = 'v60-switch-hot-sources-v1';

export const V60_SWITCH_SOURCES = Object.freeze([
  {
    id: 'kasuya-hybrid-resolved', author: 'Tetsu Kasuya (God/Devil Method)',
    canonicalUrl: 'https://www.comoricoffee.com/en/kasuyas-hario-switch-recipe-en', publication: 'Kasuya hybrid (resolved timing)',
    evidenceType: 'adapted-secondary', evidenceTier: 'adapted-secondary-corroborated', status: 'adapted', brewer: 'Switch 03',
    doseGrams: 20, ratio: 14, temperaturePhase1C: 90, temperaturePhase2C: 70,
    valveCloseTimeSeconds: 75, valveOpenTimeSeconds: 105, structure: 'percolation-first-hybrid',
    notes: 'Corroborated 2-of-3 with gota.cafe against the honestcoffeeguide.com outlier (close 1:30/open 2:20, unused). Close 1:15, open 1:45, finish ~3:00.',
  },
  {
    id: 'kasuya-super-hybrid-v2', author: 'Tetsu Kasuya (Super Hybrid v2)',
    canonicalUrl: 'https://roastaroma.com', publication: 'Super Hybrid v2',
    evidenceType: 'adapted-secondary', evidenceTier: 'adapted-secondary', status: 'adapted', brewer: 'Switch 03',
    doseGrams: 20, ratio: 15, temperaturePhase1C: 90, temperaturePhase2C: 75,
    valveCloseTimeSeconds: 130, valveOpenTimeSeconds: 175, structure: 'closed-bloom-then-percolation-then-close',
    notes: 'Chronologically distinct later Kasuya recipe: closed bloom 0:00-0:40, open percolation to ~200g by 1:30, close 2:10, open 2:55, drain ~3:30. Recorded as an alternate valid parameter point, not the shipped default (per plan Key Technical Decisions). 2026-08-16 addition (single-temp revision): Super Hybrid v2 uses a coarser grind than the original God/Devil recipe — precedent cited for the revised medium preset\'s "+1 coarser than the old dual-temp preset" grind offset.',
  },
  {
    id: 'chronicler-primary', author: 'Asser Christensen (Coffee Chronicler)',
    canonicalUrl: 'https://coffeechronicler.com/hario-switch', publication: "Coffee Chronicler's Switch method",
    evidenceType: 'adapted-primary', evidenceTier: 'adapted-primary', status: 'adapted', brewer: 'Switch 02',
    doseGrams: 20, ratio: 16, temperaturePhase1C: null, temperaturePhase2C: null,
    valveCloseTimeSeconds: 45, valveOpenTimeSeconds: 120, structure: 'percolation-first-hybrid',
    notes: 'Closest published match to the owner-preferred default structure: pour 50% valve open at 0:00, pour remaining 50% valve closed at 0:45, open+drain at 2:00, total 2:45-3:15. Temperature not stated on the fetched page — never cited numerically for temp fields. 2026-08-16 addition (single-temp revision): 92C constant, 20g:300g (1:15) variant documented on timer.coffee; a "sweet version" closes the valve at 0:25 instead of 0:45 to reduce acidity, with no temperature change — direct evidence that valve-close timing is the acidity/smoothness lever, source for SWITCH_EARLY_CLOSE_SWEETNESS.',
  },
  {
    id: 'hoffmann-hybrid-secondary', author: 'James Hoffmann (transcribed by Raymond Brigleb)',
    canonicalUrl: 'https://unpacking.coffee/recipes/23-james-hoffmann-hario-switch-hybrid', publication: 'Hoffmann Switch hybrid',
    evidenceType: 'adapted-secondary', evidenceTier: 'adapted-secondary', status: 'adapted', brewer: 'Switch 03',
    doseGrams: 20, ratio: 16.5, temperaturePhase1C: 95, temperaturePhase2C: null,
    valveCloseTimeSeconds: 0, valveOpenTimeSeconds: 150, structure: 'immersion-first',
    notes: 'Immersion-first: valve closed from bloom through the full pour, opens at 2:30. Structurally distinct from Kasuya (R12) — registry evidence only, not a generated template in this slice. Ratio/dose/temp used for the light-preset upper band only.',
  },
  {
    id: 'hoffmann-immersion-secondary', author: 'James Hoffmann (via beanbook.app)',
    canonicalUrl: 'https://beanbook.app', publication: 'Hoffmann Switch immersion',
    evidenceType: 'adapted-secondary', evidenceTier: 'adapted-secondary', status: 'adapted', brewer: 'Switch (fits 02 or 03)',
    doseGrams: 15, ratio: 16.7, temperaturePhase1C: 93.3, temperaturePhase2C: null,
    valveCloseTimeSeconds: 0, valveOpenTimeSeconds: 120, structure: 'pure-immersion',
    notes: 'Pure immersion — valve never opens until drain. Deferred second template (registry evidence, not generated in this slice per plan Scope Boundaries).',
  },
  {
    id: 'kaldis-primary', author: "Kaldi's Coffee",
    canonicalUrl: 'https://www.kaldiscoffee.com/blogs/recipes/hario-switch-pour-over-coffee-recipe', publication: "Kaldi's Switch guide",
    evidenceType: 'roaster', evidenceTier: 'roaster-primary', status: 'adapted', brewer: 'Switch 02',
    doseGrams: 16, ratio: 16, temperaturePhase1LightMediumC: 98, temperaturePhase1DarkC: 92,
    valveOpenTimeSeconds: 90, structure: 'long-closed-bloom-then-drip',
    notes: 'The only registry source giving an explicit roast-dependent temperature split for the Switch (96-100C light/medium, 91-93C darker). Third, distinct structural pattern (long closed bloom -> open -> maintenance pours) — not the shipped two-pour hybrid. Cited for the dark-preset temperature band only.',
  },
  {
    id: 'hario-primary', author: 'Hario (official product pages)',
    canonicalUrl: 'https://www.hario-usa.com', publication: 'Switch hardware specs',
    evidenceType: 'manufacturer', evidenceTier: 'manufacturer', status: 'original', brewer: 'Switch 02 / 03',
    notes: 'Switch ships in 02 (200ml) and 03 (360ml, flagship/common size). This engine targets 03. No manufacturer-published dose range; dose bounds and the 340g water cap are derived from physical capacity, not a Hario spec.',
  },
  {
    id: 'hario-booklet-manufacturer', author: 'Hario (global.hario.com recipe booklet)',
    canonicalUrl: 'https://global.hario.com', publication: 'MUSD Recipe & Interview booklet',
    evidenceType: 'manufacturer', evidenceTier: 'manufacturer-single-source', status: 'adapted', brewer: 'Switch (mixed 02/03)',
    notes: 'Source of the Weihong Zhang / Charity Cheung / Kunie Inaba competition and everyday recipes. Single-source (no independent corroboration found beyond the booklet + one aggregator transcription); usable as a shadow-comparison target (U5), not an adapter default.',
  },
  {
    id: 'blind-coffee-roaster-theory', author: 'The Blind Coffee Roaster',
    canonicalUrl: 'https://theblindcoffeeroaster.com.au', publication: 'Anaerobic brewing guide',
    evidenceType: 'theory', evidenceTier: 'theory', status: 'original', brewer: 'general filter',
    notes: 'Most numerically complete anaerobic source: 88-91C, grind coarsened to 750-800 microns (roughly +150-200µm vs ~600µm baseline, banded conservatively to +100-150µm), ratio 1:16.5-1:17. Primary numeric source for the process-override layer.',
  },
  {
    id: 'coffee-compass-theory', author: 'The Coffee Compass',
    canonicalUrl: 'https://thecoffeecompass.substack.com', publication: 'Anaerobic brewing guide',
    evidenceType: 'theory', evidenceTier: 'theory-directional-only', status: 'original', brewer: 'general filter',
    notes: 'Directional corroboration only ("cap temperature below standard," ~93C vs their 96C baseline). "Stronger ratios" note is directionally opposite Blind Coffee Roaster\'s looser-ratio guidance and gives no exact number — flagged as a disagreement, not silently dropped.',
  },
  {
    id: 'barista-hustle-theory', author: 'Barista Hustle',
    canonicalUrl: 'https://www.baristahustle.com', publication: 'Drawdown lesson',
    evidenceType: 'theory', evidenceTier: 'theory', status: 'original', brewer: 'general filter',
    notes: 'Fines/bed-depth/agitation interaction for the drawdown phase and the closed-bloom clog-risk guardrail. Reused from docs/data/kalita-source-registry.md.',
  },
  {
    id: 'home-barista-community', author: 'home-barista.com forum thread',
    canonicalUrl: 'https://www.home-barista.com', publication: 'Switch grind/steep thread (t85637)',
    evidenceType: 'community', evidenceTier: 'gut-check', status: 'community', brewer: 'Switch',
    notes: 'Fine+short-steep vs coarser+long-steep debate; no verbatim "~90% of extraction in immersion" quote found anywhere — that framing is derived/interpolated synthesis, not a citation. 2026-08-16 re-read (single-temp revision): dual-temp verdict in this thread is positive-but-qualified and bean-dependent; one contributor "doesn\'t love the minor fuss of the temp drop." No controlled A/B exists.',
  },
  {
    id: 'hario-partners-manufacturer', author: 'Hario USA, with Partners Coffee',
    canonicalUrl: 'https://hario-usa.com/blogs/brewing-demos-and-recipes/v60-switch-recipe-with-partners-coffee', publication: 'V60 Switch Recipe with Partners Coffee',
    evidenceType: 'manufacturer', evidenceTier: 'manufacturer', status: 'original', brewer: 'Switch',
    doseGrams: 16, ratio: 16, temperatureLightMediumC: 98, temperatureDarkC: 92,
    valveOpenTimeSeconds: 90, structure: 'locked-bloom-then-open',
    notes: 'Single, roast-banded temperature: 96-100C light/medium, 90.5-93C dark. Locked bloom 0:00-1:30, then open. 2026-08-16 addition (single-temp revision) — direct source for the revised light/dark temperature bands.',
  },
  {
    id: 'quan-secondary', author: 'Brian Quan',
    canonicalUrl: 'https://beanbook.app/recipes/196cd89b-1c9e-4dae-976b-3b5085dc5adb', publication: 'Brian Quan V60 Switch recipe',
    evidenceType: 'adapted-secondary', evidenceTier: 'adapted-secondary-original-author', status: 'original-via-aggregator', brewer: 'Switch',
    doseGrams: 15, ratio: 16, temperaturePhase1C: 94, structure: 'single-temp-steep-time-dial',
    notes: '90-94C single temperature throughout. Explicitly frames steep time as the extraction dial (shorter = more acidity, longer = smoother/rounder), not temperature. 2026-08-16 addition (single-temp revision) — independent corroboration of the Chronicler sweet-version finding from a different author.',
  },
  {
    id: 'reddit-gut-check', author: 'r/pourover and related threads',
    canonicalUrl: 'https://www.reddit.com/r/pourover', publication: 'Switch community threads',
    evidenceType: 'community', evidenceTier: 'gut-check', status: 'community', brewer: 'Switch',
    notes: 'See docs/data/v60-switch-reddit-gut-check.md. Recurring theme: 500ml+ capacity ceiling requires brewing concentrated + diluting. No dated stall/clog thread was found; the closed-bloom guardrail rests on drawdown theory, not a named Reddit thread.',
  },
]);

export function sourceById(id) {
  return V60_SWITCH_SOURCES.find((source) => source.id === id) || null;
}

export function isKnownV60SwitchParameterSource(id) {
  return Boolean(sourceById(id));
}

export function validateV60SwitchRegistry() {
  const errors = [];
  for (const source of V60_SWITCH_SOURCES) {
    for (const key of ['id', 'author', 'canonicalUrl', 'publication', 'evidenceType', 'evidenceTier', 'status', 'brewer']) {
      if (!source[key]) errors.push(`${source.id}:missing-${key}`);
    }
  }
  const ids = V60_SWITCH_SOURCES.map((source) => source.id);
  if (new Set(ids).size !== ids.length) errors.push('duplicate-source-id');
  return { valid: errors.length === 0, errors };
}
