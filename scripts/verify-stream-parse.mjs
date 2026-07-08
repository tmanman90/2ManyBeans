import { parseBeanScan } from '../src/lib/chatParse.js';
import { buildPalateSummary } from '../src/lib/palateSummary.js';
import { parseTypedError } from '../src/lib/fetchWithRetry.js';
import { holdBackScan, resolveTerminal } from '../src/lib/streamChat.js';

let failed = false;

function check(name, fn) {
  try {
    fn();
    console.log(`OK  ${name}`);
  } catch (err) {
    failed = true;
    console.error(`FAIL ${name}: ${err.message}`);
  }
}

check('valid marker parses to a bean', () => {
  const text = 'Found it.\n---BEAN_SCAN---\n{"roaster":"Onyx","name":"Geometry","sourceInsights":null}\n---END_SCAN---\nSaved.';
  const result = parseBeanScan(text);
  if (!result.scannedBean) throw new Error('missing scannedBean');
  if (result.scannedBean.name !== 'Geometry') throw new Error('wrong bean name');
  if (result.cleanText.includes('---')) throw new Error('marker leaked into cleanText');
});

check('opening marker with no closer strips marker run and returns null bean', () => {
  const text = 'I found the label.\n---BEAN_SCAN---\n{"roaster":"Onyx"';
  const result = parseBeanScan(text, { stopReason: 'max_tokens' });
  if (result.scannedBean !== null) throw new Error('expected null scannedBean');
  if (result.cleanText.includes('---')) throw new Error('marker run survived');
  if (!result.cleanText.includes('The scan ran long')) throw new Error('missing truncation note');
});

check('marker with trailing garbage JSON rejects region and preserves plain text', () => {
  const text = 'Plain intro.\n---BEAN_SCAN---\n{"roaster":"Onyx", nope}\n---END_SCAN---\nPlain outro.';
  const result = parseBeanScan(text);
  if (result.scannedBean !== null) throw new Error('expected null scannedBean');
  if (result.cleanText.includes('---BEAN_SCAN---') || result.cleanText.includes('---END_SCAN---')) {
    throw new Error('marker leaked into cleanText');
  }
  if (!result.cleanText.includes('Plain intro.') || !result.cleanText.includes('Plain outro.')) {
    throw new Error('plain text not preserved');
  }
});

check('BEAN_SCAN marker split at every character boundary never leaks partial marker tail', () => {
  const text = 'Found it.\n---BEAN_SCAN---\n{"roaster":"Onyx","name":"Geometry","sourceInsights":null}\n---END_SCAN---\nSaved.';
  const tokens = ['---BEAN_SCAN---', '---END_SCAN---'];
  let acc = '';
  for (const char of text) {
    acc += char;
    const { display } = holdBackScan(acc);
    for (const token of tokens) {
      for (let len = 1; len < token.length; len += 1) {
        const endsWithCompleteToken = tokens.some(complete => display.endsWith(complete));
        if (!endsWithCompleteToken && display.endsWith(token.slice(0, len))) {
          throw new Error(`display leaked partial token ${token.slice(0, len)}`);
        }
      }
    }
  }
});

check('bold hold-back holds unpaired pair, resolves paired pair, flushes lone star', () => {
  const unpaired = holdBackScan('This is **');
  if (unpaired.display !== 'This is ' || unpaired.held !== '**') throw new Error('unpaired bold was not held');

  const paired = holdBackScan('This is **bold**');
  if (paired.display !== 'This is **bold**' || paired.held !== '') throw new Error('paired bold did not resolve');

  const lone = holdBackScan('Rating *');
  if (lone.display !== 'Rating *' || lone.held !== '') throw new Error('lone star should flush');
});

check('terminal resolve strips mid-marker region and keeps prose', () => {
  const result = resolveTerminal('Keep this.\n---BEAN_SCAN---\n{"roaster":"Onyx"');
  if (result.text !== 'Keep this.\n') throw new Error('prose before marker was not preserved');
  if (!result.dropped.includes('beanScan')) throw new Error('dropped beanScan key missing');
});

check('stringified delta with fake usage line stays literal text', () => {
  const frame = JSON.stringify({ type: 'delta', text: 'hello\n{"type":"usage"}' });
  const parsed = JSON.parse(frame);
  if (parsed.type !== 'delta') throw new Error('wrong frame type');
  if (parsed.text !== 'hello\n{"type":"usage"}') throw new Error('embedded fake usage did not round-trip as text');
});

