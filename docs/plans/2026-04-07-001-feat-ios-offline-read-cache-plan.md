---
title: "feat: iOS Offline Read Cache via localStorage Shadow"
type: feat
status: active
date: 2026-04-07
origin: docs/brainstorms/2026-04-07-ios-offline-read-cache-requirements.md
---

# feat: iOS Offline Read Cache via localStorage Shadow

## Overview

The iOS app (Capacitor) cannot get past the loading screen without network because Firestore's persistent cache is disabled on native (IndexedDB hangs in WKWebView). This feature adds a localStorage shadow cache so the app renders previously-loaded data when offline.

## Problem Statement / Motivation

Every iOS cold start requires HTTP round-trips to Firestore for profile, beans, and tastings. With no network: profile load retries 3x then shows "Connection issue. Retrying..." forever. The app is unusable offline even though all the user wants is to browse their own data.

Firebase Auth already works offline on native via `browserLocalPersistence` (localStorage). The data layer just needs the same treatment.

(see origin: `docs/brainstorms/2026-04-07-ios-offline-read-cache-requirements.md`)

## Proposed Solution

**localStorage shadow cache** scoped to each hook on native only:

1. After every successful Firestore read on native, write the data to localStorage (uid-scoped keys)
2. On boot, each hook loads cached data first (instant render), then attempts network fetch
3. If network succeeds, state + cache update silently
4. If network fails, the app stays on cached data
5. Write actions that fail offline show an inline error at the point of failure

No changes to web (already has Firestore persistent cache). No offline writes or sync queuing.

## Technical Approach

### Architecture: Hook-Level Cache (each hook manages its own)

This matches the existing pattern where `useUserProfile` and `useAppData` each independently manage their data lifecycle on native. No wrapper, no new context, no coordination layer.

**Cache key structure** (uid-scoped to prevent data leaks between accounts):
- `tmb_profile_{uid}` - profile object
- `tmb_beans_{uid}` - beans array
- `tmb_tastings_{uid}` - tastings array

**Cache utility** (`src/lib/offlineCache.js`):
- `cacheWrite(key, data)` - JSON.stringify + setItem, try/catch (silent fail)
- `cacheRead(key)` - getItem + JSON.parse, try/catch (returns null on failure)
- `cacheClear(uid)` - remove all keys for a uid (call on sign-out)
- All functions are no-ops on web (`Capacitor.isNativePlatform()` guard)

### Implementation Phases

#### Phase 1: Cache Utility + Profile Cache

**Files:** `src/lib/offlineCache.js` (new), `src/hooks/useUserProfile.jsx`

1. Create `src/lib/offlineCache.js` with `cacheWrite`, `cacheRead`, `cacheClear`
2. In `useUserProfile` native path (line 48-71):
   - Before `getDoc`, call `cacheRead('tmb_profile_' + uid)`
   - If cache exists: `setProfile(cached)`, `setLoaded(true)` immediately
   - Still call `getDoc` in background. On success: update state + `cacheWrite`
   - On failure (all 3 retries exhausted): if profile was already set from cache, do NOT set `loadError` (the cached profile is good enough). If no cache existed, set `loadError` as before.
3. Write to cache after every successful `getDoc` response

**Risk mitigation:** The existing `loadError` gate (main.jsx:53) only triggers if both network AND cache fail. Online behavior is unchanged because `getDoc` succeeds and overwrites any cached state.

#### Phase 2: Beans + Tastings Cache

**Files:** `src/hooks/useAppData.js`

1. In native `fetchData` function (line 60-72):
   - Before `getDocs`, read from cache
   - If cache exists: set state immediately, `setLoaded(true)`
   - Still call `getDocs`. On success: update state + write cache
   - On failure: if state was already set from cache, keep it. If no cache, empty arrays (same as today)
2. **Fix the 5-second safety timeout race** (line 74): Before the timeout sets `loaded(true)` with empty data, check if cache was already loaded. If cache loaded, the timeout is harmless (loaded is already true). If no cache, timeout fires as before.
3. Write to cache after every successful poll result too (lines 86-91), so the cache stays fresh

#### Phase 3: LoadingScreen Message Prop + First-Launch UX

**Files:** `src/components/LoadingScreen.jsx`, `src/main.jsx`

