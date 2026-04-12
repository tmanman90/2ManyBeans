// Vercel serverless endpoint: product shot generation + original photo upload.
// All-in-one server-side pipeline. Client sends photo + beanId, receives photoUrl.
// Bypasses CapacitorHttp XHR interception on iOS by keeping all Storage ops server-side.
//
// Actions:
//   (default)        -- Generate AI product shot (Pro required)
//   upload-original  -- Upload user's original photo (any authenticated user)
//   delete           -- Clean up orphaned Storage file (Pro required)
import { GoogleGenerativeAI } from '@google/generative-ai';
import sharp from 'sharp';
import { withCorsAuth, getStorageBucket, adminGetDownloadURL, getDb } from './lib/cors-auth.js';
import { checkEntitlement } from './lib/checkEntitlement.js';

// Free users get 1 product shot. Keep in sync with src/lib/subscriptionConfig.js
const FREE_PRODUCT_SHOTS = 1;

let genAI;
function getClient() {
  if (!genAI) genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  return genAI;
}

const PRODUCT_SHOT_PROMPT = `You are a product photography AI. Generate a NEW studio product photo of this coffee bag.

IMPORTANT: Do NOT reproduce or collage the input photo. Instead, GENERATE a completely new image showing this coffee bag as if photographed in a professional studio.

SCENE:
- Show the full coffee bag standing upright on a seamless warm cream background (#FFF8F0)
- The bag fills 60-70% of the frame, centered with 15-20% padding on all sides
- Camera angle: straight-on with a very slight angle for depth
- Soft diffused studio lighting from upper-left
- Gentle contact shadow beneath the bag
- No props, no table, no reflections, no text overlays, no watermarks

BAG APPEARANCE:
- Recreate the bag's actual design, colors, branding, and label text as faithfully as possible
- The bag should look like a real premium coffee bag standing upright
- Clean, minimal Japandi aesthetic

OUTPUT: Square 1:1 composition, photorealistic studio product shot`;

