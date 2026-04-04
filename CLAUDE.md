# Coffee Hub

Personal specialty coffee inventory + tasting tracker. PWA hosted on Vercel with Firebase backend.

## Project-Specific Notes
- **CLAUDE.md**: Update when project structure, conventions, or tech stack change
- **lessons.md**: Add a bullet after any painful debugging session or gotcha
- **PRD.md**: Update only when feature specs actually change
- Don't update MDs for routine changes. Keep files concise.

## Tech Stack
- React 19 + Vite + Capacitor 8 (iOS native app)
- Multi-model AI architecture:
  - Anthropic Claude Sonnet 4.6 — tasting coach, general chat
  - OpenAI GPT-5.4 — Professor Ruphus stories, Aiden brew recipes
  - OpenAI GPT-5.4 Mini — tasting score extraction
  - Google Gemini 2.5 Flash — bean photo scanning, web search enrichment (with Reddit), chat image analysis
- Firebase Auth (Google sign-in) + Firestore (real-time sync)
- PWA with service worker for web, Capacitor for iOS native
- Native plugins: Camera, Haptics, StatusBar, Keyboard, SplashScreen

## Project Structure
```
api/
  aiden.js              # Fellow Aiden brew profile proxy (GPT-5.4)
  claude.js             # Anthropic proxy (Sonnet 4.6 → Haiku 4.5 fallback)
  gemini.js             # Google proxy (Gemini 2.5 Flash + search grounding)
  openai.js             # OpenAI proxy (GPT-5.4 → Mini fallback)
docs/
  prds/                 # Feature PRDs (planning docs)
  data/                 # Data files, analysis results
  plans/                # Implementation plans
src/
  main.jsx              # Entry, Firebase init, auth gate
  App.jsx               # Tab shell
  firebase.js           # Firebase config
  hooks/useAuth.js      # Auth state
  hooks/useAppData.js   # Firestore CRUD (beans + tastings)
  tabs/                 # RotationTab, InventoryTab, TastingTab, ChatTab, ArchiveTab
  components/           # StarRating, AddBeanForm, Badge, SlotPicker, AidenModal, ProfessorRuphusSlideUp, SpiderChart
  lib/peakStatus.js     # Peak window calculations
  lib/roasterProfiles.js
  lib/recommendations.js
  lib/claude.js         # Claude API helpers — tasting coach + chat (client-side retry + friendly errors)
  lib/gemini.js         # Gemini API helpers — bean scanning + web search enrichment + image description
  lib/openai.js         # OpenAI API helpers — client-side retry + friendly errors
  lib/professorRuphus.js # Professor Ruphus story generation (GPT-5.4) + tasting score conversion (GPT-5.4 Mini)
  lib/aiden.js          # Aiden brew profile (GPT-5.4): researchBean() + generateAidenRecipe() + pushToAiden()
  styles/theme.js       # Color palette
```

## Assets
- All images go in `public/images/` — nav icons, illustrations, canister art, etc.
- App icons (favicon, PWA) go in `public/` — `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`, `favicon.ico`
- Never save generated images to other directories. Move them to the correct location immediately.

## Key Conventions
- All dates are ISO strings (`"2026-02-21"`)
- Bean statuses: `ACTIVE` | `SEALED` | `FINISHED`
- Atmos slots are 1, 2, or 3 (Fellow Atmos vacuum canisters)
- Roaster profiles auto-detected by fuzzy name match, fallback to default specialty light profile
- AI features: photo bean scanning (multi-photo + web research), guided tasting (coach mode), recommendations, general chat, Aiden brew profiles
- Add Bean flow: multi-photo gallery (1-3) → Gemini 2.5 Flash vision scan → Gemini search grounding enrichment (includes Reddit) → review. Alt path: manual entry → AI Fill button triggers same research.
- Bean data model includes enriched fields: altitude, region, farm, roastLevel, cupScore, brewingRec, sourcedBy (all optional, filled by scan + research)
- Four API proxies: `/api/claude` (Anthropic), `/api/openai` (OpenAI), `/api/gemini` (Google), `/api/aiden` (Fellow Aiden). Each has retry logic, error forwarding, and model fallback.
- `/api/claude` proxy: Sonnet 4.6 primary, Haiku 4.5 fallback on 429/529. Client-side `callClaude` retries with exponential backoff.
- `/api/openai` proxy: GPT-5.4 primary, GPT-5.4 Mini fallback. Supports `responseFormat` for structured output.
- `/api/gemini` proxy: Gemini 2.5 Flash. Supports `tools: [{ googleSearchRetrieval: {} }]` for search grounding.
- Aiden brew flow uses two-step GPT-5.4 calls with family-first classification: (1) researchBean() enriches with altitude/roast level/cup-structure family/closest reference profiles, (2) generateAidenRecipe() generates JSON profile using family baseline defaults + research context. Research failure falls back gracefully.
- Chat image routing: images in chat are sent to Gemini for vision analysis, then the text description is passed to Claude for conversational response.
- Tasting chat uses `---EXTRACT---` / `---END---` markers for structured data extraction from conversation
- The user (Tal) is a novice taster — all AI tasting interactions must use step-by-step coaching with scaffolded options, never vague open-ended questions

## Reference Files
- **`PRD.md`** — Full product spec: data model, all features, Firebase schema, architecture, UI/design details
- **`coffee-app.jsx`** — Working React prototype with all features implemented (reference implementation for all UI and logic)
- **`docs/prds/`** — Feature PRDs (historical planning docs for individual features)

## Environment Variables
```
VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID,
VITE_FIREBASE_STORAGE_BUCKET, VITE_FIREBASE_MESSAGING_SENDER_ID, VITE_FIREBASE_APP_ID,
ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY,
FELLOW_EMAIL, FELLOW_PASSWORD
```

## Deploy
- **Web**: Vercel from GitHub. `vercel` CLI to deploy. PWA via manifest.json + service worker.
- **iOS**: `npm run cap:sync` builds for native, `npm run cap:open` opens Xcode. `ios/` is gitignored (regenerated by cap sync).

## Build Commands
- `npm run build` — web build (with PWA service worker)
- `npm run build:ios` — native build (no service worker, sets `CAPACITOR_BUILD=true`)
- `npm run cap:sync` — build + sync to Capacitor iOS project
- `npm run cap:open` — open iOS project in Xcode

## Platform Branching
- Runtime detection via `Capacitor.isNativePlatform()` from `@capacitor/core`
- API URLs: relative on web, absolute (`https://2manybeans.vercel.app`) on native (see `src/lib/apiBase.js`)
- Auth: `signInWithPopup` on web, `@codetrix-studio/capacitor-google-auth` + `signInWithCredential` on native
- Firestore: `persistentMultipleTabManager` on web, `persistentSingleTabManager` on native
- Camera: `<input type="file">` on web, `@capacitor/camera` plugin on native
- Haptics: no-op on web, `@capacitor/haptics` on native (see `src/lib/haptics.js`)
