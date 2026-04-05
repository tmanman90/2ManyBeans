---
title: "refactor: Optimize project folder structure"
type: refactor
status: completed
date: 2026-03-22
---

# refactor: Optimize Project Folder Structure

## Overview

The Coffee Hub project root has accumulated clutter: 7 untracked feature PRDs, xlsx analysis files, a `generated_imgs/` directory, a `data resources/` folder with a space in its name, and a tracked `.env.local.pulled` file with expired Vercel tokens. The `src/` internals are clean and well-organized. This plan restructures the root for long-term maintainability without touching `src/` or breaking the Vercel deployment.

## Problem Statement

Root directory has 15+ non-essential files mixing with config and source directories. Agent docs (`lessons.md`, `session-start.md`) and reference files (`coffee-app.jsx`) sit alongside PRDs, data files, and generated images. The `.gitignore` has gaps that could lead to accidental credential commits. CLAUDE.md is out of date with the actual project state.

## Proposed Solution

Three-phase cleanup: security fix first, then folder restructure, then documentation updates.

## Technical Approach

### Phase 1: Security & Gitignore Fix (Standalone Commit)

**Priority: Do this first, independent of everything else.**

- [ ] `git rm --cached .env.local.pulled` to stop tracking the file
- [ ] Replace fragmented `.env` patterns in `.gitignore` with a comprehensive approach:

```gitignore
# Environment (catch-all, then whitelist example)
.env*
!.env.example
```

This covers `.env`, `.env.local`, `.env.local.pulled`, `.env.vercel`, and any future `.env.anything` files.

- [ ] Update `.env.example` to include ALL required env vars:

```
# Firebase (client-side, prefixed VITE_)
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=

# AI API Keys (server-side only, used by api/ proxies)
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GEMINI_API_KEY=

# Fellow Aiden (optional)
FELLOW_EMAIL=
FELLOW_PASSWORD=
```

**Files changed:** `.gitignore`, `.env.example`
**Files removed from tracking:** `.env.local.pulled`

### Phase 2: Folder Restructure (Single Commit)

Move files into organized directories. Execute all moves in one commit so the repo is never half-migrated.

#### New directory structure

```
docs/
  prds/               # Feature PRDs (historical planning docs)
  data/               # Data files, analysis outputs, notes
  plans/              # Implementation plans (like this one)
```

#### Moves

| From (root) | To | Rationale |
|---|---|---|
| `aiden-prompt-fix-prd.md` | `docs/prds/` | Feature PRD |
| `finish-bag-rating-prd.md` | `docs/prds/` | Feature PRD |
| `freeze-bean-prd.md` | `docs/prds/` | Feature PRD |
| `multi-model-prd.md` | `docs/prds/` | Feature PRD |
| `prd to fix the algo.md` | `docs/prds/prd-to-fix-the-algo.md` | Feature PRD (fix space in filename) |
| `professor-ruphus-prd.md` | `docs/prds/` | Feature PRD |
| `tasting-coach-prd.md` | `docs/prds/` | Feature PRD |
| `aiden-ab-test-results.xlsx` | `docs/data/` | Analysis output |
| `aiden-ab-test-results-v2.xlsx` | `docs/data/` | Analysis output |
| `data resources/Aiden Profiles.xlsx` | `docs/data/aiden-profiles.xlsx` | Data file (fix space in name) |
| `data resources/Tal Notes.txt` | DELETE (0 bytes) | Empty file, no value |

After moving contents, remove the empty `data resources/` directory.

#### Gitignore additions

```gitignore
# AI-generated images (not used by app)
generated_imgs/
```

#### Files that STAY at root

| File | Why |
|---|---|
| `CLAUDE.md` | Agent convention: must be at project root |
| `PRD.md` | Main product spec, referenced by CLAUDE.md |
| `lessons.md` | Read every session by agent, bare-name references in CLAUDE.md. Moving adds maintenance cost for marginal cleanup benefit. |
| `session-start.md` | Same as lessons.md |
| `coffee-app.jsx` | 78KB reference prototype. Referenced in CLAUDE.md and session-start.md by bare name. Moving breaks agent workflows. |
| `api/` | Vercel serverless convention, must be at root |
| `scripts/` | Utility scripts, already organized |

