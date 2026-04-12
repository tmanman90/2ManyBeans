// Vercel serverless endpoint: generate product shot + convert to JPEG + upload to Firebase Storage
// All-in-one server-side pipeline. Client sends photo + beanId, receives photoUrl.
// Bypasses CapacitorHttp XHR interception on iOS by keeping all Storage ops server-side.
import { GoogleGenerativeAI } from '@google/generative-ai';
import sharp from 'sharp';
import { withCorsAuthPro, getStorageBucket, adminGetDownloadURL, getDb } from './lib/cors-auth.js';

let genAI;
function getClient() {
  if (!genAI) genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  return genAI;
}

const PRODUCT_SHOT_PROMPT = `You are a product photography AI. Generate a NEW studio product photo of this coffee bag.

IMPORTANT: Do NOT reproduce or collage the input photo. Instead, GENERATE a completely new image showing this coffee bag as if photographed in a professional studio.

SCENE:
- Show the full coffee bag standing upright on a seamless warm neutral background (#EDE6DC)
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

// Firestore doc IDs are URL-safe but we still want to forbid slashes,
// dots, and anything that could mess with Storage object paths.
const BEAN_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

// AI product shot generation + Storage upload. Pro or Ultra required.
export default withCorsAuthPro(async (req, res, decodedToken) => {
  const uid = decodedToken?.uid;
  if (!uid) return res.status(401).json({ error: 'Authentication required' });

  const { photo, beanId, skipFirestoreWrite, action } = req.body;

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

    const result = await model.generateContent({
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
    for (const candidate of result.response.candidates || []) {
      for (const part of candidate.content?.parts || []) {
        if (part.inlineData) {
          imageBase64 = part.inlineData.data;
          break;
        }
      }
      if (imageBase64) break;
    }

    if (!imageBase64) {
      const blockReason = result.response.promptFeedback?.blockReason;
      return res.status(500).json({
        error: blockReason ? `Image blocked: ${blockReason}` : 'No image generated',
      });
    }

    // Step 2: Convert PNG to JPEG via sharp (~2MB PNG -> ~300KB JPEG)
    const pngBuffer = Buffer.from(imageBase64, 'base64');
    const jpegBuffer = await sharp(pngBuffer).jpeg({ quality: 80 }).toBuffer();

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