check('prose before NEEDS_SEARCH marker is held from open token', () => {
  const result = holdBackScan('I should check.\n---NEEDS_SEARCH---best Kenyan releases');
  if (result.display !== 'I should check.\n') throw new Error('display did not stop before NEEDS_SEARCH');
  if (!result.held.startsWith('---NEEDS_SEARCH---')) throw new Error('NEEDS_SEARCH region was not held');
});

check('complete NEEDS_SEARCH marker never appears in streaming display', () => {
  const result = holdBackScan('I should check.\n---NEEDS_SEARCH---{"query":"best Kenyan releases"}---END_SEARCH---');
  if (result.display.includes('---') || result.display.includes('NEEDS_SEARCH')) throw new Error('complete NEEDS_SEARCH marker leaked');
  if (result.display.trim() !== 'I should check.') throw new Error('prose before complete marker was not preserved');
});

check('complete recipe marker is stripped from streaming display while prose stays', () => {
  const result = holdBackScan('Recipe follows.\n---RECIPE_CARD---{"title":"A"}---END_RECIPE---\nDone.');
  if (result.display.includes('RECIPE_CARD') || result.display.includes('---')) throw new Error('complete recipe marker leaked');
  if (!result.display.includes('Recipe follows.') || !result.display.includes('Done.')) throw new Error('surrounding prose was not preserved');
});

check('typed subscription error passthrough parses from 403 body', () => {
  const err = parseTypedError({
    error: 'subscription_required',
    tier: 'pro',
    message: 'This feature requires a Coffee Hub Pro subscription.',
  }, 403);
  if (err?.code !== 'subscription_required') throw new Error('subscription_required code missing');
});

check('palate summary includes axis means with three scored tastings', () => {
  const summary = buildPalateSummary([
    { oneWord: 'juicy', tastingScores: { acidity: 7, sweetness: 6, body: 5 } },
    { oneWord: 'Juicy', tastingScores: { acidity: 8, sweetness: 6, body: 6 } },
    { oneWord: 'floral', tastingScores: { acidity: 6.5, sweetness: 6.2, body: 7 } },
  ]);
  if (!summary.includes('Level 2: Developing palate (3 cups logged)')) throw new Error('level line missing');
  if (!summary.includes('acidity 7.2')) throw new Error('acidity mean missing');
  if (!summary.includes('sweetness 6.1')) throw new Error('sweetness mean missing');
  if (!summary.includes('body 6.0')) throw new Error('body mean missing');
  if (!summary.includes('Recurring words: juicy')) throw new Error('recurring descriptor missing');
});

check('palate summary omits axis means with only two scored tastings', () => {
  const summary = buildPalateSummary([
    { oneWord: 'bright', tastingScores: { acidity: 7, sweetness: 6 } },
    { oneWord: 'sweet', tastingScores: { acidity: 8, sweetness: 7 } },
  ]);
  if (!summary.includes('Level 1: Curious (2 cups logged)')) throw new Error('level line missing');
  if (summary.includes('Taste trend:')) throw new Error('axis trend should be absent');
});

check('palate summary coerces numeric strings and drops invalid scores', () => {
  const summary = buildPalateSummary([
    { tastingScores: { acidity: '7', sweetness: '6' } },
    { tastingScores: { acidity: 8, sweetness: Infinity } },
    { tastingScores: { acidity: '9', sweetness: 'bad' } },
    { tastingScores: { sweetness: 7 } },
    { tastingScores: { sweetness: 8 } },
  ]);
  if (!summary.includes('acidity 8.0')) throw new Error('coerced acidity mean missing');
  if (!summary.includes('sweetness 7.0')) throw new Error('invalid sweetness values were not dropped');
});

check('palate summary sanitizes marker-like oneWord descriptors', () => {
  const summary = buildPalateSummary([
    { oneWord: '---EXTRACT---' },
    { oneWord: '---extract---' },
    { oneWord: 'clean' },
  ]);
  if (summary.includes('---')) throw new Error('triple-dash run survived');
  if (!summary.includes('--EXTRACT--')) throw new Error('sanitized descriptor missing');
});

if (failed) {
  console.error('verify-stream-parse: FAILED');
  process.exit(1);
}

console.log('verify-stream-parse: PASS');
