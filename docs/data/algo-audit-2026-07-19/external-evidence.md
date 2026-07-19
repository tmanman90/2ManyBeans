# External Evidence Pack — Coffee Recipe Parameters
Compiled 2026-07-19. Purpose: audit input for a recipe-generating app (BrewCommons algorithm).

---

## 1. Fellow Official Guidance

**Sources:** help.fellowproducts.com Ode Gen 2 grind article (WebFetch 403'd directly; recovered via WebSearch cache), Fellow "pre-installed brew profiles" help article (403 direct, recovered via search snippet), fellowproducts.com/blogs/brew-talks (Ethiopia Regessa guide — fetched OK), fellowproducts.com/pages/exclusive-aiden-brew-profiles (fetched, no numeric content), equatorcoffees.com/blogs/guides/fellow-aiden (3rd-party Fellow-retail recipe page — fetched OK).

**STATUS: help.fellowproducts.com articles — FAILED direct fetch (403), recovered via WebSearch snippet only (lower confidence, may be summarized/stale). Blog + retail-partner pages — SUCCEEDED.**

### Ode Gen 2 grind dial (dial units 1–11.2, three sub-steps each)
| Parameter | Value | Scope |
|---|---|---|
| Filter/pour-over/drip | dial 5–6 | general, "set and forget" |
| French press | dial 7–9 (coarse sea salt feel) | general |
| Light roast starting point | dial 4.2 | roast |
| Medium roast starting point | dial 5.0 | roast |
| Dark roast starting point | dial 5.1 | roast |
| Water temp (fine end of range) | 96–98°C (205–208°F) | general |
| Dose | 15–20g | general |

### Aiden pre-installed profiles (per WebSearch snippet of help article — unverified direct)
| Roast | Ratio | Bloom | Bloom Temp | Pulses | Pulse Temps |
|---|---|---|---|---|---|
| Light (single/small batch) | 1:16–1:17 | 1:3, 35s (30s batch) | 205°F | 4 (5 batch) | declining, 30s apart, starts ~200–210°F |

Additional light-roast example cited: 1:3 bloom 30s @ 202°F, then 4 pulses declining 200°F → 190°F.

### Ethiopia Regessa by April (Fellow official Brew Talks blog — light roast, natural, Krume 74158, 2270 MASL)
| Parameter | Pour-over | Espresso | Batch |
|---|---|---|---|
| Ratio | 1:16.7 (21g:350g) | 1:3 (19g dose, 57g yield) | — |
| Temp | 205°F | 194–200°F | — |
| Grind (Ode Gen 2) | 3–4 | — | 5.2–7.2 |
| Bloom | 40g water, 35s | — | — |
| Pours | to 150g, 250g, 350g (swirl each) | — | — |
| Total time | 4:00–5:00 | 21s pull | — |

### Equator Coffees Fellow Aiden recipes (3rd-party, Fellow-affiliated retailer)
| Recipe | Dose | Ratio | Temp | Bloom | Pulses | Grind |
|---|---|---|---|---|---|---|
| Large batch blend | 60g | 1:15.5 | 200°F | 1:2.5, 45s | 3 @ 40s intervals | medium-coarse |
| Small batch washed single-origin | 19g | 1:16 | 204°F | 1:3, 35s | 2 @ 30s intervals | medium-fine |
| Small batch natural single-origin | 18g | 1:16.5 | 202°F | 1:3, 30s | 3 @ 25s intervals | medium |

Note: this source explicitly states "no declining temperatures" — all pulses held at constant temp, which **conflicts** with the help-center snippet's declining-pulse claim above.

---

## 2. Honest Coffee Guide — Ratio Calculator (fetched OK)

| Method | Ratio | Range |
|---|---|---|
| French Press | 1:15 | 1:12–1:18 |
| Moka Pot | 1:10 | 1:7–1:12 |
| AeroPress (standard) | 1:15 | 1:12–1:18 |
| AeroPress (inverted) | 1:12 | 1:10–1:14 |
| AeroPress (concentrate) | 1:6 | — |
| Espresso | 1:2 | 2:3–2:5 |
| Ristretto | 1:1 | 1:1–2:3 |
| Lungo | 1:4 | 2:5–1:4 |
| Pour-over (general) | 1:15 | 1:14–1:16 |
| V60 | 3:50 (≈1:16.7) | 1:14–1:18 |
| Chemex | 1:15 | 1:10–1:21 |
| Steep-and-release | 1:16 | 1:14–1:17 |
| Cold brew | 1:11 | 1:8–1:15 |
| Cold brew concentrate | 1:5 | 1:4–1:6 |
| Siphon | 1:15 | 1:12–1:16 |
| Auto drip | 1:16 | 1:14–1:17 |
| Turkish | 1:10 | 1:8–1:12 |
| Cupping | 11:200 (≈1:18.2) | 1:17–1:19 |

No temperature or bloom guidance on this page (calculator is ratio-only).

---

## 3. Aiden Profiler (competitor, fellowaidenprofiler.com)

**STATUS:** Homepage + /catalog + /import fetched OK; no individual profile detail pages were reachable (catalog lists coffees but no direct profile-page links surfaced; /import requires auth to resolve a `brew.link`).

### What their profiles carry (per homepage marketing copy)
- Coffee ID: roaster, origin, tasting notes
- Brew temp: full control range 50–98.5°C
- Bloom settings + pulse configuration
- **Grind stored in microns**, translated to 200+ specific grinder dials (handles cross-grinder compatibility — notable vs. BrewCommons' single-grinder-only Ode 2 step model)
- Roast-date/freshness timeline tracking
- Origin / process / roast level metadata
- Catalog size: "1,100+ coffees"
- Profiles are "validated against the Aiden's real device rules" (implies device-side clamping/limits — same concept as BrewCommons' clamp functions)

### Catalog sample (14 coffees, roaster/origin/process/roast only — no numeric parameters visible)
Indonesia Natural Mount Ijen (Andytown, light, natural) · Natural Geisha (Anthem, Panama, light, natural) · Ethiopia Regessa (April, light, natural) · Guatemala SP (April, medium, washed) · Panama Gissell Garrido (Bean & Bean, light, washed) · KILONOVA blend (BIGFACE, light, washed) · Colombia Asobombo (Bird Rock, light, washed) · Little Italy Blend (Bird Rock, medium-dark) · Candy Hearts (Black & White, medium-light, co-ferment) · Esteban Zamora Cinnamon (Black & White, medium-light, cinnamon anaerobic) · Painkiller (Black & White, medium-light, "advanced") · Club Burundi Turaco Light (BlendIn, light, washed) · Mulugeta Muntasha (Boon Boona, light, natural) · Rwanda Cyesha Natural (Brandywine, light, natural)

Could not extract 3–5 individual profile pages with numeric ratio/temp/bloom values (no crawlable profile URLs found; site appears to gate detail behind app/auth flows).

---

## 4. James Hoffmann Published Techniques

**Sources:** jameshoffmann.co.uk direct fetch 404'd; recovered via honestcoffeeguide.com recipe pages (fetched OK) + WebSearch corroboration.

### V60 "Ultimate Technique"
| Parameter | Value |
|---|---|
| Ratio | 3:50 (≈60g/L, 1:16.7) |
| Dose | 30g, medium-fine grind |
| Water temp | 100°C / 212°F (some summaries cite 95°C — see divergence note below) |
| Bloom | 60g water, ~45s |
| Pour 2 | to 300g by 0:45 |
| Pour 3 | to 500g by 1:15 |
| Total time | 3:30 |

### French Press
| Parameter | Value |
|---|---|
| Ratio | 3:50 (30g : 500g, ≈1:16.7) |
| Water temp | 100°C / 212°F |
| Steep | 4 min full immersion, break crust, skim, then 5–8 min settle before plunging just to surface (no press-through) |
| Total time | ~9:30 |

### Iced / Flash Brew (Japanese-style, hot-onto-ice)
| Parameter | Value |
|---|---|
| Ice fraction | 40% ice / 60% hot brew water |
| Dose density | ~65g coffee per liter total (brew water + ice combined), ~5g/L more than standard hot filter |
| Example | 30g coffee, 300g brew water @ 99°C, 200g ice → 1:10 total ratio |
| Grind | slightly finer than usual filter setting |

**Note:** WebSearch also surfaced a 95°C V60 variant elsewhere; the honestcoffeeguide page (fetched directly) says 100°C. Treat 95–100°C as the credible band rather than a single fixed number — see consensus table.

---

## 5. Kasuya 4:6 Method (official, via honestcoffeeguide.com — fetched OK)

| Parameter | Value |
|---|---|
| Ratio | 1:15 (e.g., 20g coffee : 300g water) |
| Water split | first 40% (120g) controls sweetness/acidity; last 60% (180g) controls strength/body |
| Pour sequence (medium strength) | Bloom 60g, then 60g, 90g, 90g |
| Original Kasuya split (alt citation) | 40%: 50g + 70g; 60%: three pours of 60g each |
| Timing | ~30s between pours "until bed runs dry"; ~30s final drawdown; total 3:25 |
| Water temp | 93°C / 199°F (Kasuya's roast-adjusted variant: 93°C light / 88°C medium / 83°C dark) |
| Grind | medium-coarse, "granulated sugar bordering on kosher salt" |
| Adjustability | fewer/more pours in the 40% phase shifts acidity vs. sweetness; changing pour count/size in the 60% phase shifts body/strength |

---

## 6. BrewCommons Algorithm (local file: `/Users/talmeltzer/Documents/VIBE CODING/Coffee-App-Build/docs/data/brewcommons-algorithm.js`)

Non-grind parameter stack extracted (grind/microns omitted per task scope).

### Roast base profiles (single-serve values; batch values differ per field)
| Roast | Temp °F (max) | Ratio | Bloom Ratio | Bloom Duration (single/batch) | Pulses (single/batch) | Pulse Interval | Pulse Temp Decline (single) | Pulse Temp Decline (batch) |
|---|---|---|---|---|---|---|---|---|
| Light | 205 (205) | 1:17 | 1:3 | 45s / 35s | 4 / 5 | 23s | [203,200,198,196] | [205,203,200,198,196] |
| Medium-light | 203 (205) | 1:16.5 | 1:3 | 38s / 32s | 3 / 4 | 23s | [201,198,196] | [203,201,198,196] |
| Medium | 200 (203) | 1:16 | 1:2 | 30s / 30s | 3 / 3 | 23s | [198,196,194] | [200,198,196] |
| Medium-dark | 198 (200) | 1:15.5 | 1:2 | 30s / 28s | 3 / 2 | 23s | [195,192,190] | [195,192] |
| Dark | 190 (195) | 1:15.5 | 1:2 | 30s / 25s | 3 / 1 | 23s | [188,185,183] | [190] |

Dose/water: single-serve dose fixed 22g, batch dose fixed 55g; water = dose × ratio. Bloom temp = brew temp (no separate bloom-temp offset). Global clamps: brewTemp min 185°F (max is roast-specific `tempMax`); ratio clamped 14–18; pulseCount clamped 1–6; bloomDuration clamped 20–60s; pulse temps clamped 183–207°F.

### Origin deltas (tempΔ°F, ratioΔ — grind omitted)
Ethiopia +1temp/+0.5ratio · Kenya +1/+0.5 · Rwanda +1/0 · Yemen 0/0 · Colombia/Guatemala/Costa Rica/Honduras/Panama/Peru/Mexico/Blend 0/0 · Brazil −1/−0.5 · Indonesia −2/−0.5

### Processing deltas (tempΔ, ratioΔ, bloomΔ sec, pulseΔ count)
Washed +1/+0.5/+5/0 · Natural −2/−0.5/−5/−1 · Honey −1/0/0/0 · Anaerobic −1/0/+5/0

### Variety group deltas (tempΔ, ratioΔ, bloomΔ, pulseΔ)
Ethiopian-landrace +2/+0.5/+5/+1 · Bourbon +1/0/0/0 · Typica 0/0/0/0 · Gesha +2/+1.0/+10/+1 · SL28/34 +2/+0.5/+5/0 · Catuai 0/0/0/0 · Catimor-Sarchimor −1/0/0/0 · Pacamara +1/0/+5/0 · F1-modern 0/0/0/0. Per-variety overrides exist for pink-bourbon, maragogipe, kona, castillo, tabi, ruiru-11, batian.

### Elevation deltas (tempΔ, pulseΔ; grind omitted)
≥1800 MASL: +1 temp, +1 pulse · 1400–1799: 0/0 · 1000–1399: 0/0 · <1000: −1/0. (Elevation pulse bonus is skipped entirely for "dense variety" groups — sl/gesha/ethiopian-landrace — to avoid double-stacking with variety deltas.)

### Peaberry / Decaf flags (tempΔ, ratioΔ, bloomΔ, pulseΔ)
Peaberry: +2 / 0 / +5 / +1. Decaf: −8 / 0 / −5 / 0.

### Taste-slider influences (continuous, ±0.5 normalized range each)
- Fruit slider (chocolatey→fruity): temp −3°F max toward fruity
- Acidity slider (smooth→bright): temp −4°F max toward smooth
- Floral slider (nutty→floral): temp −2°F max toward floral
- Body/Strength sliders: ratio −1 max each toward fuller/bolder (tighter ratio)
- Batch mode: grind +6 steps coarser (no temp/ratio/bloom/pulse slider deltas beyond base-profile batch fields)

---

## 7. Cross-Source Consensus Table

| Roast Tier | Ratio — consensus | Ratio — divergence | Temp — consensus | Temp — divergence | Bloom — consensus | Bloom — divergence |
|---|---|---|---|---|---|---|
| **Light** | ~1:16–1:17 (Fellow official 1:16–1:17; BrewCommons 1:17; Hoffmann V60 1:16.7; generic pour-over 1:15–1:16.7) — tight agreement in 1:16–1:17 band | Kasuya's 4:6 runs tighter at 1:15 (different method family, immersion-leaning) | 205°F / ~96°C is the strong consensus (Fellow Ode guidance 96–98°C=205-208°F; Fellow Aiden light 205°F; BrewCommons 205°F; Regessa guide 205°F) | Hoffmann V60 cited at both 100°C and 95°C across sources (widest single-source spread found); Kasuya uses notably cooler 93°C for light | 1:3 bloom, ~35–45s is consensus (Fellow Aiden 1:3/35s; BrewCommons 1:3/45s single-serve; Hoffmann ~45s) | BrewCommons batch bloom shortens to 35s while keeping 1:3; Equator's washed small-batch also 1:3/35s — good alignment |
| **Medium** | 1:15.5–1:16.5 band (BrewCommons 1:16; Equator washed 1:16, natural 1:16.5; generic 1:15) | Espresso-family and Kasuya numbers not comparable (different brew families) | 198–204°F consensus (BrewCommons 200°F max203; Equator washed 204°F, natural 202°F; Kasuya medium 88°C≈190°F is an outlier, notably cooler) | Kasuya's medium (88°C/190°F) sits well below the drip-brew consensus — reflects immersion/pour-over method difference, not necessarily disagreement | 1:2–1:3 ratio, 30s is consensus (BrewCommons 1:2/30s; Equator both recipes 1:3/30-35s) | BrewCommons uses 1:2 for medium vs. Equator's 1:3 — real divergence, BrewCommons runs a tighter bloom ratio at medium+ |
| **Dark** | 1:15–1:15.5 (BrewCommons 1:15.5; French press general 1:15; espresso/Turkish not comparable) | — | 190–195°F is the going range for dark to avoid bitterness (BrewCommons 190°F max195; general guidance for dark = pull temp down); Kasuya dark 83°C≈181°F is the coolest cited number anywhere | Kasuya's dark number is an outlier low vs. drip-style dark guidance, again a method-family effect | 1:2 bloom, ~25–30s consensus (BrewCommons 1:2/30s single-serve, batch drops to 25s; general dark guidance shortens bloom) | BrewCommons batch dark collapses to a **single pulse** and 1 pulse-temp value — most aggressive simplification of any tier, no external source corroborates or contradicts this specifically (dark+batch combo not covered by any fetched source) |

**Overall read:** BrewCommons' ratio and bloom-ratio numbers track mainstream Fellow/Aiden and generic pour-over guidance closely at every roast tier — no red flags there. The steepest number in BrewCommons (dark+batch = 1 pulse, 190°F single pulse temp) has no external corroboration either way since no source covered that specific combination. The most-cited external divergence is temperature: Hoffmann's V60 number is inconsistently reported (95° vs 100°C) across otherwise-reliable pages, and Kasuya's per-roast temps (93/88/83°C) run 10–15°F cooler than Fellow/BrewCommons at every tier — but Kasuya is an immersion-adjacent pour-over method, not a direct comparator for Aiden's pulse-brew mechanics.

---

## Source Success/Failure Summary
- Fellow Ode Gen 2 grind article: **FAILED direct (403)**, recovered via WebSearch snippet
- Fellow pre-installed profiles help article: **FAILED direct (403)**, recovered via WebSearch snippet
- Fellow Brew Talks (Ethiopia Regessa): **SUCCEEDED**
- Fellow exclusive-aiden-brew-profiles page: **SUCCEEDED fetch, no numeric content present**
- fellowproducts.com/pages/brew-guides/washed-aiden-brew-guide: **FAILED (404)**
- Equator Coffees Fellow Aiden guide (3rd party): **SUCCEEDED**
- honestcoffeeguide.com ratio calculator: **SUCCEEDED**
- honestcoffeeguide.com Hoffmann V60 / French press / Kasuya 4:6 recipe pages: **SUCCEEDED** (all three)
- fellowaidenprofiler.com homepage + /catalog + /import: **SUCCEEDED**, but no individual profile detail pages with numeric parameters were reachable
- jameshoffmann.co.uk direct article: **FAILED (404)**, recovered via honestcoffeeguide + WebSearch
- kurasu.kyoto Kasuya article: **FAILED (404)**, recovered via honestcoffeeguide + WebSearch
- BrewCommons local file: **SUCCEEDED** (read in full, 1455 lines)
