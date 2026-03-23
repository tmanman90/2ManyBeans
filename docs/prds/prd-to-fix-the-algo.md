# PRD: Make Aiden Brew Suggestions Match Clarity-First Logic (Prompt Delivery + Deterministic Enforcement)

## Summary
The app currently generates Fellow Aiden brew profiles via an LLM (Claude Sonnet) but still produces systematically over-extractive recommendations (too fine, too strong, Kenya bloom too low), even after prompt improvements. This PRD adds two reliability layers:

1) **Prompt Delivery Fix**: Ensure the system prompt is actually applied across backends by sending it both as `system` (Anthropic-style) and as a `role:"system"` message (OpenAI-style / proxy-compatible).
2) **Deterministic Enforcement Layer**: Add a post-LLM validator/repair pass that clamps outputs to “clarity-first” constraints and deterministically selects grind from the closest reference range (upper-middle).

This guarantees output consistency even when the model drifts.

---

## Background / Current Behavior
Despite strong “mandatory rules” and a final checklist in the system prompt, the UI still shows profiles like:
- **Ratio 1:16** (too strong for clarity-first washed Kenya)
- **Bloom 2.0x** on washed Kenya (disallowed per your own rules)
- **Ode Gen 2 single ~3.0–3.2** (too fine vs expected ~4.0–4.2 for Kenya Kieni-like range)

### Current code behavior (why it fails)
In `aiden.js`:
- `researchBean()` posts `{ system: RESEARCH_SYSTEM_PROMPT, messages: [{ role:'user', ... }] }`:contentReference[oaicite:3]{index=3}
- `generateAidenRecipe()` posts `{ system: AIDEN_SYSTEM_PROMPT, messages: [{ role:'user', ... }] }` and returns `JSON.parse(clean)` with no validation:contentReference[oaicite:4]{index=4}
- The prompt contains a robust **FINAL CHECKLIST**, but output still violates it, indicating prompt rules are not reliably enforced.:contentReference[oaicite:5]{index=5}

**Hypothesis A (high likelihood):** Your `/api/claude` proxy ignores the top-level `system` field unless it is also included as a system role message.  
**Hypothesis B (also true):** Even with correct prompt delivery, LLMs will occasionally output invalid or misaligned values; you need a hard enforcement layer.

---

## Goals
### Primary goals
1) **Clarity-first alignment**: For light/washed clarity profiles, default ratios should not be “heavy” (e.g., washed Kenya should land around **1:16.5–1:17.5**, typically ~**1:17**).
2) **Kenya guardrails** (washed Kenya):
   - Bloom ratio must be **2.5–3.0x**
   - Bloom duration in the “Kenya clarity band” **40–55s** (unless explicit justification)
   - SS pulse intervals must be **20–25s** (avoid 35s+)
3) **Deterministic grind selection**:
   - Choose **upper-middle (60–70th percentile)** of the closest reference grind range.
   - Example: reference SS range **3.2–4.2** → output should land at **4.0 or 4.1**, not 3.0–3.2.
4) **Never ship rule-breaking output**: If the LLM returns invalid settings, the app must repair them before pushing/saving.

### Success metrics
- For Kenya Gichathaini AA (washed Kenya, “pomelo/hibiscus” profile) the output consistently meets:
  - SS grind **4.0–4.2**
  - Ratio **≥ 16.5** and Kenya default **~17**
  - Bloom ratio **≥ 2.5**
  - SS intervals **20–25s**

---

## Non-Goals
- Changing Fellow’s API schema or the push flow (except ensuring payload is valid).
- Rebuilding the entire prompt/reference library (prompt improvements are allowed but not required for this fix).
- Changing UI.

---

## Proposed Solution

### Part 1: Prompt Delivery Fix (Compatibility)
**Problem:** Some proxies/backends ignore top-level `system`.  
**Fix:** Send the system prompt in **both** locations:

- Top-level `system` (Anthropic style)
- First `messages` element: `{ role: "system", content: AIDEN_SYSTEM_PROMPT }`

Apply this to both `researchBean()` and `generateAidenRecipe()`.

