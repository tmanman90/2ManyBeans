// Tier copy must match what the code actually gates (Guideline 3.1.2(c): describe
// the offer accurately). Tal's ruling, 2026-11-24: Pro is every feature, all AI
// included; Ultra is everything in Pro plus pushing recipes to a Fellow Aiden.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const sourceFiles = (dir) => readdirSync(new URL(`../${dir}`, import.meta.url), { withFileTypes: true })
  .flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(jsx?|mjs)$/.test(entry.name) ? [path] : [];
  });

// Claims Ultra never delivered (no code gates them).
const RETIRED_CLAIMS = /multi-brewer|priority model|model routing|priority support|early access/i;

// Comments mention Ultra freely; only code counts.
const code = (path) => read(path)
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

// Server: every file whose code mentions the Ultra tier, in any spelling
// (`.ultra`, 'ultra', withCorsAuthUltra, ...). A new file here means a new
// Ultra gate or entitlement source: update the tier copy, then this list.
const SERVER_ULTRA_FILES = [
  'api/_lib/checkEntitlement.js', // derives { pro, ultra } from RevenueCat and Firestore
  'api/_lib/cors-auth.js', // defines withCorsAuthUltra
  'api/_lib/redemption.js', // redemption codes can grant either tier
  'api/aiden.js', // THE gate: Fellow Aiden push
  'api/recipe-command.js', // THE gate: Aiden link and Fellow handoff (pinned below)
  'api/revenuecat-webhook.js', // product id -> plan map
];

