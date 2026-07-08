# chat-100x — Loop Completion Report

Run: 2026-07-07 21:30 → 2026-07-08 06:50 PT · Branch `loop/chat-100x` (off `redesign`) · 30 commits
Staffing: Fable orchestrator + design judge · Codex 5.5 code execution · fresh-codex adversarial review per phase · Fable final pixel review.

## Shipped

**Dev channel bundle `1.1.229-devapp.20260708143740`** (final) (Capgo `com.talmeltzer.coffeehub.dev`, dev channel — Tal's phone only). Production app users see nothing new.

## Phase results

- **Pre-flight** ✅ — "Tal" naming hotfix live on production (`1.1.230`, Vercel + Capgo production); firebase CLI verified non-interactive; `CapacitorWebFetch` confirmed in the native bridge.
- **Phase A (intelligence)** ✅ — Sonnet 5 chat (thinking disabled, per-model params), RUPHUS+TASTING knowledge in the cached prompt, sanitized first-name personalization, origin context, scan chip opens camera, coach chip opens the wizard (dedicated `onNavigateToTasting`, BrewTimer no-op preserved), scanned-bean dedupe+handoff with busy state, rotation-aware starters (compose-to-fit labels), scan truncation guard, ChatMessage extraction with UUID keys. Codex verdict PASS after 3 revisions (sanitization sweep closed the class).
- **Phase B (premium)** ✅ — `api/claude-stream.js` NDJSON endpoint (deferred headers, usage accumulation, close→abort, shared `RATE_LIMIT` with windowMs), `streamWithAuth` transport (CapacitorWebFetch, hold-back parser, typed errors, reader cancel), StreamingBubble (rAF flush, CSS entrances, role=log commit announcements), stick-to-bottom with touch-armed override + jump pill, tap-to-retry keeping partials out of model history, `useChatSession` persistence (hydration-gated LWW, unconditional idb mirror, injectable adapter, New chat), recipe cards (tabular-nums, °C units, busy states). Rules block deployed additive-only with recorded denial smokes. Codex verdict PASS after 1 revision (5 fixes).
- **Phase C (depth)** ✅ — palate summary (guarded axis math, sanitized descriptors), NEEDS_SEARCH two-pass (marker-only response, pass-two replaces pass-one, 900ms visible-query dwell, untrusted-data framing, https-only sources from groundingChunks). Codex verdict PASS after 1 revision (2 marker-leak paths closed).
- **Phase D (packaging)** — per-tier evidence gate built (`verify-chat-evidence.mjs --tier ab|c`); streaming endpoint cherry-picked to prod branch (API-only, prod web UI unchanged, 401 typed-JSON semantics verified live); dev bundle shipped.

## Gates at ship

`vite build` ✅ · `verify-chat` ✅ (14 assertions incl. streaming, persistence, search) · `verify-stream-parse` ✅ (15 fixtures) · full regression (tasting/inventory/archive/morph/wizard/audit) ✅ · codex judge PASS ×3 phases · transport evidence: `sim/chat/stream-curl-spike.txt` (prod domain, 11 chunks/~300ms) + `stream-webkit-spike.txt` (WebKit incremental).

## Evidence run (COMPLETE — 2026-07-08 morning)

Both per-tier gates PASS: `verify-chat-evidence --tier ab` (8 frames + curl transcript) and `--tier c` (2 frames). Captured live on iPhone 17 Pro + Pro Max simulators against the production API with Tal's real account: token streaming caught mid-word with caret, rotation-aware starter naming his actual bean, verbatim Aiden recipe recall addressing him by first name, cross-device conversation resume, live recipe card from a real model response, web search with visible query caption and a sourced answer that cross-referenced his own inventory, New chat reset, and the scan-chip camera path (no message sent).

Two real bugs found and fixed during the run: (1) dev-app Google sign-in crashed on a hardcoded PROD iOS client id in useAuth/reauth — now uses the variant-selected vite define (pre-existing bug, masked by never-expiring sessions); (2) transient pre-stream error bubbles persisted into the session doc — now flagged errored (excluded from persistence, gain tap-to-retry).

## Outstanding (needs Tal)

1. **Sim evidence frames (tier ab/c)**: the simulator reinstall reset the session; live-stream/persistence/search frames need a one-time Google sign-in on the booted iPhone 17 Pro sim (it runs the loop branch via vite on :5173; the ios config override + vite server are still up — revert `ios/App/App/capacitor.config.json` after). Captured so far: real-device demo frames (boot, demo rotation, chat intro/starters).
2. **v5 device sign-off** on the dev app (bundle label above, check Settings → OTA line): greeting uses YOUR name; starters reference your jars; Scan a bag opens camera; a question streams token-by-token; scroll-up mid-stream → jump pill; keyboard during stream; background+return mid-stream → partial+retry; recipe card → Brew/Save; kill+relaunch → conversation restored; New chat; roaster question → "Searching the web" + sourced answer.
3. **Known accepted outcomes**: pass-one marker turns record user-visible text (not raw marker) into model history; typing stays enabled mid-stream (send blocked, camera guarded); 2026-08-31 Sonnet 5 pricing recheck is a dated TODO.

## Overnight incident (root-caused, fixed)

A verify-chat failure at 12:09 AM hung for 6h: Codex's U11 broke the loader timing (streaming slot opened at pass start) AND the gate script couldn't exit (browser never closed on the failure path). Fixed: slot opens on first displayable text (keeps the search caption on stage), browser closed in `finally` + hard exit, 900ms caption dwell, ellipsis-aware assertion. Lessons recorded in `lessons.md`.

## Prod touches (all backend, all deliberate)

1. `1.1.230` naming hotfix (Vercel prod + Capgo production) — pre-loop precondition.
2. `chatSessions` Firestore rules block — additive-only (16+/0-), denial smokes recorded.
3. `/api/claude-stream` + `api/_lib/claudeShared.js` on prod Vercel — additive API the dev app requires (native clients call the prod domain); prod web UI byte-unchanged in behavior.
