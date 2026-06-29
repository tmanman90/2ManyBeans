// PeakTimeline — the freshness-window graphic (degas · peak · fade) with a live
// marker at the bean's current age. Surfaced on the trading-card back (it was
// previously buried in the edit screen). Pure presentational, transform-free.
import { C, fonts } from '../../styles/theme';
import { getPeakStatus, daysSinceRoast } from '../../lib/peakStatus';

export function PeakTimeline({ bean }) {
  if (!bean?.peakStart || !bean?.peakEnd) return null;
  const ps = getPeakStatus(bean);
  const days = daysSinceRoast(bean.roastDate, bean);
  const totalRange = bean.peakEnd + 14;
  const pct = Math.max(0, Math.min(1, (days ?? 0) / totalRange));
  const peakStartPct = bean.peakStart / totalRange;
  const peakEndPct = bean.peakEnd / totalRange;
  const degasPct = (bean.degasMin || 0) / totalRange;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <div style={{ fontFamily: fonts.heading, fontSize: 22, color: ps.color, lineHeight: 1 }}>
            {days != null ? `Day ${days}` : '—'}
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: ps.color, textTransform: 'uppercase', letterSpacing: 0.6 }}>
            {ps.label}
          </div>
        </div>
        <div style={{ fontSize: 10, color: C.textLight, fontFamily: fonts.body }}>
          Peak {bean.peakStart}{'–'}{bean.peakEnd}d
        </div>
      </div>
      <div style={{ position: 'relative', height: 46, marginBottom: 4 }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 18, height: 10, borderRadius: 5, background: C.cardMuted }} />
        <div style={{ position: 'absolute', left: 0, top: 18, height: 10, borderRadius: '5px 0 0 5px', width: `${degasPct * 100}%`, background: '#6B5B95', opacity: 0.18 }} />
        <div style={{ position: 'absolute', top: 14, height: 18, borderRadius: 9, left: `${peakStartPct * 100}%`, width: `${(peakEndPct - peakStartPct) * 100}%`, background: C.green, opacity: 0.25, border: `1px solid ${C.green}` }} />
        <div style={{ position: 'absolute', top: 18, height: 10, left: `${peakStartPct * 100}%`, width: `${(peakEndPct - peakStartPct) * 100}%`, background: `linear-gradient(90deg, ${C.green}, ${C.accentLight})`, opacity: 0.85, borderRadius: 5 }} />
        <div style={{ position: 'absolute', top: 0, left: `${peakStartPct * 100}%`, transform: 'translateX(-50%)', fontSize: 9, color: C.green, fontWeight: 700 }}>{bean.peakStart}d</div>
        <div style={{ position: 'absolute', top: 0, left: `${peakEndPct * 100}%`, transform: 'translateX(-50%)', fontSize: 9, color: C.green, fontWeight: 700 }}>{bean.peakEnd}d</div>
        <div style={{ position: 'absolute', top: 8, left: `${pct * 100}%`, transform: 'translateX(-50%)', width: 2, height: 30, background: ps.color, borderRadius: 1 }} />
        <div style={{ position: 'absolute', top: 2, left: `${pct * 100}%`, transform: 'translateX(-50%)', width: 12, height: 12, borderRadius: '50%', background: C.card, border: `2px solid ${ps.color}`, boxShadow: '0 1px 3px rgba(59,36,23,0.15)' }} />
        <div style={{ position: 'absolute', top: 34, right: 0, fontSize: 9, color: C.textLight }}>+14d</div>
      </div>
    </div>
  );
}
