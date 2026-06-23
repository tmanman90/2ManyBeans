// Archive detail bottom sheet — full bean metadata + tasting history + restore/delete.
// Uses the same portal + slide-up / fade-backdrop pattern as ProfessorRuphusSlideUp.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { C, fonts, glass, shadows, radius, type } from '../styles/theme';
import { BeanThumb } from './BeanThumb';
import { SwipeDownHandle } from './SwipeDownHandle';
import { summarizeSourceInsights } from '../lib/sourceInsights';

function ArchiveStars({ value, size = 12 }) {
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

function formatFinishDay(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
}

function formatTastingDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function diffDays(laterStr, earlierStr) {
  if (!laterStr || !earlierStr) return null;
  const a = new Date(laterStr + 'T00:00:00');
  const b = new Date(earlierStr + 'T00:00:00');
  if (isNaN(a) || isNaN(b)) return null;
  const days = Math.round((a - b) / 86400000);
  return days >= 0 ? days : null;
}

// Eyebrow label style — uppercase tracked label replacing script section titles
const eyebrow = {
  ...type.label,
  color: C.textMuted,
  marginBottom: 10,
  display: 'block',
};

const accentEyebrow = {
  ...type.label,
  color: C.accent,
  marginBottom: 10,
  display: 'block',
};

function Row({ label, value }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        padding: '9px 0',
        borderBottom: `1px solid ${C.hairline}`,
        gap: 12,
      }}
    >
      <div style={{ ...type.label, color: C.textLight, marginBottom: 0 }}>
        {label}
      </div>
      <div
        style={{
          ...type.body,
          color: C.text,
          fontFamily: fonts.body,
          textAlign: 'right',
          maxWidth: '60%',
        }}
      >
        {value}
      </div>
    </div>
  );
}

