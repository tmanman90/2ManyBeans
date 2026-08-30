import { canonicalHash, clone } from '../../src/lib/ruphus/contracts.js';

export const DEFAULT_HISTORY_DAYS = 14;
export const MAX_SNAPSHOT_LINES = 12;
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
  let boundedLines = lines.slice(0, MAX_SNAPSHOT_LINES);
  while (boundedLines.join('\n').length > MAX_SNAPSHOT_CHARS && boundedLines.length > 1) boundedLines = boundedLines.slice(0, -1);
  return { version: 1, setup: { defaultMethod: setup.defaultMethod || null, grinder: setup.grinder || null, units: setup.units || 'metric' }, coffees: visible, refs, lines: boundedLines, text: boundedLines.join('\n'), sealedCount: Number(setup.sealedCount || 0), finishedCount: Number(setup.finishedCount || 0) };
}

export function summarizeEvidence(kind, records = [], { windowDays = DEFAULT_HISTORY_DAYS, now = Date.now(), unavailable = false } = {}) {
  if (unavailable) return { kind, status: 'unavailable', summary: `I couldn't check recent ${kind} right now.`, windowDays };
  const values = Array.isArray(records) ? records : records && typeof records === 'object' ? [records] : [];
  if (!values.length || values.every((value) => value && typeof value === 'object' && value.code)) return { kind, status: 'empty', summary: `No ${kind} in the last ${windowDays} days.`, windowDays };
  const summary = values.slice(0, 4).map((record) => {
    const method = slotDisplay[record.slotKey || record.slot || record.method] || record.method || record.device || '';
    const date = daysAgo(record.date || record.createdAt || record.updatedAt, now);
    const age = date == null ? '' : `${date} days ago`;
    const numbers = [record.dose != null ? `${record.dose}g` : null, record.water != null ? `${record.water}g` : null, record.grind || null, record.temperature != null ? `${record.temperature}°` : null, record.drawdown || null, record.notes || record.note || null].filter(Boolean).join(', ');
    return [method, numbers, age].filter(Boolean).join(': ');
  }).join(' | ');
  return { kind, status: 'available', summary, windowDays, count: values.length, records: clone(values.slice(0, 4)) };
}

export function appendLedger(ledger, entry) {
  const entries = Array.isArray(ledger?.entries) ? ledger.entries.slice() : [];
  entries.push({ ...clone(entry), at: entry?.at || new Date().toISOString() });
  while (entries.length > MAX_LEDGER_ENTRIES || JSON.stringify(entries).length > MAX_LEDGER_BYTES) entries.shift();
  const named = [...new Set(entries.flatMap((item) => Array.isArray(item.namedCoffees) ? item.namedCoffees : item.coffee?.name ? [item.coffee.name] : []))];
  return { version: 1, entries, namedCoffees: named, bytes: JSON.stringify(entries).length };
}
export function clearLedger() { return { version: 1, entries: [], namedCoffees: [], bytes: 0 }; }
export function boundLedger(ledger) { return (Array.isArray(ledger?.entries) ? ledger.entries : []).reduce((value, entry) => appendLedger(value, entry), clearLedger()); }
export const rebuildLedger = (entries = []) => entries.reduce((value, entry) => appendLedger(value, entry), clearLedger());
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
  return !Number.isFinite(now) || now - date <= windowDays * 86400000;
}

function scopeHistory(kind, value, windowDays, now, launchItem) {
  if (kind === 'recipe' || !Array.isArray(value)) return value;
  return value.filter((record) => isWithinWindow(record, windowDays, now, launchItem));
}

export async function readCoffeeEvidence({ uid, coffeeId, launchItem = null, readers = {}, windowDays = DEFAULT_HISTORY_DAYS, now = Date.now(), timeoutMs = READ_TIMEOUT_MS } = {}) {
  if (!uid || !coffeeId) throw Object.assign(new Error('owner and coffee are required'), { code: 'coffee_required' });
  windowDays = Number.isFinite(Number(windowDays)) && Number(windowDays) > 0 ? Number(windowDays) : DEFAULT_HISTORY_DAYS;
  timeoutMs = Number.isFinite(Number(timeoutMs)) && Number(timeoutMs) > 0 ? Number(timeoutMs) : READ_TIMEOUT_MS;
  const read = async (kind, reader, fallback = []) => {
    if (typeof reader !== 'function') return summarizeEvidence(kind, fallback, { windowDays, now });
    try {
      const value = await withTimeout(reader({ uid, coffeeId, windowDays, launchItem, slotKey: launchItem?.method || launchItem?.slot || null }), timeoutMs);
      return summarizeEvidence(kind, scopeHistory(kind, value, windowDays, now, launchItem), { windowDays, now });
    } catch (error) {
      return { kind, status: 'unavailable', summary: `I couldn't check recent ${kind} right now.`, windowDays, errorCode: error.code || 'read_failed' };
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
