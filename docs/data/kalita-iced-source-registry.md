# Kalita iced source registry

Production truth lives in `src/data/kalitaIcedSourceRegistry.js`. This dated view records the same executable values for audit and review.

## Executable sources

| ID | Configuration | Dose | Hot water | Recipe ice | Ice timing | Temperature | Grind | Cadence | Guide |
| --- | --- | ---: | ---: | ---: | --- | --- | --- | --- | --- |
| `kurasu-wave-ice-after-v1` | Any Kalita Wave | 16g | 150g | 140g | Glass after drawdown; stir until cold, complete melt not asserted | 90°C | Medium-coarse, Ode Gen 2 8.2 | 50g at 0:00, 100g at 0:30, 150g at 1:00; small circles around center, no spiral | 1:37–1:40 |
| `espresso-parts-wave-185-direct-v1` | Wave 185 | 20g | 160g | 160g | Server before brew; gently swirl to chill, complete melt not asserted | 91–96°C, 94°C app baseline | Medium | 60g bloom at 0:00, then continuous controlled circles to 160g from 0:30 | 1:30–2:00 |
| `frothy-monkey-wave-large-direct-v1` | Wave 185 large dose | 33g | 300g | 200g | Server before brew; fully melt before serving | 91–96°C, 94°C app baseline | Medium-fine | 70g bloom, 200g at 0:40, then 50g spiral pulses to 300g | 2:30–3:00 |

Primary pages:

- Kurasu: https://kurasu.kyoto/blogs/recipe/new-kalita-wave-iced-coffee-recipe
- Espresso Parts: https://www.espressoparts.com/blogs/news/kalita-wave-iced-coffee-tutorial
- Frothy Monkey: https://frothymonkey.com/blog/iced-kalita-wave-brewing-guide/

## Bounded rules

| ID | Allowed fields | Bounds | Supporting sources |
| --- | --- | --- | --- |
| `kalita-iced-dose-scaling-v1` | dose, hot water, recipe ice, cadence, guide | Wave 155 12–20g; Wave 185 15–36g | All executable sources |
| `kalita-iced-grind-translation-v1` | grinder translation | 600–1000µm | All executable sources |
| `kalita-iced-temperature-range-v1` | temperature | 90–96°C | All executable sources |
| `kalita-iced-explicit-flow-guard-v1` | circle radius and grind | 0–40µm coarser only when trusted guidance explicitly reports fines, clogging, stalling, or slow drawdown | All executable sources |
| `user-configuration` | dose, grinder, size | Supported configuration only | User choice |

## Non-executable context

- `little-waves-wave-185-context-v1`: Little Waves is professional corroboration with ranges, not one canonical schedule.
- `apollons-wave-filter-context-v1`: Apollon's Gold uses an Origami Air S with a Wave 155 filter, not a Kalita Wave dripper.
- `gota-155-discovery-v1`: Gota is discovery/aggregation and its cited Frothy Monkey attribution does not match the published Frothy Monkey recipe.
- Reddit informs failure tests only; it cannot supply numeric production parameters.
