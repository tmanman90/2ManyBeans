// Guards the iOS web bundle that Capgo ships over the air. Capgo asks for
// bundles under 20 MB; 1.1.255 went out at 120 MB because the Ruphus videos
// (served from the CDN on native anyway) and full-size PNGs rode along.
// It also proves a production native build carries none of the dev-only tools
// (App Review guideline 2.5.19: no hidden or dormant features).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { after, before } from 'node:test';
import { CDN_PREFIXES } from '../src/lib/cdnAssets.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const MAX_BUNDLE_BYTES = 20 * 1024 * 1024;

function filesUnder(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

test('every static /images path in src exists in public', () => {
  const missing = [];
  for (const file of filesUnder(join(root, 'src'))) {
    if (!/\.(jsx?|mjs|css)$/.test(file)) continue;
    const source = readFileSync(file, 'utf8');
    for (const [path] of source.matchAll(/\/images\/[\w@./-]+\.(?:png|jpe?g|webp|mp4|svg)/g)) {
      if (!existsSync(join(root, 'public', path))) missing.push(`${path} (${file.slice(root.length)})`);
    }
  }
  assert.deepEqual(missing, []);
});

test('fonts are self-hosted, so first paint never waits on the network', () => {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  assert.doesNotMatch(html, /<link[^>]+href="https?:\/\//, 'index.html must not load an external stylesheet or preconnect');
  const css = readFileSync(join(root, 'src/styles/fonts.css'), 'utf8');
  const files = [...css.matchAll(/url\((\/fonts\/[\w.-]+\.woff2)\)/g)].map((match) => match[1]);
  assert.ok(files.length > 0, 'fonts.css declares no font files');
  assert.deepEqual(files.filter((path) => !existsSync(join(root, 'public', path))), []);
  assert.match(readFileSync(join(root, 'src/styles/global.css'), 'utf8'), /^@import '\.\/fonts\.css';/);
});

test('every tasting-note illustration resolves to a bundled WebP', () => {
  const source = readFileSync(join(root, 'src/lib/tastingIcons.jsx'), 'utf8');
  const block = source.slice(source.indexOf('const IMAGE_ICONS = {'), source.indexOf('export function tastingIconImage'));
  const names = new Set([...block.matchAll(/:\s*'([a-z-]+)'/g)].map((match) => match[1]));
  assert.ok(names.size > 50, `expected the full icon map, found ${names.size}`);
  assert.match(source, /`\/images\/tasting-icons\/\$\{IMAGE_ICONS\[n\]\}\.webp`/);
  assert.match(source, /`\/images\/tasting-icons\/\$\{f\}\.webp`/);
  const missing = [...names].filter((name) => !existsSync(join(root, 'public/images/tasting-icons', `${name}.webp`)));
  assert.deepEqual(missing, []);
});

// One production native build for the tests below. The shell's dev switches
// never leak into it.
let outDir;
before(() => {
  outDir = mkdtempSync(join(tmpdir(), 'coffee-hub-native-bundle-'));
  const env = { ...process.env, CAPACITOR_BUILD: 'true' };
  delete env.TMB_APP_VARIANT;
  delete env.VITE_FAKE_SCALE;
  execFileSync('npx', ['vite', 'build', '--outDir', outDir, '--emptyOutDir', '--manifest', '--logLevel', 'error'], {
    cwd: root,
    env,
    stdio: ['ignore', 'ignore', 'inherit'],
  });
});
after(() => rmSync(outDir, { recursive: true, force: true }));

test('the native build drops CDN-served media and stays under 20 MB', () => {
  for (const prefix of CDN_PREFIXES) {
    assert.equal(existsSync(join(outDir, prefix)), false, `${prefix} must not be bundled on native`);
  }
  const total = filesUnder(outDir).reduce((sum, file) => sum + statSync(file).size, 0);
  console.log(`Native bundle: ${(total / 1024 / 1024).toFixed(2)} MB`);
  assert.ok(total < MAX_BUNDLE_BYTES, `native bundle is ${(total / 1024 / 1024).toFixed(1)} MB, budget is 20 MB`);
});

// Markers of the simulated scale (fakeScale.js), the dev paywall price stub
// (devOfferings.js), the dev Settings panel, and the old app name in the
// Bluetooth help text.
const DEV_ONLY_MARKERS = ['fake-pearl-s', 'PEARLS-0F2A', 'Replay onboarding', 'dev_stub', 'allow Coffee Hub'];

test('the production native build carries no dev-only tools', () => {
  const hits = [];
  for (const file of filesUnder(outDir)) {
    if (!/\.(js|html|css|json)$/.test(file)) continue;
    const text = readFileSync(file, 'utf8');
    for (const marker of DEV_ONLY_MARKERS) {
      if (text.includes(marker)) hits.push(`${marker} in ${file.slice(outDir.length + 1)}`);
    }
  }
  assert.deepEqual(hits, []);
});

// Onboarding is lazy (main.jsx). A forced manualChunks rule once made the entry
// import and preload the onboarding chunk on every launch.
test('the native build never imports or preloads onboarding at launch', () => {
  const manifest = JSON.parse(readFileSync(join(outDir, '.vite/manifest.json'), 'utf8'));
  const startup = new Set();
  const walk = (key) => {
    if (startup.has(key)) return;
    startup.add(key);
    for (const next of manifest[key].imports || []) walk(next);
  };
  walk('index.html');
  const isOnboarding = (key) => /onboarding/i.test(`${key} ${manifest[key].name || ''} ${manifest[key].src || ''}`);
  const loadedAtLaunch = [...startup].filter(isOnboarding).map((key) => manifest[key].file);
  assert.deepEqual(loadedAtLaunch, [], 'the entry statically imports (and index.html preloads) onboarding code');
  const flow = manifest['src/components/onboarding/OnboardingFlow.jsx'];
  assert.ok(flow?.isDynamicEntry, 'OnboardingFlow must be its own lazy chunk');
  assert.ok(!readFileSync(join(outDir, 'index.html'), 'utf8').includes(flow.file), `index.html preloads ${flow.file}`);
});
