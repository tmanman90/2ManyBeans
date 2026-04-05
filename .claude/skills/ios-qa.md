---
name: ios-qa
description: "Autonomous iOS QA agent for Coffee Hub. Two modes: /ios-qa (autoresearch loop: build, test, diagnose, fix, retest) and /ios-screenshot (passive: build, screenshot all tabs, report). Use when user says /ios-qa, /ios-screenshot, 'test on simulator', 'test iOS', 'smoke test', or after /ce:work tasks that touch UI files."
user_invocable: true
---

# iOS QA for Coffee Hub

Autonomous QA agent that builds Coffee Hub on the iOS simulator, tests all 5 tabs, and either reports findings or auto-fixes issues using the Karpathy autoresearch loop.

## Two Modes

**`/ios-qa`** -- Autonomous mode. Build, test, diagnose, fix, retest. Commits improvements, reverts regressions. Escalates after 5 failed fix attempts.

**`/ios-screenshot`** -- Passive mode. Build, screenshot all 5 tabs, report. No code changes. Use for pre-deploy checks or quick visual verification.

Parse the user's input to determine mode. Default to `/ios-qa` unless they explicitly ask for screenshots only.

## Prerequisites

- XcodeBuildMCP CLI installed (`xcodebuildmcp --help`)
- Xcode 16+ with command-line tools
- Node 22 via nvm (for Capacitor 8 CLI)

## The Binary Scoring Checklist

5 yes/no questions. Each scores 1 or 0. Perfect = 5/5.

| # | Check | How to Verify |
|---|-------|---------------|
| 1 | **App launches** | Simulator shows app content within 10s (not crash, not white screen) |
| 2 | **All tabs render** | Each of 5 tabs shows content when tapped (not blank, not error boundary) |
| 3 | **Zero JS exceptions** | Console log capture has no unhandled errors or red-level warnings |
| 4 | **Taps register** | Screenshot changes after tapping each tab (proves interactivity) |
| 5 | **Safe areas respected** | No content overlaps status bar or home indicator zone |

**Pass threshold:** 5/5. Any score below 5 triggers the fix loop (in /ios-qa mode) or a warning (in /ios-screenshot mode).

## Step 1: Build the Capacitor iOS App

Run from project root:
```bash
source ~/.nvm/nvm.sh && nvm use 22 && cd "/Users/talmeltzer/Documents/VIBE CODING/Coffee-App-Build" && npm run build:ios && npx cap sync ios
```

This runs `CAPACITOR_BUILD=true vite build` (no service worker) then copies dist/ into ios/App/App/public/.

**If build fails:** Report the error with the full build output. Stop. Do not attempt simulator steps.

## Step 2: Boot the Simulator

```bash
xcodebuildmcp simulator-management boot --simulator-id BACAE04F-AD70-4E56-AE21-71D60F4793E0
```

This is iPhone 16 Pro, iOS 18.6. If already booted, this is a no-op.

## Step 3: Build and Run on Simulator

```bash
xcodebuildmcp simulator build-and-run --project-path "/Users/talmeltzer/Documents/VIBE CODING/Coffee-App-Build/ios/App/App.xcodeproj" --scheme "App" --simulator-id BACAE04F-AD70-4E56-AE21-71D60F4793E0
```

**Bundle ID:** `com.talmeltzer.coffeehub`

Note: Use `--project-path` (not `--project`), `--simulator-id` (not `--udid` or `--simulator`).

**If build fails:** Capture the xcodebuild error output. In /ios-qa mode, attempt to fix the build error (common: signing, missing file, syntax error). In /ios-screenshot mode, report and stop.

## Step 4: Wait for Launch + Start Log Capture

```bash
sleep 5
xcodebuildmcp logging start-simulator-log-capture --simulator-id BACAE04F-AD70-4E56-AE21-71D60F4793E0 --bundle-id com.talmeltzer.coffeehub
```

## Step 5: Take Initial Screenshot + Auth Check

```bash
xcodebuildmcp simulator screenshot --simulator-id BACAE04F-AD70-4E56-AE21-71D60F4793E0 --return-format path
```

Read the screenshot to check for auth wall. If the screen shows Google sign-in, "Sign in with Apple", or any auth UI instead of app content, report:

> "First-run auth required. Please sign in on the simulator manually, then run /ios-qa again."

Stop gracefully. Do not attempt to automate auth.

**WKWebView is opaque** (confirmed 2026-04-05): `snapshot-ui` only sees the top-level Application element with zero children. All navigation uses coordinate-based tapping. Do NOT attempt `tap --label` -- it will not work with Capacitor's WKWebView.

