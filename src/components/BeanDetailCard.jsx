// BeanDetailCard — a collectible coffee "trading card" (vintage NBA aesthetic).
// FRONT = the bag as the hero card face. Flip ("VIEW STAT SHEET") to the BACK =
// the full stat sheet. Clean white + red/blue double border floating on white,
// its own look distinct from the warm app shell. View-only of the data; writes
// go through the same handlers (no Firebase shape changes).
//
// NOTE: tasting-note + roast/variety/weight icons are placeholders for now —
// the bespoke icon set is the next phase. Bag background stripping is also
// pending (real photos render as-is on the white card for now).
import { useState, useRef, useLayoutEffect, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, ArrowRight, RotateCcw, Pencil, Snowflake, Undo2, BookOpen, Flame, Leaf, Container, Coffee, Mountain, Check, Trash2, ChevronRight } from 'lucide-react';
import { splitTastingNotes } from '../lib/tastingHero';
import { AnimatePresence, useMotionValue, useTransform, useMotionTemplate, animate as fmAnimate, useReducedMotion } from 'framer-motion';
import { m, spring } from '../lib/motion';
import { haptic } from '../lib/haptics';
import { fonts } from '../styles/theme';
import { getPeakStatus, daysSinceRoast, formatDate } from '../lib/peakStatus';
import { summarizeSourceInsights } from '../lib/sourceInsights';
import { getBrewMethod } from '../lib/brewMethods';
import { usePreferences } from '../hooks/useUserProfile';
import { tastingIcon, tastingIconImage } from '../lib/tastingIcons';
import { useStrippedBag, bagPhotoFor } from '../lib/stripBg';

// ---- card palette (its own collectible look) ----
const RED = '#E0241C';
const BLUE = '#18A5E0';
const GREEN = '#2F7D54';
const INK = '#161210';
const GRAY = '#7A7A78';
const PAPER = '#FBFAF7';
const HAIR = '#E7E3DB';
const GOLD = '#C08A2E';

const G = fonts.grotesque;

// Rating stars in the card's gold (the one place accent earns its keep on the back).
function CardStars({ value = 0, size = 14 }) {
  if (!value) return null;
  return (
    <span style={{ display: 'inline-flex', gap: 1.5 }} role="img" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map(n => (
        <svg key={n} width={size} height={size} viewBox="0 0 24 24" style={{ display: 'block' }}>
          <path d="M12 2l2.9 6.9L22 10l-5.5 4.8L18.2 22 12 18.3 5.8 22l1.7-7.2L2 10l7.1-1.1z"
            fill={n <= value ? GOLD : 'none'} stroke={n <= value ? GOLD : '#D9D4CB'} strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      ))}
    </span>
  );
}
const SERIF = fonts.heading;

// Shared-element morph spring (shelf bag → trading-card bag). Snappy arrival with a
// hair of overshoot. transform-only (FLIP). Tuned per the animation research.
const heroSpring = { type: 'spring', stiffness: 380, damping: 36, mass: 1, restDelta: 0.001 };

// weight icon — glass server/beaker with liquid (matches the reference)
const WeightIcon = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M9 2.6h6M10.6 2.6v5.5L6.7 17.1A2.3 2.3 0 0 0 8.8 20.4h6.4a2.3 2.3 0 0 0 2.1-3.3L13.4 8.1V2.6" stroke={INK} strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" />
    <path d="M7.9 14.3h8.2l1.2 2.8A2 2 0 0 1 15.4 20.4H8.6A2 2 0 0 1 6.7 17.1z" fill={BLUE} />
  </svg>
);

const clamp = (v) => Math.max(0, Math.min(1, v));
const parseNotes = (s) => (!s || s === '(not logged)') ? [] : s.split(/[/,]|\sand\s/i).map(x => x.trim()).filter(Boolean);
const lbl = { fontFamily: G, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: GRAY };

// Auto-shrink text so it ALWAYS fits on one line (never truncates).
function FitText({ children, max, min = 7, style }) {
  const ref = useRef(null);
  const [size, setSize] = useState(max);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let s = max;
    el.style.fontSize = s + 'px';
    let guard = 0;
    while (el.scrollWidth > el.clientWidth + 0.5 && s > min && guard < 60) { s -= 0.5; el.style.fontSize = s + 'px'; guard++; }
    setSize(s);
  });
  return <div ref={ref} style={{ width: '100%', whiteSpace: 'nowrap', overflow: 'hidden', fontSize: size, ...style }}>{children}</div>;
}

// ---- count-up number (animates 0→value on mount; static under reduced-motion) ----
function StatTicker({ value, duration = 0.8, style }) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => String(Math.round(v)));
  const started = useRef(false);
  useEffect(() => {
    if (value == null) return;
    if (reduce) { mv.set(value); return; }
    if (started.current) return;
    started.current = true;
    // easeOutQuad — even per-number cadence with a soft stop (no end-crawl/"sticking").
    const controls = fmAnimate(mv, value, { duration, ease: [0.25, 0.46, 0.45, 0.94] });
    return controls.stop;
  }, [value, reduce, duration, mv]);
  if (value == null) return <span style={style}>--</span>;
  return <m.span style={style}>{text}</m.span>;
}

