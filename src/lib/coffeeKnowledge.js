// Coffee knowledge distilled from James Hoffmann's "The World Atlas of Coffee" (2nd Ed.)
// Used as context in AI system prompts for tasting coach, Professor Ruphus, and general chat.

// --- TASTING KNOWLEDGE ---
// Injected into tasting chat system prompt to give the coach deep domain knowledge
export const TASTING_KNOWLEDGE = `
COFFEE TASTING REFERENCE (from James Hoffmann):

HOW TASTING WORKS:
- Mouth detects basic tastes: acidity, sweetness, bitterness, saltiness
- Olfactory bulb (nasal cavity) detects flavors/aromas: chocolate, berries, caramel, florals
- Key technique: focus on one attribute at a time, don't try to process everything at once
- Most important skill-building method: COMPARATIVE TASTING (two coffees side by side makes differences obvious)
- Flavors are easier to discern in warm coffee, not hot

TASTING ATTRIBUTES:
- Sweetness: Highly desirable. More = better. Does not come from residual sugars (destroyed in roasting) but from aromatic compounds created by caramelization and Maillard reactions.
- Acidity: Pleasant acidity = crisp, juicy, refreshing (like a great apple). Unpleasant = sour. Higher-altitude coffees are more acidic AND more flavorful. Hardest concept for novices.
- Mouthfeel/Body: Physical weight and texture. Light/tea-like to rich/creamy/heavy. Metal-filtered methods (French press) = heavier body. Paper-filtered = cleaner/lighter.
- Balance: Are all tastes harmonious? No single element dominates.
- Finish/Aftertaste: How long flavors linger. Clean, pleasant, lingering = good. Flat, woody, cardboard = stale/low quality.

FLAVOR DESCRIPTOR CATEGORIES:
- Fruity: berry (blueberry, strawberry, raspberry), stone fruit (peach, apricot), citrus (lemon, orange, grapefruit), tropical (mango, passionfruit), dried fruit (raisin, date)
- Nutty: almond, hazelnut, walnut, peanut
- Chocolatey: dark chocolate, milk chocolate, cocoa, cacao nib
- Caramel/Sweet: caramel, brown sugar, honey, maple, molasses, toffee
- Floral: jasmine, rose, lavender, bergamot, chamomile
- Spice: cinnamon, clove, black pepper, cardamom
- Roast-derived: toast, grain, cereal, smoky, ashy (increase with darker roasts)

FLAVOR TENDENCIES BY ORIGIN:
- Latin American: clean, balanced, nutty/chocolatey, moderate acidity
- East African (Ethiopia, Kenya): bright acidity, fruity, floral, complex
- Indonesian: heavy body, earthy, lower acidity

BY PROCESS:
- Washed: cleaner, brighter acidity, more complexity
- Natural: heavier body, fruitier/fermented notes (blueberry, strawberry, tropical), can be wild/funky
- Honey: sweetness and body between washed and natural
- Semi-washed/Giling basah: low acidity, heavy body, earthy/woody

BY ROAST LEVEL:
- Light: preserves origin character (acidity, fruit, florals). Most terroir expression.
- Medium: balances origin character with sweetness. Broadly appealing.
- Dark: generic "roast" flavors dominate (bitter, smoky). Origin characteristics lost.

BY ALTITUDE:
- Higher altitude = denser beans = more acidic = more complex flavor
- Lower altitude = softer acidity, heavier body, simpler flavors

BREWING TROUBLESHOOTING:
- Bitter/harsh = over-extracted. Fix: grind coarser or reduce contact time.
- Sour/weak/astringent = under-extracted. Fix: grind finer or increase contact time.
- Change one variable at a time.
`;

