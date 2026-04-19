---
title: Fix Tasting Chat Step Spine Drift (Model-Driven Step Markers)
type: fix
status: active
date: 2026-04-18
---

# Fix Tasting Chat Step Spine Drift (Model-Driven Step Markers)

## Overview

The tasting-chat step spine currently advances on every user message. Clarifying questions, narrow-down replies, and follow-ups all push the spine forward even though Professor Ruphus is still on the same step. Real screenshots from the dev build show "STEP 2 · FIRST SIP" appearing while Ruphus is still asking smell follow-ups, and "STEP 3 · ACIDITY" while he is still narrowing flavor notes.

Fix: let Ruphus drive the spine explicitly by emitting a `{{step:KEY}}` marker on its own line at the top of any message where he is transitioning steps, mirroring the existing `{{term:KEY}}` pattern. The UI derives `currentStep` and per-card step labels from these markers, with a graceful fallback to the current count-based logic when no markers are present (legacy sessions, model under-compliance).

## Problem Statement

**Root cause:** `src/tabs/TastingTab.jsx:761-764`

```js
const userMsgCount = chatMessages.filter(m => m.role === 'user').length;
const currentStep = chatExtracted
  ? TASTING_STEPS.length
  : Math.min(userMsgCount, TASTING_STEPS.length - 1);
```

`userMsgCount` is a bad proxy. Every user reply ticks the spine, regardless of whether the exchange is a real step transition or a clarification within the current step. The per-card step label at `TastingTab.jsx:947-949` has the same flaw (it uses the Ruphus-message index `rIdx` as the step index).

**Symptom evidence:**
- Screenshot 10:06 AM: Ruphus is still narrowing flavor notes ("narrow that down a bit more when you smell it"); header shows "STEP 2 · FIRST SIP".
- Screenshot 10:07 AM: Ruphus is still revealing and asking about acidity in a single turn; header shows "STEP 3 · ACIDITY" but the scorecard peek shows aroma+sweetness were only just captured — meaning the flow is compressing two real steps into one UI tick.

## Proposed Solution

**Source of truth:** Ruphus decides when the step has transitioned, because only he knows what he is asking about this turn.

**Mechanism:** The model emits a marker of the form `{{step:KEY}}` on its own line at the top of any message that begins a new step. The UI parses the marker off the incoming assistant message, stores it alongside the cleaned message content, and uses it to drive the spine.

**Keys (match UI spine exactly):**

| Key          | UI step label |
|--------------|---------------|
| `smell`      | Smell         |
| `first-sip`  | First Sip     |
| `acidity`    | Acidity       |
| `sweetness`  | Sweetness     |
| `body`       | Body          |
| `finish`     | Finish        |

**Monotonic walk:** The spine tracks the *highest* step index any emitted marker has pointed to so far. Any attempted regression (`{{step:smell}}` after `{{step:acidity}}`) is ignored for spine purposes — the display never goes backwards.

**Graceful fallback:** If the session has zero marker-bearing assistant messages (model drift, legacy in-flight session, first message only), the spine falls back to the existing `min(userMsgCount, 5)` logic. This preserves current behavior for sessions started before the fix ships.

## Files to Touch

| File                           | Change                                                                 |
|--------------------------------|------------------------------------------------------------------------|
| `src/lib/tastingGlossary.js`   | Add `parseStepMarker(text)`, `STEP_KEY_TO_INDEX`, regex constant.      |
| `src/lib/claude.js`            | Add STEP MARKERS rule block inside the cached `staticBlock`.           |
| `src/tabs/TastingTab.jsx`      | Compute step from markers; store `stepKey` on assistant messages; strip marker from stored content; propagate to per-card label, `currentStep`, `ScorecardPeekLine`, `CupSheet`. |

**Files NOT touched (verify during review):**
- `src/components/*` — no sheet or component takes the marker directly.
- `api/claude.js` — pure pass-through, no change needed.
- `src/hooks/useAppData.js` — chat messages are ephemeral React state, never persisted to Firestore.
- `src/lib/peakStatus.js`, `src/lib/professorRuphus.js` — unrelated.

## Technical Approach

### 1. `src/lib/tastingGlossary.js` additions

