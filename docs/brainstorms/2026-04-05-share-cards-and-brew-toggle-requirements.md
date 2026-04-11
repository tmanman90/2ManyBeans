---
date: 2026-04-05
topic: share-cards-and-brew-toggle
---

# Share Cards + Brew Method Toggle

## Problem Frame

Coffee Hub has no way to share brew recipes or tasting reviews. Coffee enthusiasts share brews on IG, texts, and socials constantly. The app generates valuable content (Aiden recipes with brew.links, tasting reviews with scores) but it's trapped inside the app. Additionally, users whose default is Aiden have no way to access hand brew recipes without changing their global setting.

## Requirements

### Share Infrastructure
- R1. **Native share sheet**: Use Capacitor Share plugin on iOS, Web Share API on web, clipboard fallback. All share actions go through one utility.

### Recipe Share Card
- R2. **Share button on Aiden recipe modal**: Below the "Open in Fellow" button, a "Share Recipe" link/button appears after the recipe is ready.
- R3. **Generated image card**: Branded image with bean photo, bean name/origin/process, key recipe params (ratio, grind, bloom), Professor Ruphus illustration, and 2manybeans branding. Warm cream palette, Ghibli-inspired clean aesthetic.
- R4. **Share includes image + text**: Native share sheet sends the generated image card AND a text body with the brew.link URL. Works for IG stories (image), texts (image + link), Twitter (image + link).

### Tasting Review Share Card
- R5. **Share button on tasting reviews**: Available from TastingTab list items. Same share infrastructure as recipe cards.
- R6. **Tasting share card image**: Bean photo, bean name/origin, star rating, tasting scores (aroma, body, finish, etc.), one-word score, Professor Ruphus illustration, 2manybeans branding. Same visual style as recipe card.

### Brew Method Toggle
- R7. **Long press on Brew button**: Long pressing "Brew with Aiden" on a bean card shows a contextual menu with two options: "Aiden Recipe" and "Hand Brew Recipe". Haptic feedback on long press.
- R8. **Works both directions**: If default is Hand Brew, long press shows option for Aiden recipe. The non-default option is always available via long press.

## Success Criteria

- Share card images look polished and on-brand (cream/warm palette, Professor Ruphus, clean typography)
- Share works via IG stories, iMessage, and at least one social platform
- Brew.link is included in recipe share text
- Long press on Brew button provides access to the alternative brew method
- No regression to the default brew flow (tap still uses the default method)

## Scope Boundaries

- No web app for viewing shared cards (just the image + brew.link)
- No share analytics or tracking
- No custom IG story sticker integration (just image share to IG)
- No tasting comparison or multi-bean share cards (single bean only)
- Professor Ruphus illustration is a static asset, not AI-generated per share

## Key Decisions

- **Image card + brew.link URL (both)**: Maximum reach. Image works on IG stories, URL works in texts/tweets. Near-zero marginal cost to include both.
- **Professor Ruphus on share cards**: Brand differentiator. Ghibli-inspired mascot makes cards recognizable and delightful. Static asset, not generated per share.
- **Long press for alt brew method**: Keeps UI clean (one button), discoverable with haptic. No layout changes to bean cards.
- **Canvas-based image generation**: Generate share card images client-side using HTML Canvas or a hidden DOM element rendered to image. No server-side rendering needed.

## Dependencies / Assumptions

- @capacitor/share plugin needs to be installed
- Professor Ruphus illustration asset needs to be created/sourced for share cards
- Bean photos are available via `bean.photoUrl` (already in the data model)

## Outstanding Questions

### Resolve Before Planning
(none)

### Deferred to Planning
- [Affects R3, R6][Needs research] Best approach for client-side image generation in Capacitor (html2canvas vs offscreen canvas vs dom-to-image)
- [Affects R3, R6][Technical] Professor Ruphus illustration asset: use existing app assets or create a new share-specific illustration
- [Affects R5][Technical] Where exactly in TastingTab to place the share button (inline in list item vs detail view)
- [Affects R7][Technical] Long press detection on mobile: use `onContextMenu`, `onTouchStart`/`onTouchEnd` with timer, or a library

## Next Steps

-> `/ce:plan` for structured implementation planning
