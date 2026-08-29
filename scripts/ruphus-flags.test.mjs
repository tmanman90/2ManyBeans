import assert from 'node:assert/strict';
import test from 'node:test';
// Keep this check source-based because Vite's import.meta.env is intentionally
// unavailable in the Node contract runner.
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../src/lib/ruphus/featureFlags.js', import.meta.url), 'utf8');
test('Agent v3 and mutation flags are independent and production-safe', () => {
  assert.match(source, /MODE !== 'production'/);
  assert.match(source, /VITE_RUPHUS_AGENT_V3/);
  assert.match(source, /VITE_RUPHUS_AGENT_V3_MUTATION/);
  assert.match(source, /isDemo/);
});
