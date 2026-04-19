// Aiden brew recipe modal — editorial journal entry for the generated recipe
import { useState, useRef } from 'react';
import { C, fonts } from '../styles/theme';
import { Modal } from './Modal';
import { Btn } from './Btn';
import { ExternalLink, Coffee, RefreshCw, AlertTriangle, Share2 } from 'lucide-react';
import { usePreferences } from '../hooks/useUserProfile';
import { GRINDER_LABELS } from '../lib/brewMethods';
import { Capacitor } from '@capacitor/core';
import { RecipeShareCard, captureShareCard, offScreenStyle } from './ShareCard';
import { shareImage } from '../lib/share';

// Local design tokens specific to this panel
const RULE = '#EADFD0';
const RULE_SOFT = '#F0E6D4';
const PAPER_GRAD = 'linear-gradient(180deg, #FBF1DF 0%, #F5E6D3 100%)';
const GRIND_BORDER = '#E8D5A0';
const GRIND_DIVIDER = '#D4B878';
const TILE_BG = '#EADFCB';

const SectionLabel = ({ children, style }) => (
  <div style={{
    fontFamily: fonts.body,
    fontSize: 10, fontWeight: 700,
    color: C.textMuted,
    textTransform: 'uppercase', letterSpacing: 1.2,
    ...style,
  }}>{children}</div>
);

const IconBean = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
    <ellipse cx="12" cy="12" rx="7" ry="9" fill={C.text} transform="rotate(-18 12 12)" />
    <path d="M9 5 Q12 12 15 19" stroke="#FBF1DF" strokeWidth="1.4" fill="none" strokeLinecap="round" transform="rotate(-18 12 12)" />
  </svg>
);

const BeanChip = ({ bean }) => {
  if (!bean) return null;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 12px',
      background: PAPER_GRAD,
      borderRadius: 12,
      border: `1px solid ${RULE}`,
      marginBottom: 14,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10,
        background: TILE_BG,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <IconBean />
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{
          fontSize: 14, fontWeight: 700, color: C.text, lineHeight: 1.2,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{bean.name}</div>
        {bean.roaster && (
          <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2, letterSpacing: 0.3 }}>{bean.roaster}</div>
        )}
      </div>
    </div>
  );
};

const RecipeTitleRow = ({ title, note }) => (
  <div style={{ marginBottom: 18 }}>
    <div style={{
      display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap',
      paddingBottom: 10,
      borderBottom: `1px dashed ${RULE}`,
    }}>
      <SectionLabel>Recipe</SectionLabel>
      <span style={{ fontFamily: fonts.title, fontSize: 30, color: C.text, lineHeight: 0.9 }}>
        {title}
      </span>
    </div>
    {note && (
      <div style={{
        fontFamily: fonts.title, fontSize: 17, color: C.accent,
        marginTop: 8, display: 'flex', alignItems: 'flex-start', gap: 6,
        lineHeight: 1.1,
      }}>
        <span style={{ fontSize: 13, color: C.textMuted, fontFamily: fonts.body, fontStyle: 'italic' }}>— Aiden:</span>
        <span>{note}</span>
      </div>
    )}
  </div>
);

const DialCell = ({ label, value, sub, borderRight, borderBottom }) => (
  <div style={{
    padding: '16px 14px 18px',
    borderRight: borderRight ? `1px dashed ${RULE}` : 'none',
    borderBottom: borderBottom ? `1px dashed ${RULE}` : 'none',
    textAlign: 'center',
  }}>
    <SectionLabel style={{ marginBottom: 6 }}>{label}</SectionLabel>
    <div style={{
      fontFamily: fonts.heading, fontSize: 28, color: C.text,
      lineHeight: 0.95, fontWeight: 500,
    }}>{value}</div>
    {sub && (
      <div style={{ fontSize: 11, color: C.textLight, marginTop: 4, fontFeatureSettings: "'tnum'" }}>{sub}</div>
    )}
  </div>
);

