import { useState, useEffect } from 'react';
import { C, fonts, shadows, radius, glass, type as typeScale } from '../styles/theme';
import { assetUrl } from '../lib/assetUrl';

const ROTATING_TASKS = [
  'Locating the roaster',
  'Tracing the origin',
  'Decoding the process',
  'Mapping the flavor profile',
  'Cross-referencing tasting notes',
  'Sniffing out brewing tips',
];

function useTicker(intervalMs = 2400) {
  const [t, setT] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setT(x => x + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return t;
}

function useFakeProgress(seconds = 90) {
  const [start] = useState(() => Date.now());
  const [pct, setPct] = useState(0);
  useEffect(() => {
    let raf;
    const tick = () => {
      const elapsed = (Date.now() - start) / 1000;
      const p = Math.min(1, elapsed / seconds);
      const eased = 1 - Math.pow(1 - p, 1.6);
      setPct(eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    tick();
    return () => raf && cancelAnimationFrame(raf);
  }, [start, seconds]);
  return pct;
}

export const ResearchLoadingScreen = ({
  progress,
  onClose,
  mascotSrc = '/images/ruphus-animations/ruphus-examining-v3.mp4',
}) => {
  const tick = useTicker(2400);
  const taskIdx = tick % ROTATING_TASKS.length;
  const fakePct = useFakeProgress(90);
  const pct = typeof progress === 'number' ? progress : fakePct;

  return (
    <div style={{
      position: 'relative',
      width: '100%', height: '100%',
      background: C.bg,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      fontFamily: fonts.body,
      overflow: 'hidden',
    }}>
      {/* Subtle radial warm glow behind mascot */}
      <div style={{
        position: 'absolute',
        top: 0, left: '50%',
        transform: 'translateX(-50%)',
        width: 340, height: 340,
        borderRadius: '50%',
        background: `radial-gradient(ellipse at center, ${C.accentSoft} 0%, transparent 72%)`,
        opacity: 0.65,
        pointerEvents: 'none',
      }} />

      {/* Close button */}
      {onClose && (
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute', top: 12, right: 14, zIndex: 10,
            width: 44, height: 44, borderRadius: radius.pill,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: glass.chrome,
            border: `1px solid ${C.hairline}`,
            backdropFilter: glass.blur,
            WebkitBackdropFilter: glass.blur,
            cursor: 'pointer', padding: 0,
            boxShadow: shadows.e1,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke={C.textMuted} strokeWidth="2.2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6l-12 12" />
          </svg>
        </button>
      )}

      {/* Mascot video */}
      <div style={{
        position: 'relative', width: 320, height: 440,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        marginTop: 20, flexShrink: 0,
        overflow: 'hidden',
      }}>
        <video
          src={assetUrl(mascotSrc)}
          poster="/images/professor-ruphus.webp"
          autoPlay loop muted playsInline
          aria-label="Professor Ruphus"
          style={{
            height: '100%', width: 'auto', objectFit: 'contain',
            filter: 'drop-shadow(0 8px 20px rgba(59,36,23,0.13))',
            position: 'relative', zIndex: 1,
            WebkitMaskImage: 'radial-gradient(ellipse 75% 55% at center 48%, black 60%, transparent 100%)',
            maskImage: 'radial-gradient(ellipse 75% 55% at center 48%, black 60%, transparent 100%)',
          }}
        />
      </div>

      {/* Name — script accent */}
      <div style={{
        fontFamily: fonts.title,
        fontSize: 22,
        color: C.accent,
        letterSpacing: 0.3,
        marginTop: 2,
        lineHeight: 1.2,
      }}>
        Professor Ruphus
      </div>

      {/* Heading */}
      <div style={{
        marginTop: 12, padding: '0 28px',
        fontFamily: fonts.heading,
        fontSize: 24,
        fontWeight: 600,
        lineHeight: 1.2,
        letterSpacing: '-0.01em',
        color: C.text,
        textAlign: 'center',
      }}>
        Researching your coffee
      </div>

      {/* Rotating task quip */}
      <div style={{
        marginTop: 14, height: 24,
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '0 32px',
      }}>
        {/* Animated dot */}
        <span style={{
          width: 6, height: 6, borderRadius: radius.pill,
          background: C.accent, flexShrink: 0,
          animation: 'rlsPulse 1.4s ease-in-out infinite',
          display: 'block',
        }} />
        <div
          key={taskIdx}
          style={{
            ...typeScale.body,
            color: C.textMuted,
            animation: 'rlsFade 0.5s cubic-bezier(0.22,1,0.36,1)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {ROTATING_TASKS[taskIdx]}…
        </div>
      </div>

      {/* Progress bar */}
      <div style={{
        marginTop: 28, width: 260,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
      }}>
        {/* Bar track */}
        <div style={{
          width: '100%', height: 3,
          background: C.borderLight,
          borderRadius: radius.pill, overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            width: `${Math.max(0, Math.min(1, pct)) * 100}%`,
            background: `linear-gradient(90deg, ${C.accentLight} 0%, ${C.accent} 100%)`,
            borderRadius: radius.pill,
            transition: 'width 0.4s linear',
            boxShadow: `0 0 8px ${C.accent}55`,
          }} />
        </div>

        {/* Helper text */}
        <div style={{
          ...typeScale.caption,
          color: C.textLight,
          letterSpacing: '0.02em',
          textAlign: 'center',
        }}>
          This usually takes up to 90 seconds
        </div>
      </div>

      <style>{`
        @keyframes rlsPulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50%       { transform: scale(1.65); opacity: 0.45; }
        }
        @keyframes rlsFade {
          from { opacity: 0; transform: translateY(5px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};