// ---- peak badge (perfect circle, red+blue rings; straddles the corner) ----
function PeakBadge({ bean, size = 84 }) {
  // Finished beans aren't "aging on a shelf" — show a vintage year-stamp instead of
  // the freshness/STALE peak status (which reads wrong on an archived trophy bean).
  if (bean.status === 'FINISHED') {
    const d = bean.finishDate ? new Date(bean.finishDate + 'T00:00:00') : null;
    const yr = d && !isNaN(d) ? String(d.getFullYear()) : null;
    const mo = d && !isNaN(d) ? d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase() : '';
    return (
      <div style={{ width: size, height: size, borderRadius: '50%', background: PAPER, border: `3px solid ${RED}`, padding: 3, boxShadow: '0 3px 12px rgba(20,12,8,0.16)' }}>
        <div style={{ width: '100%', height: '100%', borderRadius: '50%', border: `2px solid ${BLUE}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
          <span style={{ fontFamily: G, fontSize: 7.5, fontWeight: 700, letterSpacing: '0.1em', color: GRAY }}>FINISHED</span>
          <span style={{ fontFamily: G, fontSize: 23, fontWeight: 800, color: INK, letterSpacing: '-0.02em', margin: '1px 0 1px', fontVariantNumeric: 'tabular-nums' }}>{yr ?? '—'}</span>
          <div style={{ width: 15, height: 2, background: RED, borderRadius: 1, margin: '1px 0 2px' }} />
          {mo && <span style={{ fontFamily: G, fontSize: 8, fontWeight: 700, letterSpacing: '0.08em', color: GRAY }}>{mo}</span>}
        </div>
      </div>
    );
  }
  const ps = getPeakStatus(bean);
  const days = daysSinceRoast(bean.roastDate, bean);
  const pctM = ps.label.match(/\((\d+)%\)/);
  const dayM = ps.label.match(/\(\+(\d+)d\)/);
  const sub = pctM ? `${pctM[1]}%` : (dayM ? `+${dayM[1]}d` : '');
  const status = ps.label.replace(/\s*\(.*\)/, '').toUpperCase();
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: PAPER, border: `3px solid ${RED}`, padding: 3, boxShadow: '0 3px 12px rgba(20,12,8,0.16)' }}>
      <div style={{ width: '100%', height: '100%', borderRadius: '50%', border: `2px solid ${BLUE}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
        <span style={{ fontFamily: G, fontSize: 8, fontWeight: 700, letterSpacing: '0.12em', color: INK }}>DAY</span>
        <StatTicker value={days != null ? days : null} style={{ fontFamily: G, fontSize: 26, fontWeight: 800, color: INK, letterSpacing: '-0.02em', margin: '0 0 1px' }} />
        <div style={{ width: 15, height: 2, background: RED, borderRadius: 1, margin: '1px 0 2px' }} />
        {sub && <span style={{ fontFamily: G, fontSize: 11.5, fontWeight: 800, color: INK }}>{sub}</span>}
        <span style={{ fontFamily: G, fontSize: 7, fontWeight: 700, letterSpacing: '0.08em', color: GRAY }}>{status}</span>
      </div>
    </div>
  );
}

// ---- vintage peak window bar (back) ----
function CardPeakBar({ bean }) {
  if (!bean.peakStart || !bean.peakEnd) return null;
  const ps = getPeakStatus(bean);
  const days = daysSinceRoast(bean.roastDate, bean);
  const total = bean.peakEnd + 14;
  const pct = clamp((days ?? 0) / total);
  const startPct = bean.peakStart / total;
  const endPct = bean.peakEnd / total;
  const pctM = ps.label.match(/\((\d+%)\)/);
  return (
    <div style={{ background: '#FFFFFF', border: `1px solid ${HAIR}`, borderRadius: 16, padding: '16px 18px 18px', marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 18, gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
          <span style={{ fontFamily: SERIF, fontSize: 24, fontWeight: 600, color: GREEN, lineHeight: 1 }}>Day {days}</span>
          <span style={{ fontFamily: G, fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', color: GREEN, textTransform: 'uppercase' }}>{ps.label.replace(/\s*\(.*\)/, '')} {pctM ? `(${pctM[1]})` : ''}</span>
        </div>
        <span style={{ fontFamily: G, fontSize: 11, color: GRAY, whiteSpace: 'nowrap' }}>Peak {bean.peakStart}–{bean.peakEnd}d</span>
      </div>
      <div style={{ position: 'relative', height: 40 }}>
        <span style={{ position: 'absolute', top: -2, left: `${startPct * 100}%`, transform: 'translateX(-50%)', fontFamily: G, fontSize: 11, fontWeight: 700, color: GREEN }}>{bean.peakStart}d</span>
        <span style={{ position: 'absolute', top: -2, left: `${endPct * 100}%`, transform: 'translateX(-50%)', fontFamily: G, fontSize: 11, fontWeight: 700, color: GREEN }}>{bean.peakEnd}d</span>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 20, height: 9, borderRadius: 5, background: '#ECEAE3' }} />
        <div style={{ position: 'absolute', top: 20, height: 9, borderRadius: 5, left: `${startPct * 100}%`, width: `${(endPct - startPct) * 100}%`, background: `linear-gradient(90deg, ${GREEN} 0%, #6FA886 55%, #D9B871 100%)` }} />
        <div style={{ position: 'absolute', top: 12, left: `${pct * 100}%`, transform: 'translateX(-50%)', width: 2, height: 22, background: GREEN }} />
        <div style={{ position: 'absolute', top: 8, left: `${pct * 100}%`, transform: 'translateX(-50%)', width: 14, height: 14, borderRadius: '50%', background: PAPER, border: `2.5px solid ${GREEN}` }} />
        <span style={{ position: 'absolute', bottom: -2, right: 0, fontFamily: G, fontSize: 11, color: '#B89B6A' }}>+14d</span>
      </div>
    </div>
  );
}

// A single tasting note: bespoke illustration (same on both faces) + a 2-line
// clamped label so long names like "Blue Raspberry" never spill to a 3rd line.
const NoteCell = ({ label, size = 50, green }) => {
  const { Icon, color: noteColor } = tastingIcon(label);
  const img = tastingIconImage(label);
  // Tight cells (5+ notes => smaller icon) need a smaller, tighter label so the longest
  // single word ("RASPBERRY") fits on its line instead of truncating with an ellipsis.
  const tight = size < 48;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, flex: 1, minWidth: 0, padding: tight ? '0 1px' : '0 3px' }}>
      <div style={{ width: size, height: size, borderRadius: '50%', border: `1.5px solid ${green ? '#CFE0D5' : HAIR}`, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
        {img
          ? <img src={img} alt="" style={{ width: '74%', height: '74%', objectFit: 'contain' }} />
          : <Icon size={Math.round(size * 0.44)} color={green ? GREEN : noteColor} strokeWidth={1.7} />}
      </div>
      <span style={{ fontFamily: G, fontSize: tight ? 8.5 : 9.5, fontWeight: 700, letterSpacing: tight ? '-0.01em' : '0.01em', textTransform: 'uppercase', color: green ? GREEN : INK, textAlign: 'center', lineHeight: 1.12, height: '2.24em', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-word' }}>{label}</span>
    </div>
  );
};

// Shared note row, identical on both faces. Up to 5 notes ALWAYS fit in one clean
// row (icon auto-sizes to count) so nothing is ever hidden. Only 6+ falls back to a
// scroll-snap rail with a right-edge fade hint. (Native horizontal scroll is flaky
// inside the 3D-flipped face, so we avoid relying on it for the common case.)
function NoteRow({ notes, green = false, fade = PAPER }) {
  const n = notes.length;
  const scroll = n > 5;
  const size = scroll ? 46 : n >= 5 ? 44 : n === 4 ? 48 : 52;
  const cells = notes.map((note, i) => (
    <div key={i} style={{ display: 'flex', alignItems: 'stretch', ...(scroll ? { width: 78, flexShrink: 0 } : { flex: 1, minWidth: 0 }) }}>
      {i > 0 && <div style={{ width: 1, background: HAIR, margin: '6px 0' }} />}
      <NoteCell label={note} size={size} green={green} />
    </div>
  ));
  if (!scroll) {
    return <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', width: '100%' }}>{cells}</div>;
  }
  return <NoteRail cells={cells} fade={fade} />;
}

// 6+ notes: a draggable rail. Uses framer-motion drag (pure transform) rather than
// native horizontal scroll, which is unreliable inside the 3D-flipped card face on
// iOS WKWebView. Right-edge fade signals there's more to swipe.
function NoteRail({ cells, fade }) {
  const trackRef = useRef(null);
  return (
    <div ref={trackRef} style={{ position: 'relative', width: '100%', overflow: 'hidden' }}>
      <m.div
        drag="x"
        dragDirectionLock
        dragConstraints={trackRef}
        dragElastic={0.06}
        style={{ display: 'flex', alignItems: 'flex-start', width: 'max-content', cursor: 'grab' }}
      >
        {cells}
      </m.div>
      <div aria-hidden style={{ position: 'absolute', top: 0, right: 0, bottom: 22, width: 34, background: `linear-gradient(90deg, rgba(0,0,0,0) 0%, ${fade} 92%)`, pointerEvents: 'none' }} />
    </div>
  );
}

const GridCell = ({ label, value }) => (
  <div style={{ borderBottom: `1px solid ${HAIR}`, paddingBottom: 9 }}>
    <div style={{ ...lbl, fontSize: 10, marginBottom: 4 }}>{label}</div>
    <div style={{ fontFamily: G, fontSize: 15, fontWeight: 600, color: INK, lineHeight: 1.25 }}>{value || '—'}</div>
  </div>
);

const StatBarItem = ({ icon, label, value, meter }) => (
  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 9, padding: '0 9px', minWidth: 0 }}>
    <span style={{ flexShrink: 0 }}>{icon}</span>
    <div style={{ minWidth: 0, flex: 1 }}>
      <div style={{ ...lbl, fontSize: 9, marginBottom: 1 }}>{label}</div>
      <FitText max={13} min={8} style={{ fontFamily: G, fontWeight: 700, color: INK, textTransform: 'uppercase', letterSpacing: '0.02em' }}>{value}</FitText>
      {meter && (
        <div style={{ display: 'flex', gap: 3, marginTop: 3 }}>
          {[0, 1, 2, 3, 4, 5].map(i => <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: i <= 1 ? BLUE : '#DEDAD2' }} />)}
        </div>
      )}
    </div>
  </div>
);

const MiniAction = ({ icon, label, onClick, active, danger }) => (
  <button onClick={onClick} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '4px 2px', WebkitTapHighlightColor: 'transparent' }}>
    <span style={{ color: danger ? RED : active ? BLUE : GRAY }}>{icon}</span>
    <span style={{ fontFamily: G, fontSize: 10, fontWeight: 600, color: danger ? RED : GRAY }}>{label}</span>
  </button>
);

