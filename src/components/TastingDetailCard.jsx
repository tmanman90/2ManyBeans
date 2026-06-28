// TastingDetailCard — tap a journal cup to open this. An organized, animated review:
// the FlavorRadar draws in as the hero, then rating + one-word, then each flavor axis
// reveals in sequence with its descriptor, the free notes, and redesigned actions. A
// slide-up sheet (iOS curve), swipe-to-dismiss. Presentation only — no data writes here.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Share2, Pencil, Trash2 } from 'lucide-react';
import { C, fonts, type, glass, shadows, radius } from '../styles/theme';
import { m } from '../lib/motion';
import { useReducedMotion } from 'framer-motion';
import { StarRating } from './StarRating';
import { SwipeDownHandle } from './SwipeDownHandle';
import { FlavorRadar } from './FlavorRadar';

const IOS = 'cubic-bezier(0.32, 0.72, 0, 1)';
// The organized flavor rows — one descriptor per line (no wall of text).
const DETAIL_AXES = [
  ['aroma', 'Aroma'], ['firstSip', 'First sip'], ['acidity', 'Acidity'],
  ['sweetness', 'Sweetness'], ['body', 'Body'], ['finish', 'Finish'],
];

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00');
  return isNaN(d) ? iso : d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function ActionBtn({ icon, label, danger, onClick }) {
  return (
    <m.button
      onClick={onClick}
      whileTap={{ scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 600, damping: 28 }}
      style={{
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
        padding: '11px 6px', background: C.bgDeep, border: `1px solid ${C.hairline}`, borderRadius: radius.md,
        cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
        color: danger ? C.red : C.textMuted, fontFamily: fonts.body, fontWeight: 700, fontSize: 11, letterSpacing: '0.03em',
      }}
    >
      <span style={{ display: 'inline-flex', color: danger ? C.red : C.text }}>{icon}</span>
      {label}
    </m.button>
  );
}

export function TastingDetailCard({ tasting, bean, onClose, onShare, onEdit, onDelete }) {
  const reduce = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);

  useEffect(() => {
    if (!tasting) { setMounted(false); setClosing(false); closingRef.current = false; return; }
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, [tasting]);

  useEffect(() => {
    if (!tasting) return;
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasting]);

  if (!tasting) return null;

  const close = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    setTimeout(() => { setMounted(false); setClosing(false); closingRef.current = false; onClose?.(); }, 240);
  };

  const visible = mounted && !closing;
  const rows = DETAIL_AXES.filter(([k]) => tasting[k] && String(tasting[k]).trim());
  const reveal = (i) => reduce ? {} : {
    initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 },
    transition: { delay: 0.15 + i * 0.05, duration: 0.32, ease: [0.16, 1, 0.3, 1] },
  };

  return createPortal(
    <div
      onClick={close}
      style={{
        position: 'fixed', inset: 0, zIndex: 1200, background: glass.scrim,
        WebkitBackdropFilter: 'blur(3px)', backdropFilter: 'blur(3px)',
        opacity: visible ? 1 : 0, transition: 'opacity 220ms ease',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        role="dialog" aria-modal="true" aria-label={`${bean?.name || 'Tasting'} review`}
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 520, maxHeight: '92dvh', overflowY: 'auto', WebkitOverflowScrolling: 'touch',
          background: C.bg, borderRadius: `${radius.xl}px ${radius.xl}px 0 0`, border: `1px solid ${glass.chromeBorder}`,
          boxShadow: shadows.modal, transform: `translateY(${visible ? '0%' : '100%'})`, transition: `transform 320ms ${IOS}`,
          paddingBottom: 'max(20px, env(safe-area-inset-bottom, 0px))',
        }}
      >
        <SwipeDownHandle onClose={close} />

        {/* header */}
        <div style={{ padding: '4px 22px 0', textAlign: 'center' }}>
          <div style={{ ...type.label, color: C.textLight }}>{bean?.roaster || 'Tasting'}</div>
          <div style={{ ...type.h1, color: C.text, marginTop: 3 }}>{bean?.name || 'Tasting'}</div>
          <div style={{ ...type.caption, color: C.textLight, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{formatDate(tasting.date)}</div>
        </div>

        {/* hero radar — draws in */}
        <div style={{ padding: '10px 16px 4px' }}>
          <FlavorRadar tasting={tasting} size={252} />
        </div>

        {/* rating + one-word headline */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '0 22px 6px' }}>
          {tasting.rating ? <StarRating value={tasting.rating} size={24} /> : null}
          {tasting.oneWord && (
            <div style={{ fontFamily: fonts.heading, fontStyle: 'italic', fontSize: 26, fontWeight: 600, color: C.accentDark, lineHeight: 1.1, textAlign: 'center', letterSpacing: '-0.01em' }}>
              “{tasting.oneWord}”
            </div>
          )}
        </div>

        {/* organized flavor rows */}
        {rows.length > 0 && (
          <div style={{ padding: '12px 20px 4px' }}>
            <div style={{ ...type.label, color: C.textMuted, marginBottom: 8 }}>Flavor notes</div>
            <div>
              {rows.map(([k, label], i) => (
                <m.div key={k} {...reveal(i)} style={{ display: 'flex', gap: 14, alignItems: 'baseline', padding: '11px 0', borderBottom: i < rows.length - 1 ? `1px solid ${C.hairline}` : 'none' }}>
                  <div style={{ ...type.label, color: C.textLight, width: 88, flexShrink: 0 }}>{label}</div>
                  <div style={{ ...type.body, color: C.text, flex: 1, lineHeight: 1.45 }}>{tasting[k]}</div>
                </m.div>
              ))}
            </div>
          </div>
        )}

        {/* free notes */}
        {tasting.notes && (
          <div style={{ padding: '12px 20px 4px' }}>
            <div style={{ ...type.label, color: C.textMuted, marginBottom: 8 }}>Your notes</div>
            <div style={{ fontFamily: fonts.heading, fontStyle: 'italic', fontSize: 16, color: C.text, lineHeight: 1.5, background: C.cream, border: `1px solid ${C.borderLight}`, borderRadius: radius.md, padding: '14px 16px' }}>
              “{tasting.notes}”
            </div>
          </div>
        )}

        {/* actions */}
        <div style={{ display: 'flex', gap: 8, padding: '16px 20px 8px' }}>
          {onShare && <ActionBtn icon={<Share2 size={17} />} label="Share" onClick={() => onShare(tasting)} />}
          {onEdit && <ActionBtn icon={<Pencil size={17} />} label="Edit" onClick={() => { close(); onEdit(tasting); }} />}
          {onDelete && <ActionBtn icon={<Trash2 size={17} />} label="Delete" danger onClick={() => onDelete(tasting)} />}
        </div>
      </div>
    </div>,
    document.body
  );
}