// --- PROFESSOR RUPHUS KNOWLEDGE ---
// Injected into Professor Ruphus system prompt for educational stories about beans
export const RUPHUS_KNOWLEDGE = `
COFFEE KNOWLEDGE REFERENCE (from James Hoffmann):

ARABICA VS ROBUSTA:
- Arabica: primary specialty species. Higher altitude. Self-pollinating. Lower caffeine. All specialty coffee.
- Robusta: lower altitude, disease-resistant, ~2x caffeine, woody/burnt flavor. Used for instant/blends.
- Arabica is a natural cross of Robusta x C. euginoides, originating in southern Sudan, flourished in Ethiopia.

COFFEE VARIETIES:
- Typica: original Ethiopian variety. Excellent cup quality, low yield. Spread globally by Dutch.
- Bourbon: natural Typica mutation on Reunion island. Higher yield. Distinctive sweetness (prized).
- Caturra: Bourbon mutation (Brazil 1937). Dwarf, high yield. Quality increases with altitude.
- SL-28: selected in Kenya 1930s. Distinct blackcurrant fruit flavor. Highly prized.
- SL-34: from French Mission Bourbon, Kenya. Fruit flavors, generally considered inferior to SL-28.
- Geisha/Gesha: Ethiopian origin, via Costa Rica to Panama. Exceptionally aromatic/floral. Record auction prices.
- Pacamara: Pacas x Maragogype (El Salvador). Very large beans. Chocolate and fruit, risk of herbal off-flavors.
- Mundo Novo: Typica x Bourbon (Brazil). High yield, strong, disease-resistant.
- Catuai: Caturra x Mundo Novo. Small size with good yield.

PROCESSING METHODS:
- Natural/Dry: whole cherries sun-dried. Adds fruit flavors (blueberry, strawberry, tropical). Higher defect risk.
- Washed/Wet: depulped, fermented, washed clean, dried. Higher acidity, more complexity, cleaner cup.
- Pulped Natural: depulped then dried with mucilage. More sweetness and body vs washed. (Brazil)
- Honey/Miel: like pulped natural with calibrated flesh remaining. Sweetness between washed and natural.
- Semi-washed/Giling Basah: hulled at high moisture (Indonesia). Low acidity, heavy body, earthy/woody/spice.

ROASTING:
- Acidity decreases with longer/darker roast. Bitterness increases. Sweetness peaks in between.
- Light (after first crack): high acidity, origin preserved, complex aromatics.
- Medium (past first, before second crack): balanced, sweetness often peaks.
- Dark (at/past second crack): generic roast flavors dominate, origin lost.
- Freshness: use within 1 month of roast. Espresso needs 5-20 days rest. Filter: 2-3 days.

HARVESTING:
- Selective hand-picking: only ripe cherries, multiple passes. Best quality, most expensive.
- Strip picking: all cherries at once. Mixes ripe/unripe.
- Machine: cheapest, lowest quality. Used in Brazil on flat land.

GRADING:
- Colombia: Supremo (screen 16-18+), Excelso (14-16). Size only, not quality.
- Kenya: AA (largest), AB, PB. AA commands highest auction prices.
- Central America: SHB/SHG (highest altitude) down to Prime.

TRADING:
- C-price: commodity floor price, doesn't reflect production cost.
- Specialty: defined by quality and taste. Origin matters. Traceability valued.
- If a bag lists producer, farm, or cooperative, a better price was likely paid.
`;