**Decision: `lessons.md`, `session-start.md`, and `coffee-app.jsx` stay at root.** The cost of updating every agent reference (CLAUDE.md x3 locations, session-start.md x2 locations) and the risk of agents failing to find them outweighs the cleanliness of moving 3 small files.

#### Script updates

Update hardcoded output paths in Python scripts if they reference root-level xlsx locations:

- [ ] `scripts/make-ab-xlsx.py` ~line 160: update output path to `docs/data/`
- [ ] `scripts/make-ab-xlsx-v2.py` ~line 131: update output path to `docs/data/`

**Files changed:** 2 Python scripts
**Files moved:** 9 PRDs + 2 xlsx + 1 data file
**Directories created:** `docs/prds/`, `docs/data/`
**Directories removed:** `data resources/`

### Phase 3: Documentation Updates (Same Commit as Phase 2)

#### CLAUDE.md updates

- [ ] Add `docs/` to the Project Structure section:

```
docs/
  prds/               # Feature PRDs (planning docs, not committed every time)
  data/               # Data files, analysis results
  plans/              # Implementation plans
```

- [ ] Update the "Reference Files" section to mention `docs/prds/` for feature PRDs
- [ ] Add `api/aiden.js` to the Project Structure (currently missing, but exists and is configured in vercel.json)
- [ ] Update the API proxies description: "Four API proxies" (not three): `/api/claude`, `/api/openai`, `/api/gemini`, `/api/aiden`
- [ ] Update Environment Variables to add `OPENAI_API_KEY` and `GEMINI_API_KEY` to the list

#### session-start.md updates

- [ ] Add `docs/prds/` to reference material section so agent knows where to find feature specs

## Post-restructure Result

```
Coffee App Build /
├── CLAUDE.md                    # Agent instructions
├── PRD.md                       # Main product spec
├── lessons.md                   # Debugging lessons (agent reads at session start)
├── session-start.md             # Session checklist (agent reads at session start)
├── coffee-app.jsx               # Reference prototype
├── package.json
├── package-lock.json
├── vite.config.js
├── vercel.json
├── firebase.json
├── firestore.rules
├── firestore.indexes.json
├── index.html
├── .env.example                 # All env vars documented
├── .gitignore                   # Comprehensive .env* coverage
├── api/                         # Vercel serverless functions
│   ├── aiden.js
│   ├── claude.js
│   ├── gemini.js
│   └── openai.js
├── src/                         # App source (unchanged)
│   ├── main.jsx
│   ├── App.jsx
│   ├── firebase.js
│   ├── components/
│   ├── hooks/
│   ├── lib/
│   ├── styles/
│   └── tabs/
├── public/                      # Static assets (unchanged)
│   ├── images/
│   └── ...
├── docs/
│   ├── prds/                    # Feature PRDs
│   ├── data/                    # Data files & analysis
│   └── plans/                   # Implementation plans
├── scripts/                     # Utility scripts
└── generated_imgs/              # (gitignored) AI-generated images
```

## Acceptance Criteria

- [ ] `.env.local.pulled` removed from git tracking
- [ ] `.env.vercel` cannot be accidentally committed
- [ ] `.env.example` lists all 9 env vars
- [ ] Zero PRD files at project root (except `PRD.md`)
- [ ] Zero xlsx files at project root
- [ ] `data resources/` directory eliminated
- [ ] `generated_imgs/` gitignored
- [ ] `npm run build` succeeds after restructure
- [ ] `vercel dev` starts without errors
- [ ] CLAUDE.md project structure matches reality
- [ ] All existing `src/` imports unaffected (no relative path changes)

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Vercel build breaks after moves | Very low | No moved files are imported by source code or referenced by build config. Verify with `npm run build`. |
| Agent can't find lessons.md / session-start.md | None | Keeping them at root. No path changes needed. |
| Git history hard to follow after moves | Low | `git log --follow` tracks file renames. Single commit keeps history clean. |
| Python scripts write to old paths | Medium | Update hardcoded paths in Phase 2. |

## Sources & References

- Research: `~/Documents/Last30Days/claude-folder-structure-iphone-app-skills.md` (2026-03-22)
- Key insight from research: "keep your CLAUDE.md short, most people stuff everything in there" and "less is more with folder structure"
- Vercel serverless convention: `api/` must be at project root
- Current CLAUDE.md project structure section