#### Implementation detail
In `researchBean()` request body, change from:
```js
{
  system: RESEARCH_SYSTEM_PROMPT,
  messages: [{ role: 'user', content: ... }],
}
to:
{
  system: RESEARCH_SYSTEM_PROMPT,
  messages: [
    { role: 'system', content: RESEARCH_SYSTEM_PROMPT },
    { role: 'user', content: ... }
  ],
}
In generateAidenRecipe() request body, change from:
{
  system: AIDEN_SYSTEM_PROMPT,
  messages: [{ role: 'user', content: userContent }],
}
to:
{
  system: AIDEN_SYSTEM_PROMPT,
  messages: [
    { role: 'system', content: AIDEN_SYSTEM_PROMPT },
    { role: 'user', content: userContent }
  ],
}
Part 2: Deterministic Enforcement Layer (Validator + Repair)

Problem: Even with a perfect prompt, LLM output can drift, violate constraints, or choose the wrong end of a range.
Fix: After parsing the JSON, run repairRecipe(bean, parsed, research).

This repair layer must:

Deterministically choose grind from closest reference profile range:

Use research.closestReferenceProfiles[0].name if present (preferred).

Otherwise fallback to heuristic match (origin/process).

Select SS grind at 65th percentile of range and map to nearest valid Ode step (tie-break coarser).

Select batch grind similarly, and enforce batch > single.

Clamp and enforce clarity rules:

Ratio must be within [14, 20] in 0.5 steps.

For washed coffees, ratio must be ≥ 16.5; for washed Kenya default to ≥ 17.

Bloom ratio must be [1, 3] in 0.5 steps.

For washed Kenya: bloom ratio ≥ 2.5, bloom duration 40–55s, SS intervals 20–25s.

Validate pulse counts/intervals/temps:

Pulse number 1–10

Interval 5–60s

Temperatures 50–99°C

Ensure SS temps list length matches pulse count; fill missing with bloom temp.

Guarantee schema stability: The repair layer must always return an object that conforms to Fellow profile constraints and internal expectations.

Why deterministic grind selection matters

Your reference library already encodes good ranges (e.g., Kenya Kieni AB SS grind 3.2–4.2 in Ode Gen 2). The drift happens because the LLM “decides” to go finer. This PRD makes grind selection not a suggestion but a deterministic mapping.

Detailed Requirements
R1: Prompt delivery

 Both research and recipe calls include messages[0] as system content.

 Keep existing system top-level to remain compatible with Anthropic.

R2: Grind determinism

 Build a list of valid Ode Gen 2 steps (1, 1.1, 1.2 … 11).

 Compute target at 65th percentile of range.

 Map to nearest valid step; if tie, choose coarser (higher number).

 Batch grind must be strictly coarser than single.

R3: Kenya washed enforcement

When bean.origin contains “Kenya” (case-insensitive) AND bean.process contains “washed”:

 bloomRatio >= 2.5 (0.5 steps)

 bloomDuration in [40, 55]

 ssPulsesInterval in [20, 25]

 Ratio default >= 17 (unless a stronger ratio is explicitly required by a separate rule)

R4: Clarity ratio sanity

 For washed coffees: ratio cannot be below 16.5

 For Kenya washed: ratio cannot be below 17

R5: Always repair before returning

 Replace return JSON.parse(clean) with:

const parsed = JSON.parse(clean); return repairRecipe(bean, parsed, research);

Implementation Plan (Single File: aiden.js)
Step 1 — Prompt delivery patch

Modify both researchBean() and generateAidenRecipe() to include the system role message.

Step 2 — Add repair layer

Add functions:

nearestOdeStep(), pickUpperMiddleFromRange()

Reference match: chooseReferenceForBean(bean, research)

Enforcement: enforceDeterministicGrind(), enforceClarityRules(), repairRecipe()

Step 3 — Integrate repair

Call repairRecipe() immediately after parsing LLM JSON in generateAidenRecipe().

Testing Plan
Unit tests

Create tests for repairRecipe():

Washed Kenya + reference range 3.2–4.2 → SS grind becomes 4.0/4.1, bloom >= 2.5, interval 20–25, ratio >= 17.

LLM returns invalid values (ratio 13, bloomRatio 4, temp 120) → repaired values clamped into allowed ranges.

Batch grind accidentally <= single → repaired to be > single.

Integration tests

Run “Brew with Aiden” on Kenya Gichathaini AA and confirm:

SS grind ≈ 4.0–4.2

Ratio ≈ 17

Bloom 2.5–3.0x

SS interval 20–25s

Regression tests

Ensure pushToAiden() continues stripping grindRecommendation (if present) and does not break schema submission.

Risks / Considerations

Parsing reference profiles from prompt text may be brittle

Recommended improvement (optional): store reference profiles as structured JSON to avoid regex parsing.

Over-enforcement

Kenya rules should apply only when both origin + washed match to avoid accidental overrides.

Rollout

Ship behind a feature flag (optional).

Log “before repair” vs “after repair” for the first week to confirm stability.

Once verified, remove flag.

Acceptance Criteria

 Kenya washed outputs never show bloom ratio below 2.5.

 Kenya washed outputs never show SS grind at/under 3.2 when ref range is 3.2–4.2; must land at ~4.0/4.1.

 Light washed outputs default to ratio >= 16.5 (Kenya >= 17).

 No invalid schema values reach pushToAiden().

Appendix A — Paste-ready Code Patch (Conceptual)
A1: Prompt delivery (researchBean + generateAidenRecipe)

Add role:"system" message alongside top-level system.

A2: Repair layer and integration

Add repair functions and replace:

return JSON.parse(clean);
with:

const parsed = JSON.parse(clean); return repairRecipe(bean, parsed, research);

### How to “download”
Copy everything in the code block into a file named `PRD.md` and send it to Claude.

If you want, I can also output a **unified diff** against your current `aiden.js` (so you can apply the patch mechanically).
::contentReference[oaicite:7]{index=7}