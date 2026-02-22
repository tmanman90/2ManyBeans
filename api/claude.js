// Vercel serverless proxy for Claude API
// Keeps ANTHROPIC_API_KEY server-side only
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { system, messages, maxTokens = 1000, model = 'claude-sonnet-4-20250514' } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    const params = {
      model,
      max_tokens: maxTokens,
      messages,
    };

    if (system) {
      params.system = system;
    }

    const response = await client.messages.create(params);

    return res.status(200).json({ content: response.content });
  } catch (error) {
    console.error('Claude API error:', error);
    return res.status(500).json({ error: 'Failed to call Claude API' });
  }
}