```js
// Step keys must match the UI spine in TastingTab.jsx (TASTING_STEPS).
export const STEP_KEY_TO_INDEX = {
  'smell': 0,
  'first-sip': 1,
  'acidity': 2,
  'sweetness': 3,
  'body': 4,
  'finish': 5,
};

const STEP_MARKER_RE = /\{\{step:([a-z-]+)\}\}/gi;

// Parse a Ruphus message for step markers. Returns:
//   { stepKey: 'smell' | ... | null, strippedText: string }
// - If the model emits multiple markers in one turn (shouldn't, per prompt),
//   take the last valid one — most recent intent wins.
// - Unknown keys are ignored (stepKey stays null) but still stripped from
//   rendered text so prompt drift never bleeds through.
// - Case-insensitive match; keys stored lowercase.
export function parseStepMarker(text) {
  if (!text) return { stepKey: null, strippedText: '' };
  const matches = [...text.matchAll(STEP_MARKER_RE)];
  if (matches.length === 0) return { stepKey: null, strippedText: text };
  let stepKey = null;
  for (const m of matches) {
    const k = m[1].toLowerCase();
    if (STEP_KEY_TO_INDEX[k] != null) stepKey = k;
  }
  const strippedText = text.replace(STEP_MARKER_RE, '').replace(/\n{3,}/g, '\n\n').trim();
  return { stepKey, strippedText };
}
```

### 2. `src/lib/claude.js` prompt addition

Insert a new block inside `staticBlock` between the existing GLOSSARY TERM MARKERS section and NEVER RE-ASK WHAT YOU ALREADY KNOW. Exact wording:

```
STEP MARKERS (for the step spine UI):
- When you BEGIN a new step of the GUIDED FLOW, emit one marker on its own line at the very top of your message: {{step:KEY}}
- Valid step keys:
  * smell       -- the initial aroma/smell step (first message already covers this)
  * first-sip   -- when you tell the taster to take the first sip
  * acidity     -- when you shift focus to acidity, brightness, or tang
  * sweetness   -- when you shift focus to perceived sweetness
  * body        -- when you shift focus to mouthfeel or weight
  * finish      -- when you shift focus to what is left after swallowing
- Emit the marker ONCE, on the single message that BEGINS that step. Do NOT emit it on follow-ups, clarifying questions, or narrow-downs within the same step.
- If the taster asks a clarifying question or you are helping them refine a previous answer, STAY on the current step and emit NO marker.
- Never emit a marker that moves BACKWARDS in the flow.
- If you are unsure whether you are transitioning, omit the marker -- the UI has a safe fallback.
- The marker is a UI signal only. It does not replace the prose that introduces the step.
- Example (transition): "{{step:acidity}}\nGreat first sip! Now let's talk about acidity..."
- Example (clarifying, NO marker): "When you smell it, does it lean floral or fruity?"
```

**Prompt cache impact:** `staticBlock` is the cached block (`cache_control: { type: 'ephemeral' }` at `src/lib/claude.js:274`). Adding any bytes to it invalidates the current cache exactly once. The next request re-populates the cache with the new block; subsequent requests hit the cache normally. This is the same invalidation pattern we accepted when adding the GLOSSARY TERM MARKERS block. Acceptable cost.

**Placement matters:** The block goes inside `staticBlock`, not inside `dynamicBlock`. Placing it in dynamic would defeat caching for this rule (the dynamic block is not cached).

### 3. `src/tabs/TastingTab.jsx` changes

**3a. Import the new helpers (top of file):**
```js
import { TASTING_GLOSSARY, parseTermMarkers, autoLinkTerms, scanScorecard, parseStepMarker, STEP_KEY_TO_INDEX } from '../lib/tastingGlossary';
```

**3b. Strip + stash step key on every assistant append.** `handleChatSend` has three append sites (lines 681, 683, 686). Introduce a small helper locally:

```js
const appendAssistant = (rawText, extra = {}) => {
  const { stepKey, strippedText } = parseStepMarker(rawText);
  setChatMessages(prev => [...prev, {
    role: 'assistant',
    content: strippedText || 'Great session! Review below and save when ready.',
    stepKey,
    ...extra,
  }]);
};
```

Call order inside extract path:
1. Extract JSON from `text` (existing logic, unchanged).
2. Compute `cleanText = text.replace(/---EXTRACT---[\s\S]*?---END---/, '').trim()` (existing).
3. Pass `cleanText` through `parseStepMarker` — use the helper above.

Non-extract path: `appendAssistant(text)`.

JSON.parse-failure path: `appendAssistant(text.replace(/---EXTRACT---[\s\S]*?---END---/, '').trim())`.

**3c. Seed the opening message with `stepKey: 'smell'`** in three places (lines 585, 593, 618):
```js
setChatMessages([{ role: 'assistant', content: buildOpeningMessage(bean), stepKey: 'smell' }]);
```
This gives the monotonic walk a known starting point and ensures per-card labels are correct from turn 1.

**3d. Replace `currentStep` derivation.** Replace lines 758-764 with a memoized walk:

