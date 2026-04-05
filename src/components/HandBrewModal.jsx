// Hand brew recipe modal — step-by-step pour-over guide with Ghibli-warm aesthetic
import { C, fonts } from '../styles/theme';
import { Modal } from './Modal';
import { Btn } from './Btn';
import { Coffee, Droplets, Thermometer, RefreshCw } from 'lucide-react';
import { usePreferences } from '../hooks/useUserProfile';
import { GRINDER_LABELS } from '../lib/brewMethods';

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
  // Hedrick 1-2-1 saved for future: too few steps for a recipe card UX
  // 'hedrick-121': 'Hedrick 1-2-1',
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

export const HandBrewModal = ({ open, onClose, recipe, loading, error, phase, onRetry, onRegenerate }) => {
  const { preferences } = usePreferences();
  const grinderKey = preferences?.grinder || 'fellow-ode-gen2';
  const grinderName = GRINDER_LABELS[grinderKey] || preferences?.grinderCustomName || 'Grinder';
  const msg = phaseMessages[phase] || phaseMessages.recipe;

  return (
    <Modal open={open} onClose={onClose} title="Hand Brew Recipe">
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
            <Btn variant="small" onClick={onRetry} style={{ marginTop: 10 }} aria-label="Retry recipe generation">
              <RefreshCw size={12} /> Try Again
            </Btn>
          )}
        </div>
      )}

      {/* Recipe display */}
      {recipe && (
        <div>
          {/* Title */}
          <div style={{ fontFamily: fonts.title, fontSize: 20, color: C.text, marginBottom: 4 }}>
            {recipe.title || 'Pour-Over Recipe'}
          </div>

          {/* Technique subtitle */}
          {recipe.technique && TECHNIQUE_LABELS[recipe.technique] && (
            <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 12 }}>
              {TECHNIQUE_LABELS[recipe.technique]} Method
            </div>
          )}

          {/* Param grid: coffee, water, ratio */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
            <ParamCard label="Coffee" value={`${recipe.coffeeGrams}g`} icon={Coffee} />
            <ParamCard label="Water" value={`${recipe.waterGrams}g`} icon={Droplets} iconColor={C.blue} />
            <ParamCard label="Ratio" value={recipe.ratio} />
          </div>

          {/* Grind card */}
          {recipe.grindSize && (
            <div style={{
              background: C.amberBg,
              borderRadius: 14,
              padding: 14,
              marginBottom: 14,
              border: '1px solid #E8D5A0',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <Droplets size={14} color={C.amber} />
                <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{grinderName} Grind</span>
              </div>
              {(() => {
                const isMicrons = preferences?.grindSizeDisplay === 'microns' && recipe.grindSize.microns;
                const primary = isMicrons ? `~${recipe.grindSize.microns}µm` : recipe.grindSize.setting;
                const secondary = isMicrons
                  ? (recipe.grindSize.setting ? `${grinderName}: ${recipe.grindSize.setting}` : null)
                  : (recipe.grindSize.microns ? `~${recipe.grindSize.microns}µm` : null);
                return (
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                    <div style={{ fontFamily: fonts.title, fontSize: 28, color: C.amber }}>{primary}</div>
                    <div>
                      <div style={{ fontSize: 14, color: C.text, fontWeight: 600 }}>{recipe.grindSize.description}</div>
                      {secondary && <div style={{ fontSize: 12, color: C.textMuted }}>{secondary}</div>}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Water temp */}
          {recipe.waterTemp && (
            <div style={{
              background: C.bg,
              borderRadius: 14,
              padding: 14,
              marginBottom: 14,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}>
              <Thermometer size={18} color={C.accent} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Water Temperature</div>
                <div style={{ fontSize: 14, color: C.text }}>
                  {typeof recipe.waterTemp.celsius === 'number' ? recipe.waterTemp.celsius : String(recipe.waterTemp.celsius).replace(/[^\d.]/g, '')}
                  {'\u00B0'}C / {typeof recipe.waterTemp.fahrenheit === 'number' ? recipe.waterTemp.fahrenheit : String(recipe.waterTemp.fahrenheit).replace(/[^\d.]/g, '')}
                  {'\u00B0'}F
                </div>
              </div>
            </div>
          )}

          {/* Step timeline */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
              Steps
            </div>
            <div style={{ position: 'relative', paddingLeft: 20 }}>
              {/* Vertical timeline line */}
              <div style={{
                position: 'absolute',
                left: 5,
                top: 6,
                bottom: 6,
                width: 2,
                background: C.borderLight,
                borderRadius: 1,
              }} />

              {recipe.steps.map((step, i) => (
                <div key={i} style={{
                  position: 'relative',
                  marginBottom: i < recipe.steps.length - 1 ? 16 : 0,
                }}>
                  {/* Timeline dot */}
                  <div style={{
                    position: 'absolute',
                    left: -18,
                    top: 4,
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: i === 0 ? C.accent : C.accentLight,
                    border: `2px solid ${C.card}`,
                  }} />

                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: C.accent,
                      fontFamily: 'monospace',
                      minWidth: 48,
                      flexShrink: 0,
                    }}>
                      {step.time}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, color: C.text, lineHeight: 1.4 }}>{step.action}</div>
                      {step.waterTotal && (
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

          {/* Total brew time */}
          {recipe.totalBrewTime && (
            <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 14, textAlign: 'center' }}>
              Target brew time: <strong style={{ color: C.text }}>{recipe.totalBrewTime}</strong>
            </div>
          )}

          {/* Tips */}
          {recipe.tips && (
            <div style={{
              background: C.greenBg,
              borderRadius: 14,
              padding: 14,
              marginBottom: 14,
              border: `1px solid ${C.green}20`,
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.green, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                Tasting Tip
              </div>
              <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5 }}>{recipe.tips}</div>
            </div>
          )}

          {/* Reasoning (why this recipe) */}
          {recipe.reasoning && (
            <div style={{
              fontSize: 12,
              color: C.textMuted,
              fontStyle: 'italic',
              marginBottom: 14,
              lineHeight: 1.5,
              padding: '0 4px',
            }}>
              {recipe.reasoning}
            </div>
          )}

          {/* Regenerate button */}
          {onRegenerate && (
            <Btn variant="ghost" onClick={onRegenerate} style={{ width: '100%', justifyContent: 'center' }} aria-label="Regenerate hand brew recipe">
              <RefreshCw size={14} /> Regenerate Recipe
            </Btn>
          )}
        </div>
      )}
    </Modal>
  );
};
