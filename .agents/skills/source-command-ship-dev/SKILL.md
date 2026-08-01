---
name: source-command-ship-dev
description: Ship Coffee Hub to dev-only. Use when the user says /ship-dev, ship-dev, deploy preview, deploy to dev, push to dev channel, test deploy, preview deploy, Vercel preview, or Capgo dev. Creates a Vercel preview URL and uploads the iOS bundle to Capgo channel dev for Tal's assigned device only; production users are not affected.
---

# source-command-ship-dev

Deploy Coffee Hub to dev-only channels so Tal can test new features without touching production users.

Run from `/Users/talmeltzer/Documents/VIBE CODING/Coffee-App-Build`.

## Safety Rules

- Treat this as a dev-only deploy.
- Do not pass `--prod` to Vercel.
- Do not bump `package.json`, `package-lock.json`, or any app version number.
- Do use a unique timestamped dev bundle label, based on the current package version, for every Capgo dev upload.
- Do not push to the Capgo production channel.
- Production users are not affected.

The actual development app is `com.talmeltzer.coffeehub.dev` (display name
`2manybeans Dev`). The production app is `com.talmeltzer.coffeehub`; never
upload a dev OTA to that app's `dev` channel. The Capgo `dev` channel is
intended for devices assigned to dev.

## Options

- If the user says web only, Vercel only, or preview only, skip the Capgo step.
- If the user says iOS only, Capgo only, or dev channel only, skip the Vercel step.
- Otherwise run both steps.

## Workflow

1. Check the working tree with `git status --short` and mention whether unrelated dirty files are present. Do not revert or clean unrelated files.
2. Deploy the web preview unless skipped:

```bash
npm run build && npx vercel 2>&1
```

Capture and report the unique Vercel preview URL. Because this is dev-only, do not use `--prod`.

3. Upload the iOS OTA bundle to Capgo dev unless skipped:

```bash
npm run ship:dev:ios 2>&1
```

This guarded command locks the app id to `com.talmeltzer.coffeehub.dev`, runs
`scripts/patch-social-login.mjs` before the build, uses the `-devapp` version
lineage, passes `--fail-on-incompatible`, and verifies the final channel
pointer. It also fails closed when the six `VITE_FIREBASE_*` client variables
are missing, preventing an OTA bundle with an invalid Firebase config from
being uploaded. Do not replace it with a raw upload command.

Confirm the dev channel pointer:

```bash
npx @capgo/cli@latest channel currentBundle dev com.talmeltzer.coffeehub.dev
```

Capgo may return `push_update_disabled` after a successful upload because push
notifications are disabled for this app. Treat the upload plus pointer
verification as authoritative in that case; do not retry against the
production app id.

4. If one deploy target fails, still attempt the other target unless the user asked for only the failed target.

## Error Handling

- If Vercel deploy fails, report the failure and still attempt Capgo if in scope.
- If Capgo upload fails with an auth error, tell the user to check the `~/.capgo` API key.
- If Tal's phone is not receiving dev bundles, tell him: "Go to https://web.capgo.app -> Devices -> find your iPhone -> set channel to `dev`. One-time setup."

## Final Report

Report:

- Web preview: the Vercel preview URL, or skipped/failed with the key error.
- iOS: Capgo `dev` upload status, or skipped/failed with the key error.
- Reminder: only devices assigned to the `dev` channel pull this bundle; production users are unaffected.