// --- ORIGIN PROFILES ---
// Used by Professor Ruphus and general chat to contextualize specific beans by origin
export const ORIGIN_PROFILES = {
  'Ethiopia': 'Birthplace of coffee. Regions: Yirgacheffe (1,750-2,200m, explosively aromatic, Earl Grey-like), Sidama (intensely fruity), Harrar (naturals: blueberry to earthy). Heirloom varieties with vast genetic diversity. Both washed (elegant, floral, citrus) and natural (wildly fruity). Largest African producer.',
  'Kenya': 'Regions: Nyeri, Kirinyaga, Embu, Meru (Central Kenya, 1,200-2,300m). Varieties: SL-28, SL-34 (prized for blackcurrant fruit). Fully washed. Two harvests/year. Grading: AA, AB, PB. Bright, complex berry/fruit, sweetness, intense acidity. Auction system rewards quality.',
  'Colombia': '3rd largest producer. Regions: Huila, Cauca, Narino (most complex), Tolima, Coffee Triangle. Varieties: Caturra (dominant), Castillo. Fully washed. Two harvests. Range from heavy/chocolatey to jammy/sweet/fruity. Grading: Supremo/Excelso (size only).',
  'Brazil': 'World\'s largest producer (~33% global). Low acidity, heavy body, sweet, chocolate/nutty. Natural and pulped natural processing. Varieties: Mundo Novo, Yellow Bourbon, Caturra. Mechanized harvesting. Alternating on/off years.',
  'Guatemala': 'Regions: Antigua (most famous, volcanic), Huehuetenango (highest, astonishing lots). 1,300-2,000m. Bourbon, Caturra, Catuai. Washed. Wide range: light/sweet/fruity to heavy/rich/chocolatey. SHB = above 1,300m.',
  'Costa Rica': 'Regions: Tarrazu (best reputation), Central/West Valley. Caturra, Catuai, Villa Sarchi. Washed since 1830. Micro mill revolution (mid-2000s) dramatically increased diversity. Very clean, sweet, light bodied.',
  'El Salvador': '~68% Bourbon (unusually high heirloom %). Pacas and Pacamara originated here. Famously sweet and well balanced, pleasing soft acidity. Civil war preserved heirloom trees. Volcanic soils.',
  'Panama': 'Famous for Geisha variety (Hacienda La Esmeralda). Boquete region. Citrusy, floral, light bodied, delicate, complex. Record auction prices. Small production.',
  'Honduras': 'Largest Central American producer. Copan, Montecillos, Opalaca regions. Complex fruity quality, lively acidity (best lots). Infrastructure developing.',
  'Peru': 'Cajamarca, Junin, Cusco regions. Historically clean but soft. Increasingly distinctive lots. Large organic/Fair Trade volumes. ~100,000 smallholders.',
  'Rwanda': '"Land of a thousand hills." Bourbon, fully washed. Red apple, grape, berry, floral. Central to post-genocide recovery. Potato defect is known issue.',
  'Burundi': 'Complex berry fruit, juicy quality. Bourbon, fully washed via washing stations. Susceptible to potato defect. 650,000 families dependent on coffee.',
  'Tanzania': 'Kilimanjaro, Arusha regions. Kent, Bourbon, Typica. Complex, bright, lively acidity, berry and fruity. British grading (AA, A, B, PB).',
  'Indonesia': 'Sumatra, Java, Sulawesi, Flores. Semi-washed (giling basah) is traditional: very heavy body, earthy, woody, spicy, low acidity. Fully washed versions are cleaner. "Mandheling" is a trade name, not a place. Avoid Kopi Luwak.',
  'India': 'Karnataka, Tamil Nadu, Kerala. S795, Kent varieties. Heavy, creamy, low acidity. Monsoon Malabar: no acidity, pungent, wild (unique monsooning process). Majority Robusta.',
  'Yemen': 'World\'s oldest commercial producer. Port of Mocha. Heirloom varieties unique to micro-regions. Natural process. Wild, complex, pungent, completely distinctive. High-altitude terraced farming.',
  'Mexico': 'Chiapas, Oaxaca, Veracruz. Bourbon, Typica. Light/delicate to sweet with caramel/toffee/chocolate. Strong Fair Trade and organic culture.',
  'Bolivia': 'Some of the highest-altitude coffee in the world (up to 2,300m). Very sweet, very clean. Tiny production. Typica, Caturra.',
  'Cuba': 'Sierra Maestra region. Typica. Low acidity, heavier body. Small production. US embargo restricts market.',
  'Dominican Republic': 'Barahona (best reputation). Typica dominant. Mild, low to middling acidity.',
  'Ecuador': 'Loja region has greatest quality potential. Hidden gem with unrealized potential.',
  'Nicaragua': 'Jinotega, Matagalpa, Nueva Segovia (emerging star). Complex, fruity, clean acidity.',
  'Papua New Guinea': 'Eastern/Western Highlands. Bourbon, Typica. Buttery, great sweetness, wonderful complexity. Seed stock from Jamaica Blue Mountain. 95% smallholders.',
  'Vietnam': 'World\'s 2nd largest producer. 95-97% Robusta. Very little specialty available.',
  'China': 'Yunnan province. Catimor dominant. Pleasant sweetness, some woodiness, low acidity. Rapidly growing.',
  'Thailand': 'Northern highlands (Chiang Mai, Chiang Rai). Sweet, clean, chocolate, spice. Originally promoted as poppy replacement crop.',
  'Philippines': 'One of few countries growing Liberica and Excelsa species. Very little exported.',
  'Uganda': 'Bugisu/Mt. Elgon (best). Sweet, dark fruits. One of few with indigenous Robusta.',
  'Zambia': 'Tiny production. Bright, floral, clean (rare excellent lots).',
  'Malawi': 'Quite sweet and clean. Geisha and Catimor. Very small production.',
  'DRC': 'Kivu region. Bourbon. Delightful fruitiness, sweet, full-bodied. Up-and-coming.',
  'Hawaii': 'Kona most famous. Typica. Low acidity, more body. Very high prices (labor costs + tourism).',
  'Jamaica': 'Blue Mountain (900-1,500m). Clean, sweet, very mild. Among most expensive globally. Mostly exported to Japan.',
  'Venezuela': 'Production collapsed under price controls. Sweet, low acidity, rich mouthfeel. Exports now rare.',
};

