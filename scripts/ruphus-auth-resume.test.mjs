import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { build, transform } from 'esbuild';

async function transport(user) {
  const result = await build({
    stdin: { contents: 'export * from "./src/lib/streamChat.js"; export * from "./src/lib/fetchWithRetry.js";', resolveDir: process.cwd() },
    bundle: true, write: false, format: 'cjs', platform: 'node',
    plugins: [{ name: 'isolated-auth', setup(builder) {
      builder.onResolve({ filter: /^\.\.\/firebase$/ }, () => ({ path: 'firebase', namespace: 'stub' }));
      builder.onResolve({ filter: /^@capacitor\/core$/ }, () => ({ path: 'capacitor', namespace: 'stub' }));
      builder.onLoad({ filter: /.*/, namespace: 'stub' }, ({ path }) => ({ contents: path === 'firebase'
        ? 'export const auth = globalThis.testAuth;'
        : 'export const Capacitor = {isNativePlatform:()=>false};' }));
    } }],
  });
  const module = { exports: {} };
  const context = { module, exports: module.exports, testAuth: { currentUser: user }, Response, TextDecoder, console,
    setTimeout: (fn) => { fn(); }, fetch: async () => { throw new Error('Unexpected network call'); } };
  vm.runInNewContext(result.outputFiles[0].text, context);
  return { ...module.exports, context };
}

test('expired-session quota error sends no anonymous request and preserves the signed-in user', async () => {
  const user = { getIdToken: async () => { throw Object.assign(new Error('private provider detail'), { code: 'auth/quota-exceeded' }); } };
  const api = await transport(user);
  let calls = 0, error;
  api.context.fetch = async () => { calls++; };
  await api.streamWithAuth({ url: '/api/ruphus-agent', body: {}, onError: e => { error = e; } });
  assert.equal(calls, 0);
  assert.equal(error.code, 'auth_temporarily_limited');
  assert.match(api.chatErrorMessage(error), /Sign-in renewal.*rate-limited/);
  assert.doesNotMatch(error.message, /private provider/);
  assert.equal(api.context.testAuth.currentUser, user);
  // Recovery uses the same account on the next explicit retry, not sign-out.
  user.getIdToken = async () => 'test-token';
  api.context.fetch = async () => { calls++; return new Response('{"type":"usage","usage":{}}\n'); };
  let completed = false;
  await api.streamWithAuth({ url: '/api/ruphus-agent', body: {}, onDone: () => { completed = true; } });
  assert.equal(calls, 1);
  assert.equal(completed, true);
});

test('rejected credentials are reported once, while transient errors can retry', async () => {
  for (const status of [401, 403, 400, 503]) {
    const api = await transport({ getIdToken: async () => 'test-token' });
    let calls = 0, error;
    api.context.fetch = async () => { calls++; return new Response('{}', { status }); };
    await api.streamWithAuth({ url: '/api/ruphus-agent', body: {}, onError: e => { error = e; } });
    assert.equal(calls, status === 503 ? 3 : 1, `status ${status}`);
    assert.ok(error);
    if (status === 401) assert.equal(error.code, 'auth_session_unavailable');
  }
});

test('agent execution failures preserve truthful retry copy without leaking internal errors', async () => {
  const api = await transport({ getIdToken: async () => 'test-token' });
  for (const code of ['tool_round_limit', 'provider_error', 'unknown']) {
    const copy = api.chatErrorMessage({ code, message: 'private internal details' }, { agent: true });
    assert.equal(copy, 'I couldn’t finish that response. Your message is kept—try again.');
    assert.doesNotMatch(copy, /network|connection|private internal/);
  }
  const authError = { code: 'auth_session_unavailable', message: 'Please sign in again.' };
  assert.equal(api.chatErrorMessage(authError, { agent: true }), authError.message);
  assert.equal(api.chatErrorMessage({}), "Couldn't reach the AI. Try again in a sec.");
});

test('native initial load and 360 suspended polling ticks share one pending fetch', async () => {
  const source = await readFile('src/hooks/useAppData.js', 'utf8');
  const { code } = await transform(source, { format: 'cjs' });
  const effects = [], intervals = [];
  let reads = 0, release;
  let pending = new Promise(resolve => { release = resolve; });
  const fs = { collection: () => ({}), getDocs: async () => { reads++; return pending; } };
  const react = { useState: value => [value, () => {}], useRef: current => ({ current }), useCallback: fn => fn, useEffect: fn => effects.push(fn) };
  const module = { exports: {} };
  const noop = new Proxy({}, { get: () => () => undefined });
  const context = { module, exports: module.exports, console,
    document: { hidden: false, addEventListener() {}, removeEventListener() {} },
    setTimeout: () => 1, clearTimeout() {}, clearInterval() {},
    setInterval: fn => { intervals.push(fn); return 1; },
    require: name => name === 'react' ? react : name === 'firebase/firestore' ? fs
      : name === '@capacitor/core' ? { Capacitor: { isNativePlatform: () => true } } : noop,
  };
  vm.runInNewContext(code, context);
  const data = module.exports.useAppData('owner-test');
  const cleanups = effects.map(fn => fn());
  assert.equal(intervals.length, 1);
  for (let i = 0; i < 360; i++) intervals[0]();
  const refetch = data.refetch();
  assert.equal(reads, 2, 'one beans and one tastings request; no queued poll backlog');
  release({ docs: [] });
  await refetch;
  pending = Promise.resolve({ docs: [] });
  await data.refetch();
  assert.equal(reads, 4, 'later refresh still works');
  context.document.hidden = true;
  intervals[0]();
  assert.equal(reads, 4, 'background tick cannot start another fetch');
  cleanups.forEach(fn => fn?.());
});
