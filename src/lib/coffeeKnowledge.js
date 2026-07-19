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
- Home tasting method: brew two different coffees side by side (small French presses work well). Let cool. Taste alternately, a few sips each. Focus on TEXTURES first (mouthfeel, sweetness, acidity), don't worry about naming specific flavors initially. Compare your notes to the roaster's description on the packet.

TASTING ATTRIBUTES:
- Sweetness: Highly desirable. More = better. Does not come from residual sugars (destroyed in roasting) but from aromatic compounds created by caramelization and Maillard reactions.
- Acidity: Pleasant acidity = crisp, juicy, refreshing (like a great apple). Unpleasant = sour. Higher-altitude coffees are more acidic AND more flavorful. Hardest concept for novices.
- Mouthfeel/Body: Physical weight and texture. Light/tea-like to rich/creamy/heavy. Metal-filtered methods (French press) = heavier body. Paper-filtered = cleaner/lighter.
- Balance: Are all tastes harmonious? No single element dominates.
- Finish/Aftertaste: How long flavors linger. Clean, pleasant, lingering = good. Flat, woody, cardboard = stale/low quality.
- Cleanliness: Absence of negative flavors, off-tastes, or unusual harshness/astringency. A distinct quality attribute separate from the others.

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
- Sour/sharp = under-extracted. Fix: grind finer, hotter water, or more contact time.
- Astringent/drying = over-extracted. Fix: grind coarser or cooler water (never finer).
- Weak but balanced = under-dosed. Fix: tighter ratio (more coffee), not the grind.
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
- Five stages: (1) Drying (7-11% water burns off, no browning yet), (2) Yellowing (first browning, basmati rice aroma), (3) First Crack (CO2 builds up, bean pops open, nearly doubles in volume), (4) Development (roaster controls acidity vs bitterness balance), (5) Second Crack (oils to surface, most acidity lost, "generic roast flavor" takes over).
- Chemistry: Maillard reactions (sugars + proteins = browning + aromatics), caramelization (sugars create caramel notes, then bitterness), Strecker degradation (more aromatics). Over 800 volatile aromatic compounds can be created. By end of first crack, few simple sugars remain.
- Acidity decreases with longer/darker roast. Bitterness increases. Sweetness peaks in between.
- Light (after first crack): high acidity, origin preserved, complex aromatics.
- Medium (past first, before second crack): balanced, sweetness often peaks.
- Dark (at/past second crack): generic roast flavors dominate, origin lost.
- Roast level affects brewing: darker roasts are more porous and brittle, so they extract easier. Grind slightly coarser for dark roasts. Lighter roasts need hotter water and finer grind. Darker roasts also stale faster (more porous = oxygen penetrates easier).
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
- Electric Drip: 60g/L, medium grind. Most home machines don't heat water to correct temperature. Buy SCAA or ECBC certified machines. Avoid machines with hot plates (cooks the coffee). Use thermal carafe instead. Brew at least 500ml for best results.

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

// --- BREWER KNOWLEDGE (chat + tasting coach) ---
// Teaches Ruphus what the user's brewer actually is so advice is grounded in
// the right set of adjustable levers. Both blocks always ship in the cached
// static prompt; the dynamic USER SETUP block names which one is active.

export const FELLOW_AIDEN_KNOWLEDGE = `
FELLOW AIDEN (automatic pulse-pour-over brewer):
The Aiden takes pre-ground coffee and automates bloom, pulse count, pulse
interval, pulse temperatures, and total brew time. The user grinds on a
separate grinder (see GRINDERS below) and pours the grounds into the Aiden.
The user cannot manually control pour schedule; those parameters are stored
as a recipe the app generates and pushes to the device via the Brew button.
Adjustable parameters: ratio, bloom ratio, bloom temperature, bloom duration,
pulse count (single-serve and batch), pulse interval, pulse temperatures, and
the external grind. Do not ask for brew time or pour technique; the Aiden
handles those. Aiden recipes are generated per bean and stored on the bean as
aidenRecipe.
`;

export const HANDBREW_BREWER_KNOWLEDGE = `
HAND-BREW (manual pour-over, V60 / Kalita / Chemex):
The user pours water by hand and controls ratio, grind, water temperature,
bloom, pour schedule, and total brew time directly. The app stores a recipe
per bean with those parameters plus step-by-step pour times. When dialing in,
any of these are adjustable. The app's Brew button regenerates the recipe
with fresh research.
`;