// --- BREWING KNOWLEDGE ---
// Used by general chat and Aiden brew profiles
export const BREWING_KNOWLEDGE = `
BREWING REFERENCE (from James Hoffmann):

KEY VARIABLES:
- Coffee-to-water ratio: Pour-over 60g/L, French press 75g/L, AeroPress 75-100g/L, Espresso ~1:2 by weight
- Grind: finer = more surface area = faster extraction. Use burr grinder (not blade). Blade creates uneven particles.
- Water temp: just off boil for most methods. Espresso: 90-94C. Lighter roasts benefit from hotter water.
- Extraction target: 18-22% of ground coffee by weight.

GRIND SIZE BY METHOD:
- French press: medium (caster/superfine sugar)
- Pour-over: medium (adjust by batch size)
- AeroPress: fine to medium
- Moka pot: fine (not espresso-fine)
- Espresso: very fine (tiny changes matter)

WATER QUALITY:
- Water is 98.5% of filter coffee, ~90% of espresso
- Hard water = cups lacking nuance/sweetness/complexity
- Chlorinated water = terrible coffee. Use carbon filter.
- Soft to moderate hardness ideal.

METHOD GUIDANCE:
- French Press: 75g/L, medium grind, steep 4 min, stir crust, skim foam, wait 5 more min, pour slowly. Heavy body.
- Pour-Over: 60g/L, medium grind, rinse paper filter, bloom 2x coffee weight 30 sec, pour slowly. Clean, clear cup.
- AeroPress: 75-100g/L, steep 1 min then press. Versatile. Easy clean, portable.
- Espresso: 18g in, ~36g out, 27-29 sec, 9 bars. Invest in grinder before machine. Always adjust grind first.

STORAGE:
- Airtight, dark, never refrigerate
- Buy within 2 weeks of roast, use within 1 month
- Whole beans, grind just before brewing
- Freeze for long-term (defrost fully before use)
- Espresso: rest 5-20 days. Filter: 2-3 days minimum.

MILK:
- Steam to 60-68C max. Above this, proteins denature.
- Whole milk recommended (fat adds texture, makes flavors linger)
- Microfoam = tiny invisible bubbles, elastic, pourable
`;

