---
name: ios-qa
description: "PRD-driven iOS QA agent. Reads acceptance criteria from a plan, builds the app on simulator, then visually navigates and tests each criterion using screenshot analysis. Use when user says /ios-qa, 'test this phase', 'test the PRD', 'verify on simulator', 'test phase 3', or after /ce:work on a PRD phase."
user_invocable: true
---

# iOS QA: PRD-Driven Simulator Testing

Test what you just built by reading the acceptance criteria from your PRD and verifying each one on the iOS simulator. Navigate by analyzing screenshots, not hardcoded coordinates.

## How It Works

1. You tell it what to test: a PRD phase, a specific feature, or a freeform description
2. It reads the acceptance criteria from the plan doc
3. It classifies each criterion as **UI-testable** (can verify on simulator) or **code-only** (needs code review, not visual testing)
4. It builds and launches the app on the simulator
5. For each UI-testable criterion: navigates to the right screen by reading screenshots, performs the test actions, takes a screenshot of the result, scores pass/fail
6. Reports results with screenshots for each criterion

## Input Parsing

Parse the user's input to determine what to test:

- `/ios-qa phase 3` or `/ios-qa test phase 3` -- find the plan doc, extract Phase N acceptance criteria
- `/ios-qa test the hand brew feature` -- freeform: navigate and test that specific feature
- `/ios-qa` (no args) -- ask: "Which phase or feature should I test?"
- `/ios-qa docs/plans/some-plan.md phase 2` -- read that specific plan file, test Phase 2
- `/ios-screenshot` -- passive mode: just build, screenshot all 5 tabs, report. No feature testing.

**Default plan location:** `docs/plans/2026-04-04-005-feat-consumer-launch-master-plan.md`

## Step 1: Extract Test Criteria

Read the plan doc and find `#### Phase N Acceptance Criteria` followed by checkbox items.

**Classify each criterion:**

- **UI-testable**: buttons appearing, modals displaying, screens rendering, user flows working, visual states, text content visible. Can be verified by navigating the simulator and reading screenshots.
- **Code-only**: internal architecture (file extraction, function refactoring), security rules, error handling internals, caching strategy, unmount guards, context/state management. Cannot be tested visually. Report as "skipped (code-level)".

**For freeform requests** ("test hand brew"): infer the test actions from the feature description. Navigate to the feature, interact with it, verify it works.

## Step 2: Build and Launch

```bash
source ~/.nvm/nvm.sh && nvm use 22 && cd "/Users/talmeltzer/Documents/VIBE CODING/Coffee-App-Build" && npm run build:ios && npx cap sync ios
```

Boot simulator (if not already booted) and build:
```bash
xcodebuildmcp simulator-management boot --simulator-id BACAE04F-AD70-4E56-AE21-71D60F4793E0
xcodebuildmcp simulator build-and-run --project-path "/Users/talmeltzer/Documents/VIBE CODING/Coffee-App-Build/ios/App/App.xcodeproj" --scheme "App" --simulator-id BACAE04F-AD70-4E56-AE21-71D60F4793E0
```

Wait for launch, start log capture:
```bash
sleep 5
xcodebuildmcp logging start-simulator-log-capture --simulator-id BACAE04F-AD70-4E56-AE21-71D60F4793E0 --bundle-id com.talmeltzer.coffeehub --capture-console
```

**IMPORTANT - Capgo override:** Capgo's auto-updater may swap your local build for a cached OTA bundle on launch. Check the console logs for `CapgoUpdater` messages. If it loads a different bundle version than what you just built, the test results won't reflect local code. To prevent this, either:
- Erase the simulator first: `xcrun simctl erase BACAE04F-AD70-4E56-AE21-71D60F4793E0` (requires re-auth)
- Or check the loaded bundle version in logs matches what you expect

**Auth check:** Take initial screenshot. If you see a sign-in screen, report: "Auth required. Sign in on the simulator, then run /ios-qa again." Stop.

## Step 3: Screenshot-Driven Navigation

**This is the core of the skill.** Navigate by SEEING, not by following a coordinate table.

For each UI-testable criterion:

1. **Plan the navigation path.** From the criterion, determine what screens you need and what actions to take.

2. **Take a screenshot.**
```bash
xcodebuildmcp simulator screenshot --simulator-id BACAE04F-AD70-4E56-AE21-71D60F4793E0 --return-format path
```

3. **Read the screenshot.** Analyze what's on screen: what tab you're on, what buttons/icons are visible, where they're positioned, what text is displayed.

4. **Decide what to tap.** Estimate coordinates from the screenshot's visual layout. Screen is 402x874 points.

