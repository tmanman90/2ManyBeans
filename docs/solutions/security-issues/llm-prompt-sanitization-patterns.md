---
title: "Phase 3: LLM prompt sanitization, shared research extraction, friendly parse errors"
category: security-issues
date: 2026-04-05
tags:
  - prompt-injection
  - sanitization
  - llm-prompts
  - gpt
  - code-extraction
  - error-handling
modules:
  - src/lib/beanResearch.js
  - src/lib/handbrew.js
  - src/lib/aiden.js
severity: P1
---

# Phase 3: LLM Prompt Sanitization and Shared Research Extraction

Building the Hand Brew Recipe Engine required extracting `researchBean()` from `aiden.js` to a shared module and adding a new GPT-5.4 prompt. Code review caught 3 real bugs in the prompt security and error handling.

## Related Documentation

- [Phase 2 Firestore write patterns](../database-issues/firestore-settings-phase2-write-patterns.md)
- [Consumer launch master plan](../../plans/2026-04-04-005-feat-consumer-launch-master-plan.md) (Phase 3 spec)

---

## Problem 1: Unsanitized bean fields in LLM prompts

**Symptom:** `buildBeanDescription()` concatenated user-controlled bean fields (name, bagNotes, brewingRec) directly into GPT prompts with no sanitization.

**Root cause:** When `buildBeanDescription()` lived in `aiden.js`, it was only called internally. After extracting to shared `beanResearch.js`, both `researchBean()` and `generateHandBrewRecipe()` used it. The new `handbrew.js` added its own `sanitize()` wrapper, but `researchBean()` still passed raw fields.

**Fix:** Move `sanitize()` into `buildBeanDescription()` itself so all callers get clean output by default:

```js
function sanitize(str, maxLen = 100) {
  return (str || '').slice(0, maxLen).replace(/[^\w\s\-'.,()\/]/g, '');
}

// Inside buildBeanDescription:
`Roaster: ${sanitize(bean.roaster)}`,
`Name: ${sanitize(bean.name)}`,
`Bag tasting notes: ${sanitize(bean.bagNotes, 200)}`,
```

**Rule:** When extracting a function to a shared module, sanitize at the source (inside the shared function), not at each call site. Call-site sanitization is fragile because new callers won't know to add it.

---

## Problem 2: Custom grinder name unsanitized in system prompt

**Symptom:** When grinder preference is "other", `preferences.grinderCustomName` went directly into the GPT system prompt with no sanitization.

**Fix:** `sanitize(preferences?.grinderCustomName, 60)` before interpolation.

**Rule:** Any user-controlled string that enters a system prompt (not just user messages) must be sanitized. System prompt injection is higher impact than user message injection.

---

## Problem 3: Raw JSON.parse SyntaxError shown to user

**Symptom:** If GPT returned malformed JSON, the user saw "Unexpected token..." instead of a friendly message.

**Fix:** Wrap in try/catch in both `beanResearch.js` and `handbrew.js`:

```js
try {
  return JSON.parse(clean);
} catch {
  throw new Error('Recipe generation returned invalid data. Please try again.');
}
```

**Rule:** Every `JSON.parse` on LLM output must be wrapped. LLMs produce malformed JSON regularly. The plan's acceptance criteria explicitly required "friendly messages on generation failure."

---

## Code Extraction Pattern: researchBean

When extracting `researchBean()` from `aiden.js` to shared `beanResearch.js`, the following pieces moved together as a unit:
- `researchBean()` (the async function)
- `buildBeanDescription()` (bean-to-text formatter, used by both research and recipe generation)
- `RESEARCH_SYSTEM_PROMPT` (the GPT system prompt)
- `REFERENCE_PROFILE_INDEX` (interpolated into the system prompt)

`aiden.js` then imports `buildBeanDescription` from `beanResearch.js` for its own `generateAidenRecipe()` function.

**Rule:** When extracting shared code, identify the full dependency graph. Extract the complete unit, not just the top-level function. If the helper (`buildBeanDescription`) is needed by both the old and new consumer, it belongs in the shared module.

---

## Prevention Checklist

| # | Check | Signal |
|---|-------|--------|
| 1 | User-controlled string interpolated into any LLM prompt | Needs sanitize() |
| 2 | `JSON.parse` on LLM output without try/catch | Needs friendly error wrapping |
| 3 | Shared function extracted without sanitization at source | All callers inherit the vulnerability |
| 4 | `preferences.*CustomName` fields in prompts | User-controlled, must sanitize |
