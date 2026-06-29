---
description: Ship Coffee Hub to dev-only. Vercel preview URL + Capgo dev channel (only Tal's iPhone).
---

Execute the `deploy-preview` skill from `.claude/skills/deploy-preview.md`.

This is a DEV-ONLY deploy. It will:
1. Build the web bundle and push to Vercel as a preview (no `--prod` flag) → unique preview URL
2. Build the iOS bundle and push to Capgo `dev` channel → only devices assigned to `dev` (Tal's iPhone: `6739b956-7096-45b8-b0a7-76309c440c60`) will pull it

Production users are NOT affected.

Follow the steps in `.claude/skills/deploy-preview.md` exactly. Do NOT bump the version number; use a unique timestamped dev bundle label instead.
