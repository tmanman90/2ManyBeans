# Coffee Hub — Product Requirements Document

## Overview

Coffee Hub is a specialty coffee inventory and tasting tracker for enthusiasts who buy high-end light roast beans and manage freshness across multiple canisters. It tracks bean freshness using research-backed peak timing windows, manages a rotation system across 3 Fellow Atmos vacuum canisters, logs AI-guided tastings, and provides smart recommendations for what to open next.

## User Context

- Primary user (**Tal**) is a specialty coffee enthusiast buying high-end light roast beans, primarily from Apollon's Gold and Nordic/Japanese roasters
- **Novice taster** — knows what he likes but is actively learning to identify and articulate flavors
- All AI interactions should be **coaching-oriented**: teach vocabulary in context, provide scaffolded options, never assume expertise
- The app should feel like having a knowledgeable friend guiding you, not a clinical tool
- Should support sharing with friends (they get their own account with empty state)

---

## Data Model

### Bean
```typescript
interface Bean {
  id: string;              // e.g. "ag-sanjose-1"
  roaster: string;         // e.g. "Apollon's Gold"
  name: string;            // e.g. "San Jose"
  origin: string;          // e.g. "Nicaragua" or "Ethiopia (Nyeri)"
  variety: string;         // e.g. "Pacamara", "Geisha", "Heirloom"
  process: string;         // e.g. "Washed", "Natural", "Anaerobic Honey"
  roastDate: string;       // ISO date "2025-12-01"
  bagSize: number;         // grams, typically 100 or 200
  status: "ACTIVE" | "SEALED" | "FINISHED";
  atmosSlot: number | null; // 1, 2, or 3 when active
  openDate: string | null;
  finishDate: string | null;
  bagNotes: string;         // flavor descriptors from bag label
  producer: string;         // farm/producer name
  degasMin: number;         // days (from roaster profile)
  degasMax: number;
  peakStart: number;        // days post-roast when peak begins
  peakEnd: number;          // days post-roast when peak ends
  guidance: string;         // human-readable timing string
  createdAt: timestamp;
  updatedAt: timestamp;
}
```

### Tasting
```typescript
interface Tasting {
  id: string;
  beanId: string;          // references Bean.id
  date: string;            // ISO date
  aroma: string;
  firstSip: string;
  acidity: string;
  sweetness: string;
  body: string;
  finish: string;
  oneWord: string;         // single-word summary
  rating: number | null;   // 1-5 stars
  notes: string;
  changeTomorrow: string;  // brew adjustment for next time
  createdAt: timestamp;
  updatedAt: timestamp;
}
```

### Roaster Profile
```typescript
interface RoasterProfile {
  degasMin: number;
  degasMax: number;
  peakStart: number;
  peakEnd: number;
  category: string;       // e.g. "Nordic/Ultra-Light", "Specialty Light"
  guidance: string;
}
```

---

## Roaster Profiles (Research-Backed)

Timing windows sourced from roaster websites, Reddit, and specialty coffee forums:

| Roaster | Category | Degas | Peak Window |
|---------|----------|-------|-------------|
| **Apollon's Gold** | Apollon's Gold | 35-45d | 60-90d |
| **Koppi, La Cabra, Coffee Collective, Drop Coffee, Tim Wendelboe, Prodigal** | Nordic/Ultra-Light | 10-14d | 21-60d |
| **Dayglow, SEY, Onyx, Wonderstate, Leaves (Tokyo), Momos Coffee** | Specialty Light | 7-14d | 14-60d |
| **Default (unknown roasters)** | Specialty Light | 7-14d | 14-60d |

Auto-detection: fuzzy-match roaster name against known profiles. Unknown roasters get default.

---

## Peak Status Logic

Based on `daysSinceRoast(roastDate)`:

| Condition | Label | Color |
|-----------|-------|-------|
| `days < degasMin` | "Degassing" | Purple |
| `days >= degasMin && days < peakStart` | "Resting" | Amber |
| `days >= peakStart && days <= peakEnd` | "Peak NN%" | Green |
| `days > peakEnd && overDays <= 14` | "Fading" | Amber |
| `days > peakEnd && overDays <= 30` | "Past Peak" | Red |
| `days > peakEnd && overDays > 30` | "Stale" | Red |

Peak percentage: `((days - peakStart) / (peakEnd - peakStart)) * 100`

---

## Features by Tab

