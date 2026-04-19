// Archive detail bottom sheet — full bean metadata + tasting history + restore/delete.
// Uses the same portal + slide-up / fade-backdrop pattern as ProfessorRuphusSlideUp.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { RotateCcw, Trash2 } from 'lucide-react';
import { C, fonts } from '../styles/theme';
import { BeanThumb } from './BeanThumb';

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
            stroke={C.accent}
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

function Row({ label, value }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        padding: '8px 0',
        borderBottom: `1px dashed ${C.border}`,
        gap: 12,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: C.textLight,
          letterSpacing: 0.8,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 13,
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
}) {
  const [mounted, setMounted] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (!bean) {
      setMounted(false);
      setClosing(false);
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
    setClosing(true);
    setTimeout(() => {
      setMounted(false);
      setClosing(false);
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

  const visible = mounted && !closing;

  return createPortal(
    <div
      onClick={close}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1100,
        background: 'rgba(59,36,23,0.42)',
        opacity: visible ? 1 : 0,
        transition: 'opacity 200ms ease',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 520,
          maxHeight: '88dvh',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          background: C.card,
          borderRadius: '22px 22px 0 0',
          boxShadow: '0 -8px 28px rgba(59,36,23,0.22)',
          transform: `translateY(${visible ? '0%' : '100%'})`,
          transition: 'transform 240ms cubic-bezier(0.2,0.8,0.2,1)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: C.cardMuted }} />
        </div>

        {/* Hero */}
        <div style={{ padding: '8px 20px 14px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <div
            style={{
              width: 88,
              height: 88,
              borderRadius: 14,
              overflow: 'hidden',
              flexShrink: 0,
              background: C.amberBg,
              boxShadow: `0 0 0 1px ${C.border}, 0 2px 6px rgba(92,61,46,0.08)`,
            }}
          >
            <BeanThumb bean={bean} size={88} />
          </div>
          <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: 1.4,
                textTransform: 'uppercase',
                color: C.textMuted,
                marginBottom: 4,
              }}
            >
              {bean.roaster || ''}
            </div>
            <div
              style={{
                fontFamily: fonts.heading,
                fontSize: 24,
                lineHeight: 1.15,
                color: C.text,
                fontWeight: 600,
                marginBottom: 6,
              }}
            >
              {bean.name}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {best && <ArchiveStars value={best} size={13} />}
              <span style={{ fontSize: 11.5, color: C.textLight, fontFamily: fonts.body }}>
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
                    style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }}
                  />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Ownership strip */}
        <div
          style={{
            margin: '0 20px 16px',
            padding: '10px 14px',
            background: C.amberBg,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ textAlign: 'center', flex: 1 }}>
            <div style={{ fontFamily: fonts.heading, fontSize: 20, color: C.accent, fontWeight: 600 }}>
              {dOwn ?? '—'}
            </div>
            <div
              style={{
                fontSize: 9.5,
                fontWeight: 700,
                color: C.textMuted,
                letterSpacing: 1,
                textTransform: 'uppercase',
                marginTop: 1,
              }}
            >
              Days owned
            </div>
          </div>
          <div style={{ width: 1, background: C.border, margin: '0 8px' }} />
          <div style={{ textAlign: 'center', flex: 1 }}>
            <div style={{ fontFamily: fonts.heading, fontSize: 20, color: C.accent, fontWeight: 600 }}>
              {dOpen ?? '—'}
            </div>
            <div
              style={{
                fontSize: 9.5,
                fontWeight: 700,
                color: C.textMuted,
                letterSpacing: 1,
                textTransform: 'uppercase',
                marginTop: 1,
              }}
            >
              Days open
            </div>
          </div>
          <div style={{ width: 1, background: C.border, margin: '0 8px' }} />
          <div style={{ textAlign: 'center', flex: 1 }}>
            <div
              style={{
                fontFamily: fonts.heading,
                fontSize: 14,
                color: C.text,
                fontWeight: 500,
                marginTop: 3,
              }}
            >
              {formatFinishDay(bean.finishDate)}
            </div>
            <div
              style={{
                fontSize: 9.5,
                fontWeight: 700,
                color: C.textMuted,
                letterSpacing: 1,
                textTransform: 'uppercase',
                marginTop: 2,
              }}
            >
              Finished
            </div>
          </div>
        </div>

        {/* Metadata */}
        <div style={{ padding: '0 20px' }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: 1.4,
              textTransform: 'uppercase',
              color: C.accent,
              marginBottom: 6,
            }}
          >
            From the bag
          </div>
          <Row label="Origin" value={bean.origin} />
          <Row label="Region" value={bean.region} />
          <Row label="Farm" value={bean.farm} />
          <Row label="Variety" value={bean.variety} />
          <Row label="Process" value={bean.process} />
          <Row label="Altitude" value={bean.altitude} />
          <Row label="Roast" value={bean.roastLevel} />
          <Row label="Cup score" value={bean.cupScore} />
          <Row label="Weight" value={bean.bagSize ? `${bean.bagSize}g` : null} />
          {bean.bagNotes && (
            <div style={{ padding: '10px 0' }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: C.textLight,
                  letterSpacing: 0.8,
                  textTransform: 'uppercase',
                  marginBottom: 4,
                }}
              >
                Roaster's notes
              </div>
              <div
                style={{
                  fontSize: 14,
                  color: C.text,
                  fontStyle: 'italic',
                  fontFamily: fonts.heading,
                  lineHeight: 1.4,
                }}
              >
                &ldquo;{bean.bagNotes}&rdquo;
              </div>
            </div>
          )}
        </div>

        {/* Tasting history */}
        {beanTastings.length > 0 && (
          <div style={{ padding: '14px 20px 4px' }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: 1.4,
                textTransform: 'uppercase',
                color: C.accent,
                marginBottom: 10,
              }}
            >
              Tasting history
            </div>

            {beanTastings.map((t, i) => (
              <div
                key={t.id || i}
                style={{
                  position: 'relative',
                  paddingLeft: 22,
                  paddingBottom: 16,
                  borderLeft: i < beanTastings.length - 1 ? `2px solid ${C.border}` : 'none',
                  marginLeft: 6,
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    left: -7,
                    top: 2,
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    background: C.accent,
                    boxShadow: `0 0 0 3px ${C.card}, 0 0 0 4px ${C.border}`,
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
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.text, fontFamily: fonts.body }}>
                    {formatTastingDate(t.date)}
                  </div>
                  {t.rating ? <ArchiveStars value={t.rating} size={11} /> : null}
                </div>
                {t.method && (
                  <div
                    style={{
                      fontSize: 11,
                      color: C.textMuted,
                      marginBottom: 6,
                      fontFamily: fonts.body,
                    }}
                  >
                    {t.method}
                  </div>
                )}
                {t.notes && (
                  <div
                    style={{
                      fontSize: 13.5,
                      color: C.text,
                      lineHeight: 1.45,
                      fontFamily: fonts.body,
                      background: C.amberBg,
                      border: `1px solid ${C.border}`,
                      borderRadius: 10,
                      padding: '10px 12px',
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
            margin: '16px 20px 28px',
            padding: '14px 16px',
            background: C.bg,
            border: `1px dashed ${C.border}`,
            borderRadius: 12,
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: 1.4,
              textTransform: 'uppercase',
              color: C.textMuted,
              marginBottom: 10,
            }}
          >
            Archive actions
          </div>
          <button
            onClick={handleRestore}
            style={{
              width: '100%',
              minHeight: 44,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 7,
              padding: '10px 14px',
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              color: C.accent,
              fontFamily: fonts.body,
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              marginBottom: 8,
            }}
          >
            <RotateCcw size={14} />
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
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Trash2 size={13} />
              Delete permanently
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
