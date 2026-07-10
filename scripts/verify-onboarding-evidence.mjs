// Onboarding-100x evidence gate (R15). FAILS unless a REAL simulator screenshot exists for
// every onboarding screen/state the loop changed — proving the on-sim click-through happened,
// not "harness passed so it renders". Frames are captured to sim/onboarding/ from the
// simulator's WKWebView (harness pages via capacitor server.url) plus one bundled-app frame
// for the grind cell. Checks per file: exists, real image (PNG or JPEG), plausible screenshot
// width, non-trivial size, and RECENT (stale frames from a prior run don't satisfy the gate).
import { statSync, readFileSync, existsSync } from 'node:fs';

const DIR = 'sim/onboarding';
const FRESH_HOURS = 24;
const MIN_BYTES = 8192;
// xcodebuildmcp's screenshot tool emits 368px-wide optimized JPEGs (unlike the
// full-res `xcrun simctl io` PNGs the polish gate was calibrated for). The
// anti-stub property is carried by MIN_BYTES + valid-image parsing + freshness;
// 360 still rejects fabricated tiny images.
const MIN_WIDTH = 360;

const REQUIRED = [
  { f: 'r01-welcome.jpg',        what: 'R01 welcome, chaptered progress bar with endowed start' },
  { f: 'r02-goal.jpg',           what: 'R02 goal chips' },
  { f: 'r03-pain.jpg',           what: 'R03 with the goal acknowledgment bubble (A1)' },
  { f: 'r04-credibility.jpg',    what: 'R04 credibility rows (no invented humans)' },
  { f: 'r05-palate-deck.jpg',    what: 'R05 swipe deck' },
  { f: 'r06-plan.jpg',           what: 'R06 personalized plan preview' },
  { f: 'r07-kit.jpg',            what: 'R07 kit form' },
  { f: 'r08-camera.jpg',         what: 'R08 priming with explicit Not now' },
  { f: 'r09-assembly.jpg',       what: 'R09 mid-assembly: real palate chart + axis beats' },
  { f: 'r10-fallback-sample.jpg',what: 'R10 variant (b): SAMPLE Bombe Bensa card' },
  { f: 'r10-scan-idle.jpg',      what: 'R10 variant (a) idle: Scan my bag + Skip for now' },
  { f: 'r10-scan-result.jpg',    what: 'R10 scan aha: result card + Keep going' },
  { f: 'r11-profile.jpg',        what: 'R11 archetype headline + prediction line' },
  { f: 'r12-timeline.jpg',       what: 'R12 hairline trial timeline' },
  { f: 'r13-recap.jpg',          what: 'R13 page-one recap: YOUR PLAN IS READY + value rows + plans' },
  { f: 'r13-redeem-open.jpg',    what: 'R13 invite-code input expanded' },
  { f: 'r13-celebration.jpg',    what: 'R13 redemption celebration: You are in, brewer' },
  { f: 'r13b-nudge.jpg',         what: 'R13b nudge screen' },
  { f: 'grind-card.jpg',         what: 'BeanDetailCard front stat bar showing GRIND on an ACTIVE bean' },
];
const OPTIONAL = [
  { f: 'r10-scanning.jpg',       what: 'R10 mid-scan RuphusThinking pill (transient; best-effort)' },
];

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function imageWidth(buf) {
  if (buf.length > 24 && buf.subarray(0, 8).equals(PNG_SIG)) return buf.readUInt32BE(16);
  // JPEG: scan markers for SOF0/1/2 (0xC0/0xC1/0xC2) and read width from the frame header.
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i += 1; continue; }
      const marker = buf[i + 1];
      if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) return buf.readUInt16BE(i + 7);
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) { i += 2; continue; }
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return null;
}

const now = Date.now();
const fails = [];

function check({ f, what }, required) {
  const path = `${DIR}/${f}`;
  if (!existsSync(path)) {
    if (required) fails.push(`MISSING  ${f}  — need: ${what}`);
    else console.log(`SKIP ${f} (optional) — ${what}`);
    return;
  }
  const st = statSync(path);
  if (st.size < MIN_BYTES) { fails.push(`TOO SMALL ${f} (${st.size}B) — not a real screenshot`); return; }
  const ageH = (now - st.mtimeMs) / 3.6e6;
  if (ageH > FRESH_HOURS) { fails.push(`STALE    ${f} (${ageH.toFixed(1)}h > ${FRESH_HOURS}h) — re-capture this run`); return; }
  const w = imageWidth(readFileSync(path));
  if (w == null) { fails.push(`NOT AN IMAGE ${f}`); return; }
  if (w < MIN_WIDTH) { fails.push(`NOT A SCREENSHOT ${f} (width ${w}px < ${MIN_WIDTH}px)`); return; }
  console.log(`OK   ${f}  (${(st.size / 1024) | 0}KB, ${w}px, ${ageH.toFixed(1)}h)  — ${what}`);
}

for (const r of REQUIRED) check(r, true);
for (const o of OPTIONAL) check(o, false);

if (fails.length) {
  console.error('\nverify-onboarding-evidence: FAILED — capture the missing/stale frames to sim/onboarding/:');
  for (const m of fails) console.error('  ' + m);
  process.exit(1);
}
console.log('\nverify-onboarding-evidence: PASSED — simulator evidence present for every screen/state.');
process.exit(0);
