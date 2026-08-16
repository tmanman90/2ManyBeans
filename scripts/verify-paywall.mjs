// Static verification gate for the paywall UI (src/components/paywall/** +
// src/styles/paywall.css). No browser, no dev server — pure source-text
// checks, run before every paywall change ships. See scripts/shot-paywall.mjs
// for the visual/behavioral counterpart (real component screenshots).
//
// Every check below encodes a constraint the paywall has already violated,
// or nearly violated, in review: a hardcoded price (Apple 3.1.2 rejection,
// Jan 2026), a `backdrop-filter`/`mask-image` missing its -webkit- sibling
// (silently no-ops in WKWebView), a framer `animate`/`initial`/
// `AnimatePresence` that doesn't reliably fire in this app's portaled
// WKWebView tree, an entrance class that isn't visible-by-default outside
// the reduced-motion guard (has shipped invisible screens twice), a
// box-shadow standing in for the surface-ladder elevation system, the
// Pro/Ultra card height regression Tal caught once already, and a missing
// z-index that would render the paywall behind the modal that opened it.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PAYWALL_DIR = join(ROOT, 'src/components/paywall');
const PAYWALL_CSS = join(ROOT, 'src/styles/paywall.css');

const failures = [];
const fail = (file, msg) => failures.push(`${file}: ${msg}`);

// ---------------------------------------------------------------------------
// Collect files to scan.
// ---------------------------------------------------------------------------
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (['.js', '.jsx'].includes(extname(full))) out.push(full);
  }
  return out;
}

const jsFiles = walk(PAYWALL_DIR);
const files = [...jsFiles, PAYWALL_CSS];

// ---------------------------------------------------------------------------
// Comment stripping — every check below runs against comment-stripped
// source ("Allow matches inside comments" per the currency/trial rule, and
// there's no reason the other checks should be pickier about prose in a
// comment than about real code).
// ---------------------------------------------------------------------------
function stripComments(src, isCss) {
  // Block comments (/* ... */) — both JS and CSS.
  let out = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  if (!isCss) {
    // Line comments (// ...) — JS/JSX only, CSS has none.
    out = out.replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));
  }
  return out;
}

const sources = files.map((file) => {
  const raw = readFileSync(file, 'utf8');
  const isCss = extname(file) === '.css';
  return { file, raw, code: stripComments(raw, isCss), isCss };
});

const rel = (f) => f.replace(ROOT, '');

// ---------------------------------------------------------------------------
// 1. Hardcoded currency amount or hardcoded trial duration.
//    Prices must come from pkg.product.priceString (RevenueCat/StoreKit);
//    trial length must come from src/lib/trialOffer.js. Apple rejected a
//    paywall over a hardcoded price in Jan 2026 (3.1.2) — this is not
//    theoretical.
// ---------------------------------------------------------------------------
const CURRENCY_RE = /(\$|USD|US\$|€|£)\s?\d/;
const TRIAL_DURATION_RE = /\b\d{1,3}[\s-]?(day|week|month|yr|year)s?\b/i;

for (const { file, code } of sources) {
  const lines = code.split('\n');
  lines.forEach((line, idx) => {
    if (CURRENCY_RE.test(line)) {
      fail(rel(file), `line ${idx + 1}: hardcoded currency amount ("${line.trim().slice(0, 80)}") — prices must always come from pkg.product.priceString, never a literal. A hardcoded price is stale the moment App Store Connect pricing changes, and Apple rejected exactly this in Jan 2026 (3.1.2).`);
    }
    if (TRIAL_DURATION_RE.test(line)) {
      fail(rel(file), `line ${idx + 1}: hardcoded trial/period duration ("${line.trim().slice(0, 80)}") — trial length must be derived from src/lib/trialOffer.js (introOfferFromPackage/trialFromOffering), never a literal number of days/weeks/months. The real intro offer lives in App Store Connect; a hardcoded duration silently drifts from it and becomes a false pricing promise.`);
    }
  });
}