```js
// Walk the message array in order, tracking the highest emitted step index
// (monotonic: never regresses). Map each assistant message index to the
// step it occurred under. Record whether we ever saw a marker so the UI
// can fall back to the legacy count-based logic for marker-less sessions.
const stepWalk = useMemo(() => {
  let maxIdx = 0;
  let hasMarkers = false;
  const perMessage = new Map(); // message-array index -> step index at that point
  for (let i = 0; i < chatMessages.length; i++) {
    const m = chatMessages[i];
    if (m.role !== 'assistant') continue;
    if (m.stepKey && STEP_KEY_TO_INDEX[m.stepKey] != null) {
      const idx = STEP_KEY_TO_INDEX[m.stepKey];
      if (idx > maxIdx) maxIdx = idx; // monotonic
      hasMarkers = true;
    }
    perMessage.set(i, maxIdx);
  }
  return { perMessage, maxIdx, hasMarkers };
}, [chatMessages]);

const userMsgCount = chatMessages.filter(m => m.role === 'user').length;
const currentStep = chatExtracted
  ? TASTING_STEPS.length
  : stepWalk.hasMarkers
    ? stepWalk.maxIdx
    : Math.min(userMsgCount, TASTING_STEPS.length - 1);
```

**3e. Per-card step label (lines 947-949).** Replace `rIdx`-based computation with:
```js
const msgStepIdx = stepWalk.hasMarkers
  ? (stepWalk.perMessage.get(i) ?? 0)
  : Math.min(ruphusIdxOf(i), TASTING_STEPS.length - 1);
const stepNum = msgStepIdx + 1;
const stepName = TASTING_STEPS[msgStepIdx];
```

**3f. `ScorecardPeekLine` and `CupSheet`:** Both already receive `currentStep` / `stepName` derived from the updated computation. Zero changes inside those components.

**3g. `RuphusContent` (lines 78-104):** Zero changes. Content arrives pre-stripped (step marker removed before `setChatMessages`), so the existing `parseTermMarkers` + `autoLinkTerms` pipeline operates on clean text.

## Edge Cases

Every edge case the user asked about, plus a few more:

### Model forgets the marker (under-emission)
- **Behavior:** `hasMarkers` is `true` once a single marker has ever been emitted in the session. All subsequent marker-less messages inherit the last known step via `stepWalk.perMessage`.
- **Tradeoff:** Spine may stall on an earlier step if the model emits the first marker then goes silent for 4 turns. This is acceptable — the user's reported bug is that the spine moves *too fast*. Stalling is the opposite failure, and still less confusing than false-advancing.
- **Never silently upgrade:** we do not synthesize markers based on content keywords. Trust Ruphus or fall back to count — never mix.

### Model never emits any marker (full drift or legacy session)
- `stepWalk.hasMarkers === false` → fall back to `min(userMsgCount, 5)`.
- Session started before the fix shipped still works identically to today.

### Marker appears in the first Ruphus message
- The opening greeting is hardcoded locally (`buildOpeningMessage`), never comes from Claude, so there is no marker in practice. We seed `stepKey: 'smell'` manually. If a future refactor sources the opener from Claude and it emits `{{step:smell}}`, the parser handles it and nothing changes.

### Marker appears after `---EXTRACT---` block
- `chatExtracted` becomes non-null on extract; `currentStep = TASTING_STEPS.length` (all 6 lit) regardless of marker. The marker is still stripped from the stored text so it never renders.
- Order of operations in the extract path: strip EXTRACT block first, then `parseStepMarker` — our regex does not match EXTRACT content, so order does not actually matter.

### Step regression attempt
- `{{step:smell}}` emitted after `{{step:acidity}}` → the monotonic guard (`if (idx > maxIdx) maxIdx = idx`) ignores the regression for spine purposes. The marker is still stripped from rendered text. The per-card step label for that specific message inherits the current `maxIdx`.

### Multiple markers in one message
- Should not happen per the prompt rule. Defensive behavior: last valid marker wins for that message's `stepKey`; all occurrences are stripped from display text.

### Bean switch mid-chat
- The `sel` reset effect (line 591) wipes `chatMessages` and seeds a fresh opener with `stepKey: 'smell'`. `stepWalk` recomputes, everything resets cleanly.

### End session / Save → new session
- `exitChat` and `saveChatTasting` both set `setChatMessages([])`. Next session starts fresh. No cross-session bleed.

### Unknown step key (prompt drift)
- `parseStepMarker` strips the marker from display but leaves `stepKey: null`. Treated as if no marker was emitted on that turn. No crash, no wrong step.

