---
title: Chat Context & Persona Polish
type: feat
status: completed
date: 2026-04-05
---

# Chat Context & Persona Polish

## Enhancement Summary

**Deepened on:** 2026-04-05
**Sections enhanced:** 4 (all proposed changes)
**Research agents used:** best-practices-researcher, security-sentinel, performance-oracle, code-simplicity-reviewer, architecture-strategist, codebase explorer, learnings-researcher

### Key Improvements
1. Added sanitization prerequisite (existing gap in `buildChatContext` must be fixed first)
2. Defined exact recipe summary format with real data shapes from codebase
3. Simplified brew guidance from 4 bullets to 1 sentence
4. Added context-aware no-markdown instruction pattern (explain rendering context to the model)

### New Considerations Discovered
- `buildChatContext()` has zero sanitization on bean fields today, this must be fixed before adding recipe data
- "No recipe yet" markers are unnecessary, omit recipe line when absent instead
- Claude 4.6 models over-respond to forceful language (NEVER, CRITICAL), soften to normal casing
- Persona bleed risk: Ruphus is a distinct GPT-5.4 Mini persona; chat Ruphus branding should be light enough to not create voice mismatch

---

## Overview

The chat feels generic: it asks about brew method and grind size even though recipes are already stored on each bean. It also renders `**bold**` as literal asterisks and has stale placeholder text. This plan adds recipe context to the system prompt, applies light Professor Ruphus branding, and fixes formatting.

## Problem Statement

1. **Placeholder text** is "What should I open next?", doesn't reflect the chat's capabilities
2. **No recipe context**: `buildChatContext()` includes rotation and inventory but not `handBrewRecipe`, `aidenGrind`, or brew method. The AI asks questions it already has answers to.
3. **Markdown in plain text**: Claude returns `**bold**` but messages render with `whiteSpace: pre-wrap`, showing raw asterisks
4. **No persona**: the chat says "You are Tal's coffee assistant" with no personality

## Proposed Solution

Four targeted changes across two files (`src/lib/claude.js` and `src/tabs/ChatTab.jsx`), plus a sanitization prerequisite.

---

### Prerequisite: Sanitize bean fields in buildChatContext

**File:** `src/lib/claude.js:188-204`

**Why:** `buildChatContext()` interpolates bean fields (roaster, name, origin, variety, process, bagNotes) directly into the system prompt with zero sanitization. Adding recipe data without fixing this compounds an existing security gap. Per `docs/solutions/security-issues/llm-prompt-sanitization-patterns.md`, sanitize at the source (inside the shared function), not at each call site.

**What to do:**
- Import or inline the `sanitize(str, maxLen)` pattern already used in `beanResearch.js`
- Apply to all string fields interpolated in the active, sealed, and finished bean mappings
- Use `maxLen = 100` for short fields (roaster, name, origin, variety, process), `maxLen = 200` for bagNotes

```javascript
// Pattern from existing codebase:
function sanitize(str, maxLen = 100) {
  return (str || '').slice(0, maxLen).replace(/[^\w\s\-'.,()\/]/g, '');
}
```

### Research Insights (Sanitization)
- System prompt injection is higher severity than user message injection per the project's own documented learnings
- Recipe fields are AI-generated (GPT-5.4) but stored in Firestore where an authenticated user could modify them directly (bean subcollection has no schema validation)
- For `aidenGrind`, validate numeric types before interpolation: `typeof bean.aidenGrind?.singleServe === 'number'`

---

### Change 1: Placeholder text
**File:** `src/tabs/ChatTab.jsx:440`

Change the non-photo placeholder from `'What should I open next?'` to `'Ask Professor Ruphus about your brew'`.

One string swap. No complexity.

---

### Change 2: Initial greeting message
**File:** `src/tabs/ChatTab.jsx:52-54`

Update the hardcoded initial assistant message to reflect light Ruphus branding:
```
"Hey, I'm Professor Ruphus! Ask me anything about your rotation, what to brew, or send photos of coffee bags and I'll scan them for you."
```

### Research Insights (Persona)
- **Persona bleed risk:** The "real" Professor Ruphus (GPT-5.4 Mini in `professorRuphus.js`) is "a friendly golden retriever who is a coffee professor" with an educational, enthusiastic voice. The chat assistant (Claude Haiku) is "concise, warm, opinionated." These are different voices. Keep the branding light enough that the mismatch is not jarring: use the name but do not try to replicate the full Ruphus personality.
- **Architectural note:** `.claude/rules/ai-models.md` says "Do not mix them." Using the Ruphus name on Claude output is a deliberate product branding choice (Tal chose "light Ruphus branding"), not an architectural violation, as long as we do not attempt to replicate the GPT-5.4 Mini persona's full voice.

