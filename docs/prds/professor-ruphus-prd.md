# Professor Ruphus — Coffee Education Feature PRD

## Context

The user wants to learn about the coffees they drink. When scanning a bean, the app already does web research to fill in data fields, but that info is dry metadata. This feature generates a short, warm educational "lesson" per bean — roaster backstory, what the processing method means, what flavors to expect — themed as a friendly golden retriever professor teaching a novice. Inspired by the Kumquat Coffee Club pamphlet that ships with subscriptions.

## Feature Summary

- **Trigger**: Professor Ruphus icon button on every bean card (Rotation, Inventory, Archive)
- **UI**: Full-screen Spotify-style slide-up (constrained to 480px max-width), Ruphus mascot as host
- **Content**: Structured sections (roaster, coffee, process explanation, what to look for) + radar/spider chart with optional tasting overlay
- **Generation**: Runs after existing scan research (separate lightweight call, no extra web search), with on-demand fallback for existing beans
- **Hallucination prevention**: Roaster/farm facts ONLY from web search; process/variety education is general knowledge (always safe); skip sections rather than fabricate
- **Thin data handling**: Professor Ruphus acknowledges naturally when info is sparse
- **Regeneratable**: Subtle refresh button to regenerate a cached story

## Data Model

New `story` field on bean documents in Firestore:

```js
story: {
  intro: "string",              // Ruphus one-liner speech bubble (adapts to data richness)
  roaster: "string|null",       // Roaster backstory (null = skip, web search only)
  coffee: "string|null",        // Farm, region, altitude context
  process: "string|null",       // What this process means (general knowledge, safe)
  lookFor: "string|null",       // Expected flavors for this variety+process+origin
  flavorProfile: {              // Spider chart scores 1-10
    fragranceAroma, acidity, sweetness, body, flavor, balance
  },
  generatedAt: "ISO string"
}
```

New `tastingScores` field on tasting documents (generated at tasting save time):

```js
tastingScores: {               // AI-converted from text descriptions, stored once
  fragranceAroma, acidity, sweetness, body, flavor, balance  // 1-10
}
```

## Key Architecture Decision: Separate Story Call (NOT Combined)

**DO NOT replace `researchBeanOnline()`.** Keep it exactly as-is — it works and the scan enrichment flow depends on it.

Add a NEW `generateRuphusStory(bean)` function that:
- Takes the already-enriched bean data as input (after research has run)
- At scan time: does NOT use web search (data already enriched by research step)
- On-demand (for beans without prior research): DOES use web search (3 max) to gather roaster/farm context
- Returns just the story object

**Why this is better than combined:**
- Existing scan enrichment is completely untouched — zero regression risk
- If story generation fails, enrichment is unaffected (and vice versa)
- Simpler, more focused prompts = more reliable JSON responses
- Still only one web search pass at scan time (research does the web search, story uses results)
- "AI Fill" button in AddBeanForm continues to work unchanged

**Scan flow:**
```
scanBeanLabel() → researchBeanOnline() → merge enrichment → generateRuphusStory(enrichedBean) → store story
```

**On-demand flow (bean has no story):**
```
generateRuphusStory(bean, { useWebSearch: true }) → updateBean with story
```

## Files to Create

| File | Purpose |
|------|---------|
| `src/lib/professorRuphus.js` | `generateRuphusStory(bean, opts)` — story generation + `convertTastingScores(tasting, bean)` |
| `src/components/ProfessorRuphusSlideUp.jsx` | Full-screen slide-up overlay (480px max-width, portal to body) |
| `src/components/SpiderChart.jsx` | Pure SVG 6-axis radar chart with optional tasting overlay |
| `src/hooks/useProfessorRuphus.js` | Shared hook (state + on-demand generation logic) |
| `public/images/professor-ruphus.png` | Mascot illustration for slide-up header (AI-generated) |
| `public/images/professor-ruphus-icon.png` | Small icon for bean card button (AI-generated) |

## Files to Modify

