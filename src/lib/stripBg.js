// useStrippedBag — client-side background removal for bag product shots.
// Loads the image, detects the flat corner background, and makes near-bg pixels
// transparent on a canvas, returning a data URL. Renders bags clean on any card
// with NO backend deploy and NO change to stored data. Falls back to the
// original src on any failure (e.g. cross-origin canvas taint).
//
// Safe by construction:
//  - if the image already has a transparent background, it's left untouched
//  - if the canvas read is blocked (CORS), it returns the original image
//  - result is memo-cached per src for the session
import { useEffect, useState } from 'react';

const cache = new Map();

// PREVIEW ONLY: until live bag-stripping is enabled for real accounts (Storage
// CORS or the ship-day reprocess), render specific known bags from a pre-stripped
// local image so they float on the card. Matched by roaster + name.
const LOCAL_BAG_OVERRIDES = [
  { test: (b) => /stereoscope/i.test(b?.roaster || '') && /(el diviso|ombligon)/i.test(b?.name || ''), src: '/images/demo/bags/stereoscope-card-v3.png' },
];

export function bagPhotoFor(bean) {
  for (const o of LOCAL_BAG_OVERRIDES) { if (o.test(bean)) return o.src; }
  return bean?.photoUrl || null;
}

export function useStrippedBag(src) {
  const [out, setOut] = useState(() => (src && cache.get(src)) || src || null);

  useEffect(() => {
    if (!src) { setOut(null); return; }
    if (cache.has(src)) { setOut(cache.get(src)); return; }
    setOut(src);
    let cancelled = false;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => {
      if (cancelled) return;
      try {
        const w = img.naturalWidth, h = img.naturalHeight;
        if (!w || !h) return;
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, w, h); // throws if tainted (CORS)
        const d = imageData.data;
        const m = Math.max(4, Math.floor(Math.min(w, h) * 0.02));
        const at = (x, y) => (y * w + x) * 4;
        const corners = [[m, m], [w - m - 1, m], [m, h - m - 1], [w - m - 1, h - m - 1]];

        // already transparent? leave it alone
        let aSum = 0;
        for (const [x, y] of corners) aSum += d[at(x, y) + 3];
        if (aSum / corners.length < 250) { if (!cancelled) { cache.set(src, src); setOut(src); } return; }

        let r = 0, g = 0, b = 0;
        for (const [x, y] of corners) { const i = at(x, y); r += d[i]; g += d[i + 1]; b += d[i + 2]; }
        r = Math.round(r / 4); g = Math.round(g / 4); b = Math.round(b / 4);

        // Border-connected flood fill: only background reachable from the image
        // edge becomes transparent. A global threshold punches holes in
        // near-white pixels INSIDE the bag (label circles, cream artwork) —
        // verified 9.8% of the Bombe Bensa label went transparent that way.
        const th = 44;
        const distAt = (i) => {
          const dr = d[i] - r, dg = d[i + 1] - g, db = d[i + 2] - b;
          return Math.sqrt(dr * dr + dg * dg + db * db);
        };
        const visited = new Uint8Array(w * h);
        const queue = new Int32Array(w * h);
        let qt = 0;
        const push = (x, y) => {
          const p = y * w + x;
          if (visited[p] || distAt(p * 4) >= th) return;
          visited[p] = 1; queue[qt++] = p;
        };
        for (let x = 0; x < w; x += 1) { push(x, 0); push(x, h - 1); }
        for (let y = 0; y < h; y += 1) { push(0, y); push(w - 1, y); }
        for (let qh = 0; qh < qt; qh += 1) {
          const p = queue[qh], x = p % w, y = (p - x) / w;
          if (x > 0) push(x - 1, y);
          if (x < w - 1) push(x + 1, y);
          if (y > 0) push(x, y - 1);
          if (y < h - 1) push(x, y + 1);
        }
        // Acceptance guard: a real product shot sits on a seamless backdrop, so
        // the outer 2% ring is ~all background (measured >=97.9% across the
        // library). Raw user photos (hands, rooms, back labels) score <=68.7%
        // — stripping those would mangle them, so serve them untouched.
        let ringHit = 0, ringTotal = 0;
        for (let y = 0; y < h; y += 1) {
          for (let x = 0; x < w; x += 1) {
            if (x >= m && y >= m && x < w - m && y < h - m) continue;
            ringTotal += 1;
            if (visited[y * w + x]) ringHit += 1;
          }
        }
        if (ringHit / ringTotal < 0.9) { if (!cancelled) { cache.set(src, src); setOut(src); } return; }
        for (let p = 0; p < w * h; p += 1) {
          if (!visited[p]) continue;
          const i = p * 4;
          d[i + 3] = Math.round(255 * Math.min(1, distAt(i) / th) ** 1.3);
        }
        ctx.putImageData(imageData, 0, 0);
        const url = canvas.toDataURL('image/png');
        if (!cancelled) { cache.set(src, url); setOut(url); }
      } catch {
        if (!cancelled) { cache.set(src, src); setOut(src); } // CORS / error → original
      }
    };
    img.onerror = () => { if (!cancelled) setOut(src); };
    img.src = src;
    return () => { cancelled = true; };
  }, [src]);

  return out;
}
