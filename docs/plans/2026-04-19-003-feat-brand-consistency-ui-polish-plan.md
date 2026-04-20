---
title: Brand Consistency UI Polish
type: feat
status: active
date: 2026-04-19
origin: docs/brainstorms/2026-04-19-brand-consistency-ui-polish-requirements.md
deepened: 2026-04-19
---

# Brand Consistency UI Polish

## Enhancement Summary

**Deepened on:** 2026-04-19
**Reviewers consulted:** code-simplicity-reviewer, julik-frontend-races-reviewer, pattern-recognition-specialist

### Key Improvements (from deepen pass)
1. **Cut speculative props.** `<Wordmark />` is zero-prop; `BeanThumb` drops the proposed `loading` prop. Two dead API surfaces removed.
2. **Phase 2 no longer edits `ArchiveTab.jsx`.** The proposed `loading="eager"` override on the Unforgettable Cups strip was premature optimization for a 60px image. Only `BeanThumb.jsx` changes in Phase 2.
3. **Fixed a real race bug before implementation.** Original sketch's `imgErrored` boolean would stale-lock the SVG fallback if `bean.photoUrl` changed after a prior error (e.g., user re-generates a product shot). Switched to URL-scoped state (`erroredUrl`), so any new URL automatically gets a fresh attempt. One useState, no useEffect.
4. **Protected existing `fonts.body` usage.** Pattern review caught that `fonts` is still used at `App.jsx:134, 170, 330`. Task now explicitly says leave the import alone; only the `fonts.title` reference at `:188` is removed.
5. **Added dev-only debug signal.** `import.meta.env.DEV` guarded `console.warn` on image load failure saves future debugging time when a Storage rules change or CORS misconfig breaks photoUrls silently.

---

## Overview

Finish the brand refresh started on the Rotation tab. Replace the Caveat cursive fallback that still appears on Inventory, Tasting, Chat, and Archive with the official wordmark PNG (mask-tinted in accent color), and surface real bean photos inside the Archive's redesigned cards when the bean has a photo saved.

Two small, fully-internal changes. No new assets, no schema changes, no external dependencies.

## Problem Statement / Motivation

- **Header wordmark drift.** `src/App.jsx:169` (Rotation header) uses the real wordmark. `src/App.jsx:188` (all other tabs) still renders `2manybeans` as Caveat cursive text. Brand moment is inconsistent across the app shell.
- **Archive shows generic art for real beans.** `src/tabs/ArchiveTab.jsx:280` and `:648` both render the painterly `BeanThumb` SVG even when `bean.photoUrl` is available. A third consumer at `src/components/ArchiveDetailSheet.jsx:204` has the same limitation. Users who photographed or generated product shots see placeholder bags instead of their actual beans.

## Proposed Solution

**Part A, shared `<Wordmark />` component.**
Extract the rotation header's inline mask `<div>` into a tiny zero-prop shared component. Use it in both the Rotation header (visual-identical refactor) and the non-rotation header (new). `SignInScreen.jsx` stays on its own raw-`<img>` treatment (a different, hero-sized variant) per origin doc scope boundary.

**Part B, `BeanThumb` photo awareness.**
Extend `BeanThumb` itself to prefer `bean.photoUrl` when present, falling back to the existing painterly SVG on absence or on load failure. This one change lights up all three existing consumers (ArchiveTab × 2, ArchiveDetailSheet × 1) without conditional logic at each call site. `BeanCard` keeps its richer `<img>` treatment (objectFit: contain + shimmer + gradient overlays); untouched.

## Technical Considerations

- **CSS mask compatibility.** `WebkitMaskImage` + `maskImage` already work in WKWebView (proven by rotation header). Same mask, same browser surface, no new risk.
- **Stateful BeanThumb.** Today it is a pure function. Adding one `useState` for the last-errored URL converts it to a lightweight stateful component. Negligible cost for the ~dozens of archive rows in a typical session.
- **URL-scoped error state (the race-bug fix).** The error flag is not a boolean; it is the URL that last failed. `hasPhoto = bean?.photoUrl && erroredUrl !== bean.photoUrl`. Consequence: when a bean gets a new photoUrl (user re-generates a product shot, edits the bean, etc.), the component automatically retries without explicit reset logic.
- **Image flash / network behavior.** Firebase Storage photoUrls over WKWebView work (proven by existing BeanCard usage). To avoid a blank-white flash before decode, the `<img>` has `background: C.amberBg` (matches existing BeanThumb label tone). If the load errors out, the row quietly falls back to the painterly SVG for this URL.
- **Accessibility.** `<Wordmark />` preserves `aria-label="2manybeans"` and `role="img"` from the inline version. `BeanThumb`'s photo `<img>` uses `alt=""` (decorative) because the adjacent bean name text already conveys the name to screen readers.
- **Dev-only debug.** `onError` emits a `console.warn` guarded by `import.meta.env.DEV`, zero bytes in production, easy to spot during dev when a Storage misconfig or CORS break wipes out photoUrls silently.

