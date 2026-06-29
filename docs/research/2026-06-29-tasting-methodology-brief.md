# Tasting Methodology Brief — grounding the Intelligent Tasting Wizard

Source: James Hoffmann, *World Atlas of Coffee* (`~/.claude/books/world-atlas-coffee.md`, §8 "Tasting and Flavor")
+ app knowledge files (`coffeeKnowledge.js`, `tastingGlossary.js`, `professorRuphus.js`, `roasterProfiles.js`).
Extracted 2026-06-29 to ground a guided "Tasting Wizard" where Professor Ruphus coaches a NOVICE through
tasting a SPECIFIC bean, reactively, teaching them to develop their palate.

## A. The sensory tasting sequence (the real Hoffmann arc — 10 beats)

Foundational rule: **two systems** — the tongue detects basic TASTES (acidity, sweetness, bitterness),
the nose detects FLAVORS (chocolate, berry, floral) retronasally. **Isolate one attribute per step, never
all at once.** Taste **warm, not hot**. The gold-standard learning mode is **comparative** (Phase 3).

| # | Step | What you DO | Sensing | Beginner cue |
|---|------|-------------|---------|--------------|
| 1 | Dry fragrance | Smell dry grounds | Aromatics at peak concentration | "Nose in the grounds, breathe. Bread? Fruit? Flowers? Chocolate? Nuts?" |
| 2 | Wet aroma | Add water, smell the steam/bloom | How aroma shifts wetted | "Smell the steam — anything new?" |
| 3 | Break the crust | At ~4 min stir the crust, smell as it collapses | The single most aromatic moment | "Stir and smell right then — loudest the coffee gets" |
| 4 | First sip / slurp | Slurp loudly to spray across palate | Holistic first impression | "Slurp — out loud. Gut first word?" |
| 5 | Acidity | Notice bright sparkle front/sides | Pleasant=crisp/juicy, unpleasant=sour | "Alive and juicy like fruit, or flat like water?" |
| 6 | Sweetness | Look for it as it COOLS | Caramelization/Maillard aromatics | "Honey? Brown sugar? Ripe fruit? It grows as it cools." |
| 7 | Body / mouthfeel | Eyes closed, feel weight/texture | Light(tea)→juice→syrup; more ≠ better | "Light like tea or heavy like cream?" |
| 8 | Flavor | Name specific notes (retronasal) | 800+ aromatic compounds | "Breathe out through your nose after swallowing — what shows up?" |
| 9 | Finish / aftertaste | Swallow, wait ~20s | Length; clean+long=quality, woody/cardboard=stale | "Vanish or echo? What's left at 20s?" |
| 10 | Balance | Weigh all together | Harmony; one element too dominant? | "Do the pieces fit, or does one stick out?" |

The app's current `TASTING_STEPS = ['Smell','First Sip','Acidity','Sweetness','Body','Finish']` compresses
1-3 into "Smell," **drops explicit Flavor and Balance**, and teaches no slurp/break/warm technique.

## B. Flavor wheel (tappable-chip tree — gate Tier1→2→3)

- **Fruity** → Berry (blueberry, strawberry, raspberry, blackcurrant=Kenya SL-28) · Citrus (lemon, lime, orange, grapefruit, bergamot=Ethiopia) · Stone fruit (peach, apricot, plum) · Tropical (mango, passionfruit, pineapple) · Dried (raisin, date, fig)
- **Floral** → jasmine (washed-Ethiopia tell), rose, lavender, chamomile, honeysuckle
- **Sweet** → Caramelized (caramel, toffee, brown sugar, molasses, maple) · Honey · Vanilla
- **Nutty/Cocoa** → Nutty (almond, hazelnut, walnut, peanut) · Chocolate (dark, milk, cocoa, cacao nib)
- **Spices** → cinnamon, clove, cardamom, black pepper, nutmeg
- **Roasted** (↑ with darker roast) → toast, grain, malt, smoky, ashy, burnt
- **Green/Veg** → herbal, grassy, leafy, peapod
- **Sour/Fermented** → winey, boozy, overripe, funky/wild ferment (natural-process double-edge)
- **Off-notes** → earthy, woody, musty/cardboard (stale), barnyard, rubber, potato (Rwanda/Burundi defect), papery

## C. The axes (sliders + novice labels, lifted from tastingGlossary)

