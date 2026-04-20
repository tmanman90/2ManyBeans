---
date: 2026-04-19
topic: archive-detail-ux
---

# Archive Detail UX Improvements

## Problem Frame
The archive experience has several friction points that make it feel less polished than inventory. The detail sheet's drag handle is cosmetic-only (no swipe-to-dismiss), archive cards lack the inline "Show details" expand that inventory BeanCards have, the bean photo in the detail sheet isn't tappable for editing (the only place in the app where you can't edit a bean's photo), and the search bar placeholder text gets truncated by the Filter button.

## Requirements

- R1. **Swipe-to-dismiss on detail sheet**: Wire up touch event handlers on the ArchiveDetailSheet drag handle so dragging down dismisses the sheet. Follow standard iOS bottom-sheet behavior: card follows finger, dismisses past a velocity/distance threshold, snaps back otherwise. Currently the handle at line 187-188 is purely visual.

- R2. **"Show details" expand on archive timeline cards**: Add the same expandable details section that inventory BeanCard has (variety, region, farm, altitude, roast level, cup score, etc.) to the archive TimelineRow cards. Currently archive cards only show origin, process, and days owned inline.

- R3. **Tappable photo in archive detail sheet**: Make the bean photo/thumbnail in ArchiveDetailSheet tappable. Tapping opens a photo action flow (camera, library, AI product shot, remove) reusing the existing photo pipeline from EditBeanModal. Add a visual affordance (small edit/camera icon overlay) so it's clear the photo is interactive. This is the only place in the app where bean photos can't be edited.

- R4. **Fix search placeholder truncation**: The archive search bar placeholder "Search beans, roasters, notes..." gets cut off because it shares its row with the Filter button. Shorten the placeholder text or adjust layout so it doesn't truncate on standard iPhone widths.

## Success Criteria
- Detail sheet dismisses via swipe-down gesture with smooth, native-feeling animation
- Archive timeline cards have inline expandable details matching inventory BeanCard pattern
- Tapping bean photo in archive detail sheet opens photo edit options
- Search placeholder text is fully visible on iPhone SE through 16 Pro Max

## Scope Boundaries
- No changes to the inventory BeanCard or its existing expand behavior
- No new photo editing capabilities (reuse existing pipeline)
- No changes to archive filtering, sorting, or timeline grouping logic
- Swipe-to-dismiss only on the drag handle area, not full-card drag (avoids conflict with scrolling)

## Key Decisions
- **Both inline expand AND detail sheet fixes**: User wants quick metadata access on the cards without opening the sheet, plus a better sheet experience when they do open it
- **Reuse existing photo pipeline**: EditBeanModal already has camera, library, AI product shot, and remove. No new UI needed, just wire it up from the detail sheet
- **Handle-only swipe**: Avoids gesture conflicts with the scrollable sheet content

## Outstanding Questions

### Deferred to Planning
- [Affects R1][Technical] Best approach for touch gesture handling: raw touch events vs. a lightweight gesture utility. No third-party gesture library in the project currently.
- [Affects R2][Needs research] How much of BeanCard's expand logic can be extracted vs. duplicated for TimelineRow. May warrant a shared component.
- [Affects R3][Technical] Whether to open EditBeanModal from the detail sheet or render photo actions inline (action sheet style).

## Next Steps
-> `/ce:plan` for structured implementation planning
