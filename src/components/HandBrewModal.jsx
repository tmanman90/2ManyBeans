// Hand brew recipe modal — step-by-step pour-over guide with editorial warm aesthetic
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { C, fonts, type, shadows, radius } from '../styles/theme';
import { m } from '../lib/motion';
import { fadeUp, spring } from '../lib/motion';
import { Modal } from './Modal';
import { Btn } from './Btn';
import { BrewTimer } from './BrewTimer';
import { DoseStepperCard } from './DoseStepperCard';
import { Coffee, Droplets, Thermometer, RefreshCw, Play, Scale, Snowflake, ArrowLeft } from 'lucide-react';
import { usePreferences } from '../hooks/useUserProfile';
import { GRINDER_LABELS } from '../lib/brewMethods';
import { scaleRecipeForDose } from '../lib/recipeScaling';
import { transformToFlashBrew } from '../lib/flashBrewTransform';
import { isDeterministicV60Hot } from '../lib/v60Generation';
import { formatTimingMs, selectTimingMemory, timingContextFromRecipe } from '../lib/brewTimingMemory';
import { buildTimerSteps, normalizeRecipePhases } from '../lib/brewTimerSteps';

const ICE_RULE       = C.frostBorder;
const ICE_PAPER_GRAD = `linear-gradient(160deg, ${C.frostBg} 0%, ${C.frostSoft} 100%)`;
const ICE_TILE_BG    = C.frostSoft;

// ── Eyebrow label ─────────────────────────────────────────────────────────────
const SectionLabel = ({ children, style }) => (
  <div style={{ ...type.label, color: C.textMuted, ...style }}>{children}</div>
);

const TimingMemoryHint = ({ memory, context }) => {
  if (!memory?.event) return null;
  const event = memory.event;
  const configuration = [
    event.device === 'kalita' ? `Wave ${event.kalitaSize}` : event.device.toUpperCase(),
    `${event.doseGrams}g`,
    event.mode === 'iced' ? 'iced' : 'hot',
  ].filter(Boolean).join(' · ');
  return (
    <div role="note" style={{ background: C.amberBg, borderRadius: radius.lg, padding: '12px 16px', marginBottom: 14, border: `1px solid ${C.accentLight}` }}>
      <SectionLabel style={{ color: C.accent, marginBottom: 5 }}>Prior brew</SectionLabel>
      <div style={{ ...type.body, color: C.text, lineHeight: 1.5 }}>
        Last brew: <strong>{formatTimingMs(event.actualElapsedMs)}</strong> at {configuration}
        {!memory.isExactDose && ' — different dose, so use this only as context'}
      </div>
      {memory.range && (
        <div style={{ ...type.caption, color: C.textMuted, marginTop: 5 }}>
          Your last {memory.range.sampleCount} comparable brews: {formatTimingMs(memory.range.minMs)}–{formatTimingMs(memory.range.maxMs)} (middle {formatTimingMs(memory.range.medianMs)})
        </div>
      )}
    </div>
  );
};

// ── Parameter tile ─────────────────────────────────────────────────────────────
const ParamCard = ({ label, value, sub, icon: Icon, iconColor }) => (
  <div style={{
    background: C.card,
    borderRadius: radius.md,
    padding: '10px 12px',
    textAlign: 'center',
    border: `1px solid ${C.borderLight}`,
    boxShadow: shadows.e1,
  }}>
    {Icon && <Icon size={14} color={iconColor || C.accent} style={{ marginBottom: 4 }} />}
    <SectionLabel style={{ marginBottom: 4 }}>{label}</SectionLabel>
    <div style={{ fontFamily: fonts.heading, fontSize: 18, fontWeight: 600, color: C.text }}>{value}</div>
    {sub && <div style={{ ...type.caption, color: C.textLight, marginTop: 2 }}>{sub}</div>}
  </div>
);

