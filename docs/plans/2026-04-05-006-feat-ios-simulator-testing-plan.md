---
title: Autonomous iOS QA - Simulator Testing with Autoresearch Loop
type: feat
status: completed
date: 2026-04-05
revised: 2026-04-05
---

# Autonomous iOS QA for Coffee Hub

## Context

Coffee Hub has zero automated testing. All verification is manual: build, deploy to Capgo, open the app, tap around. Research on Claude Code iOS testing (last30days, 2026-04-05) revealed mature tools that can automate the build-launch-screenshot-verify loop. But a passive "screenshot and report" approach barely improves on manual testing.

This plan applies Karpathy's autoresearch pattern to create an **autonomous QA agent** that builds the app, tests it on the iOS simulator, diagnoses failures, attempts fixes, and retests in a loop. The agent scores each run against a binary checklist, commits improvements, reverts regressions, and escalates to the human only when stuck.

## Problem Statement

1. **No verification during development.** /ce:work implements PRD tasks but never proves the app actually works on iOS until manual testing after deploy.
2. **Visual bugs slip through.** Safe area violations, layout breaks, blank screens, and console errors are only caught when Tal opens the app on his phone.
3. **Debugging is reactive.** Bugs are found in production, then debugged backwards. The loop should be: change code, verify immediately, fix if broken.

## Architecture: The Autoresearch Loop Applied to iOS QA

### The Three Elements (from Karpathy)

| Autoresearch | iOS QA |
|---|---|
| **Recipe** (thing being improved) | App source code (`src/`) |
| **Cooking** (running it) | Build Capacitor app, launch on iOS simulator, tap through all tabs |
| **Tasting** (scoring) | Binary checklist scored against screenshots + console logs |

### The Binary Scoring Checklist

5 yes/no questions. Each scores 1 or 0. Perfect = 5/5.

1. **App launches?** -- Simulator shows app content within 10 seconds (not crash screen, not white screen)
2. **All tabs render?** -- Each of the 5 tabs (Rotation, Inventory, Tasting, Chat, Archive) shows content when tapped (not blank, not error boundary)
3. **Zero JS exceptions?** -- Console log capture contains no unhandled errors or red-level warnings
4. **Taps register?** -- Screenshot changes after tapping each tab (proves interactivity, not a frozen frame)
5. **Safe areas respected?** -- No content overlaps status bar area or home indicator zone (visible in screenshots)

**Pass threshold:** 5/5. Any score below 5 triggers the fix loop.

### The Loop

```
1. Build + launch on simulator
2. Tap through all 5 tabs, screenshot each, capture console
3. Score against checklist (5 binary questions)
4. Score = 5/5? --> DONE. Report success.
5. Score < 5/5? --> Read screenshots + console, diagnose the failure
6. Attempt ONE targeted fix (smallest change that addresses the failing check)
7. git stash the fix (isolate it)
8. Rebuild + retest
9. Score improved or maintained? --> git stash pop + commit
   Score dropped? --> git stash drop (revert)
10. Repeat from step 1 (max 5 iterations)
11. Still failing after 5 attempts? --> ESCALATE with full diagnostic
```

**Key constraints (from Karpathy):**
- ONE change at a time (isolates what helped)
- Fixed evaluation (same 5 checks every run, no moving goalposts)
- Automatic retain/revert (commit on improvement, reset on regression)
- Results log persists across runs (the changelog compounds)

---

## Phase 0: Install XcodeBuildMCP (~5 min)

**One tool only.** Validate it works with WKWebView before adding anything else.

### 0.1 Install globally
```bash
npm install -g xcodebuildmcp@latest
```

### 0.2 Init the CLI skill into the project
```bash
cd "/Users/talmeltzer/Documents/VIBE CODING/Coffee-App-Build"
npx xcodebuildmcp@latest init --client claude --skill cli --force
```

Creates `.claude/skills/xcodebuildmcp-cli/SKILL.md` -- auto-detected by Claude Code.

### 0.3 Validate WKWebView visibility (CRITICAL)

This is the key unknown. Boot the simulator, build the app, and run:
```bash
xcodebuildmcp ui-automation snapshot-ui --simulator BACAE04F-AD70-4E56-AE21-71D60F4793E0
```

**If snapshot-ui shows individual web elements** (buttons, labels, text nodes): accessibility-based tapping will work. Proceed with `tap --label`.

**If snapshot-ui shows only a single WKWebView element**: the DOM is opaque to the native accessibility tree. Fallback to coordinate-based tapping + screenshot analysis. This changes how the QA skill navigates but doesn't block the approach.

**Do not install ios-simulator-skill or any other tool until this test is done.** The result determines the navigation strategy for the entire skill.

### 0.4 Update permissions

**File:** `.claude/settings.local.json`

