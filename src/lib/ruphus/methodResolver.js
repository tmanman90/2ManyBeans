import { SLOT_KEYS } from './contracts.js';

const DISPLAY = Object.freeze({ aiden: 'Aiden', v60_hot: 'hot V60', v60_iced: 'iced V60', kalita_hot: 'hot Kalita', kalita_iced: 'iced Kalita' });
const slot = (value) => {
  const valueText = String(value || '').toLowerCase().replace(/\s+/g, '_');
  if (SLOT_KEYS.includes(valueText)) return valueText;
  if (valueText === 'aiden') return 'aiden';
  if (valueText === 'switch' || /^switch_0?[23]$/.test(valueText)) return 'v60_hot';
  if (valueText.includes('kalita')) return valueText.includes('iced') ? 'kalita_iced' : 'kalita_hot';
  if (valueText.includes('v60') || valueText === 'v60') return valueText.includes('iced') ? 'v60_iced' : 'v60_hot';
  return null;
};
const methodResult = (value, tier) => value ? { slot: value, displayName: DISPLAY[value], tier } : null;
const recordsFor = (input) => [...(Array.isArray(input.brews) ? input.brews : []), ...(Array.isArray(input.attempts) ? input.attempts : []), ...(Array.isArray(input.tastings) ? input.tastings : [])];
const recent = (record, now, days) => {
  if (!record) return false;
  const date = Date.parse(record.date || record.createdAt || record.updatedAt || '');
  if (!Number.isFinite(date)) return true;
  return !Number.isFinite(now) || now - date <= days * 86400000;
};
const explicitMode = (text) => /\biced\b|\bcold\b/i.test(String(text || '')) ? 'iced' : /\bhot\b/i.test(String(text || '')) ? 'hot' : null;
const applyMode = (value, mode) => value === 'aiden' || !mode || !value ? value : `${value.split('_')[0]}_${mode}`;
const recordTime = (record) => {
  const value = Date.parse(record?.date || record?.createdAt || record?.updatedAt || record?.lastBrewDate || '');
  return Number.isFinite(value) ? value : -Infinity;
};

const METHOD_MENTION = /\b(?:(hot|iced)\s+)?(aiden|v\s*60|kalita)(?:\s+(?:155|185))?\b/gi;
// Switch is a V60 variant, not a standalone recipe slot. Require equipment
// grammar so the verb in “switch to Jar 2” cannot bind the current coffee to
// a Switch recipe. The exact variant is enforced later against the saved
// recipe; this helper only identifies what the user named.
const SWITCH_EQUIPMENT_MENTION = /\b(?:switch(?:\s+0?[23])?\s+(?:the\s+)?(?:technique|method|recipe|brewer|dripper|filter|size)|(?:ribbed|hario|v60)\s+switch(?:\s+0?[23])?|(?:with|using|on)\s+(?:the\s+)?switch(?:\s+0?[23])?|(?:use|try|brew|prepare|choose|pick|select)\s+(?:the\s+)?switch(?:\s+0?[23])?|switch\s+0?[23])\b/gi;
// Only treat a method mention as negated when the short bridge after the
// negator is method-grammar. Sensory clauses such as “not sour with the hot
// Kalita” must leave Kalita as the explicit method.
const NEGATED_METHOD_PREFIX = /\b(?:not|never|no|didn't|did\s+not|wasn't|was\s+not|isn't|is\s+not|don't|do\s+not|without)\b(?:\s+(?:the|a|an|my|your|this|that|it|use|used|brew|brewed|make|made|choose|pick|on|with|instead|rather|than|for|to|did|do)){0,5}\s*$/i;

function positiveSwitchMentions(value) {
  const source = String(value || '');
  return [...source.matchAll(SWITCH_EQUIPMENT_MENTION)].filter((match) => {
    const prefix = source.slice(Math.max(0, match.index - 64), match.index);
    return !NEGATED_METHOD_PREFIX.test(prefix);
  });
}

const switchSlotFromText = (value) => explicitMode(value) === 'iced' ? 'v60_iced' : 'v60_hot';

// This is intentionally separate from the canonical method slot. Callers
// that already resolved a V60 slot can use it to preserve the saved
// V60/Switch boundary instead of treating a shared slot as equivalent hardware.
export function explicitMethodVariantFromText(value) {
  return positiveSwitchMentions(value).length ? 'switch' : null;
}

