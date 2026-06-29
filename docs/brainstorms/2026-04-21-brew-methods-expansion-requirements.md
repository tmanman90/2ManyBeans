---
date: 2026-04-21
topic: brew-methods-expansion
---

# Brew Methods Expansion + Supporting Features

## Problem Frame
2ManyBeans currently offers two brew paths: Fellow Aiden (automated) and one generic "Hand Brew" (Hoffmann/Kasuya pour-over). Users want device-specific recipes that account for dripper differences (V60's fast drain vs. Kalita's flat bed vs. Chemex's thick filter vs. Aeropress's pressure immersion vs. French Press's full immersion). Additionally, Aiden grind recommendations only display in Ode Gen 2 notation, archived beans hide their saved recipes, and most roasters show as "Unknown" despite reasonable default timing.

## Requirements

### F1. Device-specific brew recipes

Replace the single "Hand Brew" method with five device-specific brew methods. Each generates a recipe tailored to the device's physical characteristics (drain speed, filter type, immersion vs. percolation).

**Brew method lineup (6 total):**
1. Fellow Aiden (existing, automated hardware)
2. Hario V60 (fast-drain cone, thin paper)
3. Kalita Wave (flat-bed, restricted flow, wavy paper)
4. Chemex (thick bonded paper, larger vessel)
5. Aeropress (pressure immersion, inverted or standard)
6. French Press (full immersion, metal mesh)

- F1a. Each device gets its own recipe generation with device-appropriate parameters: grind size, water temperature, pour technique, timing, and step-by-step instructions.
- F1b. Recipe output includes a timer-ready step sequence (like current hand brew) adapted to the device's pour pattern.
- F1c. Grind recommendations are per-device AND per-grinder (the user's grinder preference from Settings determines the notation).

### F2. Default brew device in Settings

- F2a. Add a "Brew Device" preference in Settings (and onboarding, alongside grinder selection). Options: V60, Kalita Wave, Chemex, Aeropress, French Press.
- F2b. The bean card's manual brew button generates a recipe for the default device.
- F2c. Aiden stays as its own separate button (hardware integration, Fellow-specific).
- F2d. In the recipe view, the user can switch to a different device and regenerate. Switching does not change their Settings default.

### F3. Aiden grind translation for all grinders

**Current state:** Aiden recipes show grind recommendations in Ode Gen 2 step numbers only (e.g., "3.2"). Users with a Fellow Opus, Baratza Encore, etc. see steps that don't match their grinder.

- F3a. Aiden grind recommendations must display in the user's grinder notation (from Settings preference), not Ode Gen 2 steps.
- F3b. Conversion uses the existing micron approximation (Ode step to microns) and each grinder's known range/step mapping.
- F3c. If the user has a custom/unknown grinder, display microns with a descriptive label (e.g., "~400um, medium-fine").

### F4. Archive recipe view

**Current state:** Archived beans retain their Aiden recipe, hand brew recipe, and brew links in Firestore, but the archive UI doesn't show any of it.

- F4a. Archived bean detail view shows the last saved recipe (Aiden and/or manual brew), read-only.
- F4b. If an Aiden brew.link exists, display it as a tappable link (even if the profile was deleted from the Fellow device, the brew.link may still work).
- F4c. No recipe regeneration from archive. These are historical records.
- F4d. If no recipe was ever generated for the bean, don't show an empty recipe section.

### F5. Roaster database expansion + roast style classification

**Current state:** 15 hardcoded roasters with peak timing profiles. Everything else shows "Unknown Roaster" with default timing (degas 7-14d, peak 14-60d). Three-layer fix: bigger database, auto-learning, and style-based fallback.

**Layer 1: Pre-loaded roaster database (50-75 roasters)**

- F5a. Expand the roaster database from 15 to 50-75 well-known specialty roasters. Each mapped to a roast style category with appropriate peak timing.
- F5b. Roasters should cover major US specialty (Blue Bottle, Counter Culture, Intelligentsia, George Howell, Sey, Onyx, etc.), major Nordic (Tim Wendelboe, Koppi, La Cabra, Coffee Collective, Drop, April, etc.), notable international (Manhattan Coffee Roasters, Square Mile, Assembly, etc.), and popular direct-to-consumer roasters.

**Layer 2: Auto-learn from enrichment**

- F5c. When the enrichment pipeline (Bug B4) researches an unknown roaster, classify its roast style from web data and save the classification on the bean.
- F5d. Over time, build a per-user learned roaster cache: if a user adds 3 beans from the same roaster, all subsequent beans from that roaster inherit the learned style without re-enriching.

**Layer 3: Roast style fallback (for truly unknown roasters)**

- F5e. Roast styles (derived from existing profile categories):
  - Nordic / Ultra-Light (degas 10-14d, peak 21-60d)
  - Specialty Light (degas 7-14d, peak 14-60d)
  - Medium (degas 5-10d, peak 10-45d)
  - Dark (degas 3-7d, peak 7-30d)
  - Extended Rest (e.g., Apollon's Gold: degas 35-45d, peak 60-90d)
- F5f. If a roaster is not in the pre-loaded database AND enrichment can't classify it, fall back to style-based classification from the bean's roast level. Manual entry allows user selection.

**Display and override**

- F5g. Show the roaster name (if recognized) or style label on the bean card instead of "Unknown Roaster."
- F5h. User can override the roast style in Edit Bean if the auto-detection is wrong.
- F5i. Keep existing 15 roasters with their specific custom timing as the highest-priority override.

## Success Criteria

- V60 and French Press recipes for the same bean produce meaningfully different grind sizes, water temps, and pour techniques
- A user with a Comandante C40 sees grind recommendations in clicks (e.g., "22 clicks") in both Aiden and manual recipes
- An archived bean from 3 months ago shows its saved Aiden recipe and brew.link
- A bean from an unknown roaster shows "Specialty Light" (or appropriate style) instead of "Unknown Roaster"
- Switching brew device in the recipe view regenerates without changing the Settings default

## Scope Boundaries

- NOT adding espresso as a brew method (fundamentally different equipment, pressure, and dosing)
- NOT adding cold brew (different extraction paradigm, would need its own system)
- NOT changing the Aiden recipe generation pipeline (grind enforcement, family classification, reference profiles all stay)
- NOT building a brew timer feature in this scope (recipes are timer-ready but the timer UI is a separate feature, already identified as P0 in the roadmap)
- NOT removing the existing roaster database entries (they become overrides, not the primary system)

## Key Decisions

- **Device-specific recipes, not generic pour-over.** The devices brew differently enough that a V60 recipe poured into a Chemex would produce bad results. Worth the extra recipe engineering.
- **Default device in Settings, switch per-recipe.** Matches the grinder pattern. One button on bean card, flexibility in recipe view.
- **Aiden stays as a separate button.** Hardware integration is fundamentally different from manual brew. Mixing them would confuse the UX.
- **Three-layer roaster resolution: database + auto-learn + style fallback.** Pre-loaded database covers the common case, enrichment auto-learns new roasters over time, and style classification catches the rest. Eliminates "Unknown Roaster" at every level.
- **Archive recipes are read-only.** Archived beans are historical records. No regeneration, no editing. The value is being able to reference what worked.

## Dependencies / Assumptions

- The hand brew recipe generation system (`lib/handbrew.js`, `hooks/useHandBrew.js`) is the foundation for device-specific recipes. It will need to be extended, not replaced.
- Grinder-to-micron conversion exists for all 6 grinders in `handbrew.js`. Aiden grind translation (F3) can reuse this mapping.
- The enrichment pipeline (being fixed in the bugs doc, B4) will provide roast level data that feeds into roast style classification (F5).
- The brew timer feature (P0 roadmap item) is a separate effort. Recipes will be timer-ready (step sequences with times) but the timer UI is not in scope.

## Outstanding Questions

### Resolve Before Planning
_None. All product decisions are locked._

### Deferred to Planning
- [Affects F1a][Needs research] What are the key recipe parameters that differ per device? Planning should research: grind size ranges, water temperature adjustments, pour patterns, brew ratios, and timing for each of the 5 manual methods. Reference the World Atlas of Coffee and existing coffee knowledge in the app.
- [Affects F1a][Technical] Should each device have its own system prompt (like Aiden's AIDEN_SYSTEM_PROMPT), or one shared prompt with device-specific parameter injection?
- [Affects F2a][Technical] Should brew device selection be part of onboarding (screen R07 alongside grinder), or added later in Settings only?
- [Affects F3b][Technical] Aiden grind bands are defined in Ode Gen 2 steps. The conversion to other grinders uses a micron intermediary. Confirm the accuracy of the micron mapping for each grinder, especially at the fine end where pour-over grind matters most.
- [Affects F4a][Technical] Does the archive detail view currently use a modal, a slide-up, or a separate screen? Where should the recipe section be placed?
- [Affects F5a][Needs research] Curate the 50-75 roaster list. Planning should research well-known specialty roasters and classify each into a roast style category. Sources: existing seed data, reference profiles, community lists.
- [Affects F5c][Technical] Where does the auto-learned roaster cache live? Per-user Firestore subcollection, or a field on the bean doc? Consider: should learned roasters be shared across users or per-user only?
- [Affects F5e][Needs research] Validate the peak timing ranges for Medium and Dark styles. The current codebase has data for Nordic and Specialty Light but Medium/Dark timing may need research.
- [Affects F5f][Technical] At what point in the Add Bean flow should roast style be classified? During Gemini scan, during enrichment, or as a post-save step?

## Next Steps

-> `/ce:plan` for structured implementation planning
