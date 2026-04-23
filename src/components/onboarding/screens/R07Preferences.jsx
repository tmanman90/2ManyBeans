import { useEffect, useState } from 'react';
import { C, fonts, radius, cardBase } from '../../../styles/theme';
import { OnboardingScreenShell } from './OnboardingScreenShell';
import { useOnboarding } from '../OnboardingContext';
import { warmPaywallOfferings } from '../warmPaywallOfferings';
import { sanitizeUserText } from '../../../lib/sanitizeUserText';
import { scrollOnFocus } from '../../../lib/formHelpers';

// Canonical grinder list — kept in sync with SettingsPage's GRINDERS.
// `other` branches into a free-text field for the actual grinder name.
const GRINDERS = [
  { key: 'fellow-ode-gen2', label: 'Fellow Ode Gen 2' },
  { key: 'fellow-opus', label: 'Fellow Opus' },
  { key: 'baratza-encore-esp', label: 'Baratza Encore ESP' },
  { key: 'comandante-c40', label: 'Comandante C40 MK4' },
  { key: '1zpresso-jx-pro', label: '1Zpresso JX-Pro' },
  { key: 'baratza-virtuoso-plus', label: 'Baratza Virtuoso+' },
  { key: 'other', label: 'Other / Manual Entry' },
];

const BREW_OPTIONS = [
  { key: 'aiden', label: 'Fellow Aiden', img: '/images/brew-aiden.webp' },
  { key: 'v60', label: 'Hario V60', img: '/images/brew-handbrew.webp' },
  { key: 'kalita', label: 'Kalita Wave', img: '/images/brew-handbrew.webp' },
  { key: 'chemex', label: 'Chemex', img: '/images/brew-handbrew.webp' },
  { key: 'aeropress', label: 'Aeropress', img: '/images/brew-handbrew.webp' },
  { key: 'french-press', label: 'French Press', img: '/images/brew-handbrew.webp' },
];

export default function R07Preferences() {
  const { dispatch, answers, user } = useOnboarding();
  const needsName = !user?.displayName;

  const [grinder, setGrinder] = useState(answers?.preferences?.grinder || 'fellow-ode-gen2');
  const [grinderCustom, setGrinderCustom] = useState(answers?.preferences?.grinderCustomName || '');
  const [brewMethod, setBrewMethod] = useState(answers?.preferences?.brewMethod || 'aiden');
  const [displayName, setDisplayName] = useState(
    answers?.preferences?.displayName || user?.displayName || ''
  );

  // Preload the RevenueCat offerings cache while the user picks gear —
  // gives R9's processing screen a 5–10s head start so R13's paywall
  // can render without a loader. Single-flight module guard ensures
  // StrictMode's dev double-invoke only triggers one network call.
  useEffect(() => {
    warmPaywallOfferings();
  }, []);

  const nameInvalid = needsName && sanitizeUserText(displayName).length === 0;

  const handleContinue = () => {
    const prefs = {
      grinder,
      grinderCustomName: grinder === 'other' ? sanitizeUserText(grinderCustom) : null,
      brewMethod,
    };
    if (needsName) {
      prefs.displayName = sanitizeUserText(displayName);
    }
    dispatch({
      type: 'ADVANCE',
      next: 'r8',
      answersPatch: { preferences: { ...(answers?.preferences || {}), ...prefs } },
    });
  };

  return (
    <OnboardingScreenShell
      title="Set up your kit"
      ruphusLine="Last bit. Tell me what you've got and I'll set up your kit."
      primaryCta={{
        label: 'Continue',
        onClick: handleContinue,
        disabled: nameInvalid,
      }}
    >
      {/* Display name — only shown when Apple / Google didn't provide one */}
      {needsName && (
        <div style={{ marginBottom: 20 }}>
          <label style={{
            fontSize: 13, color: C.textMuted, fontWeight: 600,
            marginBottom: 6, display: 'block', fontFamily: fonts.body,
          }}>
            What should I call you?
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            onFocus={scrollOnFocus}
            placeholder="Your name"
            maxLength={50}
            style={{
              width: '100%',
              minHeight: 52,
              padding: '14px 16px',
              fontSize: 16, // ≥16 — prevents iOS input auto-zoom
              fontFamily: fonts.body,
              borderRadius: radius.md,
              border: `1px solid ${C.border}`,
              background: C.card,
              color: C.text,
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>
      )}

      {/* Grinder picker */}
      <div style={{ marginBottom: 20 }}>
        <label style={{
          fontSize: 13, color: C.textMuted, fontWeight: 600,
          marginBottom: 6, display: 'block', fontFamily: fonts.body,
        }}>
          What's your grinder?
        </label>
        <select
          value={grinder}
          onChange={(e) => setGrinder(e.target.value)}
          style={{
            width: '100%',
            minHeight: 52,
            padding: '14px 16px',
            fontSize: 16,
            fontFamily: fonts.body,
            borderRadius: radius.md,
            border: `1px solid ${C.border}`,
            background: C.card,
            color: C.text,
            appearance: 'none',
            WebkitAppearance: 'none',
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%238B7B6F' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 14px center',
            boxSizing: 'border-box',
          }}
        >
          {GRINDERS.map(g => (
            <option key={g.key} value={g.key}>{g.label}</option>
          ))}
        </select>
        {grinder === 'other' && (
          <input
            type="text"
            value={grinderCustom}
            onChange={(e) => setGrinderCustom(e.target.value)}
            onFocus={scrollOnFocus}
            placeholder="Your grinder name"
            maxLength={50}
            style={{
              width: '100%',
              minHeight: 52,
              padding: '14px 16px',
              fontSize: 16,
              fontFamily: fonts.body,
              borderRadius: radius.md,
              border: `1px solid ${C.border}`,
              background: C.card,
              color: C.text,
              outline: 'none',
              marginTop: 8,
              boxSizing: 'border-box',
            }}
          />
        )}
      </div>

      {/* Brew method picker */}
      <div style={{ marginBottom: 20 }}>
        <label style={{
          fontSize: 13, color: C.textMuted, fontWeight: 600,
          marginBottom: 10, display: 'block', fontFamily: fonts.body,
        }}>
          How do you brew?
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {BREW_OPTIONS.map(m => {
            const selected = brewMethod === m.key;
            return (
              <button
                key={m.key}
                onClick={() => setBrewMethod(m.key)}
                style={{
                  minHeight: 100,
                  padding: 12,
                  ...cardBase,
                  cursor: 'pointer',
                  textAlign: 'center',
                  border: selected ? `2px solid ${C.accent}` : `1.5px solid ${C.borderLight}`,
                  background: selected ? C.amberBg : C.card,
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <img
                  src={m.img}
                  alt={m.label}
                  style={{
                    width: 56,
                    height: 56,
                    objectFit: 'cover',
                    borderRadius: 10,
                    marginBottom: 6,
                  }}
                />
                <div style={{
                  fontFamily: fonts.body,
                  fontSize: 13,
                  fontWeight: 700,
                  color: selected ? C.accent : C.text,
                }}>
                  {m.label}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </OnboardingScreenShell>
  );
}
