// Professor Ruphus — full-screen slide-up educational lesson
import { createPortal } from 'react-dom';
import { X, RefreshCw } from 'lucide-react';
import { C, fonts, glass, shadows, radius, type, cardBase } from '../styles/theme';
import { SpiderChart } from './SpiderChart';
import { ResearchLoadingScreen } from './ResearchLoadingScreen';

// Inline SVG section icons (18px, accent colored)
const IconHouse = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);
const IconGlobe = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);
const IconBeaker = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4.5 3h15" /><path d="M6 3v16a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V3" />
    <path d="M6 14h12" />
  </svg>
);
const IconCup = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 8h1a4 4 0 1 1 0 8h-1" /><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z" />
    <line x1="6" y1="2" x2="6" y2="4" /><line x1="10" y1="2" x2="10" y2="4" /><line x1="14" y1="2" x2="14" y2="4" />
  </svg>
);

// Editorial section card — eyebrow label + content
const Section = ({ title, icon, children }) => (
  <div
    style={{
      ...cardBase,
      padding: '14px 16px',
      marginBottom: 10,
    }}
  >
    {/* Eyebrow with icon */}
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      marginBottom: 8,
    }}>
      {icon}
      <span style={{ ...type.label, color: C.accent, marginBottom: 0 }}>{title}</span>
    </div>
    <div style={{ ...type.bodyL, color: C.text, lineHeight: 1.65, fontFamily: fonts.body }}>
      {children}
    </div>
  </div>
);

const Spinner = () => (
  <div style={{
    width: 24, height: 24,
    border: `2px solid ${C.borderLight}`,
    borderTopColor: C.accent,
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
    margin: '0 auto',
  }} />
);

