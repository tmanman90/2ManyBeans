import { canonicalHash, clone } from '../../src/lib/ruphus/contracts.js';

export const DEFAULT_HISTORY_DAYS = 14;
export const MAX_SNAPSHOT_LINES = 12;
// E1/E3 concrete bounds from the approved requirements: twelve snapshot
// lines/about 600 characters and eight ledger entries/about 4 KB.
export const MAX_SNAPSHOT_CHARS = 600;
export const MAX_LEDGER_ENTRIES = 8;
export const MAX_LEDGER_BYTES = 4096;
export const MAX_READS_PER_TURN = 6;
export const MAX_TOOL_ROUNDS = 2;
export const READ_TIMEOUT_MS = 1500;

const text = (value) => String(value ?? '').trim();
const asDate = (value) => value instanceof Date ? value : new Date(value);
const daysAgo = (value, now = Date.now()) => { const date = asDate(value); return Number.isFinite(date.getTime()) ? Math.max(0, Math.round((now - date.getTime()) / 86400000)) : null; };
const slotDisplay = Object.freeze({ aiden: 'Aiden', v60_hot: 'hot V60', v60_iced: 'iced V60', kalita_hot: 'hot Kalita', kalita_iced: 'iced Kalita' });
const LEDGER_FIELDS = Object.freeze(['kind', 'status', 'summary', 'windowDays', 'count', 'at', 'namedCoffees', 'coffee', 'evidence', 'methodFocus']);
const COFFEE_FIELDS = Object.freeze(['name', 'roaster', 'origin', 'process']);
const METHOD_FOCUS_NAMES = new Set(['Aiden', 'hot V60', 'iced V60', 'hot Kalita', 'iced Kalita']);
const RECIPE_CONFIGURATION_FIELDS = Object.freeze(['method', 'device', 'mode', 'variant', 'v60Variant', 'v60Size', 'kalitaSize', 'size']);
const SOURCE_CONFIGURATION_FIELDS = Object.freeze(['device', 'variant', 'mode', 'size', 'model', 'filter', 'material']);
const byteLength = (value) => new TextEncoder().encode(value).byteLength;

function safeLedgerValue(value) {
  if (value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.filter((item) => typeof item === 'string').map((item) => text(item)).filter(Boolean);
  return undefined;
}

/** Public ledger projection. IDs, records, refs, and authority fields never enter replayed context. */
export function sanitizeLedgerEntry(entry = {}) {
  const result = {};
  for (const key of LEDGER_FIELDS) {
    if (!Object.hasOwn(entry, key)) continue;
    if (key === 'coffee') {
      if (!entry.coffee || typeof entry.coffee !== 'object') continue;
      const coffee = Object.fromEntries(COFFEE_FIELDS.filter((field) => text(entry.coffee[field])).map((field) => [field, text(entry.coffee[field])]));
      if (Object.keys(coffee).length) result.coffee = coffee;
      continue;
    }
    if (key === 'evidence') {
      if (!Array.isArray(entry.evidence)) continue;
      result.evidence = entry.evidence.map((item) => sanitizeLedgerEntry(item)).map((item) => Object.fromEntries(['kind', 'status', 'summary', 'windowDays', 'count'].filter((field) => Object.hasOwn(item, field)).map((field) => [field, item[field]])));
      continue;
    }
    if (key === 'methodFocus') {
      const displayName = text(entry.methodFocus?.displayName);
      if (METHOD_FOCUS_NAMES.has(displayName)) result.methodFocus = { displayName };
      continue;
    }
    const clean = safeLedgerValue(entry[key]);
    if (clean !== undefined) result[key] = clean;
  }
  if (result.namedCoffees) result.namedCoffees = [...new Set(result.namedCoffees)].slice();
  if (result.summary) result.summary = text(result.summary);
  result.at = typeof result.at === 'string' ? result.at : new Date().toISOString();
  return result;
}

function publicRecipeConfiguration(record = {}) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
  const result = {};
  for (const key of RECIPE_CONFIGURATION_FIELDS) {
    const value = record[key];
    if (typeof value === 'string' && text(value)) result[key] = text(value);
    else if (typeof value === 'number' && Number.isFinite(value)) result[key] = value;
  }
  const source = record.sourceConfiguration;
  if (source && typeof source === 'object' && !Array.isArray(source)) {
    const configuration = Object.fromEntries(SOURCE_CONFIGURATION_FIELDS
      .filter((key) => typeof source[key] === 'string' && text(source[key]))
      .map((key) => [key, text(source[key])]));
    if (Object.keys(configuration).length) result.sourceConfiguration = configuration;
  }
  const rawSlot = text(record.slotKey || record.slot);
  const methodSlot = `${text(record.method)}_${text(record.mode || (record.isIced ? 'iced' : 'hot'))}`;
  const display = slotDisplay[rawSlot] || slotDisplay[methodSlot];
  if (display) result.slot = display;
  return Object.keys(result).length ? result : null;
}

