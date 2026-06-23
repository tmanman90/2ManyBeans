// Archive tab — "Modern Coffee Editorial" redesign.
// Fraunces display header, Unforgettable Cups hero strip, glass filter bar,
// timeline-rail list grouped by year, bean detail bottom sheet.
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Search, X, ChevronDown, SlidersHorizontal, Sparkles } from 'lucide-react';
import { C, fonts, type, shadows, radius, glass, motion as motionTokens } from '../styles/theme';
import { m, listContainer, listItem, fadeUp, spring } from '../lib/motion';
import { BeanThumb } from '../components/BeanThumb';
import { ArchiveDetailSheet } from '../components/ArchiveDetailSheet';
import { ProfessorRuphusSlideUp } from '../components/ProfessorRuphusSlideUp';
import { useProfessorRuphus } from '../hooks/useProfessorRuphus';

const EditBeanModalLazy = lazy(() => import('../components/EditBeanModal').then(m => ({ default: m.EditBeanModal })));

const SORT_LABELS = {
  recent: 'Recent',
  oldest: 'Oldest',
  rating: 'Highest rated',
  duration: 'Longest owned',
};

function yearOf(dateStr) {
  return (dateStr || '').slice(0, 4);
}

function monthOf(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d)) return '';
  return d.toLocaleDateString('en-US', { month: 'short' });
}

function diffDays(laterStr, earlierStr) {
  if (!laterStr || !earlierStr) return null;
  const a = new Date(laterStr + 'T00:00:00');
  const b = new Date(earlierStr + 'T00:00:00');
  if (isNaN(a) || isNaN(b)) return null;
  const days = Math.round((a - b) / 86400000);
  return days >= 0 ? days : null;
}

// Eyebrow label helper
const eyebrowStyle = {
  ...type.label,
  color: C.textMuted,
};

