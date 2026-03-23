# Multi-Model AI Architecture PRD

## Overview
Migrate Coffee Hub from single-model (Claude Sonnet 4) to a best-of-breed multi-model architecture. Each AI feature routes to the model best suited for that task, optimizing quality and cost.

## Current State
- All AI features use `claude-sonnet-4-20250514` via `/api/claude.js` proxy
- Fallback to `claude-haiku-4-5-20251001` on 429/529 errors
- Single Anthropic API key (server-side via Vercel env)
- Web search via Claude's `web_search_20250305` tool

## Target Architecture

### Model Assignments

| Feature | Current Model | New Model | Proxy Endpoint | Why |
|---|---|---|---|---|
| Bean photo scanning | Claude Sonnet 4 | **Gemini 2.5 Flash** | `/api/gemini` (new) | Best OCR benchmarks, 10x cheaper, `media_resolution` control |
| Web search enrichment | Claude web_search | **Gemini search grounding** | `/api/gemini` | Google Search index (best for niche roaster sites), no token charge on results, free tier |
| Reddit enrichment | N/A (new) | **Gemini search grounding** | `/api/gemini` | Google has exclusive Reddit indexing deal, surfaces r/coffee r/specialtycoffee r/pourover |
| Professor Ruphus stories | Claude Sonnet 4 | **GPT-5.4** | `/api/openai` (new) | Best creative/character writing, "shows not tells", personality presets |
| Tasting coach | Claude Sonnet 4 | **Claude Sonnet 4.6** | `/api/claude` (update model ID) | Precise structured instruction following, already working |
| Score extraction (JSON) | Claude Sonnet 4 | **GPT-5.4 Mini** | `/api/openai` | Native structured output guarantees, cheap ($0.75/$4.50) |
| Aiden brew recipes | Claude Sonnet 4 | **TBD (A/B test)** | `/api/claude` or `/api/openai` | Testing Sonnet 4.6, Opus 4.6, GPT-5.4 Mini, GPT-5.4 Thinking |
| General chat | Claude Sonnet 4 | **Claude Sonnet 4.6** | `/api/claude` (update model ID) | Proven quality for coffee discussions |
| Chat image analysis | Claude Sonnet 4 | **Route to Gemini** | `/api/gemini` | Detect image in chat, scan via Gemini, feed extracted text back to Sonnet for discussion |

### Estimated Monthly Cost
Current (all Sonnet): ~$31.50/month
Target (multi-model): ~$12-18/month (depending on Aiden test winner)

## New API Proxy Endpoints

### `/api/gemini.js` (new)
- Google AI SDK (`@google/genai`)
- Handles: photo scanning, web search enrichment, Reddit search, chat image analysis
- Env var: `GEMINI_API_KEY`
- Model: `gemini-2.5-flash`
- Features to use:
  - `media_resolution: "high"` for photo scanning
  - `google_search` tool for web/Reddit enrichment
  - Structured output via `responseSchema` for scan extraction

### `/api/openai.js` (new)
- OpenAI SDK (`openai`)
- Handles: Professor Ruphus stories, score extraction, possibly Aiden recipes
- Env var: `OPENAI_API_KEY`
- Models: `gpt-5.4` (Ruphus), `gpt-5.4-mini` (scores)
- Features to use:
  - Structured Outputs API for JSON responses
  - Personality presets for Ruphus character

### `/api/claude.js` (update)
- Update default model to `claude-sonnet-4-6-20250514`
- Keep Haiku 4.5 fallback
- Handles: tasting coach, Aiden recipes, general chat

## Client-Side Routing

### `src/lib/claude.js` (update)
Add model routing helper:
```js
// Route to correct proxy based on feature
export async function callAI({ feature, ...params }) {
  const routes = {
    scan: '/api/gemini',
    webSearch: '/api/gemini',
    ruphus: '/api/openai',
    scores: '/api/openai',
    tasting: '/api/claude',
    aiden: '/api/claude',  // or /api/openai after A/B test
    chat: '/api/claude',
  };
  const endpoint = routes[feature] || '/api/claude';
  // ... fetch logic
}
```