## System-Wide Impact

- **Interaction graph:** `App.jsx` render → `isRotation` branch picks header → `<Wordmark />` mounts (static). Archive tab → list/hero render → `<BeanThumb>` per row → checks `bean.photoUrl` → renders `<img>` or SVG. No lifecycle effects, no side channels.
- **Error propagation:** Image load failures are absorbed in `BeanThumb` local state. No error surfaces to parent or telemetry (intentional: a broken photoUrl should silently fall back to the painterly thumb, not crash the row). Dev-only `console.warn` surfaces it during local development.
- **State lifecycle risks:** None. No persistence, no network writes, no background work. The URL-scoped error state naturally resets on URL change, so stale-lock is structurally impossible.
- **API surface parity:** `BeanThumb`'s public props are unchanged (`bean`, `size`). Zero consumer edits required. `ArchiveDetailSheet.jsx:204` inherits the photoUrl behavior automatically.
- **Integration test scenarios:**
  1. Open Archive, tap a row with `bean.photoUrl` → Unforgettable Cups + list row + detail sheet all show the real photo.
  2. Open Archive for a bean with no `photoUrl` → painterly SVG renders (no regression).
  3. Force an image 404 (devtools network throttle or block) → `<img>` swaps to SVG fallback without layout shift; dev console emits the warn.
  4. Edit a bean to change `photoUrl` after a prior load failure → component retries with the new URL instead of stale-locking to the SVG.
  5. Tab-switch Rotation → Inventory → Archive → Chat → Tasting → Rotation. Wordmark identical on every non-rotation tab; rotation keeps painterly hero.
  6. iOS simulator with safe-area check: flat header respects `env(safe-area-inset-top)`, settings gear centers against new wordmark baseline.

## Key Decisions

- **Extract `<Wordmark />` to `src/components/Wordmark.jsx` as zero-prop.** Resolves origin-doc Deferred Q1. Both App.jsx header branches reuse it. SignInScreen intentionally stays on its own raw-img variant (explicit origin-doc scope boundary).
- **No Wordmark props.** Today's two consumers use identical sizing and color. Adding `height`/`width` props without a caller to override them is dead API. If a third size shows up later, add the prop then.
- **Drop-shadow kept on both headers.** Shadow color is `C.bg` (oat). On the Rotation painterly hero it adds readability; on the flat oat header it renders invisibly (same-color shadow). No harm, one code path.
- **Corner radius on Archive photos = 10px rounded square.** Resolves origin-doc Deferred Q2. Matches `BeanThumb`'s existing `rx="10"` so the archive's painterly visual cadence stays intact. Circular treatment is reserved for contexts where photos are large (BeanCard), not thumb-sized.
- **No greeting line on non-rotation headers.** R2 stands. Rotation remains the "home" moment.
- **Extend `BeanThumb` instead of adding per-call-site conditionals.** All three consumers are archive-area; centralizing behavior in the component is simpler and gives ArchiveDetailSheet the fix for free.
- **URL-scoped error state, not boolean.** Prevents stale-lock when `bean.photoUrl` changes after a prior error.
- **`loading="lazy"` hardcoded on the img.** Originally proposed as a prop with one `eager` override for the Unforgettable Cups strip. Simplicity review showed the override is premature optimization for a 60px image browsers already prioritize. Hardcoded, no prop.
- **`alt=""` on the photo `<img>`.** Decorative, because every existing consumer renders the bean name visually next to the thumb.

## Phase 1: Shared `<Wordmark />` Component & Header Consistency

**Files:**
- Create `src/components/Wordmark.jsx` (new)
- Edit `src/App.jsx` (line 169 and line 188)

