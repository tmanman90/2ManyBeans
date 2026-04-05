# API Cost Optimization Plan

**Date:** 2026-04-04
**Status:** Validated, ready to implement

## Problem
At 10k users, projected AI API spend is ~$11,600/mo. Chat (tasting coach + general chat via Claude Sonnet 4.6) is 80%+ of that at ~$9,600/mo.

## Target
Reduce to ~$2,800-4,300/mo (63-76% reduction) with no meaningful quality loss.

## Autoresearch Validation

All optimizations tested via Karpathy autoresearch with knowledge-grounded scoring (v2). Tests validate actual coffee knowledge application (Hoffmann brewing troubleshooting, origin/variety/process connections, withhold-then-reveal coaching), not just formatting.

| Feature | Baseline | Optimized | Delta | Verdict |
|---------|----------|-----------|-------|---------|
| Tasting Coach | 96% Sonnet 4.6 | **98% Haiku 4.5 + v2 prompt** | +2% | SHIP IT |
| General Chat | 84% Sonnet 4.6 | **89% Haiku 4.5** | +5% | SHIP IT |
| Prof. Ruphus | 100% GPT-5.4 | **98% GPT-5.4 Mini** | -2% | SHIP IT |

Test scripts: `scripts/cost-optimization-autoresearch-v2.mjs`

## Changes

### 1. Anthropic Prompt Caching (~$3,800-4,300/mo savings)
Zero quality impact. Restructure system prompts from strings to arrays of content blocks with `cache_control: { type: "ephemeral" }` on static portions.

- `buildTastingSystemPrompt()`: static block (~2,800 tokens cached) + dynamic block (bean data, uncached)
- `buildChatContext()`: static block (~2,000 tokens cached) + dynamic block (rotation data, uncached)

**Files:** `src/lib/claude.js`, `api/claude.js`

### 2. All Claude Calls to Haiku 4.5 (~$1,800-2,500/mo savings)
Sonnet ($3/$15 per 1M) to Haiku ($0.80/$4 per 1M) = 73% cheaper.

Tasting coach requires "v2 stronger" prompt addition:
- Max 4 sentences per turn
- Mandatory vocabulary labeling
- Mandatory extraction markers on final turn
- Explicit brew troubleshooting rules (sour = finer, bitter = coarser)

**File:** `src/lib/claude.js`

### 3. Professor Ruphus to Mini (~$300-350/mo savings)
One-line model change. 98% quality validated.

**File:** `src/lib/professorRuphus.js`

### 4. Trim Conversation History (~$400-600/mo savings)
`history.slice(-10)` to `history.slice(-8)` in both tasting and chat.

**File:** `src/lib/claude.js`

### 5. Reduce maxTokens (~$100-200/mo savings)
- Chat: 1200 to 800
- Ruphus: 2000 to 1200

### 6. Verify OpenAI Auto-Caching (~$200-400/mo savings)
Aiden system prompt (~10,000 tokens) should be auto-cached. Verify via response usage data. No code changes.

## Summary

| # | Change | Savings/mo | Files |
|---|--------|-----------|-------|
| 1 | Prompt caching | $3,800-4,300 | `src/lib/claude.js`, `api/claude.js` |
| 2 | Claude to Haiku + v2 prompt | $1,800-2,500 | `src/lib/claude.js` |
| 3 | Ruphus to Mini | $300-350 | `src/lib/professorRuphus.js` |
| 4 | History trim | $400-600 | `src/lib/claude.js` |
| 5 | maxTokens | $100-200 | `src/lib/claude.js`, `src/lib/professorRuphus.js` |
| 6 | Verify OpenAI cache | $200-400 | (logging only) |
| **Total** | | **$6,600-8,350** | |

## Follow-up
- Audit `src/lib/coffeeKnowledge.js` against Hoffmann book-intake for knowledge gaps
- Monitor cache hit rates in production
- Consider usage logging dashboard
