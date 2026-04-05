---
paths:
  - "api/**/*.js"
---

# API Proxy Conventions

Four Vercel serverless proxies. Each follows the same pattern:

## Error Handling
- Forward the REAL error status and message from the upstream API. Never return a generic 500.
- Every proxy has `maxRetries: 2` server-side via the SDK.

## Model Fallback Chains
- `/api/claude`: Haiku 4.5 primary (with prompt caching), Haiku 4.5 fallback on 429/529. Response includes `usage` for cache monitoring.
- `/api/openai`: GPT-5.4 primary, GPT-5.4 Mini fallback
- `/api/gemini`: Gemini 2.5 Flash (no fallback)
- `/api/aiden`: GPT-5.4 (Fellow Aiden brew profiles, no fallback)

## Proxy-Specific Options
- OpenAI proxy supports `responseFormat` param for structured JSON output
- Gemini proxy supports `tools: [{ googleSearchRetrieval: {} }]` for search grounding
- Aiden proxy is two-step: researchBean() then generateAidenRecipe()

## Client-Side Retry
All client helpers (`src/lib/claude.js`, `src/lib/openai.js`, etc.) retry 2x with exponential backoff and return user-friendly error messages on failure.
