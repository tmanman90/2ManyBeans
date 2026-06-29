# Inventory — Roaster Rails (vertical roasters × horizontal beans)

## Summary
Rebuild the Inventory tab so it reads like the App Store's "by developer" shelves: **scroll vertically
through roaster sections, swipe horizontally through that roaster's beans.** Each bean is the flagship
card (the same one from Rotation); tapping it flies open the trading card via the hero morph. This
brings Inventory up to the flagship polish the Rotation tab now has, while keeping the horizontal-scroll
element Tal wants.

## Problem Frame
Inventory already **groups by roaster** but renders each roaster's beans as a **vertical stack** of the
older `BeanCard` — visually a step behind the redesigned Rotation tab, and it buries beans in long
columns. Tal's mental model is "all my Apollon's Gold together, swipe to see them; scroll down for the
next roaster." The grouping logic exists; the within-roaster layout and the card need to change, plus
the tap-through and morph need wiring into this tab. Inventory shows **SEALED** beans (the cellar);
ACTIVE beans live in the Rotation jars — so the card's primary action here is **Open into jar**, not Brew.

## Codebase Findings (research breadcrumbs)
Grounded in the current code so the implementer starts informed, not from scratch:
- **Inventory shows SEALED beans only** — `InventoryTab.jsx:29` (`beans.filter(b => b.status === 'SEALED')`). ACTIVE beans live in the Rotation jars.
- **Grouping already exists** — `InventoryTab.jsx:84–100`: group by `b.roaster`, then a within-group **peak-priority sort**. The roaster *section* order is currently **insertion order, not alphabetical** → R1 adds an explicit locale/case-insensitive sort of the roaster keys (one line at `:251`).
- **The header chrome stays** — `InventoryTab.jsx:107–233`: eyebrow "Sealed Inventory", title "Patiently waiting", a stats row (in-peak · bags waiting · empty slots), and a search input rendered only when `sealed.length > 5`. The redesign changes **only** the scrollable body (`:245–320`), not this header.
- **Today's per-bean actions** — `InventoryTab.jsx:297–315`: **Open** (`onOpenBean(bean.id, emptySlots[0])`, shown only if an empty slot exists), **BrewButton**, **Finish** (`handleFinishBag`), plus **Learn** via `BeanCard`'s `onLearn` (`useProfessorRuphus`). Brew *is* available on sealed beans today → keep it (secondary).
- **Open-into-jar chain** — `onOpenBean` → App `handleOpenBean`/`handleModalOpen` (`App.jsx:84–97,213,232,371`) → `openBean(beanId, slot)` (Firebase: status→ACTIVE + `jarSlot`). Inventory opens into `emptySlots[0]`; Rotation uses a richer `slotPicker` (`RotationTab.jsx:78,203,502`). v1 keeps Inventory's first-empty-slot behavior.
- **Morph plumbing to reuse** — `RotationTab.jsx`: `detailBean`/`morphRect` state, `openDetail(bean, rect)`, `<BeanDetailCard originRect=…>`. Inventory has **no** detail view today (inline `BeanCard`), so the host + morph is net-new here → extract `BeanDetailHost` (U1).
- **`ShelfCard` is parent-driven** — takes `actions` (footer) + `onOpenDetail(bean, rect)` (captures the bag rect for the morph). Reusable as-is; Inventory passes its own footer + handlers.

## Requirements
- **R1** — Inventory body is a **vertical scroll of roaster sections**, sorted **alphabetically** by roaster, each led by a clean **"ROASTER · {count}"** eyebrow header (count in `tabular-nums`).
- **R2** — Within each roaster, beans render in a **horizontal scroll-snap rail** of the **flagship card** (reuse `ShelfCard`), ~one card per view, swipeable; the rail snaps and shows a subtle "more →" affordance when there are 2+.
- **R3** — The rail card reuses the `ShelfCard` body (bag hero + peak gauge + roaster + name + origin) with an **Inventory action footer**: primary **"Open into jar"** + secondary **Brew / Finish / Learn** — i.e. today's Inventory actions, reprioritized so Open leads. **Brew is preserved** (it exists today on sealed beans — removing it would regress). **Taste** is not offered (no tasting until brewed).
- **R4** — **Tapping a rail card opens the `BeanDetailCard` via the hero morph** (reuse the manual-FLIP morph; capture the bag rect from the tapped card, fly into the trading card).
- **R5** — The `BeanDetailCard` offers **"Open into jar"** for sealed beans (a status-aware primary action), in addition to the existing flip / stat sheet / management.
- **R6** — **Search is preserved** — it filters the sealed set across all roasters before grouping; the no-results state still shows.
- **R7** — **No feature regression** — open-into-jar (slot picker), edit, delete, finish/archive, the SEALED filter, peak counts, and empty states all still work.
- **R8** — **Performance/motion** — rails use **CSS scroll-snap** (compositor thread); only transform/opacity animate; honors `prefers-reduced-motion` (morph + any rail scaling disabled); no jank with many rails on screen.
- **R9** — **Design-bank compliant** — one accent (≤10% surface), hairline section dividers, `tabular-nums` on all counts, ease-out ≤300ms, no slop tells (no glow shadows, no flat hierarchy). Runs the pre-ship checklist.
- **R10** — **Production-safe** — visual/UX only; no Firebase data/schema/feature changes; other tabs and onboarding untouched; Capgo **dev** channel only; main/prod untouched.

