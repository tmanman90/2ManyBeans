---
name: deploy-preview
description: Deploy Coffee Hub to a preview/dev-only channel — Vercel preview URL (web) + Capgo dev channel (iOS). Use when user says /deploy-preview, "deploy preview", "deploy to dev", "push to dev channel", "test deploy", "preview deploy". This does NOT affect production users.
user_invocable: true
---

# Deploy Coffee Hub to Dev

Deploy to dev-only channels so Tal can test new features without touching production users.

## Steps

Run from the project directory `/Users/talmeltzer/Documents/VIBE CODING/Coffee-App-Build`:

### 1. Build and deploy web preview (Vercel)
```bash
cd "/Users/talmeltzer/Documents/VIBE CODING/Coffee-App-Build" && npm run build && npx vercel 2>&1
```
(Note: no `--prod` flag — this creates a preview URL, not production.)

Report the preview URL back to Tal. He can open it on his phone's Safari.

### 2. Build and push iOS OTA to the DEV APP (Capgo)
IMPORTANT: The dev app is a SEPARATE app from production. Tal's phone has the
"2manybeans Dev" app whose bundle id is `com.talmeltzer.coffeehub.dev` — a
distinct Capgo app from production's `com.talmeltzer.coffeehub`. You MUST:
- build with the dev variant (`npm run build:ios:dev`, sets `TMB_APP_VARIANT=dev`),
  because the web build itself differs by variant (see vite.config.js), and
- upload to the Capgo app `com.talmeltzer.coffeehub.dev`.
Uploading to `com.talmeltzer.coffeehub` will NOT reach the dev app.

Dev deploys do not bump the package version, but they must use a unique dev bundle label so repeated dev deploys do not collide in Capgo:

```bash
cd "/Users/talmeltzer/Documents/VIBE CODING/Coffee-App-Build" && VERSION=$(node -p "require('./package.json').version") && DEV_BUNDLE="${VERSION}-devapp.$(date -u +%Y%m%d%H%M%S)" && npm run build:ios:dev && npx @capgo/cli@latest bundle upload com.talmeltzer.coffeehub.dev --path ./dist --channel dev --bundle "$DEV_BUNDLE" 2>&1
```
Report the bundle version and upload status.

Confirm the dev channel pointer:

```bash
cd "/Users/talmeltzer/Documents/VIBE CODING/Coffee-App-Build" && npx @capgo/cli@latest channel currentBundle dev com.talmeltzer.coffeehub.dev
```

### 3. Summary
After both complete, report:
- Web preview: <preview URL from Vercel>
- iOS: OTA bundle pushed to Capgo `dev` channel
- Reminder: Only devices assigned to the `dev` channel will pull this bundle. Production users are unaffected.
- If Tal's phone isn't on the `dev` channel yet, tell him: "Go to https://web.capgo.app → Devices → find your iPhone → set channel to `dev`. One-time setup."

### Error handling
- If Vercel deploy fails, still attempt Capgo push (and vice versa)
- If Capgo upload fails with auth error, remind user to check `~/.capgo` API key
- Report any failures clearly

### Options
- If user says "deploy-preview web only" or "vercel only", skip step 2
- If user says "deploy-preview ios only" or "capgo only", skip step 1
- Do NOT bump the version number for dev deploys (keeps production version clean)
