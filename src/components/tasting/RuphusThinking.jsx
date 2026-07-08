// RuphusThinking — the "Professor Ruphus is thinking" loader shown while his AI coaching line is in
// flight. The wait reads as deliberate: a compact frosted-glass pill with a canvas dot-matrix scan.
// WKWebView-safe: static backdrop-filter, no SVG filters, no mix-blend, and canvas rAF pauses when
// offscreen. reduced-motion draws one calm frame. role="status" for a11y.
import { useState, useEffect, useRef } from 'react';
import { C, fonts, radius } from '../../styles/theme';

const CAPTIONS = ['Reading your cup', 'Considering the roast', 'Comparing your notes', 'Writing back'];
const DOT = { gap: 8, radius: 1.7, accent: [162, 99, 47], ink: [93, 73, 56] };

export function RuphusThinking({ reduce = false, captions = CAPTIONS }) {
  const lines = Array.isArray(captions) && captions.length > 0 ? captions : CAPTIONS;
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reduce) return;
    const id = setInterval(() => setI(n => (n + 1) % lines.length), 3500);
    return () => clearInterval(id);
  }, [reduce, lines.length]);

  return (
    <div
      role="status"
      aria-label="Professor Ruphus is thinking"
      data-dot-matrix-loader="true"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 11,
        padding: '8px 13px 8px 10px', borderRadius: radius.pill,
        background: 'rgba(255,254,251,0.58)',
        backdropFilter: 'blur(18px) saturate(160%)', WebkitBackdropFilter: 'blur(18px) saturate(160%)',
        border: `1px solid ${C.hairline}`,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.68), inset 0 -1px 4px rgba(70,41,26,0.08), 0 1px 2px rgba(70,41,26,0.08)',
      }}
    >
      <span aria-hidden style={{ width: 78, height: 26, display: 'block', flexShrink: 0 }}>
        <DotMatrix reduce={reduce} />
      </span>
      <span
        key={i}
        style={{
          fontFamily: fonts.body, fontSize: 13.5, fontWeight: 700, letterSpacing: '0.01em',
          color: C.textMuted, whiteSpace: 'nowrap',
        }}
      >
        {lines[reduce ? 0 : i % lines.length]}…
      </span>
    </div>
  );
}

function DotMatrix({ reduce }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return undefined;

    const prefersReduce = reduce || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let cols = 0, rows = 0, raf = 0, visible = true, alive = true;
    const start = performance.now();

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(r.width * dpr));
      canvas.height = Math.max(1, Math.round(r.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.max(1, Math.floor(r.width / DOT.gap));
      rows = Math.max(1, Math.floor(r.height / DOT.gap));
    };

    const draw = (now = performance.now()) => {
      if (!alive) return;
      const r = canvas.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      const t = prefersReduce ? 0 : (now - start) / 1000;
      ctx.clearRect(0, 0, r.width, r.height);
      const ox = (r.width - (cols - 1) * DOT.gap) / 2;
      const oy = (r.height - (rows - 1) * DOT.gap) / 2;
      const band = prefersReduce ? cols * 0.62 : (t * 7.6) % (cols + 5);

      for (let c = 0; c < cols; c += 1) {
        for (let row = 0; row < rows; row += 1) {
          const dist = Math.abs(c - band);
          const scan = Math.exp(-(dist * dist) / 8.5);
          const flicker = prefersReduce ? 0 : 0.05 * Math.sin(c * 0.9 + row * 0.7 + t * 5.3);
          const edgeFade = Math.min(1, c / 2.5, (cols - 1 - c) / 2.5);
          const brightness = Math.max(0, Math.min(1, (0.13 + scan * 0.88 + flicker) * edgeFade));
          const mix = scan > 0.16 ? DOT.accent : DOT.ink;
          ctx.fillStyle = `rgba(${mix[0]},${mix[1]},${mix[2]},${0.16 + brightness * 0.76})`;
          ctx.beginPath();
          ctx.arc(ox + c * DOT.gap, oy + row * DOT.gap, DOT.radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (!prefersReduce && visible) raf = requestAnimationFrame(draw);
    };
    const restartDraw = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      if (visible) draw();
    };

    resize();
    draw();

    const onResize = () => { resize(); restartDraw(); };
    window.addEventListener('resize', onResize);
    const observer = typeof IntersectionObserver === 'function'
      ? new IntersectionObserver(([entry]) => {
          visible = entry?.isIntersecting !== false;
          restartDraw();
        })
      : null;
    observer?.observe(canvas);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      observer?.disconnect();
      window.removeEventListener('resize', onResize);
    };
  }, [reduce]);

  return <canvas ref={ref} width="78" height="26" style={{ width: '100%', height: '100%', display: 'block' }} />;
}
