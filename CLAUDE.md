# Coffee Hub

Personal specialty coffee inventory + tasting tracker. PWA hosted on Vercel with Firebase backend.

## Agent Behavior Rules

### Planning
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately — don't keep pushing
- Write clear specs upfront to reduce ambiguity

### Execution
- Use subagents for research, exploration, and parallel analysis to keep the main context clean
- For complex problems, throw more compute at it via subagents. One task per subagent.
- Make every change as simple as possible. Touch minimal code.
- Find root causes. No temporary fixes. No over-engineering.
- Changes should only affect what's necessary.

### Verification
- Never mark a task complete without proving it works
- Run tests, check logs, demonstrate correctness
- Ask yourself: "Would a staff engineer approve this?"
- If a fix feels hacky, step back and implement the cleaner solution

### Self-Improvement
- After ANY correction: update `lessons.md` in this project folder
- Format: `- **[Topic]**: [What went wrong] → [What to do instead]`
- Review `session-start.md` and `lessons.md` at the start of each session

### Principles
- **Simplicity First**: Make every change as simple as possible
- **No Laziness**: Find root causes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary

## Tech Stack
- React 18 + Vite
- Firebase Auth (Google sign-in) + Firestore (real-time sync)
- Anthropic Claude API (claude-sonnet-4-20250514) for AI features
- PWA with service worker for add-to-home-screen

## Project Structure
```
src/
  main.jsx              # Entry, Firebase init, auth gate
  App.jsx               # Tab shell
  firebase.js           # Firebase config
  hooks/useAuth.js      # Auth state
  hooks/useAppData.js   # Firestore CRUD (beans + tastings)
  tabs/                 # RotationTab, InventoryTab, TastingTab, ChatTab, ArchiveTab
  components/           # StarRating, AddBeanForm, Badge, SlotPicker, AidenModal
  lib/peakStatus.js     # Peak window calculations
  lib/roasterProfiles.js
  lib/recommendations.js
  lib/claude.js         # Claude API helpers
  lib/aiden.js          # Aiden brew profile: researchBean() + generateAidenRecipe() + pushToAiden()
  styles/theme.js       # Color palette
```

## Key Conventions
- All dates are ISO strings (`"2026-02-21"`)
- Bean statuses: `ACTIVE` | `SEALED` | `FINISHED`
- Atmos slots are 1, 2, or 3 (Fellow Atmos vacuum canisters)
- Roaster profiles auto-detected by fuzzy name match, fallback to default specialty light profile
- AI features: photo bean scanning, guided tasting (coach mode), recommendations, general chat, Aiden brew profiles
- Aiden brew flow uses two-step Claude calls: (1) researchBean() enriches with altitude/roast level/closest reference profiles, (2) generateAidenRecipe() generates JSON profile using research context. Research failure falls back gracefully to recipe-only.
- Tasting chat uses `---EXTRACT---` / `---END---` markers for structured data extraction from conversation
- The user (Tal) is a novice taster — all AI tasting interactions must use step-by-step coaching with scaffolded options, never vague open-ended questions

## Reference Files
- **`PRD.md`** — Full product spec: data model, all features, Firebase schema, architecture, UI/design details
- **`coffee-app.jsx`** — Working React prototype with all features implemented (reference implementation for all UI and logic)

## Environment Variables
```
VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID,
VITE_FIREBASE_STORAGE_BUCKET, VITE_FIREBASE_MESSAGING_SENDER_ID, VITE_FIREBASE_APP_ID,
VITE_ANTHROPIC_API_KEY
```

## Deploy
Vercel from GitHub. `vercel` CLI to deploy. PWA via manifest.json + service worker.
