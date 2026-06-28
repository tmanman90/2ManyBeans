# Archive Tab — Trophy Case Redesign (100x the craft, kill the slop)

**Branch:** `redesign` → Capgo `dev` channel only. Production untouched.
**Date:** 2026-06-28
**Constraint (standing):** Don't touch Firebase or any data/logic/API. Don't change features
(Restore, Delete, Learn, Edit photo, brew-profile viewing, tasting history, ownership stats all
preserved). Full reign on UI/UX.

## Problem Frame

The Archive already has the right *structure* — "Unforgettable Cups" hero strip on top, a
chronological timeline below — and Tal explicitly wants to keep that structure. The problem is
**craft**: the current execution reads as "AI vibe-coded slop" (Tal is getting roasted on
Twitter for it). It also lacks the flagship depth that now defines Rotation and Inventory: it
never reuses the **trading card** or the **hero morph**. Tapping a finished bean opens a generic
bottom sheet instead of flying the bag into the trading card.

Goal: keep the cups-on-top + timeline-below structure, **100x the craft to anti-slop /
Apple-caliber**, and wire **tap → trading-card hero morph** — unifying Archive with the rest of
the app while preserving every existing feature.

## Slop Audit (the specific tells to kill — design-bank `01-anti-slop.md`)

Each is a hard prohibition we're currently violating in `ArchiveTab.jsx`:

1. **Glow orb** — the top-right radial `accentLight → transparent` blob in the header
   (`01-anti-slop`: "glowing aurora/radial accents + colored box-shadow glow", the LLM default).
   → Remove entirely; depth comes from the surface ladder, not glow.
2. **Eyebrow-above-oversized-H1** — tiny uppercase "Editorial" tracked label directly above a
   42px "the Archive" (`01-anti-slop` layout tell). → Restructure the masthead; drop the twee
   lowercase title for a real type hierarchy.
3. **Gradient accent rule** — the 40×2.5 `accent → accentLight` underline (decorative gradient
   divider). → Replace with a hairline or nothing.
4. **Sparkles icon** — `<Sparkles>` on the cups header (`01-anti-slop`: decorative Lucide /
   emoji-as-header tell). → Remove; let type + a single gold star carry "best".
5. **Accent-soft pill spam** — note chips, filter chips, count badges, ownership strip all wear
   `accentSoft` fills + borders. Accent is supposed to be ≤10% of surface (`03-color`). → Demote
   to neutral surfaces; reserve gold for the one thing that means "treasured" (5★).
6. **Twee voice** — "the Archive", "a record of every cup", "end of the trail", "nothing in this
   corner" (`01-anti-slop`: cute filler). → Tighten to confident, plain labels.
7. **Big-number stat banner ×N** — beans/tastings cluster top-right competes with the title
   (`01-anti-slop`: "big-number stat banners ×3"). → Fold into one calm masthead stat line with
   `tabular-nums`.
8. **Flat decorative timeline dots/rails** — generic accent dots on a gradient rail read as
   library default. → Make the rail purposeful (or replace with a quieter date gutter).

## Design Direction (the replacement system — design-bank spine)

