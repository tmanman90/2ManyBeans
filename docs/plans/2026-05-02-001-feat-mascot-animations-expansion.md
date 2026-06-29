# Mascot Animation Expansion Plan

## Context
Professor Ruphus animations currently only appear in onboarding (13 screens) and the research loading screen. The rest of the app uses static images or plain text for empty states, loading, errors, and success moments. Expanding animated mascot usage to key touchpoints throughout the app will make it feel alive and polished, following the pattern established by Duolingo (Duo owl), Headspace, and Calm.

## Implementation Pattern (established)
All mascot videos follow the pattern documented in memory (`feedback_mascot_video_implementation.md`):
- MP4 with opaque background matching the screen color (white `#FFFFFF` or cream `#FAF6F1`)
- CSS radial gradient mask for edge feathering
- `env(safe-area-inset-top)` padding for Dynamic Island headroom
- `overflow: hidden` container, `objectFit: contain`, `objectPosition: center bottom`
- No overlay divs for blending
- Reference implementations: `MascotStage` (OnboardingPrimitives.jsx), `ResearchLoadingScreen.jsx`

## Video Assets Needed
New CapCut exports required (MP4, matching background color, under 5MB each):

| Animation | Use Case | Background Color |
|---|---|---|
| Ruphus waving/inviting | Empty states (encourages action) | `#FAF6F1` (C.bg) |
| Ruphus celebrating | Brew completion, finish bag, tasting saved | `#FAF6F1` |
| Ruphus thinking/pondering | Aiden recipe loading, hand brew loading | `#FAF6F1` |
| Ruphus confused/apologetic | Error states | `#FAF6F1` |

Some of these may already exist in the `REDOWNLOADED/NoBg` folder (e.g., `bowing.mp4`, `thinkin.mp4`). Check before re-exporting. Those have white backgrounds though, so may need re-export with `#FAF6F1` for main app screens.

## Tier 1: High Impact (do first)

### 1. Empty States (4 tabs)
Replace static images/text with animated Ruphus encouraging the user to take action.

**Files to modify:**
- `src/tabs/RotationTab.jsx` (~line 176) -- currently shows `/images/empty-rotation.webp`
- `src/tabs/InventoryTab.jsx` (~line 206) -- currently shows `/images/empty-rotation.webp`
- `src/tabs/ArchiveTab.jsx` (~lines 193-235, EmptyState function) -- text only
- `src/tabs/TastingTab.jsx` (~line 1498) -- text only ("No tastings yet")

**Approach:** Create a reusable `EmptyStateMascot` component (or just inline the video pattern) showing Ruphus waving with a friendly message below. Each tab gets a contextual message:
- Rotation: "Your rotation is empty. Scan a bag to get started."
- Inventory: "No sealed bags yet. Add your stash."
- Archive: "When you finish a bag, it lands here."
- Tasting: "No tastings yet. Brew something and let's taste."

**Video:** Ruphus waving/inviting gesture. Same video for all 4 empty states.

### 2. Brew Timer Completion
Add a brief Ruphus celebrating animation when a pour-over brew finishes.

**File:** `src/components/BrewTimer.jsx` (~lines 71-96, completion screen)
**Current:** Green checkmark with haptic feedback
**Change:** Show Ruphus celebrating for ~2 seconds, then transition to the existing checkmark/done UI. Not a replacement, an addition before or alongside.
**Video:** Ruphus celebrating

### 3. Tasting Chat Typing Indicator
Replace the animated dots with a small Ruphus animation during AI coach responses.

**File:** `src/tabs/TastingTab.jsx` (~lines 153-168, RuphusTyping component)
**Current:** Three animated dots
**Change:** Small (80-100px) Ruphus thinking/writing animation inline in the chat bubble area
**Video:** Ruphus thinking or writing (already have `ruphus-writing-notes.mp4` and `ruphus-thinking.mp4`)

## Tier 2: Polish

### 4. Aiden Recipe Loading
**File:** `src/components/AidenModal.jsx` (~lines 372-379)
**Current:** Coffee icon with CSS pulse animation
**Change:** Replace pulsing icon with small Ruphus thinking animation
**Video:** Ruphus thinking/pondering

### 5. Hand Brew Recipe Loading
**File:** `src/components/HandBrewModal.jsx`
**Current:** Text-based loading message ("Researching your bean..." / "Crafting your brew recipe...")
**Change:** Add small Ruphus animation above the loading text
**Video:** Ruphus thinking/pondering (same as Aiden)

### 6. Professor Ruphus Error State
**File:** `src/components/ProfessorRuphusSlideUp.jsx` (~lines 136-152)
**Current:** Static 64x64 circular image with 50% opacity
**Change:** Replace with animated confused/apologetic Ruphus
**Video:** Ruphus confused/apologetic

### 7. Finish Bag Celebration
**File:** `src/components/FinishBagPrompt.jsx`
**Current:** Modal with rating UI
**Change:** After user confirms "Finish the bag", brief Ruphus celebrating animation before closing
**Video:** Ruphus celebrating (same as brew timer)

## Not Prioritized
- Sign-in errors (too rare)
- Paywall errors (too rare)
- Subscription success (too brief, auto-closes)

## Verification
For each implementation:
1. `npm run build` passes
2. Deploy to dev, test on iPhone
3. Video loads without black background
4. No edge color mismatch (CSS mask working)
5. Video doesn't clip Dynamic Island
6. Animation feels natural, not intrusive (brief for celebrations, looping for loading/empty)
