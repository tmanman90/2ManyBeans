// Color palette — 2manybeans "Modern Coffee Editorial" system
// Brand tokens: paper (bg), latte (cards), caramel (accent), espresso (text), sage (peak/fresh)
// NOTE: every key here is consumed across ~60 files. Values are upgraded for the
// redesign; keys are kept backward-compatible. New token groups (glass, type,
// motion, expanded shadows/radius) are additive.
export const C = {
  // Backgrounds — deeper warm paper so near-white cards gain real elevation
  bg: "#F3EDE4",           // warm paper — main background
  bgDeep: "#EBE3D7",       // recessed wells, grouped-table backgrounds
  cream: "#FFFDFA",        // near-white warm — cards, soft surfaces
  card: "#FFFDFA",         // card fill
  cardMuted: "#ECE3D8",    // warm gray — muted cards, disabled surfaces

  // Text — near-black espresso for premium crispness
  text: "#2A1A10",         // espresso — primary text
  textMuted: "#7A6A5C",    // mocha — secondary text
  textLight: "#A18F7E",    // taupe — helper text, placeholders

  // Brand accent (caramel) — richer
  accent: "#A86A38",       // caramel — brand actions, selected states
  accentLight: "#D8B68A",  // light caramel — borders, subtle highlights
  accentDark: "#4A2F1E",   // dark roast — pressed states
  accentSoft: "#F3E4D2",   // caramel tint — selected chips, fills

  // Borders
  border: "#E7DBCD",
  borderLight: "#F1E9DE",
  hairline: "rgba(74,47,30,0.10)",

  // Status: peak / freshness
  green: "#5C8A66",        // sage — peak window, fresh, alive
  greenBg: "#E9F1EB",

  // Status: warning / aging
  amber: "#B98A33",        // muted amber — aging, needs attention
  amberBg: "#FBF3E1",

  // Status: error / problem
  red: "#B65C45",          // soft terracotta — errors, destructive
  redBg: "#FBEDE7",

  // Status: archive / inactive
  purple: "#6B5B95",
  purpleBg: "#F0EDF5",

  // Info / links
  blue: "#3B7BD6",
  blueBg: "#E5EEFB",

  // Navigation — glass tab bar (translucent; chrome blurs content behind)
  navBg: "rgba(255,253,250,0.72)",
  navText: "#7A6A5C",
  navActive: "#A86A38",    // caramel — matches brand accent
};

// Glass / frosted material — floating chrome (tab bar, sticky headers, sheets)
export const glass = {
  chrome: "rgba(252,249,244,0.72)",
  chromeBorder: "rgba(74,47,30,0.08)",
  blur: "saturate(180%) blur(20px)",
  blurStrong: "saturate(180%) blur(30px)",
  sheet: "rgba(255,253,250,0.88)",
  scrim: "rgba(42,26,16,0.32)",
};

// Typography — 3 roles. Script reserved for wordmark + rare 1-word accents ONLY.
export const fonts = {
  title: "'Caveat', cursive",                          // wordmark + rare accent only
  heading: "'Fraunces', 'Playfair Display', serif",    // display, bean names, section emphasis
  body: "'Nunito', sans-serif",                        // all UI
};

// Modular type scale (px). Use for consistent hierarchy across screens.
export const type = {
  display: { fontFamily: "'Fraunces', 'Playfair Display', serif", fontSize: 34, fontWeight: 600, lineHeight: 1.05, letterSpacing: "-0.02em" },
  h1:      { fontFamily: "'Fraunces', 'Playfair Display', serif", fontSize: 26, fontWeight: 600, lineHeight: 1.1,  letterSpacing: "-0.01em" },
  h2:      { fontFamily: "'Fraunces', 'Playfair Display', serif", fontSize: 20, fontWeight: 600, lineHeight: 1.15 },
  h3:      { fontFamily: "'Nunito', sans-serif", fontSize: 17, fontWeight: 700, lineHeight: 1.2 },
  bodyL:   { fontFamily: "'Nunito', sans-serif", fontSize: 16, fontWeight: 500, lineHeight: 1.45 },
  body:    { fontFamily: "'Nunito', sans-serif", fontSize: 14, fontWeight: 500, lineHeight: 1.45 },
  // Eyebrow / section label — replaces script section titles
  label:   { fontFamily: "'Nunito', sans-serif", fontSize: 12, fontWeight: 700, lineHeight: 1.2, letterSpacing: "0.08em", textTransform: "uppercase" },
  caption: { fontFamily: "'Nunito', sans-serif", fontSize: 11, fontWeight: 600, lineHeight: 1.3 },
};

// Elevation — warm, soft, layered. Keep card/button/modal/navActive keys.
export const shadows = {
  e0: "none",
  e1: "0 1px 2px rgba(74,47,30,0.05), 0 2px 6px rgba(74,47,30,0.04)",
  e2: "0 2px 4px rgba(74,47,30,0.06), 0 8px 20px rgba(74,47,30,0.06)",
  e3: "0 6px 16px rgba(74,47,30,0.10), 0 18px 40px rgba(74,47,30,0.10)",
  card: "0 2px 4px rgba(74,47,30,0.06), 0 8px 20px rgba(74,47,30,0.05)",
  button: "0 1px 3px rgba(74,47,30,0.14)",
  modal: "0 -8px 40px rgba(74,47,30,0.14)",
  navActive: "0 4px 14px rgba(168,106,56,0.28)",
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
