// chat-100x harness transport: a tiny HTTP server that streams NDJSON lines
// with REAL time gaps via res.write(). Playwright's route.fulfill() can only
// deliver a complete body, so the progressive-render gate points the harness
// at this server instead (API_BASE override or route rewrite).
//
// Usage: node scripts/stream-mock-server.mjs [port]  (default 5197)
// Endpoints:
//   POST /api/claude-stream           — streams a canned reply, ~10 deltas, 120ms gaps
//   POST /api/claude-stream?recipe=1  — reply ends with a RECIPE_CARD marker payload
//   POST /api/claude-stream?search=1  — first call emits NEEDS_SEARCH, second emits answer
//   POST /api/claude-stream?error=mid — errors after 3 deltas ({type:'error'} frame)
//   POST /api/claude                  — JSON path passthrough shape (single blob)
//   POST /api/gemini                  — JSON search grounding mock
// Any other path: 404. CORS: permissive (harness only — never deployed).
import http from 'node:http';

const PORT = Number(process.argv[2]) || 5197;
const GAP_MS = 120;

const REPLY = [
  'Good morning. ', 'Jar 2 is right in its peak window, ',
  'so I would brew the Kiawamururu today. ', 'Expect that blackcurrant ',
  'acidity to be at its brightest ', 'around a 1:16 ratio. ',
  'Slurp the first sip ', 'while it is warm, not hot, ', 'and tell me ',
  'what you find.',
];

const RECIPE = `---RECIPE_CARD---{"title":"Kiawamururu Morning Pour","method":"V60","ratio":"1:16","temp":93,"grind":"finer: Ode 4.3","steps":["Bloom 40g, 35s","Pour to 150g by 1:00","Pour to 250g by 1:45","Drawdown by 2:45"],"reasoning":"Peak-window Kenyan wants bright extraction with a controlled finish."}---END_RECIPE---`;
const SEARCH_MARKER_PARTS = [
  '---NEEDS_',
  'SEARCH---{"query":"best kenyan releases 2026"}',
  '---END_SEARCH---',
];
const SEARCH_REPLY = [
  'I found one current Kenyan release worth watching. ',
  'Start with the washed Nyeri lot while it is fresh, ',
  'then compare it against a brighter Kirinyaga if you want more citrus snap.',
];

const sleep = ms => new Promise(r => setTimeout(r, ms));
let searchStreamCount = 0;

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (req.method !== 'POST') { res.writeHead(404); return res.end(); }

  if (url.pathname === '/api/claude-stream') {
    res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache, no-transform' });
    const midError = url.searchParams.get('error') === 'mid';
    const withRecipe = url.searchParams.get('recipe') === '1';
    const withSearch = url.searchParams.get('search') === '1';
    if (withSearch) searchStreamCount += 1;
    const parts = withSearch && searchStreamCount === 1
      ? SEARCH_MARKER_PARTS
      : (withSearch ? SEARCH_REPLY : (withRecipe ? [...REPLY, '\n\n', RECIPE] : REPLY));
    let i = 0;
    for (const text of parts) {
      res.write(JSON.stringify({ type: 'delta', text }) + '\n');
      i += 1;
      if (midError && i === 3) {
        res.write(JSON.stringify({ type: 'error', code: 'overloaded', message: 'Upstream overloaded mid-stream.' }) + '\n');
        return res.end();
      }
      await sleep(GAP_MS);
    }
    res.write(JSON.stringify({
      type: 'usage',
      usage: { input_tokens: 420, output_tokens: 96, cache_read_input_tokens: 380, cache_creation_input_tokens: 0 },
      stop_reason: 'end_turn',
    }) + '\n');
    return res.end();
  }

  if (url.pathname === '/api/claude') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ content: [{ type: 'text', text: REPLY.join('') }], stop_reason: 'end_turn', usage: { input_tokens: 420, output_tokens: 96 } }));
  }

  if (url.pathname === '/api/gemini') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      text: 'Kenyan release roundup: washed Nyeri lots are showing blackcurrant, citrus, and molasses this season.',
      groundingMetadata: {
        groundingChunks: [
          { web: { title: 'Kenyan Releases 2026', uri: 'https://example.com/kenya-2026' } },
          { web: { title: 'Bad Script', uri: 'javascript:alert(1)' } },
          { web: { title: 'App Link', uri: 'someapp://x' } },
        ],
      },
    }));
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, () => console.log(`stream-mock-server listening on :${PORT}`));
