// Aiden brew recipe modal — editorial journal entry for the generated recipe
import { useState, useRef, useMemo, useEffect } from 'react';
import { C, fonts, type, shadows, radius } from '../styles/theme';
import { m } from '../lib/motion';
import { fadeUp, popIn, spring } from '../lib/motion';
import { Modal } from './Modal';
import { Btn } from './Btn';
import { DoseStepperCard } from './DoseStepperCard';
import { ExternalLink, Coffee, RefreshCw, AlertTriangle, Share2, Snowflake, ArrowLeft } from 'lucide-react';
import { usePreferences } from '../hooks/useUserProfile';
import { GRINDER_LABELS, formatAidenGrindValues } from '../lib/brewMethods';
import { Capacitor } from '@capacitor/core';
import { RecipeShareCard, captureShareCard, offScreenStyle } from './ShareCard';
import { shareImage } from '../lib/share';
import { transformAiden } from '../lib/flashBrewTransform';

const openExternalLink = (url) => {
  if (Capacitor.isNativePlatform()) {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => document.body.removeChild(a), 100);
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
};

// ── Palette: warm paper journal ──────────────────────────────────────────────
const RULE        = C.border;
const RULE_SOFT   = C.borderLight;
const PAPER_GRAD  = `linear-gradient(160deg, ${C.cream} 0%, ${C.bgDeep} 100%)`;
const GRIND_BORDER = C.accentLight;
const GRIND_DIVIDER = C.accentLight;
const TILE_BG     = C.bgDeep;

// Iced mode palette
const ICE_RULE       = C.frostBorder;
const ICE_PAPER_GRAD = `linear-gradient(160deg, ${C.frostBg} 0%, ${C.frostSoft} 100%)`;
const ICE_GRIND_BORDER = C.frostBorder;
const ICE_TILE_BG    = C.frostSoft;

// ── Sub-components ───────────────────────────────────────────────────────────

const IceParamCard = ({ label, value, sub }) => (
  <div style={{
    background: ICE_TILE_BG,
    borderRadius: radius.md,
    padding: '10px 12px',
    textAlign: 'center',
    border: `1px solid ${ICE_RULE}`,
  }}>
    <div style={{ ...type.label, color: C.textMuted, marginBottom: 4 }}>{label}</div>
    <div style={{ ...type.h2, color: C.text }}>{value}</div>
    {sub && <div style={{ ...type.caption, color: C.textLight, marginTop: 2 }}>{sub}</div>}
  </div>
);

const SectionLabel = ({ children, style }) => (
  <div style={{ ...type.label, color: C.textMuted, ...style }}>{children}</div>
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
      borderRadius: radius.md,
      border: `1px solid ${C.hairline}`,
      marginBottom: 16,
      boxShadow: shadows.e1,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: radius.sm,
        background: TILE_BG,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
        border: `1px solid ${C.hairline}`,
      }}>
        <IconBean />
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{
          fontFamily: fonts.heading,
          fontSize: type.h3.fontSize,
          fontWeight: 700,
          color: C.text,
          lineHeight: 1.2,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{bean.name}</div>
        {bean.roaster && (
          <div style={{ ...type.caption, color: C.textMuted, marginTop: 2 }}>{bean.roaster}</div>
        )}
      </div>
    </div>
  );
};

const RecipeTitleRow = ({ title, note }) => (
  <div style={{ marginBottom: 20 }}>
    <SectionLabel style={{ marginBottom: 6 }}>Recipe</SectionLabel>
    <div style={{
      paddingBottom: 12,
      borderBottom: `1px solid ${RULE}`,
    }}>
      <span style={{
        fontFamily: fonts.heading,
        fontSize: 30,
        fontWeight: 600,
        color: C.text,
        lineHeight: 1.0,
        letterSpacing: '-0.01em',
        display: 'block',
      }}>
        {title}
      </span>
    </div>
    {note && (
      <div style={{
        marginTop: 10,
        display: 'flex', alignItems: 'flex-start', gap: 6,
        lineHeight: 1.4,
      }}>
        <span style={{ ...type.caption, color: C.textMuted, fontStyle: 'italic', paddingTop: 2 }}>— Aiden:</span>
        <span style={{ fontFamily: fonts.body, fontSize: 17, color: C.accent }}>
          {note}
        </span>
      </div>
    )}
  </div>
);

