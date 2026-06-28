# Archive — Editorial 100x (tasting-as-hero, featured cups, editorial timeline)

**Branch:** `redesign` → Capgo `dev` channel only. Production untouched.
**Date:** 2026-06-28
**Constraint (standing):** Don't touch Firebase or any data/logic/API. Don't change features
(Restore, Delete, Learn, Edit photo, brew-profile, tasting history all preserved). Full reign on UI/UX.

## Problem Frame

The first Archive pass de-slopped the chrome and wired the hero morph (signed off on device).
But Twitter still calls the *main layout* vibe-coded slop, and Tal is right about why: the Archive
is the record of his **tasting journey**, yet the layout buries the journey and foregrounds chrome.
Three inversions:
1. **The rating — the whole point — is hidden.** The card shows "Your Tastings · N" (a dead count),
   and the back panel omits the star rating entirely. The most emotional data is the least visible.
2. **Redundant disclosure** — a "Show Details" expander and per-row flavor-tag chips add noise; the
   full detail is one tap away in the morph card anyway.
3. **A uniform card list** — every row identical in size/shape (the mobile equivalent of "identical
   KPI cards four-across"). No hierarchy → nothing reads as designed.

Goal: make the **tasting the hero** of every entry, keep Tal's structure (**fav cups highlighted on
top, the rest chronological**), and give the page genuine editorial hierarchy + iOS-native motion so
it reads Apple-caliber, not slop. Tap still flies the bag into the trading card (existing morph).

## Direction (decided with Tal)

