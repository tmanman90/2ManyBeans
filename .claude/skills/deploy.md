---
name: deploy
description: Deploy Coffee Hub to both web (Vercel) and iOS (Capgo OTA). Use when user says /deploy, "deploy the app", "push to production", "update both apps", "ship it", or "deploy to web and iOS".
user_invocable: true
---

# Deploy Coffee Hub

Deploy the Coffee Hub app to both platforms in one command.

## Steps

Run these commands sequentially from the project directory `/Users/talmeltzer/Documents/VIBE CODING/Coffee App Build `:

### 0. Pre-deploy QA (optional)
If user says "deploy with test", "test then deploy", or "test and ship":
- Run `/ios-screenshot` (passive mode, screenshots only, no code changes)
- If any check fails: warn user with the score and failing checks, ask to proceed or abort
- If 5/5: proceed to deploy
- Default (no test mentioned): skip straight to Step 1

### 1. Build and deploy web (Vercel)
```bash
cd "/Users/talmeltzer/Documents/VIBE CODING/Coffee App Build " && npm run build && npx vercel --prod 2>&1
```
Report the Vercel deployment URL.

### 2. Build and push iOS OTA (Capgo)
```bash
cd "/Users/talmeltzer/Documents/VIBE CODING/Coffee-App-Build" && npm run ship:prod:ios 2>&1
```
The guarded command requires the six Firebase `VITE_` variables, requires the
package patch version to advance the production channel, rejects native
incompatibility, and verifies the final production channel pointer. Load the
managed production environment into the shell before running it; never use a
raw Capgo upload for production.

### 3. Summary
After both complete, report:
- Web: deployed to https://2manybeans.vercel.app
- iOS: OTA bundle pushed to Capgo production channel
- Note: iOS users will get the update on next app launch (background download, apply on reopen)

### Error handling
- If Vercel deploy fails, still attempt Capgo push (and vice versa)
- If Capgo upload fails with auth error, remind user to check `~/.capgo` API key
- Report any failures clearly

### Options
- If user says "deploy web only" or "deploy vercel only", skip step 2
- If user says "deploy ios only" or "deploy capgo only", skip step 1
- If user says "deploy and bump", increment the patch version in package.json before deploying