// --- GRINDER KNOWLEDGE ---
// Human-prose blurbs for each supported grinder. Consumed by chat + tasting
// coach system prompts. Keep in sync with GRINDER_POUROVER_STARTS in
// src/lib/handbrew.js (machine data). Both must enumerate the same grinder
// keys. Dynamic USER SETUP block names which blurb is active.
export const GRINDER_KNOWLEDGE = `
GRINDERS (micron calibrations per Honest Coffee Guide measured ranges):
Fellow Ode Gen 2: scale 1-11 with 0.1/0.2 sub-steps (e.g. 4.1, 4.2). Lower
  number = finer grind. ~275µm at 1, ~88µm per whole number (5 ≈ 630µm,
  6 ≈ 720µm, 7 ≈ 805µm). V60 range roughly 4-6; light roast V60 starts
  around 4.5. Flat-bed brewers (Kalita) run COARSER: light roast starts
  5.5-6.5 — the device restricts flow, and dense light washed beans shed
  fines that stall the flat bed if ground fine. Note: Aiden light-roast
  recipes use 3.1-4.0 on the Ode, which is too fine for manual pour-over.
Fellow Opus: dial 1-11 with quarter-step clicks. Lower number = finer.
  ~230µm at 1, ~93µm per whole number. Pour-over range about 3-8.5; light
  roast starts around 4.5.
Baratza Encore ESP: 40-step scale, 1-40. Lower number = finer grind.
  ~29µm per step. Pour-over range 16-30; light roast around 16, medium 20,
  dark 25.
Comandante C40 MK4: around 40 clicks from zero. More clicks = coarser
  grind, ~30µm per click. Pour-over range 18-38; light roast around 22,
  medium 28, dark 32.
1Zpresso JX-Pro: ~200 clicks from zero (rotations.number.tick, 1 rotation =
  40 clicks). More clicks = coarser, ~4.6µm per click. Pour-over range
  90-180; light roast around 105, medium 125, dark 145.
Baratza Virtuoso+: 40-step scale, 1-40. Lower number = finer grind.
  ~25µm per step. Pour-over range 10-32; light roast around 15, medium 20,
  dark 25.
Other or custom grinder: most electric burr grinders use lower number =
  finer; most manual hand grinders use more clicks = coarser. If advising a
  numeric change, first confirm the user's direction convention, then give
  the change in words (finer/coarser) along with the number.
Grinder settings are STARTING POINTS: burr calibration varies unit to unit
  (Fellow ships burrs aligned 5 clicks after chirp; self-calibrated units
  read up to half a number different). Correct by drawdown time and taste.
`;

// --- BREW TROUBLESHOOTING RULES ---
// Shared by chat + tasting coach. Replaces the inline rules previously
// hardcoded in buildTastingSystemPrompt.
export const BREW_TROUBLESHOOTING_RULES = `
Brew troubleshooting (apply per brewer):
- Sour / bright / sharp: grind finer; or on Aiden, raise bloom temperature or
  add a pulse; on hand-brew, raise water temp or extend bloom.
- Bitter / harsh / astringent: grind coarser; or on Aiden, lower the final
  pulse temperatures 1-2C; on hand-brew, lower water temp or shorten
  contact.
- Stalled / choked pour-over (water pooling, drawdown way past target —
  V60 2:30-3:30, Kalita 3:00-3:45, Chemex 3:30-5:00): grind coarser 0.5-1
  step. Dense light washed beans on a flat-bed (Kalita) are the classic
  case — never fix a stall by pouring slower or grinding finer.
- Weak / watery / thin: higher dose (stronger ratio, e.g. 1:16 instead of
  1:17).
- Cup is fine: keep the current recipe.
Always cite the direction in words (finer/coarser) AND the new number on the
user's specific grinder from the GRINDERS block. Never invert direction.
`;

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

// --- POUR-OVER-ONLY KNOWLEDGE ---
// Trimmed version for hand brew prompts. Strips French Press and AeroPress sections
// to save ~200 tokens per request while keeping all pour-over-relevant content.
export const HANDBREW_POUROVER_KNOWLEDGE = `
POUR-OVER METHODOLOGY (Hoffmann-inspired, Atlas-derived, app-adapted):
- Rinse paper filter under hot water (reduces paper taste, warms device). Use bleached white papers.
- Bloom: Pour ~2x coffee weight in water. Pick up and swirl or stir to wet all grounds. Wait 30-45 seconds (Hoffmann's published V60 recipe blooms ~45s with staged pours; shorter suits darker roasts).
- Slowly pour remainder of water directly onto coffee bed (NOT the walls). Weigh as you go.
- When surface is 2-3cm below top, give gentle swirl (prevents grounds sticking to walls).
- Diagnostic: flat, even bed = good extraction. Sloped/cratered bed = channeling (pour more evenly).
- Troubleshooting: Sour/under-extracted = grind finer or raise temp. Bitter = grind coarser or lower temp. Astringent/drying = grind coarser (over-extraction symptom, never finer). Weak but balanced = raise the dose (tighter ratio, e.g. 1:17 to 1:16) — strength is a ratio problem, not a grind problem. Change ONE variable at a time.
- Drawdown diagnostics: stalled bed / water pooling / drawdown far past the device target = grind coarser 0.5-1 step, NOT a slower pour. Racing under target = grind finer.
- Flat-bed brewers (Kalita): the device restricts flow, so grind coarser than V60 and recover extraction with hotter water and a swirl. Dense light washed beans shed fines that clog the flat bed if ground fine.

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