const KalitaSizeSwitch = ({ value, onChange, disabled }) => {
  const selected = value === '155' ? '155' : '185';
  return (
    <div
      role="group"
      aria-label="Kalita Wave size"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '10px 12px',
        marginBottom: 14,
        background: C.amberBg,
        border: `1px solid ${C.accentLight}`,
        borderRadius: radius.lg,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <SectionLabel style={{ color: C.accent }}>Wave size</SectionLabel>
      </div>
      <div
        style={{
          display: 'flex',
          flexShrink: 0,
          padding: 3,
          gap: 2,
          background: C.card,
          border: `1px solid ${C.borderLight}`,
          borderRadius: radius.pill,
          boxShadow: shadows.e1,
        }}
      >
        {['155', '185'].map((size) => {
          const active = selected === size;
          return (
            <m.button
              key={size}
              type="button"
              onClick={() => onChange?.(size)}
              disabled={disabled || active}
              whileTap={disabled || active ? undefined : { scale: 0.94 }}
              transition={spring.snappy}
              aria-pressed={active}
              aria-label={`Use Kalita Wave ${size}`}
              style={{
                minWidth: 52,
                minHeight: 44,
                padding: '0 12px',
                border: 'none',
                borderRadius: radius.pill,
                background: active ? C.accent : 'transparent',
                color: active ? C.cream : C.textMuted,
                fontFamily: fonts.body,
                fontSize: 14,
                fontWeight: 800,
                cursor: disabled || active ? 'default' : 'pointer',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {size}
            </m.button>
          );
        })}
      </div>
    </div>
  );
};

const TECHNIQUE_LABELS = {
  hoffmann: 'Hoffmann Classic',
  'kasuya-46': 'Kasuya 4:6',
  'center-pour': 'Center Pour',
  'low-agitation-center': 'Low-Agitation Center Pour',
  'center-to-spiral-pulse': 'Center-to-Spiral Pulse',
  'bloom-led-pulse': 'Bloom-Led Pulse',
  'low-agitation-no-swirl': 'Low-Agitation, No Swirl',
};

const phaseMessages = {
  research: {
    title: 'Researching your bean...',
    subtitle: 'Learning about origin, altitude, and processing details',
  },
  recipe: {
    title: 'Crafting your brew recipe...',
    subtitle: 'Building a custom pour-over tailored to this bean',
  },
};

const renderTemp = (wt) => {
  const c = typeof wt.celsius === 'number' ? wt.celsius : String(wt.celsius).replace(/[^\d.]/g, '');
  const f = typeof wt.fahrenheit === 'number' ? wt.fahrenheit : String(wt.fahrenheit).replace(/[^\d.]/g, '');
  return `${c}°C / ${f}°F`;
};

const renderGuideRange = (recipe) => {
  const range = recipe?.guideRangeSeconds;
  if (Array.isArray(range) && range.length === 2 && range.every(Number.isFinite)) {
    return `${formatTimingMs(range[0] * 1000)}–${formatTimingMs(range[1] * 1000)}`;
  }
  return recipe?.totalBrewTime || null;
};

const GrindDisplay = ({ grindSize, grinderName, preferences, accentColor }) => {
  const hasMicrons = Number.isFinite(grindSize.microns);
  const isMicrons = preferences?.grindSizeDisplay === 'microns' && hasMicrons;
  const primary = isMicrons ? `~${grindSize.microns}µm` : grindSize.setting || (hasMicrons ? `~${grindSize.microns}µm` : 'Source');
  const secondary = isMicrons
    ? (grindSize.setting ? `${grinderName}: ${grindSize.setting}` : null)
    : (hasMicrons ? `~${grindSize.microns}µm` : null);
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
      <div style={{
        fontFamily: fonts.heading,
        fontSize: 30,
        fontWeight: 600,
        color: accentColor,
        letterSpacing: '-0.02em',
      }}>{primary}</div>
      <div>
        <div style={{ fontFamily: fonts.body, fontSize: 14, fontWeight: 600, color: C.text }}>{grindSize.description}</div>
        {secondary && <div style={{ ...type.caption, color: C.textMuted, marginTop: 2 }}>{secondary}</div>}
      </div>
    </div>
  );
};

// ── Refined step timeline with numbered spine ──────────────────────────────────
const StepTimeline = ({ steps, timelineColor, accentColor, iceAccent }) => (
  <div style={{ marginBottom: 14 }}>
    <SectionLabel style={{ marginBottom: 12 }}>Steps</SectionLabel>
    <div style={{ position: 'relative', paddingLeft: 32 }}>
      {/* Vertical spine */}
      <div style={{
        position: 'absolute',
        left: 11,
        top: 10,
        bottom: 6,
        width: 2,
        background: timelineColor,
        borderRadius: 1,
      }} />
      {(steps || []).map((step, i) => {
        const dotColor = step.isIceStep
          ? (iceAccent || C.frost)
          : (i === 0 ? accentColor : C.accentLight);
        return (
          <m.div
            key={i}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ ...spring.soft, delay: i * 0.04 }}
            style={{
              position: 'relative',
              marginBottom: i < steps.length - 1 ? 18 : 0,
            }}
          >
            {/* Step number dot */}
            <div style={{
              position: 'absolute',
              left: -24,
              top: 2,
              width: 22,
              height: 22,
              borderRadius: '50%',
              background: dotColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: `0 0 0 3px ${C.card}`,
            }}>
              <span style={{
                fontFamily: fonts.body,
                fontSize: 10,
                fontWeight: 800,
                color: '#fff',
                lineHeight: 1,
              }}>{i + 1}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{
                ...type.caption,
                fontFamily: fonts.body,
                fontVariantNumeric: 'tabular-nums',
                fontWeight: 700,
                color: step.isIceStep ? (iceAccent || C.frost) : accentColor,
                minWidth: 46,
                flexShrink: 0,
                paddingTop: 3,
              }}>
                {step.time}
              </div>
              <div style={{ flex: 1 }}>
                {step.name && (
                  <div style={{ ...type.caption, color: C.textMuted, fontWeight: 800, marginBottom: 2 }}>
                    {step.name}
                  </div>
                )}
                <div style={{ ...type.bodyL, color: C.text, lineHeight: 1.4 }}>{step.action}</div>
                {step.waterTotal > 0 && (
                  <div style={{ ...type.caption, color: C.textMuted, marginTop: 3 }}>
                    Total water: {step.waterTotal}g
                  </div>
                )}
              </div>
            </div>
          </m.div>
        );
      })}
    </div>
  </div>
);

