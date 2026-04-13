// Color palette — 2manybeans brand system
// Brand tokens: oat (bg), latte (cards), caramel (accent), espresso (text), sage (peak/fresh)
export const C = {
  // Backgrounds
  bg: "#FAF6F1",           // oat / parchment — main background
  cream: "#FFF8F0",        // latte — cards, soft surfaces
  card: "#FFF8F0",         // latte — card fill
  cardMuted: "#EDE6DC",    // warm gray — muted cards, disabled surfaces

  // Text
  text: "#3B2417",         // espresso — primary text, strong contrast
  textMuted: "#8B7B6F",    // mocha — secondary text
  textLight: "#A89888",    // taupe — helper text, placeholders

  // Brand accent (caramel)
  accent: "#B07540",       // caramel — brand actions, selected states, icon bg
  accentLight: "#C9A87C",  // light caramel — borders, subtle highlights
  accentDark: "#5C3D2E",   // dark roast — pressed states

  // Borders
  border: "#E8DDD3",
  borderLight: "#F0E8DF",

  // Status: peak / freshness
  green: "#5B8A6A",        // sage — peak window, fresh, alive
  greenBg: "#EBF2ED",

  // Status: warning / aging
  amber: "#C4943A",        // muted amber — aging, needs attention
  amberBg: "#FDF6E3",

  // Status: error / problem
  red: "#B5634B",          // soft terracotta — errors, destructive
  redBg: "#FDF0EB",

  // Status: archive / inactive
  purple: "#6B5B95",
  purpleBg: "#F0EDF5",

  // Info / links
  blue: "#3B82F6",
  blueBg: "#DBEAFE",

  // Navigation
  navBg: "#FFF8F0",
  navText: "#8B7B6F",
  navActive: "#B07540",    // caramel — matches brand accent
};

// Typography — 3 roles: script (wordmark/titles), serif (display), sans (UI)
export const fonts = {
  title: "'Caveat', cursive",              // script — wordmark, page titles, display only
  heading: "'Playfair Display', serif",    // serif — bean names, section emphasis, premium moments
  body: "'Nunito', sans-serif",            // sans — all UI: metadata, buttons, tabs, chat, recipes
};

export const shadows = {
  card: '0 1px 3px rgba(92,61,46,0.06), 0 4px 12px rgba(92,61,46,0.04)',
  button: '0 1px 4px rgba(92,61,46,0.12)',
  modal: '0 -4px 24px rgba(92,61,46,0.10)',
  navActive: '0 2px 8px rgba(160,113,75,0.20)',
};

export const radius = {
  sm: 8,    // chips, badges, small inputs
  md: 12,   // cards, buttons, inputs
  lg: 16,   // modals, sheets
  xl: 20,   // bottom sheets, large cards
};

export const cardBase = {
  background: C.card,
  borderRadius: 14,
  boxShadow: shadows.card,
};

export const journalCard = {
  ...cardBase,
  borderLeft: `3px solid ${C.accentLight}`,
  padding: 20,
  marginBottom: 14,
};
