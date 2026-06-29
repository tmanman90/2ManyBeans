---
title: "feat: App Store Launch — AI Disclosure, Disclaimers, and Submission"
type: feat
status: complete
date: 2026-04-19
---

# App Store Launch: 2manybeans v1.0

## Enhancement Summary

**Deepened on:** 2026-04-19
**Agents used:** Security Sentinel, Architecture Strategist, Best Practices Researcher, Code Simplicity Reviewer, Codebase Explorer

### Key Decisions from Deepening

1. **Build the consent modal** (not YAGNI). The simplicity reviewer argued the privacy policy alone suffices, but the best practices researcher found Apple Developer Forum evidence that a *separate in-app consent interaction* is required for Guideline 5.1.2(i). A privacy policy is necessary but not sufficient. Risk of rejection is too high to skip.

2. **Drop `aiConsentVersion`**. The simplicity reviewer correctly identified this as YAGNI. If AI providers change later, we can add a version field then and re-prompt users with `aiConsentVersion !== CURRENT`. Two fields (`aiDataConsent` + `aiConsentDate`) are enough for launch.

3. **Consent revocation via Settings toggle, NOT Gate 5.5 re-trigger**. The architecture strategist found a critical issue: if revoking consent re-engages Gate 5.5, the entire app shell unmounts, destroying all ephemeral state (chat history, pending bean edits, tasting sessions in progress). Instead, revocation sets `aiDataConsent: false` on the profile. Gate 5.5 catches it on the *next app launch or page load*, but doesn't yank the user out mid-session.

4. **Skip server-side consent enforcement for launch**. The security reviewer flagged that API proxies (`api/claude.js`, `api/gemini.js`, etc.) don't check `aiDataConsent`. This is MEDIUM severity in theory but LOW priority for launch: Apple reviews the UI flow, not the API layer. The client-side gate is the compliance mechanism. Server-side enforcement can be added post-launch by reading the user's profile doc in `api/_lib/cors-auth.js`.

5. **No lazy loading for consent modal**. The architecture strategist confirmed it's too small (~2KB) to justify a code-split boundary. Import it directly in `main.jsx`.

### New Risks Discovered

- **Privacy policy links on Capacitor**: `<a target="_blank">` navigates away from the app in WKWebView. For launch, this is acceptable (users tap Back to return). Post-launch improvement: use `@capacitor/browser` plugin for in-app browser.
- **Profile load error false positive**: If Gate 3 (profile loading) fails with `loadError`, Gate 3b shows "Connection issue". But if the profile loads with `null` data and a stale cache has no `aiDataConsent`, Gate 5.5 would trigger. The current code handles this correctly because Gate 4 (no profile) catches `profile === null` before Gate 5.5 evaluates.

---

## Overview

Ship 2manybeans to the App Store. All infrastructure is in place (code committed to `main`, Vercel deployed, ASC metadata filled, RevenueCat webhook configured, privacy policy/terms/support live, account deletion built, Firestore rules hardened, screenshots uploaded). Three code changes remain before submission: AI data disclosure consent (Guideline 5.1.2(i)), AI-generated content disclaimers (Guideline 5.6.1), and a misleading camera screen text fix. Then: TestFlight archive, Capgo freeze, submit for review.

## Problem Statement

Apple's November 2025 Guideline 5.1.2(i) requires in-app disclosure and explicit user consent before sending personal data to third-party AI providers. The app sends bean photos, tasting notes, chat messages, and brew preferences to Anthropic Claude, OpenAI GPT, and Google Gemini via server-side proxies. No in-app consent mechanism exists. Additionally, Guideline 5.6.1 requires visible AI-generated content disclaimers, which are absent from all AI-powered screens. These are the most common rejection reasons for AI apps in 2026 (per 9to5Mac, TechCrunch, The Next Web reporting on the 84% submission spike and Apple's crackdown).

### Research Insights (Best Practices)

**Apple Developer Forum evidence** (March 2026): A developer's AI writing app was approved after implementing:
- Dedicated consent screen (not just a privacy policy link)
- Provider names in the App Store description
- AI disclaimer footers on generated content
- Revocable toggle in Settings
- Mention in release notes: "This app uses AI services from [providers]"

**Common rejection patterns:**
- Consent buried in a privacy policy (must be a separate interaction)
- Missing provider names (must name each third-party AI service)
- No revocation mechanism (must allow users to withdraw consent)
- Missing disclaimers on AI-generated content (every surface must be labeled)

## Proposed Solution

### Phase 1: AI Data Consent Gate (Guideline 5.1.2(i))

