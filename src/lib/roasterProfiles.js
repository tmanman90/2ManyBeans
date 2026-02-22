// Roaster profiles — ported from prototype lines 17-48

export const ROASTER_PROFILES = {
  "Apollon's Gold": { degasMin: 35, degasMax: 45, peakStart: 60, peakEnd: 90, category: "Apollon's Gold", guidance: "Degas 35–45d · Peak 60–90d (bag guidance)" },
  "Koppi": { degasMin: 10, degasMax: 14, peakStart: 21, peakEnd: 60, category: "Nordic/Ultra-Light", guidance: "Nordic Light · Degas 10–14d · Peak 21–60d" },
  "Prodigal": { degasMin: 10, degasMax: 14, peakStart: 21, peakEnd: 60, category: "Nordic/Ultra-Light", guidance: "Ultra-Light (Loring) · Degas 10–14d · Peak 21–60d" },
  "La Cabra": { degasMin: 10, degasMax: 14, peakStart: 21, peakEnd: 60, category: "Nordic/Ultra-Light", guidance: "Nordic Light · Degas 10–14d · Peak 21–60d" },
  "Coffee Collective": { degasMin: 10, degasMax: 14, peakStart: 21, peakEnd: 60, category: "Nordic/Ultra-Light", guidance: "Nordic Light · Degas 10–14d · Peak 21–60d" },
  "Drop Coffee": { degasMin: 10, degasMax: 14, peakStart: 21, peakEnd: 60, category: "Nordic/Ultra-Light", guidance: "Nordic Light · Degas 10–14d · Peak 21–60d" },
  "Tim Wendelboe": { degasMin: 10, degasMax: 14, peakStart: 21, peakEnd: 60, category: "Nordic/Ultra-Light", guidance: "Nordic Light · Degas 10–14d · Peak 21–60d" },
  "Dayglow": { degasMin: 7, degasMax: 14, peakStart: 14, peakEnd: 60, category: "Specialty Light", guidance: "Specialty Light · Degas 7–14d · Peak 14–60d" },
  "Dayglow (Promethium)": { degasMin: 7, degasMax: 14, peakStart: 14, peakEnd: 60, category: "Specialty Light", guidance: "Specialty Light · Degas 7–14d · Peak 14–60d" },
  "Leaves (Tokyo)": { degasMin: 7, degasMax: 14, peakStart: 14, peakEnd: 60, category: "Specialty Light", guidance: "Specialty Light · Degas 7–14d · Peak 14–60d" },
  "Momos Coffee": { degasMin: 7, degasMax: 14, peakStart: 14, peakEnd: 60, category: "Specialty Light", guidance: "Specialty Light · Degas 7–14d · Peak 14–60d" },
  "Wonderstate": { degasMin: 7, degasMax: 14, peakStart: 14, peakEnd: 60, category: "Specialty Light", guidance: "Specialty Light · Degas 7–14d · Peak 14–60d" },
  "SEY": { degasMin: 7, degasMax: 14, peakStart: 14, peakEnd: 60, category: "Specialty Light", guidance: "Specialty Light · Degas 7–14d · Peak 14–60d" },
  "Onyx": { degasMin: 7, degasMax: 14, peakStart: 14, peakEnd: 60, category: "Specialty Light", guidance: "Specialty Light · Degas 7–14d · Peak 14–60d" },
};

export const DEFAULT_PROFILE = {
  degasMin: 7, degasMax: 14, peakStart: 14, peakEnd: 60,
  category: "Specialty Light (default)",
  guidance: "Specialty Light · Degas 7–14d · Peak 14–60d (est.)",
};

export const getProfileForRoaster = (roasterName) => {
  if (!roasterName) return DEFAULT_PROFILE;
  if (ROASTER_PROFILES[roasterName]) return ROASTER_PROFILES[roasterName];
  const lower = roasterName.toLowerCase();
  for (const [key, val] of Object.entries(ROASTER_PROFILES)) {
    if (key.toLowerCase() === lower || lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) return val;
  }
  return DEFAULT_PROFILE;
};
