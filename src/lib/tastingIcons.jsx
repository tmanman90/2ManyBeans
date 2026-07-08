// Tasting-note → icon mapping. Every note (common or rare) resolves to a clean
// icon via keyword/category rules (modeled on the SCA Coffee Flavor Wheel), so
// the card never shows a blank. Returns an icon + a category color; the card
// renders it colored on the FRONT and green-line on the BACK (per the mockup).
// Bespoke per-note illustrations can be layered on top of this baseline later.
import {
  Apple, Cherry, Grape, Citrus, Banana, Flower2, Candy, Cookie, Leaf,
  Wheat, Sparkles, Coffee, Nut, Cake, Croissant, Flame, Droplets,
} from 'lucide-react';

// Order matters: more specific buckets first.
const RULES = [
  { icon: Citrus, color: '#E0972F', words: ['citrus', 'lemon', 'lime', 'orange', 'grapefruit', 'yuzu', 'bergamot', 'pomelo', 'mandarin', 'tangerine', 'marmalade'] },
  { icon: Grape, color: '#8A5BA6', words: ['grape', 'muscat', 'wine', 'riesling', 'raisin', 'concord', 'fig'] },
  { icon: Cherry, color: '#CE4B39', words: ['cherry', 'berry', 'raspberry', 'strawberry', 'blueberry', 'blackcurrant', 'currant', 'cranberry', 'blackberry', 'pomegranate', 'rhubarb'] },
  { icon: Banana, color: '#D9A328', words: ['banana', 'tropical', 'mango', 'pineapple', 'guava', 'papaya', 'lychee', 'passion', 'melon', 'kiwi', 'starfruit'] },
  { icon: Apple, color: '#D17A4A', words: ['apple', 'pear', 'peach', 'apricot', 'nectarine', 'plum', 'stone', 'quince'] },
  { icon: Flower2, color: '#D183A4', words: ['floral', 'flower', 'jasmine', 'rose', 'lavender', 'chamomile', 'hibiscus', 'violet', 'blossom', 'elderflower', 'honeysuckle', 'geranium', 'daisy', 'lilac'] },
  { icon: Leaf, color: '#5C8A66', words: ['tea', 'earl grey', 'herbal', 'green', 'grassy', 'mint', 'herb', 'thyme', 'basil', 'sage', 'black tea', 'jasmine tea', 'vegetal'] },
  { icon: Cookie, color: '#8A5A38', words: ['chocolate', 'cocoa', 'cacao', 'mocha', 'fudge', 'brownie', 'dark chocolate'] },
  { icon: Nut, color: '#A98551', words: ['nut', 'almond', 'hazelnut', 'walnut', 'pecan', 'peanut', 'cashew', 'marzipan', 'praline'] },
  { icon: Candy, color: '#D98AA0', words: ['candy', 'gummy', 'bubblegum', 'cotton candy', 'blue raspberry', 'jolly', 'sour'] },
  { icon: Droplets, color: '#D7A23A', words: ['honey', 'syrup', 'molasses', 'nectar', 'agave'] },
  { icon: Cake, color: '#D9B25E', words: ['vanilla', 'caramel', 'toffee', 'butterscotch', 'cake', 'custard', 'cream', 'biscuit', 'graham', 'shortbread', 'pastry', 'sweet', 'sugar', 'brown sugar', 'maple'] },
  { icon: Croissant, color: '#C49A57', words: ['malt', 'grain', 'cereal', 'bready', 'oat', 'dough', 'wheat'] },
  { icon: Flame, color: '#9A6233', words: ['roasty', 'roast', 'tobacco', 'smoky', 'smoke', 'spice', 'cinnamon', 'clove', 'cardamom', 'pepper'] },
  { icon: Coffee, color: '#6A4A33', words: ['earthy', 'woody', 'cedar', 'leather', 'savory', 'umami'] },
];

export function tastingIcon(note) {
  const n = (note || '').toLowerCase().trim();
  for (const r of RULES) {
    if (r.words.some(w => n.includes(w))) return { Icon: r.icon, color: r.color };
  }
  return { Icon: Sparkles, color: '#A2632F' };
}

