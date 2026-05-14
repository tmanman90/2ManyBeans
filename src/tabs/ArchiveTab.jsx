// Archive tab — "Ambitious Library" redesign.
// Painterly header, Unforgettable Cups hero strip, collapsible filter bar,
// timeline-rail list grouped by year, bean detail bottom sheet.
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Search, X, ChevronDown, SlidersHorizontal, Sparkles } from 'lucide-react';
import { C, fonts } from '../styles/theme';
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
            stroke={C.accent}
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
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {parts.map((p, i) => (
        <span
          key={i}
          style={{
            fontSize: 10.5,
            color: C.textMuted,
            fontStyle: 'italic',
            background: C.amberBg,
            border: `1px solid ${C.border}`,
            padding: '2px 7px',
            borderRadius: 999,
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
        minHeight: 32,
        padding: '6px 11px',
        borderRadius: 999,
        border: `1px solid ${active ? C.accent : C.border}`,
        background: active ? C.accent : C.card,
        color: active ? C.cream : C.text,
        fontFamily: fonts.body,
        fontSize: 12.5,
        fontWeight: 600,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        boxShadow: active ? '0 1px 3px rgba(176,117,64,0.25)' : 'none',
        transition: 'all 0.15s ease',
      }}
    >
      <span>{label}</span>
      {count != null && (
        <span
          style={{
            fontSize: 10,
            fontWeight: 800,
            padding: '1px 5px',
            background: active ? 'rgba(255,255,255,0.25)' : C.amberBg,
            color: active ? C.cream : C.textMuted,
            borderRadius: 999,
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
      <div
        style={{
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: 1.2,
          color: C.textMuted,
          textTransform: 'uppercase',
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ position: 'relative' }}>
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{
            width: '100%',
            appearance: 'none',
            WebkitAppearance: 'none',
            padding: '10px 26px 10px 10px',
            borderRadius: 10,
            border: `1px solid ${isActive ? C.accent : C.border}`,
            background: isActive ? C.amberBg : C.bg,
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
            right: 8,
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
        padding: '40px 24px',
        textAlign: 'center',
        background: C.card,
        border: `1px dashed ${C.border}`,
        borderRadius: 14,
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
      <div style={{ fontFamily: fonts.title, fontSize: 22, color: C.accentDark, marginBottom: 4 }}>
        {hasFilters ? 'nothing in this corner' : 'no beans yet'}
      </div>
      <div style={{ fontSize: 12.5, color: C.textMuted, lineHeight: 1.5, marginBottom: 14 }}>
        {hasFilters
          ? 'Try loosening a filter, your other beans are still here.'
          : 'When you finish a bean it lands here.'}
      </div>
      {hasFilters && (
        <button
          onClick={onClear}
          style={{
            padding: '10px 18px',
            minHeight: 44,
            border: `1px solid ${C.accent}`,
            background: C.amberBg,
            color: C.accent,
            fontFamily: fonts.body,
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: 0.3,
            borderRadius: 999,
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
    <div style={{ position: 'relative', marginBottom: 10 }}>
      <div
        style={{
          position: 'absolute',
          left: -10.5,
          top: 22,
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: C.card,
          border: `2px solid ${best >= 5 ? C.accent : C.accentLight}`,
          boxShadow: '0 1px 2px rgba(92,61,46,0.1)',
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
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          cursor: 'pointer',
          boxShadow: '0 1px 2px rgba(92,61,46,0.04)',
          fontFamily: fonts.body,
          position: 'relative',
        }}
      >
        <div style={{ display: 'flex', gap: 12 }}>
          <BeanThumb bean={bean} size={56} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
              <div
                style={{
                  fontSize: 9.5,
                  fontWeight: 800,
                  letterSpacing: 1.3,
                  textTransform: 'uppercase',
                  color: C.textMuted,
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
                    fontFamily: fonts.title,
                    fontSize: 14,
                    color: C.accentDark,
                    lineHeight: 1,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {monthOf(bean.finishDate)}
                </div>
              )}
            </div>
            <div
              style={{
                fontFamily: fonts.heading,
                fontSize: 16,
                color: C.text,
                fontWeight: 500,
                lineHeight: 1.2,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                marginTop: 2,
                marginBottom: 3,
              }}
            >
              {bean.name}
            </div>
            <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 6 }}>
              {bean.origin || ''}
              {bean.process ? ` · ${bean.process}` : ''}
              {dOwn != null ? ` · ${dOwn}d` : ''}
            </div>
            <NotesRow notes={bean.bagNotes} />
            {best ? (
              <div style={{ marginTop: 6 }}>
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
                padding: '8px 0 0', fontSize: 11, color: C.accent,
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
              maxHeight: expanded ? 180 : 0,
              overflow: 'hidden',
              transition: 'max-height 0.25s ease-out, opacity 0.2s ease-out',
              opacity: expanded ? 1 : 0,
            }}>
              <div style={{
                fontSize: 12, color: C.textMuted,
                padding: '8px 10px', borderRadius: 8,
                background: C.bg,
                display: 'flex', flexDirection: 'column', gap: 3,
                marginTop: 6,
              }}>
                {bean.variety && <span><strong>Variety:</strong> {bean.variety}</span>}
                {bean.region && <span><strong>Region:</strong> {bean.region}</span>}
                {bean.farm && <span><strong>Farm:</strong> {bean.farm}</span>}
                {bean.altitude && <span><strong>Altitude:</strong> {bean.altitude}</span>}
                {bean.roastLevel && <span><strong>Roast Level:</strong> {bean.roastLevel}</span>}
                {bean.cupScore && <span><strong>Accolades:</strong> {bean.cupScore}</span>}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
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
      {/* Painterly header */}
      <div
        style={{
          position: 'relative',
          padding: '20px 20px 16px',
          background: `linear-gradient(180deg, ${C.amberBg} 0%, ${C.bg} 100%)`,
          borderBottom: `1px solid ${C.border}`,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 20,
            right: -20,
            width: 140,
            height: 80,
            opacity: 0.4,
            background: `radial-gradient(ellipse, ${C.accentLight} 0%, transparent 60%)`,
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
          <div>
            <div style={{ fontFamily: fonts.title, fontSize: 20, color: C.accentDark, marginBottom: -2 }}>the</div>
            <div
              style={{
                fontFamily: fonts.heading,
                fontSize: 40,
                color: C.text,
                fontWeight: 500,
                letterSpacing: -1,
                lineHeight: 1,
              }}
            >
              Archive
            </div>
            <div
              style={{
                width: 48,
                height: 2,
                background: C.accent,
                borderRadius: 1,
                marginTop: 8,
                marginBottom: 10,
              }}
            />
            <div
              style={{
                fontFamily: fonts.title,
                fontSize: 18,
                color: C.accentDark,
                lineHeight: 1.1,
                marginTop: 4,
              }}
            >
              a record of every cup
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: fonts.heading, fontSize: 26, color: C.accent, fontWeight: 600, lineHeight: 1 }}>
              {finished.length}
            </div>
            <div
              style={{
                fontSize: 9.5,
                fontWeight: 800,
                letterSpacing: 1.2,
                color: C.textMuted,
                textTransform: 'uppercase',
                marginTop: 2,
              }}
            >
              beans
            </div>
            <div
              style={{
                fontFamily: fonts.heading,
                fontSize: 18,
                color: C.accent,
                fontWeight: 500,
                lineHeight: 1,
                marginTop: 10,
              }}
            >
              {totalCups}
            </div>
            <div
              style={{
                fontSize: 9.5,
                fontWeight: 800,
                letterSpacing: 1.2,
                color: C.textMuted,
                textTransform: 'uppercase',
                marginTop: 2,
              }}
            >
              tastings
            </div>
          </div>
        </div>
      </div>

      {/* Unforgettable cups strip */}
      {filtersActive === 0 && bestCups.length > 0 && (
        <div style={{ padding: '14px 0 6px' }}>
          <div style={{ padding: '0 20px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={14} color={C.accent} />
            <div
              style={{
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: 1.4,
                color: C.accent,
                textTransform: 'uppercase',
              }}
            >
              Unforgettable cups
            </div>
            <div style={{ flex: 1, height: 1, background: C.border }} />
            <div style={{ fontSize: 10, color: C.textLight, fontWeight: 600 }}>5★ beans</div>
          </div>
          <div
            className="hide-scrollbar"
            style={{
              display: 'flex',
              gap: 10,
              overflowX: 'auto',
              padding: '4px 20px 12px',
              scrollbarWidth: 'none',
            }}
          >
            {bestCups.map(b => (
              <button
                key={b.id}
                onClick={() => setOpenBeanId(b.id)}
                style={{
                  flexShrink: 0,
                  width: 132,
                  textAlign: 'left',
                  padding: 10,
                  background: C.card,
                  border: `1px solid ${C.border}`,
                  borderRadius: 14,
                  cursor: 'pointer',
                  boxShadow: '0 1px 3px rgba(92,61,46,0.08)',
                  fontFamily: fonts.body,
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    fontSize: 9,
                    fontWeight: 800,
                    letterSpacing: 1,
                    padding: '2px 6px',
                    borderRadius: 999,
                    background: C.amberBg,
                    color: C.accent,
                  }}
                >
                  5★
                </div>
                <BeanThumb bean={b} size={60} />
                <div
                  style={{
                    fontFamily: fonts.heading,
                    fontSize: 13,
                    color: C.text,
                    fontWeight: 600,
                    marginTop: 8,
                    lineHeight: 1.2,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {b.name}
                </div>
                <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>{b.roaster}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div
        style={{
          margin: '8px 16px 14px',
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 14,
          boxShadow: '0 1px 3px rgba(92,61,46,0.04)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', padding: '8px 10px 8px 12px', gap: 8 }}>
          <div
            style={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: C.amberBg,
              borderRadius: 999,
              padding: '7px 12px',
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
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <X size={14} color={C.textMuted} />
              </button>
            )}
          </div>
          <button
            onClick={() => setFiltersOpen(o => !o)}
            aria-expanded={filtersOpen}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '8px 12px',
              minHeight: 36,
              borderRadius: 999,
              border: `1px solid ${filtersActive ? C.accent : C.border}`,
              background: filtersActive ? C.amberBg : C.card,
              color: filtersActive ? C.accent : C.textMuted,
              fontFamily: fonts.body,
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <SlidersHorizontal size={13} />
            <span>Filter</span>
            {filtersActive > 0 && (
              <span
                style={{
                  padding: '0 5px',
                  borderRadius: 999,
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

        {filtersOpen && (
          <div
            style={{
              padding: '10px 12px 14px',
              borderTop: `1px solid ${C.border}`,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: 1.2,
                  color: C.textMuted,
                  textTransform: 'uppercase',
                  marginBottom: 6,
                }}
              >
                Sort
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {Object.entries(SORT_LABELS).map(([k, v]) => (
                  <Chip key={k} label={v} active={sort === k} onClick={() => setSort(k)} />
                ))}
              </div>
            </div>

            {years.length > 0 && (
              <div>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: 1.2,
                    color: C.textMuted,
                    textTransform: 'uppercase',
                    marginBottom: 6,
                  }}
                >
                  Year
                </div>
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

            <div>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: 1.2,
                  color: C.textMuted,
                  textTransform: 'uppercase',
                  marginBottom: 6,
                }}
              >
                Minimum rating
              </div>
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

            {(roasters.length > 0 || origins.length > 0 || processes.length > 0) && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
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
                      background: C.card,
                      borderRadius: 10,
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

      {/* Timeline list */}
      <div style={{ padding: '8px 16px 0' }}>
        {filtered.length === 0 ? (
          <EmptyState hasFilters={filtersActive > 0} onClear={clearFilters} />
        ) : (
          grouped.map(group => (
            <div key={group.key || 'all'} style={{ position: 'relative' }}>
              {group.key && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 10,
                    padding: '18px 0 6px 42px',
                    position: 'relative',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      left: 18,
                      top: 24,
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      background: C.accent,
                      boxShadow: `0 0 0 3px ${C.bg}, 0 0 0 4px ${C.accent}`,
                    }}
                  />
                  <div
                    style={{
                      fontFamily: fonts.heading,
                      fontSize: 26,
                      color: C.accent,
                      fontWeight: 600,
                      letterSpacing: -0.5,
                    }}
                  >
                    {group.key}
                  </div>
                  <div style={{ fontFamily: fonts.title, fontSize: 16, color: C.textLight }}>
                    · {group.items.length} {group.items.length === 1 ? 'bean' : 'beans'}
                  </div>
                </div>
              )}
              <div style={{ position: 'relative', paddingLeft: 28 }}>
                <div
                  style={{
                    position: 'absolute',
                    left: 23,
                    top: 0,
                    bottom: 8,
                    width: 1,
                    background: C.border,
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
              </div>
            </div>
          ))
        )}

        {filtered.length > 0 && (
          <div
            style={{
              textAlign: 'center',
              padding: '20px 0 10px',
              fontFamily: fonts.title,
              fontSize: 17,
              color: C.textLight,
            }}
          >
            — end of the trail —
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