---

### Change 3: Recipe context in dynamic block
**File:** `src/lib/claude.js:188-191` (active bean mapping in `buildChatContext`)

For each **active** bean, append recipe info to the existing one-liner. Omit recipe line entirely when no recipe exists (the AI handles absence naturally without explicit markers).

**Exact data shapes from codebase:**

`handBrewRecipe` (from `src/lib/handbrew.js`, stored on bean document):
```javascript
{
  method: "pour-over",           // string
  ratio: "1:16.7",              // string
  grindSize: {
    setting: "4.0",             // string (grinder-native)
    description: "Medium-fine", // string
    microns: 450                // number, optional
  },
  waterTemp: { celsius: 97 },   // number
  totalBrewTime: "3:00-3:30",   // string
  coffeeGrams: 20,              // number
  waterGrams: 333,              // number
  // Also has: steps[], tips, title - NOT needed for chat context
}
```

`aidenGrind` (from `src/lib/aiden.js`, stored on bean document):
```javascript
{
  singleServe: 4.1,  // number (Fellow Ode Gen 2 setting)
  batch: 6.2         // number (Fellow Ode Gen 2 setting)
}
```

**Format for active bean one-liner (append after existing pipe-delimited fields):**

If `handBrewRecipe` exists:
```
| Brew: pour-over, 1:16.7, 97C, grind 4.0 Medium-fine, 3:00-3:30
```

If only `aidenGrind` exists (no handBrewRecipe):
```
| Aiden grind: SS 4.1 / Batch 6.2
```

If neither exists: omit entirely (no "No recipe yet" marker needed).

**Implementation notes:**
- Whitelist specific fields from `handBrewRecipe`. Do NOT `JSON.stringify()` the full object (prevents token bloat and injection from nested fields like `steps[]` and `tips`)
- Sanitize string fields (`method`, `grindSize.setting`, `grindSize.description`, `totalBrewTime`) with `sanitize(str, 50)`
- For `aidenGrind`, validate numeric types before interpolation
- Consider reusing grinder display logic from `src/lib/brewMethods.js` (canonical fallback: `GRINDER_LABELS[preferences?.grinder] || preferences?.grinderCustomName || 'Grinder'`)
- `buildChatContext` signature may need a third parameter for `preferences` (currently `buildChatContext(beans, tastings)`)

**For sealed beans:** Skip recipe context (they haven't been brewed yet).

### Research Insights (Performance)
- Recipe one-liners add ~20-25 tokens per active bean (max 3 active = ~60-75 tokens total)
- Monthly cost increase: ~$0.03 at 20 messages/day. Negligible.
- Always include recipe context for all messages (no conditional intent detection). The 70 tokens of savings is not worth the complexity.
- No React re-render concerns: `buildChatContext` is called inside `handleSend`, not during renders
- System prompt rebuild per message is fine (microsecond string concatenation)

---

### Change 4: System prompt updates
**File:** `src/lib/claude.js:208-236` (static block of `buildChatContext`)

Three additions to the static block (cached, no per-request cost increase):

**a) Light Ruphus persona:**
Replace `"You are Tal's coffee assistant."` with:
```
You are Professor Ruphus, Tal's friendly and knowledgeable coffee guide. You're warm but concise, opinionated about good coffee, and always helpful. You have access to his REAL, CURRENT coffee data.
```
Keep all existing behavioral rules (rotation rules, scanning rules, etc.) unchanged. Do not attempt to replicate the full Ruphus story-generation voice.

**b) No-markdown instruction:**
Add to the persona section. Use the context-aware pattern (explain WHY, not just WHAT):
```
Your responses render in a mobile chat bubble as plain text. Write in conversational paragraphs. Do not use markdown formatting: no bold, italic, headers, or bullet lists. Use line breaks to separate thoughts.
```

**c) Recipe-aware brewing guidance:**
Add after the rotation rules. Keep it to one sentence (the simplicity reviewer confirmed that detailed multi-bullet rules over-steer the model):
```
When the user asks about brewing, reference their bean's stored recipe if one is listed above.
```

