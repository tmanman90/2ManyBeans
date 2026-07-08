// Product-shot background normalization — shared by the generate/reprocess
// route and the batch migration script.
//
// v2: the original algorithm averaged the four corners into ONE background
// color and only replaced pixels within distance 40 of it, with a blend that
// faded to zero across that range. Uniform AI backdrops passed; anything with
// a gradient or vignette (most warm "studio" shots Gemini likes to produce)
// kept its tint because background pixels sat outside the single-color
// window. v2 models the background as a BILINEAR FIELD of the four corner
// patch colors — so gradients and vignettes track — and uses a two-stage
// blend: full replacement up close, smooth cosine ramp to zero beyond, which
// removes the leaky partial-correction band. Contact shadows and the bag
// itself sit far from the local field estimate and are preserved.
import sharp from 'sharp';

export const TARGET_BG = { r: 251, g: 250, b: 247 }; // #FBFAF7 — trading-card paper

const PATCH = 24;      // corner patch size for the field estimate
const INSET = 8;       // inset from the literal corner (avoid borders/artifacts)
const T_FULL = 30;     // <= this distance from the local field: fully replaced
const T_ZERO = 78;     // >= this distance: untouched; cosine ramp between

function cornerAverage(data, width, px, x0, y0) {
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = y0; y < y0 + PATCH; y += 2) {
    for (let x = x0; x < x0 + PATCH; x += 2) {
      const i = px(x, y);
      r += data[i]; g += data[i + 1]; b += data[i + 2]; n += 1;
    }
  }
  return [r / n, g / n, b / n];
}

export async function normalizeProductShotBg(pngBuffer) {
  const { data, info } = await sharp(pngBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;
  const px = (x, y) => (y * width + x) * 4;

  const c00 = cornerAverage(data, width, px, INSET, INSET);
  const c10 = cornerAverage(data, width, px, width - INSET - PATCH, INSET);
  const c01 = cornerAverage(data, width, px, INSET, height - INSET - PATCH);
  const c11 = cornerAverage(data, width, px, width - INSET - PATCH, height - INSET - PATCH);

  const spanX = Math.max(1, width - 1);
  const spanY = Math.max(1, height - 1);

  for (let y = 0; y < height; y += 1) {
    const v = y / spanY;
    // Pre-interpolate the left/right edge colors for this row.
    const left = [
      c00[0] + (c01[0] - c00[0]) * v,
      c00[1] + (c01[1] - c00[1]) * v,
      c00[2] + (c01[2] - c00[2]) * v,
    ];
    const right = [
      c10[0] + (c11[0] - c10[0]) * v,
      c10[1] + (c11[1] - c10[1]) * v,
      c10[2] + (c11[2] - c10[2]) * v,
    ];
    for (let x = 0; x < width; x += 1) {
      const u = x / spanX;
      const er = left[0] + (right[0] - left[0]) * u;
      const eg = left[1] + (right[1] - left[1]) * u;
      const eb = left[2] + (right[2] - left[2]) * u;

      const i = px(x, y);
      const dr = data[i] - er;
      const dg = data[i + 1] - eg;
      const db = data[i + 2] - eb;
      const dist = Math.sqrt(dr * dr + dg * dg + db * db);
      if (dist >= T_ZERO) continue;

      const blend = dist <= T_FULL
        ? 1
        : 0.5 * (1 + Math.cos(Math.PI * (dist - T_FULL) / (T_ZERO - T_FULL)));

      data[i]     = Math.round(data[i]     + (TARGET_BG.r - data[i])     * blend);
      data[i + 1] = Math.round(data[i + 1] + (TARGET_BG.g - data[i + 1]) * blend);
      data[i + 2] = Math.round(data[i + 2] + (TARGET_BG.b - data[i + 2]) * blend);
    }
  }

  return sharp(data, { raw: { width, height, channels: 4 } })
    .removeAlpha()
    .png()
    .toBuffer();
}
