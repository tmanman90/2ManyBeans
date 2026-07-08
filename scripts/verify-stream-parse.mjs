import { parseBeanScan } from '../src/lib/chatParse.js';

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

if (failed) {
  console.error('verify-stream-parse: FAILED');
  process.exit(1);
}

console.log('verify-stream-parse: PASS');
