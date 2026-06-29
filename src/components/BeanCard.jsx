// Bean display card -- Modern Coffee Editorial treatment
import { useState } from 'react';
import { Pencil, Snowflake, ChevronDown } from 'lucide-react';
import { C, fonts, type, shadows, radius, cardBase, motion as motionTokens } from '../styles/theme';
import { m, cardPress } from '../lib/motion';
import { getPeakStatus, daysOpen, today, daysBetween, formatDate, lifePct } from '../lib/peakStatus';
import { EditBeanModal } from './EditBeanModal';
import { getBrewMethod } from '../lib/brewMethods';
import { usePreferences } from '../hooks/useUserProfile';
import { summarizeSourceInsights } from '../lib/sourceInsights';

const PeakArc = ({ pct, color, size = 32 }) => {
  const r = size / 2 - 3;
  const circ = 2 * Math.PI * r;
  const dash = circ * Math.min(1, Math.max(0, pct));
  return (
    <svg width={size} height={size}>
      <circle cx={size/2} cy={size/2} r={r} stroke={C.borderLight} strokeWidth="2.5" fill="none"/>
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
  const sourceSummary = summarizeSourceInsights(bean, { maxChars: compact ? 120 : 180 });

  const hasDetails = bean.altitude || bean.region || bean.farm || bean.roastLevel || bean.cupScore || bean.brewingRec || bean.sourcedBy || bean.roastedIn || bean.variety || ps.days !== undefined || dOpen !== null || bean.frozenAt || bean.bagNotes || sourceSummary || grindText || (bean.handBrewRecipe && preferences.brewMethod !== 'aiden');

  const photoHeight = compact ? 180 : 240;

  // Eyebrow label style
  const eyebrowStyle = {
    ...type.label,
    color: C.textLight,
    marginBottom: 3,
  };

  const SpecCell = ({ label, value }) => (
    <div>
      <div style={eyebrowStyle}>{label}</div>
      <div style={{ ...type.body, color: C.text }}>{value || '--'}</div>
    </div>
  );

  return (
    <div style={{
      ...cardBase,
      boxShadow: `${shadows.card}, ${shadows.innerTop}`,
      padding: 0,
      overflow: 'hidden',
      marginBottom: 14,
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
          {/* Status badge overlay — refined pill */}
          <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 2 }}>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              background: ps.bg,
              color: ps.color,
              ...type.caption,
              padding: '4px 10px',
              borderRadius: radius.pill,
              whiteSpace: 'nowrap',
              letterSpacing: '0.04em',
              minHeight: 24,
              border: `1px solid ${ps.color}22`,
              boxShadow: shadows.e1,
            }}>
              {ps.label}
            </span>
          </div>
        </div>
      )}

      <div style={{ padding: compact ? 16 : 20, paddingBottom: actions ? 0 : (compact ? 16 : 20) }}>
        {/* Header row: bean name + icon cluster */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6, gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {bean.roaster && (
              <div style={eyebrowStyle}>
                {bean.roaster}
              </div>
            )}
            <div style={{
              fontFamily: fonts.heading,
              fontSize: compact ? 20 : 24,
              fontWeight: 600,
              color: C.text,
              lineHeight: 1.2,
              letterSpacing: '-0.01em',
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              wordBreak: 'break-word',
            }}>
              {bean.name}
            </div>
            {!bean.photoUrl && (
              <div style={{
                marginTop: 5,
                display: 'inline-flex',
                alignItems: 'center',
                background: ps.bg,
                color: ps.color,
                ...type.caption,
                padding: '3px 9px',
                borderRadius: radius.pill,
                whiteSpace: 'nowrap',
                letterSpacing: '0.04em',
                minHeight: 22,
                border: `1px solid ${ps.color}22`,
              }}>
                {ps.label}
              </div>
            )}
          </div>

          {/* Icon cluster — NO minWidth/minHeight per iOS rule */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} {...(tourTag ? { 'data-tour': tourTag } : {})}>
            <div style={{ position: 'relative', width: 32, height: 32, flexShrink: 0 }}>
              <PeakArc pct={life} color={ps.color} size={32} />
              <div style={{
                position: 'absolute', inset: 0, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                fontFamily: fonts.heading, fontSize: 10, fontWeight: 600, color: ps.color,
              }}>{ps.days != null ? ps.days + 'd' : ''}</div>
            </div>
            {(onLearn || updateBean) && (
              <div style={{ width: 1, height: 18, background: C.hairline, flexShrink: 0 }} />
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {onLearn && (
              <button
                onClick={() => onLearn(bean)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  padding: 4, display: 'flex', alignItems: 'center',
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
                <Snowflake size={14} color={bean.frozenAt ? C.frost : C.textLight} fill={bean.frozenAt ? C.frost : 'none'} />
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
                <Pencil size={14} color={C.textLight} />
              </button>
            )}
            </div>
          </div>
        </div>

        {/* Specs grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: compact ? 10 : 12,
          marginTop: 14,
          marginBottom: 10,
          padding: '14px 16px',
          background: 'rgba(70,41,26,0.035)',
          borderRadius: radius.md,
          border: `1px solid ${C.hairline}`,
        }}>
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
                <div style={eyebrowStyle}>Notes</div>
                <div style={{
                  ...type.body,
                  color: C.text,
                  lineHeight: 1.35,
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
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
              <div style={eyebrowStyle}>Notes</div>
              <div style={{
                ...type.body,
                color: C.text,
                lineHeight: 1.35,
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
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
            <m.button
              onClick={() => setExpanded(!expanded)}
              aria-expanded={expanded}
              {...cardPress}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '10px 0', color: C.accent,
                fontFamily: fonts.body,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              {expanded ? 'Hide details' : 'Show details'}
              <ChevronDown size={12} color={C.accent} style={{
                transform: expanded ? 'rotate(180deg)' : 'rotate(0)',
                transition: `transform 0.25s ${motionTokens.cssOut}`,
              }} />
            </m.button>

            <div style={{
              maxHeight: expanded ? 300 : 0,
              overflow: 'hidden',
              transition: 'max-height 0.25s ease-out, opacity 0.2s ease-out',
              opacity: expanded ? 1 : 0,
            }}>
              <div style={{
                ...type.body,
                color: C.textMuted,
                padding: '10px 14px',
                borderRadius: radius.md,
                background: C.bgDeep,
                border: `1px solid ${C.hairline}`,
                display: 'flex', flexDirection: 'column', gap: 4,
                marginBottom: actions ? 10 : 0,
              }}>
                {bean.variety && <span><strong style={{ color: C.text }}>Variety:</strong> {bean.variety}</span>}
                {bean.process && <span><strong style={{ color: C.text }}>Process:</strong> {bean.process}</span>}
                {ps.days !== undefined && <span><strong style={{ color: C.text }}>Post-roast:</strong> {ps.days}d</span>}
                {dOpen !== null && <span><strong style={{ color: C.text }}>Days open:</strong> {dOpen}d</span>}
                {bean.frozenAt && <span><strong style={{ color: C.text }}>Frozen:</strong> {bean.frozenAt} ({daysBetween(bean.frozenAt, today())}d)</span>}
                {bean.region && <span><strong style={{ color: C.text }}>Region:</strong> {bean.region}</span>}
                {bean.farm && <span><strong style={{ color: C.text }}>Farm:</strong> {bean.farm}</span>}
                {bean.altitude && <span><strong style={{ color: C.text }}>Altitude:</strong> {bean.altitude}</span>}
                {bean.roastLevel && <span><strong style={{ color: C.text }}>Roast Level:</strong> {bean.roastLevel}</span>}
                {bean.cupScore && <span><strong style={{ color: C.text }}>Accolades:</strong> {bean.cupScore}</span>}
                {bean.roastedIn && <span><strong style={{ color: C.text }}>Roasted In:</strong> {bean.roastedIn}</span>}
                {bean.sourcedBy && <span><strong style={{ color: C.text }}>Sourced By:</strong> {bean.sourcedBy}</span>}
                {bean.brewingRec && <span><strong style={{ color: C.text }}>Brewing Rec:</strong> {bean.brewingRec}</span>}
                {sourceSummary && <span><strong style={{ color: C.text }}>Source Insight:</strong> {sourceSummary}</span>}
                {bean.bagNotes && bean.bagNotes !== '(not logged)' && <span><strong style={{ color: C.text }}>Full Notes:</strong> {bean.bagNotes}</span>}
                {grindText && <span><strong style={{ color: C.text }}>Grind:</strong> {grindText}</span>}
                {bean.handBrewRecipe && preferences.brewMethod !== 'aiden' && (
                  <span><strong style={{ color: C.text }}>Last Brew:</strong> {bean.handBrewRecipe.method || 'Pour-over'}, {bean.handBrewRecipe.coffeeGrams}g / {bean.handBrewRecipe.waterGrams}g</span>
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
