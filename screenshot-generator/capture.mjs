// Capture script for App Store screenshots.
//
// 1. Launches headless Chromium via playwright (the one bundled in the
//    parent project's devDeps — we reuse it instead of installing playwright
//    in this subfolder).
// 2. For each slide, navigates to http://localhost:3000/slide/<id>
// 3. Screenshots at 1320x2868
// 4. Resizes to the other 3 Apple sizes using sharp
// 5. Writes all 16 PNGs to ../docs/launch/screenshots/

import { chromium } from "../node_modules/playwright/index.mjs";
import sharp from "../node_modules/sharp/lib/index.js";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "docs", "launch", "screenshots");

const SLIDES = [
  "01-hero-rotation",
  "02-scan-inventory",
  "03-tasting-coach",
  "04-chat-professor",
  "05-brew-timer",
];

const SIZES = [
  { label: "6_9", w: 1320, h: 2868 },
  { label: "6_5", w: 1284, h: 2778 },
  { label: "6_3", w: 1206, h: 2622 },
  { label: "6_1", w: 1125, h: 2436 },
];

const BASE_W = 1320;
const BASE_H = 2868;

const PORT = process.env.PORT || 3000;

async function main() {
  await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: BASE_W, height: BASE_H },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  for (const slide of SLIDES) {
    const url = `http://localhost:${PORT}/slide/${slide}`;
    console.log(`[capture] ${slide} -> ${url}`);
    await page.goto(url, { waitUntil: "networkidle" });
    // Extra settle for web fonts + images
    await page.waitForTimeout(1500);

    const baseBuffer = await page.screenshot({
      type: "png",
      clip: { x: 0, y: 0, width: BASE_W, height: BASE_H },
    });

    for (const size of SIZES) {
      const outPath = join(OUT, `${slide}-${size.label}.png`);
      if (size.w === BASE_W && size.h === BASE_H) {
        await writeFile(outPath, baseBuffer);
      } else {
        const resized = await sharp(baseBuffer)
          .resize(size.w, size.h, { fit: "fill" })
          .png({ compressionLevel: 9 })
          .toBuffer();
        await writeFile(outPath, resized);
      }
      console.log(`  -> ${outPath}`);
    }
  }

  await browser.close();
  console.log(`\n[capture] Done. ${SLIDES.length * SIZES.length} files written to ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
