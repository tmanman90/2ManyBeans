---
title: Consumer Launch - Auth, Onboarding, Settings, Hand Brew & Grinder Intelligence
type: feat
status: active
date: 2026-04-04
deepened: 2026-04-04
---

# Consumer Launch Master Plan

Transform Coffee Hub from a single-user personal app into a consumer-ready specialty coffee companion. Four phased milestones, each independently deployable.

---

## Pre-Launch Security (Fix Before Phase 1)

| # | Finding | Severity | Fix Effort |
|---|---------|----------|------------|
| 1 | API proxy (`api/openai.js`, `api/claude.js`) accepts arbitrary model names and maxTokens from client | HIGH | 30 min |
| 2 | Firestore rules have no field-level write validation on profile doc | HIGH | 1 hr |
| 3 | Prompt injection via user-controlled bean fields in GPT prompts | MEDIUM | 1 hr |

---

## Overview

Coffee Hub currently runs as Tal's personal app: Google-only auth, no user profile, hardcoded Fellow Ode Gen 2 grinder, hardcoded 3 Atmos slots, Aiden-only brew recipes. Opening to consumers requires identity infrastructure, user preferences, equipment flexibility, and a brew recipe engine that works without a Fellow Aiden device.

**Goal:** Any specialty coffee enthusiast can sign up, configure their equipment, and get personalized brew recipes, whether they own a Fellow Aiden or brew by hand.

---

## Problem Statement

1. **Auth is Google-only.** Apple Sign-In is required for App Store distribution. No sign-out button exists.
2. **No user profile or preferences.** Equipment, brew method, and display preferences are all hardcoded.
3. **Aiden-only brewing.** Users without a Fellow Aiden ($300+ device) get zero recipe value from the app.
4. **Hardcoded 3 canisters.** Users with 1, 2, 4, or 5+ vacuum canisters can't match their real setup.
5. **Grinder assumptions.** All grind data assumes Fellow Ode Gen 2. Users with other grinders see meaningless step numbers.

---

## Technical Approach

### Architecture

**New Firestore document:** `users/{uid}` (profile + preferences, single doc)

```
users/{uid}
  displayName: string
  email: string | null
  photoURL: string | null
  signUpProvider: 'google' | 'apple'   // renamed from 'provider' for clarity
  username: string | null
  createdAt: Timestamp
  lastLoginAt: Timestamp
  onboardingComplete: boolean
  marketingConsent: boolean           // true if user opted in to emails
  marketingConsentDate: Timestamp | null  // when they last changed consent (for compliance)
  preferences: {
    grinder: string              // e.g., 'fellow-ode-gen2', 'comandante-c40', 'other'
    grinderCustomName: string | null  // only if grinder === 'other'
    brewMethod: 'aiden' | 'handbrew'
    grindSizeDisplay: 'default' | 'microns'
    canisterCount: number        // default 3, range 1-6
  }
```

**New top-level collection for email marketing:** `emailList/{uid}`

```
emailList/{uid}
  email: string
  displayName: string
  signUpDate: Timestamp
  source: 'onboarding' | 'settings'    // where they opted in
```

This is a separate top-level collection (not under `users/`) so you can query all subscribers without reading every user doc. Cheap to export, easy to pipe into Mailchimp/SendGrid/Resend. The doc ID matches the user's uid so opt-out is a simple delete.

**How it works:**
- When `marketingConsent` flips to `true`: create/update doc in `emailList/{uid}`
- When `marketingConsent` flips to `false`: delete doc from `emailList/{uid}`
- The profile doc is the source of truth for the UI toggle. The `emailList` collection is the export-friendly subscriber list.

### Research Insights: Data Model

**Use `signUpProvider` not `provider`** (Data Integrity Guardian): Makes semantics clear. This is the provider used at initial sign-up, not the current session provider. If the user later links another provider, this field still reflects the original.

**Use dot notation for partial preference updates** (Architecture Strategist): `updateDoc(ref, { 'preferences.brewMethod': 'aiden' })` instead of overwriting the entire preferences map. Prevents race conditions if two fields are updated concurrently.

**Single doc is correct** (Architecture Strategist, Framework Docs): A consumer coffee app's preferences are a bounded set. Subcollections add unnecessary complexity and cost (more reads per boot). Even with 50 preference fields, you're at a few KB, nowhere near the 1MB doc limit.

**New security rule** (required, current wildcard only matches subcollections):

```
match /users/{userId} {
  allow read: if request.auth.uid == userId;
  allow write: if request.auth.uid == userId
    && request.resource.data.keys().hasOnly([
      'displayName', 'email', 'photoURL', 'signUpProvider',
      'username', 'createdAt', 'lastLoginAt', 'onboardingComplete',
      'marketingConsent', 'marketingConsentDate', 'preferences'
    ])
    && request.resource.data.displayName is string
    && request.resource.data.displayName.size() <= 100;
}

// Email subscriber list: users can only manage their own entry
match /emailList/{userId} {
  allow read, delete: if request.auth.uid == userId;
  allow create, update: if request.auth.uid == userId
    && request.resource.data.email is string
    && request.resource.data.email.size() <= 320;
}
```

> **Admin access for newsletter export:** Firestore rules block client reads of other users' emailList docs. To export the full list, use the Firebase Admin SDK (server-side, bypasses rules) or a Cloud Function. This keeps the subscriber list secure while letting you pull it for Mailchimp/SendGrid when needed.

### Research Insights: Security Rules (Security Sentinel - HIGH)

- **Field-level validation is critical.** Without `keys().hasOnly()`, any authenticated user can write arbitrary fields to their own profile doc. If a future developer adds `isPremium: true`, users can set it themselves.
- **Add `.size()` constraints on string fields** to prevent bill inflation from enormous values.
- **Deploy this rule BEFORE any client code** that reads/writes the profile doc. If the rule is missing, `setDoc` throws permission denied and the user appears to have no profile forever.
- **Existing subcollection rule** (`{document=**}`) does NOT match the `users/{uid}` document itself. Both rules are needed; they don't conflict.

**New hooks:** `useUserProfile(uid)` - loads/creates/updates the profile doc. Returns `{ profile, preferences, updatePreferences, isOnboarded }`.

**Boot sequence change** in `main.jsx`:

```jsx
if (authLoading) return <LoadingScreen />;
if (!user) return <SignInScreen />;
if (!profileLoaded) return <LoadingScreen />;  // new gate
if (!profile.onboardingComplete) return <OnboardingWizard />;
if (!dataLoaded) return <LoadingScreen />;
return <App />;
```

### Research Insights: Boot Sequence (Performance Oracle, Races Reviewer)

**Load profile in parallel with beans/tastings, but gate rendering on ALL being ready:**

```javascript
const [beansSnap, tastingsSnap, profileSnap] = await Promise.all([
  getDocs(beansRef),
  getDocs(tastingsRef),
  getDoc(profileRef),
]);
```

This adds ZERO additional latency (concurrent with existing reads) while preventing the plan's original serial dependency. Never render the app shell until both profile AND beans are ready. If you render with `preferences === undefined`, every component reading `preferences.brewMethod` or `preferences.canisterCount` crashes.

**Do NOT poll the profile doc** (Performance Oracle): Read once at boot, update optimistically in-app. Profile settings change extremely rarely (once during onboarding, then a few times ever). Polling every 60 seconds wastes ~1,440 Firestore reads per day per user. When the user changes a preference in Settings, update both local state and Firestore simultaneously.

**Existing user migration (Tal):** On first load of the updated app, if `users/{uid}` doesn't exist but the user has beans (i.e., returning user), auto-create profile with current defaults: Ode Gen 2, Aiden brew, 3 canisters, `onboardingComplete: true`. Skip onboarding.

### Research Insights: Migration (Data Integrity Guardian)

**Use `setDoc` with `merge: true` in `onAuthStateChanged`** instead of checking beans first. This eliminates the race condition between beans loading and profile check:

```javascript
if (user) {
  const profileRef = doc(db, 'users', user.uid);
  setDoc(profileRef, {
    displayName: user.displayName || '',
    email: user.email || '',
    signUpProvider: user.providerData?.[0]?.providerId || 'unknown',
    createdAt: serverTimestamp(),
  }, { merge: true });
}
```

The `merge: true` means `createdAt` only writes on first creation (already-set fields are preserved). Idempotent, no race, no dependency on beans loading state.

### State Management

### Research Insights: Two Contexts, Not One (Architecture Strategist, Performance Oracle)

**Split into AuthContext + UserPreferencesContext.** Auth state (user, loading, signIn, logOut) and user preferences (brewMethod, grindDisplay, canisterCount) have fundamentally different lifecycles. A single context means every auth state change re-renders all preference consumers, and vice versa.

