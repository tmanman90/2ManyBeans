# Tasting Coach Upgrade: Bean-Aware Guided Coaching

## Problem

The tasting chat is broken in two ways:

1. **The AI is blind to bean details.** `buildTastingSystemPrompt()` only passes bean name + roaster to Claude. No origin, region, process, variety, altitude, roast date, tasting notes, roast level, or any enriched data. Result: the AI guessed "Guatemala" for a Colombian (Narino) coffee because it had zero context beyond the name "Finca San Antonio."

2. **The coaching is a generic questionnaire, not real coaching.** The system prompt runs a rigid 6-step script with fixed multiple-choice options that are the same for every bean. A real tasting coach who knows THIS coffee would say "interesting, the roaster expected more fruit there" instead of offering the same generic aroma categories every time.

## What Already Exists

**`src/lib/coffeeKnowledge.js`** is a comprehensive knowledge module distilled from James Hoffmann's "The World Atlas of Coffee." It exports:

- `TASTING_KNOWLEDGE` -- flavor descriptors, tasting methodology, tendencies by origin/process/roast/altitude, brew troubleshooting. **Already injected** into `buildTastingSystemPrompt()` (line 286 of claude.js).
- `ORIGIN_PROFILES` -- 30+ country profiles with regions, altitude, varieties, cup characteristics.
- `getOriginContext(origin)` -- fuzzy-matches a bean's origin string to the correct country profile. **Already imported** in claude.js (line 4) but **not used** in the tasting prompt. Already used by Professor Ruphus as the pattern to follow.
- `BREWING_KNOWLEDGE` -- already wired into `buildChatContext()` for general chat.
- `RUPHUS_KNOWLEDGE` -- already wired into Professor Ruphus.

The infrastructure is in place. The tasting coach just isn't using it.

## Design Decisions

These were discussed and locked in before implementation:

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Bag notes | **Withhold, then reveal step-by-step** | Avoids anchoring the taster's perception. More educational. |
| Reveal timing | **After each step** | After taster describes aroma, coach reveals what the bag said about aroma. Same for each subsequent step. Interactive and engaging. |
| Reveal tone | **Teach the gap** | Validate what the taster said, note the difference, explain why (age, grind, palate), give an actionable tip. Never dismiss. |
| Reveal depth | **Coach's discretion** | AI has both bag notes and origin context. Prompt says to surface origin knowledge when it adds value, not to force it every turn. |
| Peak status | **Mention only if relevant** | Don't lead with "this is past peak." Only reference it if the taster's observations track with aging (muted, flat, less fruit). |
| Past tastings | **Include last 3 for this bean** | Enables "last time you got earthy too" continuity. Filter from existing `tastings` prop by beanId. |
| Opening message | **Origin + process only, no bag notes, no emojis** | Sets context without spoiling flavors. Clean text. |
| Bean switch mid-chat | **Reset chat** | Changing the bean dropdown clears chat history and starts fresh with new opening message. |
| Token budget | **Bump to 1000** (from 800) | Richer reveal-style responses need slightly more room. Still concise. |
| Architecture | **Bean object in, prompt out** | `buildTastingSystemPrompt` receives the raw bean object + tastings array and handles all assembly internally (getOriginContext, getPeakStatus, past tasting filtering). Keeps TastingTab simple. |
| Emojis | **Drop from tasting chat** | Clean text throughout. |

## Root Cause

In `src/lib/claude.js` line 279, `buildTastingSystemPrompt(beanName, allBeans)`:
- `beanName` is just `"Finca San Antonio (Prodigal)"` (name + roaster string)
- `allBeans` is only used to build a list of `"name" by roaster` strings
- `TASTING_KNOWLEDGE` is injected (general tasting methodology) but no bean-specific data or origin profile is included
- `getOriginContext()` is imported but never called here
- No previous tasting data is available

In `src/tabs/TastingTab.jsx` line 104-105:
- Only calls `getBeanName(sel)` which returns `"name (roaster)"`
- The full bean object is available via `beans.find(b => b.id === sel)` but is never passed
- `tastings` prop is available but not filtered or passed for context

## Fix

### Change 1: New function signature and bean object passing

**File:** `src/tabs/TastingTab.jsx`

Old: `buildTastingSystemPrompt(beanName, beans)`
New: `buildTastingSystemPrompt(beanName, beans, selectedBean, tastings)`

In `handleChatSend()`:
- Look up the full bean object: `const selectedBean = beans.find(b => b.id === sel)`
- Pass it along with tastings: `buildTastingSystemPrompt(beanName, beans, selectedBean, tastings)`

