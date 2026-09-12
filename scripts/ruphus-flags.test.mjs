import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../src/lib/ruphus/featureFlags.js', import.meta.url), 'utf8');
function flags(variant) {
  return vm.runInNewContext(source.replaceAll('export const ', 'const ').replaceAll('import.meta.env', '{}')
    + '\n({ access: isRuphusAgentV3Enabled, mutation: isRuphusMutationEnabled })',
  variant === undefined ? {} : { __APP_VARIANT__: variant });
}
const env = { VITE_RUPHUS_AGENT_V3_UIDS: ' owner ', VITE_RUPHUS_AGENT_V3_MUTATION_UIDS: 'owner, other' };
test('production pilot enables only the exact authenticated owner, never demos', () => {
  const f = flags('prod');
  for (const uid of [undefined, '', 'other', 'owner-suffix']) {
    assert.equal(f.access({ uid, env }), false);
    assert.equal(f.mutation({ uid, env }), false);
  }
  assert.equal(f.access({ uid: 'owner', env }), true);
  assert.equal(f.mutation({ uid: 'owner', env }), true);
  assert.equal(f.access({ uid: 'owner', env, isDemo: true }), false);
  assert.equal(f.mutation({ uid: 'owner', env, isDemo: true }), false);
  assert.equal(f.access({ uid: 'owner' }), false);
  assert.equal(f.access({ uid: 'owner', env: { VITE_RUPHUS_AGENT_V3_UIDS: '*' } }), false);
  assert.equal(f.mutation({ uid: 'owner', env: { VITE_RUPHUS_AGENT_V3_UIDS: 'owner' } }), false);
});
test('Dev behavior is preserved and unknown compiled variants fail closed', () => {
  assert.equal(flags('dev').access(), true);
  assert.equal(flags('dev').access({ isDemo: true }), false);
  assert.equal(flags('dev').mutation({ uid: 'owner', env }), true);
  assert.equal(flags('dev').mutation({ uid: 'stranger', env }), false);
  for (const variant of [undefined, 'preview', 'production', '']) {
    assert.equal(flags(variant).access({ uid: 'owner', env }), false);
  }
});
test('account switching is evaluated per call and every entry supplies UID', () => {
  const f = flags('prod');
  assert.equal(f.access({ uid: 'owner', env }), true);
  assert.equal(f.access({ uid: 'other', env }), false);
  for (const tab of ['Chat', 'Rotation', 'Inventory', 'Tasting']) {
    const text = readFileSync(new URL('../src/tabs/' + tab + 'Tab.jsx', import.meta.url), 'utf8');
    assert.ok(text.includes('isRuphusAgentV3Enabled({ uid, isDemo })'));
  }
});
