// Onboarding palate → live app seam. The ONLY sanctioned reader of
// profile.onboardingAnswers outside the onboarding tree. Null-safe by
// construction: every consumer must behave byte-identically to before
// when the profile has no answers (all pre-onboarding-100x users).

const AXIS_ORDER = ['sweetness', 'acidity', 'body', 'clean_funky', 'fruit_nutty'];

// Fixed word map — one phrase per axis per sign. NO user free-text ever
// enters palateSummaryLine(); every word here is a hardcoded literal.
const AXIS_WORDS = {
  sweetness: { positive: 'leans sweet', negative: 'prefers structure over sweetness' },
  acidity: { positive: 'bright acidity', negative: 'gentle acidity' },
  body: { positive: 'heavy body', negative: 'lighter body' },
  clean_funky: { positive: 'trusts washed coffees', negative: 'open to funk' },
  fruit_nutty: { positive: 'chocolate and nuts', negative: 'fruit-forward' },
};

const MAX_LINE_LEN = 90;
// NOTE: spec's example line ("Palate: leans sweet...") requires a colon for the
// fixed "Palate:" prefix, so ':' is included alongside the spec's listed safe set
// [a-zA-Z0-9 ,.'-]. See final report for this call-out.
const SAFE_CHARS_RE = /[^a-zA-Z0-9 ,.':-]/g;

// Returns null unless profile.onboardingAnswers exists and has a non-null
// palateChart with at least one non-zero axis. Otherwise returns a
// normalized { chart, goal, pain } shape.
export function getOnboardingPalate(profile) {
  const answers = profile?.onboardingAnswers;
  if (!answers) return null;
  const rawChart = answers.palateChart;
  if (!rawChart || typeof rawChart !== 'object') return null;

  const chart = {};
  let hasSignal = false;
  for (const axis of AXIS_ORDER) {
    const n = Number(rawChart[axis]);
    const v = Number.isFinite(n) ? n : 0;
    chart[axis] = v;
    if (v !== 0) hasSignal = true;
  }
  if (!hasSignal) return null;

  return {
    chart,
    goal: typeof answers.goal === 'string' ? answers.goal : null,
    pain: typeof answers.pain === 'string' ? answers.pain : null,
  };
}

// Returns null if palate is null; otherwise a single sanitized line built
// ONLY from the fixed AXIS_WORDS map above (positive/negative; zero axes
// are omitted). First 3 non-zero axes (in AXIS_ORDER) are joined with
// commas, capped at 90 chars, and stripped to a safe character set.
export function palateSummaryLine(palate) {
  if (!palate?.chart) return null;

  const phrases = [];
  for (const axis of AXIS_ORDER) {
    if (phrases.length >= 3) break;
    const v = palate.chart[axis];
    if (!v) continue;
    const words = AXIS_WORDS[axis];
    phrases.push(v > 0 ? words.positive : words.negative);
  }
  if (phrases.length === 0) return null;

  let line = `Palate: ${phrases.join(', ')}.`;
  line = line.replace(SAFE_CHARS_RE, '');
  if (line.length > MAX_LINE_LEN) line = line.slice(0, MAX_LINE_LEN);
  return line;
}
