// Aiden brew recipe modal — shows recipe, grind, and "Open in Fellow" link
import { C, fonts } from '../styles/theme';
import { Modal } from './Modal';
import { Btn } from './Btn';
import { Badge } from './Badge';
import { ExternalLink, Coffee, Thermometer, Droplets, RefreshCw, AlertTriangle } from 'lucide-react';
import { usePreferences } from '../hooks/useUserProfile';
import { GRINDER_LABELS } from '../lib/brewMethods';

const TempChain = ({ temps, label }) => (
  <div style={{ marginBottom: 8 }}>
    <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
      {label}
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', fontSize: 13, color: C.text }}>
      {temps.map((t, i) => (
        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontWeight: 600 }}>{t}°</span>
          {i < temps.length - 1 && <span style={{ color: C.textLight }}>→</span>}
        </span>
      ))}
    </div>
  </div>
);

const ParamCell = ({ label, value, unit }) => (
  <div style={{
    background: C.bg,
    borderRadius: 10,
    padding: '10px 12px',
    textAlign: 'center',
  }}>
    <div style={{ fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
    <div style={{ fontFamily: fonts.title, fontSize: 20, color: C.text }}>{value}</div>
    {unit && <div style={{ fontSize: 11, color: C.textLight }}>{unit}</div>}
  </div>
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

export const AidenModal = ({ open, onClose, recipe, result, loading, error, phase, onRetry, onRetryPush, onRegenerate, onPushCached }) => {
  const { preferences, fellowConnected } = usePreferences();
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
          {/* Title */}
          <div style={{ fontFamily: fonts.title, fontSize: 18, color: C.text, marginBottom: 12 }}>
            {recipe.title}
          </div>

          {/* 2x2 Param Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
            <ParamCell label="Ratio" value={`1:${recipe.ratio}`} />
            <ParamCell label="Bloom" value={recipe.bloomRatio} unit={`× · ${recipe.bloomDuration}s`} />
            <ParamCell label="SS Pulses" value={recipe.ssPulsesNumber} unit={`@ ${recipe.ssPulsesInterval}s`} />
            <ParamCell label="Batch Pulses" value={recipe.batchPulsesNumber} unit={`@ ${recipe.batchPulsesInterval}s`} />
          </div>

          {/* Temperature profiles */}
          <div style={{
            background: C.bg,
            borderRadius: 14,
            padding: 14,
            marginBottom: 14,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <Thermometer size={14} color={C.accent} />
              <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Temperature Profiles</span>
            </div>
            <TempChain label="Bloom" temps={[recipe.bloomTemperature]} />
            {recipe.ssPulseTemperatures && (
              <TempChain label="Single Serve" temps={recipe.ssPulseTemperatures} />
            )}
            {recipe.batchPulseTemperatures && (
              <TempChain label="Batch" temps={recipe.batchPulseTemperatures} />
            )}
          </div>

          {/* Grind recommendation */}
          {recipe.grindRecommendation && (
            <div style={{
              background: C.amberBg,
              borderRadius: 14,
              padding: 14,
              marginBottom: 14,
              border: `1px solid #E8D5A0`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <Droplets size={14} color={C.amber} />
                <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{grinderName} Grind</span>
              </div>
              <div style={{ display: 'flex', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>Single</div>
                  <div style={{ fontFamily: fonts.title, fontSize: 22, color: C.amber }}>{recipe.grindRecommendation.singleServe}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>Batch</div>
                  <div style={{ fontFamily: fonts.title, fontSize: 22, color: C.amber }}>{recipe.grindRecommendation.batch}</div>
                </div>
              </div>
            </div>
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

          {/* Open in Fellow / Open on Aiden button */}
          {result?.link && (
            <Btn variant="primary" onClick={() => window.open(result.link, '_blank')} style={{ width: '100%', justifyContent: 'center', fontSize: 15, padding: '14px 18px' }}>
              <ExternalLink size={16} /> {fellowConnected && !result.usedRelay ? 'Open in Fellow' : 'Open on Aiden'}
            </Btn>
          )}

          {/* Push cached recipe to Aiden (when viewing saved recipe, no push yet) */}
          {!result && !loading && !error && onPushCached && (
            <Btn variant="primary" onClick={() => onPushCached(recipe)} style={{ width: '100%', justifyContent: 'center', fontSize: 15, padding: '14px 18px', marginBottom: 8 }}>
              <ExternalLink size={16} /> {fellowConnected ? 'Send to Aiden' : 'Push to Aiden'}
            </Btn>
          )}

          {/* Regenerate button */}
          {onRegenerate && !loading && (
            <Btn variant="ghost" onClick={onRegenerate} style={{ width: '100%', justifyContent: 'center' }} aria-label="Regenerate Aiden recipe">
              <RefreshCw size={14} /> Regenerate Recipe
            </Btn>
          )}
        </div>
      )}
    </Modal>
  );
};
