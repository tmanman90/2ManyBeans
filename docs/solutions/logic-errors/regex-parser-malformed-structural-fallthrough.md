---
title: "Regex parsers fall through to the valid half when structural input is malformed"
category: logic-errors
tags: [regex, parsing, input-validation, time-parsing]
module: handbrew
symptom: "Free-form time parser silently returned the valid half of a malformed range input (e.g. '2:30-120:00' parsed as 150s instead of rejecting)"
root_cause: "Sequential regex fallback strategy — when strict range regex failed, the plain MM:SS matcher would still find the first valid token and return it, losing the signal that the input was structurally a malformed range."
---

# Regex parsers need preflight checks for malformed structural inputs

## The problem

`parseTimeString()` in `src/lib/handbrew.js` accepts free-form GPT output like `"0:00"`, `"2:30-3:00"` (range midpoint), and `"about 3 minutes"`. The implementation tried patterns in order: strict range → plain MM:SS → descriptive minutes → descriptive seconds.

When a user (or GPT) typed `"2:30-120:00"`, the strict range regex failed (120 minutes is out of `(?<!\d)(\d{1,2}):(\d{2})(?!\d)` bounds). The parser then fell through to the plain MM:SS matcher, which happily matched `2:30` at position 0 and returned 150 seconds. The structural signal — "this was meant to be a range, but one side is malformed" — was lost.

The same issue bit us from multiple angles: `"120:00-2:30"` (left side bad), `"2:3-3:00"` (left side wrong digit count), `"1:99-3:00"` (left side seconds overflow). Each time the strict range regex failed AND the plain matcher succeeded on whichever half was valid.

## The fix

Between the strict range regex and the plain matcher, add a preflight that detects the **structural shape** of a range attempt and rejects the entire input if it looks range-like but didn't parse cleanly:

```js
if (/\d+:\d+\s*[-–—]\s*\d+:\d+/.test(s)) return null;
```

This uses loose `\d+:\d+` on both sides so it fires whenever two colon-separated digit groups flank a dash separator. If the strict range regex already matched and returned, the preflight is unreachable. If the strict regex failed and the input has this shape, the preflight catches it before the plain matcher can grab the valid half.

## The general lesson

Regex parsers with a priority-ordered fallback chain are dangerous when earlier patterns are "strict" and later patterns are "loose". A malformed input that fails the strict pattern will still match the loose pattern, and the parser will silently return a wrong-but-plausible answer.

**Rule:** any time you have a fallback chain, add a preflight between tiers that detects *structural intent*. If the input looks like it was aiming for tier N but failed, don't let tier N+1 salvage a partial match — reject.

This applies equally to any string parser with multiple strategies: date parsers, URL parsers, color parsers, CSS unit parsers, etc.

## Prevention checklist

- [ ] For each fallback regex, ask: "can an input that was *trying* to match my stricter pattern still succeed on this looser one, returning a wrong subset?"
- [ ] If yes, add a preflight that detects the structural shape of the stricter pattern's intent.
- [ ] Write test cases that specifically target malformed versions of the strict pattern. The tests for the Phase 0 `parseTimeString` fix include `"120:00-2:30"`, `"2:3-3:00"`, `"1:99-3:00"` — all must return `null`.
- [ ] Consider: should the stricter pattern have been anchored with `^...$` in the first place? Sometimes the right fix is making every tier fullmatch instead of partial-match.

## Related

- `src/lib/handbrew.js` — `parseTimeString()` and the step 5/6/6b validation logic in `repairHandBrewRecipe()`.
- First caught during the `/rip-it` Phase 0 review of feat/hand-brew-timer (2026-04-12).
- Codex rescue review caught this on the 2nd and 3rd review passes — the original test cases covered well-formed inputs but not malformed-range inputs.