In `startChat()`:
- Same lookup, use bean data for the opening message

**Bean switch behavior:** Add an `useEffect` or onChange handler so that changing the bean dropdown while in chat mode resets: clears `chatMessages`, clears `chatExtracted`, and triggers a new `startChat()` with the new bean.

### Change 2: Build rich context blocks inside `buildTastingSystemPrompt()`

**File:** `src/lib/claude.js`

The function receives the raw bean object and tastings array, then internally assembles three new context blocks:

**A. BEAN PROFILE block** -- built from the selected bean's fields:

```
BEAN PROFILE (the coffee being tasted right now):
- Roaster: Prodigal
- Name: Finca San Antonio
- Origin: Colombia (Narino)
- Process: Washed
- Variety: Caturra
- Altitude: 1,800-2,100 masl
- Roast Date: 2025-12-30 (75 days post-roast, Past Peak)
- Days Open: 5
- Bag Notes: peach / orange marmalade / floral
- Roast Level: Light
- Cup Score: 87
```

Built by checking each field on the bean object. Only include fields that have values. Use `getPeakStatus()` (already imported) for roast age and label. Use `daysOpen()` (already imported) if bean has `openDate`.

**B. ORIGIN CONTEXT block** -- via `getOriginContext(selectedBean.origin)`:

```javascript
const originContext = getOriginContext(selectedBean.origin);
const originSection = originContext
  ? `\nORIGIN CONTEXT FOR ${(selectedBean.origin || '').toUpperCase()}:\n${originContext}\n`
  : '';
```

Follow the exact pattern from `professorRuphus.js` lines 28-29.

**C. PAST TASTINGS block** -- filter tastings by beanId, take last 3:

```javascript
const pastTastings = tastings
  .filter(t => t.beanId === selectedBean?.id)
  .sort((a, b) => b.date > a.date ? 1 : -1)
  .slice(0, 3);
```

Format as:
```
PREVIOUS TASTINGS OF THIS BEAN:
- 2026-03-10: aroma: nutty, body: thick, oneWord: "earthy", rating: 3
- 2026-03-05: aroma: mild, body: medium, oneWord: "smooth", rating: 3
```

If no past tastings, omit the section entirely.

### Change 3: Rewrite the coaching persona

**File:** `src/lib/claude.js`, in `buildTastingSystemPrompt()`

The AI now has four layers of knowledge: `TASTING_KNOWLEDGE` (general methodology, already present), `ORIGIN CONTEXT` (country-level, new), `BEAN PROFILE` (specific coffee, new), and `PAST TASTINGS` (continuity, new). The coaching persona must use them correctly.

**Core philosophy: Withhold, then reveal.**

The coach knows the bag notes and origin profile internally but does NOT share them until AFTER the taster describes each attribute. The reveal happens step-by-step:

1. Coach asks about aroma (with generic scaffolded options)
2. Taster describes what they smell
3. Coach validates, THEN reveals: "The bag actually lists peach/marmalade/floral for this one. You got nutty/earthy instead. That can happen when a coffee is this far past its roast date. Try grinding a notch finer next time to see if more fruit emerges."
4. Coach moves to next step

**Reveal rules for the prompt:**
- NEVER mention bag notes, roaster's tasting notes, or expected flavors BEFORE the taster gives their answer
- AFTER the taster responds to each step, reveal what the bag/roaster said for that attribute
- When the taster's description differs from the bag notes, teach the gap: validate their perception, note the difference, explain a possible reason (age, grind, water temp, roast level, natural variation), and offer one actionable tip
- When the taster's description matches the bag notes, celebrate it: "That's exactly what the roaster had too. Your palate is dialing in."
- Use origin context at the coach's discretion. Surface it when it genuinely adds value ("Narino coffees are known for complexity, so that layered quality you're picking up is classic for the region"). Don't force it every turn.
- Peak status: only reference freshness/age if the taster's observations suggest it (muted flavors, less fruit than expected, flatness). Don't lead with "this is past peak."
- Past tastings: reference when the taster says something consistent ("You got earthy last time too, that seems to be your signature read on this coffee") or when there's an interesting shift ("Last time you said smooth, now you're getting more texture. Could be the grind change.")