// Post-process: replace the AI-generated background with the exact app
// card color so product shots blend seamlessly regardless of what Gemini
// produces. Detects background via corner sampling, then smoothly replaces
// pixels close to it with the target.
const TARGET_BG = { r: 255, g: 248, b: 240 }; // #FFF8F0 — matches C.card
async function normalizeProductShotBg(pngBuffer) {
  const { data, info } = await sharp(pngBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;
  const px = (x, y) => (y * width + x) * 4;

  // Sample 10px inset from each corner to detect background color
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

// Firestore doc IDs are URL-safe but we still want to forbid slashes,
// dots, and anything that could mess with Storage object paths.
const BEAN_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5MB decoded

// Normalize a user-uploaded photo: EXIF auto-orient, resize, progressive mozjpeg.
// Strips all metadata (GPS, camera info). Returns a clean JPEG buffer.
async function normalizeUserPhoto(base64Input) {
  const buffer = Buffer.from(base64Input, 'base64');

  if (buffer.length > MAX_PHOTO_BYTES) {
    const err = new Error('Photo exceeds 5MB limit');
    err.statusCode = 413;
    throw err;
  }

  // Validate via sharp metadata (rejects non-image content)
  const metadata = await sharp(buffer).metadata();
  if (!['jpeg', 'png', 'webp', 'heif'].includes(metadata.format)) {
    const err = new Error('Unsupported image format');
    err.statusCode = 400;
    throw err;
  }

  return sharp(buffer)
    .rotate()                         // EXIF auto-orient (critical for phone photos)
    .resize(1200, 1200, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({
      quality: 80,
      progressive: true,
      mozjpeg: true,
    })
    .toBuffer();
}

// Upload user's original photo. Any authenticated user (no Pro gate).
async function handleUploadOriginal(req, res, uid) {
  const { photo, beanId, skipFirestoreWrite } = req.body;

  if (!beanId) return res.status(400).json({ error: 'beanId is required' });
  if (!BEAN_ID_PATTERN.test(beanId)) {
    return res.status(400).json({ error: 'Invalid beanId format' });
  }
  if (!photo?.base64 || !photo?.mimeType) {
    return res.status(400).json({ error: 'photo with base64 and mimeType is required' });
  }
  if (!ALLOWED_MIME.includes(photo.mimeType)) {
    return res.status(400).json({ error: 'Unsupported image type' });
  }

  try {
    const jpegBuffer = await normalizeUserPhoto(photo.base64);

    const bucket = getStorageBucket();
    const file = bucket.file(`users/${uid}/bean-photos/${beanId}.jpg`);
    await file.save(jpegBuffer, { metadata: { contentType: 'image/jpeg' } });
    const photoUrl = await adminGetDownloadURL(file);

    // Always write Firestore for upload-original (unless explicitly skipped
    // for pre-save uploads where the bean doc doesn't exist yet)
    if (!skipFirestoreWrite) {
      const db = getDb();
      await db.collection('users').doc(uid).collection('beans').doc(beanId).update({
        photoUrl,
        updatedAt: new Date(),
      });
    }

    return res.status(200).json({ photoUrl });
  } catch (error) {
    console.error('Photo upload error:', error);
    const status = error.statusCode || 500;
    return res.status(status).json({ error: 'Photo upload failed' });
  }
}

// Base auth wrapper: any authenticated user. Actions that need Pro
// check entitlement inside the handler.
export default withCorsAuth(async (req, res, decodedToken) => {
  const uid = decodedToken?.uid;
  if (!uid) return res.status(401).json({ error: 'Authentication required' });

  const { action } = req.body;

  // Upload-original: any authenticated user (no Pro check)
  if (action === 'upload-original') {
    return handleUploadOriginal(req, res, uid);
  }

  // All other actions (generate, delete) are metered: Pro users get unlimited,
  // free users get FREE_PRODUCT_SHOTS before the paywall kicks in.
  const result = await checkEntitlement(uid);
  if (result.unavailable) {
    return res.status(503).json({
      error: 'entitlement_check_unavailable',
      code: 'entitlement_check_unavailable',
    });
  }

  // Free user metered gate for product shot generation (not delete)
  if (!result.pro && action !== 'delete') {
    const db = getDb();
    const userRef = db.collection('users').doc(uid);
    try {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(userRef);
        const used = snap.data()?.subscription?.freeUsage?.productShots ?? 0;
        if (used >= FREE_PRODUCT_SHOTS) {
          const err = new Error('free_tier_exhausted');
          err.code = 'free_tier_exhausted';
          err.used = used;
          throw err;
        }
        tx.set(userRef, { subscription: { freeUsage: { productShots: used + 1 } } }, { merge: true });
      });
    } catch (err) {
      if (err?.code === 'free_tier_exhausted') {
        return res.status(403).json({
          error: 'free_tier_exhausted',
          code: 'free_tier_exhausted',
          feature: 'productShots',
          used: err.used,
          limit: FREE_PRODUCT_SHOTS,
          tier: 'pro',
        });
      }
      console.error('[product-shot] Metering error:', err?.message || err);
      return res.status(500).json({ error: 'Failed to check usage quota' });
    }
  }

  const { photo, beanId, skipFirestoreWrite } = req.body;

  // Validate beanId charset/length up-front. Applies to both delete and create
  // actions since both paths use it in the Storage object path.
  if (beanId && !BEAN_ID_PATTERN.test(beanId)) {
    return res.status(400).json({ error: 'Invalid beanId format' });
  }

  // Delete action: clean up orphaned Storage file (for cancel/rescan cleanup)
  if (action === 'delete') {
    if (!beanId) return res.status(400).json({ error: 'beanId required' });
    try {
      const bucket = getStorageBucket();
      await bucket.file(`users/${uid}/bean-photos/${beanId}.jpg`).delete();
    } catch (err) { /* silent on not-found */ }
    return res.status(200).json({ ok: true });
  }

  // Reprocess: download existing product shot, normalize background, re-upload.
  // No Gemini call — just fixes the background color on existing photos.
  if (action === 'reprocess') {
    if (!beanId) return res.status(400).json({ error: 'beanId required' });
    try {
      const bucket = getStorageBucket();
      const file = bucket.file(`users/${uid}/bean-photos/${beanId}.jpg`);
      const [exists] = await file.exists();
      if (!exists) return res.status(404).json({ error: 'No photo found for this bean' });

      const [imageBuffer] = await file.download();
      const pngBuffer = await sharp(imageBuffer).png().toBuffer();
      const normalized = await normalizeProductShotBg(pngBuffer);
      const jpegBuffer = await sharp(normalized).jpeg({ quality: 80 }).toBuffer();

      await file.save(jpegBuffer, { metadata: { contentType: 'image/jpeg' } });
      const photoUrl = await adminGetDownloadURL(file);

      const db = getDb();
      await db.collection('users').doc(uid).collection('beans').doc(beanId).update({
        photoUrl,
        updatedAt: new Date(),
      });

      return res.status(200).json({ photoUrl });
    } catch (err) {
      console.error('[product-shot] Reprocess error:', err);
      return res.status(500).json({ error: 'Reprocess failed' });
    }
  }

  if (!photo?.base64 || !photo?.mimeType) {
    return res.status(400).json({ error: 'photo with base64 and mimeType is required' });
  }
  if (!beanId) {
    return res.status(400).json({ error: 'beanId is required' });
  }

  try {
    // Step 1: Generate product shot via Gemini
    const client = getClient();
    const model = client.getGenerativeModel({
      model: 'gemini-3.1-flash-image-preview',
      generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
    });

    const result2 = await model.generateContent({
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType: photo.mimeType, data: photo.base64 } },
          { text: PRODUCT_SHOT_PROMPT },
        ],
      }],
    });

    // Extract image from response
    let imageBase64;
    for (const candidate of result2.response.candidates || []) {
      for (const part of candidate.content?.parts || []) {
        if (part.inlineData) {
          imageBase64 = part.inlineData.data;
          break;
        }
      }
      if (imageBase64) break;
    }

    if (!imageBase64) {
      const blockReason = result2.response.promptFeedback?.blockReason;
      return res.status(500).json({
        error: blockReason ? `Image blocked: ${blockReason}` : 'No image generated',
      });
    }

    // Step 2: Normalize background to card color, then convert to JPEG
    const pngBuffer = Buffer.from(imageBase64, 'base64');
    const normalizedPng = await normalizeProductShotBg(pngBuffer);
    const jpegBuffer = await sharp(normalizedPng).jpeg({ quality: 80 }).toBuffer();

    // Step 3: Upload to Firebase Storage via Admin SDK
    const bucket = getStorageBucket();
    const file = bucket.file(`users/${uid}/bean-photos/${beanId}.jpg`);
    await file.save(jpegBuffer, {
      metadata: { contentType: 'image/jpeg' },
    });
    const photoUrl = await adminGetDownloadURL(file);

    // Step 4: Write photoUrl to Firestore bean doc (skip for pre-generation, bean may not exist yet)
    if (!skipFirestoreWrite) {
      const db = getDb();
      await db.collection('users').doc(uid).collection('beans').doc(beanId).update({
        photoUrl,
        updatedAt: new Date(),
      });
    }

    return res.status(200).json({ photoUrl });
  } catch (error) {
    console.error('Product shot error:', error);
    const status = error.status || error.httpStatusCode || 500;
    return res.status(status).json({ error: error.message || 'Product shot failed' });
  }
});
