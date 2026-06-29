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

        const th = 44;
        for (let i = 0; i < d.length; i += 4) {
          const dr = d[i] - r, dg = d[i + 1] - g, db = d[i + 2] - b;
          const dist = Math.sqrt(dr * dr + dg * dg + db * db);
          if (dist < th) d[i + 3] = Math.round(255 * Math.min(1, dist / th) ** 1.3);
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
