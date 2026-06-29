---
name: "source-command-ship"
description: "Ship Coffee Hub to production. Vercel prod + Capgo production channel (all TestFlight users)."
---

# source-command-ship

Use this skill when the user asks to run the migrated source command `ship`.

## Command Template

Execute the `deploy` skill from `.claude/skills/deploy.md`.

This is a PRODUCTION deploy. It will:
1. Bump the patch version in `package.json` and `package-lock.json`
2. Build the web bundle and push to Vercel production (`https://2manybeans.vercel.app`)
3. Build the iOS bundle and push to Capgo `production` channel using the bumped version (all TestFlight users)

Follow the steps in `.claude/skills/deploy.md` exactly.