const DialCell = ({ label, value, sub, borderRight, borderBottom }) => (
  <div style={{
    padding: '16px 14px 18px',
    borderRight: borderRight ? `1px solid ${RULE}` : 'none',
    borderBottom: borderBottom ? `1px solid ${RULE}` : 'none',
    textAlign: 'center',
  }}>
    <SectionLabel style={{ marginBottom: 8 }}>{label}</SectionLabel>
    <div style={{
      fontFamily: fonts.heading,
      fontSize: 28,
      color: C.text,
      lineHeight: 0.95,
      fontWeight: 600,
      letterSpacing: '-0.01em',
    }}>{value}</div>
    {sub && (
      <div style={{ ...type.caption, color: C.textLight, marginTop: 5, fontFeatureSettings: "'tnum'" }}>{sub}</div>
    )}
  </div>
);

const DialCard = ({ recipe }) => (
  <div style={{
    background: C.card,
    borderRadius: radius.lg,
    border: `1px solid ${RULE}`,
    boxShadow: shadows.e2,
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
    display: 'grid', gridTemplateColumns: '70px 1fr', alignItems: 'center', gap: 10,
    padding: '10px 0',
  }}>
    <div style={{
      fontFamily: fonts.heading,
      fontSize: 14,
      fontWeight: 600,
      color: C.textMuted,
      textAlign: 'right',
      paddingRight: 4,
    }}>{label}</div>
    <div style={{ position: 'relative', height: 32 }}>
      <div style={{
        position: 'absolute', left: 10, right: 10, top: 15, height: 1,
        background: RULE_SOFT,
      }} />
      <div style={{
        position: 'absolute', left: 0, right: 0, top: 0, height: 32,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        {temps.map((t, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 32 }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: C.accent,
              boxShadow: `0 0 0 3px ${C.card}`,
              marginBottom: 3,
            }} />
            <span style={{
              fontFamily: fonts.heading,
              fontSize: 13,
              fontWeight: 600,
              color: C.text,
              fontFeatureSettings: "'tnum'",
              lineHeight: 1,
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
      borderRadius: radius.lg,
      padding: '14px 18px 16px',
      border: `1px solid ${RULE}`,
      boxShadow: shadows.e2,
      marginBottom: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <SectionLabel>Temperature curve</SectionLabel>
        <div style={{ ...type.caption, color: C.textLight, fontFeatureSettings: "'tnum'" }}>°C</div>
      </div>
      {rows.map((r, i) => (
        <div key={r.label}>
          {i > 0 && <div style={{ borderTop: `1px solid ${RULE_SOFT}` }} />}
          <TempRow label={r.label} temps={r.temps} />
        </div>
      ))}
    </div>
  );
};

const GrindColumn = ({ label, value, divider }) => (
  <div style={{ borderLeft: divider ? `1px solid ${GRIND_DIVIDER}` : 'none', paddingLeft: divider ? 16 : 0 }}>
    <div style={{ ...type.label, color: C.textMuted, marginBottom: 4 }}>{label}</div>
    <div style={{
      fontFamily: fonts.heading,
      fontSize: 44,
      color: C.accent,
      lineHeight: 0.9,
      fontWeight: 600,
      fontFeatureSettings: "'tnum'",
      letterSpacing: '-0.02em',
    }}>{value}</div>
  </div>
);

const GrindCard = ({ recipe, grinderName, preferences }) => {
  // Aiden grind is stored in Ode Gen 2 steps — translate for non-Ode grinders
  const grind = formatAidenGrindValues(recipe.grindRecommendation, preferences);
  if (!grind) return null;
  return (
    <div style={{
      background: PAPER_GRAD,
      borderRadius: radius.lg,
      padding: '16px 18px 18px',
      border: `1px solid ${GRIND_BORDER}`,
      marginBottom: 20,
      boxShadow: shadows.e1,
      position: 'relative',
    }}>
      <SectionLabel style={{ marginBottom: 12 }}>Grind · {grind.grinderName || grinderName}</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', alignItems: 'end', gap: 12 }}>
        <GrindColumn label="single serve" value={grind.singleServe} />
        <GrindColumn label="batch" value={grind.batch} divider />
      </div>
    </div>
  );
};

const AidenPrimaryButton = ({ onClick, leading, children }) => (
  <m.button
    onClick={onClick}
    whileTap={{ scale: 0.97 }}
    transition={spring.snappy}
    style={{
      width: '100%',
      background: `linear-gradient(160deg, #C4844A 0%, ${C.accent} 100%)`,
      color: '#FFF8F0',
      border: 'none',
      padding: '16px 18px',
      borderRadius: radius.md,
      fontFamily: fonts.body,
      fontWeight: 700,
      fontSize: 16,
      cursor: 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      boxShadow: '0 1px 0 rgba(255,255,255,0.22) inset, 0 -1px 0 rgba(0,0,0,0.10) inset, ' + shadows.button + ', 0 4px 14px rgba(168,106,56,0.28)',
      marginBottom: 10,
      minHeight: 52,
      WebkitTapHighlightColor: 'transparent',
    }}
  >
    {leading}
    {children}
  </m.button>
);

const AidenScript = ({ children = 'Aiden' }) => (
  <span style={{ fontFamily: fonts.title, fontSize: 27, lineHeight: 0.85, marginLeft: -1 }}>
    {children}
  </span>
);

const IconActionButton = ({ onClick, disabled, icon, children, ariaLabel }) => (
  <m.button
    onClick={onClick}
    disabled={disabled}
    aria-label={ariaLabel}
    whileTap={disabled ? {} : { scale: 0.96 }}
    transition={spring.snappy}
    style={{
      flex: 1,
      background: 'transparent',
      color: C.accent,
      border: 'none',
      padding: '13px 8px',
      fontFamily: fonts.body,
      fontWeight: 600,
      fontSize: 13,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      cursor: disabled ? 'default' : 'pointer',
      borderRadius: radius.sm,
      opacity: disabled ? 0.55 : 1,
      minHeight: 44,
      WebkitTapHighlightColor: 'transparent',
    }}
  >
    {icon} {children}
  </m.button>
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

export const AidenModal = ({ open, onClose, bean, recipe, result, loading, error, phase, onRetry, onRetryPush, onRegenerate, onPushCached, onPushIced, extraFooter, icedResult, icedLoading, icedError, onRetryIcedPush }) => {
  const { preferences, fellowConnected } = usePreferences();
  const [sharing, setSharing] = useState(false);
  const shareCardRef = useRef(null);
  const [icedMode, setIcedMode] = useState(false);
  const [icedDose, setIcedDose] = useState(25);
  const modalContentRef = useRef(null);

  useEffect(() => {
    if (open) {
      setIcedMode(false);
      setIcedDose(25);
    }
  }, [open]);

  const icedRecipe = useMemo(
    () => (icedMode && recipe) ? transformAiden(recipe, icedDose) : null,
    [icedMode, recipe, icedDose]
  );

  const handleEnterIced = () => {
    setIcedMode(true);
    if (!icedResult && !icedLoading && recipe && onPushIced) {
      onPushIced(transformAiden(recipe, icedDose));
    }
    modalContentRef.current?.closest('[role="dialog"]')?.scrollTo?.({ top: 0 });
  };

  const handleBackToHot = () => {
    setIcedMode(false);
    modalContentRef.current?.closest('[role="dialog"]')?.scrollTo?.({ top: 0 });
  };

  const handleRegenerate = () => {
    setIcedMode(false);
    onRegenerate?.();
  };

  const handleShareRecipe = async () => {
    if (sharing || !shareCardRef.current) return;
    setSharing(true);
    try {
      const dataUrl = await captureShareCard(shareCardRef, { backgroundColor: '#2B5B4E' });
      if (!dataUrl) return;
      const text = result?.link
        ? `Check out my brew recipe for ${bean?.name || 'this coffee'} brought to you by 2manybeans! ${result.link}`
        : `Check out my brew recipe for ${bean?.name || 'this coffee'} brought to you by 2manybeans!`;
      await shareImage(dataUrl, text);
    } catch (e) {
      if (e.name !== 'AbortError') console.error('Share failed:', e);
    } finally {
      setSharing(false);
    }
  };
  const grinderName = GRINDER_LABELS[preferences?.grinder] || preferences?.grinderCustomName || 'Grinder';
  const isDeviceFull = error && (error.includes('maximum number of profiles') || error.includes('14 profiles'));
  const msg = phaseMessages[phase] || phaseMessages.recipe;
  return (
    <Modal open={open} onClose={onClose} title="Brew with Aiden">
      {/* Loading state */}
      {loading && !recipe && (
        <m.div
          {...fadeUp}
          style={{ textAlign: 'center', padding: '40px 0' }}
        >
          <Coffee size={32} color={C.accent} style={{ marginBottom: 14, animation: 'pulse 1.5s ease-in-out infinite' }} />
          <div style={{ fontFamily: fonts.heading, fontSize: 17, fontWeight: 600, color: C.text, marginBottom: 4 }}>{msg.title}</div>
          <div style={{ ...type.body, color: C.textMuted }}>{msg.subtitle}</div>
        </m.div>
      )}

      {/* Error state */}
      {error && !recipe && (
        <m.div
          {...fadeUp}
          style={{
            background: C.redBg,
            borderRadius: radius.lg,
            padding: 16,
            border: `1px solid ${C.red}30`,
          }}
        >
          <div style={{ fontFamily: fonts.body, fontSize: 14, fontWeight: 700, color: C.red, marginBottom: 4 }}>Couldn't generate a recipe</div>
          <div style={{ ...type.body, color: C.text }}>{error}</div>
          {onRetry && (
            <Btn variant="small" onClick={onRetry} style={{ marginTop: 10 }}>
              <RefreshCw size={12} /> Try Again
            </Btn>
          )}
        </m.div>
      )}

      {/* Recipe success */}
      {recipe && !icedMode && (
        <m.div ref={modalContentRef} {...fadeUp}>
          <BeanChip bean={bean} />

          <RecipeTitleRow title={recipe.title} note={recipe.note} />

          <DialCard recipe={recipe} />

          <TempCard recipe={recipe} />

          {recipe.grindRecommendation && (
            <GrindCard recipe={recipe} grinderName={grinderName} preferences={preferences} />
          )}

          {/* Fellow push state */}
          {loading && recipe && !result && (
            <div style={{ textAlign: 'center', padding: '12px 0', ...type.body, color: C.textMuted, fontStyle: 'italic' }}>
              Sending to your Aiden...
            </div>
          )}

          {/* Fellow push error — recipe still visible */}
          {error && recipe && !loading && (
            isDeviceFull ? (
              <m.div
                {...popIn}
                style={{
                  background: C.amberBg,
                  borderRadius: radius.md,
                  padding: 14,
                  marginBottom: 10,
                  border: `1px solid ${C.accentLight}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <AlertTriangle size={14} color={C.amber} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Aiden is full (14/14 profiles)</span>
                </div>
                <div style={{ ...type.body, color: C.text, lineHeight: 1.5 }}>
                  Please delete profiles in the Fellow app and retry. Your recipe is saved.
                </div>
                {onRetryPush && (
                  <Btn variant="small" onClick={onRetryPush} style={{ marginTop: 10 }}>
                    <RefreshCw size={12} /> Retry brew.link
                  </Btn>
                )}
              </m.div>
            ) : (
              <div style={{
                background: C.redBg,
                borderRadius: radius.sm,
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
              borderRadius: radius.sm,
              padding: 12,
              marginBottom: 10,
              fontSize: 13,
              color: C.text,
              border: `1px solid ${C.accentLight}`,
            }}>
              Your Fellow connection needs updating. Reconnect in Settings.
            </div>
          )}

          {/* Primary action: Open in Fellow / Open on Aiden / Send to Aiden */}
          {result?.link && (
            <AidenPrimaryButton
              leading={<ExternalLink size={15} />}
              onClick={() => openExternalLink(result.link)}
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
              leading={<ExternalLink size={15} />}
              onClick={() => onPushCached(recipe)}
            >
              <span>{fellowConnected ? 'Send to' : 'Push to'}</span>
              <AidenScript />
            </AidenPrimaryButton>
          )}

          {/* Secondary icon row: Share | Regenerate */}
          {!loading && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              borderRadius: radius.sm,
              background: C.bgDeep,
              marginBottom: 2,
            }}>
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
                  <div style={{ width: 1, height: 20, background: C.hairline }} />
                  <IconActionButton
                    onClick={handleRegenerate}
                    icon={<RefreshCw size={14} />}
                    ariaLabel="Regenerate Aiden recipe"
                  >
                    Regenerate
                  </IconActionButton>
                </>
              )}
            </div>
          )}

          {/* Iced flash brew entry point */}
          {!loading && (
            <m.button
              onClick={handleEnterIced}
              whileTap={{ scale: 0.97 }}
              transition={spring.snappy}
              style={{
                width: '100%',
                marginTop: 10,
                padding: '13px 16px',
                borderRadius: radius.md,
                background: ICE_PAPER_GRAD,
                border: `1px solid ${ICE_RULE}`,
                color: C.text,
                fontSize: 14,
                fontWeight: 700,
                fontFamily: fonts.body,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                minHeight: 48,
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <Snowflake size={16} color={C.frost} />
              Iced flash brew this bean
            </m.button>
          )}

          {extraFooter}
        </m.div>
      )}

      {/* Iced mode view */}
      {recipe && icedMode && icedRecipe && (
        <m.div ref={modalContentRef} {...fadeUp}>
          {/* Back to hot */}
          <m.button
            onClick={handleBackToHot}
            whileTap={{ scale: 0.97 }}
            transition={spring.snappy}
            style={{
              background: 'none',
              border: 'none',
              padding: '6px 0',
              marginBottom: 14,
              fontSize: 13,
              color: C.accent,
              fontWeight: 600,
              fontFamily: fonts.body,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              cursor: 'pointer',
              minHeight: 44,
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <ArrowLeft size={14} /> Back to hot recipe
          </m.button>

          <div style={{ marginBottom: 16 }}>
            <div style={{ ...type.label, color: C.frost, marginBottom: 6 }}>Iced Mode</div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              fontFamily: fonts.heading,
              fontSize: 24,
              fontWeight: 600,
              color: C.text,
              letterSpacing: '-0.01em',
            }}>
              <Snowflake size={20} color={C.frost} />
              Iced Flash Brew
            </div>
          </div>

          <BeanChip bean={bean} />

          {/* Dose / Water / Ice param grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
            <DoseStepperCard dose={icedDose} onChange={setIcedDose} min={15} max={35} />
            <IceParamCard label="Water" value={`${icedRecipe.brewWaterMl}ml`} sub="(hot)" />
            <IceParamCard label="Ice" value={`${icedRecipe.iceGrams}g`} sub="in carafe" />
          </div>

          {/* Your Aiden Setup card */}
          <div style={{
            background: ICE_PAPER_GRAD,
            borderRadius: radius.lg,
            padding: '14px 18px 16px',
            border: `1px solid ${ICE_RULE}`,
            marginBottom: 14,
            boxShadow: shadows.e1,
          }}>
            <SectionLabel style={{ marginBottom: 12 }}>Your Aiden Setup</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <div style={{ ...type.label, color: C.textMuted, marginBottom: 4 }}>Volume dial</div>
                <div style={{ fontFamily: fonts.heading, fontSize: 20, fontWeight: 600, color: C.text }}>{icedRecipe.brewWaterMl}ml</div>
              </div>
              <div>
                <div style={{ ...type.label, color: C.textMuted, marginBottom: 4 }}>Machine says</div>
                <div style={{ fontFamily: fonts.heading, fontSize: 20, fontWeight: 600, color: C.text }}>{icedRecipe.machineSuggestedDose}g</div>
              </div>
            </div>
            <div style={{
              background: `${C.accent}12`,
              borderRadius: radius.sm,
              padding: '10px 14px',
              marginBottom: 10,
            }}>
              <div style={{ ...type.label, color: C.textMuted, marginBottom: 4 }}>You load</div>
              <div style={{ fontFamily: fonts.heading, fontSize: 26, fontWeight: 700, color: C.accent }}>{icedRecipe.icedDose}g</div>
            </div>
            <div style={{ ...type.body, color: C.text, lineHeight: 1.5 }}>
              Add <strong>{icedRecipe.iceGrams}g</strong> ice to carafe before pressing Start
            </div>
          </div>

          {/* Grind card (iced) — translated for the user's grinder like the hot card */}
          {icedRecipe.grindRecommendation && (() => {
            const icedGrind = formatAidenGrindValues(icedRecipe.grindRecommendation, preferences);
            if (!icedGrind) return null;
            return (
              <div style={{
                background: ICE_PAPER_GRAD,
                borderRadius: radius.lg,
                padding: '14px 18px 16px',
                border: `1px solid ${ICE_GRIND_BORDER}`,
                marginBottom: 14,
                boxShadow: shadows.e1,
              }}>
                <SectionLabel style={{ marginBottom: 12 }}>Grind (finer for iced) · {icedGrind.grinderName || grinderName}</SectionLabel>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', alignItems: 'end', gap: 12 }}>
                  <GrindColumn label="single serve" value={icedGrind.singleServe} />
                  <GrindColumn label="batch" value={icedGrind.batch} divider />
                </div>
              </div>
            );
          })()}

          {/* Temp card (iced, +1C) */}
          <TempCard recipe={icedRecipe} />

          {/* Iced push state */}
          {icedLoading && (
            <div style={{ textAlign: 'center', padding: '12px 0', ...type.body, color: C.textMuted, fontStyle: 'italic' }}>
              Sending iced profile to your Aiden...
            </div>
          )}

          {/* Iced push error */}
          {icedError && !icedLoading && (
            <div style={{
              background: C.redBg,
              borderRadius: radius.sm,
              padding: 12,
              marginBottom: 10,
              fontSize: 13,
            }}>
              <span style={{ color: C.red, fontWeight: 600 }}>Couldn't push iced profile: </span>
              <span style={{ color: C.text }}>{icedError}</span>
              {onRetryIcedPush && (
                <Btn variant="small" onClick={onRetryIcedPush} style={{ marginTop: 8 }}>
                  <RefreshCw size={12} /> Retry
                </Btn>
              )}
            </div>
          )}

          {/* Cached iced link */}
          {icedResult?.link && (
            <AidenPrimaryButton
              leading={<ExternalLink size={15} />}
              onClick={() => openExternalLink(icedResult.link)}
            >
              {fellowConnected && !icedResult.usedRelay ? (
                <span>Open Iced in Fellow</span>
              ) : (
                <>
                  <span>Open Iced on</span>
                  <AidenScript />
                </>
              )}
            </AidenPrimaryButton>
          )}

          {/* Regenerate (snaps back to hot) */}
          {onRegenerate && !icedLoading && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 4 }}>
              <IconActionButton
                onClick={handleRegenerate}
                icon={<RefreshCw size={14} />}
                ariaLabel="Regenerate recipe (returns to hot)"
              >
                Regenerate
              </IconActionButton>
            </div>
          )}

          {extraFooter}
        </m.div>
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
