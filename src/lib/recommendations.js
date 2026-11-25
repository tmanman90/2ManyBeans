// Recommendation engine — ported from prototype lines 109-142
// Uses PROTOTYPE scoring (not PRD scoring which is wrong)
import { getPeakStatus } from './peakStatus';

// Optional trailing `onboardingPalate` (src/lib/palateProfile.js getOnboardingPalate()
// shape) adds a final +/-0.1 tie-break term — never enough to override the real
// scoring above, only to break ties. Absent/null palate = term is 0 = identical
// ordering to before onboarding-100x.
export const getRecommendations = (beans, count = 3, onboardingPalate = null) => {
  const sealed = beans.filter(b => b.status === "SEALED");
  if (sealed.length === 0) return [];
  const active = beans.filter(b => b.status === "ACTIVE");
  const activeOrigins = active.map(b => b.origin);
  const activeProcesses = active.map(b => b.process);
  const cleanFunky = onboardingPalate?.chart?.clean_funky || 0;

  const scored = sealed.map(b => {
    let score = 0;
    const ps = getPeakStatus(b);
    // Past peak / stale — most urgent, losing quality every day
    if (ps.label.startsWith("Past Peak") || ps.label.startsWith("Stale")) score += 80;
    // Fading beans need to be opened ASAP
    if (ps.label.startsWith("Fading")) score += 70;
    // In peak — good to open but less urgent than fading/past peak
    if (ps.label.startsWith("In Peak")) score += 50;
    // Prefer beans approaching end of peak
    if (ps.days && ps.days > b.peakStart + (b.peakEnd - b.peakStart) * 0.5) score += 20;
    // Prefer beans past degassing
    if (ps.days >= b.degasMin) score += 10;
    // Prefer smaller bags
    if (b.bagSize <= 100) score += 10;
    if (b.bagSize <= 150) score += 5;
    // Variety bonus (different origin/process than active)
    if (!activeOrigins.includes(b.origin)) score += 15;
    if (!activeProcesses.includes(b.process)) score += 10;
    // Penalize if still degassing
    if (ps.days < b.degasMin) score -= 30;
    // Onboarding-palate tie-break (+/-0.1 max): natural-process bean + clean_funky
    // negative palate (open to funk) nudges up; washed + clean_funky positive
    // (trusts washed) nudges up.
    if (cleanFunky) {
      const process = String(b.process || '').toLowerCase();
      const isNatural = process.includes('natural') && !process.includes('pulped');
      const isWashed = process.includes('wash');
      if (cleanFunky < 0 && isNatural) score += 0.1;
      if (cleanFunky > 0 && isWashed) score += 0.1;
    }
    return { bean: b, score, peakStatus: ps };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, Math.min(count, scored.length));
};