| File | Change |
|------|--------|
| `src/lib/claude.js` | Export `callClaude` (one-word change, line 7) |
| `src/components/BeanCard.jsx` | Add `onLearn` prop + Ruphus icon button next to edit pencil |
| `src/App.jsx` | Pass `updateBean` and `tastings` to InventoryTab and ArchiveTab |
| `src/tabs/RotationTab.jsx` | Import hook, pass `onLearn` to BeanCard, render slide-up |
| `src/tabs/InventoryTab.jsx` | Accept `updateBean`/`tastings` props, import hook, pass `onLearn`, render slide-up |
| `src/tabs/ArchiveTab.jsx` | Accept `updateBean`/`tastings` props, add Ruphus icon to archive cards, import hook, render slide-up |
| `src/components/AddBeanForm.jsx` | After research merge, call `generateRuphusStory()` in background, store with bean on save |
| `src/tabs/TastingTab.jsx` | After tasting save, call `convertTastingScores()` in background (non-blocking) |
| `src/styles/global.css` | Add `ruphusSlideUp` and `ruphusFadeIn` keyframe animations |

## Claude Prompts

### Story Generation Prompt (src/lib/professorRuphus.js)

```
System: You are Professor Ruphus, a friendly golden retriever coffee professor.
You write short, warm educational lessons about specific coffees for a novice.

HALLUCINATION PREVENTION:
1. ROASTER/FARM sections: ONLY include facts you are confident about from search results
   or widely known public knowledge. If uncertain, set to null. NEVER fabricate.
2. PROCESS/VARIETY sections: General coffee knowledge is fine and encouraged.
   Explaining what "Natural process" means is always safe.
3. FLAVOR PROFILE: Base on general expectations for variety + process + origin.
   These are educational estimates, not specific cupping scores.
4. When data is thin, skip sections (null). In the intro, acknowledge naturally:
   "I couldn't dig up much on this roaster, but let me tell you what makes this interesting..."

TONE: Warm, enthusiastic, slightly nerdy professor. First person.
Brief — 60-90 second read (~200-300 words total across all sections).

Return ONLY a valid JSON object (no markdown, no backticks):
{
  "intro": "One-liner speech bubble (15 words max). Enthusiastic about this coffee.",
  "roaster": "2-3 sentences about the roaster. null if nothing reliable found.",
  "coffee": "2-3 sentences about the farm, region, altitude. null if no meaningful context.",
  "process": "2-3 sentences explaining this processing method for a novice. null if process unknown.",
  "lookFor": "2-3 sentences connecting variety + process + origin to expected flavors.",
  "flavorProfile": {
    "fragranceAroma": <1-10>, "acidity": <1-10>, "sweetness": <1-10>,
    "body": <1-10>, "flavor": <1-10>, "balance": <1-10>
  }
}
```

When `useWebSearch: true` (on-demand/refresh): add `tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }]`.
When `useWebSearch: false` (scan-time, data already enriched): no tools, cheaper call.

### Tasting Scores Conversion Prompt

Non-blocking background call after tasting save. If it fails, tasting is already saved — just no overlay.

```
Convert these coffee tasting notes into numeric scores (1-10).
If a field is empty, estimate from other fields and the bean's characteristics.

Return ONLY JSON:
{ "fragranceAroma": N, "acidity": N, "sweetness": N, "body": N, "flavor": N, "balance": N }
```

## Spider Chart

Pure SVG, no libraries. Props: `{ expectedScores, tastingScores?, size? }`

- 6 axes at 60-degree intervals: Fragrance/Aroma, Acidity, Sweetness, Body, Flavor, Balance
- 3 concentric hexagon grid lines (33%, 66%, 100%)
- **Expected profile**: Polygon filled with `C.accent` at 20% opacity, accent stroke
- **Tasting overlay** (optional): Second polygon in `C.amber` at 20% opacity, amber stroke
- **Legend** (when overlay present): "Expected" and "Your Experience" with color dots
- Labels outside the hexagon in `C.textMuted`

## Slide-Up UI Layout

480px max-width, centered. Full-height. Uses `createPortal` to body, z-index 1100.

1. **Header bar**: drag handle + close X + subtle refresh icon (top-right)
2. **Professor Ruphus**: mascot (64px circle) + speech bubble (`story.intro`) in amber bg, Caveat font
3. **Bean title**: name + "roaster · origin" subtitle
4. **Sections**: each in a journalCard-style card with inline SVG icon + heading + body text. Skip if null:
   - The Roaster (house SVG icon)
   - This Coffee (globe SVG icon)
   - Understanding the Process (beaker SVG icon)
   - What to Look For (cup SVG icon)
5. **Spider chart**: "Expected Flavor Profile" heading + chart. Shows tasting overlay + legend if tastingScores exist.
6. **Loading state**: Ruphus image + "Professor Ruphus is preparing your lesson..."
7. **Error state**: message + retry button

