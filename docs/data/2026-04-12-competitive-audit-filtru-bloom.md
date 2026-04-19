---
title: Competitive Audit - Filtru & Bloom vs 2manybeans
date: 2026-04-12
type: research
---

# Competitive Audit: Filtru Coffee & Bloom vs 2manybeans

## App Profiles

**Filtru Coffee** - 4.8 stars, 3,706 ratings, $3.49/mo / $32.99/yr / $79.99 lifetime. Timer-first app, 15+ brew methods, Bluetooth scale support, community recipes, AR gear guides. 9 years old.

**Bloom Coffee Timer & Journal** - Launched March 2026, $2.99/mo / $19.99/yr / $29.99 lifetime. Privacy-first (zero auth, on-device AI), 6 color themes, SCA cupping mode, caffeine tracking. SwiftUI native.

## What We Have That They Don't

- Multi-model AI (Claude + GPT + Gemini) -- neither competitor has cloud AI
- Conversational AI tasting coach with step-by-step novice guidance
- Web search enrichment for bean data (Gemini grounding fills in farm, altitude, cup scores)
- Fellow Aiden direct push (hardware integration)
- AI-generated product photos
- Share cards (apothecary style)
- Professor Ruphus stories
- Research-backed roaster-specific peak timing (deeper than Bloom's generic light/dark windows)
- PWA web access

## What They Have That We Don't

### Priority Features (Tal confirmed interest)

**Brew Timer (both competitors have this)**
- Both Filtru and Bloom are timer-first apps
- Step-by-step countdown, haptic cues at step transitions
- Bloom: edge-to-edge scroll dial, confetti on completion, audio feedback
- Filtru: Bluetooth scale integration, visual flow rate indicator
- Our AI generates recipes with steps but no follow-along timer exists
- Applies to hand-brew recipes only (Aiden is automatic, no timer needed)

**Dark Mode (Bloom has full dark mode per theme)**
- Table stakes in 2026
- Single dark palette is sufficient (no need for multiple themes)

### Noted But Not Prioritized

**Zero-Friction Entry** -- Both competitors allow exploration before auth. Bloom requires zero auth at all (iCloud sync). Filtru auth is optional. We require sign-in first. Tal's view: gating features behind sign-up is the right approach to drive conversions, but the specific UX of when/how the gate appears could be refined.

**Widgets / Live Activities** -- Both competitors offer home screen, lock screen widgets and Live Activities for brew timers. Not a priority right now.

**Lifetime Purchase** -- Both offer it. Not pursuing.

**Theme Personalization** -- Bloom has 6 themes. Not pursuing beyond dark mode.

**Caffeine Tracking** -- Bloom has daily intake + bloodstream curve. Interesting but not priority.

**Equipment Tracking** -- Bloom tracks grinder clicks + step size. We track grinder selection but not click precision.

**Community Recipes** -- Filtru has thousands of community-shared recipes. Major investment, not near-term.

## Pricing Comparison

| App | Monthly | Annual | Lifetime |
|-----|---------|--------|----------|
| Bloom | $2.99 | $19.99 | $29.99 |
| Filtru | $3.49 | $32.99 | $79.99 |
| 2manybeans Pro | $4.99 | $49.99 | -- |
| 2manybeans Ultra | $9.99 | $99.99 | -- |

We're 1.5-2x the market, but justified by real cloud AI costs per request.

## Keywords Update (done 2026-04-12)

Old: `specialty coffee,tasting,pour over,v60,fellow aiden,cupping,roast date,bean tracker,brew recipe,ode`
New: `specialty coffee,tasting,pour over,espresso,cupping,bean tracker,brew recipe,coffee journal,grinder`

Dropped niche terms (v60, fellow aiden, ode, roast date), added higher-volume terms (espresso, coffee journal, grinder).

## Action Items

1. **Brew timer for hand-brew recipes** -- P0 feature. Turn AI-generated recipes from "read and do" into "follow along." Step-by-step countdown, haptic cues, clean UI.
2. **Dark mode** -- P1, table stakes.
3. **Onboarding refinement** -- Evaluate whether to show app preview before sign-in gate.
