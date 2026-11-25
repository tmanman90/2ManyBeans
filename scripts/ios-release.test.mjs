// App Store release guards (1.1 release plan N1-N4):
//   - the release preflight in assert-ios-build-env.mjs refuses a shell that
//     would embed a broken or dev bundle in the App Store binary;
//   - the Bluetooth permission text names the app, in both places it lives;
//   - verify-ios-release.mjs catches every archive miss on a fixture App.app.
// The archive checks need plutil, codesign and ditto, so they run on macOS only.
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(join(REPO, path), 'utf8');
const macOnly = { skip: process.platform !== 'darwin' && 'needs plutil and codesign' };
// The preflight also reads env files the way Vite does. Point it at an empty
// folder so this checkout's own files never decide a test.
const NO_ENV_FILES = mkdtempSync(join(tmpdir(), 'preflight-no-env-'));
process.on('exit', () => rmSync(NO_ENV_FILES, { recursive: true, force: true }));

const FIREBASE = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
];
const SENTINEL = 'release-secret-must-never-appear-in-output';

function releaseGuard(overrides = {}) {
  const env = { PATH: process.env.PATH, TMB_ENV_DIR: NO_ENV_FILES };
  for (const name of FIREBASE) env[name] = SENTINEL;
  for (const [name, value] of Object.entries(overrides)) {
    if (value === undefined) delete env[name];
    else env[name] = value;
  }
  return spawnSync(process.execPath, ['scripts/assert-ios-build-env.mjs', 'release'], { cwd: REPO, env, encoding: 'utf8' });
}

test('release preflight passes a complete App Store shell', () => {
  const result = releaseGuard();
  assert.equal(result.status, 0, result.stderr);
});

test('release preflight refuses missing Firebase values, by name only', () => {
  for (const name of FIREBASE) {
    for (const value of [undefined, '   ']) {
      const result = releaseGuard({ [name]: value });
      assert.notEqual(result.status, 0, `${name}=${JSON.stringify(value)} must fail`);
      assert.match(result.stderr, new RegExp(name));
      assert.doesNotMatch(result.stdout + result.stderr, new RegExp(SENTINEL));
    }
  }
});

test('release preflight refuses dev switches', () => {
  for (const [name, value] of [['VITE_FAKE_SCALE', '1'], ['TMB_APP_VARIANT', 'dev'], ['TMB_DISABLE_CAPGO_UPDATES', '1']]) {
    const result = releaseGuard({ [name]: value });
    assert.notEqual(result.status, 0, `${name}=${value} must fail`);
    assert.match(result.stderr, new RegExp(name));
  }
});

