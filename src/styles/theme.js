// Color palette — 2manybeans "Warm Editorial, Elevated" system
// Brand tokens: paper (bg), latte (cards), caramel (accent), espresso (text), sage (peak/fresh)
// NOTE: every key here is consumed across ~60 files. Values are upgraded for the
// redesign; keys are kept backward-compatible. New token groups (glass, type,
// motion, frost/roast, expanded shadows/radius) are additive.
export const C = {
  // Backgrounds — warm paper. Cards are a cooler near-white so they truly lift
  // off the page (the old system was one flat beige at one elevation).
  bg: "#F1EADF",           // warm paper — main background
  bgDeep: "#E7DECF",       // recessed wells, grouped-table backgrounds
  cream: "#FFFEFB",        // near-white warm — cards, soft surfaces
  card: "#FFFEFB",         // card fill
  cardMuted: "#ECE3D6",    // warm gray — muted cards, disabled surfaces

  // Text — near-black espresso for premium crispness
  text: "#241710",         // espresso — primary text
  textMuted: "#6E5D4E",    // mocha — secondary text (darkened for contrast)
  textLight: "#9C8A78",    // taupe — helper text, placeholders

  // Brand accent (caramel) — richer
  accent: "#A2632F",       // caramel — brand actions, selected states
  accentLight: "#D9B687",  // light caramel — borders, subtle highlights
  accentDark: "#46291A",   // dark roast — pressed states
  accentSoft: "#F4E5D1",   // caramel tint — selected chips, fills

  // Deep espresso surfaces (hero, immersive chrome). Replaces hardcoded #43301F.
  roast: "#33200F",        // hero background base
  roastDeep: "#21130A",    // darkest espresso

  // Borders
  border: "#E6D9C9",
  borderLight: "#F1E8DC",
  hairline: "rgba(70,41,26,0.10)",
  hairlineStrong: "rgba(70,41,26,0.16)",

  // Status: peak / freshness
  green: "#5B8762",        // sage — peak window, fresh, alive
  greenBg: "#E8F0EA",

  // Status: warning / aging
  amber: "#B0832F",        // muted amber — aging, needs attention
  amberBg: "#FAF1DF",

  // Status: error / problem
  red: "#B25741",          // soft terracotta — errors, destructive
  redBg: "#FAEAE3",

  // Status: archive / inactive
  purple: "#6A5A93",
  purpleBg: "#EFECF4",

  // Info / links (genuine info only — NOT for iced mode; use frost tokens)
  blue: "#3B7BD6",
  blueBg: "#E5EEFB",

  // Frost — iced-brew mode. Desaturated warm-slate so "cold" reads without a
  // foreign candy-blue clashing with the warm system. Replaces #5B9BD5 family.
  frost: "#5E7A8A",        // iced accent
  frostBg: "#EDF1F3",      // iced surface
  frostSoft: "#DCE6EB",    // iced tile fill
  frostBorder: "#C7D4DA",  // iced borders
  frozen: "#6E7B82",       // frozen-bean indicator (cool gray; replaces C.blue on snowflake)

  // Navigation — glass tab bar (translucent; chrome blurs content behind)
  navBg: "rgba(255,254,251,0.72)",
  navText: "#8A7765",
  navActive: "#A2632F",    // caramel — matches brand accent
};

// Glass / frosted material — floating chrome (tab bar, sticky headers, sheets)
export const glass = {
  chrome: "rgba(252,250,245,0.72)",
  chromeBorder: "rgba(70,41,26,0.08)",
  blur: "saturate(180%) blur(20px)",
  blurStrong: "saturate(180%) blur(30px)",
  sheet: "rgba(255,254,251,0.90)",
  scrim: "rgba(33,19,10,0.36)",
};

// Typography — 2 working roles. `title` REPOINTED off the casual script (Caveat)
// onto Fraunces: the redesign is editorial, not handwritten. The wordmark is a
// PNG asset and is unaffected. Keep the `title` key for backward compat; lingering
// usages now render as elegant serif instead of script.
export const fonts = {
  title: "'Fraunces', 'Playfair Display', serif",      // display accents (was Caveat — purged)
  heading: "'Fraunces', 'Playfair Display', serif",    // display, bean names, section emphasis
  body: "'Nunito', sans-serif",                        // all UI
  grotesque: "'DM Sans', 'Inter', system-ui, sans-serif", // trading-card name + Swiss caps labels (rounder grotesque)
};

