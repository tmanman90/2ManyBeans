// Vercel serverless proxy for Claude API
// Keeps ANTHROPIC_API_KEY server-side only
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { system, messages, maxTokens = 1000, model = 'claude-sonnet-4-20250514', tools } = req.body;

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

    if (tools && Array.isArray(tools)) {
      params.tools = tools;
    }

    let response = await client.messages.create(params);

    // Multi-turn handling for tool_use (web_search etc.)
    // Loop until we get end_turn or hit safety limit
    let turns = 0;
    const maxTurns = 5;
    while (response.stop_reason === 'tool_use' && turns < maxTurns) {
      turns++;
      // Build assistant message from response content
      const assistantMsg = { role: 'assistant', content: response.content };
      // Build tool results for each tool_use block
      const toolResults = [];
      for (const block of response.content) {
        if (block.type === 'tool_use') {
          // For server-side tools like web_search, the results come back
          // in the same response content array as tool_result blocks.
          // But if stop_reason is 'tool_use', we need to send back tool results.
          // For Anthropic's built-in web_search tool, the API handles the search
          // server-side and returns results inline — we just need to continue.
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: 'continue',
          });
        }
      }
      const updatedMessages = [
        ...params.messages,
        assistantMsg,
        { role: 'user', content: toolResults },
      ];
      params.messages = updatedMessages;
      response = await client.messages.create(params);
    }

    return res.status(200).json({ content: response.content, stop_reason: response.stop_reason });
  } catch (error) {
    console.error('Claude API error:', error);
    return res.status(500).json({ error: 'Failed to call Claude API' });
  }
}
