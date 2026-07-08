---
paths:
  - "src/lib/claude.js"
  - "src/lib/openai.js"
  - "src/lib/gemini.js"
  - "src/lib/professorRuphus.js"
  - "src/lib/aiden.js"
  - "src/lib/coffeeKnowledge.js"
---

# AI Model Architecture

Multi-model system. Each model has a specific role. Do not mix them.

## Model Assignments
- **Claude Sonnet 5** (`src/lib/claude.js`): General chat only, selected by the chat client param. Uses prompt caching (system prompt is array with cache_control on static blocks). The Claude proxy disables `thinking` only for Sonnet 5 attempts.
- **Claude Haiku 4.5** (`src/lib/claude.js`): Tasting coach, recommendations, wizard reactions, and chat fallback. Do not send the Sonnet 5 `thinking` param on Haiku attempts. Step-by-step coaching with scaffolded options for the user (novice taster). Never vague open-ended questions.
- **GPT-5.4** (`src/lib/openai.js`): Aiden brew recipes
- **GPT-5.4 Mini** (`src/lib/professorRuphus.js`): Professor Ruphus stories + tasting score extraction
- **Gemini 2.5 Flash** (`src/lib/gemini.js`): Bean photo scanning, web search enrichment (with Reddit), chat image analysis

## Chat Image Routing
Images in chat go to Gemini for vision analysis first, then the text description is passed to Claude for conversational response.

## Tasting Data Extraction
Tasting chat uses `---EXTRACT---` / `---END---` markers for structured data extraction from conversation.

## Aiden Brew Flow
Two-step GPT-5.4 process with family-first classification:
1. `researchBean()`: enriches with altitude, roast level, cup-structure family, closest reference profiles
2. `generateAidenRecipe()`: generates JSON profile using family baseline defaults + research context
Research failure falls back gracefully.

## Client Retry Pattern
All client helpers use `fetchWithRetry` (2x retries, exponential backoff). Return user-friendly error messages on failure, not raw API errors.