// Modular type scale (px). Use for consistent hierarchy across screens.
// Fraunces gets negative tracking at display sizes for optical tightness.
export const type = {
  display: { fontFamily: "'Fraunces', 'Playfair Display', serif", fontSize: 34, fontWeight: 600, lineHeight: 1.04, letterSpacing: "-0.022em" },
  h1:      { fontFamily: "'Fraunces', 'Playfair Display', serif", fontSize: 26, fontWeight: 600, lineHeight: 1.1,  letterSpacing: "-0.018em" },
  h2:      { fontFamily: "'Fraunces', 'Playfair Display', serif", fontSize: 20, fontWeight: 600, lineHeight: 1.16, letterSpacing: "-0.01em" },
  h3:      { fontFamily: "'Nunito', sans-serif", fontSize: 17, fontWeight: 700, lineHeight: 1.25, letterSpacing: "-0.005em" },
  bodyL:   { fontFamily: "'Nunito', sans-serif", fontSize: 16, fontWeight: 500, lineHeight: 1.5 },
  body:    { fontFamily: "'Nunito', sans-serif", fontSize: 14, fontWeight: 500, lineHeight: 1.5 },
  // Eyebrow / section label — replaces script section titles. Default neutral color.
  label:   { fontFamily: "'Nunito', sans-serif", fontSize: 12, fontWeight: 700, lineHeight: 1.2, letterSpacing: "0.10em", textTransform: "uppercase" },
  eyebrow: { fontFamily: "'Nunito', sans-serif", fontSize: 12, fontWeight: 700, lineHeight: 1.2, letterSpacing: "0.10em", textTransform: "uppercase" },
  caption: { fontFamily: "'Nunito', sans-serif", fontSize: 11, fontWeight: 600, lineHeight: 1.3 },
};

// Elevation — warm, soft, layered. Three-stop shadows give real depth on warm
// paper. Keep card/button/modal/navActive keys.
export const shadows = {
  e0: "none",
  e1: "0 1px 2px rgba(46,28,16,0.05), 0 2px 5px rgba(46,28,16,0.04)",
  e2: "0 1px 2px rgba(46,28,16,0.05), 0 4px 10px rgba(46,28,16,0.06), 0 10px 22px rgba(46,28,16,0.05)",
  e3: "0 2px 4px rgba(46,28,16,0.07), 0 10px 24px rgba(46,28,16,0.10), 0 24px 48px rgba(46,28,16,0.10)",
  card: "0 1px 2px rgba(46,28,16,0.05), 0 5px 14px rgba(46,28,16,0.07), 0 14px 32px rgba(46,28,16,0.06)",
  button: "0 1px 3px rgba(70,41,26,0.16)",
  modal: "0 -8px 44px rgba(33,19,10,0.16)",
  navActive: "0 4px 14px rgba(162,99,47,0.30)",
  // Inner top-highlight that makes a surface read as real material (light from above)
  innerTop: "inset 0 1px 0 rgba(255,255,255,0.6)",
};

export const radius = {
  xs: 8,     // chips, badges, small inputs
  sm: 10,    // small controls
  md: 14,    // cards, buttons, inputs
  lg: 18,    // large cards
  xl: 24,    // modals, bottom sheets
  pill: 999, // pills, chips
};

// Motion tokens — spring configs + durations + easings (for framer-motion + CSS).
export const motion = {
  spring: {
    soft:   { type: "spring", stiffness: 260, damping: 30, mass: 0.9 },
    snappy: { type: "spring", stiffness: 420, damping: 34, mass: 0.8 },
    bouncy: { type: "spring", stiffness: 500, damping: 24, mass: 0.8 },
    gentle: { type: "spring", stiffness: 180, damping: 28 },
  },
  dur: { fast: 0.16, base: 0.28, slow: 0.5 },
  ease: { out: [0.22, 1, 0.36, 1], inOut: [0.65, 0, 0.35, 1] },
  // CSS-string equivalents for inline transitions
  cssOut: "cubic-bezier(0.22,1,0.36,1)",
  cssInOut: "cubic-bezier(0.65,0,0.35,1)",
};

export const cardBase = {
  background: C.card,
  borderRadius: radius.lg,
  boxShadow: shadows.card,
  border: `1px solid ${C.borderLight}`,
};

export const journalCard = {
  ...cardBase,
  borderLeft: `3px solid ${C.accentLight}`,
  padding: 20,
  marginBottom: 14,
};