```jsx
// React 19 syntax — no .Provider needed
<AuthContext value={{ user, signIn, logOut }}>
  <UserPreferencesContext value={preferencesMemo}>
    <App />
  </UserPreferencesContext>
</AuthContext>
```

**Memoize the context value** to prevent re-renders on every parent render:

```javascript
const preferencesMemo = useMemo(() => ({ preferences, updatePreferences }), [preferences]);
```

**Shallow equality check before setting state** on native poll cycles. The existing `useAppData` pattern calls `setBeans()` with fresh array references even when data hasn't changed, causing unnecessary re-renders. The profile context would inherit this. Compare before updating:

```javascript
if (JSON.stringify(newPrefs) !== JSON.stringify(prevPrefs)) setPreferences(newPrefs);
```

**Co-locate context with hook** (Code Simplicity Reviewer): Put `UserPreferencesContext` inside `useUserProfile.js` and export both the hook and provider from the same file. Skip the separate `contexts/` directory. One file, not two.

### Supported Grinders (Top 6 + Other)

| Key | Display Name | Type | Steps | Micron Range |
|-----|-------------|------|-------|-------------|
| `fellow-ode-gen2` | Fellow Ode Gen 2 | Electric flat burr | 31 positions (1-11, with .1/.2 sub-steps) | ~200-1400μm |
| `fellow-opus` | Fellow Opus | Electric conical | 41+ settings (1-6+, 10 clicks per number) | ~200-1200μm |
| `baratza-encore-esp` | Baratza Encore ESP | Electric conical | 40 steps (1-40) | ~200-1200μm |
| `comandante-c40` | Comandante C40 MK4 | Manual conical | ~40 clicks (0-40) | ~200-1100μm |
| `1zpresso-jx-pro` | 1Zpresso JX-Pro | Manual conical | ~200 clicks (0-200) | ~150-1000μm |
| `baratza-virtuoso-plus` | Baratza Virtuoso+ | Electric conical | 40 steps (1-40) | ~200-1200μm |
| `other` | Other / Manual Entry | - | User enters manually | User enters manually |

### Research Insights: Grind Display (UX Research)

