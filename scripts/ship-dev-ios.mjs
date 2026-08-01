#!/usr/bin/env node

/**
 * Upload the web bundle to the actual development iOS app only.
 *
 * This is intentionally stricter than a raw Capgo upload:
 * - the production and development app IDs are different;
 * - the dev native wrapper uses the `-devapp` version lineage;
 * - the social-login Package.swift patch must run before Capgo metadata checks;
 * - Capgo must reject native incompatibility instead of advancing the channel.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const DEV_APP_ID = 'com.talmeltzer.coffeehub.dev';
const DEV_CHANNEL = 'dev';
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(command, args, options = {}) {
  const { capture = false, ...execOptions } = options;
  return execFileSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    ...execOptions,
  });
}

function capgo(args, options = {}) {
  return run('npx', ['@capgo/cli@latest', ...args], options);
}

function baseVersion(version) {
  const match = String(version || '').match(/^(\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1).map(Number) : null;
}

function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function nextDevBundle(packageVersion, currentBundle) {
  const packageBase = baseVersion(packageVersion);
  const currentBase = baseVersion(currentBundle);
  if (!packageBase) throw new Error(`Invalid package version: ${packageVersion}`);

  const highest = currentBase && compareVersions(currentBase, packageBase) >= 0
    ? currentBase
    : packageBase;
  const next = [highest[0], highest[1], highest[2] + 1];
  const timestamp = new Date().toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z')
    .replace('T', '.')
    .replace('Z', '');
  return `${next.join('.')}-devapp.${timestamp}`;
}

const capacitorConfig = readFileSync('capacitor.config.ts', 'utf8');
if (!capacitorConfig.includes(DEV_APP_ID) || !capacitorConfig.includes("defaultChannel: 'dev'")) {
  throw new Error('Dev Capacitor config no longer points at the expected app ID/channel. Refusing upload.');
}

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const currentOutput = capgo(['channel', 'currentBundle', DEV_CHANNEL, DEV_APP_ID], { capture: true });
const currentBundle = currentOutput.match(/Current bundle for channel dev is ([^\s]+)/)?.[1] || '';
const devBundle = nextDevBundle(packageJson.version, currentBundle);

console.log(`Dev app: ${DEV_APP_ID}`);
console.log(`Dev channel: ${DEV_CHANNEL}`);
console.log(`Previous bundle: ${currentBundle || '(none)'}`);
console.log(`New bundle: ${devBundle}`);

// Keep native metadata aligned with the already-installed Dev wrapper before
// Capgo performs its compatibility check.
run('node', ['scripts/patch-social-login.mjs']);
run(npmCommand, ['run', 'build:ios:dev']);

capgo([
  'bundle', 'upload', DEV_APP_ID,
  '--path', './dist',
  '--channel', DEV_CHANNEL,
  '--bundle', devBundle,
  '--fail-on-incompatible',
  '--comment', `Dev iOS bundle from ${process.env.GIT_COMMIT || 'local source'}`,
]);

const afterOutput = capgo(['channel', 'currentBundle', DEV_CHANNEL, DEV_APP_ID], { capture: true });
const afterBundle = afterOutput.match(/Current bundle for channel dev is ([^\s]+)/)?.[1] || '';
if (afterBundle !== devBundle) {
  throw new Error(`Capgo channel verification failed: expected ${devBundle}, found ${afterBundle || '(none)'}`);
}

console.log(`Verified ${DEV_APP_ID} / ${DEV_CHANNEL} -> ${devBundle}`);
