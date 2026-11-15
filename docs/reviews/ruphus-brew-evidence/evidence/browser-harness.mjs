import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
const root = fileURLToPath(new URL('../../../../', import.meta.url)).replace(/\/$/, '');
const require = createRequire(root + '/package.json');
const { chromium } = require('playwright');
const { build } = require('esbuild');
const { fruktFixture } = await import(pathToFileURL(root + '/scripts/fixtures/ruphus-frukt-brew.mjs'));
const { createRuphusTools } = await import(pathToFileURL(root + '/api/_lib/ruphusTools.js'));
const f = fruktFixture();
const context = { userText: 'Try one click finer', rotationSnapshot: { coffees: [{ refKey: 'c1', name: f.coffee.name, recipes: ['kalita_hot'] }], refs: { c1: f.coffee.id }, setup: { grinder: 'fellow-ode-gen2' } }, proposalState: { diagnosisReady: true, userAgreed: true } };
const tools = createRuphusTools({ uid: 'fixture-owner', context, readers: { readCoffee: async () => f.coffee, readRecipe: async () => f.saved, readAttempts: async () => [f.attempt], readTastings: async () => [] } });
const evidence = await tools.call('read_coffee_evidence', { coffeeRef: 'c1', slot: 'kalita_hot', now: Date.parse('2026-10-12T00:00:00Z') });
const result = await tools.call('propose_recipe_change', { coffeeRef: 'c1', slot: 'kalita_hot', baseline: evidence.recentBrews[0].brewRef, intent: 'recipe_preview', change: { control: 'grind', value: 6 }, explanation: 'Treat this as a test; compare sweetness and body without assuming sharpness determines extraction direction.' });
assert.equal(result.ok, true);
const compiled = await build({ stdin: { resolveDir: root, loader: 'jsx', contents: `
import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {MotionConfig} from 'framer-motion';
import './src/styles/global.css';
import {UserPreferencesProvider} from './src/hooks/useUserProfile.jsx';
import {AuthContext} from './src/contexts/AuthContext.jsx';
import {RecipeProposalCard} from './src/components/chat/artifacts/RecipeProposalCard.jsx';
import {HandBrewModal} from './src/components/HandBrewModal.jsx';
const proposal = ${JSON.stringify(result.artifact)};
function App() { const [open,setOpen] = useState(false); const [count,setCount] = useState(0);
return <MotionConfig reducedMotion="always"><AuthContext.Provider value={{user:null}}><UserPreferencesProvider value={{preferences:{grinder:'fellow-ode-gen2'},updatePreferences:async()=>{}}}><main style={{padding:20,background:'#F5EEE6',minHeight:'100vh'}}><h1>FRUKT completed-brew review</h1><RecipeProposalCard proposal={proposal} onPreview={()=>setOpen(true)}/><output data-start-count>{count}</output><HandBrewModal open={open} previewMode onClose={()=>setOpen(false)} recipe={proposal.after} bean={{id:'fixture-coffee',name:'Casa Almeida Barreto'}} deviceKey="kalita" userCoffeeGrams={18} onCoffeeGramsChange={()=>{}} onPreviewStart={()=>setCount(c=>c+1)} onPreviewSave={()=>{}} /></main></UserPreferencesProvider></AuthContext.Provider></MotionConfig> }
createRoot(document.getElementById('root')).render(<App/>);` }, bundle:true, write:false, outfile:'app.js', format:'iife', jsx:'automatic', define:{'process.env.NODE_ENV':'"production"','import.meta.env':JSON.stringify({VITE_FIREBASE_API_KEY:'local-fixture-not-a-key',VITE_FIREBASE_PROJECT_ID:'local-fixture',VITE_FIREBASE_APP_ID:'local-fixture'}),'__APP_VARIANT__':'"dev"'} });
const js = compiled.outputFiles.find(f=>f.path.endsWith('.js')).text;
const css = compiled.outputFiles.find(f=>f.path.endsWith('.css'))?.text || '';
const server = createServer((req,res)=>{ res.setHeader('Content-Type',req.url==='/app.js'?'text/javascript':req.url==='/app.css'?'text/css':'text/html'); res.end(req.url==='/app.js'?js:req.url==='/app.css'?css:'<!doctype html><title>Ruphus completed-brew QA</title><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><div id="root"></div><script src="/app.js"></script>'); });
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const out = fileURLToPath(new URL('./', import.meta.url)); await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const report={browser:await browser.version(),channel:'chrome',origin,flow:'Completed-brew proposal -> View recipe -> 18 g / 279 g / 93 C / Ode 6 preview -> local Start callback',checks:[]};
try {
 for(const width of [390,1024]) {
  const page=await browser.newPage({viewport:{width,height:844},reducedMotion:'reduce'});
  const errors=[]; const warnings=[]; const blocked=[];
  page.on('pageerror',e=>errors.push(e.message)); page.on('console',m=>{if(['error','warning'].includes(m.type())) warnings.push(m.text());});
  await page.route('**/*',route=>{const url=new URL(route.request().url()); if(url.origin!==origin){blocked.push(url.origin);return route.abort();} return route.continue();});
  await page.goto(origin,{waitUntil:'networkidle'});
  assert.equal(await page.title(),'Ruphus completed-brew QA'); assert.equal(new URL(page.url()).origin,origin);
  report.loaded={errors,warnings,text:await page.locator('body').innerText()};
  await page.screenshot({path:`${out}/loaded-${width}.png`});
  assert.match(await page.locator('[data-preview-change]').innerText({timeout:5000}),/6\.2.*6/);
  await page.screenshot({path:`${out}/card-${width}.png`});
  await page.getByRole('button',{name:'View recipe',exact:true}).click();
  await page.getByRole('button',{name:'Start brew timer',exact:true}).waitFor();
  await page.waitForFunction(()=>Array.from(document.body.children).some(el=>getComputedStyle(el).position==='fixed' && getComputedStyle(el).zIndex==='1000' && Number(getComputedStyle(el).opacity)===1));
  const text=await page.locator('body').innerText();
  assert.match(text,/18g/); assert.match(text,/279g/); assert.match(text,/93/); assert.match(text,/Wave 185/);
  assert.equal(await page.locator('vite-error-overlay').count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);
  assert.deepEqual(errors,[]);
  await page.screenshot({path:`${out}/preview-${width}.png`});
  await page.getByRole('button',{name:'Start brew timer',exact:true}).click();
  assert.equal(await page.locator('[data-start-count]').textContent(),'1');
  report.checks.push({width,height:844,url:page.url(),title:await page.title(),notBlank:true,frameworkOverlay:false,pageErrors:errors,consoleMessages:warnings,blockedOrigins:[...new Set(blocked)],interaction:'View recipe opened actual proposal snapshot; Start called local fixture once',text});
  await page.close();
 }
 report.passed=true;
} catch(error) { report.passed=false; report.error=String(error.stack); process.exitCode=1; }
finally { await writeFile(`${out}/result.json`,JSON.stringify(report,null,2)); await browser.close(); await new Promise(resolve=>server.close(resolve)); console.log(JSON.stringify(report)); }
