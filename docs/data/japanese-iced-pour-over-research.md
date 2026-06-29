# Japanese Iced Pour Over Research (April 2026)

Sources: Grok research mode (EN + JP), last30days (Reddit, X, YouTube, TikTok), WebSearch.
Primary trusted source: Kurasu Kyoto head roaster recipes.

## Universal Flash Brew Principles

- Brew concentrated hot (coffee:hot water ~1:8-10) so ice dilution yields ~1:15-17 total strength
- Use 90-94C (lower for dark roasts)
- Grind finer than normal pour over (medium-fine)
- Ice in server = fastest chill / least oxidation (Kurasu preference for light roasts)
- Ice in glass = easier cleanup
- Stir/swirl server to melt ice fully and homogenize
- Finish brew before last drops for clarity
- Light-medium roast specialty beans preferred

## Device Recipes (1 serving, ~200-250ml final)

### Hario V60 (Kurasu Kyoto, most referenced)
- 16g coffee, medium-fine grind
- 150g hot water at 91C
- 70g ice in server
- Ice:water ratio ~0.47:1
- Pour 1: 0:00, 40g in 10s (bloom, stir 2-3x gently)
- Pour 2: 0:40, 60g in 10s
- Pour 3: 1:10, 50g in 10s (gentle)
- Drawdown ~2:10
- Swirl server until all ice melts, pour over fresh ice

### Kalita Wave (Kurasu Kyoto)
- 16g coffee, medium-coarse grind
- 150g hot water at 90C
- 140g ice in glass
- Ice:water ratio ~0.93:1
- Pour 1: 0:00, 50g slow circular center pour, wait 30s
- Pour 2: 0:30, 50g, wait until 1:00
- Pour 3: 1:00, 50g
- Drawdown ~1:37-1:40
- Pour brewed coffee over 140g ice in glass, stir until cold

### Chemex (scaled JP-style adaptation)
- 30-36g coffee, medium-fine grind
- 300-335g hot water at 91-96C
- 150-200g ice in carafe
- Ice:water ratio ~0.5-0.6:1
- Bloom ~60g / 30-45s with stir
- 3-4 spiral pours to total hot water
- Drawdown ~3:30-4:00 (thicker filter slows it)

### Origami Dripper (Kurasu barista Mishima)
- 13g coffee, medium grind (Fellow Ode ~6)
- 140g hot water at 91C
- 150g ice in server
- Ice:water ratio ~1.07:1
- Spiral pours: 0:00 40g, 0:40 50g, 1:20 50g (10s each)
- Drawdown 1:45-2:00
- Cone filter for body, Wave filter for acidity

### Kono (traditional Japanese technique)
- 20g coffee, medium grind
- 100-155g hot water at 90-96C
- 75-140g rock ice in glass
- Ice:water ratio ~0.5-1:1
- Gentle center point-drip first ~50g over 1:30 (let swell slowly)
- Then continuous or 2 more pours to total
- Total brew ~2:00-2:30

### Clever Dripper
- 20-28g coffee (light roast higher dose), medium-coarse grind
- 180-225g hot water at 88-92C
- 100-120g ice in glass/server
- Ice:water ratio ~0.5:1
- Full immersion: add hot water, stir after bloom, steep 3-4 min
- Release directly over ice

### AeroPress (The Coffee Shop JP)
- 18g coffee, medium grind (paper) / medium-coarse (metal)
- 120g hot water at 80-92C
- 100g ice in server + 3 cubes in glass
- Ice:water ratio ~0.83:1
- Inverted method: 50g + stir, then +70g to 120g total
- Steep 1:30, cap, flip, press 30s into server with ice

### Fellow Aiden Flash Brew (CONFIRMED, r/FellowProducts + Fellow support)

The Aiden's minimum ratio is 1:14, which is too dilute for flash brew (Kurasu V60 uses 1:9.4
hot water). The community-standard workaround: OVERDOSE the basket. The machine dispenses
water based on the volume setting, not the actual coffee in the basket.

**Confirmed recipe (u/nonbinarybullshet, 15 upvotes, tested with Verve Ethiopia/Kenya, Sey Gesha):**
- 30g coffee (OVERRIDE machine suggestion of ~20-21g)
- Grind: Ode Gen 2 setting 4 (medium, finer than normal hot pour over)
- Volume setting: ~10oz / 280-300ml (machine dispenses this regardless of dose)
- Effective hot water ratio: 300/30 = 1:10 (true flash brew territory)
- Ice: 165-180g in carafe BEFORE brewing (large cubes / rock ice)
- Total liquid: ~465-480ml / 30g = 1:15.5-16 (matches Kurasu/Hoffmann target)

**Second data point (Fellow researcher-tested, shared via support):**
- 30g coffee + 250ml brew water + 168g ice in carafe
- Effective ratio: 250/30 = 1:8.3 (even more concentrated)
- Total: 418ml / 30g = 1:13.9

