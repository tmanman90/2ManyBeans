// chat-100x U5 spike part 2: does fetch().body.getReader() deliver chunks
// INCREMENTALLY inside WebKit (the WKWebView engine)? Runs the reader in the
// page context against the live prod spike endpoint and timestamps each chunk.
import { webkit } from 'playwright';

const URL_ = 'https://2manybeans.vercel.app/api/stream-spike';

const browser = await webkit.launch();
const page = await browser.newPage();
await page.goto('https://2manybeans.vercel.app', { waitUntil: 'domcontentloaded' });

const result = await page.evaluate(async (url) => {
  const arrivals = [];
  const res = await fetch(url);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    arrivals.push({ t: Date.now(), bytes: value.length, text: dec.decode(value).slice(0, 60) });
  }
  return arrivals;
}, URL_);

await browser.close();

console.log(`chunks received: ${result.length}`);
result.forEach((c, i) => {
  const gap = i ? c.t - result[i - 1].t : 0;
  console.log(`#${i + 1} +${gap}ms bytes=${c.bytes} ${c.text.replace(/\n/g, '\\n')}`);
});

const spread = result.length > 1 ? result[result.length - 1].t - result[0].t : 0;
const incremental = result.length >= 5 && spread > 1500;
console.log(`\ntotal spread: ${spread}ms across ${result.length} chunks`);
console.log(incremental ? 'WEBKIT STREAMING: PASS (incremental)' : 'WEBKIT STREAMING: FAIL (buffered or too few chunks)');
process.exit(incremental ? 0 : 1);
