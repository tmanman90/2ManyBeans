// Opt-in live replay. No Firebase/Vercel SDK, production endpoint or writable reader.
// OPENAI_API_KEY must be supplied by the authorized caller, never written to disk.
import { execFileSync } from 'node:child_process';
import { writeFile, unlink, mkdir } from 'node:fs/promises';
import OpenAI from 'openai';
import { fruktFixture } from './fixtures/ruphus-frukt-brew.mjs';
import { buildRuphusContext } from '../api/_lib/ruphusContext.js';
import { deriveProposalReadiness } from '../api/ruphus-agent.js';
import { canonicalRecipeSnapshot } from '../src/lib/ruphus/legacyRecipeResolver.js';
import { runRuphusTurn } from '../api/_lib/ruphusOrchestrator.js';
const baselineCommit = '5ce7f2d3b53479e49259097b191e0b5d4eabd9c4';
const output = process.argv[2];
const correctedOnly = process.argv.includes('--corrected-only');
const ambiguityOnly = process.argv.includes('--ambiguity-only');
const grindOnly = process.argv.includes('--grind-only');
const callLimit = grindOnly ? 2 : ambiguityOnly ? 4 : correctedOnly ? 10 : 24;
if (!output || !process.env.OPENAI_API_KEY) throw new Error('An output path and authorized existing OPENAI_API_KEY are required.');
const temporary = [];
const loadOriginal = async (path, replacements = []) => {
  const dest = path.replace(/([^/]+)$/, '__counterfactual_$1');
  let contents = execFileSync('git', ['show', `${baselineCommit}:${path}`], { encoding: 'utf8' });
  for (const [before, after] of replacements) contents = contents.replaceAll(before, after);
  await writeFile(dest, contents, { flag: 'wx' }); temporary.push(dest);
  return import(new URL(`../${dest}`, import.meta.url));
};
let calls = 0; let estimatedCost = 0;
const report = { baselineCommit, model: 'gpt-5.6-luna', reasoning: 'medium', maxOutputTokens: 900, evidenceByteCap: 4096, limits: { providerCalls: callLimit, maxRequestBytes: 200000, estimatedCostUSD: 0.50 }, cases: [], note: 'One replay per case per arm, not a statistical reliability estimate. Original production tools/prompt versus corrected tools/prompt; sanitized actual-case fixture, in-memory proposals only. Cost is estimated using the repository pricing registry.' };
const sdk = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0, timeout: 45000 });
const client = { responses: { create: async request => {
  const bytes = Buffer.byteLength(JSON.stringify(request));
  if (calls >= callLimit || bytes > 200000 || estimatedCost + bytes * .20 / 1000000 + .00108 > .50) throw new Error('Evaluation budget reached');
  calls++;
  const response = await sdk.responses.create(request);
  estimatedCost += ((response.usage?.input_tokens || bytes) * .20 + (response.usage?.output_tokens || 900) * 1.20) / 1000000;
  return response;
} } };
try {
  await loadOriginal('api/_lib/ruphusEvidence.js');
  const oldTools = await loadOriginal('api/_lib/ruphusTools.js', [["'./ruphusEvidence.js'", "'./__counterfactual_ruphusEvidence.js'"]]);
  const oldOrchestrator = await loadOriginal('api/_lib/ruphusOrchestrator.js', [["'./ruphusTools.js'", "'./__counterfactual_ruphusTools.js'"], ["'./ruphusEvidence.js'", "'./__counterfactual_ruphusEvidence.js'"]]);
  const oldPrompt = await loadOriginal('api/_lib/ruphusPrompt.js');
  const oldProvider = await loadOriginal('api/_lib/ruphusProviders/openai.js', [["'../ruphusPrompt.js'", "'../__counterfactual_ruphusPrompt.js'"]]);
  const newTools = await import('../api/_lib/ruphusTools.js');
  const newPrompt = await import('../api/_lib/ruphusPrompt.js');
  const newProvider = await import('../api/_lib/ruphusProviders/openai.js');
  const intro = [{ role: 'user', content: 'Last time I did kalita 185 with jar 1 bean, it tasted too watered down. What do suggest I do differently' }, { role: 'assistant', content: 'Since you described the cup as watered down, this is a bounded strength test by tightening the brew ratio; it does not assume the cup was sour or under-extracted. Try a 1:15.5 ratio instead of 1:16.5. Open the recipe to choose your dose and review the pours; nothing is saved yet.' }, { role: 'assistant', content: 'Recipe action result: Brew once succeeded.' }];
  for (const scenario of grindOnly ? ['grind_challenge'] : ambiguityOnly ? ['ambiguous_cup'] : ['partial_improvement', 'grind_challenge', 'ambiguous_cup']) {
    for (const arm of correctedOnly ? ['corrected'] : ['original', 'corrected']) {
      const f = fruktFixture();
      Object.assign(f.coffee, { jarSlot: 1, status: 'ACTIVE', handBrewRecipes: { kalita: f.saved } });
      const conversation = structuredClone(intro);
      if (scenario === 'grind_challenge') conversation.push({ role: 'user', content: 'Better but still kind of thin' }, { role: 'assistant', content: 'Since the first tightening helped but the cup is still thin, I’d make one more strength-focused ratio step rather than changing grind or agitation. That targets body while keeping the same Kalita pulse profile. Try a 1:14.5 ratio instead of 1:15.5. Open the recipe to choose your dose and review the pours; nothing is saved yet.' });
      const userText = scenario === 'partial_improvement' ? 'Better but still kind of thin' : scenario === 'grind_challenge' ? 'You don’t think it just need to be ground finer?' : 'One of my Kalita cups was still thin, but I’m not sure which recipe I used. What should I change?';
      const attempts = [f.attempt];
      if (scenario === 'ambiguous_cup') attempts.push({ ...structuredClone(f.attempt), id: 'fixture-other-attempt', sessionId: 'fixture-other-attempt', completedAt: '2026-10-11T23:50:00Z', snapshot: f.saved });
      const readers = { listCoffees: async () => [f.coffee], readSetup: async () => ({ grinder: 'fellow-ode-gen2', defaultMethod: 'kalita_hot' }), readCoffee: async () => f.coffee, readRecipe: async () => f.saved, readAttempts: async () => attempts, readTastings: async () => [] };
      const prior = scenario === 'grind_challenge' ? [{ type: 'recipe_proposal', id: 'fixture-untried', status: 'proposed', coffeeId: f.coffee.id, slotKey: 'kalita_hot', before: f.saved, after: f.untried, sourceHash: canonicalRecipeSnapshot(f.saved, 'kalita_hot').recipeHash }] : [];
      const context = await buildRuphusContext({ uid: 'fixture-owner', contextRef: { surface: 'direct' }, userText, conversation, readers, evidenceByteCap: 4096, priorTechniqueProposals: prior });
      Object.assign(context.proposalState, deriveProposalReadiness({ conversation, userText }));
      Object.defineProperty(context, '__ruphusPriorProposals', { value: prior, enumerable: false });
      const writes = []; const toolLog = [];
      const impl = arm === 'original' ? oldTools : newTools;
      const tools = impl.createRuphusTools({ uid: 'fixture-owner', context, readers, proposalStore: async input => { writes.push(input); return { ...input, status: 'proposed' }; } });
      const wrapped = { ...tools, call: async (name, args) => { const result = await tools.call(name, { ...args, now: Date.parse('2026-10-12T00:00:00Z') }); toolLog.push({ name, args, result }); return result; } };
      const provider = (arm === 'original' ? oldProvider : newProvider).createOpenAIProvider({ client, instructions: (arm === 'original' ? oldPrompt : newPrompt).RUPHUS_SYSTEM_PROMPT, maxOutputTokens: 900 });
      const result = await (arm === 'original' ? oldOrchestrator.runRuphusTurn : runRuphusTurn)({ turnId: `${scenario}-${arm}`, context, userText, tools: wrapped, provider });
      report.cases.push({ scenario, arm, userText, result, toolLog, inMemoryProposals: writes });
      report.calls = calls; report.estimatedCostUSD = estimatedCost;
      await mkdir(new URL('../docs/evaluations/', import.meta.url), { recursive: true });
      await writeFile(output, JSON.stringify(report, null, 2));
      console.log(JSON.stringify({ scenario, arm, ok: result.ok, code: result.code, text: result.text, calls }));
      if (result.code?.startsWith('provider_')) throw new Error(`Production provider unavailable: ${result.code}`);
    }
  }
} catch (error) {
  report.blocker = String(error.message).replace(/sk-[A-Za-z0-9_-]+/g, '[redacted]');
  report.calls = calls; report.estimatedCostUSD = estimatedCost;
  await writeFile(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ blocker: report.blocker, calls }));
  process.exitCode = 1;
} finally { for (const path of temporary.reverse()) await unlink(path); }
