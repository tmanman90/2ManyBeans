// Archive tab — the trophy case, editorial 100x. The TASTING is the hero of every
// entry: each leads with its ★ rating + one-word + a pull-quote from the note. Favourite
// cups are featured up top; the rest is a chronological, year-grouped ledger with pinning
// year headers, scroll-reveal, and parallax bags. Tap flies the bag into the trading card
// (hero morph). Gold is scarce — reserved for ratings and one active filter state.
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, ChevronDown, SlidersHorizontal } from 'lucide-react';
import { AnimatePresence, useScroll, useTransform, useReducedMotion } from 'framer-motion';
import { C, fonts, type, shadows, radius, glass, motion as motionTokens } from '../styles/theme';
import { m } from '../lib/motion';
import { haptic } from '../lib/haptics';
import { BeanThumb } from '../components/BeanThumb';
import { BeanDetailCard } from '../components/BeanDetailCard';
import { useBeanDetail } from '../hooks/useBeanDetail';
import { entryHero } from '../lib/tastingHero';
import { ProfessorRuphusSlideUp } from '../components/ProfessorRuphusSlideUp';
import { useProfessorRuphus } from '../hooks/useProfessorRuphus';

const EditBeanModalLazy = lazy(() => import('../components/EditBeanModal').then(m => ({ default: m.EditBeanModal })));

const SORT_LABELS = { recent: 'Recent', oldest: 'Oldest', rating: 'Highest rated', duration: 'Longest owned' };
const num = { fontVariantNumeric: 'tabular-nums lining-nums' };

const yearOf = (s) => (s || '').slice(0, 4);
function monthOf(s) {
  if (!s) return '';
  const d = new Date(s + 'T00:00:00');
  return isNaN(d) ? '' : d.toLocaleDateString('en-US', { month: 'short' });
}
function diffDays(later, earlier) {
  if (!later || !earlier) return null;
  const a = new Date(later + 'T00:00:00'), b = new Date(earlier + 'T00:00:00');
  if (isNaN(a) || isNaN(b)) return null;
  const days = Math.round((a - b) / 86400000);
  return days >= 0 ? days : null;
}

// Gold rating stars — the one place accent earns its keep.
function Stars({ value, size = 12 }) {
  if (!value) return null;
  return (
    <span style={{ display: 'inline-flex', gap: 2, alignItems: 'center' }} role="img" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map(n => (
        <svg key={n} width={size} height={size} viewBox="0 0 24 24" style={{ display: 'block' }}>
          <path d="M12 2l2.9 6.9L22 10l-5.5 4.8L18.2 22 12 18.3 5.8 22l1.7-7.2L2 10l7.1-1.1z"
            fill={n <= value ? C.accent : 'none'} stroke={n <= value ? C.accent : C.borderLight} strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      ))}
    </span>
  );
}

// Bag thumbnail with a subtle scroll-parallax drift (transform-only; disabled under
// reduced motion). Exposes the outer element via innerRef so the tap can capture the
// bag's on-screen rect for the hero morph.
function ParallaxBag({ bean, size, innerRef, reduce, range = 6 }) {
  const wrapRef = useRef(null);
  const { scrollYProgress } = useScroll({ target: wrapRef, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], [range, -range]);
  const setRef = (el) => { wrapRef.current = el; if (innerRef) innerRef.current = el; };
  if (reduce) {
    return <span ref={setRef} data-bag style={{ display: 'inline-flex' }}><BeanThumb bean={bean} size={size} /></span>;
  }
  return (
    <span ref={setRef} data-bag style={{ display: 'inline-flex' }}>
      <m.span style={{ y, display: 'inline-flex' }}><BeanThumb bean={bean} size={size} /></m.span>
    </span>
  );
}

// Pull-quote — the tasting note set as editorial type, not a chip.
function Quote({ text, size = 14, clamp = 2 }) {
  if (!text) return null;
  return (
    <div style={{ fontFamily: fonts.heading, fontStyle: 'italic', fontSize: size, lineHeight: 1.3, color: C.textMuted, letterSpacing: '-0.005em', display: '-webkit-box', WebkitLineClamp: clamp, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
      “{text}”
    </div>
  );
}

function Chip({ label, active, onClick, count }) {
  return (
    <button onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minHeight: 36, padding: '7px 13px', borderRadius: radius.pill, border: `1px solid ${active ? C.accent : C.border}`, background: active ? C.accent : C.cream, color: active ? C.cream : C.text, fontFamily: fonts.body, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: active ? shadows.button : 'none', transition: `all ${motionTokens.dur.fast}s ${motionTokens.cssOut}` }}>
      <span>{label}</span>
      {count != null && <span style={{ ...num, fontSize: 11, fontWeight: 700, color: active ? 'rgba(255,255,255,0.85)' : C.textLight }}>{count}</span>}
    </button>
  );
}

