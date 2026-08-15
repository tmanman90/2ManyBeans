// Single source of truth for free-trial copy.
//
// The trial length is defined in App Store Connect (introductory offer per
// product) and surfaced through RevenueCat as `package.product.introPrice`.
// NOTHING in the app may hardcode a trial length: if ASC says 3 days and the
// onboarding screen promises 7, we are making a false pricing promise (an
// Apple 3.1.2 rejection class, and a refund/complaint magnet).
//
// Every surface that mentions the trial — PaywallSheet CTA + fineprint, the
// R12 timeline, the R13 CTA — derives from here. When no introductory offer
// exists (or offerings haven't loaded), the helpers return null and callers
// MUST fall back to copy that promises no trial at all.

const UNIT_DAYS = { DAY: 1, WEEK: 7, MONTH: 30, YEAR: 365 };

function normalizeUnit(unit) {
  if (!unit) return null;
  const u = String(unit).toUpperCase();
  // RevenueCat has shipped both `DAY` and ISO-8601 `P1D` values across SDK
  // versions; accept either.
  const iso = /^P(\d+)([DWMY])$/.exec(u);
  if (iso) return { D: 'DAY', W: 'WEEK', M: 'MONTH', Y: 'YEAR' }[iso[2]];
  return UNIT_DAYS[u] ? u : null;
}

/**
 * Read the introductory FREE offer off a RevenueCat package.
 * Returns null for paid intro offers (e.g. discounted first month) — those
 * are not trials and must never be described as one.
 *
 * @returns {{units:number, unit:string, days:number, label:string}|null}
 */
export function introOfferFromPackage(pkg) {
  const intro = pkg?.product?.introPrice;
  if (!intro) return null;
  const isFree = intro.price === 0 || intro.priceString === '$0.00';
  if (!isFree) return null;

  const rawUnits = intro.periodNumberOfUnits ?? intro.period?.value;
  const rawUnit = intro.periodUnit ?? intro.period?.unit ?? intro.period;
  const units = Number(rawUnits);
  const unit = normalizeUnit(rawUnit);
  if (!units || !unit) return null;

  const days = units * UNIT_DAYS[unit];
  // Weeks read as days ("7-day free trial", not "1-week free trial") because
  // that's how Apple's own trial sheets phrase short periods.
  const label =
    unit === 'DAY' || unit === 'WEEK'
      ? `${days}-day free trial`
      : `${units}-${unit.toLowerCase()} free trial`;

  return { units, unit, days, label };
}

/**
 * The trial offer that represents this offering. Prefers the Pro annual
 * package (the default selection on the paywall), then any package that
 * carries a free intro offer.
 */
export function trialFromOffering(offering) {
  const packages = offering?.availablePackages;
  if (!packages?.length) return null;
  const preferred = packages.find((p) =>
    (p.product?.identifier || '').includes('pro.annual')
  );
  return (
    (preferred && introOfferFromPackage(preferred)) ||
    packages.map(introOfferFromPackage).find(Boolean) ||
    null
  );
}

/**
 * The offering warmed by `warmPaywallOfferings()` during onboarding, or null
 * if the preload failed / hasn't landed. Synchronous by design — onboarding
 * screens read it during render.
 */
export function readWarmedOffering() {
  if (typeof window === 'undefined') return null;
  const cache = window.__rcOfferingsCache;
  if (!cache || cache.error) return null;
  return cache.offerings || null;
}

/** The warmed trial offer, or null when there is no free trial to promise. */
export function readWarmedTrial() {
  return trialFromOffering(readWarmedOffering());
}

/**
 * R12's vertical timeline, derived from the real trial length.
 * Returns null when there is no trial — the caller must then render the
 * no-trial variant rather than a timeline for a trial that doesn't exist.
 */
export function trialTimelineSteps(trial) {
  if (!trial?.days) return null;
  const { days } = trial;
  const steps = [
    { day: 'Today', body: 'Everything unlocked. Scan, taste, brew with me at full power.' },
  ];
  // Apple's own reminder lands 24h out. Only show a middle beat when the
  // trial is long enough for it to be a distinct day.
  if (days >= 3) {
    steps.push({
      day: `Day ${days - 1}`,
      body: "I'll remind you before anything happens. No surprises.",
    });
  }
  steps.push({
    day: `Day ${days}`,
    body: 'Trial ends. Cancel any time before and you pay nothing.',
  });
  return steps;
}
