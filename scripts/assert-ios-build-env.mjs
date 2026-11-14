#!/usr/bin/env node

const requiredFirebase = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
];

const previewName = 'VITE_RUPHUS_API_BASE';
const missingFirebase = requiredFirebase.filter((name) => !process.env[name]?.trim());
const previewValue = process.env[previewName]?.trim() || '';
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