// --- GLOSSARY ---
// Key terms for reference
export const GLOSSARY = {
  'bloom': 'Pouring a small amount of water onto coffee grounds at the start of a pour-over to begin extraction. The coffee swells when wet.',
  'brew ratio': 'The relationship between ground coffee used and water used to brew.',
  'C-price': 'The commodity coffee price on the stock market, the base price for trading.',
  'cherry': 'The fruit of the coffee tree. The two seeds inside are the coffee beans.',
  'crema': 'The layer of brown foam on top of espresso, caused by brewing under high pressure.',
  'cupping': 'The standardized process of brewing, smelling, and tasting coffee used by professionals.',
  'dialling in': 'Adjusting an espresso grinder until the coffee tastes good and is properly extracted.',
  'extraction': 'The brewing process where a percentage of ground coffee dissolves in water.',
  'giling basah': 'Indonesian process where coffee is hulled at high moisture, then dried. Contributes earthy quality. Also called wet-hulled.',
  'green coffee': 'Raw, unroasted coffee. The state in which coffee is traded internationally.',
  'honey process': 'Coffee squeezed from fruit but dried with variable amount of flesh left on. Also called miel.',
  'microfoam': 'Tiny, uniform bubbles created when milk is steamed properly.',
  'micro-lot': 'Typically ten bags (60-69kg each) or fewer of a particular selection.',
  'monsooning': 'Indian process where beans are exposed to monsoon rain for 3-4 months, losing acidity.',
  'mouthfeel': 'The texture and tactile quality of coffee when drinking, from light/tea-like to rich/creamy.',
  'overextraction': 'Extracting too much, resulting in bitter, harsh flavors.',
  'peaberry': 'A single bean forming inside a cherry instead of the usual two.',
  'potato defect': 'East African defect where a single bean smells of potato skins when ground.',
  'strength': 'How much dissolved coffee a cup contains. Brewed coffee: 1.3-1.5%. Espresso: 8-12%.',
  'terroir': 'The combined effect of geography and climate on how coffee tastes.',
  'underextraction': 'Not dissolving enough from the coffee, resulting in sour, astringent cups.',
};

// Helper to get origin context for a bean
export function getOriginContext(origin) {
  if (!origin) return '';
  // Try exact match first, then partial match
  const key = Object.keys(ORIGIN_PROFILES).find(
    k => k.toLowerCase() === origin.toLowerCase()
  ) || Object.keys(ORIGIN_PROFILES).find(
    k => origin.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(origin.toLowerCase())
  );
  return key ? ORIGIN_PROFILES[key] : '';
}