export function publicEvidence(evidence = {}) {
  const result = {};
  for (const kind of ['coffee', 'recipe', 'brews', 'tastings']) {
    const value = evidence[kind];
    if (!value || typeof value !== 'object') continue;
    result[kind] = Object.fromEntries(['kind', 'status', 'summary', 'windowDays', 'count'].filter((key) => Object.hasOwn(value, key)).map((key) => [key, clone(value[key])]));
    if (value.coffee && typeof value.coffee === 'object') result[kind].coffee = Object.fromEntries(COFFEE_FIELDS.filter((field) => text(value.coffee[field])).map((field) => [field, text(value.coffee[field])]));
    if (kind === 'recipe' && Array.isArray(value.records)) {
      const configurations = value.records.map(publicRecipeConfiguration).filter(Boolean);
      if (configurations.length) result[kind].configurations = configurations;
    }
  }
  return { ...result, windowDays: evidence.windowDays, readAt: evidence.readAt, unavailable: Array.isArray(evidence.unavailable) ? evidence.unavailable.slice() : [] };
}

export function ledgerEntryFromEvidence(evidence = {}, { coffee = null } = {}) {
  const categories = ['coffee', 'recipe', 'brews', 'tastings'].map((kind) => {
    const value = evidence[kind];
    return value ? { kind, status: value.status, summary: value.summary, windowDays: value.windowDays, ...(Number.isFinite(value.count) ? { count: value.count } : {}) } : null;
  }).filter(Boolean);
  const named = coffee?.name ? [text(coffee.name)] : evidence.coffee?.coffee?.name ? [text(evidence.coffee.coffee.name)] : [];
  return sanitizeLedgerEntry({ kind: 'evidence_read', status: evidence.unavailable?.length ? 'partial' : 'available', windowDays: evidence.windowDays, namedCoffees: named, ...(coffee ? { coffee } : {}), evidence: categories });
}

function safeCoffee(coffee, refKey) {
  return { refKey, name: text(coffee?.name || coffee?.coffeeName), roaster: text(coffee?.roaster), origin: text(coffee?.origin), process: text(coffee?.process), jarSlot: coffee?.jarSlot ?? null, status: coffee?.status || null, daysOffRoast: daysAgo(coffee?.roastDate), recipes: (coffee?.recipes || coffee?.recipeSlots || []).map((item) => slotDisplay[item] || text(item)).filter(Boolean), lastBrewDate: coffee?.lastBrewDate || null };
}

