// ShelfCard — the focal bean card in the Rotation "Shelf" carousel. Flagship-clean:
// the card has ONE job — which bean, how fresh, brew it. Bag hero + peak gauge +
// roaster/name + origin·process, then the action footer. Secondary detail (tasting
// notes, full stat sheet) lives on the tap-through trading card, so the whole card
// always fits on screen. The action footer (Brew + quick actions) comes from parent.
import { useRef } from 'react';
import { ChevronRight } from 'lucide-react';
import { C, fonts, type, radius, shadows, cardBase } from '../styles/theme';
import { getPeakStatus, lifePct } from '../lib/peakStatus';
import { useStrippedBag, bagPhotoFor } from '../lib/stripBg';
import { PeakGauge } from './visual/PeakGauge';

export function ShelfCard({ bean, actions, onOpenDetail }) {
  const ps = getPeakStatus(bean);
  const life = lifePct(bean);
  const bagSrc = useStrippedBag(bagPhotoFor(bean));
  const initial = (bean.name || bean.roaster || '?').trim().charAt(0).toUpperCase();
  const bagRef = useRef(null);
  // Hand the bag's on-screen rect to the parent so the detail card can fly the bag
  // out of exactly this position (manual FLIP — see BeanDetailCard morph).
  const openDetail = () => onOpenDetail?.(bean, bagRef.current?.getBoundingClientRect());

  return (
    <div style={{
      ...cardBase,
      boxShadow: `${shadows.e3}, ${shadows.innerTop}`,
      borderRadius: 28,
      padding: 0,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      height: 448, // fixed so every carousel card is the exact same height
    }}>
      {/* Tappable body → flip detail */}
      <div onClick={openDetail} style={{ cursor: 'pointer', WebkitTapHighlightColor: 'transparent', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {/* Hero image / editorial fallback — grows to absorb slack so there's no dead
            space between short content and the footer (and the bag reads bigger). */}
        <div style={{
          position: 'relative', flex: 1, minHeight: 150, overflow: 'hidden',
          background: `radial-gradient(120% 100% at 50% 0%, ${C.cream} 0%, ${C.bgDeep} 100%)`,
        }}>
          {bean.photoUrl ? (
            <img ref={bagRef} src={bagSrc} alt="" loading="lazy"
              style={{ width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center', padding: '10px 12px 0' }} />
          ) : (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontFamily: fonts.heading, fontStyle: 'italic', fontSize: 150, fontWeight: 600, color: C.accent, opacity: 0.1, lineHeight: 1, userSelect: 'none' }}>{initial}</span>
            </div>
          )}
          <div style={{
            position: 'absolute', top: 14, right: 14, borderRadius: '50%',
            background: 'rgba(255,254,251,0.55)',
            WebkitBackdropFilter: 'saturate(160%) blur(10px)', backdropFilter: 'saturate(160%) blur(10px)',
            boxShadow: shadows.e1, padding: 3,
          }}>
            <PeakGauge pct={life} color={ps.color} days={ps.days} />
          </div>
          <div style={{ position: 'absolute', bottom: 14, left: 18 }}>
            <span style={{ ...type.caption, background: ps.bg, color: ps.color, padding: '5px 12px', borderRadius: radius.pill, border: `1px solid ${ps.color}22`, boxShadow: shadows.e1, letterSpacing: '0.03em' }}>{ps.label}</span>
          </div>
        </div>

        {/* Body — identity only; notes/stats live on the tap-through card */}
        <div style={{ padding: '14px 22px 10px', flexShrink: 0 }}>
          {bean.roaster && <div style={{ ...type.label, color: C.textMuted, marginBottom: 5 }}>{bean.roaster}</div>}
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ ...type.display, fontSize: 27, lineHeight: 1.18, color: C.text, marginBottom: 6, paddingTop: 2, wordBreak: 'break-word', flex: 1, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{bean.name}</div>
            <ChevronRight size={20} color={C.textLight} style={{ flexShrink: 0, marginTop: 4 }} />
          </div>
          <div style={{ ...type.body, color: C.textMuted, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {bean.origin && <span>{bean.origin}</span>}
            {bean.origin && bean.process && <span style={{ color: C.textLight }}>·</span>}
            {bean.process && <span>{bean.process}</span>}
          </div>
        </div>
      </div>

      {actions}
    </div>
  );
}