### Image-in-Chat Flow
1. User sends image in chat tab
2. Client detects image content
3. Routes image to `/api/gemini` for vision extraction
4. Receives extracted text (roaster, name, origin, etc.)
5. Feeds extracted text + user message to `/api/claude` (Sonnet) for conversational response
6. Two API calls, transparent to user

## Bean Photo Scanning Flow (Updated)

### Current Flow
1. User takes 1-3 photos
2. Photos sent to Claude Sonnet with vision prompt
3. Claude extracts bean data as JSON
4. Claude web_search enriches with roaster/bean info
5. User reviews extracted data

### New Flow
1. User takes 1-3 photos
2. Photos sent to **Gemini 2.5 Flash** with `media_resolution: "high"`
3. Gemini extracts bean data as structured JSON (via `responseSchema`)
4. **Gemini search grounding** enriches with roaster/bean info from Google Search
5. **Second Gemini call** with search grounding scoped to Reddit: `"{roaster} {bean name} review tasting notes"` to pull community reviews from r/coffee, r/specialtycoffee, r/pourover
6. Reddit findings merged into bean data (optional fields: `redditNotes`, `communityRating`)
7. User reviews extracted data

## Professor Ruphus Flow (Updated)

### Current Flow
1. Bean data sent to Claude Sonnet with Ruphus system prompt
2. Optional web search for roaster info
3. Returns story JSON

### New Flow
1. Bean data sent to **GPT-5.4** with Ruphus system prompt
2. Use GPT-5.4's personality presets (Nerdy + Friendly) for character consistency
3. Web search: route to **Gemini search grounding** if needed (better results, cheaper)
4. Returns story JSON via Structured Outputs API

## Score Extraction Flow (Updated)

### Current Flow
1. Tasting notes sent to Claude Sonnet
2. Returns numeric scores JSON

### New Flow
1. Tasting notes sent to **GPT-5.4 Mini** via Structured Outputs API
2. JSON Schema enforced at API level (guaranteed valid)
3. Returns numeric scores

## Aiden Recipe Flow (Pending A/B Test)

### Test Plan
Test beans:
1. **El Placer** by Dayglow (Colombia, washed, light)
2. **Finca La Fuenta** by Koppi (details TBD)
3. **Mullish AG** (Ethiopia, details TBD)

Models to test:
1. Claude Sonnet 4.6
2. Claude Opus 4.6
3. GPT-5.4 Mini (with Structured Outputs)
4. GPT-5.4 Thinking

Evaluation criteria:
- Valid JSON output (pass/fail)
- Constraint adherence (temps in range, array lengths match, valid Ode steps)
- Recipe quality (does profile make sense for the bean's characteristics)
- Cost per call

Test will run locally via script before any app changes.

## New Environment Variables (Vercel)
```
GEMINI_API_KEY=...
OPENAI_API_KEY=...
```
Existing `ANTHROPIC_API_KEY` unchanged.

## Implementation Order
1. **Phase 0: A/B test Aiden recipes** (local script, no app changes)
2. **Phase 1: Add Gemini proxy** (`/api/gemini.js`) + migrate photo scanning
3. **Phase 2: Add OpenAI proxy** (`/api/openai.js`) + migrate Professor Ruphus + score extraction
4. **Phase 3: Add Reddit enrichment** to scan flow via Gemini search grounding
5. **Phase 4: Add chat image routing** (detect image in chat, route to Gemini, feed back to Sonnet)
6. **Phase 5: Update Aiden** to winning model from A/B test
7. **Phase 6: Update Claude model ID** to Sonnet 4.6

## Rollback Strategy
- Keep `/api/claude.js` fully functional as fallback for all features
- Client-side feature flag to route any feature back to Claude
- Each proxy endpoint is independent, can be deployed/reverted individually