function SelectField({ label, value, onChange, options }) {
  const isActive = value !== 'all';
  return (
    <div>
      <div style={{ ...type.label, color: C.textLight, marginBottom: 6 }}>{label}</div>
      <div style={{ position: 'relative' }}>
        <select value={value} onChange={e => onChange(e.target.value)} style={{ width: '100%', appearance: 'none', WebkitAppearance: 'none', padding: '10px 28px 10px 12px', borderRadius: radius.md, border: `1px solid ${isActive ? C.accent : C.border}`, background: C.cream, fontFamily: fonts.body, fontSize: 16, fontWeight: 600, color: isActive ? C.accent : C.text, cursor: 'pointer' }}>
          <option value="all">All</option>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <ChevronDown size={14} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: C.textMuted, pointerEvents: 'none' }} />
      </div>
    </div>
  );
}

function EmptyState({ hasFilters, onClear }) {
  return (
    <div style={{ padding: '40px 24px', textAlign: 'center', background: C.cream, border: `1px solid ${C.borderLight}`, borderRadius: radius.lg, margin: '12px 0' }}>
      {!hasFilters && (
        <video src="/images/ruphus-animations/ruphus-empty-cup.mp4" autoPlay muted loop playsInline
          style={{ width: 200, height: 200, objectFit: 'contain', margin: '0 auto 8px', display: 'block', WebkitMaskImage: 'radial-gradient(ellipse 75% 55% at center 48%, black 60%, transparent 100%)', maskImage: 'radial-gradient(ellipse 75% 55% at center 48%, black 60%, transparent 100%)' }} />
      )}
      <div style={{ ...type.h2, color: C.text, marginBottom: 6 }}>{hasFilters ? 'No matches' : 'Nothing archived yet'}</div>
      <div style={{ ...type.body, color: C.textMuted, lineHeight: 1.55, marginBottom: hasFilters ? 16 : 0 }}>
        {hasFilters ? 'Adjust your filters to see the rest of your beans.' : 'When you finish a bag, it lands here.'}
      </div>
      {hasFilters && <button onClick={onClear} style={{ padding: '11px 22px', minHeight: 44, border: `1px solid ${C.border}`, background: C.cream, color: C.text, fontFamily: fonts.body, fontSize: 13, fontWeight: 700, borderRadius: radius.pill, cursor: 'pointer' }}>Clear filters</button>}
    </div>
  );
}

// origin · process · days-owned — the graceful fallback when a bean has no tasting words.
function metaLine(bean) {
  const dOwn = diffDays(bean.finishDate, bean.roastDate);
  return [bean.origin, bean.process, dOwn != null ? `${dOwn}d owned` : null].filter(Boolean).join(' · ');
}