// Client: every read of the Ultra entitlement must be one of these shapes.
// None of them gives Ultra a feature; whatever is left after removing them is
// a gate (if (hasUltra), hasUltra && x, !hasUltra, hasUltra ? a : b, ...).
const NON_GATING_ULTRA_READS = [
  /\{[^}]*\bhasUltra\b[^}]*\}\s*=/g, // destructuring
  /useRef\(hasUltra\)/g, // ref mirror
  /hasUltraRef\.current = hasUltra\b/g, // ref sync
  /\[[^\]]*\bhasUltra\b[^\]]*\]\)/g, // effect or callback dependencies
  /!hasPro && !hasUltra\b/g, // "no subscription at all"
  /hasPro \|\| hasUltra\b/g, // "any subscription"
  /hasProRef\.current \|\| hasUltraRef\.current/g, // "any subscription" (polled)
  /tier: hasUltra \? 'ultra' : 'pro'/g, // analytics label in R13Paywall
];
const CLIENT_ULTRA_GATE = { file: 'src/hooks/useAidenBrew.js', form: /if \(!hasUltra\) \{/g, count: 2 }; // Push to Aiden, hot and iced
// Where an 'ultra' literal may appear: tier definitions, paywall card selection,
// and "this error needs Ultra" -> open the paywall on Ultra.
const CLIENT_ULTRA_LITERAL_FILES = [
  'src/components/PaywallSheet.jsx',
  'src/components/onboarding/screens/R13Paywall.jsx',
  'src/components/paywall/PaywallRoast.jsx',
  'src/components/paywall/steps/StepCompare.jsx',
  'src/components/paywall/steps/StepPlans.jsx',
  'src/hooks/useAidenBrew.js',
  'src/lib/fetchWithRetry.js',
  'src/lib/paywallHelpers.js',
  'src/tabs/ChatTab.jsx',
];
const ENTITLEMENT_SOURCES = new Set(['src/contexts/SubscriptionContext.jsx', 'src/lib/revenuecat.js']);

test('the only Ultra gates are the Fellow Aiden push', () => {
  const serverFiles = sourceFiles('api').filter((path) => /\bultra\b|Ultra\(/i.test(code(path)));
  assert.deepEqual(serverFiles.sort(), [...SERVER_ULTRA_FILES].sort(), 'server code reads the Ultra tier in a new place: a new Ultra gate needs the tier copy updated');
  const ultraEndpoints = sourceFiles('api').filter((path) => /(?<!function )withCorsAuthUltra\(/.test(code(path)));
  assert.deepEqual(ultraEndpoints, ['api/aiden.js'], 'a new Ultra-only endpoint needs the tier copy updated');
  assert.match(
    code('api/recipe-command.js'),
    /const requiredTierFor = \(mode\) => \{\n {2}if \(mode === 'set_aiden_link' \|\| mode === 'prepare_attempt'\) return 'ultra';/,
    'only the Aiden link and the Fellow handoff may require Ultra in recipe commands',
  );

  const gates = [];
  for (const path of sourceFiles('src').filter((file) => !ENTITLEMENT_SOURCES.has(file))) {
    let rest = code(path);
    if (path === CLIENT_ULTRA_GATE.file) {
      assert.equal((rest.match(CLIENT_ULTRA_GATE.form) || []).length, CLIENT_ULTRA_GATE.count, `${path}: the Aiden push gates changed`);
      rest = rest.replace(CLIENT_ULTRA_GATE.form, '');
    }
    for (const shape of NON_GATING_ULTRA_READS) rest = rest.replace(shape, '');
    for (const line of rest.split('\n')) {
      if (/\bhasUltra\b|\bhasUltraRef\.current\b|\bisUltra/.test(line)) gates.push(`${path}: ${line.trim()}`);
    }
    if (/['"`]ultra['"`]|startsWith\(\s*['"`]ultra/.test(rest) && !CLIENT_ULTRA_LITERAL_FILES.includes(path)) {
      gates.push(`${path}: reads an 'ultra' plan or tier`);
    }
  }
  assert.deepEqual(gates, [], 'a new client Ultra gate needs the tier copy updated');
});

test('no paywall surface claims an Ultra feature that does not exist', () => {
  const hits = sourceFiles('src').filter((path) => RETIRED_CLAIMS.test(read(path)));
  assert.deepEqual(hits, []);
});

// Every screen that sells Pro or Ultra. Ultra only adds the Fellow Aiden push,
// so no card there may carry a badge that recommends it over Pro.
const PAYWALL_SURFACES = [
  ...sourceFiles('src/components/paywall'),
  'src/components/PaywallSheet.jsx',
  'src/components/onboarding/screens/R13Paywall.jsx',
  'src/components/onboarding/screens/R13bNudge.jsx',
];
// Rendered badge text (a string, or JSX text after `>`) or a badge prop.
// A plain `recommended:` field name is not a badge and does not match.
const RECOMMENDING_BADGE = /(['"`>]\s*(best value|recommended|most popular|best deal|top pick)\b)|\bbestValue\b/i;

test('no paywall card carries a recommending badge', () => {
  const hits = PAYWALL_SURFACES
    .map((path) => [path, code(path).match(RECOMMENDING_BADGE)])
    .filter(([, match]) => match)
    .map(([path, match]) => `${path}: ${match[0].trim()}`);
  assert.deepEqual(hits, []);
});

// Tal 2026-11-24: neither onboarding plan card is styled as the pick.
test('onboarding plan cards give neither plan a highlight', () => {
  assert.doesNotMatch(code('src/components/onboarding/screens/R13Paywall.jsx'), /\brecommended\b/);
});

test('the compare table gives Ultra exactly one extra row, the Aiden push', () => {
  const copy = read('src/components/paywall/paywallCopy.js');
  const rows = [...copy.matchAll(/\{ feature: '([^']+)'[^}]*pro: (true|false), ultra: (true|false) \}/g)]
    .map(([, feature, pro, ultra]) => ({ feature, pro: pro === 'true', ultra: ultra === 'true' }));
  assert.ok(rows.length >= 5, `expected the compare table, found ${rows.length} rows`);
  assert.deepEqual(rows.filter((row) => !row.pro).map((row) => row.feature), ['Push recipes to Fellow Aiden']);
  assert.ok(rows.every((row) => row.ultra), 'Ultra includes everything in Pro');
  assert.ok(rows.some((row) => /Ruphus stories/.test(row.feature) && row.pro), 'Ruphus stories are part of Pro');
});

test('the App Store description matches the ruling', () => {
  const listing = read('docs/launch/asc-listing.md');
  // Only the Description is checked, on purpose. The 1.0 Review Notes further
  // down are the record of what was sent with 1.0 (approved) and still say
  // "multi-brewer support"; they are reference text and are never pasted again.
  const description = listing.slice(listing.indexOf('### Description'), listing.indexOf('### Keywords'));
  assert.ok(description.length > 200, 'the Description section must be found');
  assert.doesNotMatch(description, RETIRED_CLAIMS);
  assert.match(description, /ULTRA[^\n]*\nEverything in Pro, plus direct push of your recipes to a Fellow Aiden brewer\./);
  assert.match(description, /PRO[^\n]*\nEvery AI feature, unlimited:[^\n]*Professor Ruphus stories/);
});
