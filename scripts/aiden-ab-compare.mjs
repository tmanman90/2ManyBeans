#!/usr/bin/env node
// Aiden A/B compare — baseline (git ref) vs working tree, through the REAL
// production pipeline (researchBean + generateAidenRecipe, live GPT calls).
// Usage: node scripts/aiden-ab-compare.mjs [--assert-invariants] [--ref 1abc587]
//
// Asserts (with --assert-invariants):
//  - recipe object shape identical between variants (saved-recipe contract)
//  - grindRecommendation identical between variants (Aiden bands untouched)
// Writes: docs/data/algo-audit-2026-07-19/ab-run-latest.{json,md}

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const ASSERT = args.includes('--assert-invariants');
const REF = args.includes('--ref') ? args[args.indexOf('--ref') + 1] : '1abc587';

const env = {};
for (const line of readFileSync(join(ROOT, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
}
if (!env.OPENAI_API_KEY) { console.error('no OPENAI_API_KEY in .env.local'); process.exit(1); }

const baselineAiden = execSync(`git show ${REF}:src/lib/aiden.js`, { cwd: ROOT, encoding: 'utf8' });
const esbuild = await import(join(ROOT, 'node_modules', 'esbuild', 'lib', 'main.js'));
const AIDEN_PATH = resolve(ROOT, 'src/lib/aiden.js');
const OUTDIR = join(ROOT, 'node_modules', '.cache', 'aiden-ab');

function plugin(useBaseline) {
  return {
    name: 'stubs',
    setup(build) {
      build.onResolve({ filter: /^@capacitor\/core$/ }, () => ({ path: 'cap', namespace: 'stub' }));
      build.onResolve({ filter: /firebase$/ }, (a) =>
        (a.path.includes('./firebase') || a.path.includes('../firebase')) ? { path: 'fb', namespace: 'stub' } : null);
      build.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({
        contents: a.path === 'cap'
          ? 'export const Capacitor = { isNativePlatform: () => false };'
          : 'export const auth = { currentUser: null };',
        loader: 'js',
      }));
      if (useBaseline) {
        build.onLoad({ filter: /src\/lib\/aiden\.js$/ }, () => ({ contents: baselineAiden, loader: 'js' }));
      }
    },
  };
}

const ENTRY = `export { researchBean } from '${AIDEN_PATH.replace('/aiden.js', '/beanResearch.js')}';\nexport { generateAidenRecipe } from '${AIDEN_PATH}';`;
for (const [name, useBaseline] of [['baseline', true], ['current', false]]) {
  await esbuild.build({
    stdin: { contents: ENTRY, resolveDir: resolve(ROOT, 'src/lib'), sourcefile: 'entry.js' },
    bundle: true, format: 'esm', platform: 'node',
    outfile: join(OUTDIR, `${name}.mjs`), plugins: [plugin(useBaseline)], logLevel: 'silent',
  });
}

const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  const u = String(url);
  if (u.endsWith('/api/openai')) {
    const body = JSON.parse(opts.body);
    const r = await realFetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: body.model || 'gpt-5.4', messages: body.messages, max_completion_tokens: Math.max(body.maxTokens || 1000, 2000) }),
    });
    if (!r.ok) return new Response(JSON.stringify({ error: `openai ${r.status}` }), { status: r.status });
    const data = await r.json();
    return new Response(JSON.stringify({ text: data.choices?.[0]?.message?.content || '' }), { status: 200 });
  }
  if (u.includes('/api/')) return new Response(JSON.stringify({ error: 'stubbed' }), { status: 503 });
  return realFetch(url, opts);
};

const BEANS = [
  { name: 'Kenya Gichathaini AA', roaster: 'Leaves (Tokyo)', origin: 'Kenya (Nyeri)', variety: 'Ruiru 11, SL28, SL34, Batian', process: 'Washed', roastDate: '2026-06-15', bagNotes: 'pomelo / blackberry / hibiscus tea / sugar cane', bagSize: 100, status: 'ACTIVE' },
  { name: 'El Triangulo', roaster: "Apollon's Gold", origin: 'Honduras', variety: 'Geisha', process: 'Washed', roastDate: '2026-06-10', bagNotes: 'yuzu / muscat / lavender', bagSize: 100, status: 'ACTIVE', degasMin: 35, degasMax: 45, peakStart: 60, peakEnd: 90 },
  { name: 'Chelbesa Natural', roaster: "Apollon's Gold", origin: 'Ethiopia', variety: 'Wolisho / Dega', process: 'Natural', roastDate: '2026-06-20', bagNotes: 'strawberry / mango / lychee', bagSize: 100, status: 'ACTIVE', degasMin: 35, degasMax: 45, peakStart: 60, peakEnd: 90 },
  { name: 'Mulish', roaster: "Apollon's Gold", origin: 'Ethiopia', variety: 'Heirloom', process: 'Washed', roastDate: '2026-04-10', bagNotes: 'nectarine / honeysuckle / lavender', bagSize: 100, status: 'ACTIVE', degasMin: 35, degasMax: 45, peakStart: 60, peakEnd: 90 },
];