const Panel = ({ children }) => (
  <div style={{ background: '#FFFFFF', border: `1px solid ${HAIR}`, borderRadius: 16, padding: '14px 16px', marginBottom: 12 }}>{children}</div>
);

const VRoaster = ({ name }) => (
  <div style={{ position: 'absolute', left: 13, top: 16, transform: 'rotate(180deg)', writingMode: 'vertical-rl', fontFamily: G, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: INK, zIndex: 3, maxHeight: '46%', overflow: 'hidden' }}>
    {name}
  </div>
);

// white card with red/blue double border floating on a white margin
const faceBase = {
  position: 'absolute', inset: 0,
  WebkitBackfaceVisibility: 'hidden', backfaceVisibility: 'hidden',
  borderRadius: 24, background: PAPER,
};
// red + blue rings drawn as concentric box-shadows so the corners stay perfectly
// parallel (no mismatched bends), with white margin around them on the white face.
// Always-available swipe-to-dismiss grabber for the back (stat-sheet) face, where the
// content scrolls so the scroll-top pull alone feels stuck on long sheets. Tap or swipe
// down to close — never conflicts with the scroll because it's a non-scrolling strip.
function Grabber({ onClose }) {
  const start = useRef(null);
  return (
    <div
      onClick={() => onClose?.()}
      onTouchStart={(e) => { start.current = e.touches[0].clientY; }}
      onTouchEnd={(e) => {
        if (start.current == null) return;
        const dy = e.changedTouches[0].clientY - start.current;
        start.current = null;
        if (dy > 56) { haptic.light(); onClose?.(); }
      }}
      style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '9px 0 5px', flexShrink: 0, touchAction: 'none', cursor: 'grab', zIndex: 12 }}
    >
      <div style={{ width: 38, height: 5, borderRadius: 999, background: '#D9D2C7' }} />
    </div>
  );
}

const RedFrame = ({ children }) => (
  <div style={{
    position: 'absolute', inset: 12,
    border: `2px solid ${BLUE}`,
    borderRadius: 15,
    boxShadow: `0 0 0 3px ${PAPER}, 0 0 0 5px ${RED}`,
    background: PAPER,
    overflow: 'hidden',
    display: 'flex', flexDirection: 'column',
  }}>
    {children}
  </div>
);