Add to `permissions.allow`:
```json
"Bash(xcodebuildmcp:*)",
"Bash(xcrun simctl:*)",
"Bash(source ~/.nvm/nvm.sh && nvm use 22:*)"
```

---

## Phase 1: Add aria-labels to Tab Bar (~2 min)

**File:** `src/App.jsx:185`

The tab bar buttons have no `aria-label`. Add `aria-label={t.label}` to the `<button>` in the `.map()` callback. Values: "Rotation", "Inventory", "Tasting", "Chat", "Archive".

Single-line change. Zero visual impact. Required for accessibility-based tapping AND improves actual app accessibility.

---

## Phase 2: Create /ios-qa Skill -- The Autonomous Loop (~15 min)

**New file:** `.claude/skills/ios-qa.md`

User-invocable skill with two modes:

### Mode 1: `/ios-qa` (autonomous -- the autoresearch loop)

**When to use:** After /ce:work completes UI tasks, or anytime you want to verify + auto-fix.

**Behavior:**
1. Build: `source ~/.nvm/nvm.sh && nvm use 22 && npm run build:ios && npx cap sync ios`
2. Boot simulator: `xcodebuildmcp simulator-management boot --udid BACAE04F-AD70-4E56-AE21-71D60F4793E0`
3. Build and run: `xcodebuildmcp simulator build-and-run --project ios/App/App.xcodeproj --scheme App --simulator BACAE04F-...`
4. Wait for launch (5s), then run the 5-check scoring loop:
   - Screenshot launch state (check 1: app launches)
   - Tap each tab, screenshot after each (checks 2 + 4: renders + taps register)
   - Capture console logs (check 3: zero JS exceptions)
   - Analyze screenshots for safe area violations (check 5)
5. Score: count passing checks out of 5
6. If 5/5: report success, done
7. If <5/5: diagnose from screenshots + console, attempt ONE fix, rebuild, rescore
8. Retain fix if score improved/maintained, revert if score dropped
9. Repeat (max 5 iterations)
10. If still failing: escalate with full diagnostic report

**Diagnostic report on escalation (after 5 failed attempts):**
```
## iOS QA Escalation

Score: X/5 after 5 fix attempts

### Failing Checks
- [ ] Check N: [description of what failed]
  Screenshot: [inline screenshot]
  Console: [relevant error lines]

### Fixes Attempted
1. [what was tried] -- [result: helped/hurt/no change]
2. [what was tried] -- [result]
...

### Recommended Next Step
[Agent's best guess at what a human should investigate]
```

**Results log:** Append each run's results to `.claude/ios-qa-log.md`:
```
## Run [date] [time]
- Trigger: [manual | post-ce:work | pre-deploy]
- Score: X/5
- Checks: [1:pass 2:pass 3:fail 4:pass 5:pass]
- Fix attempts: N
- Changes committed: [list or "none"]
- Duration: Ns
```

This log compounds. Over time it reveals patterns: which checks fail most, which fixes work, which parts of the app are fragile.

### Mode 2: `/ios-screenshot` (passive -- quick look)

**When to use:** Pre-deploy sanity check, or when you just want to see the current state without auto-fixing.

**Behavior:**
1. Build + launch (same as above)
2. Screenshot all 5 tabs
3. Report screenshots + console errors
4. **Do NOT attempt fixes. Do NOT modify code.**

This is the "read-only" mode. Fast, non-destructive, for when you want eyes on the app without the agent touching code.

---

## Phase 3: Wire into Workflow (~5 min)

### 3.1 During /ce:work (the big change)

**This is the most important integration point.** The current /ce:work flow is: implement task, commit, move to next task. No verification.

Add to CLAUDE.md:
```markdown
## Testing
- **iOS QA**: `/ios-qa` -- autonomous build-test-fix loop (Karpathy autoresearch pattern)
- **iOS Screenshot**: `/ios-screenshot` -- passive screenshot of all 5 tabs, no code changes
- **Browser Test**: `/test-browser` -- Playwright web testing on localhost
- After completing any /ce:work task that touches files in `src/tabs/`, `src/components/`, `src/App.jsx`, or `styles/`: run `/ios-qa` before moving to the next task
- The QA skill auto-fixes and commits improvements. If it can't fix after 5 attempts, it escalates.
```

**How this changes /ce:work in practice:**
- /ce:work implements Task 1.1 (Apple Sign-In) and commits
- Claude sees the task touched `src/components/SignInScreen.jsx` (UI file)
- Claude runs `/ios-qa` automatically
- QA agent builds, launches, tests. If sign-in screen renders correctly: 5/5, moves on.
- If layout is broken: QA agent diagnoses, fixes, retests, commits the fix.
- /ce:work moves to Task 1.2

This catches bugs at the point of creation, not after 15 tasks have piled up.

### 3.2 During /ce:review (already supported)