**Keep from current prompt:**
- The 6-step flow structure (aroma, first sip, body/finish, sweetness, one word, brew dial-in)
- The novice-friendly scaffolding with multiple-choice options per step
- The `TASTING_KNOWLEDGE` injection (already present, keep as-is)
- The extraction markers and format (`---EXTRACT---` / `---END---`)
- The "warm, encouraging, brief" tone (2-3 sentences + options, now with occasional reveal sentences)
- The brew dial-in diagnostic with actionable fixes
- The AVAILABLE BEANS list and bean-switching logic

**Drop from current prompt:**
- Emojis in all coaching text
- Generic "what do you notice?" framing (already banned, reinforce)

### Change 4: Bean-aware opening message (no bag notes)

**File:** `src/tabs/TastingTab.jsx`, in `startChat()`

Replace the hardcoded opening message. Build it dynamically from bean data, showing origin and process only. No bag notes (withhold-reveal pattern). No emojis.

Example output:
```
Let's taste Finca San Antonio (Prodigal)! This is a washed Colombian from Narino.

Step 1: Smell it first. Bring the cup to your nose and breathe in slowly. What do you get?

- Fruity (berries, citrus, tropical)?
- Floral (jasmine, rose, tea-like)?
- Sweet (chocolate, caramel, honey)?
- Nutty or earthy?
- Funky or fermented?

Or just describe it in your own words.
```

When origin/process are available, include them in the intro line. When they're not, fall back to just the bean name: "Let's taste [name] ([roaster])!"

The aroma options stay generic in the opening (since we're withholding bag notes). The AI's response to the taster's first answer is where the reveal begins.

### Change 5: Reset chat on bean switch

**File:** `src/tabs/TastingTab.jsx`

When the bean selector dropdown changes while in chat mode:
- Clear `chatMessages`
- Clear `chatExtracted`
- Re-run `startChat()` with the new bean's data

Implementation: either add logic to the `onChange` handler of the bean `<select>`, or add a `useEffect` watching `sel` while `mode === 'chat'`.

### Change 6: Bump maxTokens

**File:** `src/lib/claude.js`, in `sendTastingMessage()`

Change `maxTokens: 800` to `maxTokens: 1000`. The richer reveal-style responses (validate + reveal + teach + tip) need slightly more room while still staying concise.

## Files Modified

| File | Change |
|------|--------|
| `src/lib/claude.js` | Update `buildTastingSystemPrompt()`: new params (selectedBean, tastings), add BEAN PROFILE + ORIGIN CONTEXT + PAST TASTINGS blocks, rewrite coaching persona with withhold-reveal pattern, bump maxTokens to 1000 |
| `src/tabs/TastingTab.jsx` | Pass full bean object + tastings to prompt builder, bean-aware opening message (origin + process, no bag notes, no emojis), reset chat on bean switch |

## Not Changing

- `src/lib/coffeeKnowledge.js`: no changes, use as-is
- API proxy (`api/claude.js`): no changes needed, same endpoint
- Extraction format: same `---EXTRACT---` / `---END---` markers
- Save flow: unchanged
- Score conversion: unchanged
- Chat UI/styling: unchanged
- System prompt token budget: BEAN PROFILE (~100 tokens) + ORIGIN CONTEXT (~50-80 tokens) + PAST TASTINGS (~50 tokens) added to system prompt. `TASTING_KNOWLEDGE` already present. Total stays well within limits.

## Verification

1. **Bean context**: Start a tasting chat for Finca San Antonio. Confirm the AI knows it's Colombian, washed, from Narino without being told.
2. **Withhold-reveal**: Describe aroma as "nutty." Confirm the AI validates, then reveals "the bag lists peach/orange marmalade/floral," and explains the gap with a tip.
3. **Origin knowledge**: Confirm the AI references Narino-specific knowledge at appropriate moments (not every turn).
4. **Peak status**: Describe flavors as "muted" or "flat." Confirm the coach connects this to freshness. Describe flavors as "bright and fruity," confirm the coach does NOT mention peak status.
5. **Past tastings**: Taste the same bean a second time. Confirm the coach references the previous tasting's notes.
6. **Opening message**: Confirm it shows origin + process, no bag notes, no emojis.
7. **Bean switch**: Change the dropdown mid-chat. Confirm it resets and starts fresh for the new bean.
8. **Extraction**: Complete a full tasting. Confirm `---EXTRACT---` data saves correctly.
9. **Minimal data fallback**: Test with a bean that has no enriched fields and unknown origin. Confirm graceful fallback to generic coaching with just `TASTING_KNOWLEDGE`.
10. **Response length**: Confirm responses stay concise (2-4 sentences + options/reveal) and don't get bloated with the extra context.
