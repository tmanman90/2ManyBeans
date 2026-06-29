// RuphusThinking — the "Professor Ruphus is thinking" loader shown while his AI coaching line is in
// flight (~15s), so the wait reads as deliberate, not broken. Liquid-glass dots done WKWebView-safe:
// a frosted pill (STATIC -webkit-backdrop-filter + inset top-rim sheen — never animated, never
// mix-blend), three breathing dots (transform: scale + opacity ONLY), and a shimmer caption
// (-webkit-background-clip:text + animated background-position) whose micro-copy ROTATES every
// ~3.5s so a long wait never looks stuck. No SVG goo filter (broken on WebKit). reduced-motion:
// dots + shimmer freeze to a calm state. role="status" for a11y. CSS lives in global.css.
import { useState, useEffect } from 'react';
import { C, fonts, radius } from '../../styles/theme';

const CAPTIONS = ['Reading your cup', 'Considering the roast', 'Comparing your notes', 'Writing back'];

export function RuphusThinking({ reduce = false }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reduce) return;
    const id = setInterval(() => setI(n => (n + 1) % CAPTIONS.length), 3500);
    return () => clearInterval(id);
  }, [reduce]);

  return (
    <div
      role="status"
      aria-label="Professor Ruphus is thinking"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 11,
        padding: '9px 14px', borderRadius: radius.pill,
        background: 'rgba(255,254,251,0.55)',
        backdropFilter: 'blur(16px) saturate(160%)', WebkitBackdropFilter: 'blur(16px) saturate(160%)',
        border: `1px solid ${C.hairline}`,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6), 0 1px 2px rgba(70,41,26,0.08)',
      }}
    >
      <span aria-hidden style={{ display: 'inline-flex', gap: 5 }}>
        {[0, 1, 2].map(d => (
          <span
            key={d}
            className={reduce ? 'ruphus-dot-static' : 'ruphus-dot'}
            style={{ width: 7, height: 7, borderRadius: '50%', background: C.accent, animationDelay: `${d * 0.18}s` }}
          />
        ))}
      </span>
      <span
        key={i}
        className={reduce ? undefined : 'ruphus-shimmer'}
        style={{
          fontFamily: fonts.body, fontSize: 13.5, fontWeight: 700, letterSpacing: '0.01em',
          color: C.textMuted, whiteSpace: 'nowrap',
        }}
      >
        {CAPTIONS[reduce ? 0 : i]}…
      </span>
    </div>
  );
}