## Key Technical Decisions
- **KTD1 — Reuse `ShelfCard` as the rail item.** It already takes an `actions` prop (so Inventory passes its own footer), already captures the bag rect for the morph (`onOpenDetail(bean, rect)`), and already matches the flagship look. No fork.
- **KTD2 — Each roaster rail = a horizontal scroll-snap container** mirroring Rotation's `bean-shelf` (one card ~86% wide, `scroll-snap-align: center`, `hide-scrollbar`). Reuse the existing pattern/classes.
- **KTD3 — Reuse `BeanDetailCard` + the manual-FLIP morph.** Inventory gets its own `detailBean` + `morphRect` state and renders `BeanDetailCard` (portal to body). To avoid duplicating plumbing across tabs, extract a tiny **`<BeanDetailHost>`** (or `useBeanDetail()` hook) that owns `detailBean`/`morphRect` + the card render, used by both Rotation and Inventory. (Fallback: duplicate ~10 lines if the extraction proves noisy.)
- **KTD4 — Status-aware action set.** A sealed bean's primary action is **Open into jar**; an active bean's is **Brew**. Drive the footer (in the rail) and the detail-card primary action from `bean.status`. The rail footer is passed by the parent (`ShelfCard` is agnostic); the `BeanDetailCard` gains an optional `onOpen` prop that renders an "Open into jar" button when present.
- **KTD5 — Sorting.** Roaster sections **alphabetical** (locale-aware, case-insensitive). Within a roaster keep the existing peak-priority sort.
- **KTD6 — Search unchanged** — filter `sealed` by the existing `matchesSearch`, then group + sort the result.
- **KTD7 — Defer per-rail depth-of-field scaling and roaster logos to v1.1.** Start with clean scroll-snap rails (paging) and text headers; the continuous neighbor-scale and per-roaster emblems are additive polish, not core.

## High-Level Technical Design
```
InventoryTab
  ├─ header chrome (title, search, summary counts)         ← mostly unchanged
  ├─ vertical scroll
  │    └─ roasters (alphabetical).map(roaster =>
  │         ├─ <RoasterHeader name count />                ← "ROASTER · 5", tabular-nums
  │         └─ <div class="bean-shelf hide-scrollbar">     ← horizontal scroll-snap rail
  │              roasterBeans.map(bean =>
  │                <ShelfCard bean
  │                   onOpenDetail={openDetail}            ← captures rect → morph
  │                   actions={<InventoryActions bean … />}/>  ← Open into jar (primary) + mgmt
  │              )
  │         )
  └─ <BeanDetailHost detailBean morphRect onClose … />     ← shared with Rotation; morph + flip card

Tap card → openDetail(bean, bagRect) → BeanDetailCard flies open (hero morph) →
  front shows "Open into jar" (sealed) → choosing a slot moves bean ACTIVE (existing handler).
```

## Scope Boundaries
- Do **NOT** change Firebase reads/writes, the bean data model, statuses, or any feature behavior — layout + presentation only.
- Do **NOT** touch other tabs (Rotation logic stays; only a possible shared `BeanDetailHost` extraction it opts into) or onboarding.
- Do **NOT** change what Inventory shows (still SEALED beans) or the open-into-jar / edit / delete / finish handlers — only how they're laid out and triggered.
- Do **NOT** build per-rail depth-of-field scaling or per-roaster logos in v1 (deferred).
- Do **NOT** animate any non-transform/opacity property; do not deploy to production / merge to main.