- **Palette:** lean into the existing warm-neutral ramp (`theme.js` already has bg/bgDeep/
  cream/text/textMuted/textLight + hairlines). Gold `accent` (#A2632F) becomes **scarce** —
  used ONLY for the 5★ "treasured" signal and a single active/selected state. Everything
  structural goes neutral. (`03-color`: monochrome ramp + one accent ≤10%.)
- **Type:** real hierarchy via the existing scale (`type.display/h1/h2/label`). Fraunces for the
  masthead + bean names (display, negative tracking), Nunito for everything else. **`tabular-nums`
  on every count** (bean counts, year counts, tastings). (`04-typography`.)
- **Depth:** surface ladder (bg → bgDeep wells → cream cards) + the existing layered warm
  shadows (`shadows.e1/e2`), never a glow. (`06-materials-depth`.)
- **Hairlines:** 1px low-opacity `C.hairline` separators to group, not boxes-in-boxes.
- **Motion:** the proven hero morph (transform/opacity only, spring, reduced-motion gated). No
  new decorative motion.
- **Trophy framing:** the **Unforgettable Cups** become a small flagship **trading-card-style
  carousel** (gold-cornered collectible feel, but restrained), tap → morph. The timeline below
  is the quiet chronological ledger.

## Tap target (decided with Tal)

**Trading card + hero morph.** Reuse `BeanDetailCard` (bag flies into the card, same as
Rotation/Inventory). The card's back already renders stat grid + tasting notes + source insight +
your-tastings list + an extensible action row. We add **Restore** and **Delete** to that action
row and port the two archive-only bits (ownership stats, saved brew profile) so no feature is
lost. `ArchiveDetailSheet` is retired once parity is verified.

## Requirements Trace

- **R1** — Header/masthead de-slopped: no glow orb, no gradient rule, no eyebrow-over-H1, no twee
  title; one calm stat line with `tabular-nums`.
- **R2** — "Unforgettable Cups" (5★) hero strip kept on top, restyled to a restrained
  trophy-card carousel; no Sparkles icon; horizontally scrollable; tap opens the bean.
- **R3** — Year-grouped timeline kept below; rows restyled to anti-slop (neutral surfaces, hairline
  grouping, `tabular-nums` counts, quieter rail); expand-details preserved.
- **R4** — Tap any finished bean (cup card or timeline row) → **hero morph into the trading card**
  (bag flies from the tapped thumbnail), identical mechanism to Inventory.
- **R5** — Trading card back gains **Restore** (→ SEALED) and **Delete** (destructive, confirmed)
  actions; Learn + Edit-photo preserved.
- **R6** — Archive-only detail preserved on the card: ownership context (days owned / finished
  date) and saved brew profile (Aiden / hand-brew) render when present.
- **R7** — Search + all filters (year, min-rating, roaster, origin, process, sort) keep working
  and keep filtering both the cups strip and the timeline; filter UI de-slopped.
- **R8** — Three distinct empty states preserved (first-run with Ruphus video, filtered-empty with
  path back, and the no-5★ case for the cups strip), copy tightened. (`07-dashboard-craft`.)
- **R9** — Reduced-motion: morph disabled, card opens as a plain fade; no console errors.
- **R10** — No Firebase/data/logic/API files touched; all existing actions behave identically.

## Scope Boundaries (do NOT touch)

- `api/`, `src/firebase.js`, `src/hooks/useAppData.js`, contexts, any data model or Firestore call.
- The morph mechanism itself (`BeanDetailCard` FLIP internals) — reuse as-is; only extend the
  back action array + add optional archive panels behind props.
- Rotation / Inventory behavior — `BeanDetailCard` changes must be additive (new optional props),
  never regress those tabs.
- Bean status semantics (FINISHED/SEALED), restore/delete logic — reuse existing `updateBean`/
  `deleteBean` calls verbatim.

## Key Technical Decisions

- **KTD-1 (morph origin):** capture the tapped thumbnail's `getBoundingClientRect()` (cups card
  bag + timeline-row thumb) and pass as `originRect` to `BeanDetailCard`, mirroring `ShelfCard`.
  Archive thumbs use `BeanThumb`/bag photo; ensure a bag-image rect is measurable (fallback to
  plain fade when no `photoUrl`).
- **KTD-2 (shared detail hook):** reuse `useBeanDetail()` for `{detailBean, morphRect, openDetail,
  closeDetail}` — same as Inventory.
- **KTD-3 (card back additions, additive):** add optional `onRestore`, `onDelete` props →
  rendered as MiniActions only when passed (Restore = RotateCcw; Delete = Trash2, red, confirmed).
  Existing tabs pass neither, so unchanged.
- **KTD-4 (archive panels, additive):** add optional `ownership`/brew-profile rendering on the
  back gated by props/data so Rotation/Inventory are unaffected. Prefer deriving from `bean`
  fields already present (`finishDate`, `roastDate`, `aidenRecipe`, `handBrewRecipe`).
- **KTD-5 (retire ArchiveDetailSheet):** only after the card reaches feature parity; keep the file
  until the verify gate confirms parity, then remove its mount.