// ---------------------------------------------------------------------------
// 2. backdrop-filter without a -webkit-backdrop-filter sibling, or
//    mask-image without a -webkit-mask-image sibling, in the SAME
//    declaration block. Unprefixed-only silently no-ops in WKWebView.
// ---------------------------------------------------------------------------
function checkPrefixPairs(file, code, isCss) {
  // Scan every {...} block (CSS) — or every inline style object (JS/JSX,
  // rare in this codebase but future-proofed) — for the property pair.
  const blockRe = isCss ? /\{([^{}]*)\}/g : /style=\{\{([^{}]*)\}\}/g;
  let m;
  while ((m = blockRe.exec(code))) {
    const block = m[1];
    const hasBackdrop = /(?<!-webkit-)backdrop-filter\s*:/.test(block) || /backdropFilter\s*:/.test(block);
    const hasWebkitBackdrop = /-webkit-backdrop-filter\s*:/.test(block) || /WebkitBackdropFilter\s*:/.test(block);
    if (hasBackdrop && !hasWebkitBackdrop) {
      fail(rel(file), `backdrop-filter without a -webkit-backdrop-filter sibling in the same rule/style block — Safari/WKWebView requires the -webkit- prefix or the blur silently no-ops on device (block: "${block.trim().slice(0, 100)}").`);
    }
    const hasMask = /(?<!-webkit-)mask-image\s*:/.test(block) || /(?<!Webkit)maskImage\s*:/.test(block);
    const hasWebkitMask = /-webkit-mask-image\s*:/.test(block) || /WebkitMaskImage\s*:/.test(block);
    if (hasMask && !hasWebkitMask) {
      fail(rel(file), `mask-image without a -webkit-mask-image sibling in the same rule/style block — masks silently vanish in real-device WKWebView without the -webkit- prefix (block: "${block.trim().slice(0, 100)}").`);
    }
  }
}
for (const { file, code, isCss } of sources) checkPrefixPairs(file, code, isCss);

// ---------------------------------------------------------------------------
// 3. framer-motion `animate=`, `initial=`, or `AnimatePresence` anywhere in
//    the paywall tree. `whileTap` and `layoutId` are permitted (interaction
//    feedback, not entrance/visibility).
// ---------------------------------------------------------------------------
for (const { file, code, isCss } of sources) {
  if (isCss) continue;
  if (/\banimate\s*=/.test(code)) {
    fail(rel(file), 'uses a framer-motion `animate=` prop — entrance/visibility in this paywall must be CSS-only (see paywall.css "Motion" section). framer\'s `animate` prop does not reliably fire inside this app\'s createPortal-to-body WKWebView tree and has shipped invisible screens before.');
  }
  if (/\binitial\s*=/.test(code)) {
    fail(rel(file), 'uses a framer-motion `initial=` prop — same rule as `animate=`: entrance/visibility must be CSS-only, not framer-driven.');
  }
  if (/\bAnimatePresence\b/.test(code)) {
    fail(rel(file), 'uses `AnimatePresence` — mount/unmount transitions must be CSS-only in this paywall; AnimatePresence pairs with `animate`, which is banned here for the same WKWebView reliability reason.');
  }
}

// ---------------------------------------------------------------------------
// CSS rule parser — flat pass, tracks @media nesting only (the only nesting
// this stylesheet uses). Returns [{ selector, body, media }].
// ---------------------------------------------------------------------------
function parseCssRules(css) {
  const rules = [];
  const mediaStack = [];
  let i = 0;
  const n = css.length;
  while (i < n) {
    while (i < n && /\s/.test(css[i])) i++;
    if (i >= n) break;
    if (css[i] === '}') {
      if (mediaStack.length) mediaStack.pop();
      i++;
      continue;
    }
    const start = i;
    while (i < n && css[i] !== '{' && css[i] !== '}' && css[i] !== ';') i++;
    const header = css.slice(start, i).trim();
    if (css[i] === ';') { i++; continue; }
    if (css[i] === '{') {
      i++;
      if (header.startsWith('@media')) {
        mediaStack.push(header);
        continue;
      }
      let depth = 1;
      const bodyStart = i;
      while (i < n && depth > 0) {
        if (css[i] === '{') depth++;
        else if (css[i] === '}') depth--;
        if (depth > 0) i++;
      }
      const body = css.slice(bodyStart, i);
      i++;
      rules.push({ selector: header, body, media: mediaStack.length ? mediaStack[mediaStack.length - 1] : null });
    } else {
      i++;
    }
  }
  return rules;
}

const cssSource = sources.find((s) => s.isCss);
const cssRules = cssSource ? parseCssRules(cssSource.code) : [];
const NO_PREFERENCE_RE = /prefers-reduced-motion:\s*no-preference/;