## Step 6: Navigate and Screenshot Each Tab

The app uses a fixed bottom tab bar with 5 evenly spaced tabs. On iPhone 16 Pro (402x874 screen points in simulator):

**Tab bar Y coordinate:** ~842 (bottom of screen, above home indicator)
**Tab X coordinates** (center of each tab icon, evenly spaced across 402pt width):

| Tab | X | Y |
|-----|---|---|
| Rotation | 40 | 842 |
| Inventory | 121 | 842 |
| Tasting | 201 | 842 |
| Chat | 281 | 842 |
| Archive | 362 | 842 |

For each tab:
```bash
xcodebuildmcp ui-automation tap --simulator-id BACAE04F-AD70-4E56-AE21-71D60F4793E0 --x [X] --y [Y]
sleep 2
xcodebuildmcp simulator screenshot --simulator-id BACAE04F-AD70-4E56-AE21-71D60F4793E0 --return-format path
```

Read each screenshot after taking it. Assess against checklist items 1, 2, 4, and 5.

**If coordinates are wrong** (taps don't register, wrong tab selected): Take a screenshot, visually identify the tab bar position, and recalculate coordinates. The tab bar has circular icons with labels underneath.

## Step 7: Capture Console Logs

```bash
xcodebuildmcp logging stop-simulator-log-capture --simulator-id BACAE04F-AD70-4E56-AE21-71D60F4793E0
```

Review for: unhandled JS exceptions, WKWebView errors, network failures, crash reports. This covers checklist item 3.

## Step 8: Score

Count passing checks. Report in this format:

```
## iOS QA Score: X/5

| # | Check | Result |
|---|-------|--------|
| 1 | App launches | PASS/FAIL |
| 2 | All tabs render | PASS/FAIL -- [which tabs failed] |
| 3 | Zero JS exceptions | PASS/FAIL -- [N errors found] |
| 4 | Taps register | PASS/FAIL -- [which tabs unresponsive] |
| 5 | Safe areas respected | PASS/FAIL -- [which screens have overlap] |
```

## Step 9: The Fix Loop (/ios-qa mode ONLY)

**Skip this step entirely in /ios-screenshot mode.** Just report the score and stop.

If score < 5/5:

1. **Diagnose:** Read the failing screenshot(s) and console logs. Identify the root cause.
2. **Fix:** Make ONE targeted change to address the most critical failing check. Smallest change possible.
3. **Isolate:** Stage the fix with `git add` but don't commit yet.
4. **Retest:** Go back to Step 1 (rebuild, relaunch, re-score).
5. **Evaluate:**
   - Score improved or maintained? Commit: `git commit -m "fix(ios-qa): [what was fixed]"`
   - Score dropped? Revert: `git checkout -- [changed files]`
6. **Repeat** from Step 1 (max 5 iterations total).

**After 5 failed iterations, escalate:**

```
## iOS QA Escalation

Score: X/5 after 5 fix attempts

### Failing Checks
- [ ] Check N: [description]
  Screenshot: [reference the qa-*.png file]
  Console: [relevant error lines]

### Fixes Attempted
1. [what was tried] -- [result: helped/hurt/no change]
2. [what was tried] -- [result]

### Recommended Next Step
[Best guess at what needs human investigation]
```

## Step 10: Log Results

Append to `.claude/ios-qa-log.md` (create if it doesn't exist):

```markdown
## Run YYYY-MM-DD HH:MM
- **Trigger:** [manual | post-ce:work | pre-deploy]
- **Score:** X/5
- **Checks:** [1:pass 2:pass 3:fail 4:pass 5:pass]
- **Fix attempts:** N
- **Changes committed:** [list of commits or "none"]
- **Duration:** Ns
- **Navigation:** [Path A (labels) | Path B (coordinates)]
- **Notes:** [any observations]
```

## Cleanup

Do NOT shut down the simulator after a run. Keeping it booted saves 30+ seconds on the next test. Only shut down if the user explicitly asks.

## Important Notes

- **Auth:** The app requires Google sign-in. First run on a fresh simulator needs manual sign-in. Firebase persists the session after that.
- **ios/ is gitignored:** Rebuilt every time by `cap sync`. Never commit anything from ios/.
- **Node version:** Always use `nvm use 22` for Capacitor 8 CLI commands. The project default is Node 20.
- **Other terminal:** If /ce:work is running in another terminal on the same branch, DO NOT run /ios-qa simultaneously. Wait for the other terminal to finish or use a different branch.
- **XcodeBuildMCP discovery:** When a command doesn't work as expected, always try `xcodebuildmcp <workflow> <tool> --help` to discover the correct arguments rather than guessing.