- **Acidity** (the HARD one — teach "lively" not "sour"): Flat → Soft/mellow → Crisp(apple) → Bright(lemon) → Sharp/sour(too much). Pros prefer high acidity (altitude). Sour = unpleasant end / under-extraction.
- **Sweetness** (the one "up=good" axis): Faint → Present → Sweet → Syrupy. honey/brown sugar/caramel/ripe fruit. Grows as it cools.
- **Body** (a FEEL axis not quality): Light/tea → Medium/juice → Heavy/creamy → Syrupy. "More ≠ better." Natural process + metal filters ↑.
- **Finish**: Short/abrupt → Medium → Long → Lingering (+ clean vs drying/woody quality flag).
- **Balance** (single tap, not slider): balanced · too acidic · too bitter · flat. Imbalance = diagnostic, not failure.

These map 1:1 to the existing 6 spider axes (`fragranceAroma, acidity, sweetness, body, flavor, balance`),
so **slider values feed `convertTastingScores`/the fingerprint directly — real magnitudes, no LLM round-trip.**

## D. Per-bean expected profiles (Ruphus's "intelligence") — origin × process × roast × altitude

ORIGIN (from coffeeKnowledge `ORIGIN_PROFILES`, 35 origins):
- Ethiopia — high acidity, light body, floral+citrus. Washed=jasmine/bergamot/Earl-Grey; Natural=wild blueberry/strawberry.
- Kenya — intense bright acidity, blackcurrant (SL-28), big/juicy.
- Colombia — wide range: chocolatey/heavy (low) → jammy/fruity/complex (high); balanced washed.
- Central America (Guat/Hon/ES/CR) — clean, sweet, balanced, cocoa→fruit. Honduras=lively juicy in best lots. CR=clean/sweet/light.
- Brazil — low acidity, heavy body, chocolate+nutty (espresso baseline).
- Indonesia/Sumatra — very low acidity, heavy body, earthy/woody/spicy.
- (+ Rwanda/Burundi red-apple/berry; Yemen wild/pungent.)

PROCESS: Washed=↑acidity, cleaner, terroir-forward · Natural=↓acidity, ↑body, +fruit regardless of variety, ferment risk · Honey=between · Semi-washed=lowest acidity, heaviest body, earthy, masks terroir.

ROAST: Light=most acidity+origin character, fruit/floral · Medium=peak sweetness, balanced · Dark=roast flavors dominate, origin lost.

ALTITUDE: higher = denser = more acidity + more complex. Ruphus computes "expect" by combining all four,
coaches the user to FIND it, and recalibrates when perception diverges.

## E. Developing a palate (the progression spine)

1. **Comparative tasting is THE method** (two beans side by side) — Phase 3.
2. **Texture before flavor names** — beginners get axes first; flavor naming is the LAST skill (gate Tier-3 chips behind growth).
3. **Calibrate against ground truth** — compare your notes to the bag/roaster description (the "answer key"). End every session with a reveal.
4. **Isolate one attribute at a time** (one step per screen trains this).
5. **Technique**: taste warm, slurp to aerate — novices skip these; teach them explicitly.
6. **Common beginner mistakes**: sour≠acidity (hardest concept); tasting too hot; naming flavors before texture; "more body=better"; over-reading one cup.
7. **The "getting better" ladder**: taste coffee → confident texture axes → distinguish acidity type → name Tier-2 families → name Tier-3 specifics → predict a cup from origin/process/roast and be right. Natural XP/levels spine.

## F. What the app already has vs gaps

ALREADY (≈80% of the brain): `coffeeKnowledge.js` (35-origin profiles + by-process/roast/altitude tendencies, prose);
`tastingGlossary.js` (novice axis copy + inline glossary chips + step spine + scanScorecard); `professorRuphus.js`
(per-bean 6-axis 1-10 flavorProfile + convertTastingScores, hallucination guards); `claude.js` tasting coach
(scaffolded step coaching, narrow-vague-answers, bag-reveal/teach-the-gap, `---EXTRACT---`); `roasterProfiles.js`
(freshness timing, NOT a flavor model).

GAPS to close: (1) add explicit Flavor + Balance steps + slurp/break/warm cues to the spine; (2) structure
`ORIGIN_PROFILES` prose → queryable per-axis expectations `{acidity,body,sweetness,heroDescriptors}` per
origin×process×roast for predict-then-confirm; (3) data-model the §B flavor wheel as gated chips; (4) progression/
skill layer (texture-first → flavor unlock; derive level from tasting history); (5) acidity-specific calibration
micro-step. (Comparative two-bean = Phase 3, separate.)