// An answer to our immediately preceding equipment question is part of the
// same request, not a new unqualified number or a saved-recipe preference.
export function equipmentClarificationAnswer(userText, conversation = []) {
  const latest = conversation.at(-1);
  const question = latest?.role === 'assistant' ? String(latest.content || latest.text || '') : '';
  if (conversation.slice(-2).some(item => /\b(?:iced|cold)\b/i.test(item.content || item.text || ''))) return null;
  if (!/\b(?:which|what)\b[^?]*\b(?:switch|kalita|wave)\b[^?]*\?/i.test(question)) return null;
  const answer = String(userText || '').trim().match(/^(?:(?:the|a|an|it(?:'s| is)|i have(?: the)?|i(?:'m| am) using(?: the)?)\s+)?(0?[23]|155|185)[.!]?$/i)?.[1];
  if (!answer) return null;
  if (/\bswitch\b/i.test(question) && /^(?:0?[23])$/.test(answer)) return { slot: 'v60_hot', variant: 'switch', size: answer.padStart(2, '0') };
  if (/\b(?:kalita|wave)\b/i.test(question) && /^(?:155|185)$/.test(answer)) return { slot: 'kalita_hot', size: answer };
  return null;
}

export function explicitMethodFromText(value) {
  const source = String(value || '');
  const positive = [];
  for (const match of source.matchAll(METHOD_MENTION)) {
    const prefix = source.slice(Math.max(0, match.index - 64), match.index);
    if (NEGATED_METHOD_PREFIX.test(prefix)) continue;
    const resolved = slot(`${match[1] ? `${match[1]} ` : ''}${match[2]}`);
    if (resolved && !positive.includes(resolved)) positive.push(resolved);
  }
  const switchSlot = positiveSwitchMentions(source).length ? switchSlotFromText(source) : null;
  if (switchSlot && !positive.includes(switchSlot)) positive.push(switchSlot);
  return positive.length === 1 ? positive[0] : null;
}

export function mentionedMethodSlots(value, { ignoreExplicitlyRejected = false } = {}) {
  const source = String(value || '');
  const mentions = [...source.matchAll(METHOD_MENTION)].filter((match) => !ignoreExplicitlyRejected
    || !/\b(?:not|rather\s+than|instead\s+of)(?:\s+(?:the|an?|your))?\s*$/i.test(source.slice(0, match.index)));
  const slots = mentions.map((match) => slot(`${match[1] ? `${match[1]} ` : ''}${match[2]}`)).filter(Boolean);
  if (positiveSwitchMentions(source).length) slots.push(switchSlotFromText(source));
  return [...new Set(slots)];
}

function latestRecipeSlot(recipes, records) {
  const candidates = [...new Set((Array.isArray(recipes) ? recipes : []).map((item) => slot(typeof item === 'string' ? item : item?.slotKey || item?.slot || item?.method)).filter(Boolean))];
  if (!candidates.length) return null;
  const ranked = candidates.map((candidate) => {
    const recipe = (Array.isArray(recipes) ? recipes : []).find((item) => slot(typeof item === 'string' ? item : item?.slotKey || item?.slot || item?.method) === candidate);
    const recipeTime = recordTime(recipe);
    const brewTime = records.filter((record) => slot(record.slotKey || record.slot || record.method || record.brewMethod || record.device) === candidate).reduce((max, record) => Math.max(max, recordTime(record)), -Infinity);
    return { candidate, time: Math.max(recipeTime, brewTime) };
  });
  ranked.sort((left, right) => right.time - left.time || left.candidate.localeCompare(right.candidate));
  return ranked[0]?.candidate || null;
}

