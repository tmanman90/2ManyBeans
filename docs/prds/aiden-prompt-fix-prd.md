# Fix Aiden Prompt — Rules Ignored Due to Position (UPDATED)

## Context
Previous fix added good rules (grind percentile, age adjustments, Kenya overrides) but placed them at lines 230-267 — AFTER 120+ lines of reference profile data. Claude Sonnet forms its recipe while reading the references and the trailing rules barely register. Two test runs on Kenya Gichathaini AA both returned grind 3.0-3.1 (should be ~4.0), ratio 16 (should be 17+), and intervals 25-35s (should be 20-25s).

## Root Cause
**Prompt positioning.** LLMs exhibit primacy bias in system prompts — instructions early in the prompt get much stronger attention than instructions buried after a wall of data. The rules are after 150 lines of profile data so they're effectively ignored.

## Fix — Restructure `AIDEN_SYSTEM_PROMPT` in `src/lib/aiden.js`
Move all rules BEFORE the reference profiles + strengthen language + add worked example + add post-reference checklist.

### New prompt structure (5 sections)

**1. Opening paragraph** (existing, minor tweak)
- Keep current balanced-extraction language
- Add one priming sentence:
  - "CRITICAL: You MUST follow the mandatory rules below BEFORE consulting the reference profiles."

**2. Output Format** (unchanged — JSON schema)

**3. MANDATORY RULES** (moved from end to HERE — before profiles)
- **Grind Selection**: Same 7 rules but with MUST/NEVER/ALWAYS language + a **worked example** showing Kenya 3.2-4.2 → pick 4.0 or 4.1 (NOT 3.0/3.1/3.2)

  **Add (one line) to Grind Selection rules:**
  - "When converting the 60–70th percentile into an Ode Gen 2 setting, choose the **nearest valid step**; if exactly between steps, **round coarser** (clarity bias)."

  **Replace / clarify (one line) in Grind Selection:**
  - Replace: "Dense light washed coffees often require more energy (temp/bloom), not finer grind…"
  - With: "Dense light washed coffees often require more **early energy** (bloom temp + first pulse temps + bloom saturation), not finer grind. Avoid chasing extraction with grind size; use heat, bloom, and pulse structure first."

  **Add (one line) Kenya fines warning (either here or under Kenya override):**
  - "Washed Kenya (often SL28/SL34) can produce fines; avoid too-fine defaults that increase haze/tannins and reduce note separation."

  **Add (one rule) second stop-loss right after bright/thin stop-loss:**
  - "Stop-loss (dry/astringent): if a brew would taste drying/astringent, fix by **+0.1 coarser** OR lowering the **final pulse temps by 1–2°C**. Do NOT fix dryness by lengthening intervals."

- **Bean Age Adjustments**: Same tiers but with "MANDATORY" prefix, stronger language  
  *(No additional changes recommended beyond what you already have.)*

- **Pulse Interval Guidelines**: "20-25s intervals ONLY" for light washed, "NEVER default to 35s+"

- **Origin-Specific Overrides**: "bloom MUST be 2.5-3.0x" for Kenya, "2.0x or below is WRONG"  
  *(Optional tweak if you want: "2.0x or below is WRONG **unless explicitly justified**." Not required.)*

**4. Reference Profiles** (data unchanged, new header note)
- Add:
  - "The MANDATORY RULES above constrain how you use this data — you MUST apply the grind percentile rule, age adjustments, interval guidelines, and origin overrides."

**5. FINAL CHECKLIST** (new — sandwich technique)
Append two general checks (prevents “fine+slow+hot” and ratio heaviness):

1. **GRIND:** 60-70th percentile of range? (3.2-4.2 → 4.0 or 4.1, NOT 3.0-3.2)  
2. **AGE:** Past Peak = ratio +0.5 to +1.0, bloom ratio +0.5, early temps up?  
3. **INTERVALS:** Light washed = 20-25s? (35s+ is wrong)  
4. **KENYA BLOOM:** Washed Kenya = 2.5-3.0x? (2.0 or below is wrong)  
5. **RATIO sanity (clarity):** for light/washed clarity profiles, default ≥ 1:16.5 (prefer ~1:17) unless roaster explicitly recommends stronger.  
6. **DRYNESS stop-loss:** avoid “fine + slow + hot.” If grind is toward the fine end OR intervals are long, counterbalance with coarser grind / shorter intervals / cooler late pulses.

### Why this works
- Rules read FIRST → become the lens for interpreting reference profile data
- Worked example gives Sonnet a concrete reasoning template to pattern-match
- Checklist at end exploits recency bias for self-correction before output
- "WRONG" / "NEVER" / "MUST" are measurably stronger than "consider" / "often"

## File Modified
- `src/lib/aiden.js` — `AIDEN_SYSTEM_PROMPT` only (restructure, no data changes)

## Not Changing
- Reference profile data, research prompt, API proxy, validation, any other files

## Verification
1. Build + deploy  
2. Run "Brew with Aiden" on Kenya Gichathaini AA (past peak)  
3. Expect: grind SS ~4.0-4.1, ratio ~17, bloom 2.5-3.0x, intervals 20-23s  