export const HandBrewModal = ({
  open, onClose, recipe, icedRecipe: icedRecipeProp, icedLoading = false, icedError = null, onRetryIced, loading, error, phase, onRetry, onRegenerate,
  extraFooter, bean, onStartTasting,
  userCoffeeGrams, onCoffeeGramsChange, onPersistDose,
  deviceKey, onKalitaSizeChange, onSaveTimingEvent,
}) => {
  const { preferences } = usePreferences();
  const grinderKey = preferences?.grinder || 'fellow-ode-gen2';
  const grinderName = GRINDER_LABELS[grinderKey] || preferences?.grinderCustomName || 'Grinder';
  const msg = phaseMessages[phase] || phaseMessages.recipe;
  const [timerOpen, setTimerOpen] = useState(false);
  const [icedMode, setIcedMode] = useState(false);
  const [timerRecipeOverride, setTimerRecipeOverride] = useState(null);
  const modalContentRef = useRef(null);

  useEffect(() => {
    if (open) {
      setIcedMode(false);
      setTimerRecipeOverride(null);
    }
  }, [open]);

  const effectiveDose = typeof userCoffeeGrams === 'number' && userCoffeeGrams > 0
    ? userCoffeeGrams
    : recipe?.coffeeGrams;
  const doseUpdating = recipe?.candidate === true && typeof effectiveDose === 'number' && effectiveDose !== recipe.coffeeGrams;

  const scaledRecipe = useMemo(
    () => (recipe?.candidate && recipe?.doseTimingPolicy === 'generated-dose-v60-v1'
      ? recipe
      : scaleRecipeForDose(recipe, effectiveDose)),
    [recipe, effectiveDose]
  );
  const displayRecipe = useMemo(() => normalizeRecipePhases(scaledRecipe), [scaledRecipe]);
  const hotGuideRange = useMemo(() => renderGuideRange(displayRecipe), [displayRecipe]);
  const hotTimerSteps = useMemo(() => buildTimerSteps(displayRecipe), [displayRecipe]);
  const timerReady = Boolean(hotTimerSteps) && !doseUpdating;

  const device = deviceKey || recipe?.device || 'v60';

  const icedRecipe = useMemo(
    () => {
      if (!icedMode) return null;
      if (icedRecipeProp?.candidate) return normalizeRecipePhases(icedRecipeProp);
      if (icedRecipeProp?.mode === 'iced' || icedRecipeProp?.isIced) return normalizeRecipePhases(icedRecipeProp);
      if (isDeterministicV60Hot(displayRecipe)) return null;
      return displayRecipe ? transformToFlashBrew(displayRecipe, device, effectiveDose) : null;
    },
    [icedMode, icedRecipeProp, displayRecipe, device, effectiveDose]
  );

  const handleEnterIced = () => {
    setIcedMode(true);
    modalContentRef.current?.closest('[role="dialog"]')?.scrollTo?.({ top: 0 });
  };

  const handleBackToHot = () => {
    setIcedMode(false);
    setTimerRecipeOverride(null);
    modalContentRef.current?.closest('[role="dialog"]')?.scrollTo?.({ top: 0 });
  };

  const handleRegenerate = () => {
    setIcedMode(false);
    onRegenerate?.();
  };

  const persistIfChanged = useCallback(() => {
    if (onPersistDose && typeof effectiveDose === 'number') {
      const stored = recipe?.userCoffeeGrams;
      if (effectiveDose !== stored) {
        onPersistDose(effectiveDose);
      }
    }
  }, [onPersistDose, effectiveDose, recipe?.userCoffeeGrams]);

  const handleClose = useCallback(() => {
    persistIfChanged();
    onClose?.();
  }, [persistIfChanged, onClose]);

  const handleStartBrew = useCallback(() => {
    persistIfChanged();
    setTimerOpen(true);
  }, [persistIfChanged]);

  const handleStartIcedBrew = useCallback(() => {
    setTimerRecipeOverride(icedRecipe);
    setTimerOpen(true);
  }, [icedRecipe]);

  const timerRecipe = icedMode ? (timerRecipeOverride || icedRecipe) : displayRecipe;
  const icedTimerSteps = useMemo(() => buildTimerSteps(icedRecipe), [icedRecipe]);
  const icedTimerReady = Boolean(icedTimerSteps) && !doseUpdating && icedRecipe.coffeeGrams === effectiveDose;
  const timingContext = useMemo(
    () => timingContextFromRecipe({ beanId: bean?.id, recipe: displayRecipe, mode: 'hot' }),
    [bean?.id, displayRecipe]
  );
  const timingMemory = useMemo(
    () => selectTimingMemory(bean?.handBrewTimingMemory, timingContext),
    [bean?.handBrewTimingMemory, timingContext]
  );
  const icedTimingContext = useMemo(
    () => timingContextFromRecipe({ beanId: bean?.id, recipe: icedRecipe, mode: 'iced' }),
    [bean?.id, icedRecipe]
  );
  const icedTimingMemory = useMemo(
    () => selectTimingMemory(bean?.handBrewTimingMemory, icedTimingContext),
    [bean?.handBrewTimingMemory, icedTimingContext]
  );

  return (
    <>
    <Modal open={open && !timerOpen} onClose={handleClose} title={icedMode ? 'Iced Flash Brew' : 'Hand Brew Recipe'}>
      {/* Loading state */}
      {loading && !recipe && (
        <m.div {...fadeUp} style={{ textAlign: 'center', padding: '40px 0' }}>
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
          <div style={{ fontSize: 14, color: C.red, fontWeight: 700, marginBottom: 4 }}>Couldn't generate a recipe</div>
          <div style={{ ...type.body, color: C.text }}>{error}</div>
          {onRetry && (
            <Btn variant="small" onClick={onRetry} style={{ marginTop: 10 }} aria-label="Retry recipe generation">
              <RefreshCw size={12} /> Try Again
            </Btn>
          )}
        </m.div>
      )}

      {/* Hot recipe display */}
      {recipe && !icedMode && (
        <m.div ref={modalContentRef} {...fadeUp}>
          {/* Recipe header */}
          <div style={{ marginBottom: 16 }}>
            <SectionLabel style={{ marginBottom: 6 }}>{recipe.device === 'v60' ? 'V60 02 · Hot' : 'Hand brew recipe'}</SectionLabel>
            <div style={{
              fontFamily: fonts.heading,
              fontSize: 24,
              fontWeight: 600,
              color: C.text,
              lineHeight: 1.1,
              letterSpacing: '-0.01em',
            }}>
              {recipe.title || 'Pour-Over Recipe'}
            </div>
            {(recipe.techniqueLabel || (recipe.technique && TECHNIQUE_LABELS[recipe.technique])) && (
              <div style={{ ...type.caption, color: C.textMuted, marginTop: 4 }}>
                {recipe.techniqueLabel || TECHNIQUE_LABELS[recipe.technique]} method
              </div>
            )}
          </div>

          {recipe.device === 'kalita' && (
            <KalitaSizeSwitch
              value={recipe.kalitaSize}
              onChange={onKalitaSizeChange}
              disabled={loading}
            />
          )}

          {/* Param tiles */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
            <DoseStepperCard dose={displayRecipe.coffeeGrams} onChange={onCoffeeGramsChange} {...(device === 'v60' ? { min: 12, max: 30 } : {})} />
            <ParamCard label="Water" value={`${displayRecipe.waterGrams}g`} icon={Droplets} iconColor={C.blue} />
            <ParamCard label="Ratio" value={displayRecipe.ratio} icon={Scale} />
          </div>
          {recipe.device === 'kalita' && (
            <div style={{ ...type.caption, color: C.textMuted, margin: '-4px 4px 14px', lineHeight: 1.5 }}>
              Wave {recipe.kalitaSize || '185'} · {recipe.doseProfile || 'legacy profile'}
              {recipe.candidate ? ' · Bean-specific engine' : ''}
              {recipe.generationStatus === 'fallback' ? ' · GPT fallback' : ''}
            </div>
          )}

          {recipe.device === 'kalita' && recipe.techniqueInstruction && (
            <div
              role="note"
              style={{
                background: C.amberBg,
                borderRadius: radius.lg,
                padding: '12px 16px',
                marginBottom: 14,
                border: `1px solid ${C.accentLight}`,
              }}
            >
              <SectionLabel style={{ color: C.accent, marginBottom: 5 }}>Pouring technique</SectionLabel>
              <div style={{ ...type.body, color: C.text, lineHeight: 1.5 }}>{recipe.techniqueInstruction}</div>
            </div>
          )}

          {recipe.candidate && recipe.reasoning && (
            <div role="note" style={{ background: C.amberBg, borderRadius: radius.lg, padding: '12px 16px', marginBottom: 14, border: `1px solid ${C.accentLight}` }}>
              <SectionLabel style={{ color: C.accent, marginBottom: 5 }}>Why this technique</SectionLabel>
              <div style={{ ...type.body, color: C.text, lineHeight: 1.5 }}>{recipe.reasoning}</div>
              {recipe.sourceLineage?.adaptation && <div style={{ ...type.caption, color: C.textMuted, marginTop: 5 }}>{recipe.sourceLineage.adaptation}</div>}
            </div>
          )}

          {/* Grind card */}
          {recipe.grindSize && (
            <div style={{
              background: C.amberBg,
              borderRadius: radius.lg,
              padding: '14px 18px',
              marginBottom: 14,
              border: `1px solid ${C.accentLight}`,
              boxShadow: shadows.e1,
            }}>
              <SectionLabel style={{ marginBottom: 8 }}>{recipe.grindSize.grinderSpecific === false ? 'Grind' : `${grinderName} Grind`}</SectionLabel>
              <GrindDisplay
                grindSize={recipe.grindSize}
                grinderName={grinderName}
                preferences={preferences}
                accentColor={C.amber}
              />
            </div>
          )}

          {/* Temperature */}
          {recipe.waterTemp && (
            <div style={{
              background: C.card,
              borderRadius: radius.lg,
              padding: '12px 14px',
              marginBottom: 14,
              border: `1px solid ${C.borderLight}`,
              boxShadow: shadows.e1,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}>
              <Thermometer size={18} color={C.accent} />
              <div>
                <SectionLabel>Water Temperature</SectionLabel>
                <div style={{ fontFamily: fonts.heading, fontSize: 16, fontWeight: 600, color: C.text, marginTop: 2 }}>
                  {renderTemp(recipe.waterTemp)}
                </div>
              </div>
            </div>
          )}

          {displayRecipe.prepSteps?.length > 0 && (
            <div role="note" style={{ background: C.cardMuted, borderRadius: radius.lg, padding: '12px 16px', marginBottom: 14, border: `1px solid ${C.borderLight}` }}>
              <SectionLabel style={{ marginBottom: 6 }}>Prepare before the clock</SectionLabel>
              <ol style={{ margin: 0, paddingLeft: 20, color: C.text, lineHeight: 1.5 }}>
                {displayRecipe.prepSteps.map((step, index) => <li key={index}>{step.action}</li>)}
              </ol>
            </div>
          )}

          {/* Steps */}
          <StepTimeline
            steps={displayRecipe.steps}
            timelineColor={C.borderLight}
            accentColor={C.accent}
          />

          {/* Total brew time */}
          {displayRecipe.totalBrewTime && (
            <div style={{
              textAlign: 'center',
              ...type.body,
              color: C.textMuted,
              marginBottom: 14,
              paddingTop: 4,
            }}>
              Expected drawdown: <strong style={{ color: C.text, fontFamily: fonts.heading }}>{hotGuideRange}</strong>
            </div>
          )}

          <TimingMemoryHint memory={timingMemory} context={timingContext} />

          {/* Tasting tip */}
          {recipe.tips && (
            <div style={{
              background: C.greenBg,
              borderRadius: radius.lg,
              padding: '12px 16px',
              marginBottom: 14,
              border: `1px solid ${C.green}22`,
              boxShadow: shadows.e1,
            }}>
              <SectionLabel style={{ color: C.green, marginBottom: 6 }}>{recipe.device === 'v60' ? 'Drawdown tip' : 'Tasting tip'}</SectionLabel>
              <div style={{ ...type.body, color: C.text, lineHeight: 1.5 }}>{recipe.tips}</div>
            </div>
          )}

          {/* Reasoning */}
          {recipe.reasoning && !recipe.candidate && (
            <div style={{
              ...type.caption,
              color: C.textMuted,
              fontStyle: 'italic',
              marginBottom: 14,
              lineHeight: 1.6,
              padding: '0 4px',
            }}>
              {recipe.reasoning}
            </div>
          )}

          {/* Start Brew button */}
          {timerReady && (
            <m.button
              onClick={handleStartBrew}
              aria-label="Start brew timer"
              whileTap={{ scale: 0.97 }}
              transition={spring.snappy}
              style={{
                width: '100%',
                padding: '16px 20px',
                borderRadius: radius.md,
                background: `linear-gradient(160deg, #C4844A 0%, ${C.accent} 100%)`,
                color: '#FFF8F0',
                border: 'none',
                fontSize: 16,
                fontWeight: 700,
                fontFamily: fonts.body,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                marginBottom: 10,
                minHeight: 52,
                boxShadow: `${shadows.button}, 0 4px 14px rgba(168,106,56,0.28)`,
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <Play size={16} fill="#FFF8F0" strokeWidth={0} /> {displayRecipe.phaseContractVersion ? 'Start Bloom & Timer' : 'Start Brew'}
            </m.button>
          )}

          {onRegenerate && (
            <Btn variant="ghost" onClick={handleRegenerate} style={{ width: '100%', justifyContent: 'center' }} aria-label="Regenerate hand brew recipe">
              <RefreshCw size={14} /> Regenerate Recipe
            </Btn>
          )}

          {/* Iced entry point */}
          {timerReady && (
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
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontFamily: fonts.heading,
              fontSize: 24,
              fontWeight: 600,
              color: C.text,
              letterSpacing: '-0.01em',
            }}>
              <Snowflake size={20} color={C.frost} />
              Iced Flash Brew
            </div>
            {(icedRecipe.techniqueLabel || (icedRecipe.technique && TECHNIQUE_LABELS[icedRecipe.technique])) && (
              <div style={{ ...type.caption, color: C.textMuted, marginTop: 4 }}>
                {icedRecipe.techniqueLabel || TECHNIQUE_LABELS[icedRecipe.technique]} method
              </div>
            )}
            {icedRecipe.reasoning && (
              <div role="note" style={{ ...type.body, color: C.textMuted, lineHeight: 1.5, marginTop: 8 }}>
                {icedRecipe.reasoning}
                {icedRecipe.sourceLineage?.adaptation && (
                  <div style={{ ...type.caption, color: C.textLight, marginTop: 5 }}>{icedRecipe.sourceLineage.adaptation}</div>
                )}
              </div>
            )}
          </div>

          {/* Iced param tiles */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
            <DoseStepperCard dose={icedRecipe.coffeeGrams} onChange={onCoffeeGramsChange} min={12} max={30} />
            <div style={{
              background: ICE_TILE_BG,
              borderRadius: radius.md,
              padding: '10px 12px',
              textAlign: 'center',
              border: `1px solid ${ICE_RULE}`,
            }}>
              <Droplets size={14} color={C.frost} style={{ marginBottom: 4 }} />
              <SectionLabel style={{ marginBottom: 3 }}>Water</SectionLabel>
              <div style={{ fontFamily: fonts.heading, fontSize: 18, fontWeight: 600, color: C.text }}>{icedRecipe.waterGrams}g</div>
              <div style={{ ...type.caption, color: C.textLight }}>hot</div>
            </div>
            <div style={{
              background: ICE_TILE_BG,
              borderRadius: radius.md,
              padding: '10px 12px',
              textAlign: 'center',
              border: `1px solid ${ICE_RULE}`,
            }}>
              <Snowflake size={14} color={C.frost} style={{ marginBottom: 4 }} />
              <SectionLabel style={{ marginBottom: 3 }}>Ice</SectionLabel>
              <div style={{ fontFamily: fonts.heading, fontSize: 18, fontWeight: 600, color: C.text }}>{icedRecipe.iceGrams}g</div>
              <div style={{ ...type.caption, color: C.textLight }}>{icedRecipe.icePlacement}</div>
            </div>
          </div>
          {icedRecipe.finalBeverageWaterTargetGrams && (
            <div role="note" style={{ ...type.caption, color: C.textMuted, lineHeight: 1.5, margin: '-4px 4px 14px' }}>
              Hot extraction: {icedRecipe.hotWaterGrams}g · Brew ice: {icedRecipe.initialBrewIceGrams}g · Final beverage-water target: {icedRecipe.finalBeverageWaterTargetGrams}g. Serving ice is excluded.
            </div>
          )}

          {/* Iced grind card */}
          {icedRecipe.grindSize && (
            <div style={{
              background: ICE_PAPER_GRAD,
              borderRadius: radius.lg,
              padding: '14px 18px',
              marginBottom: 14,
              border: `1px solid ${ICE_RULE}`,
              boxShadow: shadows.e1,
            }}>
              <SectionLabel style={{ marginBottom: 8 }}>{icedRecipe.grindSize.grinderSpecific === false ? 'Grind' : `${grinderName} Grind`}</SectionLabel>
              <GrindDisplay grindSize={icedRecipe.grindSize} grinderName={grinderName} preferences={preferences} accentColor={C.frost} />
            </div>
          )}

          {/* Iced temp */}
          {icedRecipe.waterTemp && (
            <div style={{
              background: ICE_TILE_BG,
              borderRadius: radius.lg,
              padding: '12px 14px',
              marginBottom: 14,
              border: `1px solid ${ICE_RULE}`,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}>
              <Thermometer size={18} color={C.frost} />
              <div>
                <SectionLabel>Water Temperature</SectionLabel>
                <div style={{ fontFamily: fonts.heading, fontSize: 16, fontWeight: 600, color: C.text, marginTop: 2 }}>
                  {renderTemp(icedRecipe.waterTemp)}
                </div>
              </div>
            </div>
          )}

          {/* Iced steps */}
          {icedRecipe.prepSteps?.length > 0 && (
            <div role="note" style={{ background: ICE_TILE_BG, borderRadius: radius.lg, padding: '12px 16px', marginBottom: 14, border: `1px solid ${ICE_RULE}` }}>
              <SectionLabel style={{ color: C.frost, marginBottom: 6 }}>Prepare before the clock</SectionLabel>
              <ol style={{ margin: 0, paddingLeft: 20, color: C.text, lineHeight: 1.5 }}>
                {icedRecipe.prepSteps.map((step, index) => <li key={index}>{step.action}</li>)}
              </ol>
            </div>
          )}
          <StepTimeline
            steps={icedRecipe.steps}
            timelineColor={ICE_RULE}
            accentColor={C.accent}
            iceAccent={C.frost}
          />

          {icedRecipe.postBrewSteps?.length > 0 && (
            <div role="note" style={{ background: ICE_TILE_BG, borderRadius: radius.lg, padding: '12px 16px', marginBottom: 14, border: `1px solid ${ICE_RULE}` }}>
              <SectionLabel style={{ color: C.frost, marginBottom: 6 }}>After Finish Brew</SectionLabel>
              <div style={{ ...type.body, color: C.text, lineHeight: 1.5 }}>{icedRecipe.postBrewSteps[0].action}</div>
            </div>
          )}

          <TimingMemoryHint memory={icedTimingMemory} context={icedTimingContext} />

          {/* Start Iced Brew button — gated on timer data like the hot flow,
              so a non-timer-ready recipe never opens the missing-data screen */}
          {!icedRecipe.timerReady && (
            <div style={{ fontSize: 12, color: C.textMuted, textAlign: 'center', marginBottom: 10, fontFamily: fonts.body }}>
              This recipe is missing timer data — regenerate the hot recipe to enable the iced timer.
            </div>
          )}
          {icedTimerReady && (
          <m.button
            onClick={handleStartIcedBrew}
            aria-label="Start iced brew timer"
            whileTap={{ scale: 0.97 }}
            transition={spring.snappy}
            style={{
              width: '100%',
              padding: '16px 20px',
              borderRadius: radius.md,
              background: `linear-gradient(180deg, ${C.frost} 0%, #4E6878 100%)`,
              color: C.cream,
              border: 'none',
              fontSize: 16,
              fontWeight: 700,
              fontFamily: fonts.body,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              marginBottom: 10,
              minHeight: 52,
              boxShadow: '0 1px 2px rgba(91,155,213,0.2), 0 4px 14px rgba(91,155,213,0.24)',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <Snowflake size={16} /> Start Iced Brew
          </m.button>
          )}

          {onRegenerate && (
            <Btn variant="ghost" onClick={handleRegenerate} style={{ width: '100%', justifyContent: 'center' }} aria-label="Regenerate recipe (returns to hot)">
              <RefreshCw size={14} /> Regenerate Recipe
            </Btn>
          )}

          {extraFooter}
        </m.div>
      )}
      {recipe && icedMode && !icedRecipe && (
        <m.div ref={modalContentRef} {...fadeUp} style={{ textAlign: 'center', padding: '36px 8px' }}>
          <Snowflake size={30} color={C.frost} style={{ marginBottom: 14 }} />
          <div style={{ fontFamily: fonts.heading, fontSize: 18, fontWeight: 600, color: C.text, marginBottom: 8 }}>
            {icedLoading ? 'Preparing iced recipe…' : 'Iced recipe unavailable'}
          </div>
          <div style={{ ...type.body, color: C.textMuted, lineHeight: 1.5, marginBottom: 16 }}>
            {icedLoading ? 'The hot recipe remains available while the independent iced profile loads.' : (icedError || 'Regenerate the independent iced profile to try again.')}
          </div>
          {!icedLoading && onRetryIced && (
            <Btn variant="ghost" onClick={onRetryIced} style={{ width: '100%', justifyContent: 'center' }} aria-label="Retry iced recipe">
              <RefreshCw size={14} /> Retry iced recipe
            </Btn>
          )}
          <Btn variant="ghost" onClick={handleBackToHot} style={{ width: '100%', justifyContent: 'center', marginTop: 8 }} aria-label="Back to hot recipe">
            <ArrowLeft size={14} /> Back to hot recipe
          </Btn>
        </m.div>
      )}
    </Modal>
    <BrewTimer
      open={timerOpen}
      recipe={timerRecipe}
      bean={bean}
      onSaveTimingEvent={onSaveTimingEvent}
      onClose={() => { setTimerOpen(false); setTimerRecipeOverride(null); }}
      onStartTasting={(beanId) => {
        setTimerOpen(false);
        setTimerRecipeOverride(null);
        handleClose();
        onStartTasting?.(beanId);
      }}
    />
    </>
  );
};
