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

test('the only Ultra gates are the Fellow Aiden push', () => {
  const ultraEndpoints = sourceFiles('api').filter((path) => /(?<!function )withCorsAuthUltra\(/.test(read(path)));
  assert.deepEqual(ultraEndpoints, ['api/aiden.js'], 'a new Ultra-only endpoint needs the tier copy updated');
  const recipeCommand = read('api/recipe-command.js');
  assert.match(
    recipeCommand,
    /const requiredTierFor = \(mode\) => \{\n {2}if \(mode === 'set_aiden_link' \|\| mode === 'prepare_attempt'\) return 'ultra';/,
    'only the Aiden link and the Fellow handoff may require Ultra in recipe commands',
  );
  const clientUltraGates = sourceFiles('src').filter((path) => /if \(!hasUltra\)/.test(read(path)));
  assert.deepEqual(clientUltraGates, ['src/hooks/useAidenBrew.js'], 'a new client Ultra gate needs the tier copy updated');
});

test('no paywall surface claims an Ultra feature that does not exist', () => {
  const hits = sourceFiles('src').filter((path) => RETIRED_CLAIMS.test(read(path)));
  assert.deepEqual(hits, []);
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
  const description = listing.slice(listing.indexOf('### Description'), listing.indexOf('### Keywords'));
  assert.doesNotMatch(description, RETIRED_CLAIMS);
  assert.match(description, /ULTRA[^\n]*\nEverything in Pro, plus direct push of your recipes to a Fellow Aiden brewer\./);
  assert.match(description, /PRO[^\n]*\nEvery AI feature, unlimited:[^\n]*Professor Ruphus stories/);
});