const DialCard = ({ recipe }) => (
  <div style={{
    background: C.card,
    borderRadius: 14,
    border: `1px solid ${RULE}`,
    boxShadow: '0 1px 2px rgba(92,61,46,0.04)',
    overflow: 'hidden',
    marginBottom: 14,
    display: 'grid', gridTemplateColumns: '1fr 1fr',
  }}>
    <DialCell label="Ratio" value={`1:${recipe.ratio}`} borderRight borderBottom />
    <DialCell label="Bloom" value={`${recipe.bloomRatio}×`} sub={`${recipe.bloomDuration}s`} borderBottom />
    <DialCell label="Single pulses" value={recipe.ssPulsesNumber} sub={`@ ${recipe.ssPulsesInterval}s`} borderRight />
    <DialCell label="Batch pulses" value={recipe.batchPulsesNumber} sub={`@ ${recipe.batchPulsesInterval}s`} />
  </div>
);

const TempRow = ({ label, temps }) => (
  <div style={{
    display: 'grid', gridTemplateColumns: '78px 1fr', alignItems: 'center', gap: 10,
    padding: '10px 0',
  }}>
    <div style={{
      fontFamily: fonts.title, fontSize: 17, color: C.text, lineHeight: 1,
      textAlign: 'right', paddingRight: 2,
    }}>{label}</div>
    <div style={{ position: 'relative', height: 32 }}>
      <div style={{
        position: 'absolute', left: 10, right: 10, top: 15, height: 1,
        borderTop: `1px dashed ${RULE}`,
      }} />
      <div style={{
        position: 'absolute', left: 0, right: 0, top: 0, height: 32,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        {temps.map((t, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 32 }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: C.text,
              boxShadow: `0 0 0 3px ${C.card}`,
              marginBottom: 3,
            }} />
            <span style={{
              fontFamily: fonts.heading, fontSize: 13, fontWeight: 500,
              color: C.text, fontFeatureSettings: "'tnum'", lineHeight: 1,
            }}>{t}°</span>
          </div>
        ))}
      </div>
    </div>
  </div>
);