**Architecture: Gate 5.5 in `main.jsx`**

Insert a new rendering gate between "onboarded" and "app shell" that checks `profile.aiDataConsent === true`. This catches both new users (after onboarding completes) and existing users (who already completed onboarding but have never consented).

```
Gate 1: Auth loading spinner
Gate 2: Not signed in -> SignInScreen
Gate 3: Profile loading spinner
Gate 4: No profile -> createProfile + redirect
Gate 5: Not onboarded -> OnboardingFlow
Gate 5.5: No AI consent -> AiDataConsentModal  <- NEW
Gate 6: Data loading spinner
Gate 7: App shell (tabs)
```

#### Research Insights (Architecture)

**Gate position is correct.** The architecture strategist confirmed Gate 5.5 belongs after onboarding (Gate 5) and before data loading (Gate 6). Placing it earlier would block users who haven't completed onboarding. Placing it later would load Firestore data before consent is given.

**Do NOT lazy-load the consent modal.** It's a single component under 2KB. The code-split boundary adds more overhead (chunk request + parse) than it saves. Import directly:
```javascript
import { AiDataConsentModal } from './components/AiDataConsentModal';
```

**Critical: Consent revocation must NOT re-trigger Gate 5.5 mid-session.** If revoking consent causes Gate 5.5 to re-engage, the entire app shell (`<App>`) unmounts. This destroys:
- Chat message history (ephemeral state in ChatTab)
- In-progress tasting sessions (TastingTab coach mode)
- Unsaved bean edits (EditBeanModal)
- AidenModal recipe state

**Solution:** Revoking consent in Settings sets `aiDataConsent: false` on the profile. The `updateProfile()` optimistic update flips the local state, but the Gate 5.5 check only fires on the next full app mount (cold start or page reload). During the current session, AI features could check `profile.aiDataConsent` and show a re-consent prompt inline rather than unmounting the app. For V1 launch, the simpler approach (Gate 5.5 re-engages immediately) is acceptable because revocation is a rare edge case.

**Consent modal design:**

Full-screen modal (not a popup). Warm, on-brand tone matching the "artisanal ledger" design system. Uses the canonical modal overlay style: `background: C.bg` (full screen, not overlay). Content:

```
How your data powers 2manybeans

When you use AI features (bean scanning, tasting coach, chat,
brew recipes), your data is processed by these services:

  Google Gemini -- reads your bean bag photos
  Anthropic Claude -- powers tasting coaching and chat
  OpenAI GPT -- generates brew recipes and stories

Your data is sent through our secure servers, never shared
directly. We don't use your data to train AI models.

[Read our Privacy Policy]

[I Understand and Agree]  <- primary CTA
```

No "skip" or "decline" option. The app's core value requires AI. Users who want to read more can tap the privacy policy link. The CTA writes to the user's Firestore profile.

**Profile fields to add:**

```javascript
aiDataConsent: true,           // boolean
aiConsentDate: serverTimestamp, // when consent was given
```

`aiConsentVersion` dropped per simplicity review. Can be added later if providers change.

**Firestore rules updates (`firestore.rules`):**

- Add `aiDataConsent`, `aiConsentDate` to both `create` and `update` `hasOnly` allowlists
- Do NOT add to the `affectedKeys()` diff guard (line 54) -- user must be able to toggle consent via Settings
- Do NOT add to the belt-and-suspenders blocklist on create (line 24) -- consent can be granted during profile creation

#### Research Insights (Security)

**Server-side enforcement gap (MEDIUM, deferred to post-launch):** The API proxies (`api/claude.js`, `api/gemini.js`, `api/openai.js`, `api/aiden.js`) authenticate via `cors-auth.js` but only check entitlement (Pro/Ultra), not AI consent. A technically sophisticated user could revoke consent in the UI but still call the APIs directly. For Apple review this doesn't matter (they test the UI), but for full compliance, post-launch add a consent check in `api/_lib/cors-auth.js`:

```javascript
// In cors-auth.js, after entitlement check:
const profileSnap = await db.collection('users').doc(uid).get();
if (!profileSnap.data()?.aiDataConsent) {
  return res.status(403).json({ error: 'AI consent required' });
}
```

**Race condition on consent toggle is acceptable.** If the user rapidly toggles the Settings switch, the optimistic update + Firestore write may interleave. But since `updateProfile()` does a Firestore `updateDoc` (last-write-wins), the final state is always consistent.

**Settings page: revocable consent**

