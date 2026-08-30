import { canonicalHash, clone } from './contracts.js';

const text = (value) => String(value ?? '').trim();
const normalize = (value) => text(value).toLocaleLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const tokens = (value) => new Set(normalize(value).split(/\s+/).filter(Boolean));
const distance = (left, right) => {
  const a = normalize(left); const b = normalize(right);
  if (!a || !b) return Infinity;
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const previous = row[j]; row[j] = a[i - 1] === b[j - 1] ? diagonal : 1 + Math.min(diagonal, row[j - 1], previous); diagonal = previous;
    }
  }
  return row[b.length];
};

function entryName(coffee) { return text(coffee?.name || coffee?.coffeeName); }
function refFor(coffee, index) { return text(coffee?.refKey || coffee?.coffeeRef) || `coffee-${canonicalHash({ id: coffee?.id || null, index }).slice(0, 8)}`; }
function candidate(coffee, index, source, score) { return { coffee: clone(coffee), ref: refFor(coffee, index), source, score }; }
function namedInventoryEntry(entry, inventory) {
  if (entry && typeof entry === 'object') {
    return inventory.find((coffee) => coffee?.id && entry.id && coffee.id === entry.id) || inventory.find((coffee) => normalize(entryName(coffee)) === normalize(entryName(entry))) || entry;
  }
  return inventory.find((coffee) => normalize(entryName(coffee)) === normalize(entry)) || (entry ? { name: entry } : entry);
}

export function resolveCoffeeReference({ reference, coffees = [], ledger = {}, namedCoffees = null } = {}) {
  const query = text(reference);
  if (!query) return { ok: false, reason: 'empty_reference', candidates: [] };
  const inventory = Array.isArray(coffees) ? coffees : [];
  const named = Array.isArray(namedCoffees) ? namedCoffees : Array.isArray(ledger?.namedCoffees) ? ledger.namedCoffees : [];
  const pool = inventory.length ? inventory : named;
  if (/^(?:that one|the last one|that coffee)$/i.test(query) && named.length) {
    const coffee = namedInventoryEntry(named.at(-1), inventory); return { ok: true, ...candidate(coffee, named.length - 1, 'pronoun', 1) };
  }
  if (/^(?:the first one|the first coffee|first one)$/i.test(query) && named.length) {
    const coffee = namedInventoryEntry(named[0], inventory); return { ok: true, ...candidate(coffee, 0, 'pronoun', 1) };
  }
  const byExact = pool.map((coffee, index) => ({ coffee, index })).filter(({ coffee }) => [coffee?.id, coffee?.refKey, coffee?.coffeeRef, coffee?.name].some((value) => normalize(value) === normalize(query)));
  if (byExact.length === 1) return { ok: true, ...candidate(byExact[0].coffee, byExact[0].index, 'exact', 1) };

  const jar = query.match(/(?:jar|shelf|bean)\s*#?\s*(\d+)/i);
  if (jar) {
    const matches = pool.map((coffee, index) => ({ coffee, index })).filter(({ coffee }) => Number(coffee?.jarSlot) === Number(jar[1]));
    if (matches.length === 1) return { ok: true, ...candidate(matches[0].coffee, matches[0].index, 'jar', 1) };
    if (matches.length > 1) return { ok: false, reason: 'ambiguous', candidates: matches.map(({ coffee, index }) => candidate(coffee, index, 'jar', 0.9)) };
  }

  const queryTokens = tokens(query);
  const scored = pool.map((coffee, index) => {
    const fields = [entryName(coffee), coffee?.roaster, coffee?.origin, coffee?.region, coffee?.farm].filter(Boolean);
    const fieldTokens = new Set(fields.flatMap((value) => [...tokens(value)]));
    if (coffee?.origin) {
      const origin = normalize(coffee.origin);
      fieldTokens.add(origin === 'colombia' ? 'colombian' : `${origin}ian`);
    }
    const overlap = [...queryTokens].filter((token) => fieldTokens.has(token)).length;
    const names = fields.map(normalize);
    const close = names.reduce((best, name) => Math.min(best, distance(query, name)), Infinity);
    const closeEnough = close <= Math.max(2, Math.floor(normalize(query).length * 0.25));
    const originMatch = [...queryTokens].some((token) => token.endsWith('ian') && fieldTokens.has(token));
    const score = Math.max(overlap / Math.max(queryTokens.size, 1), originMatch ? 0.8 : 0) + (closeEnough ? 0.55 : 0);
    return { coffee, index, score, closeEnough };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score);
  if (scored.length > 1 && scored[0].score === scored[1].score) return { ok: false, reason: 'ambiguous', candidates: scored.slice(0, 3).map((item) => candidate(item.coffee, item.index, 'candidate', item.score)) };
  if (scored.length && (scored[0].score >= 0.75 || (scored[0].closeEnough && scored[0].score > (scored[1]?.score || 0) + 0.15))) {
    return { ok: true, ...candidate(scored[0].coffee, scored[0].index, scored[0].closeEnough ? 'close_name' : 'token', scored[0].score) };
  }
  if (scored.length) return { ok: false, reason: 'ambiguous', candidates: scored.slice(0, 3).map((item) => candidate(item.coffee, item.index, 'candidate', item.score)) };
  return { ok: false, reason: 'not_found', candidates: [] };
}

export async function referenceResolver(input = {}) {
  const inventory = Array.isArray(input.coffees) && input.coffees.length ? input.coffees : typeof input.listCoffees === 'function' ? await input.listCoffees() : [];
  return resolveCoffeeReference({ ...input, coffees: inventory });
}

export const resolveCoffee = resolveCoffeeReference;
export { normalize as normalizeCoffeeReference };
