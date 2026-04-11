// Professor Ruphus — full-screen slide-up educational lesson
import { createPortal } from 'react-dom';
import { X, RefreshCw } from 'lucide-react';
import { C, fonts, cardBase } from '../styles/theme';
import { SpiderChart } from './SpiderChart';

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

const Section = ({ title, icon, children }) => (
  <div style={{ ...cardBase, padding: 14, marginBottom: 12 }}>
    <div style={{
      fontFamily: fonts.heading, fontSize: 14, color: C.accent,
      marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6,
    }}>
      {icon} {title}
    </div>
    <div style={{ fontSize: 13, color: C.text, lineHeight: 1.7, fontFamily: fonts.body }}>
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

export const ProfessorRuphusSlideUp = ({ open, onClose, bean, story, loading, error, onRetry, onRefresh, tastingScores }) => {
  if (!open) return null;

  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1100,
        background: 'rgba(44,24,16,0.5)',
        backdropFilter: 'blur(6px)',
        animation: 'ruphusFadeIn 0.2s ease-out',
      }}
      onClick={onClose}
    >
      <div
        style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          height: '100%',
          maxWidth: 480, margin: '0 auto',
          background: C.bg,
          borderRadius: '20px 20px 0 0',
          animation: 'ruphusSlideUp 0.3s ease-out',
          display: 'flex', flexDirection: 'column',
          paddingTop: 'env(safe-area-inset-top, 0px)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header bar */}
        <div style={{
          padding: '12px 16px 0',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexShrink: 0,
        }}>
          <div style={{ width: 36, height: 4, background: C.borderLight, borderRadius: 2 }} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {story && onRefresh && (
              <button onClick={onRefresh} style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: 12,
                display: 'flex', alignItems: 'center', opacity: 0.5,
              }}>
                <RefreshCw size={16} color={C.textMuted} />
              </button>
            )}
            <button onClick={onClose} style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 10,
              display: 'flex', alignItems: 'center',
            }}>
              <X size={20} color={C.textMuted} />
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div style={{
          flex: 1, overflowY: 'auto', minHeight: 0,
          padding: `0 20px calc(40px + env(safe-area-inset-bottom, 0px))`,
        }}>
          {/* Loading state */}
          {loading && (
            <div style={{ textAlign: 'center', paddingTop: 80 }}>
              <img src="/images/professor-ruphus.webp" alt="Professor Ruphus"
                style={{ width: 80, height: 80, borderRadius: '50%', opacity: 0.8, marginBottom: 16 }} />
              <div style={{ fontSize: 14, color: C.text, fontWeight: 600, marginBottom: 8 }}>
                Professor Ruphus is preparing your lesson...
              </div>
              <Spinner />
            </div>
          )}

          {/* Error state */}
          {error && !loading && (
            <div style={{ textAlign: 'center', paddingTop: 80 }}>
              <img src="/images/professor-ruphus.webp" alt="Professor Ruphus"
                style={{ width: 64, height: 64, borderRadius: '50%', opacity: 0.5, marginBottom: 16 }} />
              <div style={{ fontSize: 14, color: C.text, marginBottom: 12 }}>
                Couldn't load the lesson
              </div>
              <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 16 }}>{error}</div>
              {onRetry && (
                <button onClick={onRetry} style={{
                  background: C.accent, color: '#fff', border: 'none', borderRadius: 10,
                  padding: '8px 20px', fontSize: 13, fontFamily: fonts.body, cursor: 'pointer',
                }}>
                  Try Again
                </button>
              )}
            </div>
          )}

          {/* Story content */}
          {story && !loading && (
            <>
              {/* Professor Ruphus header */}
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: 12,
                marginBottom: 20, marginTop: 16,
              }}>
                <img src="/images/professor-ruphus.webp" alt="Professor Ruphus"
                  style={{
                    width: 56, height: 56, borderRadius: '50%', flexShrink: 0,
                    border: `2px solid ${C.borderLight}`,
                  }} />
                <div style={{
                  background: C.amberBg, borderRadius: '14px 14px 14px 4px',
                  padding: '10px 14px', fontSize: 15, color: C.text,
                  fontFamily: fonts.title,
                  border: '1px solid #E8D5A0',
                  lineHeight: 1.4,
                }}>
                  {story.intro}
                </div>
              </div>

              {/* Bean title */}
              <div style={{
                fontFamily: fonts.heading, fontSize: 20, color: C.text,
                marginBottom: 2, lineHeight: 1.2,
              }}>
                {bean?.name}
              </div>
              <div style={{
                fontSize: 12, color: C.textMuted, marginBottom: 20,
              }}>
                {bean?.roaster} · {bean?.origin}
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
                <div style={{ marginTop: 8, marginBottom: 8 }}>
                  <div style={{
                    fontFamily: fonts.heading, fontSize: 14, color: C.text,
                    marginBottom: 12, textAlign: 'center',
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
      </div>
    </div>,
    document.body
  );
};
