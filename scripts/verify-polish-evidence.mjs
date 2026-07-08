// On-device evidence gate (R8). FAILS unless a REAL device/simulator screenshot exists for every
// changed interactive element on every surface — proving the click-through actually happened, not
// "build passed so it works". The /goal executor must capture these to sim/polish/ via the
// sim-from-vite run (xcrun simctl io booted screenshot). The gate checks each file: exists, is a
// valid PNG, is a real screenshot (width >= 600px, not a fabricated stub), is non-trivially sized,
// and is RECENT (mtime within the freshness window, so stale screenshots from a prior run don't
// satisfy it). This is the thing a build/lint can't prove — so it's enforced as a hard gate.
import { statSync, readFileSync, existsSync } from 'node:fs';

const DIR = 'sim/polish';
const FRESH_HOURS = 24;
const MIN_BYTES = 8192;     // a real iPhone screenshot is hundreds of KB; reject stubs
const MIN_WIDTH = 600;      // real screenshot width; reject 1x1 / tiny fabricated pngs

// Each required frame = one changed element on one surface. Capture these during the loop.
const REQUIRED = [
  { f: 'bone-hidden.png',    what: 'slider before commit with Ruphus expected bone hidden' },
  { f: 'bone-revealed.png',  what: 'slider after Next commit with the lucide Bone marker revealed' },
  { f: 'loader-matrix.png',  what: 'frosted-glass canvas dot-matrix loader visible immediately after answer commit' },
  { f: 'chat-thread.png',    what: 'Ruphus chat thread with coaching bubble plus separate loader/reaction bubble' },
  { f: 'resume-prompt.png',  what: 'guided-tasting entry offering Resume for the in-session draft' },
];

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const now = Date.now();
const fails = [];

function pngWidth(buf) {
  if (buf.length < 24 || !buf.subarray(0, 8).equals(PNG_SIG)) return null; // not a PNG
  return buf.readUInt32BE(16); // IHDR width
}

for (const { f, what } of REQUIRED) {
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

if (fails.length) {
  console.error('\nverify-polish-evidence: FAILED — capture the missing/stale frames to sim/polish/ via the sim-from-vite run:');
  for (const m of fails) console.error('  ' + m);
  process.exit(1);
}
console.log('\nverify-polish-evidence: PASSED — on-device click-through evidence present for all changed elements.');
process.exit(0);