const baseline = await import(join(OUTDIR, 'baseline.mjs'));
const current = await import(join(OUTDIR, 'current.mjs'));

const results = [];
let invariantFailures = 0;
for (const bean of BEANS) {
  process.stderr.write(`researching ${bean.name}...\n`);
  let research = null;
  try { research = await baseline.researchBean(bean); }
  catch (e) { process.stderr.write(`  research failed: ${e.message}\n`); }
  const row = { bean: bean.name, family: research?.cupStructureFamily };
  for (const [label, mod] of [['baseline', baseline], ['current', current]]) {
    process.stderr.write(`  ${label}...\n`);
    try { row[label] = await mod.generateAidenRecipe(bean, research); }
    catch (e) { row[label] = { error: e.message }; }
  }
  if (ASSERT && (row.baseline?.error || row.current?.error)) {
    invariantFailures++;
    console.error(`GENERATION ERROR ${bean.name}: baseline=${row.baseline?.error || 'ok'} current=${row.current?.error || 'ok'}`);
  }
  if (ASSERT && !row.baseline?.error && !row.current?.error) {
    const bKeys = Object.keys(row.baseline).sort().join(',');
    const cKeys = Object.keys(row.current).sort().join(',');
    if (bKeys !== cKeys) { invariantFailures++; console.error(`SHAPE MISMATCH ${bean.name}:\n  baseline: ${bKeys}\n  current:  ${cKeys}`); }
    const bg = JSON.stringify(row.baseline.grindRecommendation);
    const cg = JSON.stringify(row.current.grindRecommendation);
    if (bg !== cg) { invariantFailures++; console.error(`GRIND DRIFT ${bean.name}: ${bg} -> ${cg}`); }
  }
  results.push(row);
}

const stamp = process.env.AB_STAMP || 'latest';
const outJson = join(ROOT, 'docs', 'data', 'algo-audit-2026-07-19', `ab-run-${stamp}.json`);
writeFileSync(outJson, JSON.stringify(results, null, 2));

const fmt = (r) => r?.error ? `ERROR ${r.error}` :
  `ratio 1:${r.ratio} | bloom ${r.bloomRatio}x/${r.bloomDuration}s/${r.bloomTemperature}C | SS ${r.ssPulsesNumber}p@${r.ssPulsesInterval}s ${JSON.stringify(r.ssPulseTemperatures)} | batch ${r.batchPulsesNumber}p ${JSON.stringify(r.batchPulseTemperatures)} | grind SS ${r.grindRecommendation?.singleServe}/batch ${r.grindRecommendation?.batch}`;
const md = ['# Aiden A/B — baseline vs current', `Baseline ref: ${REF}. Generated by scripts/aiden-ab-compare.mjs (live pipeline, shared research).`, ''];
for (const r of results) {
  md.push(`## ${r.bean} (${r.family})`, `- baseline: ${fmt(r.baseline)}`, `- current:  ${fmt(r.current)}`, '');
}
writeFileSync(join(ROOT, 'docs', 'data', 'algo-audit-2026-07-19', `ab-run-${stamp}.md`), md.join('\n'));
console.log(`report -> docs/data/algo-audit-2026-07-19/ab-run-${stamp}.md`);

const compared = results.filter((r) => r.baseline && !r.baseline.error && r.current && !r.current.error).length;
if (ASSERT && compared === 0) { console.error('zero successful comparisons — assertion vacuous'); process.exit(1); }
if (ASSERT && invariantFailures > 0) { console.error(`${invariantFailures} invariant failure(s)`); process.exit(1); }
console.log(ASSERT ? `invariants OK (${compared} pairs: shape + grind identical across variants)` : 'done');
