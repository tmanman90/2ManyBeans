import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('recipe command keeps ordinary auth access while applying per-mode entitlements', async () => {
  const source = await readFile(new URL('../api/recipe-command.js', import.meta.url), 'utf8');
  assert.match(source, /withCorsAuth\(/);
  assert.match(source, /checkEntitlement\(uid\)/);
  assert.match(source, /mode === 'set_aiden_link'.*'ultra'/s);
  assert.match(source, /mode === 'replace_active_recipe'.*'pro'/s);
  assert.match(source, /mode === 'set_aiden_grind'.*'pro'/s);
  assert.doesNotMatch(source, /withCorsAuthPro/);
});

