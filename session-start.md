# Session Start Checklist

Run through this at the beginning of each session (mentally — don't execute steps that aren't needed).

## 1. Review Lessons
- Read `lessons.md` for project-specific gotchas accumulated during development

## 2. Check Current State
- What's been built so far? Check the project folder for source files, configs, and any build artifacts
- Review `CLAUDE.md` for the latest project spec and data model
- Ask the user if they're continuing previous work or starting fresh

## 3. Verify Infrastructure (only if the session needs it)

| Dependency | Health Check | When Needed |
|-----------|-------------|-------------|
| Anthropic API | Test via `vercel dev` → hit `/api/claude` | Any AI feature work (photo scan, tasting chat, recommendations) |
| Firebase | Check connection in browser console | Backend/sync work |
| Vercel | `vercel whoami` | Deploy work |
| Firebase rules | `firebase deploy --only firestore:rules` | After rules changes |

## 4. Quick Commands

```bash
# Local development (runs both Vite + serverless functions)
vercel dev

# Build check
npm run build

# Deploy
vercel --prod

# Firebase rules deploy
firebase deploy --only firestore:rules
```

## 5. Reference Material
- `coffee-app.jsx` — the complete React prototype, serves as the full feature spec
- `CLAUDE.md` — project brief with data model, business logic, design language, and seed data
- `PRD.md` — full product spec (note: prototype takes precedence where PRD is wrong)
- `docs/prds/` — feature PRDs for individual features (historical planning docs)