Section icons are simple inline SVGs themed to the app (C.accent color, 18px) — not AI-generated images. More consistent and no generation risk.

## Mascot Art

Generate 2 images using AI image tool (nano-banana MCP):
- **professor-ruphus.png**: Friendly golden retriever with round professor glasses, warm Ghibli-esque illustrated style matching nav-chat.png. For slide-up header.
- **professor-ruphus-icon.png**: Same character, head/face only, works at 22px. For bean card button.

Fallback: if generation fails or looks wrong, use existing `nav-chat.png` for both.

## Scan-Time Flow

```
1. scanBeanLabel(photos) → scan data
2. researchBeanOnline(scanData) → enrichment fields [UNCHANGED]
3. merge enrichment into form fields [UNCHANGED]
4. generateRuphusStory(enrichedBean, { useWebSearch: false }) → story [NEW, background]
5. setStep('review') — user edits fields
6. on save: include story in beanData if available
```

Step 4 runs in background (non-blocking). If it finishes before save, story is included. If not, on-demand fallback later.

## On-Demand Flow

```
User taps Ruphus icon → handleLearn(bean)
  → bean.story exists? → show immediately
  → bean.story missing? → show loading state
    → generateRuphusStory(bean, { useWebSearch: true })
    → success: updateBean(bean.id, { story }) + show content
    → error: show error + retry button
```

## Refresh Flow

```
User taps refresh icon
  → show loading → generateRuphusStory(bean, { useWebSearch: true })
  → success: updateBean(bean.id, { story }) + show new content
  → error: show error, keep old story visible
```

## Tasting Overlay Flow

```
User saves a tasting (in TastingTab or future FinishBagPrompt)
  → addTasting(tastingData) first [NON-BLOCKING — save completes immediately]
  → then in background: convertTastingScores(tasting, bean) → Claude call
    → success: updateTasting(tastingId, { tastingScores })
    → failure: silent — tasting saved without scores, no overlay in chart
```

## Error Handling Strategy

| Failure Point | Impact | Handling |
|---------------|--------|----------|
| Story generation fails at scan time | No story cached | Silent — story generates on-demand when user taps Learn |
| Story generation fails on-demand | User sees error | Error state with retry button in slide-up |
| Tasting score conversion fails | No chart overlay | Silent — tasting already saved, chart shows expected only |
| Malformed JSON from story call | Can't parse story | Catch, show error state, user can retry |
| Malformed JSON from score call | Can't parse scores | Silent — no overlay |
| Web search returns nothing | Thin story | Roaster/coffee sections null, intro acknowledges, process/lookFor still work |
| Bean has almost no data | Very thin story | Only flavorProfile + maybe lookFor. Still useful. |

## Implementation Sequence

1. Export `callClaude` from claude.js (1-word change)
2. Create `src/lib/professorRuphus.js` — `generateRuphusStory()` + `convertTastingScores()`
3. Create `src/components/SpiderChart.jsx`
4. Add keyframe animations to `global.css`
5. Generate mascot images (or set up fallback to nav-chat.png)
6. Create `src/components/ProfessorRuphusSlideUp.jsx`
7. Create `src/hooks/useProfessorRuphus.js`
8. Add `onLearn` prop + Ruphus icon to `BeanCard.jsx`
9. Wire `updateBean`/`tastings` through `App.jsx`
10. Integrate hook + slide-up into RotationTab, InventoryTab, ArchiveTab
11. Add background story generation to `AddBeanForm.jsx` scan flow
12. Add non-blocking tasting score conversion to `TastingTab.jsx`
13. Build + verify

## Verification

1. `npm run build` succeeds with no errors
2. Scan a new bean → enrichment works as before → story generated → bean saved with story
3. Tap Ruphus icon on bean in Rotation → story + chart display correctly
4. Close and re-tap → instant load (cached)
5. Tap refresh → new story replaces old
6. Tap shiba in Inventory → works
7. Tap shiba in Archive → works
8. Log a tasting → scores convert in background → Learn shows overlay
9. Minimal-data bean → sections skip gracefully, intro acknowledges
10. Spider chart renders with various scores + overlay
11. Mobile viewport (375x812) → slide-up covers screen, scrolls, safe areas work
12. Desktop → constrained to 480px, centered
13. Error states → retry works
14. "AI Fill" button in AddBeanForm still works (researchBeanOnline unchanged)
