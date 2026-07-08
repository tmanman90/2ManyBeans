import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(__dirname, "index.html");
const screenshotDir = path.join(__dirname, "screenshots");

const source = await fs.readFile(htmlPath, "utf8");
const banned = [
  { name: "purple family", re: /\b(purple|violet|indigo)\b/i },
  { name: "decorative orb language", re: /\b(orb|bokeh)\b/i },
  { name: "thick left-stripe card", re: /border-left\s*:\s*3px/i },
  { name: "negative tracking", re: /letter-spacing\s*:\s*-/i },
];

const sourceFailures = banned
  .filter((item) => item.re.test(source))
  .map((item) => `Banned source pattern: ${item.name}`);

await fs.mkdir(screenshotDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 2120, height: 1280 },
  deviceScaleFactor: 2,
});

await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "domcontentloaded" });
await page.evaluate(async () => {
  if (document.fonts?.ready) await document.fonts.ready;
  await Promise.all(
    [...document.images].map((img) => {
      if (img.complete) return Promise.resolve();
      return new Promise((resolve) => {
        img.addEventListener("load", resolve, { once: true });
        img.addEventListener("error", resolve, { once: true });
      });
    }),
  );
});

const browserFailures = [];

const brokenImages = await page.evaluate(() =>
  [...document.images]
    .filter((img) => !img.complete || img.naturalWidth === 0 || img.naturalHeight === 0)
    .map((img) => img.getAttribute("src")),
);
if (brokenImages.length) {
  browserFailures.push(`Broken images: ${brokenImages.join(", ")}`);
}

const overflow = await page.evaluate(() => {
  const ignoredTags = new Set(["SVG", "PATH", "POLYGON", "LINE", "TEXT", "IMG"]);
  return [...document.querySelectorAll(".screen *")]
    .map((el) => {
      if (ignoredTags.has(el.tagName)) return null;
      if (el.classList.contains("track")) return null;
      const rect = el.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return null;
      const style = getComputedStyle(el);
      const extraX = el.scrollWidth - el.clientWidth;
      const extraY = el.scrollHeight - el.clientHeight;
      const realHorizontalOverflow = extraX > 2 && style.overflowX !== "visible";
      const realVerticalOverflow = extraY > 8 && style.overflowY !== "visible";
      if (!realHorizontalOverflow && !realVerticalOverflow) return null;
      return {
        tag: el.tagName.toLowerCase(),
        cls: el.className || "",
        text: (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 80),
        extraX,
        extraY,
      };
    })
    .filter(Boolean);
});
if (overflow.length) {
  browserFailures.push(`Overflowing elements: ${JSON.stringify(overflow, null, 2)}`);
}

const smallTargets = await page.evaluate(() =>
  [...document.querySelectorAll("button, .icon-button, .chip")]
    .map((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.width >= 44 && rect.height >= 44) return null;
      return {
        cls: el.className || el.tagName.toLowerCase(),
        text: (el.textContent || "").trim().replace(/\s+/g, " "),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    })
    .filter(Boolean),
);
if (smallTargets.length) {
  browserFailures.push(`Small tap targets: ${JSON.stringify(smallTargets, null, 2)}`);
}

const largePanelRadii = await page.evaluate(() =>
  [...document.querySelectorAll(".panel, .chip")]
    .map((el) => {
      const rect = el.getBoundingClientRect();
      const radius = Number.parseFloat(getComputedStyle(el).borderTopLeftRadius);
      if (rect.width < 24 || rect.height < 24 || radius <= 8.5) return null;
      return {
        cls: el.className,
        radius,
      };
    })
    .filter(Boolean),
);
if (largePanelRadii.length) {
  browserFailures.push(`Panel/card radii exceed 8px: ${JSON.stringify(largePanelRadii, null, 2)}`);
}

const phones = await page.$$(".phone");
if (phones.length !== 5) {
  browserFailures.push(`Expected 5 frames, found ${phones.length}`);
}

const screenshotResults = [];
for (const phone of phones) {
  const id = await phone.getAttribute("data-frame");
  const filename = `${id}.png`;
  const outPath = path.join(screenshotDir, filename);
  const buffer = await phone.screenshot({ path: outPath });
  const meta = await sharp(buffer).metadata();
  const stats = await sharp(buffer).stats();
  const channelSpread = Math.max(
    ...stats.channels.map((channel) => channel.max - channel.min),
  );
  if (meta.width !== 780 || ![1688, 1690].includes(meta.height)) {
    browserFailures.push(`${filename} has unexpected size ${meta.width}x${meta.height}`);
  }
  if (channelSpread < 30) {
    browserFailures.push(`${filename} appears visually blank`);
  }
  screenshotResults.push({ file: filename, width: meta.width, height: meta.height, channelSpread });
}

await page.screenshot({ path: path.join(screenshotDir, "gallery.png"), fullPage: true });
await browser.close();

const failures = [...sourceFailures, ...browserFailures];
if (failures.length) {
  console.error("Tasting hero frame audit failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Tasting hero frame audit passed.");
for (const result of screenshotResults) {
  console.log(`- ${result.file}: ${result.width}x${result.height}, spread ${result.channelSpread}`);
}