**Show both named preset AND grinder number** (Fellow's pattern, most consumer-friendly):

```
Grind Size: Medium-Coarse (Ode: 5)
```

Fellow maps named categories to their grinder settings:
- **Fine** (espresso/moka): Ode 1-2
- **Medium-fine** (single-cup pour over): Ode 2-3
- **Medium** (AeroPress, V60, siphon): Ode 3-4
- **Medium-coarse** (batch brew, Aiden): Ode 4-6
- **Coarse** (French press, cold brew): Ode 7-11

Source: [Fellow Ode Gen 2 Recommended Grind Settings](https://help.fellowproducts.com/hc/en-us/articles/9962302561819)

---

## Implementation Phases

### Research Insights: Phase Structure (Code Simplicity Reviewer)

**Consider collapsing to 2 phases** instead of 4:
- **Phase A: Auth + Profile + Settings** (the "multi-user" phase). Ship it, get on the App Store.
- **Phase B: Hand Brew + Grinder Intelligence** (the "non-Aiden users" phase).

The current 4-phase plan creates artificial deployment gates. Phases 2-4 could ship together or in any order once the profile doc exists. However, the 4-phase breakdown is useful for planning/tracking even if deployment is batched.

**Phase 4 simplification opportunity:** The Code Simplicity Reviewer flagged the entire Phase 4 (grinder profiles data structure with 600+ entries, conversion functions) as the biggest YAGNI in the plan. GPT already knows grinder step ranges. An alternative: pass the grinder name to the GPT prompt and let GPT include micron values in its recipe output. No client-side lookup tables needed. See Phase 4 for the revised approach.

---

### Phase 1: Auth & Onboarding Foundation

**Goal:** Multiple auth providers, user profile in Firestore, onboarding wizard, sign-out capability.

**Estimated scope:** ~15-20 files touched, 1 new hook, 1 new component (OnboardingWizard), modifications to SignInScreen, main.jsx, useAuth.js, firestore.rules.

#### Tasks

##### 1.1 Apple Sign-In

**Files:** `src/hooks/useAuth.js`, `src/components/SignInScreen.jsx`, `capacitor.config.ts`

- Add Apple provider to `SocialLogin.initialize()` (the `@capgo/capacitor-social-login` plugin already supports Apple, no new deps)
- Implement nonce generation (SHA-256 hash for Apple, raw nonce for Firebase)
- Exchange Apple `idToken` + raw nonce via `OAuthProvider.credential()` + `signInWithCredential()`
- Web fallback: `signInWithPopup()` with `OAuthProvider('apple.com')`
- **Critical:** Capture `givenName`, `familyName`, `email` from Apple's first-login response immediately. Apple never sends these again. Store in local variable, persist to Firestore profile doc before any navigation.
- **Failure handling:** If Firestore write fails after Apple credential exchange, retry 3x with exponential backoff. If still failing, prompt user to enter name manually. Never leave a profile doc with null displayName.
- Enable "Sign in with Apple" capability in Xcode project
- Enable Apple provider in Firebase Console (Authentication > Sign-in method)

### Research Insights: Nonce Implementation (Framework Docs, Security Sentinel)

**The plugin does NOT generate nonces internally.** You must provide it. Concrete implementation:

```javascript
// Generate cryptographically random nonce
function generateNonce(length = 32) {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const values = crypto.getRandomValues(new Uint8Array(length));
  return values.reduce((acc, x) => acc + charset[x % charset.length], '');
}

// SHA-256 hash for Apple
async function sha256(input) {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
}

// Sign-in flow
async function signInWithApple() {
  const rawNonce = generateNonce();
  const hashedNonce = await sha256(rawNonce);

  const res = await SocialLogin.login({
    provider: 'apple',
    options: { scopes: ['email', 'name'], nonce: hashedNonce },
  });

  const credential = new OAuthProvider('apple.com').credential({
    idToken: res.result.idToken,
    rawNonce: rawNonce,  // Firebase verifies this against the hash in the token
  });

  await signInWithCredential(auth, credential);
}
```

**Security notes** (Security Sentinel):
- Generate nonce fresh inside the `signIn` callback, never reuse. If stored in React state and user retries without remounting, you could reuse a stale nonce.
- Never log the nonce (console, error handler, crash reporter).
- Both `crypto.getRandomValues` and `crypto.subtle.digest` are available in WKWebView (iOS 11+). No polyfill needed.
- Do NOT use `Math.random()` or `uuid` for this.

### Research Insights: Apple Name Capture (Races Reviewer, Data Integrity)

**Stash Apple's name in localStorage immediately** before calling `signInWithCredential`. If the credential exchange succeeds but the profile write fails, the next boot can read the stashed name and complete the profile doc. Clear the stash after successful write.

```javascript
// Immediately after SocialLogin.login() returns:
const { givenName, familyName, email } = res.result.profile;
if (givenName || familyName) {
  localStorage.setItem('apple_pending_name', JSON.stringify({ givenName, familyName, email }));
}

// After successful profile doc write:
localStorage.removeItem('apple_pending_name');

// In onAuthStateChanged, if profile exists but displayName is empty:
const stashed = JSON.parse(localStorage.getItem('apple_pending_name') || 'null');
if (stashed && !profileDoc.displayName) {
  await updateDoc(profileRef, { displayName: `${stashed.givenName} ${stashed.familyName}`.trim() });
  localStorage.removeItem('apple_pending_name');
}
```

### Research Insights: Multi-Provider Linking (Framework Docs)

Firebase throws `auth/account-exists-with-different-credential` when a user tries Apple after Google (or vice versa) with the same email. Handle it:

```javascript
try {
  await signInWithCredential(auth, appleCredential);
} catch (error) {
  if (error.code === 'auth/account-exists-with-different-credential') {
    const pendingCred = OAuthProvider.credentialFromError(error);
    // Prompt user: "You already have a Google account. Sign in with Google to link."
    const googleResult = await signInWithPopup(auth, googleProvider);
    await linkWithCredential(googleResult.user, pendingCred);
  }
}
```

**Apple Private Relay caveat:** Apple can hide the real email behind `privaterelay.appleid.com`. If the user used Private Relay, the emails won't match and Firebase creates two separate accounts. No automatic linking in this case.

**`fetchSignInMethodsForEmail` is deprecated** for enumeration protection. Handle the error directly from `signInWithCredential`.

**SignInScreen redesign:**

```
┌─────────────────────────────┐
│                             │
│        2manybeans           │
│                             │
│   Track your specialty      │
│   coffee rotation,          │
│   tastings, and freshness   │
│                             │
│  ┌───────────────────────┐  │
│  │   Sign in with Apple  │  │  <- Black button, white text, 48pt height
│  └───────────────────────┘  │
│                             │
│  ┌───────────────────────┐  │
│  │ G  Sign in with Google│  │  <- White button, same height, below Apple
│  └───────────────────────┘  │
│                             │
│   By signing in, you agree  │
│   to our Terms & Privacy    │
│                             │
└─────────────────────────────┘
```

### Research Insights: Apple Button Requirements (UX Research - rejection risks)

- **Apple button MUST be first and most prominent.** Same height or larger than Google. Full width. Apple's black style (white logo on black). These are enforced at App Store Review under Guideline 4.8.
- **Only three allowed titles:** "Sign in with Apple", "Sign up with Apple", or "Continue with Apple". No variations.
- **Must not require scrolling** to see.
- **Common rejection reasons:** button smaller than Google's, placed below other options, custom-drawn button that doesn't match Apple's official appearance.
- Both buttons: minimum 48pt height (exceeds Apple's 44pt minimum), 17px font, full-width within padding.

### Research Insights: iOS Safe Areas (iOS Design Specialist)

- Apply `padding-top: env(safe-area-inset-top)` and `padding-bottom: env(safe-area-inset-bottom)` to the outer container.
- Status bar: dark-content (dark text on light `C.bg` background). Use `StatusBar.setStyle({ style: Style.Dark })` on native.
- Both buttons: `minHeight: 48` explicitly set.

##### 1.2 User Profile Document

**Files:** `src/hooks/useUserProfile.js` (new), `firestore.rules`

- New hook: `useUserProfile(uid)`
  - On mount: `getDoc(doc(db, 'users', uid))` in parallel with beans/tastings
  - If doc exists: return profile + preferences
  - If doc missing + user has beans: create default profile (existing user migration)
  - If doc missing + no beans: return `{ isOnboarded: false }` to trigger onboarding
  - Expose `updatePreferences(partialPrefs)` using dot notation for partial updates
  - Web: `onSnapshot` for real-time sync
  - Native: `getDoc` once at boot (NOT polling). Optimistic local updates on preference changes.
- Add Firestore security rule for `users/{userId}` with field-level validation (see Architecture section)
- Default preferences: `{ grinder: 'fellow-ode-gen2', brewMethod: 'aiden', grindSizeDisplay: 'default', canisterCount: 3 }`
- Co-locate `UserPreferencesContext` in this file (export both hook and provider)

##### 1.3 Onboarding Wizard

**Files:** `src/components/OnboardingWizard.jsx` (new), `src/main.jsx`

### Research Insights: Simplify to 1-2 Steps (Code Simplicity, UX Research)

Research shows completion drops 15% per screen beyond 5, and the best onboarding gets to core value within 60 seconds. The original 3-step wizard can be simplified:

**1-2 steps. No "Add First Bean" step** (the empty state handles first-bean entry).

- **If name captured from auth (Google, most Apple):** Single screen. "Welcome, {name}! What's your grinder? How do you brew?" Two selectors, one "Get Started" button.
- **If Apple didn't provide name:** Same screen with a name field at the top.

**Onboarding Screen:**
- Hero: `onboarding-welcome.png` (Ruphus in doorway)
- Name field (only if Apple didn't provide one)
- "What's your grinder?" - dropdown with top 6 + "Other"
- "How do you brew?" - two cards using `brew-aiden.png` and `brew-handbrew.png`
- Marketing consent toggle: "Get brewing tips, new features, and coffee recs by email" (unchecked by default, GDPR-safe)
- "Get Started" button

> **On consent toggle:** When checked, write `marketingConsent: true` + `marketingConsentDate: serverTimestamp()` to profile doc AND create `emailList/{uid}` doc. When unchecked (or never checked), `marketingConsent: false`, no emailList doc.

### Research Insights: Onboarding UX (UX Research)

- **Trade Coffee pattern:** Equipment quiz that immediately outputs a personalized recommendation. Users feel value before committing.
- **Fellow App pattern:** Device-first onboarding with "skip for now" fallback. Lesson: equipment setup flows MUST have a skip path.
- **Pre-populate from existing preferences** (Data Integrity): If the user partially completed onboarding previously (picked grinder, closed app), show their existing selection pre-filled on return instead of starting fresh.

### Research Insights: iOS Onboarding (iOS Design Specialist)

- Full-screen overlay: `position: fixed; inset: 0; z-index: 1000`
- Top padding: `calc(env(safe-area-inset-top) + 16px)`
- Bottom action button: `calc(env(safe-area-inset-bottom) + 16px)`
- Slide transitions: Use CSS `transform: translateX()` with `transition: transform 0.3s ease-out`. GPU-accelerated, no layout thrash. Never animate `left`/`right`/`height`.
- **Name input: 16px font minimum** (prevents iOS Safari auto-zoom on focus)
- **Keyboard handling:** Listen for `Keyboard.addListener('keyboardWillShow')` and adjust bottom button position above keyboard.
- **Camera in step 3:** Do NOT auto-trigger. Let user tap "Scan" button. Show explanation before system permission dialog ("We use your camera to scan coffee bags"). Lazy-load camera module behind button tap.

**Consumer empty state** (replaces Tal's seed button):

```
┌─────────────────────────────┐
│                             │
│     Your rotation is        │
│        empty                │
│                             │
│   Tap + to add your first   │
│   coffee bag               │
│                             │
│       [ + Add Bean ]        │
│                             │
└─────────────────────────────┘
```

Remove the `seedTalData` import and "Import Tal's Inventory" button from RotationTab. Gate behind a dev flag or remove entirely.

**Design:** Follows the Ghibli-warm aesthetic. Soft cream card with Caveat title font for headers, Nunito for body text. Progress indicator dots at top (if multi-step). Amber accent for active dot and primary buttons.

##### 1.4 Sign-Out & Boot Sequence

**Files:** `src/main.jsx`, `src/App.jsx`

- Add sign-out button (must exist for Apple App Review)
- Location: Settings page (Phase 2), but interim placement in header area until Settings exists
- Update boot sequence as described in Architecture section (4 gates: auth, profile, onboarding, data)
- No separate `ProfileCheck` component needed (Code Simplicity). Inline as an early return in `main.jsx`.

##### 1.5 Contexts (Auth + Preferences)

**Files:** `src/hooks/useUserProfile.js` (co-located context), `src/main.jsx`

- **AuthContext:** Wrap existing `useAuth` return values. Stable, rarely changes after boot.
- **UserPreferencesContext:** Wraps preferences slice. Changes when user visits Settings.
- Both use React 19 syntax: `<AuthContext value={...}>` (no `.Provider`)
- All components that need preferences consume via `useContext(UserPreferencesContext)`

### Research Insights: Pre-Launch Security (Security Sentinel - do BEFORE Phase 1)

**Fix these in the existing codebase before shipping any consumer code:**

1. **API proxy model allowlist** (`api/openai.js`, `api/claude.js`):
```javascript
const ALLOWED_MODELS = ['gpt-5.4', 'gpt-5.4-mini'];
const safeModel = ALLOWED_MODELS.includes(model) ? model : 'gpt-5.4';
const safeMaxTokens = Math.min(maxTokens || 1000, 4000);
```

2. **Firestore rules with field validation** (see Architecture section)

3. **Profile data: write on first sign-in only, don't overwrite on every auth:**
```javascript
const snap = await getDoc(profileRef);
if (!snap.exists()) {
  await setDoc(profileRef, { displayName: user.displayName, ... });
}
```

#### Phase 1 Acceptance Criteria

- [ ] Users can sign in with Google or Apple on both web and iOS
- [ ] Apple first-login captures and persists name/email (with localStorage stash fallback)
- [ ] Nonce generated per-attempt using crypto.getRandomValues, never reused or logged
- [ ] Multi-provider linking handled (account-exists-with-different-credential)
- [ ] New users see onboarding (1-2 steps recommended, 3 if preferred)
- [ ] Existing users (Tal) get auto-migrated profile with current defaults, skip onboarding
- [ ] User profile document created in Firestore with field-validated security rules
- [ ] Firestore security rules deployed BEFORE any client profile code
- [ ] Sign-out button exists and works on both platforms
- [ ] Consumer-friendly empty state replaces Tal's seed data button
- [ ] AuthContext + UserPreferencesContext provide preferences to all components
- [ ] API proxy model allowlist and maxTokens cap in place
- [ ] Boot sequence gates rendering on profile AND beans being loaded

---

### Phase 2: Settings & Preferences

**Goal:** Full settings page, editable preferences, dynamic canister count.

**Depends on:** Phase 1 (profile doc + context must exist)

#### Tasks

##### 2.1 Settings Page

**Files:** `src/components/SettingsPage.jsx` (new), `src/App.jsx`

**Navigation entry point:** Gear icon in the app header (top-right corner). Tapping opens a full-screen settings view that slides up from bottom (reuses the existing Modal pattern). This avoids restructuring the 5-tab bottom bar.

```
┌─────────────────────────────┐
│ < Settings            Done  │
│─────────────────────────────│
│                             │
│  Profile                    │
│  ┌───────────────────────┐  │
│  │    Tal Meltzer        │  │
│  │     @tal              │  │
│  │     tal@email.com     │  │
│  └───────────────────────┘  │
│                             │
│  Equipment                  │
│  ┌───────────────────────┐  │
│  │ Grinder               │  │
│  │ Fellow Ode Gen 2    > │  │
│  ├───────────────────────┤  │
│  │ Brew Method           │  │
│  │ Aiden Brew          > │  │
│  ├───────────────────────┤  │
│  │ Grind Size Display    │  │
│  │ Default Grinder     > │  │
│  ├───────────────────────┤  │
│  │ Coffee Canisters      │  │
│  │ 3                   > │  │
│  └───────────────────────┘  │
│                             │
│  Notifications              │
│  ┌───────────────────────┐  │
│  │ Email updates      [x]│  │  <- toggle, syncs marketingConsent
│  └───────────────────────┘  │
│                             │
│  Account                    │
│  ┌───────────────────────┐  │
│  │ Sign Out              │  │
│  └───────────────────────┘  │
│                             │
└─────────────────────────────┘
```

### Research Insights: Settings UX (UX Research, iOS Design)

- **Auto-save, no Save button** (Apple HIG, industry standard): Changes take effect immediately. Show brief "Saved" toast for confirmation. Only exception: destructive changes (canister decrease with active beans) get a confirmation dialog.
- **iOS grouped table style:** Each group: `background: white; border-radius: 10px; margin: 8px 16px`. Section headers: `font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px`. Row height: 44pt minimum. Separator: `border-bottom: 0.5px solid` with 16px left inset.
- **Use native `<select>` for dropdowns on iOS.** Triggers the familiar wheel picker. Do NOT build custom dropdown overlays. Style the trigger to look like an iOS settings row (label left, current value + chevron right).
- **All inputs: 16px font minimum** (prevents iOS auto-zoom).
- **Keyboard handling for text inputs:** When focused, `scrollIntoView({ behavior: 'smooth', block: 'center' })`. Add `padding-bottom` equal to keyboard height.

### Research Insights: Gear Icon Placement (iOS Design)

```jsx
<button style={{
  position: 'absolute',
  top: `calc(env(safe-area-inset-top) + 8px)`,
  right: 12,
  width: 44,
  height: 44,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'transparent',
  border: 'none',
  WebkitTapHighlightColor: 'transparent',
  zIndex: 11,
}}>
  <Settings size={22} color={C.textMuted} />
</button>
```

**Rotation tab specifics:** The header uses an image background. Use a white icon with drop-shadow: `filter: drop-shadow(0 1px 2px rgba(0,0,0,0.3))` or semi-transparent circle background.

### Research Insights: Settings Modal (iOS Design)

- iOS-style page sheet: slides up, `border-radius: 12px 12px 0 0`, background overlay `rgba(0,0,0,0.4)`
- Spring curve: `transition: transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)`
- Top padding: `calc(env(safe-area-inset-top) + 12px)`
- Bottom padding: `env(safe-area-inset-bottom)`
- Sticky header: `position: sticky; top: 0; z-index: 1; background: inherit`
- "Done" text button top-right (iOS convention for settings modals), 44x44 tap target

##### 2.2 Username

- Text field in Profile section
- Stored as `username` in profile doc
- Used as display identifier (future social features)
- Validation: 3-30 chars, alphanumeric + underscores, no uniqueness constraint yet
- Optional: can be left blank, falls back to displayName from auth provider
- **Firestore rule validation:** `request.resource.data.username.matches('^[a-zA-Z0-9_]+$')` (Security Sentinel)

**Decision: Include.** Low cost (one text field, one Firestore field), lays groundwork for future social features.

##### 2.3 Grinder Selection

- Dropdown with 7 options: 6 named grinders + "Other"
- Stored as `preferences.grinder` (string key)
- If "Other" selected, show a text input for `preferences.grinderCustomName`
- Changing grinder affects:
  - Grind size display in BeanCard and recipe modals
  - Aiden recipe prompt (grinder name injected into GPT prompt)
  - Hand brew recipe prompt (Phase 3)
- **Does NOT retroactively change existing beans' saved grind data.** Saved `aidenGrind` values on beans remain as-is (they were correct for the grinder at brew time). New recipes use the new grinder.

> **Brew method switching preserves all data.** Both `bean.aidenGrind` and `bean.handBrewRecipe` coexist on the same bean document. Switching the brew method preference only changes which buttons/modals appear and which saved data BeanCard displays. No recipe data is ever deleted when toggling between Aiden and Hand Brew. Switch back and your previous recipes are still there.

##### 2.4 Brew Method

- Two-option selector: "Aiden Brew" | "Hand Brew"
- Stored as `preferences.brewMethod`
- Affects all brew buttons throughout the app:
  - `RotationTab.jsx` line ~140: "Brew with Aiden" button
  - `InventoryTab.jsx` line ~117: "Brew with Aiden" button
  - `ChatTab.jsx` line ~351: brew button for scanned ephemeral beans
  - `BeanCard.jsx`: grind display label
- When "Hand Brew" selected:
  - "Brew with Aiden" buttons change to "Hand Brew Recipe"
  - Tapping triggers hand brew recipe generation (Phase 3) instead of Aiden flow
  - AidenModal replaced with HandBrewModal
  - No Fellow account needed, no device push
- When "Aiden Brew" selected:
  - Current behavior preserved exactly

### Research Insights: Brew Method Registry (Architecture Strategist)

**Use a strategy pattern via a brew method registry** instead of scattered if/else checks across 3+ tabs:

```javascript
// lib/brewMethods.js
export const BREW_METHODS = {
  aiden: {
    label: 'Brew with Aiden',
    icon: '/images/aiden-icon.png',
    Modal: lazy(() => import('../components/AidenModal')),
    useHook: useAidenBrew,
  },
  handbrew: {
    label: 'Hand Brew Recipe',
    icon: '/images/handbrew-icon.png',
    Modal: lazy(() => import('../components/HandBrewModal')),
    useHook: useHandBrew,
  },
};
```

Each tab renders `<method.Modal>` and calls `method.useHook()` based on the preference value. Adding a new brew method (e.g., espresso) requires adding one registry entry, not editing three tabs.

### Research Insights: Mid-Brew Method Switch (Races Reviewer)

**Capture `brewMethod` at generation start, not from live context.** If user starts an Aiden brew, then switches preference to "handbrew" in Settings, the live context change could unmount the AidenModal mid-generation.

```javascript
// In the brew hook, when generation starts:
const capturedMethod = preferences.brewMethod; // snapshot at tap time
// Use capturedMethod for the entire generation flow, ignore context changes
```

**Alternative:** Disable the brew method toggle in Settings while a brew generation is in progress.

##### 2.5 Grind Size Display

- Two-option selector: "Default Grinder" | "Microns"
- Stored as `preferences.grindSizeDisplay`
- When "Default Grinder":
  - Show grinder's native step numbers (e.g., "Ode Gen 2: SS 4.2 / Batch 6.2")
  - Current behavior for Ode Gen 2 users
- When "Microns":
  - Convert step numbers to micron values using grinder profile lookup (Phase 4 data)
  - Display with mu symbol: "SS ~450um / Batch ~680um"
  - If grinder is "Other" and no micron mapping exists, show "Microns not available for custom grinders" and fall back to default display
- Affects: `BeanCard.jsx` grind display, `AidenModal.jsx` grind card, `HandBrewModal` (Phase 3)

### Research Insights: Micron Display Simplification (Code Simplicity)

**Alternative approach (simpler):** Instead of building a client-side micron lookup table (Phase 4), include a `grindMicrons` field in the GPT recipe output. The GPT prompt already knows the grinder, so it can include approximate micron values alongside step numbers. This eliminates Phase 4's data structure entirely and lets the display toggle between "Ode: 4.0" and "~450um" using data that's already in the recipe.

This approach trades off precision (GPT estimates vs. empirical measurements) for simplicity (zero new data structures). For a consumer app, GPT's estimates are sufficient. If users report inaccuracies, build the lookup table then.

##### 2.6 Dynamic Canister Count

**Files:** `src/tabs/RotationTab.jsx`, `src/hooks/useAppData.js`

- Numeric picker: 1-6, default 3
- Stored as `preferences.canisterCount`
- `RotationTab.jsx`: Replace hardcoded `[1, 2, 3]` with `Array.from({length: canisterCount}, (_, i) => i + 1)`
- Also update line 107 subtitle text: `"Your ${canisterCount} Atmos canister${canisterCount !== 1 ? 's' : ''}"`

**Edge case: Decreasing canister count with active beans in now-invalid slots.**

When user decreases count (e.g., 3 to 2) and a bean exists in slot 3:
1. Show confirmation dialog: "You have a bean in Atmos #3. Reducing to 2 canisters will return it to your sealed inventory."
2. On confirm: **atomic batch write** (see below)
3. On cancel: revert the canister count picker

### Research Insights: Atomic Canister Decrease (Data Integrity - CRITICAL, Races Reviewer)

**Must use `writeBatch` for atomicity.** Non-atomic writes can orphan beans invisibly (bean in slot 3 is ACTIVE but the UI only renders slots 1-2, so the bean vanishes from every view with no error).

```javascript
const batch = writeBatch(db);

// Update preferences
batch.update(profileDocRef, { 'preferences.canisterCount': newCount });

// Return overflow beans to sealed
for (const orphanBean of beansInOverflowSlots) {
  const beanRef = doc(db, `users/${uid}/beans/${orphanBean.id}`);
  batch.update(beanRef, {
    status: 'SEALED',
    atmosSlot: null,
    openDate: null,
    updatedAt: serverTimestamp(),
  });
}

await batch.commit();
// Manually trigger refetch on native (batch bypasses per-hook refetch)
if (Capacitor.isNativePlatform()) await refetchBeans();
```

**Also guard `openBean`:** Add validation that `targetSlot <= preferences.canisterCount` in `useAppData.js` line ~193.

**Performance note** (Performance Oracle): 6 BeanCards is fine. Keep brew hooks at tab level (one `useAidenBrew` per tab, not per card). If all 6 cards load product photos simultaneously, consider staggered image loading.

##### 2.7 Email/Password Auth (Deferred)

- Deferred from Phase 1. Can be deferred further beyond Phase 4 if needed.
- Firebase methods: `createUserWithEmailAndPassword`, `signInWithEmailAndPassword`
- When implemented: add registration form, "Forgot password?" flow, email verification prompt

#### Phase 2 Acceptance Criteria

- [ ] Settings page accessible via gear icon in header (44x44 touch target)
- [ ] Settings uses iOS grouped table style with auto-save + toast feedback
- [ ] Username editable with basic validation (and Firestore rule validation)
- [ ] Grinder selection dropdown with 6 named grinders + "Other"
- [ ] Brew method toggle between "Aiden Brew" and "Hand Brew"
- [ ] Grind size display toggle between "Default Grinder" and "Microns"
- [ ] Canister count adjustable 1-6, RotationTab renders correct number of slots
- [ ] Canister decrease uses writeBatch for atomic bean+preference update
- [ ] All preference changes persist to Firestore immediately (dot notation updates)
- [ ] Sign-out button in Settings page Account section
- [ ] Settings page follows Ghibli-warm design system + iOS HIG patterns
- [ ] Native `<select>` elements for dropdowns on iOS
- [ ] All inputs 16px+ font (no iOS auto-zoom)

---

### Phase 3: Hand Brew Recipe Engine

**Goal:** Hoffmann-informed hand brew recipe generation for users without a Fellow Aiden.

**Depends on:** Phase 2 (brew method preference must be wired)

#### Pre-Phase 3: Prep Work

Before building hand brew, extract shared code and fill knowledge gaps:

1. **Extract `researchBean()` to `lib/beanResearch.js`:** Currently in `aiden.js` but grinder/brewer agnostic. Hand Brew importing from `aiden.js` creates a misleading dependency.
2. **Create brew method registry** (`lib/brewMethods.js`): Tabs consume registry instead of branching on preference.
3. **Fix existing `useAidenBrew` unmount bug:** Add mounted-ref guard or hoist brew state above tab level.
4. **Add `HANDBREW_KNOWLEDGE` to `coffeeKnowledge.js`:** The existing `BREWING_KNOWLEDGE` is a cheat sheet (one-liner per method). The hand brew prompt needs the detailed Hoffmann methodology. See below.

##### 3.0 Expand coffeeKnowledge.js with Hand Brew Detail

**File:** `src/lib/coffeeKnowledge.js`

Add a new `HANDBREW_KNOWLEDGE` export, sourced from `~/.claude/books/world-atlas-coffee.md` (Section 5: Brewing Science + Section 6: Brewing Methods). This fills the gap between what `BREWING_KNOWLEDGE` has (summary) and what the GPT prompt needs (methodology).

**What `BREWING_KNOWLEDGE` already covers (keep as-is):**
- Ratios, basic grind sizes, water quality, storage, one-liner method guidance

**What `HANDBREW_KNOWLEDGE` adds (new):**

```javascript
export const HANDBREW_KNOWLEDGE = `
HAND BREW METHODOLOGY (from James Hoffmann):

POUR-OVER TECHNIQUE (V60 / Chemex / Kalita / generic cone):
- Ratio: 60g per liter (starting point, experiment to preference)
- Grind: medium / caster sugar for ~30g/500g. Finer for single cup, coarser for larger volumes.
- Water temp: just off the boil (96-100C / 205-212F). Wait 10 seconds after kettle boils if pouring direct.
- Step 1: Rinse paper filter under hot water (reduces paper taste, warms device). Use bleached white papers.
- Step 2: Add coffee to brewer, place on scales.
- Step 3 (Bloom): Pour ~2x coffee weight in water. Pick up and swirl or stir to wet all grounds. Wait 30 seconds.
- Step 4: Slowly pour remainder of water directly onto coffee bed (NOT the walls). Weigh as you go.
- Step 5: When surface is 2-3cm below top, give gentle swirl (prevents grounds sticking to walls).
- Step 6: Let drip through until bed looks dry and relatively flat.
- Diagnostic: flat, even bed = good extraction. Sloped/cratered bed = channeling (pour more evenly).
- Troubleshooting: Bitter = grind coarser. Sour/weak/astringent = grind finer. Change ONE variable at a time.

FRENCH PRESS (Hoffmann's improved method):
- Ratio: 75g per liter
- Grind: medium (NOT coarse. Most people grind too coarse for French press.)
- Water temp: boiling, fresh, low mineral content
- Step 1: Add ground coffee, pour correct amount of water (weigh as you pour).
- Step 2: Leave to steep 4 minutes (coffee floats, forms crust).
- Step 3: After 4 minutes, stir the crust with a large spoon (coffee falls to bottom).
- Step 4: Scoop off remaining foam and floating grounds, discard.
- Step 5: Wait another 5 minutes (too hot to drink anyway; more silt sinks).
- Step 6: Place mesh plunger in top but DO NOT PLUNGE (plunging creates turbulence, stirs up silt).
- Step 7: Pour slowly through mesh. Stop before the very last bit (silt).

AEROPRESS:
- Ratio: 75g/L (regular cup) or 100g/L (short and strong)
- Grind: variable (finer = brew quicker, coarser = extend steep time)
- Water temp: just off the boil (10-20 seconds after kettle boils)
- Steep ~1 minute, quick stir, slowly push plunger down.
- Cannot make espresso (no 9-bar pressure). Makes small, strong cups.

EXTRACTION SCIENCE:
- Target: 18-22% extraction of ground coffee by weight.
- Under-extracted (below 18%): sour, sharp, lacking sweetness. Fix: grind finer, brew longer, hotter water.
- Over-extracted (above 22%): bitter, harsh, astringent. Fix: grind coarser, brew shorter, cooler water.
- The three pour-over variables are interdependent: grind size, contact time, amount of coffee.
- Finer grind = more extraction per unit time AND slower flow rate (more contact time). Double effect.
- Stirring/agitation increases extraction. Pour-over: gentle swirl. French press: stir at 4 min only.

ROAST-LEVEL ADJUSTMENTS:
- Light roasts: harder to extract. Use finer grind, hotter water (full boil OK). More extraction needed to develop sweetness.
- Medium roasts: standard parameters work well. Best starting point for new beans.
- Dark roasts: give up flavors easily. Use coarser grind, slightly cooler water. Risk of over-extraction and bitterness.

PROCESS ADJUSTMENTS:
- Washed: standard grind range. Clean extraction, predictable.
- Natural/honey: slightly coarser grind (higher solubility from fruit sugars). Can over-extract quickly.
- Expect more body and fruit from naturals, more clarity and acidity from washed.

WATER:
- Water is 98.5% of filter coffee by volume. It matters.
- Hard water = cups lacking nuance and sweetness. Soft to moderate ideal.
- Chlorinated = terrible. Use carbon filter at minimum.
- 0.1C temperature changes are undetectable. 1C is the smallest difference most people notice.

FILTER TYPES:
- Paper: cleanest cup, removes oils and suspended material. Clear liquid. Use bleached white (unbleached = papery taste).
- Metal: like French press, allows oils and small particles. Richer body, some sediment.
- Cloth: removes particles but allows some oil. Rich, full mouthfeel. Must store wet in fridge.
`;
```

**This constant gets injected into the hand brew GPT system prompt** (same pattern as `TASTING_KNOWLEDGE` is injected into the tasting coach prompt). The existing `BREWING_KNOWLEDGE` stays as-is for general chat use. `HANDBREW_KNOWLEDGE` is the detailed reference specifically for recipe generation.

**Also useful for:** The chat tasting coach could reference `HANDBREW_KNOWLEDGE` when users ask brewing questions, giving much better answers than the current `BREWING_KNOWLEDGE` summary.

#### Research Foundation

The hand brew recipe engine draws from four knowledge sources:

1. **`HANDBREW_KNOWLEDGE`** (`src/lib/coffeeKnowledge.js`, new export)
   - Detailed Hoffmann pour-over technique (multi-pour with water targets)
   - French press improved method (stir, skim, DON'T plunge)
   - AeroPress method
   - Extraction science (18-22% target, variable interdependence)
   - Roast-level grind adjustments (light = finer, dark = coarser)
   - Process adjustments (natural = slightly coarser)
   - Water and filter guidance

2. **`ORIGIN_PROFILES`** (`src/lib/coffeeKnowledge.js`, existing)
   - 35 origins with flavor characteristics, used to contextualize bean-specific tips

3. **Bean research output** (from shared `researchBean()`)
   - Cup-structure family, closest reference profiles, flavor expectations, extraction notes

4. **Grinder data** (from user preferences)
   - Grinder name and step ranges, injected into prompt so GPT gives recommendations in the user's notation

#### Tasks

##### 3.1 Hand Brew Recipe Generation

**Files:** `src/lib/handbrew.js` (new), `api/openai.js` (reuse existing proxy)

**Architecture:** Mirror the Aiden two-step pattern:

1. **`researchBean(bean)`** - Reuse extracted `researchBean()` from `lib/beanResearch.js`. Same GPT-5.4 Mini call, same research output. This data is grinder/brewer agnostic.

2. **`generateHandBrewRecipe(bean, research, preferences)`** - New function. Calls GPT-5.4 via `/api/openai` proxy with a Hoffmann-informed system prompt.

### Research Insights: Cache Research Results (Performance Oracle)

**Cache the research result on the bean document** after the first call. If a user already brewed with Aiden, the research data exists. Skip the first API call for hand brew, cutting latency in half:

```javascript
if (bean.aidenResearch) {
  // Skip researchBean(), use cached data
  return generateHandBrewRecipe(bean, bean.aidenResearch, preferences);
}
```

Persist research alongside existing data: `updateBean(bean.id, { aidenResearch: research })`.

**System prompt structure for hand brew:**

```
You are a specialty coffee brew guide trained on James Hoffmann's methods.

USER'S EQUIPMENT:
- Grinder: {preferences.grinder display name}
- Brew method: Pour-over (V60 / Chemex / Kalita / generic cone)

BEAN CONTEXT:
- {bean details: roaster, origin, process, variety, roast level}
- {research output: cupStructureFamily, flavor expectations, extraction notes}

HOFFMANN METHOD RULES:
- Pour-over ratio: 60g per liter (starting point)
- Water temperature: just off the boil (96-100C / 205-212F)
- Bloom: 2x coffee weight in water, wait 30 seconds
- Pour: slow, steady, directly onto coffee bed (not walls)
- Grind: medium (adjust finer if sour, coarser if bitter)
- Paper filter: always rinse first with hot water

GRIND SIZE RULES:
- Recommend grind size in the user's grinder's native notation
- {grinder-specific step ranges for pour-over from GRINDER_PROFILES}
- Light roasts: finer end of range (higher extraction needed)
- Dark roasts: coarser end of range (give up flavor easily)
- Natural/honey process: slightly coarser (higher solubility)
- Washed: standard range
- Also include approximate micron value (e.g., "~450um") for the recommended setting

OUTPUT FORMAT (JSON):
{
  "method": "pour-over",
  "coffeeGrams": number,
  "waterGrams": number,
  "ratio": "1:16.7",
  "grindSize": { "setting": "4.0", "description": "Medium-fine", "microns": 450 },
  "waterTemp": { "celsius": 97, "fahrenheit": 207 },
  "steps": [
    { "time": "0:00", "action": "Bloom: pour 60g water, swirl gently", "waterTotal": 60 },
    { "time": "0:30", "action": "First pour: slow spiral to 200g", "waterTotal": 200 },
    { "time": "1:15", "action": "Second pour: spiral to 350g", "waterTotal": 350 },
    { "time": "2:00", "action": "Final pour: to 500g, gentle swirl", "waterTotal": 500 },
    { "time": "3:00-3:30", "action": "Drawdown complete. Flat bed = good extraction.", "waterTotal": 500 }
  ],
  "totalBrewTime": "3:00-3:30",
  "tips": "Light roast from Ethiopia, expect floral/citrus. If tea-like, grind 1 step finer.",
  "title": "Ethiopian Yirgacheffe Pour-Over"
}
```

### Research Insights: Prompt Security (Security Sentinel)

**Sanitize bean fields before interpolation** into GPT prompts. User-controlled fields (name, origin, bagNotes, brewingRec) go directly into the prompt. Currently low risk (user injects into their own prompts), but sanitize for defense-in-depth:

```javascript
const safeName = (bean.name || '').slice(0, 100).replace(/[^\w\s\-'.,()]/g, '');
```

3. **`repairRecipe(parsed, preferences)`** - Deterministic post-processing:
   - Validate JSON parsed successfully
   - Validate required fields exist (coffeeGrams, waterGrams, steps)
   - Validate grind setting is within grinder's valid range (if known)

### Research Insights: Simplify repairRecipe (Code Simplicity)

The simplicity reviewer recommends keeping only two checks: JSON parse succeeded + required fields exist. Unlike Aiden (where wrong values mean wrong physical device settings), hand brew is instructions on a screen. If GPT says 95C instead of 97C, nothing breaks. The user taps "Regenerate" if the recipe looks off.

##### 3.2 Hand Brew Modal

**Files:** `src/components/HandBrewModal.jsx` (new)

Replaces AidenModal when `preferences.brewMethod === 'handbrew'`.

```
┌─────────────────────────────┐
│ < Hand Brew Recipe          │
│─────────────────────────────│
│                             │
│  Ethiopian Yirgacheffe      │
│  Pour-Over                  │
│                             │
│  ┌───────────────────────┐  │
│  │ 30g coffee  |  500g   │  │
│  │             |  water  │  │
│  │    Ratio: 1:16.7      │  │
│  └───────────────────────┘  │
│                             │
│  ┌───────────────────────┐  │
│  │ Grind: Ode Gen 2      │  │
│  │   Setting 4.0 (~450um)│  │
│  │   Medium-fine         │  │
│  └───────────────────────┘  │
│                             │
│  ┌───────────────────────┐  │
│  │ Water: 97C / 207F     │  │
│  └───────────────────────┘  │
│                             │
│  Steps                      │
│  ┌───────────────────────┐  │
│  │ 0:00  Bloom: 60g,     │  │
│  │       swirl gently    │  │
│  │                       │  │
│  │ 0:30  Pour to 200g    │  │
│  │       slow spiral     │  │
│  │                       │  │
│  │ 1:15  Pour to 350g    │  │
│  │                       │  │
│  │ 2:00  Pour to 500g    │  │
│  │       gentle swirl    │  │
│  │                       │  │
│  │ 3:00  Drawdown done   │  │
│  │       Flat bed = good │  │
│  └───────────────────────┘  │
│                             │
│  Light roast Ethiopian,     │
│  expect floral/citrus.      │
│  If tea-like, grind finer.  │
│                             │
│  [ Regenerate ]             │
│                             │
└─────────────────────────────┘
```

### Research Insights: Recipe Display (UX Research)

- **Linear step list, not horizontal timeline** (Timer.Coffee pattern, most coffee apps). Steps as vertical list, current step highlighted if timer is added later.
- **Large countdown timer** can be added later as enhancement. For V1, show static step times.
- **Pour weight target alongside time** (e.g., "Pour to 200g") is the most useful format per coffee app research.

### Research Insights: iOS Modal (iOS Design)

- Full-screen modal: `position: fixed; inset: 0; z-index: 1000; background: C.bg`
- Header: `padding-top: calc(env(safe-area-inset-top) + 8px)`
- Scrollable step content with fixed header
- Bottom padding: `calc(env(safe-area-inset-bottom) + 16px)`
- Avoid `box-shadow` on individual step cards (performance on older iPhones). Use subtle borders.
- Set `StatusBar.setStyle()` on mount, restore on unmount.

**Design:** Same Ghibli-warm aesthetic as AidenModal. Cream cards, Caveat headers, Nunito body. Amber accent for key metrics. Step timeline with vertical line connector (like a brew journal). No "Push to Aiden" button (hand brew is instructions only).

##### 3.3 Recipe Persistence

- Save hand brew recipe to bean document: `bean.handBrewRecipe = { ...recipe, generatedAt: timestamp }`
- Similar to existing `bean.aidenGrind` pattern
- Display saved recipe on BeanCard (if exists): "Last brew: Pour-over, 30g / 500g"
- Allow regeneration (new recipe replaces old)
- **Do NOT create a new subcollection.** Keep on the bean document.

### Research Insights: No Migration Needed (Data Integrity)

Firestore is schemaless. Existing beans without `handBrewRecipe` return `undefined`. Use optional chaining in all UI code: `bean.handBrewRecipe?.steps`. Bean doc size with recipe (~5KB) is well within the 1MB limit. Current beans are ~500 bytes.

**Optional index consideration:** If you later need to query beans that have recipes, add a boolean `hasHandBrewRecipe: true` alongside the recipe (Firestore can't efficiently query on map field existence).

##### 3.4 Conditional Brew Buttons

**Files:** `src/tabs/RotationTab.jsx`, `src/tabs/InventoryTab.jsx`, `src/tabs/ChatTab.jsx`, `src/components/BeanCard.jsx`

Read `preferences.brewMethod` from `UserPreferencesContext` via brew method registry:
- If `'aiden'`: render "Brew with Aiden" (current behavior, no changes)
- If `'handbrew'`: render "Hand Brew Recipe", trigger `generateHandBrewRecipe` instead of `useAidenBrew`

**ChatTab scan flow:** When a bean is scanned via chat and the user taps brew, respect the brew method preference. The ephemeral bean path (`handleBrewScanned` in ChatTab) must also branch on brew method.

##### 3.5 useHandBrew Hook

**Files:** `src/hooks/useHandBrew.js` (new)

Mirrors `useAidenBrew.js` pattern:
- State: `{ recipe, isResearching, isGenerating, error }`
- `generateRecipe(bean)`: calls `researchBean` then `generateHandBrewRecipe`
- `clearRecipe()`: resets state
- Saves recipe to bean doc on successful generation

### Research Insights: Fix Unmount Bug (Races Reviewer - existing issue)

**Both `useAidenBrew` and `useHandBrew` need cleanup guards.** The existing `useAidenBrew.js` has no cleanup. If user navigates away during generation, promises resolve and call `setState` on unmounted components. The Firestore write still executes but the user never sees the recipe.

**Fix for both hooks:**

```javascript
const mountedRef = useRef(true);
useEffect(() => () => { mountedRef.current = false; }, []);

const generateRecipe = async (bean) => {
  // ... setup ...
  const research = await researchBean(bean);
  if (!mountedRef.current) return; // bail if unmounted
  const recipe = await generateHandBrewRecipe(bean, research, preferences);
  if (!mountedRef.current) return;
  setRecipe(recipe);
  // ...
};
```

**Better UX:** Hoist brew state above tab level (into App or a context) so switching tabs doesn't destroy in-progress generation. When the user returns, their recipe is waiting. Generating and discarding costs API tokens and patience.

#### Phase 3 Acceptance Criteria

- [ ] `researchBean()` extracted to `lib/beanResearch.js` (shared by Aiden + HandBrew)
- [ ] Brew method registry (`lib/brewMethods.js`) used by all tabs
- [ ] "Hand Brew Recipe" button appears when brew method preference is "handbrew"
- [ ] Recipe generation uses GPT-5.4 with Hoffmann-informed prompt
- [ ] Recipe includes: grind size (in user's grinder notation + approximate microns), water temp, ratio, step-by-step pour guide
- [ ] Grind recommendation is calibrated to user's selected grinder
- [ ] HandBrewModal displays recipe with step timeline
- [ ] Recipe persists to bean document (viewable on BeanCard)
- [ ] Regeneration overwrites previous recipe
- [ ] ChatTab scan flow respects brew method preference
- [ ] Research results cached on bean doc (skip repeat API calls)
- [ ] Bean field sanitization in GPT prompts
- [ ] Both useAidenBrew and useHandBrew have unmount guards
- [ ] Error handling: friendly messages on generation failure, retry button

---

### Phase 4: Grinder Intelligence & Micron System

**Goal:** Validated grind-to-micron mappings for top 6 grinders, micron display mode.

**Depends on:** Phase 2 (grind display preference) and Phase 3 (grind recommendations reference grinder profiles)

### Research Insights: Simplification Decision (Code Simplicity - Major Finding)

**GPT-driven microns.** No client-side grinder database.

- GPT recipe output already includes `grindSize.microns` (added to the Phase 3 prompt)
- The grind display toggle switches between showing "Ode: 4.0" and "~450um" using data already in the recipe
- GPT already knows grinder step ranges. It handles this today for the Ode Gen 2.
- Zero new files, zero new data structures, zero research phase needed
- If GPT estimates prove inaccurate later, build client-side lookup tables then

#### Phase 4 Acceptance Criteria

- [ ] GPT recipe output includes `grindSize.microns` field
- [ ] Display toggle shows "Ode: 4.0" or "~450um" based on preference
- [ ] mu symbol renders correctly on web and iOS
- [ ] "Other" grinder shows descriptive text ("medium-fine, ~450um")

---

## Alternative Approaches Considered

### Auth
- **Firebase Anonymous Auth first, then link:** Would let users explore before signing in. Rejected because it complicates the data model (anonymous -> linked transitions) and the app's value requires a persistent account from the start (bean inventory is the core).
- **Clerk/Auth0 instead of Firebase Auth:** Would simplify multi-provider auth. Rejected because Firebase Auth is already integrated, works, and adding another service increases complexity and cost.

### Settings Storage
- **Firestore subcollection** (`users/{uid}/settings/preferences`): Rejected. Bounded preference set doesn't warrant subcollection overhead. Single doc is simpler and cheaper.
- **Local-only settings** (AsyncStorage/localStorage): Rejected. Settings must sync across web and iOS for the same account. Firestore provides this.

### Hand Brew Engine
- **Static recipe templates** (no AI): Rejected. The value of the app is personalized recipes based on bean characteristics.
- **Claude instead of GPT-5.4:** Both could work. GPT-5.4 chosen for consistency with Aiden (same model, same proxy, same error handling).
- **Multiple brew methods** (V60, Chemex, French press, AeroPress): Deferred. Start with pour-over. Expand later via user preference.

### Navigation
- **6th tab for Settings:** Rejected. Tab bar already at 5 icons, cramped on iPhone SE.
- **Hamburger menu / drawer:** Rejected. Doesn't match the app's simple, direct navigation pattern.

### Architecture (from Architecture Strategist)
- **Add a router:** Not needed yet. The app stays within modal/overlay territory. Trigger for adding a router: deep linking, browser back button for nested screens, or screen-level code splitting. None of these are required for this plan.
- **Platform abstraction layer** (`lib/platform.js`): Recommended as a pre-Phase-3 cleanup. Current platform branching exists in 9+ files with the same `if (Capacitor.isNativePlatform())` pattern. Consolidating into a single module prevents bugs as branches multiply. Not blocking, but reduces risk.

---

## System-Wide Impact

### Interaction Graph

1. **Sign-in** triggers `useAuth` -> creates/loads profile via `useUserProfile` -> populates contexts -> all preference-dependent components re-render
2. **Preference change** writes to Firestore (dot notation) -> `onSnapshot` fires (web) / optimistic local update (native) -> UserPreferencesContext updates -> affected components re-render
3. **Canister decrease** -> confirmation dialog -> atomic `writeBatch` (canister count + bean status) -> manual refetch on native -> RotationTab re-renders fewer slots -> InventoryTab shows returned bean
4. **Brew button tap** -> reads `preferences.brewMethod` (captured at tap time) -> routes to method via registry -> calls `researchBean` (shared, cached) -> calls method-specific generation -> displays in method-specific modal

### Error & Failure Propagation

- **Apple Sign-In failure:** SocialLogin plugin error -> caught in useAuth -> displayed on SignInScreen. No silent failures.
- **Profile doc write failure:** Retry 3x -> if persistent, show error toast and retry button. Do not navigate to app without a profile doc.
- **Multi-provider conflict:** `auth/account-exists-with-different-credential` -> prompt user to sign in with existing provider -> link credentials.
- **Recipe generation failure:** GPT API error -> caught in brew hook -> displayed in modal with retry button.
- **Canister overflow:** `writeBatch.commit()` fails -> nothing changes (atomic). Show error toast. Retry.

### State Lifecycle Risks

- **Partial onboarding:** User closes app mid-onboarding. `onboardingComplete: false`. On re-open, onboarding restarts with existing preferences pre-populated (not starting fresh).
- **Apple name loss:** Mitigated by localStorage stash + defensive backfill in onAuthStateChanged.
- **Stale preferences on native:** Profile loaded once at boot, updated optimistically in-app. No polling, no staleness risk for single-device use.
- **Mid-brew tab switch:** Brew state captured at tap time. Mounted-ref guards prevent setState on unmounted hooks.

### API Surface Parity

All brew-related UI must branch on `preferences.brewMethod` via the brew method registry:
- `RotationTab.jsx` brew button
- `InventoryTab.jsx` brew button
- `ChatTab.jsx` scan-then-brew flow
- `BeanCard.jsx` grind display
- Any future brew entry points must register in `lib/brewMethods.js`

---

## Dependencies & Prerequisites

| Dependency | Phase | Blocking? | Notes |
|-----------|-------|-----------|-------|
| Apple Developer "Sign in with Apple" capability | Phase 1 | Yes | Xcode + Apple Developer Portal |
| Firebase Console: Enable Apple auth provider | Phase 1 | Yes | One-time setup |
| Firestore security rule update (field validation) | Phase 1 | Yes | Deploy BEFORE any client code |
| API proxy security hardening (model allowlist, maxTokens cap) | Phase 1 | Yes | Fix existing vulnerability |
| Grind-to-micron research data | Phase 4B only | Yes (if Option B) | Not needed if using GPT-driven approach |
| GPT-5.4 prompt for hand brew | Phase 3 | Yes | Needs authoring + testing with real beans |
| Capgo OTA compatible (no native plugin changes in Phase 2-4) | Phase 2+ | No | Only Phase 1 (Apple capability) requires TestFlight |
| Terms of Service + Privacy Policy | Phase 1 | No (but needed before App Store submission) | Apple requires links on sign-in screen. Privacy Policy required for marketing consent to be legally valid. Draft in parallel with development. |

---

## Risk Analysis & Mitigation

| Risk | Severity | Mitigation |
|------|----------|------------|
| Apple name/email lost on first sign-in failure | High | localStorage stash immediately + defensive backfill + manual entry fallback |
| Canister decrease orphans active beans | High | writeBatch atomic operation (non-negotiable) |
| API proxy bill escalation via arbitrary model/maxTokens | High | Server-side allowlist + cap (fix before launch) |
| Firestore rules allow arbitrary field writes | High | Field-level validation with keys().hasOnly() |
| Existing user (Tal) loses data during migration | Medium | Migration only CREATES profile doc (merge:true), never touches beans/tastings |
| Hand brew prompt produces bad recipes | Medium | Basic field validation + "Regenerate" button. Test with 10+ real beans. |
| Grind-to-micron data inaccurate (if Option B) | Medium | GPT-driven approach (Option A) avoids this entirely |
| Multi-provider email conflict | Medium | Handle auth/account-exists-with-different-credential with user prompt |
| React re-render cascade from context | Low | Split contexts (Auth + Preferences), memoize values, shallow equality checks |
| Mid-brew preference switch | Low | Capture brewMethod at generation start, not from live context |

---

## Success Metrics

- **Auth:** >95% sign-in success rate across Google + Apple on both web and iOS
- **Onboarding:** >70% completion rate (benchmark: 60-80%). Measure by `onboardingComplete: true` rate.
- **Settings:** All preferences persist and reflect correctly across web + iOS
- **Hand brew:** Recipe generation <8 seconds (matching Aiden recipe speed). Regeneration <5 seconds (cached research).
- **Microns:** Display toggles correctly with no conversion errors

---

## Future Considerations

- **Email/password auth:** Can be added as a third option on SignInScreen
- **Multiple brew methods per user:** Let users select pour-over, French press, AeroPress, etc.
- **Interactive brew timer:** Add countdown timer to HandBrewModal steps (Timer.Coffee pattern)
- **Social features:** Username lays groundwork for sharing, tasting notes comparison
- **Grinder catalog expansion:** Start with 6, expand to 25+ based on user demand
- **User-contributed grind data:** Community grind database
- **Taste preference profiling:** Flavor preferences to influence recipe generation
- **Platform abstraction** (`lib/platform.js`): Consolidate 9+ files of platform branching into a single module

---

## Assets (Ready)

All illustrations generated in Ghibli-warm watercolor style, matching existing app assets.

| File | Used In | Description |
|------|---------|-------------|
| `public/images/onboarding-welcome.png` | OnboardingWizard | Ruphus in lab coat standing in doorway of coffee shop, welcoming the user in |
| `public/images/brew-aiden.png` | Onboarding brew method card | Fellow Aiden brewer (accurate design: black box, colorful display, dial, thermal carafe) |
| `public/images/brew-handbrew.png` | Onboarding brew method card | Copper gooseneck kettle pouring into V60 on glass carafe |
| `public/images/empty-rotation.png` | RotationTab empty state | Empty glass Atmos canister with copper lid on wooden shelf |
| `public/images/handbrew-icon.png` | HandBrewModal header | Top-down view of V60 dripper with coffee bloom swirl |

## Documentation Plan

- Update `CLAUDE.md` with new Firestore schema, new hooks, new components, brew method registry
- Update `PRD.md` with user profile data model and settings feature
- Add `.claude/rules/` entry for hand brew recipe conventions
- Update `firestore.rules` documentation in CLAUDE.md

---

## Sources & References

### Internal References
- Auth system: `src/hooks/useAuth.js`, `src/components/SignInScreen.jsx`
- Aiden brew engine: `src/lib/aiden.js` (800+ lines, reference for recipe architecture)
- Rotation slots: `src/tabs/RotationTab.jsx:55-57` (hardcoded `[1, 2, 3]`)
- Design system: `src/styles/theme.js` (colors, fonts, card patterns)
- Coffee knowledge: `src/lib/coffeeKnowledge.js` (Hoffmann-derived data)
- Grinder research: `~/Documents/Last30Days/most-common-coffee-grinders.md`
- Hoffmann brewing methods: `~/.claude/books/world-atlas-coffee.md` (Section 6: Brewing Methods)
- Aiden/Opus grind data: `~/Documents/Last30Days/fellow-aiden-opus-grinder-recipe-technique.md`

### External References
- Capgo Social Login (Apple): https://github.com/Cap-go/capacitor-social-login
- Firebase Apple Auth: https://firebase.google.com/docs/auth/web/apple
- Firebase Email Auth: https://firebase.google.com/docs/auth/web/password-auth
- Apple HIG Sign-In: https://developer.apple.com/design/human-interface-guidelines/sign-in-with-apple
- Apple Sign-In Button Guidelines: https://developer.apple.com/design/human-interface-guidelines/sign-in-with-apple/overview/buttons/
- Apple HIG Settings: https://developer.apple.com/design/human-interface-guidelines/settings
- Fellow Ode Gen 2 Grind Settings: https://help.fellowproducts.com/hc/en-us/articles/9962302561819
- Timer.Coffee (brew timer reference): https://www.timer.coffee/
- Trade Coffee Onboarding: https://www.drinktrade.com/onboarding/question/1
- Onboarding best practices: completion drops 15% per screen beyond 5 (Appcues/UserGuiding 2026)
- Coffee grind micron ranges: Honest Coffee Guide, Genuine Origin

### Lessons.md Constraints (must follow)
- WKWebView: use `browserLocalPersistence`, not IndexedDB
- WKWebView: use `getDocs` with polling, not `onSnapshot`
- Skip `getRedirectResult(auth)` on native
- Use `@capgo/capacitor-social-login`, NOT `@codetrix-studio/capacitor-google-auth`
- NEVER auto-run destructive Firestore operations
- NEVER delete user data as a workaround
- Ode Gen 2 light roast grind is 3.1-4.0 (NOT 5+)