- **KTD-6 (accent scarcity):** introduce no new accent fills; convert `accentSoft` chips/strips to
  neutral (`bgDeep`/`cream` + hairline). Gold reserved for 5★ + one active state.

## Implementation Units

- **U1** — Masthead rebuild (R1): kill glow orb + gradient rule + eyebrow-over-H1 + twee copy;
  new calm header with Fraunces title, one `tabular-nums` stat line, hairline base.
- **U2** — Unforgettable Cups carousel (R2, R8-cups-empty): restyle to restrained trophy cards,
  remove Sparkles, neutralize fills, keep horizontal scroll + tap.
- **U3** — Timeline rows + year headers (R3): anti-slop surfaces, hairline grouping,
  `tabular-nums` counts, quieter rail, preserve expand-details.
- **U4** — Filter/search bar de-slop (R7): neutralize chips/badges, keep all filter logic + the
  glass container, tighten labels.
- **U5** — Card back actions (R5) + archive panels (R6): add `onRestore`/`onDelete` MiniActions
  and ownership/brew-profile rendering to `BeanDetailCard`, all additive/prop-gated.
- **U6** — Wire tap → morph (R4, R9): `useBeanDetail`, capture origin rects on cups cards + rows,
  mount `BeanDetailCard` with restore/delete/learn/edit handlers; retire `ArchiveDetailSheet`
  mount once parity verified.
- **U7** — Empty states + copy pass (R8): three distinct states, tightened voice.
- **U8** — Verify harness + gates (R1–R10): `scripts/verify-archive.mjs` + `archive-harness` with
  multi-year finished mock beans (incl. 5★ and no-photo cases); assert structure, morph flight,
  filter behavior, reduced-motion, zero console errors, and no-glow/no-Sparkles regressions.

## Verification Strategy

- **Programmatic:** `npm run build` (web) exit-zero; `node scripts/verify-archive.mjs` PASS
  (Playwright over a committed `archive-harness.html`): cups strip present + scrollable, timeline
  year-grouped + chronological, tap→morph produces ≥3 distinct flight frames, search/filter
  reduces visible beans, reduced-motion opens without flight, zero console/page errors, and
  anti-slop asserts (no element with the banned radial-glow signature in the header; no Sparkles
  svg in the cups header).
- **Judge (codex):** scoped review treating the redesign baseline (carousel, palette, Liquid
  Glass, morph, ambient motion) as approved; rubric = the Slop Audit list above is fully resolved,
  no feature regressed (Restore/Delete/Learn/Edit/brew-profile/tastings all reachable), additive
  `BeanDetailCard` changes don't regress Rotation/Inventory.
- **Human:** on-device sign-off via `/ship-dev` (Capgo dev), checking the Twitter-roast surfaces
  feel Apple-caliber.

## Requirements Trace → Evidence

| Req | Proven by |
|---|---|
| R1 masthead de-slop | verify-archive (no-glow assert) + judge + human |
| R2 cups carousel | verify-archive (strip present/scrollable, no Sparkles) + human |
| R3 timeline de-slop | verify-archive (year-grouped/chronological) + judge + human |
| R4 tap→morph | verify-archive (≥3 flight frames) |
| R5 restore/delete on card | judge (reachable + confirmed) + human |
| R6 archive panels preserved | judge (parity vs ArchiveDetailSheet) + human |
| R7 search/filter | verify-archive (filter reduces count) |
| R8 empty states | judge + human |
| R9 reduced-motion | verify-archive (no flight, no errors) |
| R10 no data/logic touched | judge (diff audit) + `git diff --stat` scoped to UI files |

## Risks

- **Card-back parity gap** (brew profile / ownership not on the card today) → port behind props in
  U5; judge gate explicitly checks parity before retiring the sheet.
- **Additive props regress Rotation/Inventory** → all new `BeanDetailCard` props optional + render
  only when passed; re-run `verify-inventory.mjs` + `verify-morph.mjs` as regression gates.
- **No-photo finished beans** can't morph a bag → fallback to plain fade (same as reduced-motion).
- **Accent-scarcity overcorrection** (screen goes lifeless) → keep gold for 5★ + one active state;
  human sign-off catches it.
