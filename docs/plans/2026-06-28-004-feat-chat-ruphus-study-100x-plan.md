# Chat Tab — "Professor Ruphus's Study" 100x

**Branch:** `redesign` → Capgo `dev` channel only. Production untouched.
**Date:** 2026-06-28
**Constraint (standing):** Don't touch Firebase or any AI/proxy logic (claude/gemini libs, the
chat context builder, bean-scan/extract markers, image pipeline). Don't lose any feature. Full
reign on UI/UX. iOS keyboard + safe-area handling must keep working.

## Problem Frame

The Chat tab is Professor Ruphus — the app's coffee expert — but the design reads as a generic
SaaS chatbot. Same slop tells as the other tabs plus chat-specific ones (from the audit):
- "AI Chat" **eyebrow over the "Coffee Chat" H1** + a decorative **gradient rule** (no purpose).
- **Generic gradient chat bubbles** (caramel-gradient user bubble) and a plain cream assistant card
  with **no avatar / no character** — Ruphus is invisible in his own chat.
- The most generic possible **3-bouncing-dots typing indicator** (zero personality).
- **Non-interactive** `accentSoft` "hint chips" (they look tappable but do nothing).
- A **gradient send button**, default Lucide icons, and "Ask Professor Ruphus…" SaaS voice.

Goal: turn the Chat into **Professor Ruphus's study** — characterful and unmistakably this app:
the mascot present on his messages, editorial bubbles, a "Ruphus is thinking" indicator with
personality, **tappable** starter prompts, and a beautiful scanned-bean result card. Preserve every
capability (text, photo analysis, bean scan → brew/tasting/save routing, streaming, context, paywall,
iOS keyboard).

## Direction (decided with Tal)

"Professor Ruphus's study" — lean into the character (mascot avatar on his messages, warm editorial
bubbles, a characterful thinking indicator, tappable starters). Restrained, not cartoonish; gold stays
scarce.

## Design System (design-bank spine + motion-library + mascot pattern)

- **Ruphus present:** his assistant messages carry the mascot avatar (the [[feedback_mascot_video_implementation]]
  / ruphus-avatar pattern) so it reads like a conversation with a character, not a bot.
- **Editorial bubbles:** assistant = clean cream card with a hairline + Ruphus avatar; user = solid
  accent (no gradient), asymmetric radius. Real type (Nunito body, Fraunces for any display).
- **Characterful thinking:** replace the 3-dot indicator with a "Ruphus is thinking" treatment using the
  mascot + a calm transform/opacity animation (no generic bounce).
- **Tappable starters:** the intro starter prompts become real buttons that send the prompt (currently
  dead). Neutral surfaces, gold only on press/active.
- **Scanned-bean result:** the scan result renders as a refined editorial card (bag/title/notes) with its
  Brew / Guided Tasting / Save actions cleanly styled.
- **Composer:** solid send button (no gradient), clean input, haptics on send; keep camera + photo strip.
- **Scarcity + materials:** gold = send/primary + one active state only; no gradient chrome, no glow,
  hairlines, glass kept for the floating input only.
- **Motion:** message reveal (transform/opacity), spring + haptics; reduced-motion gated.

## Requirements Trace

- **R1** — Header de-slop: no "AI Chat" eyebrow-over-H1 and no gradient rule; a clean Fraunces title +
  subtitle.
- **R2** — Assistant messages render with the **Ruphus mascot avatar** + an editorial bubble; **user
  bubbles are solid** (no gradient), keeping the asymmetric chat shape.
- **R3** — The typing indicator is a characterful "Ruphus is thinking" treatment (mascot + calm
  transform/opacity motion), not the generic 3-bouncing-dots.
- **R4** — The intro/empty state is a warm "study" intro with Ruphus and **tappable starter prompts**
  that actually send their prompt (currently non-interactive).
- **R5** — A scanned bean renders as a refined editorial result card with its Brew / Guided Tasting /
  Save actions preserved and cleanly styled.
- **R6** — Composer de-slop: solid send button (no gradient), clean input + camera + photo strip, with a
  haptic on send; iOS keyboard + safe-area behavior unchanged.
- **R7** — Motion: message reveal + spring + haptics, all transform/opacity-only and reduced-motion
  gated; scroll/auto-scroll behavior preserved.
- **R8** — Gold scarce (send/primary + one active state); no gradient chrome, glow, or accentSoft
  structural fills; hairline borders.
- **R9** — Every feature preserved: send text, attach + analyze photos (up to 3), streaming/typing,
  message history caps, bean scan → Brew/Tasting/Save routing, the Aiden/HandBrew modals, chat context,
  the Pro/paywall gate, and all iOS keyboard/scroll handling — no AI/data/Firebase logic touched.

## Scope Boundaries (do NOT touch)

