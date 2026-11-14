// Paywall copy + icon set — "Ruphus Paywall" (approved mockup 2026-08-16).
//
// PAYWALL_COPY is keyed by trigger. Each entry:
//   head / tail  — the step 1 headline. Renders as two lines with `tail`
//                  on the second line in gold (.pw-hl). The tail is the
//                  ONLY gold text on the screen.
//   subtext      — legacy one-liner kept for surfaces that still show a
//                  subhead (settings upsell rows etc). Step 1 of the new
//                  flow renders headline only, no subhead, per the mockup.
//   rows         — exactly three { icon, label, sub } value rows. Labels
//                  are short and bold; subs are lowercase fragments in the
//                  approved cadence ("to get origin, roast, and notes").
//
// Icons are stroke-only path sets (no <circle>/<rect>, circles are arc
// paths) so a single tiny renderer covers all of them:
//
//   <svg viewBox={icon.viewBox} fill="none" stroke="currentColor"
//        strokeWidth={icon.strokeWidth} strokeLinecap="round"
//        strokeLinejoin="round">
//     {icon.paths.map((d, i) => <path key={i} d={d} />)}
//   </svg>
//
// Color comes from the parent (.pw-disc sets gold; .pw-mx-cell sets text).

import { FREE_LIMITS } from '../../lib/subscriptionConfig';

export const PW_ICONS = {
  // Viewfinder + lens: bean scanning
  scan: {
    viewBox: '0 0 24 24',
    strokeWidth: 2,
    paths: [
      'M3 8V5a2 2 0 0 1 2-2h3',
      'M16 3h3a2 2 0 0 1 2 2v3',
      'M21 16v3a2 2 0 0 1-2 2h-3',
      'M8 21H5a2 2 0 0 1-2-2v-3',
      'M8.75 12a3.25 3.25 0 1 0 6.5 0a3.25 3.25 0 1 0 -6.5 0',
    ],
  },
  // Cup with steam: tasting coach
  cup: {
    viewBox: '0 0 24 24',
    strokeWidth: 2,
    paths: [
      'M4 10h12v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-6z',
      'M16 11h2a2.5 2.5 0 0 1 0 5h-2',
      'M7 6.5c0-1 .8-1.2.8-2',
      'M11 6.5c0-1 .8-1.2.8-2',
    ],
  },
  // Three sliders: recipes dialed to your gear
  sliders: {
    viewBox: '0 0 24 24',
    strokeWidth: 2,
    paths: [
      'M4 6h3', 'M11 6h9', 'M7 6a2 2 0 1 0 4 0a2 2 0 1 0 -4 0',
      'M4 12h9', 'M17 12h3', 'M13 12a2 2 0 1 0 4 0a2 2 0 1 0 -4 0',
      'M4 18h1', 'M9 18h11', 'M5 18a2 2 0 1 0 4 0a2 2 0 1 0 -4 0',
    ],
  },
  // Speech bubble: coffee chat
  chat: {
    viewBox: '0 0 24 24',
    strokeWidth: 2,
    paths: [
      'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z',
    ],
  },
  // Camera: product shots
  camera: {
    viewBox: '0 0 24 24',
    strokeWidth: 2,
    paths: [
      'M14.5 4h-5L7.5 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3.5L14.5 4z',
      'M9 13a3 3 0 1 0 6 0a3 3 0 1 0 -6 0',
    ],
  },
  // Paper plane: push to Fellow Aiden
  send: {
    viewBox: '0 0 24 24',
    strokeWidth: 2,
    paths: ['M22 2 11 13', 'M22 2 15 22l-4-9-9-4 20-7z'],
  },
  // Journal: palate history, expert depth
  book: {
    viewBox: '0 0 24 24',
    strokeWidth: 2,
    paths: [
      'M4 19.5A2.5 2.5 0 0 1 6.5 17H20',
      'M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z',
    ],
  },
  // Check: compare matrix cells + selected SKU circle
  check: {
    viewBox: '0 0 16 16',
    strokeWidth: 2.5,
    paths: ['M3 8.5l3.2 3.2L13 4.5'],
  },
};

// Shared row sets — several triggers converge on the core Pro pitch.
const ROW_SCAN = { icon: 'scan', label: 'Scan any bag', sub: 'to get origin, roast, and notes' };
const ROW_COACH = { icon: 'cup', label: 'Coach every cup', sub: 'guided tasting, one step at a time' };
const ROW_RECIPES = { icon: 'sliders', label: 'Recipes that fit', sub: 'dialed to your grinder and beans' };
const ROW_AIDEN = { icon: 'send', label: 'Straight to Aiden', sub: 'recipes land on the machine, ready to brew' };
const ROW_ADJUST = { icon: 'cup', label: 'Taste, then adjust', sub: 'coached tweaks after every brew' };

