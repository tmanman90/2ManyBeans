import { useState, useEffect } from 'react';
import { C, fonts } from '../styles/theme';

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
      {onClose && (
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute', top: 8, right: 12, zIndex: 10,
            width: 36, height: 36, borderRadius: 18,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(59,36,23,0.04)',
            border: 'none', cursor: 'pointer', padding: 0,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke={C.textMuted} strokeWidth="2.2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6l-12 12" />
          </svg>
        </button>
      )}

      <div style={{
        position: 'relative', width: 320, height: 460,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        marginTop: 24, flexShrink: 0,
        overflow: 'hidden',
      }}>
        <video
          src={mascotSrc}
          poster="/images/professor-ruphus.webp"
          autoPlay loop muted playsInline
          aria-label="Professor Ruphus"
          style={{
            height: '100%', width: 'auto', objectFit: 'contain',
            filter: 'drop-shadow(0 6px 14px rgba(59,36,23,0.10))',
            position: 'relative', zIndex: 1,
            WebkitMaskImage: 'radial-gradient(ellipse 75% 55% at center 48%, black 60%, transparent 100%)',
            maskImage: 'radial-gradient(ellipse 75% 55% at center 48%, black 60%, transparent 100%)',
          }}
        />
      </div>

      <div style={{
        marginTop: 6,
        fontFamily: fonts.title, fontSize: 22,
        color: C.accent, letterSpacing: 0.4,
      }}>
        Professor Ruphus
      </div>

      <div style={{
        marginTop: 14, padding: '0 28px',
        fontFamily: fonts.heading, fontSize: 22, lineHeight: 1.25,
        color: C.text, textAlign: 'center', textWrap: 'balance',
      }}>
        Researching your coffee
      </div>

      <div style={{
        marginTop: 12, height: 22,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{
          width: 6, height: 6, borderRadius: 3, background: C.accent,
          animation: 'rlsPulse 1.4s ease-in-out infinite',
        }} />
        <div key={taskIdx} style={{
          fontSize: 14, color: C.textMuted,
          animation: 'rlsFade 0.5s ease-out',
        }}>
          {ROTATING_TASKS[taskIdx]}…
        </div>
      </div>

      <div style={{
        marginTop: 28, width: 260,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
      }}>
        <div style={{
          width: '100%', height: 4, background: C.borderLight,
          borderRadius: 2, overflow: 'hidden',
        }}>
          <div style={{
            height: '100%', width: `${Math.max(0, Math.min(1, pct)) * 100}%`,
            background: `linear-gradient(90deg, ${C.accentLight}, ${C.accent})`,
            borderRadius: 2, transition: 'width 0.4s linear',
          }} />
        </div>
        <div style={{
          fontSize: 12, color: C.textLight, letterSpacing: 0.2,
        }}>
          This usually takes up to 90 seconds
        </div>
      </div>

      <style>{`
        @keyframes rlsPulse {
          0%,100% { transform: scale(1); opacity: 1; }
          50%     { transform: scale(1.6); opacity: 0.5; }
        }
        @keyframes rlsFade {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};
