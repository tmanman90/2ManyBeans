// Hand brew recipe modal — step-by-step pour-over guide with Ghibli-warm aesthetic
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { C, fonts } from '../styles/theme';
import { Modal } from './Modal';
import { Btn } from './Btn';
import { BrewTimer } from './BrewTimer';
import { DoseStepperCard } from './DoseStepperCard';
import { Coffee, Droplets, Thermometer, RefreshCw, Play, Scale, Snowflake, ArrowLeft } from 'lucide-react';
import { usePreferences } from '../hooks/useUserProfile';
import { GRINDER_LABELS } from '../lib/brewMethods';
import { scaleRecipeForDose } from '../lib/recipeScaling';
import { transformToFlashBrew } from '../lib/flashBrewTransform';

const ICE_RULE = '#C8D8E4';
const ICE_PAPER_GRAD = 'linear-gradient(180deg, #E8F0F8 0%, #D8E8F2 100%)';
const ICE_TILE_BG = '#DCE8F0';

const ParamCard = ({ label, value, sub, icon: Icon, iconColor }) => (
  <div style={{
    background: C.bg,
    borderRadius: 10,
    padding: '10px 12px',
    textAlign: 'center',
  }}>
    {Icon && <Icon size={14} color={iconColor || C.accent} style={{ marginBottom: 4 }} />}
    <div style={{ fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>{label}</div>
    <div style={{ fontFamily: fonts.title, fontSize: 20, color: C.text }}>{value}</div>
    {sub && <div style={{ fontSize: 11, color: C.textLight }}>{sub}</div>}
  </div>
);

const TECHNIQUE_LABELS = {
  hoffmann: 'Hoffmann Classic',
  'kasuya-46': 'Kasuya 4:6',
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
      <div style={{ fontFamily: fonts.title, fontSize: 28, color: accentColor }}>{primary}</div>
      <div>
        <div style={{ fontSize: 14, color: C.text, fontWeight: 600 }}>{grindSize.description}</div>
        {secondary && <div style={{ fontSize: 12, color: C.textMuted }}>{secondary}</div>}
      </div>
    </div>
  );
};

const StepTimeline = ({ steps, timelineColor, accentColor, iceAccent }) => (
  <div style={{ marginBottom: 14 }}>
    <div style={{ fontSize: 13, fontWeight: 700, color: C.text, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
      Steps
    </div>
    <div style={{ position: 'relative', paddingLeft: 20 }}>
      <div style={{
        position: 'absolute', left: 5, top: 6, bottom: 6, width: 2,
        background: timelineColor, borderRadius: 1,
      }} />
      {(steps || []).map((step, i) => (
        <div key={i} style={{
          position: 'relative',
          marginBottom: i < steps.length - 1 ? 16 : 0,
        }}>
          <div style={{
            position: 'absolute', left: -18, top: 4, width: 8, height: 8,
            borderRadius: '50%',
            background: step.isIceStep ? (iceAccent || '#5B9BD5') : (i === 0 ? accentColor : C.accentLight),
            border: `2px solid ${C.card}`,
          }} />
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{
              fontSize: 12, fontWeight: 700,
              color: step.isIceStep ? (iceAccent || '#5B9BD5') : accentColor,
              fontFamily: 'monospace', minWidth: 48, flexShrink: 0,
            }}>
              {step.time}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, color: C.text, lineHeight: 1.4 }}>{step.action}</div>
              {step.waterTotal > 0 && (
                <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
                  Total water: {step.waterTotal}g
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  </div>
);

export const HandBrewModal = ({
  open, onClose, recipe, loading, error, phase, onRetry, onRegenerate,
  extraFooter, bean, onStartTasting,
  userCoffeeGrams, onCoffeeGramsChange, onPersistDose,
  deviceKey,
}) => {
  const { preferences } = usePreferences();
  const grinderKey = preferences?.grinder || 'fellow-ode-gen2';
  const grinderName = GRINDER_LABELS[grinderKey] || preferences?.grinderCustomName || 'Grinder';
  const msg = phaseMessages[phase] || phaseMessages.recipe;
  const [timerOpen, setTimerOpen] = useState(false);
  const [icedMode, setIcedMode] = useState(false);
  const modalContentRef = useRef(null);
  const icedTimerRecipeRef = useRef(null);
  const timerReady = recipe?.timerReady === true;

  useEffect(() => {
    if (open) setIcedMode(false);
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
    icedTimerRecipeRef.current = icedRecipe;
    setTimerOpen(true);
  }, [icedRecipe]);

  const timerRecipe = icedMode ? (icedTimerRecipeRef.current || icedRecipe) : displayRecipe;

  return (
    <>
    <Modal open={open && !timerOpen} onClose={handleClose} title={icedMode ? 'Iced Flash Brew' : 'Hand Brew Recipe'}>
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
          background: C.redBg, borderRadius: 14, padding: 16,
          border: `1px solid ${C.red}20`,
        }}>
          <div style={{ fontSize: 14, color: C.red, fontWeight: 600, marginBottom: 4 }}>Couldn't generate a recipe</div>
          <div style={{ fontSize: 13, color: C.text }}>{error}</div>
          {onRetry && (
            <Btn variant="small" onClick={onRetry} style={{ marginTop: 10 }} aria-label="Retry recipe generation">
              <RefreshCw size={12} /> Try Again
            </Btn>
          )}
        </div>
      )}

      {/* Hot recipe display */}
      {recipe && !icedMode && (
        <div ref={modalContentRef}>
          <div style={{ fontFamily: fonts.title, fontSize: 20, color: C.text, marginBottom: 4 }}>
            {recipe.title || 'Pour-Over Recipe'}
          </div>

          {recipe.technique && TECHNIQUE_LABELS[recipe.technique] && (
            <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 12 }}>
              {TECHNIQUE_LABELS[recipe.technique]} Method
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
            <DoseStepperCard dose={displayRecipe.coffeeGrams} onChange={onCoffeeGramsChange} />
            <ParamCard label="Water" value={`${displayRecipe.waterGrams}g`} icon={Droplets} iconColor={C.blue} />
            <ParamCard label="Ratio" value={displayRecipe.ratio} icon={Scale} />
          </div>

          {recipe.grindSize && (
            <div style={{
              background: C.amberBg, borderRadius: 14, padding: 14, marginBottom: 14,
              border: '1px solid #E8D5A0',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <Droplets size={14} color={C.amber} />
                <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{grinderName} Grind</span>
              </div>
              <GrindDisplay grindSize={recipe.grindSize} grinderName={grinderName} preferences={preferences} accentColor={C.amber} />
            </div>
          )}

          {recipe.waterTemp && (
            <div style={{
              background: C.bg, borderRadius: 14, padding: 14, marginBottom: 14,
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <Thermometer size={18} color={C.accent} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Water Temperature</div>
                <div style={{ fontSize: 14, color: C.text }}>{renderTemp(recipe.waterTemp)}</div>
              </div>
            </div>
          )}

          <StepTimeline steps={displayRecipe.steps} timelineColor={C.borderLight} accentColor={C.accent} />

          {recipe.totalBrewTime && (
            <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 14, textAlign: 'center' }}>
              Target brew time: <strong style={{ color: C.text }}>{recipe.totalBrewTime}</strong>
            </div>
          )}

          {recipe.tips && (
            <div style={{
              background: C.greenBg, borderRadius: 14, padding: 14, marginBottom: 14,
              border: `1px solid ${C.green}20`,
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.green, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                Tasting Tip
              </div>
              <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5 }}>{recipe.tips}</div>
            </div>
          )}

          {recipe.reasoning && (
            <div style={{
              fontSize: 12, color: C.textMuted, fontStyle: 'italic',
              marginBottom: 14, lineHeight: 1.5, padding: '0 4px',
            }}>
              {recipe.reasoning}
            </div>
          )}

          {timerReady && (
            <button
              onClick={handleStartBrew}
              aria-label="Start brew timer"
              style={{
                width: '100%', padding: '14px 20px', borderRadius: 14,
                background: C.accent, color: '#fff', border: 'none',
                fontSize: 15, fontWeight: 700, fontFamily: fonts.body, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                marginBottom: 10,
              }}
            >
              <Play size={16} fill="#fff" strokeWidth={0} /> Start Brew
            </button>
          )}

          {onRegenerate && (
            <Btn variant="ghost" onClick={handleRegenerate} style={{ width: '100%', justifyContent: 'center' }} aria-label="Regenerate hand brew recipe">
              <RefreshCw size={14} /> Regenerate Recipe
            </Btn>
          )}

          {timerReady && (
            <button
              onClick={handleEnterIced}
              style={{
                width: '100%', marginTop: 10, padding: '12px 16px', borderRadius: 12,
                background: ICE_PAPER_GRAD, border: `1px solid ${ICE_RULE}`,
                color: C.text, fontSize: 14, fontWeight: 700, fontFamily: fonts.body,
                cursor: 'pointer', display: 'flex', alignItems: 'center',
                justifyContent: 'center', gap: 8,
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <Snowflake size={16} color="#5B9BD5" />
              Iced flash brew this bean
            </button>
          )}

          {extraFooter}
        </div>
      )}

      {/* Iced mode view */}
      {recipe && icedMode && icedRecipe && (
        <div ref={modalContentRef}>
          <button
            onClick={handleBackToHot}
            style={{
              background: 'none', border: 'none', padding: '4px 0', marginBottom: 12,
              fontSize: 13, color: C.accent, fontWeight: 600, fontFamily: fonts.body,
              display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <ArrowLeft size={14} /> Back to hot recipe
          </button>

          <div style={{ marginBottom: 14 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              fontFamily: fonts.title, fontSize: 24, color: C.text,
            }}>
              <Snowflake size={20} color="#5B9BD5" />
              Iced Flash Brew
            </div>
            {recipe.technique && TECHNIQUE_LABELS[recipe.technique] && (
              <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
                {TECHNIQUE_LABELS[recipe.technique]} Method
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
            <DoseStepperCard dose={icedRecipe.coffeeGrams} onChange={onCoffeeGramsChange} />
            <div style={{ background: ICE_TILE_BG, borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
              <Droplets size={14} color="#5B9BD5" style={{ marginBottom: 4 }} />
              <div style={{ fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Water</div>
              <div style={{ fontFamily: fonts.title, fontSize: 20, color: C.text }}>{icedRecipe.waterGrams}g</div>
              <div style={{ fontSize: 11, color: C.textLight }}>(hot)</div>
            </div>
            <div style={{ background: ICE_TILE_BG, borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
              <Snowflake size={14} color="#5B9BD5" style={{ marginBottom: 4 }} />
              <div style={{ fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Ice</div>
              <div style={{ fontFamily: fonts.title, fontSize: 20, color: C.text }}>{icedRecipe.iceGrams}g</div>
              <div style={{ fontSize: 11, color: C.textLight }}>({icedRecipe.icePlacement})</div>
            </div>
          </div>

          {icedRecipe.grindSize && (
            <div style={{
              background: ICE_PAPER_GRAD, borderRadius: 14, padding: 14, marginBottom: 14,
              border: `1px solid ${ICE_RULE}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <Droplets size={14} color="#5B9BD5" />
                <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{grinderName} Grind (finer for iced)</span>
              </div>
              <GrindDisplay grindSize={icedRecipe.grindSize} grinderName={grinderName} preferences={preferences} accentColor="#5B9BD5" />
            </div>
          )}

          {icedRecipe.waterTemp && (
            <div style={{
              background: ICE_TILE_BG, borderRadius: 14, padding: 14, marginBottom: 14,
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <Thermometer size={18} color="#5B9BD5" />
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Water Temperature (+1C for iced)</div>
                <div style={{ fontSize: 14, color: C.text }}>{renderTemp(icedRecipe.waterTemp)}</div>
              </div>
            </div>
          )}

          <StepTimeline steps={icedRecipe.steps} timelineColor={ICE_RULE} accentColor={C.accent} iceAccent="#5B9BD5" />

          <button
            onClick={handleStartIcedBrew}
            aria-label="Start iced brew timer"
            style={{
              width: '100%', padding: '14px 20px', borderRadius: 14,
              background: 'linear-gradient(180deg, #5B9BD5 0%, #4A8BC5 100%)',
              color: '#fff', border: 'none',
              fontSize: 15, fontWeight: 700, fontFamily: fonts.body, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              marginBottom: 10,
              boxShadow: '0 1px 2px rgba(91,155,213,0.2)',
            }}
          >
            <Snowflake size={16} /> Start Iced Brew
          </button>

          {onRegenerate && (
            <Btn variant="ghost" onClick={handleRegenerate} style={{ width: '100%', justifyContent: 'center' }} aria-label="Regenerate recipe (returns to hot)">
              <RefreshCw size={14} /> Regenerate Recipe
            </Btn>
          )}

          {extraFooter}
        </div>
      )}
    </Modal>
    <BrewTimer
      open={timerOpen}
      recipe={timerRecipe}
      bean={bean}
      onClose={() => { setTimerOpen(false); icedTimerRecipeRef.current = null; }}
      onStartTasting={(beanId) => {
        setTimerOpen(false);
        icedTimerRecipeRef.current = null;
        handleClose();
        onStartTasting?.(beanId);
      }}
    />
    </>
  );
};