export function BeanDetailCard({ bean, tastings = [], originRect, onOpen, onClose, onLearn, onReturn, onFreeze, onFinish, onEdit, onRestore, onDelete, onOpenTasting, showBrewProfile = false, siblings = null, onNavigate = null }) {
  const { preferences } = usePreferences();
  const [flipped, setFlipped] = useState(false);
  const [insightOpen, setInsightOpen] = useState(false);
  const reduce = useReducedMotion();
  const backScrollRef = useRef(null);
  const pullStart = useRef(null);
  const bagSrc = useStrippedBag(bagPhotoFor(bean));

  // Lock the page behind the card so a downward swipe-to-dismiss on the front is never
  // stolen by the background scroll (the culprit behind the "buggy on Archive's long
  // timeline, fine on Inventory/Rotation" front-swipe). Restore on close.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // ---- Hero morph (manual FLIP): fly the bag from its shelf rect into the card ----
  // layoutId can't project through the 3D flip card + portal, so we animate a floating
  // bag overlay (pure transform) from the shelf rect to the card's bag rect, then hand
  // off to the card's own (static) bag. transform/opacity only.
  const bagWrapRef = useRef(null);
  const morphRan = useRef(false);                    // launch the flight exactly once
  const morphEligible = !reduce && !!originRect && originRect.width > 0 && !!bean.photoUrl;
  const [morph, setMorph] = useState(null);          // { from, to } once the target is measured
  const [morphDone, setMorphDone] = useState(!morphEligible); // when false, the card's own bag is hidden
  useLayoutEffect(() => {
    if (!morphEligible || morphRan.current) return;
    morphRan.current = true;
    let raf, tries = 0;
    // The card's bag <img> is content-sized, so its rect is 0 until the image loads —
    // poll a few frames for a real target rect before launching the flight. `originRect`
    // is read here (in deps + captured once via the guard) so the flight uses the rect
    // from the tap that opened this card, never a stale one.
    const measure = () => {
      const t = bagWrapRef.current?.getBoundingClientRect();
      if (t && t.width > 4) setMorph({ from: originRect, to: { x: t.x, y: t.y, width: t.width, height: t.height } });
      else if (++tries < 40) raf = requestAnimationFrame(measure);
      else setMorphDone(true); // never measured → skip morph, just show the bag
    };
    raf = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(raf);
  }, [morphEligible, originRect]);

  // Flip depth: a 0→1 progress value drives the shadow arc (card lifts + casts a
  // longer, darker shadow at the mid-flip apex, then settles). transform/opacity-safe.
  const flipP = useMotionValue(0);
  const shadowBlur = useTransform(flipP, [0, 0.5, 1], [60, 92, 60]);
  const shadowY = useTransform(flipP, [0, 0.5, 1], [24, 40, 24]);
  const shadowA = useTransform(flipP, [0, 0.5, 1], [0.45, 0.6, 0.45]);
  const cardShadow = useMotionTemplate`0 ${shadowY}px ${shadowBlur}px rgba(20,12,8,${shadowA})`;
  const dipScale = useTransform(flipP, [0, 0.5, 1], [1, 0.96, 1]); // card lifts at apex

  // Card entrance: a soft medium tap as the collectible lands.
  useEffect(() => { haptic.medium(); }, []);

  const doFlip = (next) => {
    setFlipped(next);
    haptic.light();
    if (next && backScrollRef.current) backScrollRef.current.scrollTop = 0; // back always opens at the top
    if (!reduce) fmAnimate(flipP, next ? 1 : 0, { duration: 0.55, ease: [0.25, 0, 0.75, 1] });
    setTimeout(() => haptic.medium(), 430); // settle on landing
  };

  // ---- Swipe navigation (siblings + onNavigate optional; absent => today's y-only
  // drag). x drives the card wrapper's style directly so framer's drag writes straight
  // into it (release position feeds the fmAnimate below); rotateZ tracks it 1:1, capped
  // to ±3deg — the only flourish, no color/shadow animation.
  const x = useMotionValue(0);
  const rotateZ = useTransform(x, [-260, 0, 260], [-3, 0, 3]);
  // Commit race guards: a second swipe (or close/unmount) while the exit-fly promise is
  // pending must not let the stale .then navigate or jump x afterwards. busy blocks
  // re-commits mid-flight; the token invalidates a pending .then; stop() on unmount.
  const swipeBusy = useRef(false);
  const swipeToken = useRef(0);
  const swipeAnim = useRef(null);
  useEffect(() => () => { swipeToken.current++; swipeAnim.current?.stop(); }, []);

  // Bean swap is parent-driven (no remount, per contract — a remount would kill the
  // slide transition and replay the mount-scoped entrance haptic / hero-morph guard
  // above). Reset the per-bean transient UI by hand instead. Flip resets instantly.
  useEffect(() => {
    if (!bean) return;
    setFlipped(false);
    flipP.set(0);
    setInsightOpen(false);
    if (backScrollRef.current) backScrollRef.current.scrollTop = 0;
  }, [bean?.id]);

  // Pull-to-dismiss on the BACK: only engages when the stat sheet is scrolled to the
  // top, so normal scrolling is never hijacked. Rubber-bands the sheet, dismisses on a
  // sufficient pull. (Front uses framer drag on the whole card.)
  const backPull = {
    onTouchStart: (e) => { pullStart.current = (backScrollRef.current?.scrollTop || 0) <= 0 ? e.touches[0].clientY : null; },
    onTouchMove: (e) => {
      if (pullStart.current == null) return;
      const dy = e.touches[0].clientY - pullStart.current;
      if (dy > 0 && backScrollRef.current) backScrollRef.current.style.transform = `translateY(${dy * 0.35}px)`;
    },
    onTouchEnd: (e) => {
      if (pullStart.current == null) return;
      const dy = e.changedTouches[0].clientY - pullStart.current;
      const el = backScrollRef.current;
      if (el) { el.style.transition = 'transform 0.26s cubic-bezier(0.22,1,0.36,1)'; el.style.transform = 'translateY(0)'; setTimeout(() => { if (el) el.style.transition = ''; }, 280); }
      pullStart.current = null;
      if (dy > 95) { haptic.light(); onClose(); }
    },
  };

  if (!bean) return null;

  // Neighbor lookup — same order the calling surface renders (siblings is exactly
  // that array). No wrap: rubber-bands at the ends via the elastic below.
  const swipeEnabled = !!siblings && !!onNavigate;
  const siblingIndex = swipeEnabled ? siblings.findIndex(b => b.id === bean.id) : -1;
  const prevBean = swipeEnabled && siblingIndex > 0 ? siblings[siblingIndex - 1] : null;
  const nextBean = swipeEnabled && siblingIndex >= 0 && siblingIndex < siblings.length - 1 ? siblings[siblingIndex + 1] : null;

  // Fly the outgoing card off-screen, swap the bean (onNavigate — parent updates
  // detailBean in place), then slide the incoming card in from the opposite edge.
  // Reduced motion: skip both animations, swap instantly.
  const commitSwipe = (target, goingNext) => {
    haptic.selection();
    if (reduce) { onNavigate(target); return; }
    swipeBusy.current = true;
    const token = ++swipeToken.current;
    const fly = Math.min(window.innerWidth, 384) + 48;
    const exitX = goingNext ? -fly : fly;
    swipeAnim.current = fmAnimate(x, exitX, { duration: 0.2, ease: 'easeOut' });
    swipeAnim.current.then(() => {
      if (token !== swipeToken.current) return; // superseded or unmounted — stale, bail
      swipeBusy.current = false;
      onNavigate(target);
      x.set(-exitX);
      swipeAnim.current = fmAnimate(x, 0, spring.soft); // drag naturally interrupts this
    });
  };

  // Dominant-axis branch: y keeps today's dismiss thresholds unchanged; x commits a
  // navigate only past the threshold AND only if a neighbor exists in that direction
  // (no neighbor => the elastic already rubber-banded it, nothing to commit).
  const onFrontDragEnd = (e, info) => {
    if (swipeBusy.current) return; // a commit is mid-flight — ignore until it lands
    if (swipeEnabled && Math.abs(info.offset.x) > Math.abs(info.offset.y)) {
      const goingNext = info.offset.x < 0;
      const target = goingNext ? nextBean : prevBean;
      if (target && (Math.abs(info.offset.x) > 90 || Math.abs(info.velocity.x) > 500)) commitSwipe(target, goingNext);
      return;
    }
    if (info.offset.y > 110 || info.velocity.y > 650) onClose();
  };

  const notes = parseNotes(bean.bagNotes);
  const beanTastings = tastings.filter(t => t.beanId === bean.id);
  const insightShort = summarizeSourceInsights(bean, { maxChars: 280 });
  const insightFull = summarizeSourceInsights(bean, { maxChars: 1400 });
  const canExpandInsight = !!insightFull && insightFull.length > (insightShort?.length || 0);
  let grindText = null;
  try { grindText = getBrewMethod(preferences?.brewMethod)?.grindLabel?.(bean, preferences) || null; } catch { /* noop */ }
  const roaster = bean.roaster || 'COFFEE';
  const originParts = [bean.origin, bean.process].filter(Boolean).map(s => s.toUpperCase());

  // Stat sheet rows — only render the ones that actually have data (no empty "—" rows).
  const daysPost = daysSinceRoast(bean.roastDate, bean);
  // Ownership context (finished beans only — derived from existing fields, no new data).
  const isFinished = bean.status === 'FINISHED';
  const daysOwned = (isFinished && bean.finishDate && bean.roastDate)
    ? Math.max(0, Math.round((new Date(bean.finishDate + 'T00:00:00') - new Date(bean.roastDate + 'T00:00:00')) / 86400000))
    : null;
  const stats = [
    ['Roaster', bean.roaster],
    ['Coffee Name', bean.name],
    ['Origin', bean.origin],
    ['Region', bean.region],
    ['Altitude', bean.altitude],
    ['Process', bean.process],
    ['Variety', bean.variety],
    ['Farm', bean.farm],
    ['Producer', bean.producer],
    ['Accolades', bean.cupScore],
    ['Roast Level', bean.roastLevel],
    ['Sourced By', bean.sourcedBy],
    ['Roast Date', formatDate(bean.roastDate)],
    isFinished ? ['Finished', formatDate(bean.finishDate)] : ['Days Post Roast', daysPost != null ? `${daysPost} days` : null],
    isFinished ? ['Days Owned', daysOwned != null ? `${daysOwned} days` : null] : null,
    ['Grind', grindText],
    ['Weight', bean.bagSize ? `${bean.bagSize}g` : null],
  ].filter(Boolean).filter(([, v]) => v != null && v !== '' && v !== '—');

  const node = (
    <>
    {/* Hero morph: the bag flies from the shelf rect into the card's bag rect, then the
        card's own bag takes over (morphDone). Pure transform; sits above the scrim. */}
    {morph && !morphDone && (
      <m.img
        src={bagSrc} alt=""
        initial={{
          x: (morph.from.x + morph.from.width / 2) - (morph.to.x + morph.to.width / 2),
          y: (morph.from.y + morph.from.height / 2) - (morph.to.y + morph.to.height / 2),
          scale: morph.from.width / morph.to.width,
        }}
        animate={{ x: 0, y: 0, scale: 1 }}
        transition={heroSpring}
        onAnimationComplete={() => setMorphDone(true)}
        style={{
          position: 'fixed', left: morph.to.x, top: morph.to.y, width: morph.to.width, height: morph.to.height,
          objectFit: 'contain', zIndex: 4600, pointerEvents: 'none',
          filter: 'drop-shadow(0 18px 26px rgba(20,12,8,0.20))',
        }}
      />
    )}
    <AnimatePresence>
      <m.div
        key="scrim"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.22 }}
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 4000, background: 'rgba(33,19,10,0.55)', WebkitBackdropFilter: 'blur(4px)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'max(18px, env(safe-area-inset-top)) 16px max(16px, env(safe-area-inset-bottom))' }}
      >
        <m.div
          key="card"
          // Morph active: the bag travels via layoutId, so the card frame just fades in
          // (scale/y would fight the FLIP). Reduced-motion: keep the scale/rise present.
          initial={reduce ? { opacity: 0, scale: 0.9, y: 20 } : { opacity: 0 }}
          animate={reduce ? { opacity: 1, scale: 1, y: 0 } : { opacity: 1 }}
          exit={reduce ? { opacity: 0, scale: 0.93, y: 12 } : { opacity: 0 }}
          transition={spring.soft}
          onClick={(e) => e.stopPropagation()}
          drag={flipped ? false : (swipeEnabled ? true : 'y')}
          dragDirectionLock
          dragConstraints={swipeEnabled ? { top: 0, bottom: 0, left: 0, right: 0 } : { top: 0, bottom: 0 }}
          dragElastic={swipeEnabled ? { top: 0, bottom: 0.6, left: nextBean ? 0.5 : 0.12, right: prevBean ? 0.5 : 0.12 } : { top: 0, bottom: 0.6 }}
          onDragEnd={onFrontDragEnd}
          style={{ width: '100%', maxWidth: 384, height: 'min(90vh, 720px)', perspective: 2200, touchAction: flipped ? 'pan-y' : 'none', x, rotateZ }}
        >
          <m.div
            animate={{ rotateY: flipped ? 180 : 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 28, mass: 1.15 }}
            style={{ position: 'relative', width: '100%', height: '100%', transformStyle: 'preserve-3d', borderRadius: 24, scale: dipScale, boxShadow: cardShadow }}
          >
            {/* ===================== FRONT ===================== */}
            <div style={{ ...faceBase, opacity: flipped ? 0 : 1, transition: 'opacity 0s linear 0.22s' }}>
              <RedFrame>
                <VRoaster name={roaster} />
                {/* bag = hero (clean: a gentle, near-imperceptible float gives it life
                    without gimmicks — no fake sheen/steam on a matte sealed bag) */}
                <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2px 10px 0', minHeight: 0 }}>
                  {bean.photoUrl
                    ? <m.div
                        ref={bagWrapRef}
                        // single content-sized wrapper (stays centered by the parent); ref measures
                        // the morph target, opacity hides it until handoff, float parks till morphDone.
                        animate={(reduce || !morphDone) ? {} : { y: [0, -5, 0] }}
                        transition={{ duration: 6, ease: 'easeInOut', repeat: Infinity }}
                        style={{ maxWidth: '88%', maxHeight: '87%', display: 'flex', opacity: morphDone ? 1 : 0 }}
                      >
                        <img src={bagSrc} alt={bean.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', filter: 'drop-shadow(0 18px 26px rgba(20,12,8,0.20))' }} />
                      </m.div>
                    : <span style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 200, color: '#EDE9E1' }}>{(bean.name || '?').charAt(0)}</span>}
                </div>

                {/* nameplate + meta (lower third) */}
                <div style={{ flexShrink: 0, padding: '2px 20px 14px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: '100%', textAlign: 'center' }}>
                    <div style={{ fontFamily: G, fontWeight: 700, fontSize: 32, letterSpacing: '-0.02em', color: INK, lineHeight: 0.98 }}>{bean.name}</div>
                    {originParts.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 7, width: '100%' }}>
                        <span style={{ width: 14, height: 2, background: INK, borderRadius: 1, flexShrink: 0 }} />
                        <FitText max={12} min={8} style={{ fontFamily: G, fontWeight: 600, letterSpacing: '0.12em', color: INK, textAlign: 'center', flex: '0 1 auto' }}>
                          {originParts.map((p, i) => (
                            <span key={i}>{i > 0 && <span style={{ color: BLUE, fontWeight: 800, margin: '0 9px' }}>•</span>}{p}</span>
                          ))}
                        </FitText>
                        <span style={{ width: 14, height: 2, background: INK, borderRadius: 1, flexShrink: 0 }} />
                      </div>
                    )}
                  </div>

                  {notes.length > 0 && <NoteRow notes={notes} fade={PAPER} />}

                  <div style={{ display: 'flex', alignItems: 'center', width: '100%', border: `1px solid ${HAIR}`, borderRadius: 14, padding: '10px 2px' }}>
                    <StatBarItem icon={<Flame size={20} color={INK} />} label="Roast" value={(bean.roastLevel || 'Light')} meter />
                    <div style={{ width: 1, alignSelf: 'stretch', background: HAIR, margin: '2px 0' }} />
                    <StatBarItem icon={<Leaf size={20} color={INK} />} label="Variety" value={bean.variety || '—'} />
                    <div style={{ width: 1, alignSelf: 'stretch', background: HAIR, margin: '2px 0' }} />
                    <StatBarItem icon={<WeightIcon />} label="Weight" value={bean.bagSize ? `${bean.bagSize}g` : '—'} />
                  </div>

                  {/* Sealed beans (opened from Inventory) lead with "Open into jar"; the
                      stat-sheet flip becomes the secondary action below it. */}
                  {onOpen && (
                    <m.button onClick={() => onOpen(bean)} whileTap={{ scale: 0.96, y: 1 }} transition={spring.snappy} style={{ position: 'relative', width: '100%', border: '1px solid rgba(255,255,255,0.45)', borderRadius: 14, padding: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, cursor: 'pointer', overflow: 'hidden', background: 'linear-gradient(180deg, rgba(86,196,240,0.94) 0%, rgba(20,150,212,0.96) 55%, rgba(12,120,180,0.97) 100%)', WebkitBackdropFilter: 'blur(12px) saturate(170%)', backdropFilter: 'blur(12px) saturate(170%)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6), inset 0 -2px 6px rgba(8,60,95,0.28), 0 2px 4px rgba(16,90,130,0.22), 0 10px 24px rgba(24,165,224,0.40)' }}>
                      <span aria-hidden style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '52%', background: 'linear-gradient(180deg, rgba(255,255,255,0.42) 0%, rgba(255,255,255,0.04) 100%)', borderTopLeftRadius: 13, borderTopRightRadius: 13, pointerEvents: 'none' }} />
                      <img src="/images/jar-full.webp" alt="" style={{ width: 22, height: 22, objectFit: 'contain', position: 'relative', zIndex: 1, filter: 'brightness(0) invert(1) drop-shadow(0 1px 1px rgba(8,50,80,0.3))' }} />
                      <span style={{ position: 'relative', zIndex: 1, fontFamily: G, fontWeight: 700, fontSize: 14, letterSpacing: '0.14em', color: '#fff', textShadow: '0 1px 2px rgba(8,50,80,0.35)' }}>OPEN INTO JAR</span>
                    </m.button>
                  )}

                  <m.button onClick={() => doFlip(true)} whileTap={{ scale: 0.96, y: 1 }} transition={{ type: 'spring', stiffness: 700, damping: 30, mass: 0.6 }} style={{ position: 'relative', width: '100%', border: onOpen ? `1px solid ${HAIR}` : '1px solid rgba(255,255,255,0.45)', borderRadius: 14, padding: onOpen ? '12px' : '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, cursor: 'pointer', overflow: 'hidden', ...(onOpen ? { background: '#FFFFFF' } : { background: 'linear-gradient(180deg, rgba(86,196,240,0.94) 0%, rgba(20,150,212,0.96) 55%, rgba(12,120,180,0.97) 100%)', WebkitBackdropFilter: 'blur(12px) saturate(170%)', backdropFilter: 'blur(12px) saturate(170%)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6), inset 0 -2px 6px rgba(8,60,95,0.28), 0 2px 4px rgba(16,90,130,0.22), 0 10px 24px rgba(24,165,224,0.40)' }) }}>
                    {!onOpen && <span aria-hidden style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '52%', background: 'linear-gradient(180deg, rgba(255,255,255,0.42) 0%, rgba(255,255,255,0.04) 100%)', borderTopLeftRadius: 13, borderTopRightRadius: 13, pointerEvents: 'none' }} />}
                    <span style={{ position: 'relative', zIndex: 1, fontFamily: G, fontWeight: 700, fontSize: onOpen ? 12.5 : 14, letterSpacing: '0.14em', color: onOpen ? GRAY : '#fff', textShadow: onOpen ? 'none' : '0 1px 2px rgba(8,50,80,0.35)' }}>VIEW STAT SHEET</span>
                    <ArrowRight size={onOpen ? 16 : 18} color={onOpen ? GRAY : '#fff'} style={{ position: 'relative', zIndex: 1, filter: onOpen ? 'none' : 'drop-shadow(0 1px 1px rgba(8,50,80,0.3))' }} />
                  </m.button>
                </div>
              </RedFrame>
              {/* badge straddles the top-right corner, over the borders */}
              <div style={{ position: 'absolute', top: -16, right: -8, zIndex: 10 }}><PeakBadge bean={bean} /></div>
              <button onClick={onClose} aria-label="Close" style={{ position: 'absolute', top: 16, left: 38, zIndex: 11, width: 26, height: 26, borderRadius: '50%', border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={16} color={GRAY} /></button>
            </div>

            {/* ===================== BACK ===================== */}
            <div style={{ ...faceBase, transform: 'rotateY(180deg)', opacity: flipped ? 1 : 0, transition: 'opacity 0s linear 0.22s' }}>
              <RedFrame>
                <Grabber onClose={onClose} />
                <div ref={backScrollRef} {...backPull} style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '6px 24px 16px' }}>
                  <div style={{ ...lbl, fontSize: 13, letterSpacing: '0.22em', color: INK, marginBottom: 6 }}>STAT SHEET</div>
                  <div style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 33, color: INK, lineHeight: 1.02, marginBottom: 20, paddingRight: 70 }}>{bean.name}</div>

                  {!isFinished && <CardPeakBar bean={bean} />}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 22, rowGap: 16, marginBottom: 22 }}>
                    {stats.map(([label, value]) => <GridCell key={label} label={label} value={value} />)}
                  </div>

                  {notes.length > 0 && (
                    <Panel>
                      <div style={{ ...lbl, fontSize: 11, color: GREEN, marginBottom: 12 }}>Tasting Notes</div>
                      <NoteRow notes={notes} green fade="#FFFFFF" />
                    </Panel>
                  )}

                  {insightShort && (
                    <Panel>
                      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                        <Mountain size={26} color={GREEN} strokeWidth={1.5} style={{ flexShrink: 0, marginTop: 2 }} />
                        <div style={{ borderLeft: `1px solid ${HAIR}`, paddingLeft: 14, flex: 1, minWidth: 0 }}>
                          <div style={{ ...lbl, fontSize: 11, color: GREEN, marginBottom: 5 }}>Source Insight</div>
                          <div style={{ fontFamily: G, fontSize: 13.5, color: '#3A3632', lineHeight: 1.5 }}>{insightOpen ? insightFull : insightShort}</div>
                          {canExpandInsight && (
                            <button onClick={() => setInsightOpen(o => !o)} style={{ marginTop: 7, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: G, fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', color: GREEN }}>
                              {insightOpen ? 'Show less' : 'Read more'}
                            </button>
                          )}
                        </div>
                      </div>
                    </Panel>
                  )}

                  <Panel>
                    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                      <Coffee size={26} color={BLUE} strokeWidth={1.5} style={{ flexShrink: 0, marginTop: 2 }} />
                      <div style={{ borderLeft: `1px solid ${HAIR}`, paddingLeft: 14, flex: 1 }}>
                        <div style={{ ...lbl, fontSize: 11, color: BLUE, marginBottom: 8 }}>Your Tastings {beanTastings.length > 0 && `· ${beanTastings.length}`}</div>
                        {beanTastings.length === 0
                          ? <div style={{ fontFamily: G, fontSize: 13.5, fontStyle: 'italic', color: GRAY }}>No tastings logged yet for this bean.</div>
                          : <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                              {beanTastings.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')).map((t, i) => {
                                // Compact: headline quote + flavors only. Tap to open the full tasting.
                                const flavorStr = splitTastingNotes(t.notes).flavors;
                                const flavorList = flavorStr ? flavorStr.split(',').map(s => s.trim()).filter(Boolean) : [];
                                const tappable = !!onOpenTasting;
                                return (
                                  <div
                                    key={t.id}
                                    onClick={tappable ? () => onOpenTasting(t) : undefined}
                                    role={tappable ? 'button' : undefined}
                                    style={{ paddingTop: i > 0 ? 12 : 0, borderTop: i > 0 ? `1px solid ${HAIR}` : 'none', cursor: tappable ? 'pointer' : 'default', WebkitTapHighlightColor: 'transparent' }}
                                  >
                                    {/* date + rating (+ tap affordance) */}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: t.oneWord ? 5 : 0 }}>
                                      <span style={{ fontFamily: G, fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', color: GRAY }}>{formatDate(t.date) || t.date}{t.method ? ` · ${t.method}` : ''}</span>
                                      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                        <CardStars value={t.rating || 0} size={13} />
                                        {tappable && <ChevronRight size={14} color={GRAY} style={{ flexShrink: 0 }} />}
                                      </span>
                                    </div>
                                    {t.oneWord && <div style={{ fontFamily: SERIF, fontSize: 17, fontWeight: 600, fontStyle: 'italic', color: INK, lineHeight: 1.15 }}>“{t.oneWord}”</div>}
                                    {flavorList.length > 0 && (
                                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                                        {flavorList.map(f => (
                                          <span key={f} style={{ fontFamily: G, fontSize: 11.5, fontWeight: 700, color: INK, background: '#F2EEE7', border: `1px solid ${HAIR}`, borderRadius: 999, padding: '3px 9px', textTransform: 'capitalize' }}>{f}</span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>}
                      </div>
                    </div>
                  </Panel>

                  {/* Saved brew profile (archive only) — read-only recap of stored recipes */}
                  {showBrewProfile && (bean.aidenRecipe || bean.handBrewRecipe) && (
                    <Panel>
                      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                        <Coffee size={26} color={INK} strokeWidth={1.5} style={{ flexShrink: 0, marginTop: 2 }} />
                        <div style={{ borderLeft: `1px solid ${HAIR}`, paddingLeft: 14, flex: 1, minWidth: 0 }}>
                          <div style={{ ...lbl, fontSize: 11, color: INK, marginBottom: 8 }}>Brew Profile</div>
                          {bean.aidenRecipe && (
                            <div style={{ marginBottom: bean.handBrewRecipe ? 10 : 0 }}>
                              <div style={{ fontFamily: G, fontSize: 12.5, fontWeight: 700, color: '#3A3632', marginBottom: 2 }}>Aiden Recipe</div>
                              <div style={{ fontFamily: G, fontSize: 13, color: GRAY, lineHeight: 1.5 }}>
                                {[bean.aidenRecipe.ratio && `Ratio ${bean.aidenRecipe.ratio}`, bean.aidenRecipe.bloomTime && `Bloom ${bean.aidenRecipe.bloomTime}`, bean.aidenRecipe.pulseCount && `${bean.aidenRecipe.pulseCount} pulses`, bean.aidenRecipe.grindRecommendation?.singleServe && `Grind ${bean.aidenRecipe.grindRecommendation.singleServe}`].filter(Boolean).join(' · ')}
                              </div>
                            </div>
                          )}
                          {bean.handBrewRecipe && (
                            <div>
                              <div style={{ fontFamily: G, fontSize: 12.5, fontWeight: 700, color: '#3A3632', marginBottom: 2 }}>{bean.handBrewRecipe.title || 'Hand Brew'}</div>
                              <div style={{ fontFamily: G, fontSize: 13, color: GRAY, lineHeight: 1.5 }}>
                                {[bean.handBrewRecipe.method, bean.handBrewRecipe.coffeeGrams && bean.handBrewRecipe.waterGrams && `${bean.handBrewRecipe.coffeeGrams}g / ${bean.handBrewRecipe.waterGrams}g`, bean.handBrewRecipe.ratio, bean.handBrewRecipe.grindSize?.description && `Grind ${bean.handBrewRecipe.grindSize.description}`].filter(Boolean).join(' · ')}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </Panel>
                  )}

                  {/* flip back to front */}
                  <button onClick={() => doFlip(false)} style={{ width: '100%', background: 'transparent', border: `1.5px solid ${BLUE}`, borderRadius: 13, padding: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, cursor: 'pointer', marginTop: 6 }}>
                    <RotateCcw size={16} color={BLUE} />
                    <span style={{ fontFamily: G, fontWeight: 700, fontSize: 13, letterSpacing: '0.14em', color: BLUE }}>BACK TO CARD</span>
                  </button>

                  {/* management actions — only those with a handler (e.g. sealed Inventory
                      beans have no "Return"), grid sized to the count so it stays even */}
                  {(() => {
                    const acts = [
                      onLearn && { icon: <BookOpen size={16} />, label: 'Learn', onClick: () => onLearn(bean) },
                      onFreeze && { icon: <Snowflake size={16} />, label: bean.frozenAt ? 'Frozen' : 'Freeze', onClick: () => onFreeze(bean), active: !!bean.frozenAt },
                      onReturn && { icon: <Undo2 size={16} />, label: 'Return', onClick: () => onReturn(bean) },
                      onRestore && { icon: <RotateCcw size={16} />, label: 'Restore', onClick: () => { if (window.confirm('Move back to inventory?')) onRestore(bean); } },
                      onFinish && { icon: <Check size={16} />, label: 'Finish', onClick: () => onFinish(bean) },
                      onEdit && { icon: <Pencil size={16} />, label: 'Edit', onClick: () => onEdit(bean) },
                      onDelete && { icon: <Trash2 size={16} />, label: 'Delete', danger: true, onClick: () => { if (window.confirm('Delete this bean? Tastings will be removed.')) onDelete(bean); } },
                    ].filter(Boolean);
                    return (
                      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${acts.length}, 1fr)`, gap: 8, marginTop: 16, paddingTop: 14, borderTop: `1px solid ${HAIR}` }}>
                        {acts.map((a, i) => <MiniAction key={i} {...a} />)}
                      </div>
                    );
                  })()}
                </div>
              </RedFrame>
              {/* badge straddles the top-right corner, tappable to flip back */}
              <button onClick={() => doFlip(false)} aria-label="Flip to front" style={{ position: 'absolute', top: -16, right: -8, zIndex: 10, border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}><PeakBadge bean={bean} /></button>
            </div>
          </m.div>
        </m.div>
      </m.div>
    </AnimatePresence>
    </>
  );
  return createPortal(node, document.body);
}