### Malformed marker (e.g. `{{step:}}`, `{{step acidity}}`, unclosed)
- Regex `/\{\{step:([a-z-]+)\}\}/gi` requires non-empty lowercase+hyphen key and closing braces. Malformed forms simply do not match. Display text left untouched.

### Scorecard peek depends on `scanScorecard` regex
- `scanScorecard` reads `m.content` directly. Our strip happens before `setChatMessages`, so the stored content never contains the step marker. `scanScorecard` regex already ignores anything that is not an axis keyword, so even if a marker leaked through it would not false-match.

### Prompt cache invalidation
- One-time invalidation when the new `staticBlock` hits production (or dev). Subsequent requests hit the cache normally. Same pattern used for the GLOSSARY TERM MARKERS rule we shipped earlier.

### Interaction with `{{term:KEY}}` markers
- Step markers use keys like `first-sip` (hyphenated). Term markers use short single words (`jasmine`, `acidity`). Regexes are independent. No cross-parsing. The `autoLinkTerms` fallback word-boundary scanner runs against already-stripped text, so it never sees `{{step:...}}` tokens.

### The per-card step badge number (the "2" in "STEP 2 · FIRST SIP")
- Pulled from the same `stepNum = msgStepIdx + 1` computation (see 3e). Stays in sync with the header spine.

### iOS keyboard / portal / swipe-to-dismiss sheets
- Fully orthogonal. No interaction with the step logic.

## System-Wide Impact

### Interaction graph
User sends message → `handleChatSend` → `sendTastingMessage` → `api/claude.js` → Anthropic → response text → `parseStepMarker` strips marker and captures `stepKey` → `setChatMessages` appends clean message → React re-renders → `stepWalk` memo re-runs → `currentStep` and per-card indices flow to spine, `RuphusJournalCard`, `ScorecardPeekLine`, `CupSheet`.

### Error propagation
- `parseStepMarker` is pure string ops. No throw paths.
- If `STEP_KEY_TO_INDEX[m.stepKey]` is undefined (stale stored key), the walk treats it as no-marker for that message. No crash.
- JSON.parse failure on EXTRACT → existing catch branch. Our step-marker path is orthogonal; the catch branch must still call `appendAssistant` to get the stripping behavior.

### State lifecycle risks
- `chatMessages` is React state only, never written to Firestore. No risk of stale-persisted markers.
- Bean switch, end, save → all set `chatMessages` to a known shape. No orphaned marker data.
- On fast-consecutive assistant responses (streaming is not used here — responses are one-shot), the append order mirrors message-send order. Monotonic walk handles any arrival order.

### API surface parity
- Only one caller (`TastingTab`) uses the tasting system prompt + chat message format. No sibling interfaces to update.