Editorial Feature richness on the existing cups-on-top + chronological structure: highlight favourite
cups at the top, the rest chronological below, tasting-led entries throughout. (Tal's "what were you
sipping 6 months ago / this month last year" throwback is deferred to a fast-follow — see Scope.)

## Design System (design-bank spine + motion-library)

- **Tasting-as-hero:** each entry leads with **★ rating + one-word + a pull-quote** from the bean's
  best (or most recent) tasting note. Rating uses the scarce gold accent; the pull-quote uses Fraunces
  italic at a real display size — editorial, not a chip.
- **Hierarchy via size variation:** a featured treatment for the top fav cup(s); standard entries
  smaller. Kills the uniform-list tell (`01-anti-slop`).
- **Motion (motion-library):** `whileInView` scroll-reveal with `stagger` (30–80ms) for entries;
  `useScroll`-driven **parallax** on bag thumbnails; **spring** physics (`bounce ≤ 0.2`) + **haptics**
  on tap; sticky/pinning **year headers**. Transform/opacity only, ≤300ms or spring, reduced-motion
  gated. Reuse the existing hero morph for tap-through.
- **Type/number/material discipline:** Fraunces display + Nunito body, `tabular-nums` on every count,
  hairline grouping, warm surface ladder, gold ≤10% (rating + one active state). (`03/04/06`.)
- **Declutter:** remove the row "Show Details" expander and the row flavor-tag chips — the morph card
  is the detail surface.

## Requirements Trace

- **R1** — Tasting-as-hero: every archive entry (featured cup + timeline row) leads with its **★
  rating + one-word + a tasting pull-quote**, derived from the bean's best/most-recent tasting; when a
  bean has no tasting, it degrades gracefully (no empty hero).
- **R2** — Trading-card back surfaces the **full tasting per session** — rating stars + aroma/body/
  finish + notes — and is no longer a dead "· N" count; multiple sessions are each shown/expandable.
- **R3** — Declutter: the per-row "Show Details" expander and per-row flavor-tag chips are removed
  (detail lives in the morph card).
- **R4** — Favourite cups stay highlighted **on top**, elevated to an editorial featured treatment
  (rating + pull-quote, the lead cup emphasized at a larger size), horizontally browsable.
- **R5** — The rest is **chronological** below, year-grouped, each entry restyled editorial
  (rating-led, pull-quote, larger bag), with **year headers that pin** while their section scrolls.
- **R6** — iOS-native motion: scroll-reveal **stagger**, **parallax** bag thumbnails, **spring** +
  **haptics** on tap; all transform/opacity-only, ≤300ms or spring (bounce ≤0.2), **reduced-motion**
  disables parallax/reveal and the morph.
- **R7** — Tap any entry → existing **hero morph** into the trading card (bag flies from the tapped
  thumbnail); the card back now shows the full tasting (R2).
- **R8** — Search + every filter (year, min-rating, roaster, origin, process, sort) still filter both
  the featured cups and the timeline; the three empty states are preserved.
- **R9** — No Firebase/data/logic/API touched; no feature lost (Restore/Delete/Learn/Edit/brew-profile/
  tastings); additive `BeanDetailCard` changes don't regress Rotation/Inventory.

## Scope Boundaries (do NOT touch)

- `api/`, `src/firebase.js`, `src/hooks/useAppData.js`, contexts, the bean/tasting data model, any
  Firestore call. Read tasting fields (rating/oneWord/notes/aroma/body/finish/method/date) only.
- The morph mechanism (`BeanDetailCard` FLIP internals) — reuse; only additive changes (full-tasting
  panel) behind existing/new optional props so Rotation/Inventory don't regress.
- Restore/Delete/finish/restore semantics — reuse existing `updateBean`/`deleteBean` calls verbatim.
- **Deferred to a fast-follow (NOT this loop):** the "time machine" throwback module ("what were you
  sipping 6 months ago / this month last year"). Note it; don't build it here.
- Do not deploy to production or merge to main (dev channel only).

## Key Technical Decisions

- **KTD-1 (best-tasting selector):** add a pure helper deriving each bean's hero tasting (highest
  rating, tie-broken by most recent) → `{rating, oneWord, note}` for the entry hero; memoized per
  bean. No data writes.
- **KTD-2 (full-tasting on card back, additive):** extend `BeanDetailCard`'s "Your Tastings" panel to
  render rating stars + aroma/body/finish + notes per session, expandable. Additive — Rotation/
  Inventory already pass `tastings`, so they benefit identically with no regression (verified by the
  existing harnesses).
- **KTD-3 (pinning year headers):** use `position: sticky` within the tab's scroll container; if the
  container doesn't permit sticky, fall back to a `useScroll`-driven pinned header. Verify on device.
- **KTD-4 (parallax/reveal):** `useScroll` + `useTransform` mapping scrollY → small `y` on bag images
  (transform-only); `whileInView` + `stagger` for entry reveal; all gated by `useReducedMotion`.
- **KTD-5 (featured vs standard):** a single `ArchiveEntry` renders at two sizes (`featured` |
  `standard`) to get hierarchy without divergent components.
- **KTD-6 (accent scarcity):** gold stays scarce — rating + one active filter state only; pull-quotes
  and structure are neutral/ink.

## Implementation Units

- **U1** — Best-tasting selector helper + entry "tasting hero" snippet (rating + one-word + pull-quote),
  shared by featured cups and timeline (R1).
- **U2** — `BeanDetailCard` full-tasting panel: stars + aroma/body/finish + notes per session,
  expandable; kill the dead "· N" feel (R2, additive).
- **U3** — Declutter the timeline row: remove "Show Details" + flavor-tag chips (R3).
- **U4** — Featured cups section: editorial treatment, lead cup emphasized, rating + pull-quote (R4).
- **U5** — Editorial chronological timeline: rating-led rows, larger bag, pull-quote, pinning year
  headers (R5).
- **U6** — Motion pass: scroll-reveal stagger + parallax bags + spring/haptics on tap, reduced-motion
  gated (R6, R7-morph preserved).
- **U7** — Verify harness + gates: extend `scripts/verify-archive.mjs` (tasting-hero present, no
  Show-Details/flavor-tags, featured-on-top + chronological, tap→morph, reduced-motion, zero errors);
  run build + verify-archive + verify-inventory/verify-morph regressions + codex + on-device sign-off.

## Verification Strategy

- **Programmatic:** `npx vite build` exit 0; `node scripts/verify-archive.mjs` PASS (Playwright over
  the committed harness with tasting data): each entry shows a ★ rating + pull-quote; NO "Show details"
  control and NO row flavor-tag chips remain; featured cups precede the timeline; timeline is
  year-grouped + chronological; tap → morph (≥3 flight frames); search/filter reduce visible entries;
  reduced-motion opens the card without flight; zero console/page errors. `verify-inventory.mjs` +
  `verify-morph.mjs` still PASS (no `BeanDetailCard` regression).
- **Judge (codex):** scoped review treating the redesign baseline as approved; rubric = the three
  inversions are fixed (rating visible + pull-quote led; no redundant disclosure; real size hierarchy),
  motion is transform/opacity-only ≤300ms/spring with reduced-motion gating, gold stays scarce, no
  feature regressed, additive card changes don't regress Rotation/Inventory, no data/logic touched.
- **Human:** on-device sign-off via `/ship-dev` — the Archive layout now feels Apple-caliber and the
  tasting (rating + words) is the visible star.

## Requirements Trace → Evidence

| Req | Proven by |
|---|---|
| R1 tasting-as-hero | verify-archive (rating + pull-quote per entry) + human |
| R2 full tasting on card back | judge (parity + stars/aroma/body/finish) + human |
| R3 declutter | verify-archive (no Show-Details / no row flavor-tags) |
| R4 featured cups on top | verify-archive (cups precede timeline) + human |
| R5 editorial timeline + pinning | judge + human |
| R6 motion (reveal/parallax/spring/haptics) | verify-archive (reduced-motion) + judge + human |
| R7 tap→morph | verify-archive (flight frames) |
| R8 search/filter + empty states | verify-archive (filter reduces count) + judge |
| R9 no data/logic touched; no regression | judge (diff audit) + verify-inventory/verify-morph |

## Risks

- **Pinning headers inside the tab scroll container** may not honor `position: sticky` → KTD-3
  fallback to a scroll-driven pinned header; human verifies on device.
- **Parallax/reveal jank on older iPhones** → transform-only, small ranges, reduced-motion gate; keep
  it subtle (`06`/`05`).
- **Pull-quote with no tasting note** → degrade to rating + one-word, or origin·process; never an
  empty quote.
- **Additive card-panel change regresses Rotation/Inventory** → reuse existing `tastings` prop; gate
  any new affordance; re-run both regression harnesses.
- **Over-animation reading game-like** → bounce ≤0.2, ≤300ms, one motion idea per surface; human catches it.
