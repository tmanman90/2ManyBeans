// Guards the iOS web bundle that Capgo ships over the air. Capgo asks for
// bundles under 20 MB; 1.1.255 went out at 120 MB because the Ruphus videos
// (served from the CDN on native anyway) and full-size PNGs rode along.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
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

test('the native build drops CDN-served media and stays under 20 MB', () => {
  const outDir = mkdtempSync(join(tmpdir(), 'coffee-hub-native-bundle-'));
  try {
    execFileSync('npx', ['vite', 'build', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'error'], {
      cwd: root,
      env: { ...process.env, CAPACITOR_BUILD: 'true' },
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    for (const prefix of CDN_PREFIXES) {
      assert.equal(existsSync(join(outDir, prefix)), false, `${prefix} must not be bundled on native`);
    }
    const total = filesUnder(outDir).reduce((sum, file) => sum + statSync(file).size, 0);
    console.log(`Native bundle: ${(total / 1024 / 1024).toFixed(2)} MB`);
    assert.ok(total < MAX_BUNDLE_BYTES, `native bundle is ${(total / 1024 / 1024).toFixed(1)} MB, budget is 20 MB`);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});