export function ArchiveDetailSheet({
  bean,
  tastings = [],
  onClose,
  onRestore,
  onDelete,
  onLearn,
  onEditPhoto,
}) {
  const [mounted, setMounted] = useState(false);
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);

  useEffect(() => {
    if (!bean) {
      setMounted(false);
      setClosing(false);
      closingRef.current = false;
      return;
    }
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, [bean]);

  useEffect(() => {
    if (!bean) return;
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bean]);

  if (!bean) return null;

  const close = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    setTimeout(() => {
      setMounted(false);
      setClosing(false);
      closingRef.current = false;
      onClose?.();
    }, 220);
  };

  const handleRestore = () => {
    if (!confirm('Move back to inventory?')) return;
    onRestore?.(bean);
    close();
  };

  const handleDelete = () => {
    if (!confirm('Delete this bean? Tastings will be removed.')) return;
    onDelete?.(bean);
    close();
  };

  const beanTastings = tastings
    .filter(t => t.beanId === bean.id)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const best = beanTastings.reduce((m, t) => (t.rating && t.rating > m ? t.rating : m), 0) || null;
  const dOwn = diffDays(bean.finishDate, bean.roastDate);
  const dOpen = diffDays(bean.finishDate, bean.openDate);
  const sourceSummary = summarizeSourceInsights(bean, { maxChars: 260 });

  const visible = mounted && !closing;

  return createPortal(
    <div
      onClick={close}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1100,
        background: glass.scrim,
        backdropFilter: glass.blur,
        WebkitBackdropFilter: glass.blur,
        opacity: visible ? 1 : 0,
        transition: 'opacity 200ms ease',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${bean.name} details`}
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 520,
          maxHeight: '88dvh',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          background: glass.sheet,
          backdropFilter: glass.blurStrong,
          WebkitBackdropFilter: glass.blurStrong,
          borderRadius: `${radius.xl}px ${radius.xl}px 0 0`,
          border: `1px solid ${glass.chromeBorder}`,
          boxShadow: shadows.modal,
          transform: `translateY(${visible ? '0%' : '100%'})`,
          transition: 'transform 280ms cubic-bezier(0.22,1,0.36,1)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        <SwipeDownHandle onClose={close} />

        {/* Hero */}
        <div style={{ padding: '8px 20px 16px', display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          <div
            onClick={e => { e.stopPropagation(); onEditPhoto?.(bean); }}
            style={{
              width: 88,
              height: 88,
              borderRadius: radius.md,
              overflow: 'hidden',
              flexShrink: 0,
              background: C.accentSoft,
              boxShadow: `0 0 0 1px ${C.hairline}, ${shadows.e2}`,
              cursor: onEditPhoto ? 'pointer' : 'default',
              position: 'relative',
            }}
          >
            <BeanThumb bean={bean} size={88} />
            {onEditPhoto && (
              <div style={{
                position: 'absolute', bottom: 4, right: 4,
                width: 26, height: 26, borderRadius: '50%',
                background: 'rgba(42,26,16,0.65)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {bean.photoUrl
                  ? <Pencil size={12} color="#fff" />
                  : <Camera size={12} color="#fff" />}
              </div>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
            {/* Roaster eyebrow */}
            <div style={{ ...type.label, color: C.textMuted, marginBottom: 5 }}>
              {bean.roaster || ''}
            </div>
            {/* Bean name in Fraunces display */}
            <div
              style={{
                fontFamily: fonts.heading,
                fontSize: 22,
                lineHeight: 1.12,
                color: C.text,
                fontWeight: 600,
                letterSpacing: '-0.01em',
                marginBottom: 8,
              }}
            >
              {bean.name}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {best && <ArchiveStars value={best} size={13} />}
              <span style={{ ...type.caption, color: C.textLight, fontFamily: fonts.body }}>
                {beanTastings.length} {beanTastings.length === 1 ? 'tasting' : 'tastings'}
              </span>
              {onLearn && (
                <button
                  onClick={() => onLearn(bean)}
                  title="Learn about this coffee"
                  style={{
                    marginLeft: 'auto',
                    minWidth: 44,
                    minHeight: 44,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 4,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <img
                    src="/images/professor-ruphus.webp"
                    alt="Learn"
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: '50%',
                      objectFit: 'cover',
                      border: `2px solid ${C.accentLight}`,
                    }}
                  />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Ownership strip */}
        <div
          style={{
            margin: '0 20px 18px',
            padding: '14px 16px',
            background: C.accentSoft,
            border: `1px solid ${C.borderLight}`,
            borderRadius: radius.md,
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ textAlign: 'center', flex: 1 }}>
            <div style={{ fontFamily: fonts.heading, fontSize: 22, color: C.accent, fontWeight: 600, lineHeight: 1 }}>
              {dOwn ?? '—'}
            </div>
            <div style={{ ...type.label, color: C.textMuted, marginTop: 4, marginBottom: 0 }}>
              Days owned
            </div>
          </div>
          <div style={{ width: 1, background: C.hairline, margin: '0 8px' }} />
          <div style={{ textAlign: 'center', flex: 1 }}>
            <div style={{ fontFamily: fonts.heading, fontSize: 22, color: C.accent, fontWeight: 600, lineHeight: 1 }}>
              {dOpen ?? '—'}
            </div>
            <div style={{ ...type.label, color: C.textMuted, marginTop: 4, marginBottom: 0 }}>
              Days open
            </div>
          </div>
          <div style={{ width: 1, background: C.hairline, margin: '0 8px' }} />
          <div style={{ textAlign: 'center', flex: 1 }}>
            <div
              style={{
                fontFamily: fonts.heading,
                fontSize: 14,
                color: C.text,
                fontWeight: 500,
                marginTop: 4,
                lineHeight: 1.2,
              }}
            >
              {formatFinishDay(bean.finishDate)}
            </div>
            <div style={{ ...type.label, color: C.textMuted, marginTop: 4, marginBottom: 0 }}>
              Finished
            </div>
          </div>
        </div>

        {/* Metadata */}
        <div style={{ padding: '0 20px' }}>
          <span style={accentEyebrow}>From the bag</span>
          <Row label="Origin" value={bean.origin} />
          <Row label="Region" value={bean.region} />
          <Row label="Farm" value={bean.farm} />
          <Row label="Variety" value={bean.variety} />
          <Row label="Process" value={bean.process} />
          <Row label="Altitude" value={bean.altitude} />
          <Row label="Roast" value={bean.roastLevel} />
          <Row label="Cup score" value={bean.cupScore} />
          <Row label="Weight" value={bean.bagSize ? `${bean.bagSize}g` : null} />
          {sourceSummary && (
            <div style={{ padding: '14px 0 4px' }}>
              <span style={eyebrow}>Source insight</span>
              <div
                style={{
                  ...type.bodyL,
                  color: C.text,
                  fontFamily: fonts.body,
                  lineHeight: 1.5,
                  background: C.bgDeep,
                  borderRadius: radius.sm,
                  padding: '12px 14px',
                  border: `1px solid ${C.hairline}`,
                }}
              >
                {sourceSummary}
              </div>
            </div>
          )}
          {bean.bagNotes && (
            <div style={{ padding: '14px 0 4px' }}>
              <span style={eyebrow}>Roaster's notes</span>
              <div
                style={{
                  fontFamily: fonts.heading,
                  fontSize: 15,
                  color: C.text,
                  fontStyle: 'italic',
                  lineHeight: 1.5,
                  background: C.accentSoft,
                  borderRadius: radius.sm,
                  padding: '12px 14px',
                  border: `1px solid ${C.borderLight}`,
                }}
              >
                &ldquo;{bean.bagNotes}&rdquo;
              </div>
            </div>
          )}
        </div>

        {/* Brew Profile (read-only archive of saved recipes) */}
        {(bean.aidenRecipe || bean.handBrewRecipe) && (
          <div style={{ padding: '18px 20px 4px' }}>
            <span style={accentEyebrow}>Brew Profile</span>
            {bean.aidenRecipe && (
              <div style={{
                background: C.card,
                borderRadius: radius.md,
                padding: '12px 14px',
                border: `1px solid ${C.borderLight}`,
                boxShadow: shadows.e1,
                marginBottom: 8,
              }}>
                <div style={{ ...type.h3, color: C.text, fontFamily: fonts.body, marginBottom: 5 }}>
                  Aiden Recipe
                </div>
                <div style={{ ...type.body, color: C.textMuted, lineHeight: 1.6 }}>
                  {bean.aidenRecipe.ratio && <span>Ratio: {bean.aidenRecipe.ratio} &middot; </span>}
                  {bean.aidenRecipe.bloomTime && <span>Bloom: {bean.aidenRecipe.bloomTime} &middot; </span>}
                  {bean.aidenRecipe.pulseCount && <span>{bean.aidenRecipe.pulseCount} pulses &middot; </span>}
                  {bean.aidenRecipe.grindRecommendation?.singleServe && (
                    <span>Grind SS: {bean.aidenRecipe.grindRecommendation.singleServe}</span>
                  )}
                </div>
                {bean.aidenLink && (
                  <a
                    href={bean.aidenLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-block', marginTop: 8,
                      fontSize: 12, color: C.accent, textDecoration: 'none',
                      fontFamily: fonts.body, fontWeight: 600,
                    }}
                  >
                    Open in Aiden App
                  </a>
                )}
              </div>
            )}
            {bean.handBrewRecipe && (
              <div style={{
                background: C.card,
                borderRadius: radius.md,
                padding: '12px 14px',
                border: `1px solid ${C.borderLight}`,
                boxShadow: shadows.e1,
                marginBottom: 8,
              }}>
                <div style={{ ...type.h3, color: C.text, fontFamily: fonts.body, marginBottom: 5 }}>
                  {bean.handBrewRecipe.title || 'Hand Brew Recipe'}
                </div>
                <div style={{ ...type.body, color: C.textMuted, lineHeight: 1.6 }}>
                  {bean.handBrewRecipe.method && <span>{bean.handBrewRecipe.method} &middot; </span>}
                  {bean.handBrewRecipe.technique && <span>{bean.handBrewRecipe.technique} &middot; </span>}
                  {bean.handBrewRecipe.coffeeGrams && bean.handBrewRecipe.waterGrams && (
                    <span>{bean.handBrewRecipe.coffeeGrams}g / {bean.handBrewRecipe.waterGrams}g &middot; </span>
                  )}
                  {bean.handBrewRecipe.ratio && <span>{bean.handBrewRecipe.ratio} &middot; </span>}
                  {bean.handBrewRecipe.grindSize?.description && (
                    <span>Grind: {bean.handBrewRecipe.grindSize.description}</span>
                  )}
                </div>
                {bean.handBrewRecipe.totalBrewTime && (
                  <div style={{ ...type.body, color: C.textMuted, marginTop: 4 }}>
                    Total brew time: {bean.handBrewRecipe.totalBrewTime}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Tasting history */}
        {beanTastings.length > 0 && (
          <div style={{ padding: '18px 20px 4px' }}>
            <span style={accentEyebrow}>Tasting history</span>

            {beanTastings.map((t, i) => (
              <div
                key={t.id || i}
                style={{
                  position: 'relative',
                  paddingLeft: 22,
                  paddingBottom: 18,
                  borderLeft: i < beanTastings.length - 1 ? `2px solid ${C.borderLight}` : 'none',
                  marginLeft: 6,
                }}
              >
                {/* Timeline dot */}
                <div
                  style={{
                    position: 'absolute',
                    left: -7,
                    top: 3,
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    background: C.accent,
                    boxShadow: `0 0 0 3px ${C.cream}, 0 0 0 4.5px ${C.accentLight}`,
                  }}
                />
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    marginBottom: 4,
                  }}
                >
                  <div style={{ ...type.body, fontWeight: 700, color: C.text, fontFamily: fonts.body }}>
                    {formatTastingDate(t.date)}
                  </div>
                  {t.rating ? <ArchiveStars value={t.rating} size={11} /> : null}
                </div>
                {t.method && (
                  <div
                    style={{
                      ...type.caption,
                      color: C.textMuted,
                      marginBottom: 7,
                      fontFamily: fonts.body,
                    }}
                  >
                    {t.method}
                  </div>
                )}
                {t.notes && (
                  <div
                    style={{
                      ...type.bodyL,
                      color: C.text,
                      lineHeight: 1.5,
                      fontFamily: fonts.body,
                      background: C.bgDeep,
                      border: `1px solid ${C.hairline}`,
                      borderRadius: radius.sm,
                      padding: '10px 13px',
                    }}
                  >
                    {t.notes}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div
          style={{
            margin: '20px 20px 28px',
            padding: '16px 16px',
            background: C.bgDeep,
            border: `1px solid ${C.hairline}`,
            borderRadius: radius.md,
          }}
        >
          <span style={eyebrow}>Archive actions</span>
          <button
            onClick={handleRestore}
            style={{
              width: '100%',
              minHeight: 48,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '12px 16px',
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: radius.md,
              color: C.accent,
              fontFamily: fonts.body,
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              marginBottom: 8,
              boxShadow: shadows.button,
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <RotateCcw size={15} />
            Restore to inventory
          </button>
          {onDelete && (
            <button
              onClick={handleDelete}
              style={{
                width: '100%',
                minHeight: 44,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 7,
                padding: '10px 14px',
                background: 'transparent',
                border: 'none',
                color: C.red,
                fontFamily: fonts.body,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <Trash2 size={14} />
              Delete permanently
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
