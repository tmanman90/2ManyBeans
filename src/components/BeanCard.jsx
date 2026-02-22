// Bean display card — ported from prototype lines 235-260
import { C, fonts } from '../styles/theme';
import { getPeakStatus, daysOpen } from '../lib/peakStatus';
import { Badge } from './Badge';

export const BeanCard = ({ bean, actions, compact = false }) => {
  const ps = getPeakStatus(bean);
  const dOpen = daysOpen(bean.openDate);
  return (
    <div style={{
      background: C.card,
      borderRadius: 14,
      padding: compact ? 14 : 18,
      border: `1px solid ${C.border}`,
      marginBottom: 10,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div>
          <div style={{ fontFamily: fonts.title, fontSize: compact ? 16 : 18, color: C.text, lineHeight: 1.2 }}>
            {bean.name}
          </div>
          <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
            {bean.roaster} · {bean.origin}
          </div>
        </div>
        <Badge color={ps.color} bg={ps.bg}>{ps.label}</Badge>
      </div>
      <div style={{ fontSize: 12, color: C.textMuted, display: 'flex', flexWrap: 'wrap', gap: '4px 14px', marginBottom: bean.bagNotes ? 6 : 0 }}>
        <span>{bean.variety} · {bean.process}</span>
        {bean.bagSize && <span>{bean.bagSize}g</span>}
        {bean.roastDate && <span>Roasted {bean.roastDate}</span>}
        {ps.days !== undefined && <span>{ps.days}d post-roast</span>}
        {dOpen !== null && <span style={{ color: C.accent }}>{dOpen}d open</span>}
      </div>
      {bean.bagNotes && bean.bagNotes !== '(not logged)' && (
        <div style={{ fontSize: 12, color: C.accentLight, fontStyle: 'italic', marginBottom: actions ? 10 : 0 }}>
          ☕ {bean.bagNotes}
        </div>
      )}
      {actions && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{actions}</div>}
    </div>
  );
};
