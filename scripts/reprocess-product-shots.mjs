// One-off batch: re-normalize EVERY bean's generated product-shot background
// with the v2 bilinear-field algorithm (api/_lib/productShotBg.js) so all
// cards match the trading-card paper. Runs locally with admin credentials:
//   node --env-file=/tmp/vercel-prod.env scripts/reprocess-product-shots.mjs [--dry-run]
// Downloads each users/{uid}/bean-photos/{beanId}.jpg, normalizes, uploads a
// PNG->JPEG back to the SAME path (the stored photoUrl keeps working via the
// same download token? No — tokens are path-scoped metadata; we refresh the
// doc's photoUrl with a new signed URL exactly like the route does).
import sharp from 'sharp';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { normalizeProductShotBg } from '../api/_lib/productShotBg.js';

import { readFileSync } from 'node:fs';

const DRY = process.argv.includes('--dry-run');
const SA_PATH = process.env.SA_PATH || '/tmp/sa.json';
const sa = JSON.parse(readFileSync(SA_PATH, 'utf8'));
if (!getApps().length) {
  initializeApp({
    credential: cert(sa),
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || 'manybeans-7893c.firebasestorage.app',
  });
}
const db = getFirestore();
const bucket = getStorage().bucket();

// Same mechanism the route uses for URLs: Firebase download token metadata.
async function downloadUrlFor(file) {
  const [meta] = await file.getMetadata();
  const token = meta?.metadata?.firebaseStorageDownloadTokens?.split(',')[0];
  if (!token) return null;
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(file.name)}?alt=media&token=${token}`;
}

const beans = await db.collectionGroup('beans').get();
console.log(`beans total: ${beans.size}`);
let done = 0, skipped = 0, failed = 0;

for (const doc of beans.docs) {
  const bean = doc.data();
  const uid = doc.ref.parent.parent.id;
  const path = `users/${uid}/bean-photos/${doc.id}.jpg`;
  const file = bucket.file(path);
  const label = `${bean.name || doc.id} (${doc.id.slice(0, 6)}…)`;

  try {
    const [exists] = await file.exists();
    if (!exists) { skipped += 1; continue; } // no generated shot (manual photo or none)

    if (DRY) { console.log(`DRY  would reprocess ${label}`); done += 1; continue; }

    const [buf] = await file.download();
    const normalized = await normalizeProductShotBg(buf);
    const jpeg = await sharp(normalized).jpeg({ quality: 88 }).toBuffer();
    // Preserve the existing download token so stored photoUrls keep working.
    const [meta] = await file.getMetadata();
    const token = meta?.metadata?.firebaseStorageDownloadTokens;
    await file.save(jpeg, {
      contentType: 'image/jpeg',
      metadata: { metadata: token ? { firebaseStorageDownloadTokens: token } : {} },
    });
    done += 1;
    console.log(`OK   ${label}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL ${label}: ${err.message}`);
  }
}

console.log(`\nreprocess complete: ${done} done, ${skipped} skipped (no generated shot), ${failed} failed`);
process.exit(failed ? 1 : 0);