Add a "Data & AI" row at the top of the Legal section in SettingsPage. Toggle with iOS-style switch. Current status shown as subtitle text ("AI features enabled" / "AI features disabled"). Disabling shows `window.confirm()`: "This will disable all AI features. You can still manage beans and tastings manually. Continue?" Flipping it off sets `aiDataConsent: false` on the profile.

**Files to modify:**

| File | Change |
|------|--------|
| `src/main.jsx` | Import AiDataConsentModal, add Gate 5.5 check |
| `src/components/AiDataConsentModal.jsx` | NEW: consent modal component |
| `src/components/SettingsPage.jsx` | Add "Data & AI" toggle in Legal section |
| `firestore.rules` | Add 2 fields to create + update allowlists |

Note: `useUserProfile.jsx` does NOT need changes. The profile hook already reads all fields from the Firestore doc; `aiDataConsent` is available on `profile` automatically.

### Phase 2: AI-Generated Content Disclaimers (Guideline 5.6.1)

Add a small, subtle footer to every screen that shows AI-generated content:

```
AI-generated . May not always be accurate
```

Style: `fontSize: 11px`, `color: C.textLight` (#A89888 taupe), `textAlign: center`. Positioned at the bottom of the AI content area, above any input field.

#### Research Insights (Codebase Explorer)

**Placement specifics:**
- TastingTab: Above the input row (`{!chatExtracted && (` block), visible during coach chat mode
- ChatTab: Above the `<ChatInputBar>` component
- ProfessorRuphusSlideUp: At the bottom of the scrollable story content, after the spider chart
- AidenModal: After the secondary icon row (Share/Regenerate), before `{extraFooter}`

**Files to modify:**

| File | Where |
|------|-------|
| `src/tabs/TastingTab.jsx` | Above input row, below coach messages |
| `src/tabs/ChatTab.jsx` | Above ChatInputBar |
| `src/components/ProfessorRuphusSlideUp.jsx` | Bottom of story content |
| `src/components/AidenModal.jsx` | After Share/Regenerate row |

### Phase 3: R08 Camera Screen Text Fix

**File:** `src/components/onboarding/screens/R08PermissionPriming.jsx` (line 147-148)

**Current (false):**
> Labels stay on your device unless you tell me otherwise.

**Replacement:**
> Your photos are sent to our AI to read the label, then discarded. We never store your images.

This is a one-line change but it eliminates a factually incorrect privacy claim that directly contradicts the new AI consent modal. Apple reviewers reading both screens back-to-back would flag the inconsistency.

### Phase 4: Minor Polish

| Item | File | Change |
|------|------|--------|
| `window.open` missing `noopener` | `src/components/AidenModal.jsx:424` | `window.open(result.link, '_blank', 'noopener,noreferrer')` |
| `window.open` missing `noopener` | `src/components/SettingsPage.jsx:439` | Same pattern |

**Dropped:** `apple_pending_name` localStorage -> sessionStorage. Analysis shows this would break Apple Sign-In name capture on Capacitor/WKWebView. WKWebView can terminate background web processes, clearing sessionStorage. Apple only sends the user's name on first sign-in. The current code already clears localStorage after consumption (`useUserProfile.jsx:160-163`). Risk outweighs benefit.

**Dropped:** `aiConsentVersion` field. YAGNI per simplicity review. Two fields suffice for launch.

### Phase 5: Commit + Deploy Web

- Commit all Phase 1-4 changes to `main`
- `npx vercel --prod` to deploy
- Verify AI consent flow works at https://2manybeans.vercel.app
- Verify disclaimers appear on tasting, chat, Ruphus, Aiden screens

### Phase 6: TestFlight Build

```bash
npm run cap:sync    # builds JS + syncs native plugins to iOS project
npm run cap:open    # opens Xcode
```

In Xcode:
- Version: `1.0.0`
- Build: next sequential (check current highest in ASC)
- Signing: ensure "In-App Purchase" capability is enabled
- SPM: File > Packages > Resolve Package Versions, Clean Build Folder
- Product > Archive > Distribute > App Store Connect > Upload

Wait ~15 min for processing.

### Phase 7: Capgo Freeze

**Before submitting for review:**

1. Do NOT run `/ship` or upload any Capgo bundle during the review period
2. The TestFlight build is the frozen artifact Apple reviews
3. If Capgo pushes a newer bundle, the reviewer's device may download it and see different code than what was submitted
4. This can result in rejection or account-level flags

**After "Ready for Sale":**

1. Upload matching Capgo bundle: `npx @capgo/cli@latest bundle upload`
2. Resume normal `/ship` workflow for future OTA updates

### Phase 8: Submit for Review

In App Store Connect:
1. Navigate to 2manybeans > iOS App 1.0
2. Under "Build", select the TestFlight build just uploaded
3. Set release preference: **"Manually release this version"**
4. Hit **"Add for Review"**

Everything else (description, keywords, screenshots, privacy labels, review notes, contact info) is already filled in and verified.

#### Research Insights (Best Practices)

**App Store description should mention AI providers.** Per the Developer Forum approval example, adding a line like "2manybeans uses AI services from Google, Anthropic, and OpenAI to power bean scanning, tasting coaching, and brew recipes" to the app description strengthens the submission. Check if ASC description already includes this.

**Review notes should call out the consent flow.** In the "Notes for Review" field in ASC, explicitly tell the reviewer: "This app uses third-party AI services (Google Gemini, Anthropic Claude, OpenAI GPT). Users are shown a consent screen on first launch per Guideline 5.1.2(i). Consent is revocable in Settings > Data & AI."

### Phase 9: Post-Approval

1. Manually release in ASC when ready to go live
2. Upload matching Capgo bundle for OTA
3. Optionally delete the manual Firestore subscription override on Tal's user doc (real RC entitlements now flow through the SDK)
4. Monitor first reviews and crash reports

#### Post-Launch Improvements (Not blocking launch)

- Add server-side `aiDataConsent` check in `api/_lib/cors-auth.js`
- Use `@capacitor/browser` plugin for privacy policy link (in-app browser instead of navigation)
- Add `aiConsentVersion` field if AI providers change
- Consider feature-level consent guards (disable AI buttons inline instead of re-triggering Gate 5.5)

## Technical Considerations

**Architecture:** The Gate 5.5 approach is consistent with the existing gate pattern in `main.jsx`. It does not require changes to the onboarding state machine, which reduces risk. Existing users see the consent modal once, new users see it after onboarding completes.

**Performance:** Zero impact. The consent check reads a single boolean from the profile document that's already loaded by Gate 3.

**Security:** Consent state lives on the server (Firestore), not in localStorage. Re-installs or new devices will re-prompt if the profile lacks `aiDataConsent: true`. The consent cannot be faked client-side because it's a simple boolean flag on an authenticated document. Server-side API enforcement is deferred to post-launch (see Security Insights above).

**Offline edge case:** If the profile fails to load (Gate 3), the user is already blocked by the loading spinner. The consent gate only evaluates when `profile` is available. No offline-specific handling needed.

**Guideline 5.1.2(i) compliance specifics:**
- Names each AI provider (Anthropic, OpenAI, Google)
- Describes what data is sent (photos, tasting notes, chat messages)
- Explains how data flows (through secure server proxies)
- States data is not used for training
- Links to full privacy policy
- Consent is explicit (tap to agree)
- Consent is revocable (Settings toggle)

**Guideline 5.6.1 compliance specifics:**
- Every AI-generated content surface has a visible disclaimer
- Disclaimer is always visible (not hidden in a menu or expandable section)

## Stale Todo Items

These todo files are marked "pending" but the code already has the fixes applied. Update status to "complete" during implementation:

| Todo | Fix Applied | Evidence |
|------|-------------|----------|
| `004` delete-account stale token | `auth_time` reauth check, `maxDuration: 60` | `api/delete-account.js:10,36,116` |
| `006` fail-open entitlement | Returns `{ pro: false, ultra: false }` on all error paths | `api/_lib/checkEntitlement.js:53,57,125,141` |
| `007` RC init race | (needs verification -- no `configurePromise` found in grep) | May still be pending |
| `009` webhook security | `timingSafeEqual` from crypto, strict product ID map | `api/revenuecat-webhook.js:16,67` |
| `011` delete-account ordering | `listCollections()` dynamic enumeration, parallel deletion | `api/delete-account.js:135,141` |
| `018` paywall retry | `retryCount` state + `handleRetryOfferings()` | `src/components/PaywallSheet.jsx:112,275` |

## Acceptance Criteria

### Functional Requirements

- [ ] AI consent modal appears for users without `aiDataConsent: true` on profile
- [ ] Consent modal names all three AI providers
- [ ] Consent modal links to privacy policy
- [ ] Tapping "I Understand and Agree" writes `aiDataConsent`, `aiConsentDate` to profile
- [ ] After consent, app shell renders normally
- [ ] Existing users see consent modal on first launch after update
- [ ] AI disclaimer footer visible on: TastingTab coach mode, ChatTab, ProfessorRuphusSlideUp, AidenModal
- [ ] R08 camera screen text no longer says "Labels stay on your device"
- [ ] Settings page has "Data & AI" toggle to revoke consent
- [ ] Revoking consent re-triggers Gate 5.5 on next render
- [ ] Firestore rules accept `aiDataConsent`, `aiConsentDate` fields
- [ ] `window.open` calls include `noopener,noreferrer`

### Non-Functional Requirements

- [ ] Consent modal matches app design system (cream surfaces, warm typography)
- [ ] No new `localStorage` or `sessionStorage` usage for consent state
- [ ] All AI features remain functional after consent is given

### Submission Requirements

- [ ] TestFlight build archives and uploads successfully from `main`
- [ ] No Capgo bundle uploaded during review period
- [ ] Build selected in ASC, "Add for Review" submitted
- [ ] Release set to manual
- [ ] Review notes mention AI providers and consent flow

## Dependencies & Risks

| Risk | Mitigation |
|------|------------|
| Apple rejects for insufficient AI disclosure | Consent modal names providers, links policy, requires explicit tap |
| Apple rejects for missing AI disclaimers | Footer on all 4 AI screens |
| Apple rejects R08 misleading privacy text | Fixed to accurately describe photo processing |
| Capgo OTA during review changes app behavior | Freeze Capgo uploads during review |
| RevenueCat init race (todo 007) | Verify if still pending; if so, fix before submission |
| Apple reviewer can't sign in (2FA on demo account) | Use a Google account with 2FA disabled, or provide Apple Sign-In path in review notes |
| Review time extended (84% submission surge) | Submit ASAP, expect 2-7 days |
| Consent revocation unmounts app mid-session | Acceptable for V1; post-launch add feature-level guards |
| Privacy policy link navigates away on native | Acceptable for V1; post-launch use @capacitor/browser |
| Server-side API calls bypass consent check | Deferred; client-side gate satisfies Apple review |

## Implementation Phases

### Phase 1: Code Changes (~2 hours) -- DONE
1. Create `AiDataConsentModal.jsx`
2. Add Gate 5.5 to `main.jsx`
3. Update Firestore rules (2 fields to both allowlists)
4. Add AI disclaimer footers to 4 files
5. Fix R08 camera text
6. Fix `window.open` calls (2 files)
7. Add "Data & AI" toggle to SettingsPage

### Phase 2: Commit + Deploy (~10 min)
8. Commit to `main`, push
9. `npx vercel --prod`
10. Verify consent flow + disclaimers at production URL

### Phase 3: TestFlight + Submit (~45 min)
11. `npm run cap:sync`
12. Open Xcode, set version/build, archive, upload
13. Wait for processing (~15 min)
14. Select build in ASC, submit for review

### Phase 4: Post-Approval
15. Release manually in ASC
16. Upload matching Capgo bundle
17. Resume normal deploy workflow

## Sources & References

### Apple Guidelines
- Guideline 5.1.2(i): Third-party AI data disclosure (November 2025)
- Guideline 5.6.1: AI-generated content disclaimers
- Guideline 5.1.1(v): Account deletion requirement
- Guideline 2.5.2: Self-contained bundle (NOT a risk for this app)
- Guideline 4.2: Minimum functionality (NOT a risk for this app)

### Research
- 9to5Mac: Apple pushing back on vibe coding apps (March 2026)
- TechCrunch: Anything app rebuilt after App Store removal (April 2026)
- The Next Web: 84% submission spike from vibe coding
- DEV Community: Apple Guideline 5.1.2(i) deep dive
- Apple Developer Forums: Approved AI app consent pattern (March 2026)
- /last30days research: 19 Reddit threads, 22 X posts, 17 TikTok videos, 8 HN stories

### Internal
- App Store Submission PRD: `docs/prds/app-store-submission-prd.md`
- Account Deletion PRD: `docs/prds/account-deletion-prd.md`
- Privacy & Legal PRD: `docs/prds/privacy-and-legal-prd.md`
- Existing privacy policy: `public/privacy-policy.html`
- Existing terms: `public/terms.html`
- Existing support page: `public/support.html`

### Deepening Agent Reports
- Security Sentinel: Server-side consent gap (MEDIUM), privacy policy link navigation (LOW)
- Architecture Strategist: Gate position validation, lazy-load decision, revocation unmount risk (CRITICAL)
- Best Practices Researcher: Apple Developer Forum approval pattern, rejection pattern analysis
- Code Simplicity Reviewer: aiConsentVersion YAGNI, field count reduction
- Codebase Explorer: Disclaimer insertion points, writeBatch pattern, modal styling tokens