export function buildRotationSnapshot({ coffees = [], setup = {} } = {}) {
  const refs = {};
  const visible = (Array.isArray(coffees) ? coffees : []).filter((coffee) => coffee?.status !== 'FINISHED' && coffee?.status !== 'SEALED').sort((a, b) => Number(a?.jarSlot || 99) - Number(b?.jarSlot || 99)).slice(0, 3).map((coffee, index) => {
    const refKey = `c${canonicalHash({ id: coffee?.id || coffee?.name, index }).slice(0, 8)}`;
    refs[refKey] = coffee?.id || null;
    return safeCoffee(coffee, refKey);
  });
  const setupLine = `Setup: ${slotDisplay[setup.defaultMethod] || text(setup.defaultMethod || 'default method not set')}, ${text(setup.grinder || 'grinder not set')}, ${text(setup.units || 'metric')}.`;
  const lines = [setupLine, ...visible.map((coffee, index) => `Jar ${coffee.jarSlot ?? index + 1}: ${coffee.name || 'unnamed coffee'}${coffee.roaster ? `, ${coffee.roaster}` : ''}${coffee.origin ? `, ${coffee.origin}` : ''}; ${coffee.recipes.join(', ') || 'no saved recipe'}.`), `Rotation: ${visible.length} active jars.`];
  const boundedLines = [];
  let chars = 0;
  for (const line of lines.slice(0, MAX_SNAPSHOT_LINES)) {
    const separator = boundedLines.length ? 1 : 0;
    const remaining = MAX_SNAPSHOT_CHARS - chars - separator;
    if (remaining <= 0) break;
    const value = line.length <= remaining ? line : `${line.slice(0, Math.max(0, remaining - 1)).trimEnd()}…`;
    boundedLines.push(value); chars += separator + value.length;
    if (value.length < line.length) break;
  }
  return { version: 1, setup: { defaultMethod: setup.defaultMethod || null, grinder: setup.grinder || null, units: setup.units || 'metric' }, coffees: visible, refs, lines: boundedLines, text: boundedLines.join('\n'), sealedCount: Number(setup.sealedCount || 0), finishedCount: Number(setup.finishedCount || 0) };
}

export function summarizeEvidence(kind, records = [], { windowDays = DEFAULT_HISTORY_DAYS, now = Date.now(), unavailable = false } = {}) {
  const scope = windowDays == null ? 'available history' : `last ${windowDays} days`;
  if (unavailable) return { kind, status: 'unavailable', summary: `I couldn't check ${kind} in the ${scope} right now.`, windowDays };
  const values = Array.isArray(records) ? records : records && typeof records === 'object' ? [records] : [];
  if (!values.length || values.every((value) => value && typeof value === 'object' && value.code)) return { kind, status: 'empty', summary: `No ${kind} in the ${scope}.`, windowDays };
  const summary = values.slice(0, 4).map((record) => {
    const method = slotDisplay[record.slotKey || record.slot || record.method] || record.method || record.device || '';
    const date = daysAgo(record.date || record.createdAt || record.updatedAt, now);
    const age = date == null ? '' : `${date} days ago`;
    const numbers = [record.dose != null ? `${record.dose}g` : null, record.water != null ? `${record.water}g` : null, record.grind || null, record.temperature != null ? `${record.temperature}°` : null, record.drawdown || null, record.notes || record.note || null].filter(Boolean).join(', ');
    if (kind === 'brews') return ['BREW', method, age, numbers].filter(Boolean).join(' — ');
    if (kind === 'tastings') return ['TASTING', age, 'not linked to a specific brew', numbers].filter(Boolean).join(' — ');
    return [method, numbers, age].filter(Boolean).join(': ');
  }).join(' | ');
  return { kind, status: 'available', summary, windowDays, count: values.length, records: clone(values.slice(0, 4)) };
}

export function appendLedger(ledger, entry, { maxBytes = MAX_LEDGER_BYTES, maxEntries = MAX_LEDGER_ENTRIES } = {}) {
  const entries = Array.isArray(ledger?.entries) ? ledger.entries.slice() : [];
  entries.push(sanitizeLedgerEntry(entry));
  while ((Number.isFinite(maxBytes) && byteLength(JSON.stringify(entries)) > maxBytes || Number.isFinite(maxEntries) && entries.length > maxEntries) && entries.length > 1) entries.shift();
  if (Number.isFinite(maxBytes) && byteLength(JSON.stringify(entries)) > maxBytes) return { version: 1, entries: [], namedCoffees: [], bytes: 0 };
  const named = [...new Set(entries.flatMap((item) => Array.isArray(item.namedCoffees) ? item.namedCoffees : item.coffee?.name ? [item.coffee.name] : []))];
  return { version: 1, entries, namedCoffees: named, bytes: byteLength(JSON.stringify(entries)) };
}
export function clearLedger() { return { version: 1, entries: [], namedCoffees: [], bytes: 0 }; }
export function boundLedger(ledger, options = {}) { return (Array.isArray(ledger?.entries) ? ledger.entries : []).reduce((value, entry) => appendLedger(value, entry, options), clearLedger()); }
export const rebuildLedger = (entries = [], options = {}) => entries.reduce((value, entry) => appendLedger(value, entry, options), clearLedger());
export function shouldWidenHistory({ userText = '', correction = false, olderReference = false } = {}) { return correction || olderReference || /\b(?:older|last month|three weeks?|weeks? ago|before that|historical|earlier)\b/i.test(userText); }

