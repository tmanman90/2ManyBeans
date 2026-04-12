// One-off migration: reprocess all product shot backgrounds to match C.card (#FFF8F0).
// Hit once while authenticated, then delete this file.
import sharp from 'sharp';
import { withCorsAuth, getStorageBucket, adminGetDownloadURL, getDb } from './lib/cors-auth.js';

const TARGET_BG = { r: 255, g: 248, b: 240 };

async function normalizeProductShotBg(pngBuffer) {
  const { data, info } = await sharp(pngBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;
  const px = (x, y) => (y * width + x) * 4;

  const m = 10;
  const corners = [
    [m, m], [width - m - 1, m],
    [m, height - m - 1], [width - m - 1, height - m - 1],
  ];
  let bgR = 0, bgG = 0, bgB = 0;
  for (const [x, y] of corners) {
    const i = px(x, y);
    bgR += data[i]; bgG += data[i + 1]; bgB += data[i + 2];
  }
  bgR = Math.round(bgR / 4);
  bgG = Math.round(bgG / 4);
  bgB = Math.round(bgB / 4);

  const threshold = 40;
  for (let i = 0; i < data.length; i += 4) {
    const dr = data[i] - bgR;
    const dg = data[i + 1] - bgG;
    const db = data[i + 2] - bgB;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    if (dist < threshold) {
      const blend = Math.pow(1 - dist / threshold, 2);
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

export default withCorsAuth(async (req, res, decodedToken) => {
  const uid = decodedToken?.uid;
  if (!uid) return res.status(401).json({ error: 'Auth required' });

  const db = getDb();
  const bucket = getStorageBucket();
  const beansSnap = await db.collection('users').doc(uid).collection('beans').get();

  const results = [];
  for (const doc of beansSnap.docs) {
    const bean = doc.data();
    if (!bean.photoUrl) {
      results.push({ id: doc.id, name: bean.name, status: 'skipped (no photo)' });
      continue;
    }

    try {
      const file = bucket.file(`users/${uid}/bean-photos/${doc.id}.jpg`);
      const [exists] = await file.exists();
      if (!exists) {
        results.push({ id: doc.id, name: bean.name, status: 'skipped (file missing)' });
        continue;
      }

      const [imageBuffer] = await file.download();
      const pngBuffer = await sharp(imageBuffer).png().toBuffer();
      const normalized = await normalizeProductShotBg(pngBuffer);
      const jpegBuffer = await sharp(normalized).jpeg({ quality: 80 }).toBuffer();

      await file.save(jpegBuffer, { metadata: { contentType: 'image/jpeg' } });
      const photoUrl = await adminGetDownloadURL(file);

      await db.collection('users').doc(uid).collection('beans').doc(doc.id).update({
        photoUrl,
        updatedAt: new Date(),
      });

      results.push({ id: doc.id, name: bean.name, status: 'fixed' });
    } catch (err) {
      results.push({ id: doc.id, name: bean.name, status: `error: ${err.message}` });
    }
  }

  return res.status(200).json({ total: results.length, results });
});
