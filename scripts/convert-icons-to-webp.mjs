// One-shot: convert oversized PNG icons/illustrations in public/images/ to WebP
// at appropriate display sizes, then delete the PNGs. Run with
// `node scripts/convert-icons-to-webp.mjs`, then point the code at the .webp
// paths. Keeps the iOS OTA bundle small (Capgo asks for under 20 MB).
import sharp from 'sharp';
import { readdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath handles %20 decoding for the trailing-space directory path.
const IMAGES_DIR = fileURLToPath(new URL('../public/images/', import.meta.url));

// Target sizes are about 3x the largest DOM render size per asset (iPhone
// Retina density). Entries ending in "/" convert every PNG in that folder.
const TARGETS = {
  // Tasting-note illustrations render at up to 52px * 74% = ~39pt in
  // BeanDetailCard's NoteCell. 160px leaves headroom over 3x.
  'tasting-icons/': { max: 160 },
  // Demo-mode bag shots render 240pt tall in BeanCard.
  'demo/bags/san-jose-bag-t.png': { max: 960 },
  'demo/bags/el-triangulo-bag-t.png': { max: 960 },
  'demo/bags/cafen-bag-t.png': { max: 960 },
};

async function expand(target) {
  if (!target.endsWith('/')) return [target];
  const files = await readdir(path.join(IMAGES_DIR, target));
  return files.filter((f) => f.endsWith('.png')).sort().map((f) => target + f);
}

async function run() {
  let savedBytes = 0;
  let savedCount = 0;
  let failed = 0;

  for (const [target, opts] of Object.entries(TARGETS)) {
    for (const filename of await expand(target)) {
      const srcPath = path.join(IMAGES_DIR, filename);
      try {
        const before = await stat(srcPath);
        const outPath = srcPath.replace(/\.png$/, '.webp');

        await sharp(srcPath)
          .resize({ width: opts.max, height: opts.max, fit: 'inside', withoutEnlargement: true })
          // q90 keeps flat illustration edges clean (see lessons.md, sips/WebP).
          .webp({ quality: 90, alphaQuality: 100, effort: 6 })
          .toFile(outPath);

        const after = await stat(outPath);
        savedBytes += before.size - after.size;
        savedCount += 1;
        console.log(
          `${filename.padEnd(40)} ${(before.size / 1024).toFixed(0).padStart(5)}KB -> ${(after.size / 1024).toFixed(1).padStart(6)}KB WebP`
        );

        // Remove the PNG only after a successful WebP write.
        await unlink(srcPath);
      } catch (err) {
        failed += 1;
        console.error(`FAILED ${filename}:`, err.message);
      }
    }
  }

  console.log(`\nConverted ${savedCount} assets. Total saved: ${(savedBytes / 1024 / 1024).toFixed(2)}MB`);
  if (failed) process.exitCode = 1;
}

run();