// ---------------------------------------------------------------------------
// 4. Any `.pw-*` entrance class whose BASE rule (outside a
//    prefers-reduced-motion: no-preference media block) sets opacity: 0.
//    Base state must always be visible; the fade-in is layered on top only
//    inside the no-preference guard. Playwright and the sim both default to
//    no-preference, so this is a real device-only failure mode that no
//    screenshot suite catches on its own (see shot-paywall.mjs's mandatory
//    reduced-motion shot for the runtime counterpart of this static check).
// ---------------------------------------------------------------------------
const OPACITY_ZERO_RE = /opacity\s*:\s*0(?!\.\d)\s*(?:;|$)/m;
for (const rule of cssRules) {
  const selectors = rule.selector.split(',').map((s) => s.trim());
  const isPwEntrance = selectors.some((s) => /^\.pw-[\w-]+/.test(s));
  if (!isPwEntrance) continue;
  if (!OPACITY_ZERO_RE.test(rule.body)) continue;
  const guarded = rule.media && NO_PREFERENCE_RE.test(rule.media);
  if (!guarded) {
    fail(rel(PAYWALL_CSS), `rule "${rule.selector}" sets opacity: 0 outside a "@media (prefers-reduced-motion: no-preference)" block — its base state must be visible-by-default. WKWebView does not reliably run the entrance keyframe, so any element whose ONLY visibility comes from an animation firing can ship permanently invisible on device. This exact bug has shipped twice in this app.`);
  }
}

// ---------------------------------------------------------------------------
// 5. Any box-shadow inside paywall.css. Elevation here is a surface-ladder
//    step (background color swap), by design — box-shadow is banned even
//    as "box-shadow: none" noise, because writing the property at all
//    signals someone reached for the wrong elevation mechanism.
// ---------------------------------------------------------------------------
if (cssSource && /box-shadow\s*:/.test(cssSource.code)) {
  const lineNo = cssSource.code.slice(0, cssSource.code.search(/box-shadow\s*:/)).split('\n').length;
  fail(rel(PAYWALL_CSS), `line ${lineNo}: box-shadow found — this paywall does elevation via the surface ladder (--pw-s0..s4 background steps), never box-shadow. Adding one is a sign the surface-ladder token for the intended elevation is missing, not that box-shadow is the fix.`);
}

// ---------------------------------------------------------------------------
// 6. `.pw-plan-head` / `.pw-badge-slot` must keep a FIXED `height`, not
//    `min-height` / auto. Regression target: without a fixed height, the
//    Best-value badge on Ultra pushes its price row below Pro's, breaking
//    the shared baseline across the two plan cards — a defect already
//    caught once in review.
// ---------------------------------------------------------------------------
const FIXED_HEIGHT_TARGETS = ['.pw-plan-head', '.pw-badge-slot'];
for (const target of FIXED_HEIGHT_TARGETS) {
  const matches = cssRules.filter((r) => r.selector.split(',').map((s) => s.trim()).includes(target));
  if (matches.length === 0) {
    fail(rel(PAYWALL_CSS), `selector "${target}" not found at all — this is a fixed-height regression target (see the comment above .pw-plan-head in paywall.css). Without it the Best-value badge on Ultra pushes prices off Pro's baseline.`);
    continue;
  }
  const hasFixedHeight = matches.some((r) => /(^|[^-\w])height\s*:\s*[\d.]+(px|rem|em)/.test(r.body));
  if (!hasFixedHeight) {
    fail(rel(PAYWALL_CSS), `"${target}" no longer sets a fixed pixel \`height\` (min-height or auto is not equivalent) — this is a known regression target: without a FIXED height, Pro's shorter head (no badge) and Ultra's taller head (Best value badge) land their annual prices at different y-offsets and the two-column grid reads broken. See the comment above .pw-plan-head in paywall.css for the full reasoning; do not "simplify" this back to auto/min-height.`);
  }
}

// ---------------------------------------------------------------------------
// 7. Missing zIndex: 2000 on the paywall root. PaywallRoast opens from
//    inside Modal.jsx (z-index 1000) via ScanSheet/EditBeanModal; anything
//    below 2000 renders behind the modal that launched it.
// ---------------------------------------------------------------------------
const Z_INDEX_RE = /z-?[Ii]ndex\s*:\s*2000\b/;
const hasZIndex2000 = sources.some(({ code }) => Z_INDEX_RE.test(code));
if (!hasZIndex2000) {
  fail('src/components/paywall/**', 'no `zIndex: 2000` (or `z-index: 2000`) found anywhere in the paywall tree — the paywall root must pin z-index 2000. It opens from INSIDE Modal.jsx (z-index 1000) via ScanSheet and EditBeanModal; anything lower renders the paywall behind the modal that opened it.');
}

// ---------------------------------------------------------------------------
// Report.
// ---------------------------------------------------------------------------
if (failures.length) {
  console.error(`verify-paywall: FAILED (${failures.length} issue${failures.length === 1 ? '' : 's'})\n`);
  for (const f of failures) console.error(`FAIL: ${f}\n`);
  process.exitCode = 1;
} else {
  console.log(`verify-paywall: PASS (${files.length} files checked)`);
}