**Profile settings (consensus from multiple threads + Grok JP/EN research):**
- Ratio on machine: 1:14 (minimum, or whatever gets you 280-300ml output)
- Bloom: 1:3 ratio, 45s, 95C
- Pulses: 3x, 20s intervals
- Temps: declining [95, 94, 93]C
- Brew temp: 95C (drop to 94C for darker roasts)

**Why this is trusted:**
- Fellow support acknowledged and provided flash-brew recipes using this overdose method
- Single-serve basket handles 30g fine for light/medium roasts
- Community explicitly does genuine flash brew (ice in carafe, brew onto it), NOT "brew hot then pour over ice later"
- Repeated across 2024-2026 posts with minor tweaks
- Distinct from Aiden's cold-brew mode (hot bloom + cold drip, different result)

**Grind adjustments per bean type (for app integration):**
- Light washed floral/Ethiopia/Kenya: Ode 3.2-4, temp 95C
- Clean natural fruit: Ode 4.2, temp 93-94C
- Dark roast: Ode 5-6, temp 92C

## Flash Brew Translation Formulas (Hot → Iced)

Given any hot brew recipe for a specific bean, these formulas produce the flash brew version.
The bean-specific character (grind family, temp curve, bloom structure) carries over from
the hot recipe. The translation only changes concentration and adds ice.

### Category 1: Manual Pour-Over (V60, Kalita, Chemex, Origami, Kono)

Input: hot recipe with { dose, totalWater, grind, temp, pourStructure }

Translation:
- dose: KEEP (same as hot)
- hotWater: totalWater * 0.6 (60% of original)
- iceGrams: totalWater * 0.4 (40% of original, in server BEFORE brewing)
- grind: shift 1-2 steps finer than hot recipe
- temp: same or +1C (compensate for ice contact cooling)
- pourStructure: KEEP same number of pours, scale each pour down proportionally
- bloomWater: KEEP same bloom ratio (2-3x dose), counts toward hotWater total

Example: V60 hot recipe 16g / 260g water / Ode 5 / 93C
  → Flash brew: 16g / 156g hot water / 104g ice / Ode 4.2 / 94C
  → Total liquid: 260g, effective ratio unchanged, but brewed concentrated then diluted

Device-specific notes:
- V60: ice in server. Spiral pour. Fastest drawdown of the pour-overs.
- Kalita: ice in glass (not server). Pour brewed coffee over ice after. Flat bed = more even extraction.
- Chemex: ice in carafe. Thicker filter = slower drawdown, may need slightly coarser than formula suggests.
- Origami: ice in server. Cone filter for body, Wave filter for acidity (JP-sourced insight).
- Kono: ice in glass (rock ice). Gentle center point-drip for first pour. Traditional JP technique.

### Category 2: Immersion (Clever Dripper, AeroPress)

Input: hot recipe with { dose, water, grind, temp, steepTime }

Translation:
- dose: KEEP (same as hot)
- water: reduce to 60% of original
- iceGrams: 40% of original total water (in server/cup, press/release ONTO the ice)
- grind: KEEP same or 1 step finer (immersion already extracts efficiently)
- temp: same or +1C
- steepTime: KEEP same (the concentration comes from less water, not longer contact)

Device-specific notes:
- Clever: steep full time, then release directly over ice in glass/server.
- AeroPress: inverted method preferred. Steep, cap, flip, press onto ice. 30s press.

### Category 3: Fellow Aiden (Automatic)

Input: hot Aiden profile JSON with { ratio, bloom, pulses, temps, grind }

Translation:
- ratio: force to 14 (minimum, regardless of hot recipe's ratio)
- dose: 30g (OVERRIDE machine suggestion, user instruction)
- volumeMl: ~300 (machine dispenses this based on ratio * suggested dose)
- iceGrams: 170 (in carafe BEFORE brewing)
- grind: shift 1-2 steps finer within family band
- bloomRatio: KEEP (family-driven, e.g., 3.0 for washed, 2.5 for natural)
- bloomDuration: KEEP
- bloomTemp: +1C (compensate for ice stealing heat)
- pulseTemps: each +1C from hot recipe
- pulseIntervals: KEEP (extraction character, not method-dependent)
- pulseCount: KEEP

Effective result: 300ml / 30g = 1:10 hot concentration + 170g ice = 1:15.7 total

### Universal Principles (all devices)

1. The 60/40 hot-water/ice split is the starting point. Adjust +-5% to taste.
2. Grind finer because less water needs more extraction per gram.
3. Temps same or slightly higher because ice contact cools the slurry.
4. Light roasts shine in flash brew (acidity + aromatics lock in). Dark roasts work but are less revelatory.
5. Bloom phase is critical: keeps same ratio as hot recipe. Under-blooming in flash brew = channeling.
6. Final cup target: 1:15 to 1:17 total liquid ratio (matches Kurasu/Hoffmann consensus).

## Key Insight: Japanese vs English Sources
- Kono point-drip technique barely exists in English content
- Origami filter choice guidance (cone for body, Wave for acidity) is JP-sourced
- Kurasu Kyoto recipes are the most battle-tested and replicated
- Japanese barista competition recipes tend toward lower temps and slower pours
