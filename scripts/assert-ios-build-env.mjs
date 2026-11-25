#!/usr/bin/env node

// Native iOS build preflight. Runs before Vite, so a wrong shell never reaches a binary.
//   node scripts/assert-ios-build-env.mjs           Dev app (build:ios:dev)
//   node scripts/assert-ios-build-env.mjs release   App Store app (cap:sync, cap:copy, ship:prod:ios)
// Prints variable names only, never values.
//
// VITE_* values are checked the way `vite build` sees them: the shell plus
// .env, .env.local, .env.production and .env.production.local, shell winning.
// A shell-only check refused a checkout whose keys live in .env.local, which is
// exactly what Vite embeds. TMB_* switches are read by vite.config.js and
// capacitor.config.ts from the shell only, so they are checked there.
// TMB_ENV_DIR points the env-file lookup elsewhere (tests use an empty folder).

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';

const envDir = process.env.TMB_ENV_DIR || resolve(dirname(fileURLToPath(import.meta.url)), '..');
const viteEnv = loadEnv('production', envDir, 'VITE_');

const requiredFirebase = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
];

const missingFirebase = requiredFirebase.filter((name) => !viteEnv[name]?.trim());

// The App Store binary's first launch runs the JS embedded at this step, so a
// build without Firebase cannot start, and a dev switch here ships to App Review.
if (process.argv[2] === 'release') {
  const problems = missingFirebase.map((name) => `${name} is missing`);
  if (viteEnv.VITE_FAKE_SCALE) problems.push('VITE_FAKE_SCALE is set (simulated scale)');
  if (process.env.TMB_APP_VARIANT === 'dev') problems.push('TMB_APP_VARIANT=dev (Dev app)');
  if (process.env.TMB_DISABLE_CAPGO_UPDATES === '1') problems.push('TMB_DISABLE_CAPGO_UPDATES=1 (updates off)');
  if (problems.length > 0) {
    console.error(`Refusing App Store iOS build before Vite: ${problems.join('; ')}.`);
    process.exit(1);
  }
  process.exit(0);
}

const previewName = 'VITE_RUPHUS_API_BASE';
const previewValue = viteEnv[previewName]?.trim() || '';
const missing = [...missingFirebase, ...(!previewValue ? [previewName] : [])];
if (missing.length > 0) {
  console.error(
    `Missing ${missing.join(', ')}. Refusing native Dev iOS build before Vite because required runtime configuration is incomplete.`,
  );
  process.exit(1);
}

let preview;
try {
  preview = new URL(previewValue);
} catch {
  console.error(`Invalid ${previewName}. Refusing native Dev iOS build before Vite; expected an HTTPS preview URL.`);
  process.exit(1);
}

if (preview.protocol !== 'https:' || !preview.hostname || preview.username || preview.password || preview.hostname === '2manybeans.vercel.app') {
  console.error(`Invalid ${previewName}. Refusing native Dev iOS build before Vite; expected an isolated HTTPS preview URL.`);
  process.exit(1);
}
