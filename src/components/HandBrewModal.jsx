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

const ICE_RULE       = C.frostBorder;
const ICE_PAPER_GRAD = `linear-gradient(160deg, ${C.frostBg} 0%, ${C.frostSoft} 100%)`;
const ICE_TILE_BG    = C.frostSoft;

// ── Eyebrow label ─────────────────────────────────────────────────────────────
const SectionLabel = ({ children, style }) => (
  <div style={{ ...type.label, color: C.textMuted, ...style }}>{children}</div>
);

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

const GrindDisplay = ({ grindSize, grinderName, preferences, accentColor }) => {
  const isMicrons = preferences?.grindSizeDisplay === 'microns' && grindSize.microns;
  const primary = isMicrons ? `~${grindSize.microns}µm` : grindSize.setting;
  const secondary = isMicrons
    ? (grindSize.setting ? `${grinderName}: ${grindSize.setting}` : null)
    : (grindSize.microns ? `~${grindSize.microns}µm` : null);
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
  open, onClose, recipe, loading, error, phase, onRetry, onRegenerate,
  extraFooter, bean, onStartTasting,
  userCoffeeGrams, onCoffeeGramsChange, onPersistDose,
  deviceKey, onKalitaSizeChange,
}) => {
  const { preferences } = usePreferences();
  const grinderKey = preferences?.grinder || 'fellow-ode-gen2';
  const grinderName = GRINDER_LABELS[grinderKey] || preferences?.grinderCustomName || 'Grinder';
  const msg = phaseMessages[phase] || phaseMessages.recipe;
  const [timerOpen, setTimerOpen] = useState(false);
  const [icedMode, setIcedMode] = useState(false);
  const [timerRecipeOverride, setTimerRecipeOverride] = useState(null);
  const modalContentRef = useRef(null);
  const timerReady = recipe?.timerReady === true;

  useEffect(() => {
    if (open) {
      setIcedMode(false);
      setTimerRecipeOverride(null);
    }
  }, [open]);

  const effectiveDose = typeof userCoffeeGrams === 'number' && userCoffeeGrams > 0
    ? userCoffeeGrams
    : recipe?.coffeeGrams;

  const displayRecipe = useMemo(
    () => scaleRecipeForDose(recipe, effectiveDose),
    [recipe, effectiveDose]
  );

  const device = deviceKey || recipe?.device || 'v60';

  const icedRecipe = useMemo(
    () => (icedMode && displayRecipe) ? transformToFlashBrew(displayRecipe, device, effectiveDose) : null,
    [icedMode, displayRecipe, device, effectiveDose]
  );

  const handleEnterIced = () => {
    setIcedMode(true);
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
            <SectionLabel style={{ marginBottom: 6 }}>Hand Brew Recipe</SectionLabel>
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
            {recipe.technique && TECHNIQUE_LABELS[recipe.technique] && (
              <div style={{ ...type.caption, color: C.textMuted, marginTop: 4 }}>
                {TECHNIQUE_LABELS[recipe.technique]} Method
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
            <DoseStepperCard dose={displayRecipe.coffeeGrams} onChange={onCoffeeGramsChange} />
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
              <SectionLabel style={{ marginBottom: 8 }}>{grinderName} Grind</SectionLabel>
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

          {/* Steps */}
          <StepTimeline
            steps={displayRecipe.steps}
            timelineColor={C.borderLight}
            accentColor={C.accent}
          />

          {/* Total brew time */}
          {recipe.totalBrewTime && (
            <div style={{
              textAlign: 'center',
              ...type.body,
              color: C.textMuted,
              marginBottom: 14,
              paddingTop: 4,
            }}>
              Guide finish: <strong style={{ color: C.text, fontFamily: fonts.heading }}>{recipe.totalBrewTime}</strong>
            </div>
          )}

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
              <SectionLabel style={{ color: C.green, marginBottom: 6 }}>Tasting Tip</SectionLabel>
              <div style={{ ...type.body, color: C.text, lineHeight: 1.5 }}>{recipe.tips}</div>
            </div>
          )}

          {/* Reasoning */}
          {recipe.reasoning && (
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
              <Play size={16} fill="#FFF8F0" strokeWidth={0} /> Start Brew
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
            {recipe.technique && TECHNIQUE_LABELS[recipe.technique] && (
              <div style={{ ...type.caption, color: C.textMuted, marginTop: 4 }}>
                {TECHNIQUE_LABELS[recipe.technique]} Method
              </div>
            )}
          </div>

          {/* Iced param tiles */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
            <DoseStepperCard dose={icedRecipe.coffeeGrams} onChange={onCoffeeGramsChange} />
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
              <SectionLabel style={{ marginBottom: 8 }}>{grinderName} Grind (finer for iced)</SectionLabel>
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
                <SectionLabel>Water Temperature (+1C for iced)</SectionLabel>
                <div style={{ fontFamily: fonts.heading, fontSize: 16, fontWeight: 600, color: C.text, marginTop: 2 }}>
                  {renderTemp(icedRecipe.waterTemp)}
                </div>
              </div>
            </div>
          )}

          {/* Iced steps */}
          <StepTimeline
            steps={icedRecipe.steps}
            timelineColor={ICE_RULE}
            accentColor={C.accent}
            iceAccent={C.frost}
          />

          {/* Start Iced Brew button — gated on timer data like the hot flow,
              so a non-timer-ready recipe never opens the missing-data screen */}
          {!icedRecipe.timerReady && (
            <div style={{ fontSize: 12, color: C.textMuted, textAlign: 'center', marginBottom: 10, fontFamily: fonts.body }}>
              This recipe is missing timer data — regenerate the hot recipe to enable the iced timer.
            </div>
          )}
          {icedRecipe.timerReady && (
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
    </Modal>
    <BrewTimer
      open={timerOpen}
      recipe={timerRecipe}
      bean={bean}
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