const TempCard = ({ recipe }) => {
  const rows = [
    { label: 'Bloom', temps: [recipe.bloomTemperature] },
    recipe.ssPulseTemperatures && { label: 'Single', temps: recipe.ssPulseTemperatures },
    recipe.batchPulseTemperatures && { label: 'Batch', temps: recipe.batchPulseTemperatures },
  ].filter(Boolean);
  return (
    <div style={{
      background: C.card,
      borderRadius: 14,
      padding: '14px 18px 16px',
      border: `1px solid ${RULE}`,
      boxShadow: '0 1px 2px rgba(92,61,46,0.04)',
      marginBottom: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
        <SectionLabel>Temperature curve</SectionLabel>
        <div style={{ fontSize: 10, color: C.textLight, fontFeatureSettings: "'tnum'" }}>°C</div>
      </div>
      {rows.map((r, i) => (
        <div key={r.label}>
          {i > 0 && <div style={{ borderTop: `1px dashed ${RULE_SOFT}` }} />}
          <TempRow label={r.label} temps={r.temps} />
        </div>
      ))}
    </div>
  );
};

const GrindColumn = ({ label, value, divider }) => (
  <div style={{ borderLeft: divider ? `1px dashed ${GRIND_DIVIDER}` : 'none', paddingLeft: divider ? 14 : 0 }}>
    <div style={{ fontFamily: fonts.title, fontSize: 16, color: C.text, lineHeight: 1 }}>{label}</div>
    <div style={{
      fontFamily: fonts.heading, fontSize: 42, color: C.accent,
      lineHeight: 0.9, fontWeight: 500, fontFeatureSettings: "'tnum'",
    }}>{value}</div>
  </div>
);

const GrindCard = ({ recipe, grinderName }) => (
  <div style={{
    background: PAPER_GRAD,
    borderRadius: 14,
    padding: '14px 18px 16px',
    border: `1px solid ${GRIND_BORDER}`,
    marginBottom: 20,
    position: 'relative',
  }}>
    <SectionLabel style={{ marginBottom: 4 }}>Grind · {grinderName}</SectionLabel>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', alignItems: 'end', gap: 12, marginTop: 4 }}>
      <GrindColumn label="single" value={recipe.grindRecommendation.singleServe} />
      <GrindColumn label="batch" value={recipe.grindRecommendation.batch} divider />
    </div>
  </div>
);

const AidenPrimaryButton = ({ onClick, leading, children }) => (
  <button
    onClick={onClick}
    style={{
      width: '100%',
      background: 'linear-gradient(180deg, #BC8149 0%, #A66B38 100%)',
      color: '#FFF8F0', border: 'none',
      padding: '15px 18px', borderRadius: 12,
      fontFamily: fonts.body, fontWeight: 700, fontSize: 15, cursor: 'pointer',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      boxShadow: '0 1px 0 rgba(255,255,255,0.28) inset, 0 -1px 0 rgba(0,0,0,0.08) inset, 0 1px 2px rgba(92,61,46,0.15), 0 4px 12px rgba(160,113,75,0.18)',
      marginBottom: 10,
      WebkitTapHighlightColor: 'transparent',
    }}
  >
    {leading}
    {children}
  </button>
);

const AidenScript = ({ children = 'Aiden' }) => (
  <span style={{ fontFamily: fonts.title, fontSize: 26, lineHeight: 0.85, marginLeft: -2 }}>
    {children}
  </span>
);

const IconActionButton = ({ onClick, disabled, icon, children, ariaLabel }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    aria-label={ariaLabel}
    style={{
      flex: 1, background: 'transparent', color: C.accent, border: 'none',
      padding: 12, fontFamily: fonts.body, fontWeight: 600, fontSize: 13,
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      cursor: disabled ? 'default' : 'pointer', borderRadius: 10,
      opacity: disabled ? 0.55 : 1,
      WebkitTapHighlightColor: 'transparent',
    }}
  >
    {icon} {children}
  </button>
);

const phaseMessages = {
  research: {
    title: 'Researching your bean...',
    subtitle: 'Learning about origin, altitude, and processing details',
  },
  recipe: {
    title: 'Crafting your brew recipe...',
    subtitle: 'Matching to reference profiles and optimizing extraction',
  },
};

export const AidenModal = ({ open, onClose, bean, recipe, result, loading, error, phase, onRetry, onRetryPush, onRegenerate, onPushCached, extraFooter }) => {
  const { preferences, fellowConnected } = usePreferences();
  const [sharing, setSharing] = useState(false);
  const shareCardRef = useRef(null);

  const handleShareRecipe = async () => {
    if (sharing || !shareCardRef.current) return;
    setSharing(true);
    try {
      const dataUrl = await captureShareCard(shareCardRef, { backgroundColor: '#2B5B4E' });
      if (!dataUrl) return;
      const text = result?.link
        ? `Check out my brew recipe for ${bean?.name || 'this coffee'}! ${result.link}`
        : `Check out my brew recipe for ${bean?.name || 'this coffee'}!`;
      await shareImage(dataUrl, text);
    } catch (e) {
      if (e.name !== 'AbortError') console.error('Share failed:', e);
    } finally {
      setSharing(false);
    }
  };
  const grinderName = GRINDER_LABELS[preferences?.grinder] || preferences?.grinderCustomName || 'Grinder';
  const isDeviceFull = error && error.includes('14 profiles') && !error.includes('(400)');
  const msg = phaseMessages[phase] || phaseMessages.recipe;
  return (
    <Modal open={open} onClose={onClose} title="Brew with Aiden">
      {/* Loading state */}
      {loading && !recipe && (
        <div style={{ textAlign: 'center', padding: '32px 0' }}>
          <Coffee size={32} color={C.accent} style={{ marginBottom: 12, animation: 'pulse 1.5s ease-in-out infinite' }} />
          <div style={{ fontSize: 14, color: C.text, fontWeight: 600 }}>{msg.title}</div>
          <div style={{ fontSize: 12, color: C.textMuted, marginTop: 4 }}>{msg.subtitle}</div>
        </div>
      )}

      {/* Error state */}
      {error && !recipe && (
        <div style={{
          background: C.redBg,
          borderRadius: 14,
          padding: 16,
          border: `1px solid ${C.red}20`,
        }}>
          <div style={{ fontSize: 14, color: C.red, fontWeight: 600, marginBottom: 4 }}>Couldn't generate a recipe</div>
          <div style={{ fontSize: 13, color: C.text }}>{error}</div>
          {onRetry && (
            <Btn variant="small" onClick={onRetry} style={{ marginTop: 10 }}>
              <RefreshCw size={12} /> Try Again
            </Btn>
          )}
        </div>
      )}

      {/* Recipe success */}
      {recipe && (
        <div>
          <BeanChip bean={bean} />

          <RecipeTitleRow title={recipe.title} note={recipe.note} />

          <DialCard recipe={recipe} />

          <TempCard recipe={recipe} />

          {recipe.grindRecommendation && (
            <GrindCard recipe={recipe} grinderName={grinderName} />
          )}

          {/* Fellow push state */}
          {loading && recipe && !result && (
            <div style={{ textAlign: 'center', padding: '12px 0', fontSize: 13, color: C.textMuted, fontStyle: 'italic' }}>
              Sending to your Aiden...
            </div>
          )}

          {/* Fellow push error — recipe still visible */}
          {error && recipe && !loading && (
            isDeviceFull ? (
              <div style={{
                background: C.amberBg,
                borderRadius: 10,
                padding: 14,
                marginBottom: 10,
                border: '1px solid #E8D5A0',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <AlertTriangle size={14} color={C.amber} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Aiden is full (14/14 profiles)</span>
                </div>
                <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5 }}>
                  Delete a profile in the Fellow app, then tap retry. Your recipe is saved — it won't regenerate.
                </div>
                {onRetryPush && (
                  <Btn variant="small" onClick={onRetryPush} style={{ marginTop: 10 }}>
                    <RefreshCw size={12} /> Retry brew.link
                  </Btn>
                )}
              </div>
            ) : (
              <div style={{
                background: C.redBg,
                borderRadius: 10,
                padding: 12,
                marginBottom: 10,
                fontSize: 13,
              }}>
                <span style={{ color: C.red, fontWeight: 600 }}>Couldn't push to Aiden: </span>
                <span style={{ color: C.text }}>{error}</span>
                {onRetryPush && (
                  <Btn variant="small" onClick={onRetryPush} style={{ marginTop: 8 }}>
                    <RefreshCw size={12} /> Retry
                  </Btn>
                )}
              </div>
            )
          )}

          {/* Fellow credentials invalid notice */}
          {result?.fellowCredentialsInvalid && (
            <div style={{
              background: C.amberBg,
              borderRadius: 10,
              padding: 12,
              marginBottom: 10,
              fontSize: 13,
              color: C.text,
              border: '1px solid #E8D5A0',
            }}>
              Your Fellow connection needs updating. Reconnect in Settings.
            </div>
          )}

          {/* Primary action: Open in Fellow / Open on Aiden / Send to Aiden */}
          {result?.link && (
            <AidenPrimaryButton
              leading={<ExternalLink size={14} />}
              onClick={() => {
                if (Capacitor.isNativePlatform()) {
                  const a = document.createElement('a');
                  a.href = result.link;
                  a.target = '_blank';
                  a.rel = 'noopener noreferrer';
                  document.body.appendChild(a);
                  a.click();
                  setTimeout(() => document.body.removeChild(a), 100);
                } else {
                  window.open(result.link, '_blank');
                }
              }}
            >
              {fellowConnected && !result.usedRelay ? (
                <span>Open in Fellow</span>
              ) : (
                <>
                  <span>Open on</span>
                  <AidenScript />
                </>
              )}
            </AidenPrimaryButton>
          )}

          {!result && !loading && !error && onPushCached && (
            <AidenPrimaryButton
              leading={<ExternalLink size={14} />}
              onClick={() => onPushCached(recipe)}
            >
              <span>{fellowConnected ? 'Send to' : 'Push to'}</span>
              <AidenScript />
            </AidenPrimaryButton>
          )}

          {/* Secondary icon row: Share | Regenerate */}
          {!loading && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              <IconActionButton
                onClick={handleShareRecipe}
                disabled={sharing}
                icon={<Share2 size={14} />}
                ariaLabel="Share recipe"
              >
                {sharing ? 'Generating...' : 'Share'}
              </IconActionButton>
              {onRegenerate && (
                <>
                  <div style={{ width: 1, height: 16, background: RULE }} />
                  <IconActionButton
                    onClick={onRegenerate}
                    icon={<RefreshCw size={14} />}
                    ariaLabel="Regenerate Aiden recipe"
                  >
                    Regenerate
                  </IconActionButton>
                </>
              )}
            </div>
          )}

          {extraFooter}
        </div>
      )}

      {/* Off-screen share card for capture */}
      {recipe && (
        <div style={offScreenStyle}>
          <RecipeShareCard
            ref={shareCardRef}
            bean={bean}
            recipe={{
              ratio: `1:${recipe.ratio}`,
              bloom: `${recipe.bloomRatio}x ${recipe.bloomDuration}s`,
              grindSingleShot: recipe.grindRecommendation?.singleServe,
              grindBatch: recipe.grindRecommendation?.batch,
            }}
          />
        </div>
      )}
    </Modal>
  );
};
