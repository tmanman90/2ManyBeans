// chat-100x per-tier evidence gate (R22). FAILS unless a REAL simulator screenshot exists for
// every changed chat element in the requested tier — proving the click-through happened on the
// actual app, not just the harness. Frames are captured to sim/chat/ via the sim-from-vite run
// (xcrun simctl io booted screenshot). PER-TIER by design: `--tier ab` passes with zero tier-C
// frames so a Phase C stall can never block shipping Phases A+B. `--tier c` gates Phase C only.
// Special-cased evidence: stream-curl.txt is the ONLY artifact that proves true incremental
// delivery (frames can't distinguish real streaming from buffered reveal) — validated for
// multi-timestamp arrival, not pixels.
import { statSync, readFileSync, existsSync } from 'node:fs';

const DIR = 'sim/chat';
const FRESH_HOURS = 24;
const MIN_BYTES = 8192;
const MIN_WIDTH = 600;

const TIERS = {
  ab: [
    { f: 'device-thinking-loader.png',   what: 'dot-matrix thinking loader after sending a question' },
    { f: 'device-stream-early.png',      what: 'reply streaming in, early frame' },
    { f: 'device-stream-late.png',       what: 'same reply visibly longer, later frame (progressive proof pair)' },
    { f: 'device-recipe-card.png',       what: 'structured recipe card with Brew + Save actions' },
    { f: 'device-starters.png',          what: 'rotation-aware starter chips on the intro card' },
    { f: 'device-scan-camera.png',       what: 'camera/photo prompt after tapping Scan a bag (no message sent)' },
    { f: 'device-resumed-thread.png',    what: 'conversation restored after app relaunch' },
    { f: 'device-new-chat.png',          what: 'intro + starters back after New chat' },
  ],
  c: [
    { f: 'device-search-caption.png',    what: 'loader caption showing the live web search query' },
    { f: 'device-sources-footer.png',    what: 'answer with tappable https sources footer' },
  ],
};

const CURL_TRANSCRIPT = { f: 'stream-curl-spike.txt', minLines: 8 }; // tier ab only

const tierArg = (process.argv.find(a => a.startsWith('--tier')) || '').split('=')[1]
  || process.argv[process.argv.indexOf('--tier') + 1];
const tier = (tierArg || 'ab').toLowerCase();
if (!TIERS[tier]) { console.error(`unknown tier "${tier}" (use ab | c)`); process.exit(2); }

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const now = Date.now();
const fails = [];

function pngWidth(buf) {
  if (buf.length < 24 || !buf.subarray(0, 8).equals(PNG_SIG)) return null;
  return buf.readUInt32BE(16);
}

for (const { f, what } of TIERS[tier]) {
  const path = `${DIR}/${f}`;
  if (!existsSync(path)) { fails.push(`MISSING  ${f}  — need: ${what}`); continue; }
  const st = statSync(path);
  if (st.size < MIN_BYTES) { fails.push(`TOO SMALL ${f}  (${st.size}B < ${MIN_BYTES}B) — not a real screenshot`); continue; }
  const ageH = (now - st.mtimeMs) / 3.6e6;
  if (ageH > FRESH_HOURS) { fails.push(`STALE    ${f}  (${ageH.toFixed(1)}h old > ${FRESH_HOURS}h) — re-capture this run`); continue; }
  const w = pngWidth(readFileSync(path));
  if (w == null) { fails.push(`NOT PNG  ${f}`); continue; }
  if (w < MIN_WIDTH) { fails.push(`NOT A SCREENSHOT ${f}  (width ${w}px < ${MIN_WIDTH}px)`); continue; }
  console.log(`OK   ${f}  (${(st.size / 1024 | 0)}KB, ${w}px, ${ageH.toFixed(1)}h)  — ${what}`);
}

// progressive-proof pair: late frame must genuinely differ from early frame
if (tier === 'ab') {
  const early = `${DIR}/device-stream-early.png`;
  const late = `${DIR}/device-stream-late.png`;
  if (existsSync(early) && existsSync(late)) {
    const a = readFileSync(early); const b = readFileSync(late);
    if (a.equals(b)) fails.push('IDENTICAL device-stream-early/late — the pair must show the reply growing');
  }
  const t = `${DIR}/${CURL_TRANSCRIPT.f}`;
  if (!existsSync(t)) fails.push(`MISSING  ${CURL_TRANSCRIPT.f}  — curl -N transcript proving incremental delivery`);
  else {
    const lines = readFileSync(t, 'utf8').trim().split('\n');
    const stamps = new Set(lines.map(l => l.slice(0, 12)));
    if (lines.length < CURL_TRANSCRIPT.minLines || stamps.size < 4) {
      fails.push(`WEAK TRANSCRIPT ${CURL_TRANSCRIPT.f} — needs ≥${CURL_TRANSCRIPT.minLines} lines across ≥4 distinct timestamps`);
    } else {
      console.log(`OK   ${CURL_TRANSCRIPT.f}  (${lines.length} lines, ${stamps.size} distinct timestamps)`);
    }
  }
}

if (fails.length) {
  console.error(`\nverify-chat-evidence [tier ${tier}]: FAILED — capture to ${DIR}/ via the sim-from-vite run:`);
  for (const m of fails) console.error('  ' + m);
  process.exit(1);
}
console.log(`\nverify-chat-evidence [tier ${tier}]: PASSED`);
process.exit(0);
