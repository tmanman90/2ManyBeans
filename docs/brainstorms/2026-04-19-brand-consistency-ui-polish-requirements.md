---
date: 2026-04-19
topic: brand-consistency-ui-polish
---

# Brand Consistency UI Polish

## Problem Frame
The Rotation tab was refreshed with the official wordmark PNG (mask-tinted accent) over a painterly header image, but the other four tabs (Inventory, Tasting, Chat, Archive) still render `2manybeans` as Caveat cursive text. The Archive redesign also landed with generic painterly SVG thumbs (`BeanThumb`) in the main list rows and the Unforgettable Cups hero strip, even for beans that already have a saved photo. The result is an inconsistent brand moment and missed product presence for beans the user actually photographed or generated product shots for.

## Requirements
- **R1.** Non-rotation tab headers (Inventory, Tasting, Chat, Archive) render the official wordmark asset (`/images/wordmark@2x.png`), mask-tinted in accent color, replacing the Caveat cursive text fallback at `src/App.jsx:188`. Visual target: same wordmark dimensions/tint treatment as Rotation (approx. 32h × 180w, `C.accent` mask fill).
- **R2.** Non-rotation headers stay flat (no painterly hero image, no tinted band) and carry no greeting line. Rotation remains the only tab with the painterly header + greeting.
- **R3.** Archive renders `bean.photoUrl` when present in both spots currently using `BeanThumb`:
  - Main list row thumb (`src/tabs/ArchiveTab.jsx:280`)
  - Unforgettable Cups hero strip thumb (`src/tabs/ArchiveTab.jsx:648`)
  When `bean.photoUrl` is absent, fall back to the existing `BeanThumb` SVG. Photo should fill the same footprint (56px and 60px) with `object-fit: cover` and matching corner radius.

## Success Criteria
- Every tab header shows the same brand wordmark on first render — no Caveat cursive remains in the app shell.
- Rotation header still feels distinct (painterly image + greeting) versus the other tabs (flat + wordmark only).
- Beans with a saved photo show a real image in Archive list rows and Unforgettable Cups. Beans without one continue to show `BeanThumb` with no visual regression.
- No schema changes. No new assets needed (wordmark already in `public/images/`).

## Scope Boundaries
- Not introducing per-tab painterly hero images.
- Not splitting product-shot URL from scan URL on the bean schema — `bean.photoUrl` is the single source of truth (whatever the user kept at Add Bean time).
- Not redesigning Archive rows beyond the thumb swap.
- Not touching the Rotation header, SignInScreen, or ShareCard (those already use the wordmark correctly).
- Not adding a greeting line to non-rotation tabs.

## Key Decisions
- **Flat header on non-rotation tabs**: keeps Rotation as the distinct "home" moment and avoids building four new hero images.
- **No greeting on other tabs**: personal tone lives on Rotation only, reinforcing it as home.
- **`bean.photoUrl` as the archive image source**: reuses existing data, no migration, no fallback ladder to maintain.
- **Both archive thumb spots swap together**: avoids inconsistency where one part of Archive feels modern and the other painterly.

## Dependencies / Assumptions
- `wordmark@2x.png` renders correctly as a CSS mask in WKWebView (already proven on Rotation and SignInScreen).
- Existing Archive layout accommodates `<img>` with rounded corners without row-height changes.

## Outstanding Questions

### Deferred to Planning
- [Affects R1][Technical] Extract the wordmark mask div into a small shared component (e.g., `<Wordmark />`) so Rotation, non-rotation header, and SignInScreen all reference one implementation — or inline the CSS for now?
- [Affects R3][Technical] Should the archive photo element use the same circular/rounded mask pattern as `BeanCard` for visual continuity, or match `BeanThumb`'s existing 10px rounded square?

## Next Steps
→ `/ce:plan` for structured implementation planning