- `api/`, `src/firebase.js`, contexts, the message/scan/extract parsing, the chat context builder
  (`buildChatContext`), `lib/claude.js` / `lib/gemini.js` send + image pipeline, the Aiden/HandBrew hooks
  — reskin their output only.
- iOS keyboard handling (`useNativeKeyboard`), safe-area math, fixed input-bar positioning, scroll/
  auto-scroll, blob-url cleanup — reuse verbatim; only restyle.
- Photo compression/analysis, the 50/20 message caps, the demo/paywall gating — unchanged.
- Do not deploy to production or merge to main (dev channel only).

## Key Technical Decisions

- **KTD-1 (avatar source):** reuse the existing `ruphus-avatar.png` for assistant messages + the thinking
  indicator (the mascot pattern); no new assets required.
- **KTD-2 (tappable starters, additive):** wire the existing starter strings to the existing send
  handler (they already exist as display chips) — presentation + an onClick, no new flow.
- **KTD-3 (solid buttons):** the send button is inline — switch to solid accent; the shared `.btnp-primary`
  is already solid (from the Tasting loop), so scanned-bean `Btn` actions are already de-gradiented.
- **KTD-4 (motion gating):** `useReducedMotion` gates message reveal + the thinking animation; honor the
  app-wide `MotionConfig`; haptics via `lib/haptics`.
- **KTD-5 (scan card, presentation-only):** restyle the scanned-bean action block into a card without
  changing the scan parsing or the Brew/Tasting/Save handlers.

## Implementation Units

- **U1** — Header de-slop (R1): kill eyebrow + gradient rule; clean title + subtitle.
- **U2** — Message bubbles (R2): Ruphus avatar on assistant messages, editorial bubble styling, solid
  user bubbles.
- **U3** — Characterful thinking indicator (R3): mascot + calm transform/opacity motion.
- **U4** — Intro "study" + tappable starters (R4): warm intro, real starter buttons that send.
- **U5** — Scanned-bean result card + composer de-slop (R5, R6): refined result card; solid send button;
  haptic on send.
- **U6** — Motion pass (R7): message reveal + spring + haptics, reduced-motion gated.
- **U7** — Verify harness + gates: `scripts/verify-chat.mjs` (header de-slop, assistant avatar present,
  no gradient on user bubble/send, tappable starters, characterful thinking on loading, reduced-motion,
  zero errors); run build + verify-chat + verify-archive/inventory/morph regressions + codex + on-device.

## Verification Strategy

- **Programmatic:** `npx vite build` exit 0; `node scripts/verify-chat.mjs` PASS (Playwright over a
  committed chat-harness with seeded mock messages + a loading state, no live AI): no "AI Chat" eyebrow
  and no gradient rule in the header; assistant messages show the Ruphus avatar; the user bubble and send
  button are solid (no gradient backgroundImage); the intro starter prompts are real buttons; the typing
  state shows the characterful indicator (not bare 3-dots); reduced-motion renders without error; zero
  console/page errors. `verify-archive.mjs` + `verify-inventory.mjs` + `verify-morph.mjs` still PASS.
- **Judge (codex):** scoped review (redesign baseline approved); rubric = all slop tells gone (eyebrow,
  gradient rule, gradient bubbles/send, dead hint chips, generic dots), Ruphus is present + characterful,
  starters are tappable, the scan card + all routing preserved, motion transform/opacity-only +
  reduced-motion gated, gold scarce, and NO AI/data/Firebase/keyboard logic changed.
- **Human:** on-device sign-off via `/ship-dev` — the Chat feels like Professor Ruphus's study, the
  keyboard/photo/scan flows still work.

## Requirements Trace → Evidence

| Req | Proven by |
|---|---|
| R1 header de-slop | verify-chat (no eyebrow/gradient rule) + human |
| R2 avatar + solid bubbles | verify-chat (avatar present, no gradient bubble) + human |
| R3 characterful thinking | verify-chat (indicator on loading) + judge |
| R4 tappable starters | verify-chat (starters are buttons) + human |
| R5 scan result card | judge (routing preserved) + human |
| R6 composer de-slop | verify-chat (solid send) + human (keyboard/photo) |
| R7 motion | verify-chat (reduced-motion) + judge |
| R8 scarcity | judge |
| R9 features preserved | judge (diff audit) + human (send/photo/scan/keyboard) |

## Risks

- **Reskinning the message map breaking streaming/scan parsing** → presentation-only; do not touch the
  message/marker/scan logic; codex audits; human runs a real chat + scan.
- **Avatar on every assistant message feeling heavy** → small avatar, only on assistant turns; human
  sign-off catches it.
- **Harness can't drive live AI** → cover header/intro/bubbles/loading-state/starters statically; live
  send/scan is codex + human (documented, not silently skipped).
- **iOS keyboard/safe-area regressions** → reuse the existing hook + math verbatim; human verifies on
  device with the keyboard open.
