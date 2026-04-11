// One-shot: convert oversized PNG icons/illustrations in public/images/ to WebP
// at appropriate display sizes. Run with `node scripts/convert-icons-to-webp.mjs`.
// Outputs alongside originals, then the orchestrator removes the PNGs.
import sharp from 'sharp';
import { readdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath handles %20 decoding for the trailing-space directory path.
const IMAGES_DIR = fileURLToPath(new URL('../public/images/', import.meta.url));

// Target sizes are 3x the largest DOM render size per asset, matching iPhone
// Retina display density. WebP quality 82 is visually lossless for UI icons.
const TARGETS = {
  // Nav icons render at 44x44pt in the tab bar (see App.jsx:213-224).
  'nav-rotation.png':  { max: 132 },
  'nav-inventory.png': { max: 132 },
  'nav-tasting.png':   { max: 132 },
  'nav-chat.png':      { max: 132 },
  'nav-archive.png':   { max: 132 },
  // Jar icons render at 24x24pt in RotationTab.
  'jar-full.png':  { max: 72 },
  'jar-empty.png': { max: 72 },
  // Brew method buttons -- medium-sized, probably max 80pt.
  'brew-aiden.png':    { max: 240 },
  'brew-handbrew.png': { max: 240 },
  'handbrew-icon.png': { max: 180 },
  // Empty rotation placeholder illustration, full-width at ~280pt.
  'empty-rotation.png': { max: 840 },
  // Rotation header background, full screen width at 430pt (iPhone 16 Pro Max).
  'rotation-header.png': { max: 1290 },
  // Professor Ruphus portrait. Biggest use is 60px in ShareCard at 2x scale
  // = 120px output. 240px covers future 3x.
  'professor-ruphus.png': { max: 240 },
};

async function run() {
  const files = await readdir(IMAGES_DIR);
  let savedBytes = 0;
  let savedCount = 0;

  for (const [filename, opts] of Object.entries(TARGETS)) {
    const srcPath = path.join(IMAGES_DIR, filename);
    try {
      const before = await stat(srcPath);
      const outPath = srcPath.replace(/\.png$/, '.webp');

      const meta = await sharp(srcPath).metadata();
      const fits = Math.min(meta.width || opts.max, opts.max);

      await sharp(srcPath)
        .resize({
          width: fits,
          height: fits,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: 82, effort: 6 })
        .toFile(outPath);

      const after = await stat(outPath);
      const saved = before.size - after.size;
      savedBytes += saved;
      savedCount += 1;

      console.log(
        `${filename.padEnd(22)} ${(before.size / 1024).toFixed(0).padStart(5)}KB -> ${(after.size / 1024).toFixed(1).padStart(6)}KB WebP  (-${((saved / before.size) * 100).toFixed(1)}%)`
      );

      // Remove the PNG only after successful WebP write.
      await unlink(srcPath);
    } catch (err) {
      console.error(`FAILED ${filename}:`, err.message);
    }
  }

  console.log(
    `\nConverted ${savedCount} assets. Total saved: ${(savedBytes / 1024 / 1024).toFixed(2)}MB`
  );
}

run();