### Integration test scenarios
1. Open chat → send clarifying "what does jasmine smell like?" → expect: step spine stays on Smell, per-card label stays on Smell.
2. Open chat → Ruphus replies with `{{step:first-sip}}` → expect: header advances to First Sip, previous Ruphus card stays labeled Smell, new card labeled First Sip.
3. Open chat → Ruphus emits `{{step:acidity}}`, then later emits `{{step:smell}}` by mistake → expect: header stays on Acidity (monotonic), later card still labels as Acidity.
4. Open chat → Ruphus never emits any markers → expect: legacy count-based fallback, spine advances on each user message (same as today's behavior).
5. Open chat → reach extract → expect: all 6 dots lit, scorecard peek hidden, extract card renders.

## Risks

| Risk                                                      | Mitigation                                                                                                                         |
|-----------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------|
| Prompt cache invalidation costs one request at full price | Accepted. Same trade we took for the GLOSSARY block last week.                                                                     |
| Model under-emits markers, spine stalls                    | Acceptable failure mode. Stalling is less confusing than false-advancing. CupSheet shows axis-level progress as a secondary signal.|
| Model over-emits markers (marks every turn)                | Prompt rule explicitly says "ONCE per step". Monotonic guard prevents backwards moves. If model still over-emits *forward*, spine jumps — but this was the pre-fix behavior, so no regression. |
| Legacy session in memory when fix loads (HMR only; prod reload clears state) | `hasMarkers === false` → legacy fallback. Same behavior as today.                                                             |
| Regex false-positive on user-typed `{{step:...}}`          | User messages are rendered via `UserHandwrittenBubble` which does not call `parseStepMarker`. No risk.                             |
| Scorecard peek / CupSheet break                            | Both consume already-computed `currentStep` + `stepName` props. No internal changes. Verified in research.                         |
| Portal / swipe-dismiss / keyboard handling                 | Fully unrelated. Zero touch.                                                                                                        |
| `scanScorecard` regresses                                  | Reads raw `m.content`; our strip runs before storage so content is cleaner, not dirtier. Regex already ignores non-axis tokens.    |

## Acceptance Criteria

### Functional
- [ ] When the user sends a clarifying question inside the Smell step, the spine does not advance.
- [ ] When Ruphus emits `{{step:first-sip}}`, the header advances to First Sip exactly once.
- [ ] When Ruphus emits `{{step:KEY}}` that would move backwards, the spine does not regress.
- [ ] Per-card step badge ("STEP 2 · FIRST SIP") matches the step that was active when the card was emitted.
- [ ] `ScorecardPeekLine` "tasting now…" axis matches `currentStep` → `STEP_TO_AXIS` mapping.
- [ ] `CupSheet` radar highlights the active axis consistent with `currentStep`.
- [ ] Step markers never render to the user (stripped from display).
- [ ] Extract flow still fires on the final turn; all 6 dots light when `chatExtracted` is set.
- [ ] Sessions that receive zero markers from the model behave identically to today (count-based fallback).

### Non-functional
- [ ] No new warnings or errors in the Capacitor iOS build log.
- [ ] Prompt cache invalidates exactly once after deploy; subsequent requests show cache hits in Anthropic dashboards (spot-check).
- [ ] No observable latency increase in chat send (step parsing is cheap string ops).

### Quality gates
- [ ] `npm run build` clean.
- [ ] Manual iOS QA on Capgo dev channel (Tal's device only).

## iOS Manual QA Checklist

Run against a Capgo `dev` bundle on Tal's iPhone, not the simulator.

1. Force-quit app, relaunch, confirm bundle pulled.
2. Tasting → Chat It → pick a bean → confirm header shows "STEP 1 · SMELL", Smell dot active.
3. Reply "I smell chocolate" → expect Ruphus to validate + reveal. Verify: if his reply does NOT start a new step, the header still says "STEP 1 · SMELL" and only Smell dot is highlighted.
4. Reply with a clarifying question ("what does jasmine smell like?") → expect: header stays on Smell.
5. Continue until Ruphus says "Now take a sip…" with a `{{step:first-sip}}` marker (you won't see the marker on screen; verify by observing the spine moves exactly one dot). Expect: header shows "STEP 2 · FIRST SIP", dot 1 is done, dot 2 is active.
6. Send a clarifying reply within first-sip → expect: spine stays.
7. When Ruphus transitions to acidity / sweetness / body / finish, each transition should move exactly one dot.
8. Open "Your cup so far" → confirm `Step X / 6` label and axis "tasting now…" highlight match the spine state.
9. Scroll back through past Ruphus cards → each card's badge ("STEP N · NAME") should reflect the step at that moment, not the current step.
10. Reach EXTRACT card → confirm all 6 dots are lit, peek bar hides, save card appears.
11. Save → back to list → restart a fresh chat → confirm state resets to Smell.
12. Switch bean mid-chat via the header dropdown → confirm chat reopens with fresh Smell state.
13. Confirm no stray `{{step:...}}` text appears anywhere in the transcript.
14. Confirm teach-me underlines still work on glossary terms (regression check on the stripped-text pipeline).

## Implementation Sequence

1. `src/lib/tastingGlossary.js` — add `STEP_KEY_TO_INDEX` and `parseStepMarker`. Build.
2. `src/lib/claude.js` — append STEP MARKERS block inside `staticBlock`. Build.
3. `src/tabs/TastingTab.jsx` — import new helpers, add `appendAssistant`, update three append sites, seed opener with `stepKey: 'smell'` in three places, replace `currentStep` derivation with `stepWalk` memo, replace per-card label computation. Build.
4. `npm run build` — verify clean.
5. `/ship-dev` — deploy to Vercel preview + Capgo dev channel.
6. Manual QA on device per checklist above.
7. If clean, `/ship` to production.

## Sources & References

- Bug screenshots: Downloads folder, 2026-04-18 10:06 AM and 10:07 AM.
- Reference: `src/tabs/TastingTab.jsx:761-764` (bug site), `src/tabs/TastingTab.jsx:947-949` (per-card label bug), `src/lib/tastingGlossary.js:87-106` (existing `parseTermMarkers` pattern to mirror), `src/lib/claude.js:194-275` (cached `staticBlock` + `cache_control`).
- Prior pattern: GLOSSARY TERM MARKERS block in `src/lib/claude.js` staticBlock — same shape, same cache implications.
- Learnings: `docs/solutions/logic-errors/regex-parser-malformed-structural-fallthrough.md` (parser robustness), `docs/solutions/security-issues/llm-prompt-sanitization-patterns.md` (LLM output safety).
