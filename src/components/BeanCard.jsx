// Bean display card -- journal-page treatment
import { useState } from 'react';
import { Pencil, Snowflake } from 'lucide-react';
import { C, fonts, journalCard } from '../styles/theme';
import { getPeakStatus, daysOpen, today, daysBetween } from '../lib/peakStatus';
import { Badge } from './Badge';
import { EditBeanModal } from './EditBeanModal';

export const BeanCard = ({ bean, actions, compact = false, updateBean, onLearn, uid }) => {
  const [editOpen, setEditOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [freezing, setFreezing] = useState(false);
  const ps = getPeakStatus(bean);
  const dOpen = daysOpen(bean.openDate);

  const hasDetails = bean.altitude || bean.region || bean.farm || bean.roastLevel || bean.cupScore || bean.brewingRec || bean.sourcedBy;

  const photoHeight = compact ? 180 : 240;

  return (
    <div style={{
      ...journalCard,
      padding: 0,
      overflow: 'hidden',
    }}>
      {/* Product shot photo */}
      {bean.photoUrl && (
        <div style={{
          width: '100%',
          height: photoHeight,
          background: '#F0EBE3',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {!imgLoaded && (
            <div style={{
              position: 'absolute', inset: 0,
              background: `linear-gradient(110deg, ${C.bg} 30%, ${C.borderLight} 50%, ${C.bg} 70%)`,
              backgroundSize: '200% 100%',
              animation: 'shimmer 1.5s infinite',
            }} />
          )}
          <img
            src={bean.photoUrl}
            alt={`${bean.name} bag`}
            loading="lazy"
            onLoad={() => setImgLoaded(true)}
            style={{
              width: '100%',
              height: photoHeight,
              objectFit: 'contain',
              objectPosition: 'center',
              display: imgLoaded ? 'block' : 'block',
              opacity: imgLoaded ? 1 : 0,
              transition: 'opacity 0.3s ease',
            }}
          />
          {/* Edge gradients: blend image background into card on all visible edges */}
          <div style={{
            position: 'absolute',
            inset: 0,
            background: [
              `linear-gradient(to right, ${C.card}, transparent 25%)`,
              `linear-gradient(to left, ${C.card}, transparent 25%)`,
              `linear-gradient(to top, ${C.card}, transparent 15%)`,
            ].join(', '),
            pointerEvents: 'none',
          }} />
        </div>
      )}

      <div style={{ padding: compact ? 16 : 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: fonts.heading, fontSize: compact ? 16 : 18, color: C.text, lineHeight: 1.2 }}>
            {bean.name}
          </div>
          <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
            {bean.roaster || 'Unknown'} · {bean.origin || 'Unknown'}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {onLearn && (
            <button
              onClick={() => onLearn(bean)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: 2, display: 'flex', alignItems: 'center',
              }}
              title="Learn about this coffee"
            >
              <img src="/images/professor-ruphus.png" alt="Learn"
                style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover' }} />
            </button>
          )}
          {updateBean && bean.status !== 'FINISHED' && (
            <button
              onClick={async () => {
                if (freezing) return;
                setFreezing(true);
                try {
                  if (bean.frozenAt) {
                    const daysFrozenThisCycle = daysBetween(bean.frozenAt, today());
                    await updateBean(bean.id, {
                      frozenAt: null,
                      frozenDays: (bean.frozenDays || 0) + (daysFrozenThisCycle || 0),
                    });
                  } else {
                    await updateBean(bean.id, { frozenAt: today() });
                  }
                } finally {
                  setFreezing(false);
                }
              }}
              disabled={freezing}
              style={{
                background: 'none', border: 'none', cursor: freezing ? 'default' : 'pointer',
                padding: 4, display: 'flex', alignItems: 'center',
                opacity: freezing ? 0.5 : 1,
              }}
              title={bean.frozenAt ? 'Unfreeze bean' : 'Freeze bean'}
            >
              <Snowflake size={14} color={bean.frozenAt ? C.blue : C.textMuted} fill={bean.frozenAt ? C.blue : 'none'} />
            </button>
          )}
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
        {bean.frozenAt && <span style={{ color: C.blue }}>Frozen {bean.frozenAt} ({daysBetween(bean.frozenAt, today())}d frozen)</span>}
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
              padding: '12px 0', fontSize: 11, color: C.accent,
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
          uid={uid}
        />
      )}
      </div>
    </div>
  );
};
