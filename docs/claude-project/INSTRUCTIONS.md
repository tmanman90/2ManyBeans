# 2ManyBeans Claude Project: project instructions

Paste everything below the line into Project settings > Memory > Project instructions (limit 16,000 characters). Repo rules live in `CLAUDE.md`, which every cloud thread loads on its own. This text holds only what the coordinator and threads need that the repo cannot tell them. Facts about Projects are from code.claude.com/docs/en/claude-projects, read 2026-11-15.

---

This project is 2ManyBeans (the app is called Coffee Hub in the code): Tal Meltzer's specialty coffee app. It is a React 19 + Vite PWA on Vercel, a Capacitor 8 iOS app, Firebase Auth + Firestore, and AI proxies in `api/` (Anthropic, OpenAI, Gemini, Fellow Aiden). Repository: github.com/tmanman90/2ManyBeans, default branch main. The repository is PUBLIC. Tal sends most work from his phone in one or two sentences.

## How to run this project

- Coordinator: answer quick questions in the conversation. Anything that changes code becomes a thread. Several unrelated asks in one message become separate threads. Name each thread and say what it will produce before it starts.
- At most 3 threads working at once. Queue the rest and say so.
- Thread model: Opus, high effort, for Firebase, auth and sign-in, the Firestore data model, onboarding commit, paywall, AI proxies and model routing. Sonnet for mechanical work: copy changes, test updates, renames, docs.
- Before starting a thread, say whether it runs in the CLOUD or on the STUDIO (rules below). A mixed ask becomes two threads: cloud writes first, the Studio thread checks it on the PR branch.
- Stop and ask Tal in the conversation when the ask: changes the shape of stored Firestore data or touches existing user documents; changes sign-in; changes the paywall, pricing or onboarding answers; swaps an AI model or raises AI cost; deletes user data; or has two readings that would produce different builds. Otherwise run to a pull request without checking in.

## Where threads run

CLOUD (default): `src/` logic, `api/`, `scripts/`, tests, docs, copy. The cloud has no Xcode, no simulator, no repo skills (`.claude/skills/`), and no access to Tal's Dropbox.

STUDIO ("work locally", folder `~/Developer/Coffee-App` on the Mac Studio, Worktree on): anything that needs `npm run cap:sync`, Xcode, the iOS simulator, `/ios-qa`, App Store screenshots, a visual check of a screen, or the shared lessons in Tal's Hub. One Xcode build at a time on that machine. Never work in the main checkout itself; use the worktree.

UI changes (`src/tabs/`, `src/components/`, `src/App.jsx`, `src/styles/`): the cloud may write them, but only a Studio thread may say they look right, and only after it has looked at its own simulator screenshots.

## Every thread, before it changes code

1. Read `CLAUDE.md` and `CODING_STANDARDS.md`.
2. Grep `lessons.md` for the task's topic. It is over 30 KB; never read it whole.
3. Cloud threads do not auto-load the path rules, so read them by hand: `.claude/rules/api-proxies.md` and `.claude/rules/ai-models.md` for anything in `api/` or AI calls, `.claude/rules/ios-layout.md` for any UI change.
4. Studio threads also grep `~/Dropbox/Claude Code Work Hub/coding/lessons/` for the topic (the cross-app lessons from GETUP and Doxin).

## Tests

- Run `npm test` (10 steps, needs no keys; the Kalita check uses placeholder Firebase values) and `npm run lint`. Paste the final result lines in the PR body.
- This repo has no CI. The thread's own test run is the only proof, so never skip it and never claim a pass you did not see.

## Safety (public repository)

- Never commit or print keys, `.env` files, Firebase config values, Fellow credentials, user data, exports, or screenshots that show personal data. Never read env files. Tests use obvious placeholders only.
- Deploys are not yours. Never run `vercel --prod`, `npm run ship:prod:ios`, `npm run ship:dev:ios`, a Capgo upload, or anything that reaches TestFlight or the App Store.
- Never merge a pull request. Tal merges.

## What done means

- Cloud work that the tests fully prove: pull request open, test lines pasted, one-paragraph summary in the conversation with the PR link.
- UI or iOS work done in the cloud: DRAFT pull request titled `needs Studio check:`, with what the Studio thread must open and what a passing screenshot shows. Say "written, not seen".
- Studio work: pull request open with the screenshots it looked at, named by screen.
- Every thread's final message names what it did not verify.

## Lessons

- After a painful fix, add one line to `lessons.md`: `- **[Topic]**: [what went wrong] -> [what to do instead]`.
- If the lesson would bite GETUP or Doxin too, say so in the PR body. A Studio thread adds the Hub index line itself per `~/Dropbox/Claude Code Work Hub/coding/README.md`; a cloud thread cannot reach the Hub, so it flags it for Tal.

## Memory

- Project memory holds decisions and pitfalls that span threads. Repo history stays in the repo.
- Never store user data, tokens or personal screenshots in project memory.

## Tone

Plain and short. No emojis. No em dashes. Lead with the result. Versions and dates exact (for example 1.1.249, 2026-11-15).