function withTimeout(promise, timeoutMs = READ_TIMEOUT_MS) {
  if (timeoutMs == null) return promise;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Object.assign(new Error('evidence read timed out'), { code: 'read_timeout' })), timeoutMs);
    Promise.resolve(promise).then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
  });
}

function isWithinWindow(record, windowDays, now, launchItem) {
  const launchRef = text(launchItem?.ref);
  const recordRef = text(record?.ref || record?.id || record?.attemptId || record?.tastingId);
  if (launchRef && recordRef && launchRef === recordRef) return true;
  const value = record?.date || record?.createdAt || record?.updatedAt || record?.timestamp;
  const date = Date.parse(value || '');
  if (!Number.isFinite(date)) return true;
  return windowDays == null || !Number.isFinite(now) || now - date <= windowDays * 86400000;
}

function scopeHistory(kind, value, windowDays, now, launchItem) {
  if (kind === 'recipe' || !Array.isArray(value)) return value;
  return value.filter((record) => isWithinWindow(record, windowDays, now, launchItem));
}

export async function readCoffeeEvidence({ uid, coffeeId, launchItem = null, readers = {}, windowDays = DEFAULT_HISTORY_DAYS, now = Date.now(), timeoutMs = READ_TIMEOUT_MS } = {}) {
  if (!uid || !coffeeId) throw Object.assign(new Error('owner and coffee are required'), { code: 'coffee_required' });
  windowDays = windowDays === null ? null : Number.isFinite(Number(windowDays)) && Number(windowDays) > 0 ? Number(windowDays) : DEFAULT_HISTORY_DAYS;
  timeoutMs = Number.isFinite(Number(timeoutMs)) && Number(timeoutMs) > 0 ? Number(timeoutMs) : READ_TIMEOUT_MS;
  const read = async (kind, reader, fallback = []) => {
    if (typeof reader !== 'function') return summarizeEvidence(kind, fallback, { windowDays, now });
    try {
      const value = await withTimeout(reader({ uid, coffeeId, windowDays, launchItem, slotKey: launchItem?.method || launchItem?.slot || null }), timeoutMs);
      return summarizeEvidence(kind, scopeHistory(kind, value, windowDays, now, launchItem), { windowDays, now });
    } catch (error) {
      return { kind, status: 'unavailable', summary: `I couldn't check ${kind} in the ${windowDays == null ? 'available history' : `last ${windowDays} days`} right now.`, windowDays, errorCode: error.code || 'read_failed' };
    }
  };
  const [coffee, recipe, brews, tastings] = await Promise.all([
    typeof readers.readCoffee === 'function' ? withTimeout(readers.readCoffee({ uid, coffeeId }), timeoutMs).then((value) => ({ kind: 'coffee', status: value ? 'available' : 'empty', coffee: clone(value), summary: value?.name ? `${value.name} is in your rotation.` : 'No coffee matched that reference.' })).catch((error) => ({ kind: 'coffee', status: 'unavailable', summary: "I couldn't check that coffee right now.", errorCode: error.code || 'read_failed' })) : { kind: 'coffee', status: 'empty', summary: 'No coffee matched that reference.' },
    read('recipe', readers.readRecipe),
    read('brews', readers.readBrews || readers.readAttempts),
    read('tastings', readers.readTastings),
  ]);
  return { coffee, recipe, brews, tastings, windowDays, readAt: new Date(now).toISOString(), launchItem: clone(launchItem), unavailable: [coffee, recipe, brews, tastings].filter((item) => item.status === 'unavailable').map((item) => item.kind) };
}

export const buildEvidenceSnapshot = buildRotationSnapshot;
export const readEvidence = readCoffeeEvidence;