**Tasks:**
- [ ] Create `src/components/Wordmark.jsx` with a single named export `Wordmark`. Inline-style div, mask-image wordmark asset, `background: C.accent`, `filter: drop-shadow(0 1px 3px rgba(250,246,241,0.8))`, `aria-label="2manybeans"`, `role="img"`. Zero props; hardcoded `height: 32`, `width: 180`.
- [ ] `src/App.jsx:169`, replace the 12-line inlined `<div>` mask block with `<Wordmark />`. Visual must be identical.
- [ ] `src/App.jsx:188`, replace the Caveat text element `<div style={{ fontFamily: fonts.title, fontSize: 32, color: C.accent, lineHeight: 1.1 }}>2manybeans</div>` with `<Wordmark />`. Leave the surrounding flex row, sticky-header styling, and settings button alone.
- [ ] **Leave the `fonts` import alone.** `fonts.body` is still referenced at `src/App.jsx:134, 170, 330`. Only the `fonts.title` usage at line 188 is being removed. Do not touch the import line.

**Success criteria:**
- Inventory, Tasting, Chat, Archive tabs all show the wordmark PNG tinted in accent color, vertically centered beside the settings gear.
- Rotation tab header is pixel-identical to pre-change (the refactor is behaviorally neutral there).
- No Caveat cursive `2manybeans` text remains anywhere in `src/App.jsx`.

**Sketch, `src/components/Wordmark.jsx`:**
```jsx
// Brand wordmark. Mask-tinted PNG rendered in accent color.
// Used in App header (both rotation and non-rotation branches).
import { C } from '../styles/theme';

export function Wordmark() {
  return (
    <div
      aria-label="2manybeans"
      role="img"
      style={{
        height: 32,
        width: 180,
        background: C.accent,
        WebkitMaskImage: 'url(/images/wordmark@2x.png)',
        WebkitMaskSize: 'contain',
        WebkitMaskRepeat: 'no-repeat',
        WebkitMaskPosition: 'left center',
        maskImage: 'url(/images/wordmark@2x.png)',
        maskSize: 'contain',
        maskRepeat: 'no-repeat',
        maskPosition: 'left center',
        filter: 'drop-shadow(0 1px 3px rgba(250,246,241,0.8))',
      }}
    />
  );
}
```

## Phase 2: `BeanThumb` Photo Fallback

**Files:**
- Edit `src/components/BeanThumb.jsx` (sole file in this phase)

**Tasks:**
- [ ] Convert `BeanThumb` to a stateful function component. Import `useState` from `'react'`.
- [ ] Add state: `const [erroredUrl, setErroredUrl] = useState(null);`
- [ ] Derive: `const hasPhoto = bean?.photoUrl && erroredUrl !== bean.photoUrl;`
- [ ] When `hasPhoto`, render the `<img>`. Otherwise, render the existing painterly SVG unchanged.
- [ ] `<img>` attributes: `src={bean.photoUrl}`, `alt=""`, `loading="lazy"`, `decoding="async"`, `onError={() => setErroredUrl(bean.photoUrl)}` (with dev-only `console.warn`).
- [ ] `<img>` styles: `width: size`, `height: size`, `objectFit: 'cover'`, `borderRadius: 10`, `display: 'block'`, `background: C.amberBg`.
- [ ] Do NOT edit `src/tabs/ArchiveTab.jsx` or `src/components/ArchiveDetailSheet.jsx`. They inherit the new behavior for free.

**Success criteria:**
- Archive list rows: beans with `photoUrl` show the photo in a 10px rounded 56×56 square; beans without keep the painterly SVG.
- Unforgettable Cups strip: same behavior at 60×60.
- Bean detail sheet (opened from Archive): 88×88 thumb shows photo when available, inherited for free.
- If the photo URL fails to load, the row quietly shows the painterly SVG instead of a broken-image ghost.
- If a bean's `photoUrl` changes after an earlier error, the component retries with the new URL.
- Dev console shows a `[BeanThumb] photoUrl failed to load ...` warning on error (no warning in production).

**Sketch, `src/components/BeanThumb.jsx` (photo branch):**
```jsx
import { useState } from 'react';
import { C } from '../styles/theme';

// ...existing HUES/GLYPHS/seedFrom unchanged...

export function BeanThumb({ bean, size = 56 }) {
  const [erroredUrl, setErroredUrl] = useState(null);
  const hasPhoto = bean?.photoUrl && erroredUrl !== bean.photoUrl;

  if (hasPhoto) {
    return (
      <img
        src={bean.photoUrl}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => {
          if (import.meta.env.DEV) {
            console.warn('[BeanThumb] photoUrl failed to load', bean.photoUrl);
          }
          setErroredUrl(bean.photoUrl);
        }}
        style={{
          width: size,
          height: size,
          objectFit: 'cover',
          borderRadius: 10,
          display: 'block',
          background: C.amberBg,
        }}
      />
    );
  }

  // ...existing SVG render unchanged...
}
```