export function resolveMethod(input = {}) {
  const requestText = input.userText || input.request || '';
  const explicit = slot(input.explicitMethod || input.explicitSlot) || explicitMethodFromText(requestText);
  if (explicit) return methodResult(explicit, 'M1');
  const mode = explicitMode(requestText);
  const launch = input.launchItem?.method || input.launchMethod;
  const launchCoffee = input.launchCoffeeRef || input.launchItem?.coffeeRef;
  const focus = input.coffeeRef || input.focusCoffeeRef;
  if (launch && !input.launchHintConsumed && mode && (!launchCoffee || !focus || launchCoffee === focus) && !input.methodCorrected && !input.focusChanged) return methodResult(applyMode(slot(launch), mode), 'M1');
  if (launch && !input.launchHintConsumed && (!launchCoffee || !focus || launchCoffee === focus) && !input.methodCorrected && !input.focusChanged) return methodResult(slot(launch), 'M1b');
  const methodFocus = slot(input.methodFocus?.displayName || input.methodFocus?.slot || input.methodFocus);
  const sameFocusedCoffee = !input.methodFocusCoffeeRef || !input.coffeeRef || input.methodFocusCoffeeRef === input.coffeeRef;
  if (methodFocus && sameFocusedCoffee && !input.methodCorrected && !input.focusChanged) return methodResult(applyMode(methodFocus, mode), 'M2');

  const now = input.now == null ? Date.now() : (input.now instanceof Date ? input.now.getTime() : Number(input.now));
  const days = Number(input.historyDays || 14);
  const records = recordsFor(input).filter((record) => recent(record, now, days));
  const recorded = records.map((record) => slot(record.slotKey || record.slot || record.method || record.brewMethod || record.device)).filter(Boolean);
  const uniqueRecorded = [...new Set(recorded)];
  if (mode && uniqueRecorded.length) {
    const matchingRecorded = uniqueRecorded.filter((item) => item === 'aiden' || item.endsWith(`_${mode}`));
    if (matchingRecorded.length === 1) return methodResult(matchingRecorded[0], 'M1');
    if (matchingRecorded.length > 1) return { ask: matchingRecorded.map((item) => ({ slot: item, displayName: DISPLAY[item] })), tier: 'M6' };
    // An explicit mode correction cannot silently select the opposite mode
    // through M2/M4. Continue only with an explicitly matching recipe or the
    // configured method fallback below.
    if (mode) {
      const matchingRecipes = [...new Set((Array.isArray(input.recipeSlots) ? input.recipeSlots : Array.isArray(input.recipes) ? input.recipes : Object.keys(input.recipes || {})).map((item) => slot(typeof item === 'string' ? item : item?.slotKey || item?.slot || item?.method)).filter((item) => item && (item === 'aiden' || item.endsWith(`_${mode}`))))];
      if (matchingRecipes.length === 1) return methodResult(matchingRecipes[0], 'M3');
      if (matchingRecipes.length > 1) return { ask: matchingRecipes.map((item) => ({ slot: item, displayName: DISPLAY[item] })), tier: 'M6' };
      if (input.defaultMethod) {
        const base = slot(input.defaultMethod);
        if (base) return methodResult(base === 'aiden' ? base : `${base.split('_')[0]}_${mode}`, 'M5');
      }
      return { ask: [], tier: 'M6' };
    }
  }
  if (uniqueRecorded.length === 1) return methodResult(uniqueRecorded[0], 'M2');

  const rawRecipes = [
    ...(Array.isArray(input.recipeSlots) ? input.recipeSlots : []),
    ...(Array.isArray(input.recipes) ? input.recipes : Object.keys(input.recipes || {})),
  ];
  const recipes = rawRecipes.map((recipe) => slot(typeof recipe === 'string' ? recipe : recipe?.slotKey || recipe?.slot || recipe?.method)).filter(Boolean);
  const uniqueRecipes = [...new Set(recipes)];
  if (uniqueRecipes.length === 1) {
    const only = uniqueRecipes[0];
    if (mode && !only.endsWith(mode)) return methodResult(`${only.split('_')[0]}_${mode}`, 'M3');
    return methodResult(only, 'M3');
  }
  const changeRequest = input.isChangeRequest === true || /\b(?:change|adjust|tune|recommend|improve|fix|what should I)\b/i.test(requestText);
  if (!changeRequest && uniqueRecorded.length > 1) {
    const latest = records.map((record) => ({ record, slot: slot(record.slotKey || record.slot || record.method || record.brewMethod || record.device), time: recordTime(record) })).filter((item) => item.slot).sort((left, right) => right.time - left.time || left.slot.localeCompare(right.slot))[0];
    const latestSlot = latest?.slot;
    if (latestSlot) return methodResult(latestSlot, 'M4');
  }
  if (!changeRequest && uniqueRecipes.length > 1) {
    const latest = latestRecipeSlot(rawRecipes, records);
    if (latest) return methodResult(latest, 'M4');
  }
  if (!uniqueRecipes.length && !recorded.length && input.defaultMethod) return methodResult(slot(input.defaultMethod), 'M5');
  if (mode && uniqueRecipes.length) {
    const candidates = uniqueRecipes.filter((item) => item.endsWith(mode));
    if (candidates.length === 1) return methodResult(candidates[0], 'M6');
  }
  const candidates = uniqueRecipes.length > 1 ? uniqueRecipes : [...new Set([...uniqueRecorded])];
  if (changeRequest && candidates.length > 1) return { ask: candidates.map((item) => ({ slot: item, displayName: DISPLAY[item] })), tier: 'M6' };
  if (candidates.length === 1) return methodResult(candidates[0], 'M6');
  if (mode && input.defaultMethod) return methodResult(`${slot(input.defaultMethod)?.split('_')[0] || 'v60'}_${mode}`, 'M5');
  return { ask: [], tier: 'M6' };
}

export const methodResolver = resolveMethod;
export const METHOD_DISPLAY_NAMES = DISPLAY;