### 1. Rotation Tab (Home)
- Shows 3 Fellow Atmos canister slots
- Each active bean displays: roaster, name, origin, variety, process, peak status badge, days post-roast, days open, bag notes
- **"What should I open next?" button** → AI Recommendations:
  - Scores sealed beans (see scoring below)
  - Returns top 3 recommendations as numbered cards
  - Claude API generates 2-4 sentence flowing paragraph explaining why each fits
  - "Open This Bean" button per recommendation → slot picker if multiple empty slots
- Canister management: open bean (assigns to slot), finish bean (moves to archive)

### 2. Inventory Tab
- Lists all SEALED beans sorted by peak urgency
- Each card: roaster, name, origin, variety, process, bag size, peak status, days post-roast
- "Open" button → slot selection flow

### 3. Tasting Tab
Three modes: **list** | **form** | **chat**

**List mode:**
- Sorted by date (recent first) or rating (top rated) via toggle
- Cards show: bean name, date, one-word summary, star rating, notes preview
- **Inline star editing**: tap stars on cards to update
- **Full edit mode**: pencil icon expands into editable form

**Form mode:**
- Standard form with all tasting fields
- Bean selector (active beans only)
- 5-star interactive rating
- Save adds to tasting list

**Chat mode (guided tasting — coach style):**
- Step-by-step AI coaching for a novice taster
- NEVER asks vague "how is it?" questions — always gives specific instructions + multiple-choice options
- Teaches vocabulary by labeling what user describes ("That funky smell? Classic natural process fermentation!")
- Guided flow: Aroma → First Sip → Body & Finish → Sweetness → One Word → Brew Dial-in
- Brew dial-in is diagnostic: "Was it (a) too sour, (b) too bitter, (c) too weak, (d) pretty good?" → prescribes fix
- Opening message provides emoji-labeled categories to pick from
- Ends with `---EXTRACT--- / JSON / ---END---` for structured data extraction
- Review panel with editable stars before saving

### 4. Chat Tab
- General coffee assistant with full inventory context
- System prompt includes: active rotation, sealed inventory, finished beans, recent tastings
- Can answer questions about rotation, what to brew, inventory status
- Scrollable message history with auto-scroll

### 5. Archive Tab
- Lists FINISHED beans with roaster, name, origin, finish date, tasting ratings

---

## AI Features

All use `claude-sonnet-4-20250514` via Anthropic API.

### 1. Photo-Based Bean Entry
- Camera/photo picker → base64 image to Claude API
- Extracts: roaster, name, origin, variety, process, roast date, bag size, tasting notes, producer
- Returns JSON, populates review form before saving
- Handles partial extractions gracefully

### 2. Recommendation Engine
- Scoring algorithm selects top 3 sealed beans:
```
+100  in peak window
+80   Fading (1-14d past peak)
+50   Past Peak (15-30d past peak)
+30   variety bonus (different roaster than active beans)
+20   in second half of peak window (urgency)
+15   larger bag (200g+)
+10   fully degassed
```
- Claude generates warm, opinionated 2-4 sentence paragraph analyzing the picks
- System prompt: "concise specialty coffee advisor" — no bullets, flowing prose

### 3. Guided Tasting Chat (Coach Mode)
- Multi-turn (3-4 exchanges), novice-friendly
- Always provides physical instructions and scaffolded multiple-choice options
- Teaches vocabulary in context
- Brew dial-in uses diagnostic → prescriptive fix
- Structured extraction via regex: `/---EXTRACT---\s*([\s\S]*?)\s*---END---/`

### 4. General Chat Assistant
- Full inventory context injected each message
- System prompt: "You are Tal's coffee assistant" with live data
- Never suggests finished or already-opened beans

---

## Design Language

### Color Palette
```javascript
const C = {
  bg: "#FAF6F1",        cream: "#FFF8F0",     card: "#FFFFFF",
  text: "#2C1810",       textMuted: "#8B7B6F", textLight: "#A89888",
  accent: "#8B5E3C",     accentLight: "#C49A6C", accentDark: "#5C3D2E",
  border: "#E8DDD3",     borderLight: "#F0E8DF",
  green: "#4A7C59",      greenBg: "#EDF5F0",
  amber: "#B8860B",      amberBg: "#FDF6E3",
  red: "#A0522D",        redBg: "#FDF0EB",
  purple: "#6B5B95",     purpleBg: "#F0EDF5",
};
```

### Typography
- Title: DM Serif Display (serif)
- Body: System font stack
- Warm, minimal, paper-like aesthetic

