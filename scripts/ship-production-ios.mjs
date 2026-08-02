#!/usr/bin/env node

/**
 * Upload the web bundle to the production iOS app only.
 *
 * Production uses the package version as the Capgo bundle version. This guard
 * refuses duplicate/non-advancing versions and refuses builds without the
 * Firebase client configuration that the native app needs at startup.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const PROD_APP_ID = 'com.talmeltzer.coffeehub';
const PROD_CHANNEL = 'production';
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

const capacitorConfig = readFileSync('capacitor.config.ts', 'utf8');
if (!capacitorConfig.includes(`appId: isDevApp ? '${PROD_APP_ID}.dev' : '${PROD_APP_ID}'`)) {
  throw new Error('Production Capacitor app ID is not the expected Coffee Hub app. Refusing upload.');
}

const missingBuildEnv = REQUIRED_BUILD_ENV.filter((name) => !process.env[name]);
if (missingBuildEnv.length > 0) {
  throw new Error(
    `Missing ${missingBuildEnv.join(', ')}. Refusing production OTA upload because the bundle would not have a valid Firebase config. Pull the Vercel production environment into the shell before shipping.`,
  );
}

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const bundleVersion = String(packageJson.version || '');
const packageBase = baseVersion(bundleVersion);
if (!packageBase) throw new Error(`Invalid package version: ${bundleVersion}`);

const currentOutput = capgo(['channel', 'currentBundle', PROD_CHANNEL, PROD_APP_ID], { capture: true });
const currentBundle = currentOutput.match(/Current bundle for channel production is ([^\s]+)/)?.[1] || '';
const currentBase = baseVersion(currentBundle);
if (currentBase && compareVersions(packageBase, currentBase) <= 0) {
  throw new Error(`Production package ${bundleVersion} does not advance current Capgo bundle ${currentBundle}. Bump the patch version first.`);
}

console.log(`Production app: ${PROD_APP_ID}`);
console.log(`Production channel: ${PROD_CHANNEL}`);
console.log(`Previous bundle: ${currentBundle || '(none)'}`);
console.log(`New bundle: ${bundleVersion}`);

run('node', ['scripts/patch-social-login.mjs']);
run(npmCommand, ['run', 'build:ios']);

capgo([
  'bundle', 'upload', PROD_APP_ID,
  '--path', './dist',
  '--channel', PROD_CHANNEL,
  '--bundle', bundleVersion,
  '--fail-on-incompatible',
  '--comment', `Production iOS bundle ${bundleVersion}`,
]);

const afterOutput = capgo(['channel', 'currentBundle', PROD_CHANNEL, PROD_APP_ID], { capture: true });
const afterBundle = afterOutput.match(/Current bundle for channel production is ([^\s]+)/)?.[1] || '';
if (afterBundle !== bundleVersion) {
  throw new Error(`Capgo production verification failed: expected ${bundleVersion}, found ${afterBundle || '(none)'}`);
}

console.log(`Verified ${PROD_APP_ID} / ${PROD_CHANNEL} -> ${bundleVersion}`);
