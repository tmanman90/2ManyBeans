// Vercel serverless proxy for Gemini API
// Keeps GEMINI_API_KEY server-side only
import { GoogleGenerativeAI } from '@google/generative-ai';
import { withCorsAuthMetered } from './lib/cors-auth.js';

let genAI;
function getClient() {
  if (!genAI) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
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

async function handleProductShot(req, res) {
  const { photo } = req.body; // { base64, mimeType }

  if (!photo?.base64 || !photo?.mimeType) {
    return res.status(400).json({ error: 'photo with base64 and mimeType is required' });
  }

  const client = getClient();
  const model = client.getGenerativeModel({
    model: 'gemini-3.1-flash-image-preview',
    generationConfig: {
      responseModalities: ['IMAGE', 'TEXT'],
    },
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

  const response = result.response;
  const candidates = response.candidates || [];

  // Find the image part in the response
  for (const candidate of candidates) {
    for (const part of candidate.content?.parts || []) {
      if (part.inlineData) {
        return res.status(200).json({
          image: part.inlineData.data,
          mimeType: part.inlineData.mimeType,
        });
      }
    }
  }

  return res.status(500).json({ error: 'No image generated' });
}

const ALLOWED_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-preview-05-20', 'gemini-3.1-flash-image-preview'];
const MAX_TOKENS_CAP = 4000;

async function handleText(req, res) {
  const {
    model: requestedModel = 'gemini-2.5-flash',
    contents,
    systemInstruction,
    maxTokens = 1500,
    tools,
  } = req.body;

  if (!contents) {
    return res.status(400).json({ error: 'contents is required' });
  }

  const model = ALLOWED_MODELS.includes(requestedModel) ? requestedModel : 'gemini-2.5-flash';
  const safeMaxTokens = Math.min(maxTokens || 1500, MAX_TOKENS_CAP);

  const client = getClient();
  const generativeModel = client.getGenerativeModel({
    model,
    ...(systemInstruction && { systemInstruction }),
    ...(tools && { tools }),
    generationConfig: { maxOutputTokens: safeMaxTokens },
  });

  const result = await generativeModel.generateContent({ contents });
  const response = result.response;
  const text = response.text();
  const groundingMetadata = response.candidates?.[0]?.groundingMetadata || null;

  return res.status(200).json({ text, groundingMetadata });
}

// Bean scan + AI Fill + image analysis. Free users get 3 lifetime scans;
// after that, Pro or Ultra is required. See subscription-paywall-prd.md.
export default withCorsAuthMetered(async (req, res) => {
  try {
    const { action } = req.body;

    if (action === 'productShot') {
      return await handleProductShot(req, res);
    }

    return await handleText(req, res);
  } catch (error) {
    console.error('Gemini API error:', error);
    const status = error.status || error.httpStatusCode || 500;
    const detail = error.message || 'Unknown Gemini error';
    return res.status(status).json({ error: detail });
  }
}, { feature: 'aiScans', freeLimit: 3 });