### UI Patterns
- Bottom tab bar with 5 tabs (icons from lucide-react)
- Cards: rounded corners (12px), subtle shadows
- Status badges: colored pills with background tint
- Interactive star ratings (tap to set)
- Modal overlays for add bean form
- Inline editing with accent border highlight
- Safe area insets for iPhone notch/home bar

---

## Architecture — PWA + Firebase

### Firebase Schema
```
firestore/
├── users/{uid}/
│   ├── profile                 # { displayName, email, createdAt, settings }
│   ├── beans/{beanId}          # One doc per bean (all Bean fields)
│   └── tastings/{tastingId}    # One doc per tasting (all Tasting fields)
```

Security rules: users can only read/write their own subcollections.

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

### useAppData Hook (Firestore)
- `onSnapshot` listeners for real-time sync (replaces `window.storage`)
- Beans and tastings are separate collections (not one JSON blob)
- Individual document updates (not full-state rewrites)
- Firestore offline persistence for instant local reads

### Auth Flow
1. App loads → check Firebase auth state
2. Not signed in → sign-in screen (Google primary, email/password secondary)
3. Signed in → subscribe to user's Firestore data
4. First-time: offer seed data import (Tal) or start empty (friends)

### Claude API Key
- **Phase 1**: Client-side key in env vars (fine for personal/friends)
- **Phase 2**: Vercel Edge Function proxy if user base grows

### PWA Config
```json
{
  "name": "Coffee Hub",
  "short_name": "Coffee Hub",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#FAF6F1",
  "theme_color": "#8B5E3C"
}
```
- Service worker for offline caching
- iOS: `apple-touch-icon`, `viewport-fit=cover`, safe area env() vars

### Deployment
- Vercel free tier, auto-deploys from GitHub
- `vercel` CLI to deploy

---

## Bean Lifecycle Flows

### Adding a Bean
1. Tap "+" FAB → photo step (camera/gallery)
2. Claude API scans label → pre-fills form
3. User reviews/edits → roaster profile auto-detected
4. Save → bean added as SEALED

### Opening a Bean
1. Tap "Open" on sealed bean
2. Multiple empty slots → inline "Which canister?" picker
3. One empty slot → opens directly
4. Sets: `status: ACTIVE`, `atmosSlot: N`, `openDate: today()`

### Finishing a Bean
1. Tap "Finish" on active bean
2. Sets: `status: FINISHED`, `atmosSlot: null`, `finishDate: today()`

---

## Tal's Current Inventory (Seed Data)

### Active Rotation
1. **Atmos #1**: Apollon's Gold — San Jose (Nicaragua, Pacamara, Natural) — roasted Dec 1, opened Feb 11
2. **Atmos #2**: Apollon's Gold — El Triangulo (Honduras, Geisha, Washed) — roasted Dec 7, opened Feb 18
3. **Atmos #3**: Empty

### Sealed (13 bags)
- Apollon's Gold: San Jose (extra), Mulish, Arbegona, Chelbesa Natural, San Isidro Labrador, El Injerto
- Prodigal: Finca San Antonio
- Leaves (Tokyo): Kenya Gichathaini AA
- Dayglow: Cafén, El Placer (Promethium collab)
- Koppi: Finca La Fuente
- Momos Coffee: Ethiopia Wessi Tima

### Finished (8 bags)
Santa Teresa 2000, Wadi Jannat, Elora, Chelchele, Santa Ana, Las Delicias Geisha, Layampata, Rareglow

---

## Migration Checklist

- [ ] Scaffold Vite + React project
- [ ] Set up Firebase project (Auth + Firestore)
- [ ] Implement `useAuth` hook (Google sign-in)
- [ ] Implement `useAppData` hook (Firestore real-time sync)
- [ ] Port color palette and theme
- [ ] Port peak status + roaster profile logic
- [ ] Port recommendation scoring
- [ ] Build RotationTab (canisters + recs)
- [ ] Build InventoryTab
- [ ] Build TastingTab (list/form/chat modes)
- [ ] Build ChatTab
- [ ] Build ArchiveTab
- [ ] Build AddBeanForm (photo scan flow)
- [ ] Port all Claude API prompts
- [ ] Add PWA manifest + service worker
- [ ] Seed data import for Tal's account
- [ ] Deploy to Vercel
- [ ] Test cross-device sync
- [ ] Test iOS add-to-home-screen

## Future Enhancements (Not MVP)
- Push notifications when beans enter peak window
- Share a bean or tasting with a friend
- Capacitor wrapper for App Store distribution
- Brew timer integration
- Bean purchase tracking / wish list
- Roaster discovery feed
