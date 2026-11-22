#!/usr/bin/env node

/**
 * Upload the web bundle to the actual development iOS app only.
 *
 * This is intentionally stricter than a raw Capgo upload:
 * - the production and development app IDs are different;
 * - the dev native wrapper uses the `-devapp` version lineage;
 * - the social-login Package.swift patch must run before Capgo metadata checks;
 * - Capgo must reject native incompatibility instead of advancing the channel,
 *   except plugins the JS guards at runtime (scripts/capgo-compat.mjs).
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compatibilityUploadFlag } from './capgo-compat.mjs';
import { semverSafeDevTimestamp } from './ship-dev-version.mjs';

const DEV_APP_ID = 'com.talmeltzer.coffeehub.dev';
const DEV_CHANNEL = 'dev';
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const REQUIRED_BUILD_ENV = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
];

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
  const timestamp = semverSafeDevTimestamp();
  return `${next.join('.')}-devapp.${timestamp}`;
}

// social-login's own cap sync hook rewrites its podspec, and Capgo checksums
// that file. Upload from the published copy so a recent cap sync (any Dev
// TestFlight build) does not read as a native change.
function restorePublishedSocialLoginPodspec() {
  const packageRoot = 'node_modules/@capgo/capacitor-social-login';
  const { version } = JSON.parse(readFileSync(`${packageRoot}/package.json`, 'utf8'));
  const staging = mkdtempSync(join(tmpdir(), 'coffee-hub-social-login-'));
  try {
    run(npmCommand, ['pack', `@capgo/capacitor-social-login@${version}`, '--pack-destination', staging], { capture: true });
    const archive = readdirSync(staging).find((name) => name.endsWith('.tgz'));
    if (!archive) throw new Error(`Could not fetch the published social-login ${version} podspec.`);
    const podspec = run('tar', ['-xOf', join(staging, archive), 'package/CapgoCapacitorSocialLogin.podspec'], { capture: true });
    writeFileSync(`${packageRoot}/CapgoCapacitorSocialLogin.podspec`, podspec, 'utf8');
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

const capacitorConfig = readFileSync('capacitor.config.ts', 'utf8');
if (!capacitorConfig.includes(DEV_APP_ID) || !capacitorConfig.includes("defaultChannel: 'dev'")) {
  throw new Error('Dev Capacitor config no longer points at the expected app ID/channel. Refusing upload.');
}

const missingBuildEnv = REQUIRED_BUILD_ENV.filter((name) => !process.env[name]);
if (missingBuildEnv.length > 0) {
  throw new Error(
    `Missing ${missingBuildEnv.join(', ')}. Refusing OTA upload because the bundle would not have a valid Firebase config. Pull the Vercel production environment into the shell before shipping.`,
  );
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
restorePublishedSocialLoginPodspec();
run('node', ['scripts/patch-social-login.mjs']);

const compatibility = compatibilityUploadFlag(
  capgo(['bundle', 'compatibility', DEV_APP_ID, '--channel', DEV_CHANNEL, '--text'], { capture: true }),
);
if (compatibility.accepted.length > 0) {
  console.log(`Accepting runtime-guarded native plugins missing from older binaries: ${compatibility.accepted.join(', ')}`);
}

run(npmCommand, ['run', 'build:ios:dev']);

capgo([
  'bundle', 'upload', DEV_APP_ID,
  '--path', './dist',
  '--channel', DEV_CHANNEL,
  '--bundle', devBundle,
  compatibility.flag,
  // Delta only: devices fetch just the files that changed. Every native build
  // has shipped @capgo/capacitor-updater 8.45.0 (delta needs 7.0.35+ on 7.x),
  // so no installed app needs the full zip.
  '--delta-only',
  '--comment', `Dev iOS bundle from ${process.env.GIT_COMMIT || 'local source'}`,
]);

const afterOutput = capgo(['channel', 'currentBundle', DEV_CHANNEL, DEV_APP_ID], { capture: true });
const afterBundle = afterOutput.match(/Current bundle for channel dev is ([^\s]+)/)?.[1] || '';
if (afterBundle !== devBundle) {
  throw new Error(`Capgo channel verification failed: expected ${devBundle}, found ${afterBundle || '(none)'}`);
}

console.log(`Verified ${DEV_APP_ID} / ${DEV_CHANNEL} -> ${devBundle}`);