// Bespoke illustrated icons (front of the card). Keyed by note keyword → file in
// /images/tasting-icons/. Falls back to the lucide line icon (tastingIcon) when
// no illustration exists yet. The set grows as we generate more.
const IMAGE_ICONS = {
  // === compound / disambiguating keys FIRST (includes() matches in insertion order) ===
  'blue raspberry': 'blue-raspberry',
  'red berries': 'raspberry', 'red berry': 'raspberry', 'sweet berry wine': 'raspberry',
  'dark chocolate': 'dark-chocolate', 'milk chocolate': 'cacao',
  'black pepper': 'black-pepper', 'white pepper': 'black-pepper', 'pink peppercorn': 'black-pepper',
  'green tea': 'green-tea', 'matcha': 'green-tea',
  'earl grey': 'earl-grey', 'earl gray': 'earl-grey', 'black tea': 'earl-grey',
  'white tea': 'white-tea',
  'cacao nib': 'cacao', 'orange blossom': 'orange-blossom', 'brown sugar': 'caramel',
  'sugar cane': 'sugar-cane', sugarcane: 'sugar-cane',
  'lemon grass': 'lemongrass',
  'passion fruit': 'passionfruit', 'graham cracker': 'graham',
  'round mouthfeel': 'round',
  // === florals ===
  chamomile: 'chamomile', jasmine: 'jasmine', lavender: 'lavender', violet: 'lavender',
  hibiscus: 'hibiscus', daisy: 'daisy', rose: 'rose', honeysuckle: 'jasmine', elderflower: 'jasmine',
  blossom: 'orange-blossom', floral: 'rose', flower: 'rose',
  // === berries (specific before generic 'berry') ===
  strawberry: 'strawberry', blueberry: 'blueberry', blackberry: 'blackberry',
  raspberry: 'raspberry', cranberry: 'cranberry', blackcurrant: 'blackcurrant', currant: 'cranberry',
  cherry: 'cherry', pomegranate: 'cranberry', berries: 'raspberry', berry: 'raspberry',
  // === stone / pome fruit (pineapple before apple) ===
  apricot: 'apricot', nectarine: 'peach', peach: 'peach', plum: 'plum',
  pear: 'pear', quince: 'pear', apple: 'apple',
  // === citrus ===
  bergamot: 'earl-grey', grapefruit: 'grapefruit', pomelo: 'grapefruit',
  mandarin: 'orange', tangerine: 'orange', marmalade: 'orange', orange: 'orange',
  lemongrass: 'lemongrass', lemon: 'lemon', lime: 'lime', yuzu: 'yuzu', citrus: 'orange',
  // === tropical ===
  pineapple: 'pineapple', lychee: 'lychee', passionfruit: 'passionfruit', passion: 'passionfruit',
  watermelon: 'watermelon', banana: 'banana', kiwi: 'kiwi', melon: 'melon', rambutan: 'rambutan',
  papaya: 'mango', guava: 'guava', starfruit: 'starfruit', tropical: 'mango', mango: 'mango',
  // === grape / vinous (grapefruit handled above) ===
  muscat: 'grape', raisin: 'grape', riesling: 'grape', wine: 'grape', fig: 'fig', grape: 'grape',
  // === chocolate (dark handled above) ===
  cacao: 'cacao', cocoa: 'cacao', mocha: 'cacao', fudge: 'dark-chocolate', chocolate: 'cacao',
  // === nutty ===
  almond: 'almond', hazelnut: 'hazelnut', walnut: 'walnut', pecan: 'walnut',
  marzipan: 'marzipan', praline: 'hazelnut', nut: 'almond',
  // === spice ===
  cinnamon: 'cinnamon', clove: 'clove', cardamom: 'cardamom', ginger: 'ginger',
  nutmeg: 'nutmeg', pepper: 'black-pepper', allspice: 'nutmeg',
  // === sweets / sugar-brown ===
  honey: 'honey', toffee: 'toffee', butterscotch: 'toffee', caramel: 'caramel',
  molasses: 'caramel', maple: 'caramel', marshmallow: 'marshmallow',
  vanilla: 'vanilla', custard: 'vanilla', cream: 'vanilla',
  skittles: 'skittles', candy: 'candy', gummy: 'candy', bubblegum: 'candy',
  // === bakery / grain ===
  graham: 'graham', biscuit: 'graham', shortbread: 'graham', malt: 'malt',
  cereal: 'malt', grain: 'malt', oat: 'malt',
  // === other ===
  bright: 'bright', juicy: 'juice-box', round: 'round', sweet: 'sugar-cane',
  tobacco: 'tobacco', cola: 'cola',
  // === fun ===
  punchy: 'punchy', punch: 'punchy',
};

export function tastingIconImage(note) {
  const n = (note || '').toLowerCase().trim();
  if (IMAGE_ICONS[n]) return `/images/tasting-icons/${IMAGE_ICONS[n]}.png`;
  for (const [k, f] of Object.entries(IMAGE_ICONS)) {
    if (n.includes(k)) return `/images/tasting-icons/${f}.png`;
  }
  return null;
}
