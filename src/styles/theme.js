// Color palette — Ghibli-inspired warm coffee journal aesthetic
export const C = {
  bg: "#FAF6F1",
  cream: "#FFF8F0",
  card: "#FFF8F0",
  text: "#3B2417",
  textMuted: "#8B7B6F",
  textLight: "#A89888",
  accent: "#A0714B",
  accentLight: "#C9A87C",
  accentDark: "#5C3D2E",
  border: "#E8DDD3",
  borderLight: "#F0E8DF",
  green: "#5B8A6A",
  greenBg: "#EBF2ED",
  amber: "#C4943A",
  amberBg: "#FDF6E3",
  red: "#A0522D",
  redBg: "#FDF0EB",
  purple: "#6B5B95",
  purpleBg: "#F0EDF5",
  navBg: "#FFF8F0",
  navText: "#8B7B6F",
  navActive: "#A0714B",
};

export const fonts = {
  title: "'Caveat', cursive",
  heading: "'Playfair Display', serif",
  body: "'Nunito', sans-serif",
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
  border: `1px solid ${C.borderLight}`,
  boxShadow: shadows.card,
};

export const journalCard = {
  ...cardBase,
  borderLeft: `3px solid ${C.accentLight}`,
  padding: 20,
  marginBottom: 14,
};
