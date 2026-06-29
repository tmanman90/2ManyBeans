# Manual Recipe QA

This note records the evidence and guardrails behind non-Aiden recipe generation.
Aiden recipes remain governed by the Aiden-specific profile engine and tests.

## Trusted Sources

- Local Hoffmann notes: `~/.claude/books/world-atlas-coffee.md`
- Distilled app knowledge: `src/lib/coffeeKnowledge.js`
- Brew Commons comparison data: `docs/data/brewcommons-algorithm.js` and `docs/data/brewcommons-vs-coffeehub-full-inventory.txt`
- Device references checked during the 2026-06-19 audit:
  - Stumptown Kalita Wave guide: `https://www.stumptowncoffee.com/pages/brew-guide-kalita-wave`
  - Stumptown Chemex guide: `https://www.stumptowncoffee.com/pages/brew-guide-chemex`
  - Onyx brew guides: `https://onyxcoffeelab.com/pages/brew-guides`
  - AeroPress official guide: `https://aeropress.com/pages/how-to-use`
  - Epicurious Hoffmann-style French press explainer: `https://www.epicurious.com/expert-advice/how-to-use-a-french-press`

## Current Hard Rails

- `waterGrams` is normalized to `coffeeGrams x ratio`.
- The final positive `steps[].waterTotal` is normalized to `waterGrams`.
- Obvious step prose amounts are normalized when repair changes coffee dose or cumulative water targets.
- Brew times are clamped by device:
  - V60: 2:30-4:00
  - Kalita Wave: 2:45-4:30
  - Chemex: 3:30-6:00
  - AeroPress: 0:50-3:30
  - French press: 9:00-12:00
- Light dense clarity pour-overs, including washed Kenya, washed Ethiopia, and washed floral coffees, are kept hot enough and away from too-coarse Ode Gen 2 settings:
  - V60/Kalita max Ode Gen 2: 4.2
  - Chemex max Ode Gen 2: 6.2
  - Minimum pour-over temperature: 96C
- Dark or porous pour-overs are kept cooler, coarser, and wider:
  - V60/Kalita min Ode Gen 2: 6.2, max temperature 93C, minimum ratio 1:17
  - Chemex min Ode Gen 2: 7.2, max temperature 96C, minimum ratio 1:17
- Device technique and method fields are normalized to the selected brew method.

## Automated Audit

Run:

```sh
npm run audit:manual-recipes
```

The audit covers:

- The exact dose-scaling class from the Kalita issue: 18g/288g scaled to 21g/336g must update visible step prose and structured totals.
- Targeted bad candidate repairs for Kalita, V60, Chemex, AeroPress, and French press.
- A 25-case representative matrix: 5 bean families across V60, Kalita, Chemex, AeroPress, and French press.
- Historical generated V60 recipes from `scripts/model-cost-results-2026-04-05T16-47-25.json`, repaired and rechecked against today's bounds.
- Device bounds, family extraction guardrails, timer readiness, technique/method validity, and stale visible gram text.

## Taste-Test Loop

Static checks can prove coherence and prevent known bad zones, but taste is still the final signal.
Log each real test with:

- Bean, roast date, process, and family if known
- Brew device
- Grinder and grind setting
- Coffee dose and total water
- Water temperature
- Drawdown or total contact time
- Taste outcome: weak/watery, sour/sharp, bitter/harsh, hollow, good, or close
- One next adjustment

Default interpretation:

- Weak, watery, sour, or sharply citrusy means under-extraction: go finer first, then consider hotter water or longer contact.
- Bitter, harsh, drying, or smoky means over-extraction: go coarser first, then consider cooler water or shorter contact.
- Change one variable per brew.