// --- HAND BREW KNOWLEDGE ---
// Full methodology including French Press and AeroPress (used by other features).
export const HANDBREW_KNOWLEDGE = `
HAND BREW METHODOLOGY (from James Hoffmann):

POUR-OVER TECHNIQUE (V60 / Chemex / Kalita / generic cone):
- Ratio: 60g per liter (starting point, experiment to preference)
- Grind: medium / caster sugar for ~30g/500g. Finer for single cup, coarser for larger volumes.
- Water temp: just off the boil (96-100C / 205-212F). Wait 10 seconds after kettle boils if pouring direct.
- Step 1: Rinse paper filter under hot water (reduces paper taste, warms device). Use bleached white papers.
- Step 2: Add coffee to brewer, place on scales.
- Step 3 (Bloom): Pour ~2x coffee weight in water. Pick up and swirl or stir to wet all grounds. Wait 30 seconds.
- Step 4: Slowly pour remainder of water directly onto coffee bed (NOT the walls). Weigh as you go.
- Step 5: When surface is 2-3cm below top, give gentle swirl (prevents grounds sticking to walls).
- Step 6: Let drip through until bed looks dry and relatively flat.
- Diagnostic: flat, even bed = good extraction. Sloped/cratered bed = channeling (pour more evenly).
- Troubleshooting: Bitter = grind coarser. Sour/weak/astringent = grind finer. Change ONE variable at a time.

FRENCH PRESS (Hoffmann's improved method):
- Ratio: 75g per liter
- Grind: medium (NOT coarse. Most people grind too coarse for French press.)
- Water temp: boiling, fresh, low mineral content
- Step 1: Add ground coffee, pour correct amount of water (weigh as you pour).
- Step 2: Leave to steep 4 minutes (coffee floats, forms crust).
- Step 3: After 4 minutes, stir the crust with a large spoon (coffee falls to bottom).
- Step 4: Scoop off remaining foam and floating grounds, discard.
- Step 5: Wait another 5 minutes (too hot to drink anyway; more silt sinks).
- Step 6: Place mesh plunger in top but DO NOT PLUNGE (plunging creates turbulence, stirs up silt).
- Step 7: Pour slowly through mesh. Stop before the very last bit (silt).

AEROPRESS:
- Ratio: 75g/L (regular cup) or 100g/L (short and strong)
- Grind: variable (finer = brew quicker, coarser = extend steep time)
- Water temp: just off the boil (10-20 seconds after kettle boils)
- Steep ~1 minute, quick stir, slowly push plunger down.
- Cannot make espresso (no 9-bar pressure). Makes small, strong cups.

EXTRACTION SCIENCE:
- Target: 18-22% extraction of ground coffee by weight.
- Under-extracted (below 18%): sour, sharp, lacking sweetness. Fix: grind finer, brew longer, hotter water.
- Over-extracted (above 22%): bitter, harsh, astringent. Fix: grind coarser, brew shorter, cooler water.
- The three pour-over variables are interdependent: grind size, contact time, amount of coffee.
- Finer grind = more extraction per unit time AND slower flow rate (more contact time). Double effect.
- Stirring/agitation increases extraction. Pour-over: gentle swirl. French press: stir at 4 min only.

ROAST-LEVEL ADJUSTMENTS:
- Light roasts: harder to extract. Use finer grind, hotter water (full boil OK). More extraction needed to develop sweetness.
- Medium roasts: standard parameters work well. Best starting point for new beans.
- Dark roasts: give up flavors easily. Use coarser grind, slightly cooler water. Risk of over-extraction and bitterness.

PROCESS ADJUSTMENTS:
- Washed: standard grind range. Clean extraction, predictable.
- Natural/honey: slightly coarser grind (higher solubility from fruit sugars). Can over-extract quickly.
- Expect more body and fruit from naturals, more clarity and acidity from washed.

WATER:
- Water is 98.5% of filter coffee by volume. It matters.
- Hard water = cups lacking nuance and sweetness. Soft to moderate ideal.
- Chlorinated = terrible. Use carbon filter at minimum.
- 0.1C temperature changes are undetectable. 1C is the smallest difference most people notice.

FILTER TYPES:
- Paper: cleanest cup, removes oils and suspended material. Clear liquid. Use bleached white (unbleached = papery taste).
- Metal: like French press, allows oils and small particles. Richer body, some sediment.
- Cloth: removes particles but allows some oil. Rich, full mouthfeel. Must store wet in fridge.
`;

// --- POUR-OVER-ONLY KNOWLEDGE ---
// Trimmed version for hand brew prompts. Strips French Press and AeroPress sections
// to save ~200 tokens per request while keeping all pour-over-relevant content.
export const HANDBREW_POUROVER_KNOWLEDGE = `
POUR-OVER METHODOLOGY (from James Hoffmann):
- Rinse paper filter under hot water (reduces paper taste, warms device). Use bleached white papers.
- Bloom: Pour ~2x coffee weight in water. Pick up and swirl or stir to wet all grounds. Wait 30 seconds.
- Slowly pour remainder of water directly onto coffee bed (NOT the walls). Weigh as you go.
- When surface is 2-3cm below top, give gentle swirl (prevents grounds sticking to walls).
- Diagnostic: flat, even bed = good extraction. Sloped/cratered bed = channeling (pour more evenly).
- Troubleshooting: Bitter = grind coarser. Sour/weak/astringent = grind finer. Change ONE variable at a time.

EXTRACTION SCIENCE:
- Target: 18-22% extraction of ground coffee by weight.
- Under-extracted: sour, sharp, lacking sweetness. Fix: grind finer, brew longer, hotter water.
- Over-extracted: bitter, harsh, astringent. Fix: grind coarser, brew shorter, cooler water.
- Finer grind = more extraction per unit time AND slower flow rate (double effect).
- Stirring/agitation increases extraction. Pour-over: gentle swirl after pours.

WATER:
- Water is 98.5% of filter coffee by volume. It matters.
- Hard water = cups lacking nuance and sweetness. Soft to moderate ideal.
`;