/ce:review already offers optional iOS testing. With `/ios-qa` in CLAUDE.md, Claude will offer it after review. No skill changes needed.

### 3.3 Before /deploy (optional gate)

**File:** `.claude/skills/deploy.md`

Add before Step 1:
```markdown
### 0. Pre-deploy QA (if requested)
If user says "deploy with test", "test then deploy", or "test and ship":
- Run `/ios-screenshot` (passive mode, not autonomous fixes)
- If any check fails: warn and ask to proceed or abort
- Default (no test mentioned): skip straight to deploy
```

Use `/ios-screenshot` (passive) here, not `/ios-qa` (autonomous). You don't want the deploy skill auto-modifying code right before shipping. Pre-deploy is a gate check, not a fix cycle.

---

## Phase 4: Results Log and Compounding (~3 min)

**New file:** `.claude/ios-qa-log.md` (created automatically by the skill on first run)

The results log is the Karpathy changelog. It's the most valuable artifact because it compounds:
- After 10 runs: you know which tabs break most often
- After 20 runs: you know which fix patterns work
- After 50 runs: a new Claude session can read the log and already know the app's fragile spots

**Structure:**
```markdown
# iOS QA Results Log

## Summary
- Total runs: N
- Average score: X/5
- Most common failure: Check N ([description])
- Most effective fix pattern: [description]

## Runs
[newest first, appended by the skill]
```

The summary section gets recompiled periodically (every 10 runs, or on request). This is the Karpathy compile method applied to QA data.

---

## Deferred: Advanced Capabilities

Only pursue after the base loop is working:

| Capability | Tool | When to Add |
|---|---|---|
| Visual regression diffs (compare screenshots across runs) | ios-simulator-skill `visual_diff.py` | After 10+ successful runs create a baseline |
| Accessibility audit (WCAG compliance) | ios-simulator-skill `accessibility_audit.py` | Before App Store submission |
| E2E flow testing (onboarding, add bean, tasting) | Maestro YAML flows | After consumer launch (Phase 1 of master plan) |
| Computer Use fallback | Claude built-in | Only if WKWebView is fully opaque to XcodeBuildMCP |
| Cross-device testing (iPhone SE, iPad, Pro Max) | Multiple simulator UDIDs | After launch, for screen-size regression |

---

## Key Risk: WKWebView Accessibility (Unchanged)

Capacitor renders inside WKWebView. Whether XcodeBuildMCP's `snapshot-ui` can see individual DOM elements is unknown until Phase 0.3. Two paths:

**Path A (elements visible):** Tap by aria-label. Reliable, semantic, resilient to layout changes.

**Path B (WKWebView is opaque):** Coordinate-based tapping using known screen geometry (iPhone 16 Pro: 393x852pt). Tab bar is at bottom, 5 evenly spaced buttons. Less resilient but functional. Screenshots still work regardless.

**The scoring checklist works identically either way.** Only the navigation method changes.

---

## Auth on Fresh Simulator

First run on a clean simulator hits the Google sign-in wall. This requires one-time human interaction:
1. QA skill detects auth screen (screenshot shows sign-in buttons, not app content)
2. Reports: "First-run auth required. Please sign in on the simulator, then run `/ios-qa` again."
3. After first sign-in, Firebase persists the session across app reinstalls on the same simulator.

Subsequent runs skip auth entirely.

---

## Verification Plan

1. **Phase 0**: `xcodebuildmcp --help` works. `snapshot-ui` runs on booted simulator. Determine Path A or B.
2. **Phase 1**: After adding aria-labels, `snapshot-ui` shows labeled tab buttons (if Path A).
3. **Phase 2**: Run `/ios-qa` manually. Confirm it builds, launches, screenshots all 5 tabs, scores 5/5 (or diagnoses and attempts fixes).
4. **Phase 3**: Run `/ce:work` on a small task touching a UI file. Confirm Claude offers `/ios-qa` after the task.
5. **Phase 4**: Check `.claude/ios-qa-log.md` exists and has a run entry.

---

## Files Modified/Created

| File | Action |
|---|---|
| `.claude/skills/xcodebuildmcp-cli/SKILL.md` | Created by `xcodebuildmcp init` |
| `.claude/skills/ios-qa.md` | **New** -- autonomous QA skill (core deliverable) |
| `.claude/ios-qa-log.md` | **New** -- results log (created by skill on first run) |
| `src/App.jsx` | **Edit** line 185 -- add `aria-label={t.label}` to tab buttons |
| `.claude/settings.local.json` | **Edit** -- add xcodebuildmcp + simctl permissions |
| `CLAUDE.md` | **Edit** -- add Testing section with workflow integration rules |
| `.claude/skills/deploy.md` | **Edit** -- add optional pre-deploy screenshot gate |

**Total estimated time: ~30 minutes**