function Stars({ value, size = 11 }) {
  if (!value) return null;
  return (
    <span
      style={{ display: 'inline-flex', gap: 2, alignItems: 'center' }}
      role="img"
      aria-label={`${value} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map(n => (
        <svg key={n} width={size} height={size} viewBox="0 0 24 24" style={{ display: 'block' }}>
          <path
            d="M12 2l2.9 6.9L22 10l-5.5 4.8L18.2 22 12 18.3 5.8 22l1.7-7.2L2 10l7.1-1.1z"
            fill={n <= value ? C.accent : 'none'}
            stroke={n <= value ? C.accent : C.accentLight}
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      ))}
    </span>
  );
}

function NotesRow({ notes }) {
  if (!notes) return null;
  const parts = notes.split(/[,·/]/).map(s => s.trim()).filter(Boolean).slice(0, 3);
  if (parts.length === 0) return null;
  return (
    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
      {parts.map((p, i) => (
        <span
          key={i}
          style={{
            ...type.caption,
            color: C.textMuted,
            fontStyle: 'italic',
            background: C.accentSoft,
            border: `1px solid ${C.hairline}`,
            padding: '3px 9px',
            borderRadius: radius.pill,
            whiteSpace: 'nowrap',
            fontFamily: fonts.body,
          }}
        >
          {p}
        </span>
      ))}
    </div>
  );
}

function Chip({ label, active, onClick, count }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        minHeight: 36,
        padding: '7px 13px',
        borderRadius: radius.pill,
        border: `1px solid ${active ? C.accent : C.border}`,
        background: active ? C.accent : C.cream,
        color: active ? C.cream : C.text,
        fontFamily: fonts.body,
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        boxShadow: active ? shadows.button : 'none',
        transition: `all ${motionTokens.dur.fast}s ${motionTokens.cssOut}`,
      }}
    >
      <span>{label}</span>
      {count != null && (
        <span
          style={{
            fontSize: 10,
            fontWeight: 800,
            padding: '1px 5px',
            background: active ? 'rgba(255,255,255,0.22)' : C.accentSoft,
            color: active ? C.cream : C.accent,
            borderRadius: radius.pill,
            marginLeft: 2,
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function SelectField({ label, value, onChange, options }) {
  const isActive = value !== 'all';
  return (
    <div>
      <div style={{ ...eyebrowStyle, marginBottom: 6 }}>{label}</div>
      <div style={{ position: 'relative' }}>
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{
            width: '100%',
            appearance: 'none',
            WebkitAppearance: 'none',
            padding: '10px 28px 10px 12px',
            borderRadius: radius.md,
            border: `1px solid ${isActive ? C.accent : C.border}`,
            background: isActive ? C.accentSoft : C.cream,
            fontFamily: fonts.body,
            fontSize: 16,
            fontWeight: 600,
            color: C.text,
            cursor: 'pointer',
          }}
        >
          <option value="all">All</option>
          {options.map(o => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <ChevronDown
          size={14}
          style={{
            position: 'absolute',
            right: 10,
            top: '50%',
            transform: 'translateY(-50%)',
            color: C.textMuted,
            pointerEvents: 'none',
          }}
        />
      </div>
    </div>
  );
}

function EmptyState({ hasFilters, onClear }) {
  return (
    <div
      style={{
        padding: '44px 24px',
        textAlign: 'center',
        background: C.cream,
        border: `1px dashed ${C.border}`,
        borderRadius: radius.lg,
        margin: '12px 0',
      }}
    >
      {!hasFilters && (
        <video
          src="/images/ruphus-animations/ruphus-empty-cup.mp4"
          autoPlay muted loop playsInline
          style={{
            width: 200, height: 200, objectFit: 'contain', margin: '0 auto 8px',
            display: 'block',
            WebkitMaskImage: 'radial-gradient(ellipse 75% 55% at center 48%, black 60%, transparent 100%)',
            maskImage: 'radial-gradient(ellipse 75% 55% at center 48%, black 60%, transparent 100%)',
          }}
        />
      )}
      <div
        style={{
          fontFamily: fonts.heading,
          fontSize: 22,
          fontWeight: 600,
          color: C.accentDark,
          marginBottom: 6,
          letterSpacing: '-0.01em',
        }}
      >
        {hasFilters ? 'nothing in this corner' : 'no beans yet'}
      </div>
      <div style={{ ...type.body, color: C.textMuted, lineHeight: 1.55, marginBottom: 16 }}>
        {hasFilters
          ? 'Try loosening a filter, your other beans are still here.'
          : 'When you finish a bean it lands here.'}
      </div>
      {hasFilters && (
        <button
          onClick={onClear}
          style={{
            padding: '11px 22px',
            minHeight: 44,
            border: `1px solid ${C.accent}`,
            background: C.accentSoft,
            color: C.accent,
            fontFamily: fonts.body,
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: 0.3,
            borderRadius: radius.pill,
            cursor: 'pointer',
          }}
        >
          Clear filters
        </button>
      )}
    </div>
  );
}

function TimelineRow({ bean, bestByBean, showMonth, onOpen }) {
  const best = bestByBean[bean.id] || null;
  const dOwn = diffDays(bean.finishDate, bean.roastDate);
  const [expanded, setExpanded] = useState(false);

  const hasDetails = bean.variety || bean.region || bean.farm || bean.altitude || bean.roastLevel || bean.cupScore;

  const handleKey = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen();
    }
  };

  return (
    <m.div
      variants={listItem}
      style={{ position: 'relative', marginBottom: 10 }}
    >
      {/* Timeline dot */}
      <div
        style={{
          position: 'absolute',
          left: -11,
          top: 24,
          width: 11,
          height: 11,
          borderRadius: '50%',
          background: best >= 5 ? C.accent : C.cream,
          border: `2px solid ${best >= 5 ? C.accent : C.accentLight}`,
          boxShadow: best >= 5 ? shadows.navActive : shadows.e1,
          zIndex: 1,
        }}
      />
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={handleKey}
        style={{
          width: '100%',
          textAlign: 'left',
          display: 'flex',
          flexDirection: 'column',
          padding: 14,
          minHeight: 44,
          background: C.cream,
          border: `1px solid ${C.borderLight}`,
          borderRadius: radius.md,
          cursor: 'pointer',
          boxShadow: shadows.e1,
          fontFamily: fonts.body,
          position: 'relative',
          transition: `box-shadow ${motionTokens.dur.fast}s ${motionTokens.cssOut}`,
        }}
      >
        <div style={{ display: 'flex', gap: 12 }}>
          <BeanThumb bean={bean} size={56} />
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Roaster eyebrow + month */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
              <div
                style={{
                  ...eyebrowStyle,
                  fontSize: 10,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {bean.roaster || ''}
              </div>
              {showMonth && bean.finishDate && (
                <div
                  style={{
                    fontFamily: fonts.body,
                    fontSize: 11,
                    fontWeight: 700,
                    color: C.textLight,
                    lineHeight: 1,
                    whiteSpace: 'nowrap',
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                  }}
                >
                  {monthOf(bean.finishDate)}
                </div>
              )}
            </div>
            {/* Bean name in Fraunces */}
            <div
              style={{
                fontFamily: fonts.heading,
                fontSize: 16,
                color: C.text,
                fontWeight: 600,
                lineHeight: 1.2,
                letterSpacing: '-0.01em',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                marginTop: 2,
                marginBottom: 4,
              }}
            >
              {bean.name}
            </div>
            {/* Meta line */}
            <div style={{ ...type.caption, color: C.textMuted, marginBottom: 7, lineHeight: 1.4 }}>
              {bean.origin || ''}
              {bean.process ? ` · ${bean.process}` : ''}
              {dOwn != null ? ` · ${dOwn}d` : ''}
            </div>
            <NotesRow notes={bean.bagNotes} />
            {best ? (
              <div style={{ marginTop: 7 }}>
                <Stars value={best} size={11} />
              </div>
            ) : null}
          </div>
        </div>

        {hasDetails && (
          <>
            <button
              onClick={e => { e.stopPropagation(); setExpanded(!expanded); }}
              aria-expanded={expanded}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '9px 0 0',
                display: 'flex', alignItems: 'center', gap: 5,
                fontFamily: fonts.body,
                fontSize: 11,
                fontWeight: 700,
                color: C.accent,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                minHeight: 44,
              }}
            >
              {expanded ? 'Hide details' : 'Show details'}
              <ChevronDown size={12} color={C.accent} style={{
                transform: expanded ? 'rotate(180deg)' : 'rotate(0)',
                transition: `transform ${motionTokens.dur.base}s ${motionTokens.cssOut}`,
              }} />
            </button>
            <div style={{
              maxHeight: expanded ? 180 : 0,
              overflow: 'hidden',
              transition: `max-height ${motionTokens.dur.base}s ${motionTokens.cssOut}, opacity ${motionTokens.dur.fast}s ${motionTokens.cssOut}`,
              opacity: expanded ? 1 : 0,
            }}>
              <div style={{
                ...type.body,
                color: C.textMuted,
                padding: '10px 12px',
                borderRadius: radius.sm,
                background: C.bgDeep,
                border: `1px solid ${C.hairline}`,
                display: 'flex', flexDirection: 'column', gap: 4,
                marginTop: 6,
              }}>
                {bean.variety && <span><strong style={{ color: C.text }}>Variety:</strong> {bean.variety}</span>}
                {bean.region && <span><strong style={{ color: C.text }}>Region:</strong> {bean.region}</span>}
                {bean.farm && <span><strong style={{ color: C.text }}>Farm:</strong> {bean.farm}</span>}
                {bean.altitude && <span><strong style={{ color: C.text }}>Altitude:</strong> {bean.altitude}</span>}
                {bean.roastLevel && <span><strong style={{ color: C.text }}>Roast Level:</strong> {bean.roastLevel}</span>}
                {bean.cupScore && <span><strong style={{ color: C.text }}>Accolades:</strong> {bean.cupScore}</span>}
              </div>
            </div>
          </>
        )}
      </div>
    </m.div>
  );
}

export const ArchiveTab = ({ beans, tastings = [], updateBean, deleteBean, getBeanById, uid, isDemo, onDemoAction }) => {
  const [query, setQuery] = useState('');
  const [year, setYear] = useState('all');
  const [sort, setSort] = useState('recent');
  const [minRating, setMinRating] = useState(0);
  const [roaster, setRoaster] = useState('all');
  const [origin, setOrigin] = useState('all');
  const [process, setProcess] = useState('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [openBeanId, setOpenBeanId] = useState(null);
  const [editBean, setEditBean] = useState(null);

  const openBean = useMemo(
    () => openBeanId ? beans.find(b => b.id === openBeanId) ?? null : null,
    [beans, openBeanId]
  );

  useEffect(() => {
    if (openBeanId && !openBean) setOpenBeanId(null);
  }, [openBeanId, openBean]);

  const { handleLearn, ruphusProps } = useProfessorRuphus(updateBean, tastings, getBeanById);

  const finished = useMemo(
    () => beans.filter(b => b.status === 'FINISHED'),
    [beans]
  );

  const bestByBean = useMemo(() => {
    const m = {};
    tastings.forEach(t => {
      if (t.rating && (!m[t.beanId] || t.rating > m[t.beanId])) {
        m[t.beanId] = t.rating;
      }
    });
    return m;
  }, [tastings]);

  const years = useMemo(
    () => [...new Set(finished.map(b => yearOf(b.finishDate)).filter(Boolean))].sort().reverse(),
    [finished]
  );
  const roasters = useMemo(
    () => [...new Set(finished.map(b => b.roaster).filter(Boolean))].sort(),
    [finished]
  );
  const origins = useMemo(
    () => [...new Set(finished.map(b => b.origin).filter(Boolean))].sort(),
    [finished]
  );
  const processes = useMemo(
    () => [...new Set(finished.map(b => b.process).filter(Boolean))].sort(),
    [finished]
  );

  const filtered = useMemo(() => {
    const list = finished.filter(b => {
      if (year !== 'all' && yearOf(b.finishDate) !== year) return false;
      if (roaster !== 'all' && b.roaster !== roaster) return false;
      if (origin !== 'all' && b.origin !== origin) return false;
      if (process !== 'all' && b.process !== process) return false;
      if (minRating > 0 && (bestByBean[b.id] || 0) < minRating) return false;
      if (query) {
        const q = query.toLowerCase();
        const hay = `${b.name || ''} ${b.roaster || ''} ${b.origin || ''} ${b.bagNotes || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    if (sort === 'recent') list.sort((a, b) => (b.finishDate || '').localeCompare(a.finishDate || ''));
    if (sort === 'oldest') list.sort((a, b) => (a.finishDate || '').localeCompare(b.finishDate || ''));
    if (sort === 'rating') {
      list.sort((a, b) => {
        const diff = (bestByBean[b.id] || 0) - (bestByBean[a.id] || 0);
        if (diff !== 0) return diff;
        return (b.finishDate || '').localeCompare(a.finishDate || '');
      });
    }
    if (sort === 'duration') {
      list.sort(
        (a, b) =>
          (diffDays(b.finishDate, b.roastDate) || 0) - (diffDays(a.finishDate, a.roastDate) || 0)
      );
    }
    return list;
  }, [finished, query, year, sort, minRating, roaster, origin, process, bestByBean]);

  const grouped = useMemo(() => {
    if (sort !== 'recent' && sort !== 'oldest') return [{ key: null, items: filtered }];
    const map = {};
    filtered.forEach(b => {
      const y = yearOf(b.finishDate) || 'Unknown';
      if (!map[y]) map[y] = [];
      map[y].push(b);
    });
    const keys = Object.keys(map);
    if (sort === 'recent') keys.sort().reverse();
    else keys.sort();
    return keys.map(k => ({ key: k, items: map[k] }));
  }, [filtered, sort]);

  const bestCups = useMemo(
    () =>
      finished
        .filter(b => bestByBean[b.id] === 5)
        .sort((a, b) => (b.finishDate || '').localeCompare(a.finishDate || ''))
        .slice(0, 5),
    [finished, bestByBean]
  );

  const filtersActive =
    (year !== 'all' ? 1 : 0) +
    (roaster !== 'all' ? 1 : 0) +
    (origin !== 'all' ? 1 : 0) +
    (process !== 'all' ? 1 : 0) +
    (minRating > 0 ? 1 : 0) +
    (query ? 1 : 0);

  const clearFilters = () => {
    setQuery('');
    setYear('all');
    setMinRating(0);
    setRoaster('all');
    setOrigin('all');
    setProcess('all');
  };

  const totalCups = useMemo(() => {
    const finishedIds = new Set(finished.map(b => b.id));
    return tastings.filter(t => finishedIds.has(t.beanId)).length;
  }, [finished, tastings]);

  const handleRestore = (bean) => {
    updateBean(bean.id, { status: 'SEALED', finishDate: null });
  };

  const handleDelete = (bean) => {
    if (deleteBean) deleteBean(bean.id);
  };

  return (
    <div style={{ background: C.bg, fontFamily: fonts.body, color: C.text }}>

      {/* ── Editorial header ─────────────────────────────────────── */}
      <div
        style={{
          position: 'relative',
          padding: '24px 20px 20px',
          background: `linear-gradient(170deg, ${C.amberBg} 0%, ${C.bg} 80%)`,
          borderBottom: `1px solid ${C.hairline}`,
          overflow: 'hidden',
        }}
      >
        {/* Ambient glow orb */}
        <div
          style={{
            position: 'absolute',
            top: -10,
            right: -30,
            width: 180,
            height: 120,
            opacity: 0.35,
            background: `radial-gradient(ellipse, ${C.accentLight} 0%, transparent 65%)`,
            borderRadius: '50%',
            pointerEvents: 'none',
          }}
        />

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            position: 'relative',
          }}
        >
          {/* Left: title block */}
          <div>
            {/* Eyebrow */}
            <div style={{ ...eyebrowStyle, marginBottom: 6 }}>Editorial</div>

            {/* Display title in Fraunces */}
            <div
              style={{
                fontFamily: fonts.heading,
                fontSize: 42,
                fontWeight: 600,
                color: C.text,
                letterSpacing: '-0.025em',
                lineHeight: 0.95,
              }}
            >
              the Archive
            </div>

            {/* Accent rule */}
            <div
              style={{
                width: 40,
                height: 2.5,
                background: `linear-gradient(90deg, ${C.accent}, ${C.accentLight})`,
                borderRadius: radius.pill,
                marginTop: 10,
                marginBottom: 10,
              }}
            />

            {/* Subtitle — Nunito, not script */}
            <div
              style={{
                fontFamily: fonts.body,
                fontSize: 13,
                fontWeight: 500,
                color: C.textMuted,
                letterSpacing: '0.01em',
                lineHeight: 1.4,
              }}
            >
              a record of every cup
            </div>
          </div>

          {/* Right: stats cluster */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
            <div style={{ textAlign: 'right' }}>
              <div
                style={{
                  fontFamily: fonts.heading,
                  fontSize: 30,
                  fontWeight: 600,
                  color: C.accent,
                  lineHeight: 1,
                  letterSpacing: '-0.02em',
                }}
              >
                {finished.length}
              </div>
              <div style={{ ...eyebrowStyle, fontSize: 10, marginTop: 2 }}>beans</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div
                style={{
                  fontFamily: fonts.heading,
                  fontSize: 22,
                  fontWeight: 600,
                  color: C.accentDark,
                  lineHeight: 1,
                  letterSpacing: '-0.015em',
                }}
              >
                {totalCups}
              </div>
              <div style={{ ...eyebrowStyle, fontSize: 10, marginTop: 2 }}>tastings</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Unforgettable Cups hero strip ────────────────────────── */}
      {filtersActive === 0 && bestCups.length > 0 && (
        <div style={{ padding: '18px 0 4px' }}>
          {/* Section header */}
          <div
            style={{
              padding: '0 20px 10px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Sparkles size={13} color={C.accent} />
            <div style={{ ...eyebrowStyle, color: C.accent }}>Unforgettable Cups</div>
            <div style={{ flex: 1, height: 1, background: C.hairline }} />
            <div
              style={{
                ...type.caption,
                color: C.textLight,
                fontWeight: 700,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              5★ only
            </div>
          </div>

          {/* Horizontally scrollable card strip */}
          <div
            className="hide-scrollbar"
            style={{
              display: 'flex',
              gap: 12,
              overflowX: 'auto',
              padding: '4px 20px 16px',
              scrollbarWidth: 'none',
            }}
          >
            {bestCups.map(b => (
              <button
                key={b.id}
                onClick={() => setOpenBeanId(b.id)}
                style={{
                  flexShrink: 0,
                  width: 140,
                  textAlign: 'left',
                  padding: '12px 12px 14px',
                  background: C.cream,
                  border: `1px solid ${C.borderLight}`,
                  borderRadius: radius.lg,
                  cursor: 'pointer',
                  boxShadow: shadows.e2,
                  fontFamily: fonts.body,
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                {/* Premium 5★ badge */}
                <div
                  style={{
                    position: 'absolute',
                    top: 9,
                    right: 9,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    padding: '3px 7px',
                    borderRadius: radius.pill,
                    background: C.accent,
                    boxShadow: shadows.button,
                  }}
                >
                  <svg width={7} height={7} viewBox="0 0 24 24">
                    <path
                      d="M12 2l2.9 6.9L22 10l-5.5 4.8L18.2 22 12 18.3 5.8 22l1.7-7.2L2 10l7.1-1.1z"
                      fill={C.cream}
                      strokeWidth="0"
                    />
                  </svg>
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 800,
                      color: C.cream,
                      letterSpacing: '0.02em',
                    }}
                  >
                    5
                  </span>
                </div>

                <BeanThumb bean={b} size={62} />

                {/* Bean name in Fraunces */}
                <div
                  style={{
                    fontFamily: fonts.heading,
                    fontSize: 14,
                    fontWeight: 600,
                    color: C.text,
                    marginTop: 10,
                    lineHeight: 1.2,
                    letterSpacing: '-0.01em',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {b.name}
                </div>
                <div
                  style={{
                    ...type.caption,
                    color: C.textMuted,
                    marginTop: 3,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {b.roaster}
                </div>

                {/* Star indicator row */}
                <div style={{ marginTop: 8 }}>
                  <Stars value={5} size={10} />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Search + filter bar ──────────────────────────────────── */}
      <div
        style={{
          margin: '4px 16px 16px',
          background: glass.chrome,
          backdropFilter: glass.blur,
          WebkitBackdropFilter: glass.blur,
          border: `1px solid ${glass.chromeBorder}`,
          borderRadius: radius.lg,
          boxShadow: shadows.e1,
        }}
      >
        {/* Search row */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '9px 10px 9px 12px', gap: 8 }}>
          <div
            style={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: C.bgDeep,
              borderRadius: radius.pill,
              border: `1px solid ${C.hairline}`,
              padding: '8px 14px',
            }}
          >
            <Search size={14} color={C.textMuted} />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search beans, roasters…"
              aria-label="Search archive"
              style={{
                flex: 1,
                border: 'none',
                background: 'transparent',
                outline: 'none',
                fontFamily: fonts.body,
                fontSize: 16,
                color: C.text,
                minWidth: 0,
              }}
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                aria-label="Clear search"
                style={{
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  padding: 2,
                  display: 'flex',
                  alignItems: 'center',
                  minWidth: 24,
                  minHeight: 24,
                }}
              >
                <X size={14} color={C.textMuted} />
              </button>
            )}
          </div>

          {/* Filter toggle button */}
          <button
            onClick={() => setFiltersOpen(o => !o)}
            aria-expanded={filtersOpen}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '9px 13px',
              minHeight: 44,
              borderRadius: radius.md,
              border: `1px solid ${filtersActive ? C.accent : C.border}`,
              background: filtersActive ? C.accentSoft : C.cream,
              color: filtersActive ? C.accent : C.textMuted,
              fontFamily: fonts.body,
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              letterSpacing: '0.03em',
            }}
          >
            <SlidersHorizontal size={13} />
            <span>Filter</span>
            {filtersActive > 0 && (
              <span
                style={{
                  padding: '1px 6px',
                  borderRadius: radius.pill,
                  background: C.accent,
                  color: C.cream,
                  fontSize: 10,
                  fontWeight: 800,
                }}
              >
                {filtersActive}
              </span>
            )}
          </button>
        </div>

        {/* Expanded filter panel */}
        {filtersOpen && (
          <div
            style={{
              padding: '12px 14px 16px',
              borderTop: `1px solid ${C.hairline}`,
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            {/* Sort */}
            <div>
              <div style={{ ...eyebrowStyle, marginBottom: 8 }}>Sort</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {Object.entries(SORT_LABELS).map(([k, v]) => (
                  <Chip key={k} label={v} active={sort === k} onClick={() => setSort(k)} />
                ))}
              </div>
            </div>

            {/* Year */}
            {years.length > 0 && (
              <div>
                <div style={{ ...eyebrowStyle, marginBottom: 8 }}>Year</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <Chip label="All" active={year === 'all'} onClick={() => setYear('all')} />
                  {years.map(y => (
                    <Chip
                      key={y}
                      label={y}
                      active={year === y}
                      onClick={() => setYear(y)}
                      count={finished.filter(b => yearOf(b.finishDate) === y).length}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Min rating */}
            <div>
              <div style={{ ...eyebrowStyle, marginBottom: 8 }}>Minimum rating</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <Chip label="Any" active={minRating === 0} onClick={() => setMinRating(0)} />
                {[3, 4, 5].map(r => (
                  <Chip
                    key={r}
                    label={`${r}★+`}
                    active={minRating === r}
                    onClick={() => setMinRating(r)}
                  />
                ))}
              </div>
            </div>

            {/* Dropdown selects */}
            {(roasters.length > 0 || origins.length > 0 || processes.length > 0) && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {roasters.length > 0 && (
                  <SelectField label="Roaster" value={roaster} onChange={setRoaster} options={roasters} />
                )}
                {origins.length > 0 && (
                  <SelectField label="Origin" value={origin} onChange={setOrigin} options={origins} />
                )}
                {processes.length > 0 && (
                  <SelectField label="Process" value={process} onChange={setProcess} options={processes} />
                )}
                {filtersActive > 0 && (
                  <button
                    onClick={clearFilters}
                    style={{
                      border: `1px solid ${C.border}`,
                      background: C.cream,
                      borderRadius: radius.md,
                      padding: '10px',
                      minHeight: 44,
                      fontSize: 12,
                      fontWeight: 700,
                      color: C.red,
                      cursor: 'pointer',
                      fontFamily: fonts.body,
                    }}
                  >
                    Clear all
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Timeline list ────────────────────────────────────────── */}
      <div style={{ padding: '0 16px 0' }}>
        {filtered.length === 0 ? (
          <EmptyState hasFilters={filtersActive > 0} onClear={clearFilters} />
        ) : (
          grouped.map(group => (
            <div key={group.key || 'all'} style={{ position: 'relative' }}>
              {/* Year rail header */}
              {group.key && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 10,
                    padding: '20px 0 8px 44px',
                    position: 'relative',
                  }}
                >
                  {/* Year dot — accent filled with halo ring */}
                  <div
                    style={{
                      position: 'absolute',
                      left: 17,
                      top: 26,
                      width: 14,
                      height: 14,
                      borderRadius: '50%',
                      background: C.accent,
                      boxShadow: `0 0 0 3px ${C.bg}, 0 0 0 5px ${C.accentLight}`,
                      zIndex: 1,
                    }}
                  />
                  {/* Year label in Fraunces */}
                  <div
                    style={{
                      fontFamily: fonts.heading,
                      fontSize: 28,
                      color: C.text,
                      fontWeight: 600,
                      letterSpacing: '-0.02em',
                      lineHeight: 1,
                    }}
                  >
                    {group.key}
                  </div>
                  {/* Bean count — Nunito, not script */}
                  <div
                    style={{
                      fontFamily: fonts.body,
                      fontSize: 13,
                      fontWeight: 600,
                      color: C.textLight,
                      letterSpacing: '0.01em',
                    }}
                  >
                    · {group.items.length} {group.items.length === 1 ? 'bean' : 'beans'}
                  </div>
                </div>
              )}

              {/* Entry rows with stagger animation */}
              <m.div
                variants={listContainer}
                initial="initial"
                animate="animate"
                style={{ position: 'relative', paddingLeft: 30 }}
              >
                {/* Vertical timeline rail — hairline accent gradient */}
                <div
                  style={{
                    position: 'absolute',
                    left: 23,
                    top: 0,
                    bottom: 8,
                    width: 1,
                    background: `linear-gradient(180deg, ${C.accentLight} 0%, ${C.hairline} 100%)`,
                  }}
                />
                {group.items.map(bean => (
                  <TimelineRow
                    key={bean.id}
                    bean={bean}
                    bestByBean={bestByBean}
                    showMonth={sort === 'recent' || sort === 'oldest'}
                    onOpen={() => setOpenBeanId(bean.id)}
                  />
                ))}
              </m.div>
            </div>
          ))
        )}

        {/* End of trail */}
        {filtered.length > 0 && (
          <div
            style={{
              textAlign: 'center',
              padding: '24px 0 12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
            }}
          >
            <div style={{ flex: 1, height: 1, background: C.hairline }} />
            <div
              style={{
                fontFamily: fonts.body,
                fontSize: 11,
                fontWeight: 600,
                color: C.textLight,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
              }}
            >
              end of the trail
            </div>
            <div style={{ flex: 1, height: 1, background: C.hairline }} />
          </div>
        )}
      </div>

      <ArchiveDetailSheet
        bean={openBean}
        tastings={tastings}
        onClose={() => setOpenBeanId(null)}
        onRestore={handleRestore}
        onDelete={deleteBean ? handleDelete : undefined}
        onLearn={isDemo ? onDemoAction : handleLearn}
        onEditPhoto={b => {
          setOpenBeanId(null);
          setTimeout(() => setEditBean(b), 240);
        }}
      />
      {editBean && (
        <Suspense fallback={null}>
          <EditBeanModalLazy
            bean={editBean}
            open={!!editBean}
            onClose={() => setEditBean(null)}
            updateBean={updateBean}
            uid={uid}
          />
        </Suspense>
      )}
      <ProfessorRuphusSlideUp {...ruphusProps} />
    </div>
  );
};
