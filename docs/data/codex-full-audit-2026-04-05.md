# Codex Full Codebase Audit — 2026-04-05

GPT-5.4 (Codex) reviewed the entire `src/` and `api/` directories of Coffee Hub for architectural issues, security gaps, and design problems.

---

## Critical

| # | Finding | File |
|---|---------|------|
| 1 | API auth fails open when `FIREBASE_SERVICE_ACCOUNT` env var is missing. All proxies become public endpoints in any misconfigured deployment. | `api/lib/cors-auth.js` |

## High

| # | Finding | File |
|---|---------|------|
| 2 | Proxies authenticate callers but never authorize, quota, or audit by `uid`. Any signed-in user gets full AI surface access. | `api/openai.js`, `api/claude.js`, `api/gemini.js`, `api/aiden.js` |
| 3 | Shared Fellow account (`FELLOW_EMAIL`/`FELLOW_PASSWORD`) with no user-to-device binding. Any authenticated caller can create profiles on that shared account. | `api/aiden.js` |
| 4 | **Broken imports**: imports `HANDBREW_POUROVER_KNOWLEDGE` but the actual export is `HANDBREW_KNOWLEDGE`. Also references `GRINDER_LABELS` without importing it. Possible runtime break. | `src/lib/handbrew.js` lines 7-8 |
| 5 | "Save to Inventory" from chat writes beans without `degasMin`, `peakStart`, `peakEnd`, or `guidance`, causing `NaN`-driven freshness labels in `peakStatus.js`. | `src/tabs/ChatTab.jsx` lines 244-266 |
| 6 | `openBean()` slot assignment is not transactional. Concurrent actions can produce duplicate slot assignments. | `src/hooks/useAppData.js` lines 193-208 |

## Medium

| # | Finding | File |
|---|---------|------|
| 7 | `onSnapshot` listeners lack error callbacks. App can hang in loading state on permission/network failures. | `src/hooks/useAppData.js` |
| 8 | Settings and Onboarding hardcode brew method lists instead of using the brewMethods.js registry. | `src/components/SettingsPage.jsx`, `src/components/OnboardingWizard.jsx` |
| 9 | `OpenBeanFlow.jsx` hardcodes slots `[1, 2, 3]` but preferences support `canisterCount` up to 6. | `src/components/OpenBeanFlow.jsx` |
| 10 | Modals lack `role="dialog"`, `aria-modal`, focus trapping, and keyboard dismiss handling. | Modal system (`src/components/Modal.jsx`) |
| 11 | Async hooks don't cancel stale in-flight requests. Late responses can overwrite current modal state. | `src/hooks/useProfessorRuphus.js`, `src/hooks/useAidenBrew.js`, `src/hooks/useHandBrew.js` |
| 12 | `fetchWithRetry.js` does not retry network exceptions (DNS, TLS), only specific HTTP status codes. | `src/lib/fetchWithRetry.js` |
| 13 | Client silently drops auth header on token retrieval failure, then sends the request anyway. | Client fetch helpers |
| 14 | `SettingsPage.jsx` bypasses domain hooks for direct Firestore writes, creating coupling and cache divergence risk. | `src/components/SettingsPage.jsx` |

## Low

| # | Finding | File |
|---|---------|------|
| 15 | Auth loading forcibly clears after 3 seconds even if Firebase hasn't resolved, risking false signed-out states on slow native startup. | `src/main.jsx` |
| 16 | `LoadingScreen.jsx` ignores the `message` prop passed from `main.jsx`. | `src/components/LoadingScreen.jsx` |

---

## Recommended Priority

1. **Fail-open proxy auth** (#1) — verify `cors-auth.js` behavior when env var is missing
2. **Broken handbrew.js imports** (#4) — verify if this is a real runtime break
3. **Non-transactional slot assignment** (#6) — concurrent openBean() can produce duplicate slots
4. **ChatTab missing bean fields** (#5) — beans saved from chat cause NaN freshness
5. **OpenBeanFlow hardcoded slots** (#9) — only shows 3 slots even if user has 4-6 canisters
