// Single source of truth for free-tier limits.
//
// Both client and server import from this file so the limits stay in sync.
// Plain JS — no React, no firebase-admin — so it's safe to use anywhere.
//
// Bumping a limit here is the ONLY change needed; the metered middleware
// reads from these constants on the server, and the paywall + UI gates
// read them on the client.

export const FREE_LIMITS = {
  // AI bean scans (Gemini vision). Used by the bean scan flow only.
  // AI Fill (research enrichment) and chat image analysis do NOT count
  // against this — those calls don't set `metered: true` in the request.
  aiScans: 3,

  // AI tasting coach sessions (Claude). Counts the START of a coaching
  // session, not individual turns. Multi-turn replies inside the same
  // session don't burn additional credits.
  tasteTests: 1,

  // AI product shots (Gemini image generation). Free users get 3 completed
  // generations to match the free bean-scan allowance, then require Pro.
  productShots: 3,
};

// Display labels for plan identifiers, shared between PaywallSheet and
// SettingsPage so they stay consistent.
export const PLAN_LABELS = {
  pro_monthly: 'Pro Monthly',
  pro_annual: 'Pro Annual',
  ultra_monthly: 'Ultra Monthly',
  ultra_annual: 'Ultra Annual',
};
