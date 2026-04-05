# API Cost Optimization PRD

## Problem
At 10k users, projected AI API spend is ~$11,600/mo. Chat (tasting coach + general chat via Claude Sonnet 4.6) is 80%+ of that at ~$9,600/mo.

## Current Cost Breakdown

| Feature | Model | Cost/use | Frequency | Monthly @ 10k users |
|---------|-------|----------|-----------|---------------------|
| Tasting chat | Sonnet 4.6 | ~$0.06/session | 2x/week | $4,800/mo |
| General chat | Sonnet 4.6 | ~$0.04/session | 3x/week | $4,800/mo |
| Aiden recipe | GPT-5.4 Mini | $0.019/recipe | 2x/week | $1,520/mo |
| Ruphus story | GPT-5.4 | ~$0.01/bean | 1x/bean (cached) | $400/mo |
| Bean scan | Gemini 2.5 Flash | ~$0.002/scan | 1x/bean | $80/mo |
| Score extract | GPT-5.4 Mini | ~$0.001 | per tasting | $40/mo |
| **Total** | | | | **~$11,600/mo** |

## Target
Reduce to ~$2,800-4,300/mo (63-76% reduction) with no meaningful quality loss.

## Autoresearch Validation (2026-04-04)

All optimizations tested via Karpathy autoresearch method with knowledge-grounded scoring. Tests validate actual coffee knowledge application (Hoffmann brewing troubleshooting, origin/variety/process connections, withhold-then-reveal coaching), not just formatting.

| Feature | Baseline Model | Baseline Score | Optimized Model | Optimized Score | Delta |
|---------|---------------|---------------|----------------|----------------|-------|
| Tasting Coach | Sonnet 4.6 | 96% (46/48) | Haiku 4.5 + v2 prompt | **98% (47/48)** | **+2%** |
| General Chat | Sonnet 4.6 | 84% (16/19) | Haiku 4.5 | **89% (17/19)** | **+5%** |
| Prof. Ruphus | GPT-5.4 | 100% (40/40) | GPT-5.4 Mini | **98% (39/40)** | -2% |

Key finding: Haiku outperformed Sonnet on knowledge-grounded checks when given the v2 "stronger" prompt variant. Sonnet actually failed more checks (active bean recommendations, process description reversals).

Test scripts: `scripts/cost-optimization-autoresearch.mjs` (v1, structural), `scripts/cost-optimization-autoresearch-v2.mjs` (v2, knowledge-grounded with prompt tuning).

## Optimizations (ordered by impact)

### 1. Anthropic Prompt Caching (~$3,800-4,300/mo savings)
**The biggest single win. Zero quality loss.**

System prompts for tasting coach (~3,500 tokens) and general chat (~2,500 tokens) are sent as plain strings on EVERY message. With prompt caching, the static portions (TASTING_KNOWLEDGE, BREWING_KNOWLEDGE, rules, guided flow) get a 90% discount on input tokens after the first message in a conversation.

**Implementation:** Restructure `buildTastingSystemPrompt()` and `buildChatContext()` to return arrays of content blocks. Static knowledge gets `cache_control: { type: "ephemeral" }`. Dynamic data (bean profile, rotation, past tastings) stays uncached.

Split for `buildTastingSystemPrompt()`:
- **Static block** (cached, ~2,800 tokens): role definition + TASTING_KNOWLEDGE + CRITICAL RULES + WITHHOLD-THEN-REVEAL + GUIDED FLOW + EXTRACT format + v2 stronger prompt additions
- **Dynamic block** (uncached, ~200-700 tokens): bean name/list, bean profile, origin context, past tastings

Split for `buildChatContext()`:
- **Static block** (cached, ~2,000 tokens): role definition + BREWING_KNOWLEDGE + ROTATION RULES + PHOTO HANDLING
- **Dynamic block** (uncached, ~300-500 tokens): today's date, active rotation, sealed inventory, finished, tastings

**Files:** `src/lib/claude.js`, `api/claude.js`

### 2. Downgrade All Claude Calls to Haiku 4.5 (~$1,800-2,500/mo savings)
Sonnet 4.6 = $3/$15 per 1M tokens. Haiku 4.5 = $0.80/$4 per 1M tokens (73% cheaper).

**Validated by autoresearch:** Haiku matched or exceeded Sonnet on all knowledge-grounded checks.

Tasting coach requires the "v2 stronger" prompt addition to maintain quality. This adds explicit rules for:
- Brevity (max 4 sentences per turn)
- Vocabulary labeling (mandatory per turn)
- Extraction markers (mandatory on final turn)
- Brew troubleshooting direction (sour = finer, bitter = coarser)

**File:** `src/lib/claude.js` (change default model in `callClaude()`, add v2 prompt to tasting system prompt)

### 3. Professor Ruphus GPT-5.4 to Mini (~$300-350/mo savings)
Validated at 98% quality (39/40 checks). Single failure: one origin keyword miss.

**File:** `src/lib/professorRuphus.js`

### 4. Trim Conversation History (~$400-600/mo savings)
Currently sends last 10 messages per turn. Tasting flow is 6 structured steps, rarely needs more than 8 messages of context.

**File:** `src/lib/claude.js`

### 5. Reduce maxTokens (~$100-200/mo savings)
- Chat: 1200 down to 800 (most responses are 2-4 sentences)
- Ruphus: 2000 down to 1200 (prompt says 200-300 words, ~500 tokens + JSON overhead)

### 6. Verify OpenAI Auto-Caching (~$200-400/mo savings)
The Aiden system prompt (~10,000 tokens) is a const string. OpenAI should auto-cache it at 50% discount. Verify via `usage.prompt_tokens_details.cached_tokens`. No code changes needed.

## Implementation Summary

| # | Change | Est. Savings/mo | Effort | Validated |
|---|--------|----------------|--------|-----------|
| 1 | Prompt caching | $3,800-4,300 | ~30 lines refactor | N/A (infra) |
| 2 | All Claude to Haiku + v2 prompt | $1,800-2,500 | ~15 lines | 98% tasting, 89% chat |
| 3 | Ruphus to Mini | $300-350 | 1 line | 98% |
| 4 | History trim to 8 | $400-600 | 2 lines | N/A (conservative) |
| 5 | maxTokens reduction | $100-200 | 3 lines | N/A (cap only) |
| 6 | Verify OpenAI cache | $200-400 | 0 lines | Pending |
| **Total** | | **$6,600-8,350** | | |

## Files to Modify
1. `src/lib/claude.js` -- prompt caching structure, model default, v2 prompt, history trim, maxTokens
2. `api/claude.js` -- add usage to response for cache verification
3. `src/lib/professorRuphus.js` -- model downgrade

## Follow-up TODO
- Audit `src/lib/coffeeKnowledge.js` against James Hoffmann book-intake for knowledge gaps (cheaper models rely more heavily on system prompt knowledge vs training data)
- Monitor production cache hit rates via usage response data
- Consider usage logging/dashboards to track actual costs over time
