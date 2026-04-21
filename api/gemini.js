// Vercel serverless proxy for Gemini API
// Keeps GEMINI_API_KEY server-side only
import { GoogleGenerativeAI } from '@google/generative-ai';
import { withCorsAuthMetered } from './_lib/cors-auth.js';
import { logApiUsage } from './_lib/costLogger.js';

let genAI;
function getClient() {
  if (!genAI) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return genAI;
}

// NOTE: legacy handleProductShot helper removed. Product shot generation
// now goes exclusively through /api/product-shot (Pro-gated). Keeping it
// here was a privilege-escalation surface — a free user could POST
// { action: 'productShot' } and bypass the Pro gate while burning a scan
// credit. See todos/008-pending-p1-legacy-productShot-in-gemini-proxy.md.

const ALLOWED_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-preview-05-20', 'gemini-3.1-flash-image-preview'];
const MAX_TOKENS_CAP = 4000;

async function handleText(req, res, feature, decodedToken) {
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

  logApiUsage({ uid: decodedToken?.uid, provider: 'gemini', model, feature, endpoint: '/api/gemini', usage: response.usageMetadata });
  return res.status(200).json({ text, groundingMetadata });
}

// Gemini text/vision endpoint. Used for bean scan, AI Fill (research),
// chat image analysis, and other Gemini calls. Metering is OPT-IN per
// request via `body.metered = true`. Only the bean-scan call site sets
// the flag, so research and image-analysis don't burn scan credits.
// Pro+ users bypass the meter entirely.
export default withCorsAuthMetered(async (req, res, decodedToken) => {
  try {
    return await handleText(req, res, req.body.feature, decodedToken);
  } catch (error) {
    console.error('Gemini API error:', error);
    const status = error.status || error.httpStatusCode || 500;
    const detail = error.message || 'Unknown Gemini error';
    return res.status(status).json({ error: detail });
  }
}, { feature: 'aiScans', freeLimit: 3 });