// Vite embeds VITE_* values from env files, so the preflight must see them there
// too (the 1.1.256 ship had its keys in .env.local, not the shell).
function guardWithEnvFile(fileName, lines, shell = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'preflight-env-file-'));
  try {
    writeFileSync(join(dir, fileName), `${lines.join('\n')}\n`);
    const env = { PATH: process.env.PATH, TMB_ENV_DIR: dir, ...shell };
    return spawnSync(process.execPath, ['scripts/assert-ios-build-env.mjs', 'release'], { cwd: REPO, env, encoding: 'utf8' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('release preflight accepts Firebase values that live only in an env file Vite reads', () => {
  for (const fileName of ['.env', '.env.local', '.env.production', '.env.production.local']) {
    const result = guardWithEnvFile(fileName, FIREBASE.map((name) => `${name}=${SENTINEL}`));
    assert.equal(result.status, 0, `${fileName}: ${result.stderr}`);
    assert.doesNotMatch(result.stdout + result.stderr, new RegExp(SENTINEL));
  }
});

test('release preflight ignores env files Vite does not read in a production build', () => {
  const result = guardWithEnvFile('.env.development', FIREBASE.map((name) => `${name}=${SENTINEL}`));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /VITE_FIREBASE_API_KEY/);
});

test('release preflight refuses the simulated scale set in an env file', () => {
  const result = guardWithEnvFile('.env.local', [...FIREBASE.map((name) => `${name}=${SENTINEL}`), 'VITE_FAKE_SCALE=1']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /VITE_FAKE_SCALE/);
});

test('a blank shell value wins over an env file, as it does in Vite', () => {
  const result = guardWithEnvFile('.env.local', FIREBASE.map((name) => `${name}=${SENTINEL}`), { VITE_FIREBASE_APP_ID: '   ' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /VITE_FIREBASE_APP_ID/);
  assert.doesNotMatch(result.stdout + result.stderr, new RegExp(SENTINEL));
});

test('the App Store sync and copy run the release preflight first', () => {
  const { scripts } = JSON.parse(read('package.json'));
  for (const name of ['cap:sync', 'cap:copy']) {
    assert.match(scripts[name], /^node scripts\/assert-ios-build-env\.mjs release && /, `${name} must fail closed before Vite`);
  }
  assert.equal(scripts['build:ios'], 'CAPACITOR_BUILD=true vite build');
  assert.match(scripts['build:ios:dev'], /^node scripts\/assert-ios-build-env\.mjs && /);
});

// Runs the real ship script with stand-in npx and npm first on PATH. They only
// record that they were called and exit 1, so nothing can reach Capgo even if
// the preflight line is removed. A refused shell must stop before either is called.
function shipProduction(overrides = {}) {
  const bin = mkdtempSync(join(tmpdir(), 'ship-prod-bin-'));
  const calls = join(bin, 'calls.log');
  for (const tool of ['npx', 'npm']) {
    writeFileSync(join(bin, tool), `#!/bin/sh\necho "${tool} $*" >> "${calls}"\nexit 1\n`, { mode: 0o755 });
  }
  const env = { PATH: `${bin}:/usr/bin:/bin`, TMB_ENV_DIR: NO_ENV_FILES };
  for (const name of FIREBASE) env[name] = SENTINEL;
  for (const [name, value] of Object.entries(overrides)) {
    if (value === undefined) delete env[name];
    else env[name] = value;
  }
  try {
    const result = spawnSync(process.execPath, ['scripts/ship-production-ios.mjs'], { cwd: REPO, env, encoding: 'utf8' });
    let called = '';
    try { called = readFileSync(calls, 'utf8'); } catch { /* nothing was called */ }
    return { ...result, called };
  } finally {
    rmSync(bin, { recursive: true, force: true });
  }
}

test('ship:prod:ios refuses dev switches and missing Firebase before any Capgo or npm call', () => {
  for (const [name, value] of [
    ['VITE_FAKE_SCALE', '1'],
    ['TMB_APP_VARIANT', 'dev'],
    ['TMB_DISABLE_CAPGO_UPDATES', '1'],
    ['VITE_FIREBASE_APP_ID', undefined],
  ]) {
    const result = shipProduction({ [name]: value });
    assert.notEqual(result.status, 0, `${name}=${value} must stop the production ship`);
    assert.match(result.stderr, new RegExp(name));
    assert.equal(result.called, '', `${name}=${value} reached: ${result.called}`);
    assert.doesNotMatch(result.stdout + result.stderr, new RegExp(SENTINEL));
  }
});

test('ship:prod:ios lets a clean shell through to Capgo', () => {
  const result = shipProduction();
  assert.match(result.called, /^npx @capgo\/cli@latest channel currentBundle production com\.talmeltzer\.coffeehub/);
});

test('the Bluetooth permission text names 2manybeans in the plist and the variant script', () => {
  const plist = read('ios/App/App/Info.plist').match(/<key>NSBluetoothAlwaysUsageDescription<\/key>\s*<string>([^<]+)<\/string>/)?.[1];
  const script = read('scripts/configure-ios-variant.mjs').match(/<key>NSBluetoothAlwaysUsageDescription<\/key>\\n\\t<string>([^<]+)<\/string>/)?.[1];
  assert.ok(plist, 'Info.plist must declare NSBluetoothAlwaysUsageDescription');
  assert.equal(script, plist, 'configure-ios-variant.mjs must insert the same text');
  assert.match(plist, /^2manybeans /);
  assert.doesNotMatch(plist, /Coffee Hub/);
});

// ---- verify-ios-release.mjs on a fixture App.app -------------------------

function writePlist(path, value) {
  writeFileSync(path, JSON.stringify(value));
  execFileSync('plutil', ['-convert', 'xml1', path]);
}

function buildFixture(expected, { info = {}, widget = {}, capacitor = {}, entitlements = {}, publicText = 'console.log("ok")', withWidget = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'ios-release-fixture-'));
  const app = join(root, 'App.app');
  mkdirSync(join(app, 'public/assets'), { recursive: true });
  copyFileSync('/usr/bin/true', join(app, 'App'));
  writePlist(join(app, 'Info.plist'), {
    CFBundleExecutable: 'App',
    CFBundlePackageType: 'APPL',
    CFBundleDisplayName: '2manybeans',
    CFBundleIdentifier: 'com.talmeltzer.coffeehub',
    CFBundleShortVersionString: expected.version,
    CFBundleVersion: expected.build,
    NSSupportsLiveActivities: true,
    NSBluetoothAlwaysUsageDescription: expected.bluetooth,
    CFBundleURLTypes: [{ CFBundleURLSchemes: [expected.googleScheme] }, { CFBundleURLSchemes: ['com.talmeltzer.coffeehub'] }],
    ...info,
  });
  if (withWidget) {
    mkdirSync(join(app, 'PlugIns/BrewActivityWidget.appex'), { recursive: true });
    writePlist(join(app, 'PlugIns/BrewActivityWidget.appex/Info.plist'), {
      CFBundleIdentifier: 'com.talmeltzer.coffeehub.BrewActivity',
      CFBundleShortVersionString: expected.version,
      CFBundleVersion: expected.build,
      ...widget,
    });
  }
  writeFileSync(join(app, 'capacitor.config.json'), JSON.stringify({
    appId: 'com.talmeltzer.coffeehub',
    appName: '2manybeans',
    backgroundColor: expected.webViewBackground,
    plugins: { CapacitorUpdater: { autoUpdate: true } },
    ...capacitor,
  }));
  writeFileSync(join(app, 'public/assets/index.js'), publicText);
  const entitlementsPath = join(root, 'entitlements.plist');
  writePlist(entitlementsPath, { 'com.apple.developer.applesignin': ['Default'], 'get-task-allow': false, ...entitlements });
  execFileSync('codesign', ['-f', '-s', '-', '--entitlements', entitlementsPath, app], { stdio: 'ignore' });
  return { root, app };
}

async function verifier() {
  return import('./verify-ios-release.mjs');
}

test('the archive check reads the expected build from the repo', macOnly, async () => {
  const { expectedRelease } = await verifier();
  const expected = expectedRelease();
  assert.equal(expected.version, '1.1');
  assert.equal(expected.build, '43');
  assert.match(expected.bluetooth, /^2manybeans /);
  assert.equal(expected.webViewBackground, '#F3EDE4');
  assert.match(expected.googleScheme, /^com\.googleusercontent\.apps\./);
});

test('the WebView background is the colour the page paints first', () => {
  // body in global.css is the first surface the app draws; the WebView colour
  // shows until then, so the two must match or a slow start flashes.
  const body = read('src/styles/global.css').match(/^body \{[^}]*?\n {2}background: (#[0-9A-Fa-f]{6});/m)?.[1];
  const config = read('capacitor.config.ts');
  assert.ok(body, 'global.css body background not found');
  assert.equal(config.match(/^ {2}backgroundColor: '([^']+)'/m)?.[1], body);
  assert.doesNotMatch(config, /ios: \{[^}]*backgroundColor/, 'an ios.backgroundColor would override it');
});

test('the archive check passes a correct App Store app', macOnly, async () => {
  const { expectedRelease, verifyIosRelease } = await verifier();
  const expected = expectedRelease();
  const { root, app } = buildFixture(expected);
  try {
    assert.deepEqual(verifyIosRelease(app, expected), { misses: [], notes: [] });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the archive check reports every miss', macOnly, async () => {
  const { expectedRelease, verifyIosRelease } = await verifier();
  const expected = expectedRelease();
  const cases = [
    [{ info: { CFBundleDisplayName: '2manybeans Dev' } }, /display name/],
    [{ info: { CFBundleIdentifier: 'com.talmeltzer.coffeehub.dev' } }, /App bundle ID/],
    [{ info: { CFBundleVersion: '42' } }, /App build is 42/],
    [{ info: { CFBundleShortVersionString: '1.0' } }, /App version is 1\.0/],
    [{ info: { NSSupportsLiveActivities: false } }, /NSSupportsLiveActivities/],
    [{ info: { NSBluetoothAlwaysUsageDescription: 'Coffee Hub connects to your coffee scale to track your pours.' } }, /Bluetooth text/],
    [{ info: { UIBackgroundModes: ['bluetooth-central'] } }, /UIBackgroundModes/],
    [{ info: { CFBundleURLTypes: [{ CFBundleURLSchemes: ['com.googleusercontent.apps.dev-client'] }] } }, /Google sign-in URL scheme/],
    [{ info: { CFBundleURLTypes: [] } }, /Google sign-in URL scheme is undefined/],
    [{ widget: { CFBundleVersion: '42' } }, /Widget build/],
    [{ widget: { CFBundleIdentifier: 'com.talmeltzer.coffeehub.dev.BrewActivity' } }, /Widget bundle ID/],
    [{ withWidget: false }, /BrewActivityWidget\.appex is missing/],
    [{ capacitor: { appId: 'com.talmeltzer.coffeehub.dev' } }, /appId/],
    [{ capacitor: { plugins: { CapacitorUpdater: { autoUpdate: false } } } }, /autoUpdate/],
    [{ capacitor: { backgroundColor: undefined } }, /backgroundColor is undefined/],
    [{ capacitor: { ios: { backgroundColor: '#FFFFFF' } } }, /ios\.backgroundColor/],
    [{ capacitor: { plugins: { CapacitorUpdater: { autoUpdate: true, defaultChannel: 'dev' } } } }, /defaultChannel/],
    [{ capacitor: { server: { url: 'http://localhost:5173' } } }, /simulator setting/],
    [{ publicText: 'onFound({deviceId:"fake-pearl-s"})' }, /fake-pearl-s/],
    [{ publicText: 'offeringIdentifier:"dev_stub"' }, /dev_stub/],
    [{ publicText: 'allow Coffee Hub under Settings' }, /allow Coffee Hub/],
    [{ entitlements: { 'com.apple.developer.applesignin': undefined } }, /Sign in with Apple/],
    [{ entitlements: { 'get-task-allow': true } }, /get-task-allow is true/],
  ];
  for (const [options, expectedMiss] of cases) {
    const { root, app } = buildFixture(expected, options);
    try {
      const { misses } = verifyIosRelease(app, expected);
      assert.equal(misses.length, 1, `${JSON.stringify(options)} gave ${JSON.stringify(misses)}`);
      assert.match(misses[0], expectedMiss);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test('the archive check runs on an .xcarchive and an .ipa from the command line', macOnly, async () => {
  const { expectedRelease } = await verifier();
  const expected = expectedRelease();
  const { root, app } = buildFixture(expected);
  try {
    const archiveApps = join(root, 'Fixture.xcarchive/Products/Applications');
    mkdirSync(archiveApps, { recursive: true });
    execFileSync('ditto', [app, join(archiveApps, 'App.app')]);
    mkdirSync(join(root, 'Payload'));
    execFileSync('ditto', [app, join(root, 'Payload/App.app')]);
    execFileSync('ditto', ['-c', '-k', '--keepParent', join(root, 'Payload'), join(root, 'Fixture.ipa')]);
    for (const input of [join(root, 'Fixture.xcarchive'), join(root, 'Fixture.ipa'), app]) {
      const result = spawnSync(process.execPath, ['scripts/verify-ios-release.mjs', input], { cwd: REPO, encoding: 'utf8' });
      assert.equal(result.status, 0, `${input}: ${result.stdout}${result.stderr}`);
      assert.match(result.stdout, /Release checks passed\./);
    }
    writeFileSync(join(root, 'Payload/App.app/public/assets/index.js'), 'name:"PEARLS-0F2A"');
    const bad = spawnSync(process.execPath, ['scripts/verify-ios-release.mjs', join(root, 'Payload/App.app')], { cwd: REPO, encoding: 'utf8' });
    assert.equal(bad.status, 1);
    assert.match(bad.stdout, /MISS "PEARLS-0F2A" found/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