### Research Insights (Prompt Design)
- **Positive + context framing** outperforms negative-only instructions. "Your responses render in a mobile chat bubble as plain text" gives the model a reason to comply, making it more reliable than bare "don't use markdown."
- **Match prompt style to desired output.** If the system prompt itself uses `**bold**` or `- bullets`, Claude mirrors that. Write the system prompt in the same plain text style you want in output. Audit the existing `BREWING_KNOWLEDGE` constant for markdown formatting.
- **Soften forceful language.** Claude 4.6 models are more responsive to system prompts. Where the existing prompt uses "NEVER" and "CRITICAL RULES:", consider softening to "Do not" and "Rules:" to prevent over-compliance. Reserve caps for genuinely critical extraction markers (`---BEAN_SCAN---`).
- **Consider 1-hour cache TTL.** For a single-user app with intermittent use, `cache_control: { type: 'ephemeral', ttl: '1h' }` (new in 2025-2026) costs 2x write instead of 1.25x but survives longer between sessions.
- **Verify cache hits.** Log `response.usage.cache_read_input_tokens` in the proxy to confirm caching is working. If consistently zero, there is a silent invalidator.

---

## Technical Considerations

- **Token budget**: Recipe one-liners add ~60-75 tokens total (3 active beans). Dynamic block goes from ~500-770 to ~570-845 tokens. Monthly cost impact: ~$0.03.
- **Prompt caching**: Persona and formatting rules go in static block (cached). Recipe data goes in dynamic block (already uncached). No caching architecture changes needed. Current split is textbook correct per Anthropic docs.
- **Sanitization**: Import/inline `sanitize(str, maxLen)`. Apply to ALL bean fields in `buildChatContext()` (existing gap), plus new recipe string fields. Validate numeric types for `aidenGrind`.
- **No new dependencies**: No markdown rendering library needed. Prompt-based formatting control is simpler, cheaper, and correct for this use case.
- **Cross-model data consumption**: Recipe data generated by GPT-5.4 and consumed by Claude Haiku is fine. Once persisted in Firestore, it is application data, not model-specific output. Unidirectional flow: GPT generates, Firestore stores, Claude reads.

## Acceptance Criteria

- [ ] Input placeholder reads "Ask Professor Ruphus about your brew" (no photos attached state)
- [ ] Initial greeting message reflects light Ruphus branding
- [ ] System prompt includes recipe data for active beans that have recipes
- [ ] System prompt includes no-markdown instruction with rendering context
- [ ] System prompt includes brew guidance (one sentence, reference stored recipe)
- [ ] AI does not output `**bold**` or other markdown formatting
- [ ] AI references known recipe when asked about brewing a bean that has one
- [ ] AI still asks about method/grind when bean has no stored recipe (absence handled naturally)
- [ ] Sealed beans do NOT include recipe data in context
- [ ] All bean string fields in `buildChatContext()` pass through `sanitize(str, maxLen)` (prerequisite)
- [ ] `aidenGrind` numeric fields validated before interpolation
- [ ] No regression in photo scanning, bean save, or tasting flows

## Files to Modify

| File | Change | Lines |
|------|--------|-------|
| `src/lib/claude.js` | Add `sanitize()` to all bean field interpolations (prerequisite) | ~188-204 |
| `src/lib/claude.js` | Persona + no-markdown + brew guidance in static block | ~208-236 |
| `src/lib/claude.js` | Recipe context in active bean mapping | ~188-191 |
| `src/tabs/ChatTab.jsx` | Placeholder text | ~440 |
| `src/tabs/ChatTab.jsx` | Initial greeting | ~52-54 |

## Sources

### Internal References
- `src/lib/claude.js:187-257` -- current `buildChatContext` implementation
- `src/tabs/ChatTab.jsx:440` -- current placeholder
- `src/tabs/ChatTab.jsx:52-54` -- current initial message
- `src/lib/professorRuphus.js:31-45` -- Professor Ruphus persona reference (for tone alignment)
- `src/lib/handbrew.js:69-117` -- handBrewRecipe JSON structure
- `src/lib/aiden.js:92-116` -- Aiden recipe structure, aidenGrind extraction
- `src/lib/brewMethods.js:15-53` -- grind display formatters and grinder label fallback chain
- `src/lib/beanResearch.js` -- existing `sanitize()` pattern and `buildBeanDescription()`
- `docs/solutions/security-issues/llm-prompt-sanitization-patterns.md` -- sanitization patterns
- `docs/solutions/logic-errors/grind-size-display-toggle-unwired.md` -- grinder label single source of truth

### Best Practices Applied
- Anthropic prompt caching: static/dynamic split with `cache_control: { type: 'ephemeral' }`
- Anthropic persona design: function-first role sentence, then behavioral rules
- Formatting control: context-aware instruction ("renders in mobile chat bubble") over bare prohibition
- Token efficiency: pipe-delimited one-liners (40-60% fewer tokens than JSON or XML)
