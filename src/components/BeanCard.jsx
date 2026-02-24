// Bean display card — journal-page treatment
import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { C, fonts, journalCard } from '../styles/theme';
import { getPeakStatus, daysOpen } from '../lib/peakStatus';
import { Badge } from './Badge';
import { EditBeanModal } from './EditBeanModal';

export const BeanCard = ({ bean, actions, compact = false, updateBean }) => {
  const [editOpen, setEditOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const ps = getPeakStatus(bean);
  const dOpen = daysOpen(bean.openDate);

  const hasDetails = bean.altitude || bean.region || bean.farm || bean.roastLevel || bean.cupScore || bean.brewingRec || bean.sourcedBy;

  return (
    <div style={{
      ...journalCard,
      padding: compact ? 16 : 20,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div>
          <div style={{ fontFamily: fonts.heading, fontSize: compact ? 16 : 18, color: C.text, lineHeight: 1.2 }}>
            {bean.name}
          </div>
          <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
            {bean.roaster} · {bean.origin}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {updateBean && (
            <button
              onClick={() => setEditOpen(true)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: 4, display: 'flex', alignItems: 'center',
              }}
            >
              <Pencil size={14} color={C.textMuted} />
            </button>
          )}
          <Badge color={ps.color} bg={ps.bg}>{ps.label}</Badge>
        </div>
      </div>
      <div style={{ fontSize: 12, color: C.textMuted, display: 'flex', flexWrap: 'wrap', gap: '4px 14px', marginBottom: bean.bagNotes ? 6 : 0 }}>
        <span>{bean.variety} · {bean.process}</span>
        {bean.bagSize && <span>{bean.bagSize}g</span>}
        {bean.roastDate && <span>Roasted {bean.roastDate}</span>}
        {ps.days !== undefined && <span>{ps.days}d post-roast</span>}
        {dOpen !== null && <span style={{ color: C.accent }}>{dOpen}d open</span>}
      </div>
      {bean.bagNotes && bean.bagNotes !== '(not logged)' && (
        <div style={{ fontSize: 12, color: C.accentLight, fontStyle: 'italic', marginBottom: (bean.aidenGrind || hasDetails || actions) ? 6 : 0 }}>
          ☕ {bean.bagNotes}
        </div>
      )}
      {bean.aidenGrind && (
        <div style={{ fontSize: 12, color: C.textMuted, marginBottom: (hasDetails || actions) ? 10 : 0 }}>
          ⚙ Ode Gen 2: SS {bean.aidenGrind.singleServe} / Batch {bean.aidenGrind.batch}
        </div>
      )}

      {/* Expandable details */}
      {hasDetails && (
        <>
          <button
            onClick={() => setExpanded(!expanded)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: 0, fontSize: 11, color: C.accent,
              fontFamily: fonts.body, marginBottom: expanded ? 8 : (actions ? 10 : 0),
            }}
          >
            {expanded ? 'Hide details' : 'Show details'}
          </button>

          {expanded && (
            <div style={{
              fontSize: 12, color: C.textMuted,
              padding: '8px 10px', borderRadius: 8,
              background: C.bg, border: `1px solid ${C.borderLight}`,
              marginBottom: actions ? 10 : 0,
              display: 'flex', flexDirection: 'column', gap: 3,
            }}>
              {bean.region && <span><strong>Region:</strong> {bean.region}</span>}
              {bean.farm && <span><strong>Farm:</strong> {bean.farm}</span>}
              {bean.altitude && <span><strong>Altitude:</strong> {bean.altitude}</span>}
              {bean.roastLevel && <span><strong>Roast Level:</strong> {bean.roastLevel}</span>}
              {bean.cupScore && <span><strong>Cup Score:</strong> {bean.cupScore}</span>}
              {bean.sourcedBy && <span><strong>Sourced By:</strong> {bean.sourcedBy}</span>}
              {bean.brewingRec && (
                <span style={{ marginTop: 2 }}><strong>Brewing Rec:</strong> {bean.brewingRec}</span>
              )}
            </div>
          )}
        </>
      )}

      {actions && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{actions}</div>}

      {updateBean && (
        <EditBeanModal
          open={editOpen}
          onClose={() => setEditOpen(false)}
          bean={bean}
          updateBean={updateBean}
        />
      )}
    </div>
  );
};