export const PAYWALL_COPY = {
  scan_cap: {
    head: "You've used your",
    tail: 'free scans',
    subtext: 'Unlock unlimited bean scanning and tasting coach with Coffee Hub Pro.',
    rows: [ROW_SCAN, ROW_COACH, ROW_RECIPES],
  },

  taste_cap: {
    head: 'Ready to level up',
    tail: 'your tasting?',
    subtext: 'Unlimited AI tasting coach, unlimited bean scans, and more.',
    rows: [
      ROW_COACH,
      { icon: 'book', label: 'Build your palate', sub: 'every session sharpens your fingerprint' },
      ROW_SCAN,
    ],
  },

  product_shot: {
    head: "You've used your free",
    tail: 'product shots',
    subtext: 'Upgrade to Pro for unlimited studio-style bean photos and scans.',
    rows: [
      { icon: 'camera', label: 'Studio shots', sub: 'gallery-ready photos of every bag' },
      ROW_SCAN,
      ROW_COACH,
    ],
  },

  aiden: {
    head: 'Send recipes straight',
    tail: 'to your Aiden',
    subtext: 'Ultra unlocks direct Fellow Aiden push and multi-brewer support.',
    rows: [ROW_AIDEN, { ...ROW_RECIPES, sub: 'dialed to your beans and roast' }, ROW_ADJUST],
  },

  // Fires when a free user tries to send a chat message — the most
  // intent-heavy trigger we have, so the copy answers the question the
  // user just asked ("can I talk to him?") instead of a generic unlock.
  chat: {
    head: 'Professor Ruphus is',
    tail: 'all ears',
    subtext: 'Chat with Professor Ruphus about brewing, beans, and everything on your shelf.',
    rows: [
      { icon: 'chat', label: 'Ask anything', sub: 'brewing, beans, gear, technique' },
      { icon: 'book', label: 'Expert depth', sub: 'answers grounded in real coffee knowledge' },
      { icon: 'sliders', label: 'Recipes on request', sub: 'ask for a brew and get one that fits' },
    ],
  },

  // Fires on the hand-brew recipe gate and Aiden recipe generation.
  recipe: {
    head: 'A recipe built for',
    tail: 'this bean',
    subtext: 'Personalized brew recipes for your grinder, your brewer, and this exact roast.',
    rows: [
      { icon: 'sliders', label: 'Dialed in', sub: 'grind, dose, and temp for your gear' },
      ROW_ADJUST,
      { icon: 'send', label: 'Straight to Aiden', sub: 'Ultra pushes it to the machine' },
    ],
  },

  generic: {
    head: 'Unlock AI-powered',
    tail: 'brewing',
    subtext: 'Get AI tasting coach, bean scanning, and personalized recipes.',
    rows: [ROW_SCAN, ROW_COACH, ROW_RECIPES],
  },
};

// Step 3 feature matrix. `detail` renders as the small second line under
// the feature label. Cells: true -> white check, false -> text-3 dash.
export const COMPARE_ROWS = [
  { feature: 'AI tasting coach', detail: 'guided scoring, step by step', pro: true, ultra: true },
  { feature: 'Unlimited bean scanning', pro: true, ultra: true },
  { feature: 'Personalized hand brew recipes', pro: true, ultra: true },
  { feature: 'Coffee chat', detail: 'expert knowledge on tap', pro: true, ultra: true },
  { feature: 'Push recipes to Fellow Aiden', pro: false, ultra: true },
  { feature: 'Multi-brewer support', detail: 'V60, Chemex, AeroPress', pro: false, ultra: true },
  { feature: 'Priority model routing', pro: false, ultra: true },
];

// "Everything in the free plan stays free" block on step 3. The metered
// numbers derive from FREE_LIMITS — never hardcode them here; when the
// limits change in subscriptionConfig.js this copy follows automatically.
const count = (n, singular, plural) => `${n} ${n === 1 ? singular : plural}`;

export const FREE_TIER_ROWS = [
  'Bean inventory and jars',
  'Tasting journal',
  'Peak-window tracking',
  count(FREE_LIMITS.aiScans, 'AI scan', 'AI scans'),
  count(FREE_LIMITS.tasteTests, 'guided taste test', 'guided taste tests'),
  count(FREE_LIMITS.productShots, 'product shot', 'product shots'),
];

// Hero art — bundled on purpose (new path, assetUrl.js does not rewrite it).
export const PAYWALL_HERO_SRC = '/images/paywall/hero-ruphus-flat.webp';

// Animated hero: a 10s seamless loop (forward + reversed, so the loop point is
// exact by construction rather than by hoping the generator returned to its
// start pose). Poster is the video's own first frame, so the still and the
// first painted video frame are pixel-identical and there is no flash on load.
export const PAYWALL_HERO_LOOP = '/images/paywall/hero-ruphus-loop.mp4';
export const PAYWALL_HERO_POSTER = '/images/paywall/hero-ruphus-loop-poster.webp';
