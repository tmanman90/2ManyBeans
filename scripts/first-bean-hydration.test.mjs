import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const block = source.slice(source.indexOf('  // First-bean celebration:'), source.indexOf('  const handleStartTastingSession'));

function replay(frames) {
  let ref;
  let celebrations = 0;
  const render = new Function('beans', 'dataLoaded', 'uid', 'useState', 'useRef', 'useEffect', block);
  for (const { count, loaded, uid = 'owner' } of frames) {
    render(Array(count), loaded, uid,
      () => [false, value => { if (value) celebrations++; }],
      initial => ref ??= { current: initial },
      effect => effect());
  }
  return celebrations;
}

test('loading an existing inventory does not celebrate a first addition', () => {
  assert.equal(replay([{ count: 0, loaded: false }, { count: 3, loaded: true }]), 0);
  assert.equal(replay([{ count: 0, loaded: false }, { count: 3, loaded: false }, { count: 3, loaded: true }]), 0);
});

test('adding a first bean after an empty loaded inventory still celebrates', () => {
  assert.equal(replay([{ count: 0, loaded: false }, { count: 0, loaded: true }, { count: 1, loaded: true }, { count: 1, loaded: true }]), 1);
});

test('a different owner starts a new inventory baseline', () => {
  assert.equal(replay([{ count: 0, loaded: true }, { count: 3, loaded: true, uid: 'other' }]), 0);
});
