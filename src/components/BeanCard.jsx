// Bean display card -- journal-page treatment
import { useState } from 'react';
import { Pencil, Snowflake, ChevronDown } from 'lucide-react';
import { C, fonts, journalCard } from '../styles/theme';
import { getPeakStatus, daysOpen, today, daysBetween, formatDate, lifePct } from '../lib/peakStatus';
import { EditBeanModal } from './EditBeanModal';
import { getBrewMethod } from '../lib/brewMethods';
import { usePreferences } from '../hooks/useUserProfile';

const PeakArc = ({ pct, color, size = 32 }) => {
  const r = size / 2 - 3;
  const circ = 2 * Math.PI * r;
  const dash = circ * Math.min(1, Math.max(0, pct));
  return (
    <svg width={size} height={size}>
      <circle cx={size/2} cy={size/2} r={r} stroke="#EDE6DC" strokeWidth="2.5" fill="none"/>
      <circle cx={size/2} cy={size/2} r={r} stroke={color} strokeWidth="2.5" fill="none"
        strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`}/>
    </svg>
  );
};

// NOTE: intentionally NOT wrapped in React.memo. A previous memo with a
// custom comparator that skipped the `actions` prop (because it's inline JSX
// and changes every render) introduced a correctness bug: when preferences
// like brewMethod changed, RotationTab correctly rebuilt the `actions` JSX
// with a new BrewButton label, but the memo skipped the re-render because
// the comparator didn't see `actions` as different, leaving the old button
// visible. React's default rendering is fast enough here -- BeanCard has
// no heavy work inside it and the visible list is short (3 active beans
// + a few inventory rows at a time).
export const BeanCard = ({ bean, actions, compact = false, updateBean, deleteBean, onLearn, uid, tourTag }) => {
  const { preferences } = usePreferences();
  const brewMethod = getBrewMethod(preferences.brewMethod);
  const [editOpen, setEditOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [freezing, setFreezing] = useState(false);
  const ps = getPeakStatus(bean);
  const life = lifePct(bean);
  const dOpen = daysOpen(bean.openDate);

  const grindText = brewMethod.grindLabel(bean, preferences);

  const displayNotes = bean.bagNotes && bean.bagNotes !== '(not logged)'
    ? (bean.notesSummary || bean.bagNotes)
    : null;

  const hasDetails = bean.altitude || bean.region || bean.farm || bean.roastLevel || bean.cupScore || bean.brewingRec || bean.sourcedBy || bean.roastedIn || bean.variety || ps.days !== undefined || dOpen !== null || bean.frozenAt || bean.bagNotes || grindText || (bean.handBrewRecipe && preferences.brewMethod !== 'aiden');

  const photoHeight = compact ? 180 : 240;

  const SpecCell = ({ label, value }) => (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.textLight, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, color: C.text }}>{value || '--'}</div>
    </div>
  );

  return (
    <div style={{
      ...journalCard,
      padding: 0,
      overflow: 'hidden',
    }}>
      {/* Product shot photo — edge gradients blend into card */}
      {bean.photoUrl && (
        <div style={{
          width: '100%',
          height: photoHeight,
          background: C.card,
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
              opacity: imgLoaded ? 1 : 0,
              transition: 'opacity 0.3s ease',
            }}
          />
          <div style={{
            position: 'absolute',
            inset: 0,
            background: [
              `linear-gradient(to right, ${C.card}, transparent 35%)`,
              `linear-gradient(to left, ${C.card}, transparent 35%)`,
              `linear-gradient(to top, ${C.card}, transparent 20%)`,
            ].join(', '),
            pointerEvents: 'none',
          }} />
          {/* Status badge overlay */}
          <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 2 }}>
            <span style={{
              background: ps.bg, color: ps.color,
              fontSize: 11, fontWeight: 600, padding: '3px 10px',
              borderRadius: 99, whiteSpace: 'nowrap', letterSpacing: 0.3,
            }}>
              {ps.label}
            </span>
          </div>
        </div>
      )}

      <div style={{ padding: compact ? 16 : 20, paddingBottom: actions ? 0 : (compact ? 16 : 20) }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6, gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {bean.roaster && (
            <div style={{ fontSize: 10, fontWeight: 700, color: C.textLight, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>
              {bean.roaster}
            </div>
          )}
          <div style={{
            fontFamily: fonts.heading, fontSize: compact ? 18 : 22, color: C.text, lineHeight: 1.25,
            overflow: 'hidden', display: '-webkit-box',
            WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            wordBreak: 'break-word',
          }}>
            {bean.name}
          </div>
          {!bean.photoUrl && (
            <div style={{ marginTop: 4, fontSize: 11, fontWeight: 700, color: ps.color, letterSpacing: 0.4, textTransform: 'uppercase' }}>
              {ps.label}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} {...(tourTag ? { 'data-tour': tourTag } : {})}>
          <div style={{ position: 'relative', width: 32, height: 32, flexShrink: 0 }}>
            <PeakArc pct={life} color={ps.color} size={32} />
            <div style={{
              position: 'absolute', inset: 0, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              fontFamily: fonts.heading, fontSize: 10, fontWeight: 600, color: ps.color,
            }}>{ps.days != null ? ps.days + 'd' : ''}</div>
          </div>
          {onLearn && (
            <button
              onClick={() => onLearn(bean)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: 2, display: 'flex', alignItems: 'center',
              }}
              title="Learn about this coffee"
            >
              <img src="/images/professor-ruphus.webp" alt="Learn"
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
        </div>
      </div>
      {/* Specs grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: compact ? 8 : 10, marginTop: 12, marginBottom: 10 }}>
        {/* Row 1: Origin + Process - skip if both empty */}
        {(bean.origin || bean.process) && <>
          <SpecCell label="Origin" value={bean.origin} />
          <SpecCell label="Process" value={bean.process} />
        </>}

        {/* Row 2: varies by mode */}
        {compact ? (
          /* Compact: Roast Date + Notes */
          (bean.roastDate || displayNotes) ? <>
            <SpecCell label="Roast Date" value={formatDate(bean.roastDate)} />
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.textLight, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Notes</div>
              <div style={{
                fontSize: 13, color: C.text, lineHeight: 1.35,
                overflow: 'hidden', display: '-webkit-box',
                WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
              }}>
                {displayNotes || '--'}
              </div>
            </div>
          </> : null
        ) : (
          /* Full: Roast Date + Weight */
          (bean.roastDate || bean.bagSize) ? <>
            <SpecCell label="Roast Date" value={formatDate(bean.roastDate)} />
            <SpecCell label="Weight" value={bean.bagSize ? `${bean.bagSize}g` : null} />
          </> : null
        )}

        {/* Row 3: Notes + Grind (full mode only) */}
        {!compact && (displayNotes || grindText) && <>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.textLight, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Notes</div>
            <div style={{
              fontSize: 13, color: C.text, lineHeight: 1.35,
              overflow: 'hidden', display: '-webkit-box',
              WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            }}>
              {displayNotes || '--'}
            </div>
          </div>
          <SpecCell label="Grind" value={grindText} />
        </>}
      </div>

      {/* Expandable details */}
      {hasDetails && (
        <>
          <button
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '10px 0', fontSize: 11, color: C.accent,
              fontFamily: fonts.body,
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            {expanded ? 'Hide details' : 'Show details'}
            <ChevronDown size={12} color={C.accent} style={{
              transform: expanded ? 'rotate(180deg)' : 'rotate(0)',
              transition: 'transform 0.25s ease-out',
            }} />
          </button>

          <div style={{
            maxHeight: expanded ? 300 : 0,
            overflow: 'hidden',
            transition: 'max-height 0.25s ease-out, opacity 0.2s ease-out',
            opacity: expanded ? 1 : 0,
          }}>
            <div style={{
              fontSize: 12, color: C.textMuted,
              padding: '8px 10px', borderRadius: 8,
              background: C.bg,
              display: 'flex', flexDirection: 'column', gap: 3,
              marginBottom: actions ? 10 : 0,
            }}>
              {bean.variety && <span><strong>Variety:</strong> {bean.variety}</span>}
              {bean.process && <span><strong>Process:</strong> {bean.process}</span>}
              {ps.days !== undefined && <span><strong>Post-roast:</strong> {ps.days}d</span>}
              {dOpen !== null && <span><strong>Days open:</strong> {dOpen}d</span>}
              {bean.frozenAt && <span><strong>Frozen:</strong> {bean.frozenAt} ({daysBetween(bean.frozenAt, today())}d)</span>}
              {bean.region && <span><strong>Region:</strong> {bean.region}</span>}
              {bean.farm && <span><strong>Farm:</strong> {bean.farm}</span>}
              {bean.altitude && <span><strong>Altitude:</strong> {bean.altitude}</span>}
              {bean.roastLevel && <span><strong>Roast Level:</strong> {bean.roastLevel}</span>}
              {bean.cupScore && <span><strong>Accolades:</strong> {bean.cupScore}</span>}
              {bean.roastedIn && <span><strong>Roasted In:</strong> {bean.roastedIn}</span>}
              {bean.sourcedBy && <span><strong>Sourced By:</strong> {bean.sourcedBy}</span>}
              {bean.brewingRec && <span><strong>Brewing Rec:</strong> {bean.brewingRec}</span>}
              {bean.bagNotes && bean.bagNotes !== '(not logged)' && <span><strong>Full Notes:</strong> {bean.bagNotes}</span>}
              {grindText && <span><strong>Grind:</strong> {grindText}</span>}
              {bean.handBrewRecipe && preferences.brewMethod !== 'aiden' && (
                <span><strong>Last Brew:</strong> {bean.handBrewRecipe.method || 'Pour-over'}, {bean.handBrewRecipe.coffeeGrams}g / {bean.handBrewRecipe.waterGrams}g</span>
              )}
            </div>
          </div>
        </>
      )}

      {updateBean && (
        <EditBeanModal
          open={editOpen}
          onClose={() => setEditOpen(false)}
          bean={bean}
          updateBean={updateBean}
          deleteBean={deleteBean}
          uid={uid}
        />
      )}
      </div>
      {actions}
    </div>
  );
};