// Featured fav cup — the editorial lead. Leads with the rating, then name + pull-quote.
function FeaturedCup({ bean, hero, onOpen, reduce }) {
  const bagRef = useRef(null);
  const { scrollYProgress } = useScroll({ target: bagRef, offset: ['start end', 'end start'] });
  const py = useTransform(scrollYProgress, [0, 1], [10, -10]);
  const rating = hero?.rating || 5;
  const words = hero?.oneWord || hero?.quote;
  return (
    <m.button
      onClick={() => onOpen(bean, bagRef.current?.getBoundingClientRect())}
      whileTap={{ scale: 0.985 }} transition={motionTokens.spring.soft}
      style={{ width: '100%', textAlign: 'left', display: 'flex', gap: 16, alignItems: 'center', padding: 16, cursor: 'pointer', background: C.cream, border: `1px solid ${C.accentLight}`, borderRadius: radius.xl, boxShadow: shadows.e3, WebkitTapHighlightColor: 'transparent' }}
    >
      <div style={{ flexShrink: 0, width: 116, height: 116, background: C.bgDeep, borderRadius: radius.lg, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <span ref={bagRef} data-bag style={{ display: 'inline-flex' }}>
          {reduce ? <BeanThumb bean={bean} size={96} /> : <m.span style={{ y: py, display: 'inline-flex' }}><BeanThumb bean={bean} size={96} /></m.span>}
        </span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* lead with the rating */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 5 }}>
          <Stars value={rating} size={15} />
          <span style={{ ...type.caption, color: C.textLight, textTransform: 'uppercase', letterSpacing: '0.08em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bean.roaster || ''}</span>
        </div>
        <div style={{ fontFamily: fonts.heading, fontSize: 22, fontWeight: 600, color: C.text, lineHeight: 1.1, letterSpacing: '-0.015em', marginBottom: 6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{bean.name}</div>
        {hero?.oneWord && <div style={{ fontFamily: fonts.heading, fontStyle: 'italic', fontSize: 15, color: C.accentDark, marginBottom: hero?.quote && hero.quote !== hero.oneWord ? 4 : 0 }}>“{hero.oneWord}”</div>}
        {hero?.quote && hero.quote !== hero.oneWord
          ? <Quote text={hero.quote} size={13.5} clamp={2} />
          : (!words && <div style={{ ...type.caption, ...num, color: C.textMuted }}>{metaLine(bean)}</div>)}
      </div>
    </m.button>
  );
}

// Smaller fav-cup card for the carousel remainder.
function CupCardSmall({ bean, hero, onOpen, reduce }) {
  const bagRef = useRef(null);
  return (
    <button onClick={() => onOpen(bean, bagRef.current?.getBoundingClientRect())}
      style={{ flexShrink: 0, width: 150, textAlign: 'left', padding: 12, cursor: 'pointer', background: C.cream, border: `1px solid ${C.accentLight}`, borderRadius: radius.lg, boxShadow: shadows.e2, fontFamily: fonts.body, WebkitTapHighlightColor: 'transparent' }}>
      <div style={{ background: C.bgDeep, borderRadius: radius.md, padding: 8, display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
        <ParallaxBag bean={bean} size={88} innerRef={bagRef} reduce={reduce} range={5} />
      </div>
      {/* lead with the rating */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 4 }}>
        <Stars value={hero?.rating || 5} size={11} />
        <span style={{ ...type.caption, color: C.textLight, textTransform: 'uppercase', letterSpacing: '0.06em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bean.roaster || ''}</span>
      </div>
      <div style={{ fontFamily: fonts.heading, fontSize: 14.5, fontWeight: 600, color: C.text, lineHeight: 1.16, letterSpacing: '-0.01em', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: 34 }}>{bean.name}</div>
      <div style={{ marginTop: 6 }}>
        {hero?.quote
          ? <Quote text={hero.quote} size={12} clamp={2} />
          : (hero?.oneWord
              ? <span style={{ fontFamily: fonts.heading, fontStyle: 'italic', fontSize: 12.5, color: C.accentDark }}>“{hero.oneWord}”</span>
              : <span style={{ ...type.caption, ...num, color: C.textMuted }}>{metaLine(bean)}</span>)}
      </div>
    </button>
  );
}

// Chronological ledger entry — rating-led, pull-quote, parallax bag, scroll-reveal.
function ArchiveEntry({ bean, hero, showMonth, onOpen, reduce, index }) {
  const bagRef = useRef(null);
  const dOwn = diffDays(bean.finishDate, bean.roastDate);
  const open = () => onOpen(bean, bagRef.current?.getBoundingClientRect());
  const onKey = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } };
  const reveal = reduce ? {} : { initial: { opacity: 0, y: 14 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: '-8% 0px' }, transition: { duration: motionTokens.dur.base, ease: motionTokens.ease.out, delay: Math.min(index, 6) * 0.04 } };

  return (
    <m.div {...reveal} style={{ position: 'relative', marginBottom: 12 }}>
      {/* rail tick — a single gold dot for 5★, neutral otherwise */}
      <div style={{ position: 'absolute', left: -10, top: 30, width: 9, height: 9, borderRadius: '50%', background: (hero?.rating || 0) >= 5 ? C.accent : C.cream, border: `1.5px solid ${(hero?.rating || 0) >= 5 ? C.accent : C.border}`, zIndex: 1 }} />
      <div role="button" tabIndex={0} onClick={open} onKeyDown={onKey}
        style={{ display: 'flex', gap: 14, padding: 14, minHeight: 44, background: C.cream, border: `1px solid ${C.borderLight}`, borderRadius: radius.lg, cursor: 'pointer', boxShadow: shadows.e1, WebkitTapHighlightColor: 'transparent' }}>
        <div style={{ flexShrink: 0, width: 72, height: 72, background: C.bgDeep, borderRadius: radius.md, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          <ParallaxBag bean={bean} size={64} innerRef={bagRef} reduce={reduce} range={6} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* lead with the rating (or roaster·month when the bean has no tasting) */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            {hero?.rating ? <Stars value={hero.rating} size={12} /> : <span style={{ ...type.label, color: C.textLight, fontSize: 10 }}>{bean.roaster || ''}</span>}
            <span style={{ ...type.label, ...num, color: C.textLight, fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {hero?.rating ? (bean.roaster || '') : ''}{showMonth && bean.finishDate ? `${hero?.rating && bean.roaster ? ' · ' : ''}${monthOf(bean.finishDate)}` : ''}
            </span>
          </div>
          <div style={{ fontFamily: fonts.heading, fontSize: 17, color: C.text, fontWeight: 600, lineHeight: 1.16, letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 4 }}>{bean.name}</div>
          {hero?.oneWord && <div style={{ fontFamily: fonts.heading, fontStyle: 'italic', fontSize: 14, color: C.accentDark, marginBottom: hero?.quote && hero.quote !== hero.oneWord ? 4 : 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>“{hero.oneWord}”</div>}
          {hero?.quote && hero.quote !== hero.oneWord
            ? <Quote text={hero.quote} size={13} clamp={2} />
            : ((!hero || (!hero.oneWord && !hero.quote)) && (
                <div style={{ ...type.caption, ...num, color: C.textMuted, lineHeight: 1.4 }}>
                  {bean.origin || ''}{bean.process ? ` · ${bean.process}` : ''}{dOwn != null ? ` · ${dOwn}d owned` : ''}
                </div>
              ))}
        </div>
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
  const [editBean, setEditBean] = useState(null);
  const reduce = useReducedMotion();

  const { detailBean, morphRect, openDetail, closeDetail } = useBeanDetail();
  const { handleLearn, ruphusProps } = useProfessorRuphus(updateBean, tastings, getBeanById);

  const open = (bean, rect) => { haptic.light(); openDetail(bean, rect); };

  const finished = useMemo(() => beans.filter(b => b.status === 'FINISHED'), [beans]);

  useEffect(() => {
    if (detailBean && !beans.find(b => b.id === detailBean.id)) closeDetail();
  }, [beans, detailBean, closeDetail]);

  const bestByBean = useMemo(() => {
    const m = {};
    tastings.forEach(t => { if (t.rating && (!m[t.beanId] || t.rating > m[t.beanId])) m[t.beanId] = t.rating; });
    return m;
  }, [tastings]);

  const heroByBean = useMemo(() => {
    const m = {};
    finished.forEach(b => { m[b.id] = entryHero(b.id, tastings); });
    return m;
  }, [finished, tastings]);

  const years = useMemo(() => [...new Set(finished.map(b => yearOf(b.finishDate)).filter(Boolean))].sort().reverse(), [finished]);
  const roasters = useMemo(() => [...new Set(finished.map(b => b.roaster).filter(Boolean))].sort(), [finished]);
  const origins = useMemo(() => [...new Set(finished.map(b => b.origin).filter(Boolean))].sort(), [finished]);
  const processes = useMemo(() => [...new Set(finished.map(b => b.process).filter(Boolean))].sort(), [finished]);

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
    if (sort === 'rating') list.sort((a, b) => {
      const diff = (bestByBean[b.id] || 0) - (bestByBean[a.id] || 0);
      return diff !== 0 ? diff : (b.finishDate || '').localeCompare(a.finishDate || '');
    });
    if (sort === 'duration') list.sort((a, b) => (diffDays(b.finishDate, b.roastDate) || 0) - (diffDays(a.finishDate, a.roastDate) || 0));
    return list;
  }, [finished, query, year, sort, minRating, roaster, origin, process, bestByBean]);

  const grouped = useMemo(() => {
    if (sort !== 'recent' && sort !== 'oldest') return [{ key: null, items: filtered }];
    const map = {};
    filtered.forEach(b => { const y = yearOf(b.finishDate) || 'Unknown'; (map[y] = map[y] || []).push(b); });
    const keys = Object.keys(map);
    if (sort === 'recent') keys.sort().reverse(); else keys.sort();
    return keys.map(k => ({ key: k, items: map[k] }));
  }, [filtered, sort]);

  const bestCups = useMemo(
    () => finished.filter(b => bestByBean[b.id] === 5).sort((a, b) => (b.finishDate || '').localeCompare(a.finishDate || '')).slice(0, 8),
    [finished, bestByBean]
  );

  const filtersActive = (year !== 'all' ? 1 : 0) + (roaster !== 'all' ? 1 : 0) + (origin !== 'all' ? 1 : 0) + (process !== 'all' ? 1 : 0) + (minRating > 0 ? 1 : 0) + (query ? 1 : 0);
  const clearFilters = () => { setQuery(''); setYear('all'); setMinRating(0); setRoaster('all'); setOrigin('all'); setProcess('all'); };

  const totalCups = useMemo(() => {
    const ids = new Set(finished.map(b => b.id));
    return tastings.filter(t => ids.has(t.beanId)).length;
  }, [finished, tastings]);

  const handleRestore = (bean) => updateBean(bean.id, { status: 'SEALED', finishDate: null });
  const handleDelete = (bean) => { if (deleteBean) deleteBean(bean.id); };

  return (
    <div style={{ background: C.bg, fontFamily: fonts.body, color: C.text }}>

      {/* ── Masthead ── */}
      <div data-masthead style={{ padding: '26px 20px 18px', borderBottom: `1px solid ${C.hairline}` }}>
        <div style={{ ...type.display, color: C.text }}>Archive</div>
        <div style={{ ...type.body, ...num, color: C.textMuted, marginTop: 7 }}>
          <strong style={{ color: C.text, fontWeight: 700 }}>{finished.length}</strong> {finished.length === 1 ? 'bean' : 'beans'}
          <span style={{ color: C.textLight, margin: '0 7px' }}>·</span>
          <strong style={{ color: C.text, fontWeight: 700 }}>{totalCups}</strong> {totalCups === 1 ? 'tasting' : 'tastings'}
        </div>
      </div>

      {/* ── Featured favourite cups (5★) — kept on top ── */}
      {filtersActive === 0 && bestCups.length > 0 && (
        <div style={{ padding: '18px 0 4px' }}>
          <div style={{ padding: '0 20px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ ...type.label, color: C.textMuted }}>Unforgettable Cups</div>
            <div style={{ flex: 1, height: 1, background: C.hairline }} />
            <div style={{ ...type.caption, ...num, color: C.textLight }}>{bestCups.length} · 5★</div>
          </div>
          <div style={{ padding: '0 16px' }}>
            <FeaturedCup bean={bestCups[0]} hero={heroByBean[bestCups[0].id]} onOpen={open} reduce={reduce} />
          </div>
          {bestCups.length > 1 && (
            <div className="hide-scrollbar" style={{ display: 'flex', gap: 12, overflowX: 'auto', padding: '12px 20px 16px', scrollbarWidth: 'none' }}>
              {bestCups.slice(1).map(b => <CupCardSmall key={b.id} bean={b} hero={heroByBean[b.id]} onOpen={open} reduce={reduce} />)}
            </div>
          )}
        </div>
      )}

      {/* ── Search + filter bar ── */}
      <div style={{ margin: '12px 16px 16px', background: glass.chrome, backdropFilter: glass.blur, WebkitBackdropFilter: glass.blur, border: `1px solid ${glass.chromeBorder}`, borderRadius: radius.lg, boxShadow: shadows.e1 }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '9px 10px 9px 12px', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, background: C.bgDeep, borderRadius: radius.pill, border: `1px solid ${C.hairline}`, padding: '8px 14px' }}>
            <Search size={14} color={C.textMuted} />
            <input type="text" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search beans, roasters…" aria-label="Search archive"
              style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontFamily: fonts.body, fontSize: 16, color: C.text, minWidth: 0 }} />
            {query && <button onClick={() => setQuery('')} aria-label="Clear search" style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center', minWidth: 24, minHeight: 24 }}><X size={14} color={C.textMuted} /></button>}
          </div>
          <button onClick={() => setFiltersOpen(o => !o)} aria-expanded={filtersOpen}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '9px 13px', minHeight: 44, borderRadius: radius.md, border: `1px solid ${filtersActive ? C.accent : C.border}`, background: C.cream, color: filtersActive ? C.accent : C.textMuted, fontFamily: fonts.body, fontSize: 12, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.03em' }}>
            <SlidersHorizontal size={13} /><span>Filter</span>
            {filtersActive > 0 && <span style={{ ...num, padding: '1px 6px', borderRadius: radius.pill, background: C.accent, color: C.cream, fontSize: 10, fontWeight: 800 }}>{filtersActive}</span>}
          </button>
        </div>
        {filtersOpen && (
          <div style={{ padding: '12px 14px 16px', borderTop: `1px solid ${C.hairline}`, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <div style={{ ...type.label, color: C.textLight, marginBottom: 8 }}>Sort</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {Object.entries(SORT_LABELS).map(([k, v]) => <Chip key={k} label={v} active={sort === k} onClick={() => setSort(k)} />)}
              </div>
            </div>
            {years.length > 0 && (
              <div>
                <div style={{ ...type.label, color: C.textLight, marginBottom: 8 }}>Year</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <Chip label="All" active={year === 'all'} onClick={() => setYear('all')} />
                  {years.map(y => <Chip key={y} label={y} active={year === y} onClick={() => setYear(y)} count={finished.filter(b => yearOf(b.finishDate) === y).length} />)}
                </div>
              </div>
            )}
            <div>
              <div style={{ ...type.label, color: C.textLight, marginBottom: 8 }}>Minimum rating</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <Chip label="Any" active={minRating === 0} onClick={() => setMinRating(0)} />
                {[3, 4, 5].map(r => <Chip key={r} label={`${r}★+`} active={minRating === r} onClick={() => setMinRating(r)} />)}
              </div>
            </div>
            {(roasters.length > 0 || origins.length > 0 || processes.length > 0) && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {roasters.length > 0 && <SelectField label="Roaster" value={roaster} onChange={setRoaster} options={roasters} />}
                {origins.length > 0 && <SelectField label="Origin" value={origin} onChange={setOrigin} options={origins} />}
                {processes.length > 0 && <SelectField label="Process" value={process} onChange={setProcess} options={processes} />}
                {filtersActive > 0 && <button onClick={clearFilters} style={{ border: `1px solid ${C.border}`, background: C.cream, borderRadius: radius.md, padding: '10px', minHeight: 44, fontSize: 12, fontWeight: 700, color: C.red, cursor: 'pointer', fontFamily: fonts.body }}>Clear all</button>}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Chronological ledger ── */}
      <div style={{ padding: '0 16px 0' }}>
        {filtered.length === 0 ? (
          <EmptyState hasFilters={filtersActive > 0} onClear={clearFilters} />
        ) : (
          grouped.map(group => (
            <div key={group.key || 'all'} style={{ position: 'relative' }}>
              {group.key && (
                <div style={{ position: 'sticky', top: 0, zIndex: 6, display: 'flex', alignItems: 'baseline', gap: 9, padding: '14px 0 10px 30px', background: `linear-gradient(180deg, ${C.bg} 70%, transparent)` }}>
                  <div style={{ fontFamily: fonts.heading, fontSize: 26, color: C.text, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1, ...num }}>{group.key}</div>
                  <div style={{ ...type.caption, ...num, color: C.textLight }}>{group.items.length} {group.items.length === 1 ? 'bean' : 'beans'}</div>
                </div>
              )}
              <div style={{ position: 'relative', paddingLeft: 30 }}>
                <div style={{ position: 'absolute', left: 23, top: 0, bottom: 10, width: 1, background: C.hairline }} />
                {group.items.map((bean, i) => (
                  <ArchiveEntry key={bean.id} bean={bean} hero={heroByBean[bean.id]} showMonth={sort === 'recent' || sort === 'oldest'} onOpen={open} reduce={reduce} index={i} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Trading card — flies open from the tapped thumbnail via the hero morph */}
      {detailBean && (
        <BeanDetailCard
          bean={detailBean}
          tastings={tastings}
          originRect={morphRect}
          showBrewProfile
          onClose={closeDetail}
          onLearn={(b) => { closeDetail(); (isDemo ? onDemoAction : handleLearn)?.(b); }}
          onRestore={(b) => { closeDetail(); handleRestore(b); }}
          onDelete={deleteBean ? (b) => { closeDetail(); handleDelete(b); } : undefined}
          onEdit={(b) => { closeDetail(); setEditBean(b); }}
        />
      )}
      {editBean && (
        <Suspense fallback={null}>
          <EditBeanModalLazy bean={editBean} open={!!editBean} onClose={() => setEditBean(null)} updateBean={updateBean} uid={uid} />
        </Suspense>
      )}
      <ProfessorRuphusSlideUp {...ruphusProps} />
    </div>
  );
};