## Acceptance Criteria

### Functional
- [ ] R1: `<Wordmark />` renders on Inventory, Tasting, Chat, Archive headers.
- [ ] R1: Rotation header uses the same `<Wordmark />` component (no visual drift).
- [ ] R2: Non-rotation headers stay flat (no painterly hero, no tinted band, no greeting).
- [ ] R3: Archive list row (size 56) prefers `bean.photoUrl`, falls back to SVG.
- [ ] R3: Unforgettable Cups strip (size 60) prefers `bean.photoUrl`, falls back to SVG.
- [ ] R3 bonus: Archive detail sheet (size 88) inherits photo preference automatically.
- [ ] Photo URL change after prior error retries the new URL (no stale-lock).

### Quality
- [ ] No Caveat cursive `2manybeans` text remains in `src/App.jsx`.
- [ ] `fonts` import in `src/App.jsx` is intact (`fonts.body` still referenced at three call sites).
- [ ] `BeanThumb` public prop surface unchanged (`bean`, `size`).
- [ ] `<Wordmark />` carries `aria-label="2manybeans"` + `role="img"`.
- [ ] Photo `<img>` has `alt=""` (decorative, name text conveys meaning).
- [ ] No new ESLint or TypeScript errors introduced.
- [ ] iOS simulator screenshot on Archive tab shows real photos where present.

### Non-Regression
- [ ] Rotation header visually identical to before the change.
- [ ] Beans with no `photoUrl` show the existing painterly SVG (tested via a freshly-added manual bean with no photo).
- [ ] Sticky headers still layer above scrolling content on all non-rotation tabs.
- [ ] SignInScreen wordmark untouched.
- [ ] `BeanCard`'s own `bean.photoUrl` treatment untouched.

## Dependencies & Risks

- **Asset already exists.** `public/images/wordmark@2x.png` is live and used by Rotation + SignInScreen. No new upload, no cache bust.
- **No schema changes.** `bean.photoUrl` is already populated by the existing Add Bean flow (scan or AI product shot).
- **Minor risk, WKWebView CORS on Firebase Storage URLs.** These images already render on Rotation/Inventory via BeanCard, so the same URLs work in the same WebView. Low risk, but QA should hit Archive on a real device with mixed beans (old + new, photo'd + not).
- **Minor risk, stateful BeanThumb re-render cost.** Negligible for the ~dozens of rows typical in Archive.

## Sources & References

### Origin
- **Origin document:** [docs/brainstorms/2026-04-19-brand-consistency-ui-polish-requirements.md](../brainstorms/2026-04-19-brand-consistency-ui-polish-requirements.md). Carried forward: R1/R2 (shared wordmark, flat header, no greeting), R3 (Archive photoUrl with BeanThumb fallback), scope boundaries (no per-tab painterly headers, no schema changes, SignInScreen/BeanCard untouched). Both Deferred Questions resolved (Q1 → shared component, Q2 → 10px rounded square).

### Internal References
- Rotation header existing pattern: `src/App.jsx:169`
- Non-rotation header to replace: `src/App.jsx:188`
- BeanThumb component: `src/components/BeanThumb.jsx:12`
- BeanThumb consumers: `src/tabs/ArchiveTab.jsx:280`, `src/tabs/ArchiveTab.jsx:648`, `src/components/ArchiveDetailSheet.jsx:204`
- Reference photoUrl treatment (divergent, do not follow blindly): `src/components/BeanCard.jsx:68-97`
- Theme tokens: `src/styles/theme.js`. `C.accent` (#B07540), `C.amberBg`, `C.bg` (#FAF6F1).
- Brand asset: `public/images/wordmark@2x.png`

### Deepen-pass Findings Log
- **Simplicity review (code-simplicity-reviewer):** cut Wordmark props, cut BeanThumb `loading` prop, cut ArchiveTab:648 edit.
- **Race review (julik-frontend-races-reviewer):** caught stale-lock bug with boolean error state; recommended URL-scoped state; confirmed mount flicker and scroll thrash are non-issues; confirmed WKWebView mask repaint on tab switch is non-issue.
- **Pattern review (pattern-recognition-specialist):** confirmed component conventions match; flagged `fonts` import must stay (three other usages); flagged em-dash in comment (removed).

### AGENTS / CLAUDE conventions applied
- iOS layout rules (`.claude/rules/ios-layout.md`): safe-area preserved on header, no minWidth/minHeight on tap targets, 44×44 settings button untouched.
- Component conventions: named exports, inline styles, theme imports from `../styles/theme`.