## Implementation Units
- **U1** — Extract **`<BeanDetailHost>`** (or `useBeanDetail`) holding `detailBean` + `morphRect` + the `BeanDetailCard` render with the morph; refactor RotationTab to use it (behavior-identical). Build + morph gate still green. (R4, R10)
- **U2** — **`BeanDetailCard` "Open into jar"**: add optional `onOpen` prop → a status-aware primary action (front-face button for sealed beans). Wire `onOpen` from the host. (R5)
- **U3** — **Inventory rail layout**: replace the vertical `BeanCard` stack with, per roaster, a `bean-shelf` horizontal scroll-snap rail of `ShelfCard`s; alphabetical roaster order; "ROASTER · count" eyebrow header (tabular-nums). (R1, R2)
- **U4** — **`InventoryActions` footer** passed to each rail `ShelfCard`: primary **Open into jar** (`onOpenBean(bean.id, emptySlots[0])`, disabled when no empty slot) + secondary **Brew / Finish / Learn** (port the existing handlers). Keep Brew (no regression); no Taste. (R3, R7)
- **U5** — **Wire tap → morph** in Inventory via `BeanDetailHost` (`onOpenDetail` captures rect). Confirm the morph flies from any rail scroll position. (R4)
- **U6** — **Preserve search + states**: keep the search filter feeding the grouping; no-results, empty-inventory, and peak-count summaries intact. (R6, R7)
- **U7** — **Polish + verify**: design-bank pre-ship checklist (accent, hairlines, tabular-nums, motion budget, reduced-motion); a Playwright harness check that renders Inventory with multi-roaster mock data — rails scroll, tap morphs, no console errors; `vite build` clean; regression sweep of the open/edit/delete/finish handlers. (R7, R8, R9)

## Risks & Mitigations
- **Brew-on-sealed regression.** Inventory shows Brew for sealed beans today (`:302`). → Keep Brew as a *secondary* action; Open is primary. Never remove. (R3/R7)
- **Many `ShelfCard`s mounted = perf.** N sealed beans → N flagship cards, each running `useStrippedBag` (canvas) + box-shadows — heavier than the old `BeanCard`. → keep `loading="lazy"` on bag imgs (ShelfCard already does), CSS scroll-snap rails; if a large library janks, add horizontal windowing in v1.1. The verify step measures/notes this.
- **"Open into jar" with no empty slot.** Inventory hides Open when `emptySlots.length === 0`. → On the detail card, **disable + explain** ("Free a jar first") rather than a dead button.
- **Detail-card "Open" placement.** The front already has a primary "VIEW STAT SHEET" glass button. → For sealed beans, **"Open into jar" becomes the front primary**; the stat-sheet flip demotes to a secondary/icon affordance. Driven by `bean.status` + presence of `onOpen`.
- **Two `BeanDetailHost` instances.** If App keeps both tabs mounted, two hosts could each render a card. → Verify `App.jsx` mounts only the **active** tab; if it doesn't, lift the host to App level (single instance). Confirm in U1.
- **Morph from a horizontally-scrolled card.** Rect is captured via `getBoundingClientRect` (viewport coords) and the detail card is a body portal, so scroll offset is already handled — low risk; verify in the Inventory harness.

## Requirements Trace
- **R1** (vertical roaster sections, alphabetical, eyebrow+count) → U3; harness renders multi-roaster mock, asserts alphabetical order + headers; visual sign-off.
- **R2** (horizontal scroll-snap rail of flagship cards) → U3; harness asserts each roaster has a horizontally-scrollable rail with ≥1 `ShelfCard`; visual sign-off.
- **R3** (Inventory action footer, no Brew on sealed) → U4; judge review of the action set by status; visual sign-off.
- **R4** (tap → trading card via morph) → U1+U5; reuse `scripts/verify-morph.mjs` pattern adapted to an Inventory harness (bag interpolates, no teleport); visual sign-off.
- **R5** (Open into jar from the detail card) → U2; judge review; manual: opening a sealed bean from its detail card moves it ACTIVE.
- **R6** (search preserved) → U6; harness types a query → grouping filters; no-results state shows.
- **R7** (no regression) → U7; judge review of the diff for handler preservation + harness renders without error + manual spot-check of open/edit/delete/finish.
- **R8** (perf/motion/reduced-motion) → U7; judge confirms scroll-snap + transform/opacity-only + reduced-motion gates; harness with reduced-motion emulated.
- **R9** (design-bank) → U7; pre-ship checklist + judge against the anti-slop list.
- **R10** (production-safe) → judge confirms no Firebase/feature/other-tab changes; deploy dev-only (manual).

## Open Questions
- None blocking. Deferred (not open): per-rail depth-of-field scaling, per-roaster emblems/logos, and whether Inventory should also expose a flat/search-all view (current search covers find-by-name).