export const ProfessorRuphusSlideUp = ({ open, onClose, bean, story, loading, researching, error, onRetry, onRefresh, tastingScores }) => {
  if (!open) return null;

  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1100,
        background: glass.scrim,
        backdropFilter: glass.blur,
        WebkitBackdropFilter: glass.blur,
        animation: 'ruphusFadeIn 0.2s ease-out',
      }}
      onClick={onClose}
    >
      <div
        style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          height: '100%',
          maxWidth: 480, margin: '0 auto',
          background: glass.sheet,
          backdropFilter: glass.blurStrong,
          WebkitBackdropFilter: glass.blurStrong,
          borderRadius: `${radius.xl}px ${radius.xl}px 0 0`,
          border: `1px solid ${glass.chromeBorder}`,
          boxShadow: shadows.modal,
          animation: 'ruphusSlideUp 0.3s ease-out',
          display: 'flex', flexDirection: 'column',
          paddingTop: 'env(safe-area-inset-top, 0px)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {loading && researching ? (
          <ResearchLoadingScreen onClose={onClose} />
        ) : (
        <>
        {/* Header bar — grabber + action row */}
        <div style={{
          padding: '12px 16px 0',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexShrink: 0,
        }}>
          {/* Grabber handle */}
          <div style={{
            width: 36, height: 4,
            background: C.border,
            borderRadius: radius.pill,
            opacity: 0.6,
          }} />
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            {story && onRefresh && (
              <button
                onClick={onRefresh}
                aria-label="Refresh lesson"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 12,
                  minWidth: 44,
                  minHeight: 44,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: 0.5,
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <RefreshCw size={16} color={C.textMuted} />
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="Close"
              style={{
                background: 'rgba(0,0,0,0.04)',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                width: 32, height: 32,
                minWidth: 44, minHeight: 44,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <X size={20} color={C.textMuted} />
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div style={{
          flex: 1, overflowY: 'auto', minHeight: 0,
          padding: `0 20px calc(40px + env(safe-area-inset-bottom, 0px))`,
        }}>
          {/* Loading state (non-research) */}
          {loading && (
            <div style={{ textAlign: 'center', paddingTop: 40 }}>
              <video
                src="/images/ruphus-animations/ruphus-examining-v3.mp4"
                autoPlay muted loop playsInline preload="auto"
                style={{ width: 240, height: 'auto', marginBottom: 16, background: 'transparent' }}
              />
              <div style={{
                fontFamily: fonts.heading,
                fontSize: 17,
                color: C.text,
                fontWeight: 600,
                marginBottom: 12,
              }}>
                Professor Ruphus is preparing your lesson...
              </div>
              <Spinner />
            </div>
          )}

          {/* Error state */}
          {error && !loading && (
            <div style={{ textAlign: 'center', paddingTop: 80 }}>
              <img src="/images/professor-ruphus.webp" alt="Professor Ruphus"
                style={{
                  width: 64, height: 64, borderRadius: '50%',
                  opacity: 0.5, marginBottom: 16,
                  border: `2px solid ${C.borderLight}`,
                }} />
              <div style={{ fontFamily: fonts.heading, fontSize: 17, color: C.text, marginBottom: 8 }}>
                Couldn't load the lesson
              </div>
              <div style={{ ...type.body, color: C.textMuted, marginBottom: 20 }}>{error}</div>
              {onRetry && (
                <button
                  onClick={onRetry}
                  style={{
                    background: C.accent,
                    color: '#fff',
                    border: 'none',
                    borderRadius: radius.md,
                    padding: '12px 24px',
                    minHeight: 44,
                    fontSize: 14,
                    fontFamily: fonts.body,
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: shadows.button,
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  Try Again
                </button>
              )}
            </div>
          )}

          {/* Story content */}
          {story && !loading && (
            <>
              {/* Professor Ruphus intro chat bubble */}
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: 12,
                marginBottom: 24, marginTop: 16,
              }}>
                <img
                  src="/images/professor-ruphus.webp"
                  alt="Professor Ruphus"
                  style={{
                    width: 52, height: 52,
                    borderRadius: '50%',
                    flexShrink: 0,
                    border: `2px solid ${C.accentLight}`,
                    boxShadow: shadows.e1,
                  }}
                />
                <div style={{
                  background: C.accentSoft,
                  borderRadius: `${radius.md}px ${radius.md}px ${radius.md}px 4px`,
                  padding: '12px 16px',
                  border: `1px solid ${C.borderLight}`,
                  lineHeight: 1.5,
                }}>
                  <p style={{
                    margin: 0,
                    fontSize: 15,
                    color: C.text,
                    fontFamily: fonts.body,
                    fontWeight: 500,
                  }}>
                    {story.intro}
                  </p>
                </div>
              </div>

              {/* Bean identity block */}
              <div style={{ marginBottom: 22 }}>
                <div style={{
                  fontFamily: fonts.heading,
                  fontSize: 22,
                  fontWeight: 600,
                  color: C.text,
                  lineHeight: 1.12,
                  letterSpacing: '-0.01em',
                  marginBottom: 4,
                }}>
                  {bean?.name}
                </div>
                <div style={{ ...type.body, color: C.textMuted }}>
                  {bean?.roaster} · {bean?.origin}
                </div>
              </div>

              {/* Sections — conditionally rendered */}
              {story.roaster && (
                <Section title="The Roaster" icon={<IconHouse />}>{story.roaster}</Section>
              )}
              {story.coffee && (
                <Section title="This Coffee" icon={<IconGlobe />}>{story.coffee}</Section>
              )}
              {story.process && (
                <Section title="Understanding the Process" icon={<IconBeaker />}>{story.process}</Section>
              )}
              {story.lookFor && (
                <Section title="What to Look For" icon={<IconCup />}>{story.lookFor}</Section>
              )}

              {/* Spider chart */}
              {story.flavorProfile && (
                <div style={{ marginTop: 12, marginBottom: 8 }}>
                  <div style={{
                    ...type.label,
                    color: C.textMuted,
                    textAlign: 'center',
                    marginBottom: 14,
                  }}>
                    Expected Flavor Profile
                  </div>
                  <SpiderChart
                    expectedScores={story.flavorProfile}
                    tastingScores={tastingScores}
                  />
                </div>
              )}
            </>
          )}
        </div>
        </>
        )}
      </div>
    </div>,
    document.body
  );
};
