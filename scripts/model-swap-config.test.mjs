// Guards the 2026-11-24 model swaps. The bug it pins: a thinking model with
// only maxOutputTokens set spends the cap on thinking and the reply is cut off
// (gemini-2.5-flash cut off web research 7 of 7 and photo reading 6 of 6).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildClaudeParams, ALLOWED_MODELS, CHAT_MODEL, FALLBACK_MODEL } from '../api/_lib/claudeShared.js';
import { MODEL_PRICING } from '../api/_lib/modelPricing.js';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

// Returns the source of the call whose body names `feature`.
function callFor(source, feature) {
  const at = source.indexOf(`feature: '${feature}'`);
  assert.ok(at > 0, `no call with feature ${feature}`);
  const start = source.lastIndexOf('await ', at);
  return source.slice(start, source.indexOf('});', at));
}

test('Claude models never spend the cap on thinking', () => {
  assert.deepEqual(ALLOWED_MODELS, [CHAT_MODEL, FALLBACK_MODEL]);
  const chat = buildClaudeParams({ model: CHAT_MODEL, maxTokens: 800, messages: [] });
  assert.deepEqual(chat.thinking, { type: 'between_tools' }, 'Sonnet 5.5 rejects thinking: disabled');
  const fallback = buildClaudeParams({ model: FALLBACK_MODEL, maxTokens: 800, messages: [] });
  assert.deepEqual(fallback.thinking, { type: 'disabled' });
  for (const p of [chat, fallback]) assert.deepEqual(p.output_config, { effort: 'low' });
});

test('every thinking call sets its effort and leaves room in the cap', () => {
  const sites = [
    ['../src/lib/gemini.js', 'webResearch', 'gemini-4-hydrogen', /thinkingLevel: 'low'/],
    ['../src/lib/gemini.js', 'imageAnalysis', 'gemini-4-hydrogen', /thinkingLevel: 'low'/],
    ['../src/lib/gemini.js', 'beanScan', 'gpt-6.2-sol', /reasoningEffort: 'low'/],
    ['../src/lib/gemini.js', 'chatSearch', 'gpt-6.1-terra', /reasoningEffort: 'low'/],
    ['../src/lib/claude.js', 'tastingCoach', 'gpt-6-luna', /reasoningEffort: 'low'/],
    ['../src/lib/claude.js', 'recommendation', 'gpt-6.1-terra', /reasoningEffort: 'low'/],
    ['../src/lib/beanResearch.js', 'beanResearch', 'gpt-6-luna', /reasoningEffort: 'low'/],
  ];
  for (const [file, feature, model, effort] of sites) {
    const call = callFor(read(file), feature);
    assert.match(call, new RegExp(`model: '${model.replace(/\./g, '\\.')}'`), `${feature} model`);
    assert.match(call, effort, `${feature} effort`);
    assert.match(call, /maxTokens: 4000/, `${feature} cap must leave room for thinking`);
  }
  const handBrew = callFor(read('../src/lib/handbrew.js'), 'handBrewRecipe');
  assert.match(handBrew, /model: 'gpt-6\.1-terra'/);
  assert.match(handBrew, /reasoningEffort: 'none'/);
});

test('proxies accept the new models and forward the effort settings', () => {
  const gemini = read('../api/gemini.js');
  assert.match(gemini, /'gemini-4-hydrogen'/);
  assert.match(gemini, /thinkingConfig: \{ thinkingLevel: safeThinkingLevel \}/);
  assert.doesNotMatch(gemini, /flash-preview-05-20|flash-image-preview/);
  const openai = read('../api/openai.js');
  for (const m of ['gpt-6-luna', 'gpt-6.1-terra', 'gpt-6.2-sol']) assert.ok(openai.includes(`'${m}'`), m);
  assert.match(openai, /reasoning_effort: reasoningEffort/);
  assert.match(openai, /feature: 'aiScans', freeLimit: 3/, 'free bag scans keep their 3-scan meter');
  assert.match(read('../api/product-shot.js'), /model: IMAGE_MODEL/);
});

test('every new model has a price entry', () => {
  for (const m of ['gpt-6-luna', 'gpt-6.1-terra', 'gpt-6.2-sol', 'gpt-image-2.6-sunburst', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'gemini-4-hydrogen']) {
    assert.ok(MODEL_PRICING[m], m);
  }
});