5. **Tap it.**
```bash
xcodebuildmcp ui-automation tap --simulator-id BACAE04F-AD70-4E56-AE21-71D60F4793E0 --x [X] --y [Y]
```

6. **Wait and screenshot again.** Verify the tap worked.
```bash
sleep 2
xcodebuildmcp simulator screenshot --simulator-id BACAE04F-AD70-4E56-AE21-71D60F4793E0 --return-format path
```

7. **Repeat** until you've reached the screen/state needed to verify the criterion.

8. **Score the criterion.** Does the screenshot match what the acceptance criterion describes? PASS or FAIL with explanation.

**Navigation landmarks** (verified 2026-04-05, always re-verify by reading screenshot):
- **Tab bar** at bottom (~y=842): Rotation (~x=40), Inventory (~x=121), Tasting (~x=201), Chat (~x=281), Archive (~x=362)
- **Settings gear**: currently has a rendering issue on simulator (invisible icon). If you can't find it visually, read `src/App.jsx` to calculate position from the layout code, or skip criteria that require Settings navigation and note the blocker.

**Scrolling:**
```bash
xcodebuildmcp ui-automation swipe --simulator-id BACAE04F-AD70-4E56-AE21-71D60F4793E0 --start-x 201 --start-y 500 --end-x 201 --end-y 200
```

**Typing:**
```bash
xcodebuildmcp ui-automation type-text --simulator-id BACAE04F-AD70-4E56-AE21-71D60F4793E0 --text "your text here"
```

**Critical rules:**
- NEVER tap blind. Always screenshot first, read it, then decide where to tap.
- Be patient with modals that call AI (brew recipe generation takes 5-10s). Wait and re-screenshot if you see a loading state.
- If a tap doesn't work after 2 attempts, read the source code to calculate the element's position, then try again.
- WKWebView is opaque to accessibility. Do NOT use `tap --label`. Coordinate-based tapping only.

## Step 4: Score and Report

Stop log capture:
```bash
xcodebuildmcp logging stop-simulator-log-capture --log-session-id "[SESSION_ID]"
```

Check logs for JS exceptions. Then report:

```
## iOS QA Results: [Plan Name] - Phase N

**Device:** iPhone 16 Pro (iOS 18.6)
**Build:** [version from package.json]
**Date:** [today]

### UI-Testable Criteria

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| 1 | [criterion text] | PASS/FAIL | [what was seen in screenshot] |
| 2 | [criterion text] | PASS/FAIL | [what was seen] |

### Code-Only Criteria (not tested on simulator)

| # | Criterion | Why Skipped |
|---|-----------|-------------|
| 1 | [criterion text] | Internal architecture |

### Blockers (if any)
[e.g., "Settings gear not visible on simulator, could not test brew method toggle"]

### Console
- JS Exceptions: [count]
- Crashes: [count]

### Score: X/Y UI criteria passed, Z code-only skipped
```

## Step 5: Fix Loop (if failures found)

If any UI-testable criterion fails:

1. **Diagnose:** Read the screenshot and console. What specifically is wrong?
2. **Fix:** Make ONE targeted change. Smallest possible.
3. **Rebuild and retest** just the failing criterion.
4. Score improved? Commit: `git commit -m "fix(ios-qa): [what was fixed]"`
   Score dropped? Revert: `git checkout -- [changed files]`
5. Max 3 fix attempts per criterion, then escalate.

Skip the fix loop if user invoked `/ios-screenshot`.

## Step 6: Log Results

Append to `.Codex/ios-qa-log.md`:

```markdown
## Run YYYY-MM-DD HH:MM
- **Plan:** [plan file]
- **Phase:** N (or "freeform: [description]")
- **UI criteria tested:** X
- **Passed:** Y/X
- **Code-only skipped:** Z
- **Blockers:** [any navigation issues]
- **Console errors:** N
```

## Important Notes

- **Auth:** Google sign-in required on first simulator run. Firebase persists after that.
- **ios/ is gitignored:** Rebuilt every time by `cap sync`.
- **Node 22:** Always `nvm use 22` for Capacitor CLI.
- **Simulator stays booted:** Don't shut down after a run.
- **XcodeBuildMCP flags:** Use `--project-path` (not `--project`), `--simulator-id` (not `--udid`).
- **Bundle ID:** `com.talmeltzer.coffeehub`
- **Capgo:** Auto-updater may override local builds. Check console logs for loaded bundle version.
- **Known issue (2026-04-05):** Settings gear icon not visible on simulator. Investigate SettingsIcon SVG rendering or Capgo bundle version mismatch.
