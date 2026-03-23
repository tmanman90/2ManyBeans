// Vercel serverless proxy for Gemini API
// Keeps GEMINI_API_KEY server-side only
import { GoogleGenerativeAI } from '@google/generative-ai';

let genAI;
function getClient() {
  if (!genAI) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return genAI;
}

const ALLOWED_ORIGINS = [
  'https://2manybeans.vercel.app',
  'capacitor://localhost',
  'http://localhost',
];

function setCorsHeaders(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.some(o => origin?.startsWith(o))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      model = 'gemini-2.5-flash-preview-05-20',
      contents,
      systemInstruction,
      maxTokens = 1500,
      tools,
    } = req.body;

    if (!contents) {
      return res.status(400).json({ error: 'contents is required' });
    }

    const client = getClient();
    const generativeModel = client.getGenerativeModel({
      model,
      ...(systemInstruction && { systemInstruction }),
      ...(tools && { tools }),
      generationConfig: { maxOutputTokens: maxTokens },
    });

    const result = await generativeModel.generateContent({ contents });
    const response = result.response;
    const text = response.text();
    const groundingMetadata = response.candidates?.[0]?.groundingMetadata || null;

    return res.status(200).json({ text, groundingMetadata });
  } catch (error) {
    console.error('Gemini API error:', error);
    const status = error.status || error.httpStatusCode || 500;
    const detail = error.message || 'Unknown Gemini error';
    return res.status(status).json({ error: detail });
  }
}
