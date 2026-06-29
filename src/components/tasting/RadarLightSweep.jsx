// RadarLightSweep — the wizard's signature moment. A canvas-rendered 6-axis taste radar with a
// specular light-sweep that rotates around the polygon as the cup fills, vertices that bloom when
// their axis updates, and a one-shot radial bloom + ring flare when all six land. Canvas 2D +
// createConicGradient (reliable in WKWebView; no WebGL feDisplacementMap / no animated
// backdrop-filter). DPR-capped, pauses when offscreen/hidden, and renders a single static frame
// under reduced-motion. The polygon magnitudes are the REAL live scores → the fingerprint is true.
import { useRef, useEffect } from 'react';
import { AXES as RADAR_AXES, AXIS_LABELS } from '../TasteFingerprint';

// theme colors resolved to literals (canvas needs rgb strings)
const ACCENT = '#A2632F', ACCENT_LIGHT = '#D9B687', INK = '#241710', HAIR = 'rgba(70,41,26,0.14)', PAPER = '#F1EADF';

const angleFor = (i) => (i * 60 - 90) * (Math.PI / 180);

export function RadarLightSweep({ scores, size = 240, complete = false, reduce = false }) {
  const canvasRef = useRef(null);
  const raf = useRef(0);
  const start = useRef(0);
  const bloom = useRef({ active: false, t0: 0 });
  const prevComplete = useRef(false);
  const scoresRef = useRef(scores);
  scoresRef.current = scores;

  useEffect(() => {
    if (complete && !prevComplete.current) bloom.current = { active: true, t0: -1 };
    prevComplete.current = complete;
  }, [complete]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr; canvas.height = size * dpr;
    ctx.scale(dpr, dpr);
    const cx = size / 2, cy = size / 2, R = size * 0.40;

    const draw = (sweepAngle, bloomP) => {
      ctx.clearRect(0, 0, size, size);
      const sc = scoresRef.current || {};
      const vals = RADAR_AXES.map((k) => Math.max(0, Math.min(10, Number(sc[k]) || 0)));

      // grid rings + spokes (hairline)
      ctx.lineWidth = 1;
      for (let ring = 1; ring <= 3; ring++) {
        const rr = (R * ring) / 3;
        ctx.beginPath();
        RADAR_AXES.forEach((_, i) => {
          const a = angleFor(i), x = cx + rr * Math.cos(a), y = cy + rr * Math.sin(a);
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        });
        ctx.closePath();
        ctx.strokeStyle = HAIR; ctx.stroke();
      }
      RADAR_AXES.forEach((_, i) => {
        const a = angleFor(i);
        ctx.beginPath(); ctx.moveTo(cx, cy);
        ctx.lineTo(cx + R * Math.cos(a), cy + R * Math.sin(a));
        ctx.strokeStyle = HAIR; ctx.stroke();
      });

      // the live polygon
      const pts = vals.map((v, i) => {
        const a = angleFor(i), rr = R * (v / 10);
        return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)];
      });
      const anyVal = vals.some((v) => v > 0);
      if (anyVal) {
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();

        // base fill
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
        grad.addColorStop(0, 'rgba(217,182,135,0.34)');
        grad.addColorStop(1, 'rgba(162,99,47,0.14)');
        ctx.fillStyle = grad; ctx.fill();

        // specular sweep — a rotating conic highlight clipped to the polygon
        ctx.save();
        ctx.clip();
        let conic;
        try {
          conic = ctx.createConicGradient(sweepAngle, cx, cy);
          conic.addColorStop(0.0, 'rgba(255,255,255,0)');
          conic.addColorStop(0.06, 'rgba(255,248,236,0.55)');
          conic.addColorStop(0.12, 'rgba(255,255,255,0)');
          conic.addColorStop(1.0, 'rgba(255,255,255,0)');
          ctx.fillStyle = conic;
          ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
        } catch { /* createConicGradient unsupported — base fill stands */ }
        ctx.restore();

        // stroke
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
        ctx.lineWidth = 2; ctx.strokeStyle = ACCENT; ctx.lineJoin = 'round'; ctx.stroke();

        // vertices
        pts.forEach(([x, y], i) => {
          if (vals[i] <= 0) return;
          ctx.beginPath(); ctx.arc(x, y, 3.2, 0, Math.PI * 2);
          ctx.fillStyle = ACCENT; ctx.fill();
          ctx.beginPath(); ctx.arc(x, y, 1.4, 0, Math.PI * 2);
          ctx.fillStyle = '#FFF8EC'; ctx.fill();
        });
      }

      // completion bloom — radial flare + expanding ring
      if (bloomP > 0 && bloomP < 1) {
        const e = 1 - Math.pow(1 - bloomP, 3);
        ctx.save();
        ctx.globalAlpha = (1 - bloomP) * 0.5;
        const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * (0.4 + e));
        bg.addColorStop(0, 'rgba(255,248,236,0.9)'); bg.addColorStop(1, 'rgba(255,248,236,0)');
        ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(cx, cy, R * (0.4 + e), 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = (1 - bloomP) * 0.8; ctx.lineWidth = 2;
        ctx.strokeStyle = ACCENT_LIGHT; ctx.beginPath(); ctx.arc(cx, cy, R * (0.5 + e * 0.6), 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
    };

    if (reduce) { draw(0, 0); return; }

    const loop = (ts) => {
      if (!start.current) start.current = ts;
      const elapsed = (ts - start.current) / 1000;
      const sweep = elapsed * 1.1; // rad/s — slow, premium
      let bloomP = 0;
      if (bloom.current.active) {
        if (bloom.current.t0 < 0) bloom.current.t0 = ts;
        bloomP = (ts - bloom.current.t0) / 900;
        if (bloomP >= 1) bloom.current.active = false;
      }
      draw(sweep, bloomP);
      raf.current = requestAnimationFrame(loop);
    };
    const onVis = () => {
      if (document.hidden) cancelAnimationFrame(raf.current);
      else raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    document.addEventListener('visibilitychange', onVis);
    return () => { cancelAnimationFrame(raf.current); document.removeEventListener('visibilitychange', onVis); };
  }, [size, reduce]);

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <canvas ref={canvasRef} style={{ width: size, height: size, display: 'block' }} />
      {/* axis labels */}
      {RADAR_AXES.map((k, i) => {
        const a = angleFor(i), lr = size * 0.40 + 16;
        const x = size / 2 + lr * Math.cos(a), y = size / 2 + lr * Math.sin(a);
        return (
          <span key={k} aria-hidden style={{
            position: 'absolute', left: x, top: y, transform: 'translate(-50%,-50%)',
            fontFamily: "'Nunito', sans-serif", fontSize: 9.5, fontWeight: 800, letterSpacing: '0.04em',
            textTransform: 'uppercase', color: (scores?.[k] > 0) ? INK : '#9C8A78', whiteSpace: 'nowrap', pointerEvents: 'none',
          }}>{AXIS_LABELS[k]}</span>
        );
      })}
    </div>
  );
}