1. Fix `LoadingScreen` to accept and render an optional `message` prop (it currently ignores it despite main.jsx passing one at line 53)
2. For first-ever launch with no network and no cache: the app already shows "Connection issue. Retrying..." after profile retry exhaustion (Gate 3b). With the message prop fix, this will actually display. No further change needed.

#### Phase 4: Offline Error Handling for Write Actions (R3)

**Files:** Multiple tab/component files

Network-dependent actions that need try/catch with user-visible errors:

| Action | File | Current handling |
|--------|------|-----------------|
| Save tasting (from chat) | `TastingTab.jsx` (`saveChatTasting`) | No try/catch |
| Add bean | `AddBeanForm.jsx` | Needs audit |
| Update bean (jar slot, status) | `RotationTab.jsx` | Has try/catch |
| Finish/return bean | `RotationTab.jsx` | Has try/catch |
| Delete tasting | `TastingTab.jsx` | Needs audit |
| Update profile/preferences | `SettingsPage.jsx` | Needs audit |
| Fellow account connect | `SettingsPage.jsx` | Has try/catch |

**Approach:** Wrap each unhandled mutation call in try/catch. On error, show an `alert()` or inline error state with "Couldn't save. Check your connection and try again." No need for a network pre-check (`navigator.onLine` is unreliable on iOS).

AI features (chat, Aiden, scan) already have error handling in their respective hooks (`useAidenBrew`, `useHandBrew`, `useProfessorRuphus`, and the chat handler in `ChatTab`).

#### Phase 5: Cache Cleanup on Sign-Out

**Files:** `src/main.jsx` or `src/hooks/useAuth.js`

Call `cacheClear(uid)` when the user signs out. This prevents stale data from one account being shown if a different user signs in on the same device.

## Acceptance Criteria

- [ ] iOS app opens to last-viewed beans/tastings/profile when launched with no network (after at least one prior online session)
- [ ] Online boot time is not measurably slower (cache read is a fast synchronous localStorage call)
- [ ] After online data loads, cache is updated silently in the background
- [ ] First-ever launch with no network shows "Connection issue" message (not blank loading screen)
- [ ] Signing out clears the cache for that user
- [ ] Attempting to save/edit while offline shows a user-visible error, not a silent failure
- [ ] AI features already handle network errors gracefully (verify, no new work needed)
- [ ] Web PWA behavior is completely unchanged (all cache code is gated on `isNativePlatform()`)
- [ ] No data leaks between different user accounts on the same device

## Dependencies & Risks

**Low risk:**
- localStorage is already proven on native (Firebase Auth uses it)
- Data sizes are small (personal coffee inventory, well under 5MB quota)
- All changes are additive and gated behind `isNativePlatform()`

**Medium risk:**
- The 5-second safety timeout in `useAppData` could race with cache loading if not handled correctly (Phase 2 addresses this explicitly)
- Write error handling audit (Phase 4) touches multiple files, needs careful testing

**Testing approach:**
- Build to simulator, verify normal online flow works identically
- Enable airplane mode, cold-launch, verify cached data renders
- Test sign-out + sign-in with different account
- Test write actions while offline (toast/alert appears)

## Sources & References

### Origin
- **Origin document:** [docs/brainstorms/2026-04-07-ios-offline-read-cache-requirements.md](docs/brainstorms/2026-04-07-ios-offline-read-cache-requirements.md) — Key decisions: localStorage over IndexedDB, read-only offline, no offline banner, errors only on action attempt

### Internal References
- `src/firebase.js:32-33` — Firestore persistent cache disabled on native
- `src/hooks/useAppData.js:57-113` — Native data loading with getDocs + polling
- `src/hooks/useUserProfile.jsx:48-71` — Native profile loading with retry
- `src/main.jsx:43-85` — Boot gate sequence
- `src/hooks/useAuth.js:23-24` — Auth uses browserLocalPersistence (localStorage works on native)
- `lessons.md:7-9` — WKWebView IndexedDB/WebSocket hang lessons

### Institutional Learnings Applied
- IndexedDB unreliable in WKWebView (lessons.md:7) — confirmed, using localStorage instead
- Distinguish load errors from missing data (docs/solutions/logic-errors/native-profile-load-failure) — cache fallback must not mask "profile doesn't exist" for genuinely new users
- Guard boot-sequence side effects with useRef (docs/solutions/runtime-errors/async-side-effect-during-react-render) — cache reads are synchronous, but any async cache-then-fetch pattern must not re-trigger on re-render
