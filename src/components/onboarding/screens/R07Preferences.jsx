import { useEffect, useState } from 'react';
import { C, fonts } from '../../../styles/theme';
import { useOnboarding } from '../OnboardingContext';
import { warmPaywallOfferings } from '../warmPaywallOfferings';
import { sanitizeUserText } from '../../../lib/sanitizeUserText';
import { scrollOnFocus } from '../../../lib/formHelpers';
import { useNativeKeyboard } from '../../../hooks/useNativeKeyboard';
import { MascotStage, NoteBubble, OnboardingTopBar, OnboardingCtaBar, onboardingBg } from './OnboardingPrimitives';

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
  { key: 'aiden', label: 'Fellow Aiden' },
  { key: 'v60', label: 'Hario V60' },
  { key: 'kalita', label: 'Kalita Wave' },
  { key: 'chemex', label: 'Chemex' },
  { key: 'aeropress', label: 'Aeropress' },
  { key: 'french-press', label: 'French Press' },
];

const inputStyle = {
  width: '100%', minHeight: 48, padding: '12px 14px',
  fontSize: 16, fontFamily: "'Nunito', sans-serif",
  borderRadius: 12, border: `1px solid #E8DDD3`,
  background: '#FFF8F0', color: '#3B2417', outline: 'none',
  boxSizing: 'border-box',
};

const selectStyle = {
  ...inputStyle,
  appearance: 'none', WebkitAppearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%238B7B6F' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 14px center',
};

export default function R07Preferences() {
  const { dispatch, answers, user } = useOnboarding();
  const needsName = !user?.displayName;

  const [grinder, setGrinder] = useState(answers?.preferences?.grinder || 'fellow-ode-gen2');
  const [grinderCustom, setGrinderCustom] = useState(answers?.preferences?.grinderCustomName || '');
  const [brewMethod, setBrewMethod] = useState(answers?.preferences?.brewMethod || 'aiden');
  const [displayName, setDisplayName] = useState(
    answers?.preferences?.displayName || user?.displayName || ''
  );

  useNativeKeyboard({ hideTabBar: false });
  useEffect(() => { warmPaywallOfferings(); }, []);

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
    <div style={{
      width: '100%',
      minHeight: '100dvh',
      maxHeight: '100dvh',
      background: onboardingBg,
      display: 'flex',
      flexDirection: 'column',
      fontFamily: fonts.body,
      position: 'relative',
      overflow: 'hidden',
    }}>
      <OnboardingTopBar step="R7 · YOUR KIT" overlay />

      <MascotStage src="/images/ruphus-animations/ruphus-holding-grinder.mp4" height={220} />

      <div
        onClick={(e) => {
          const tag = e.target.tagName;
          if (tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'TEXTAREA' && tag !== 'BUTTON')
            document.activeElement?.blur();
        }}
        style={{
          flex: 1,
          padding: '4px 20px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          minHeight: 0,
          overflowY: 'auto',
        }}
      >
        <NoteBubble>
          Last bit. Tell me what you've got and I'll set up your kit.
        </NoteBubble>

        <div style={{
          fontFamily: fonts.heading,
          fontSize: 23, lineHeight: 1.2,
          color: C.text,
          marginTop: 2,
        }}>
          Set up your kit
        </div>

        {needsName && (
          <>
            <FieldLabel>What should I call you?</FieldLabel>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              onFocus={scrollOnFocus}
              placeholder="Your name"
              maxLength={50}
              style={inputStyle}
            />
          </>
        )}

        <FieldLabel style={{ marginTop: 6 }}>What's your grinder?</FieldLabel>
        <select
          value={grinder}
          onChange={(e) => setGrinder(e.target.value)}
          style={selectStyle}
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
            style={{ ...inputStyle, marginTop: 4 }}
          />
        )}

        <FieldLabel style={{ marginTop: 6 }}>How do you brew?</FieldLabel>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {BREW_OPTIONS.map((m) => {
            const selected = brewMethod === m.key;
            return (
              <button
                key={m.key}
                onClick={() => setBrewMethod(m.key)}
                style={{
                  minHeight: 72,
                  padding: 8,
                  background: selected ? C.amberBg : C.card,
                  border: `${selected ? 2 : 1.5}px solid ${selected ? C.accent : C.borderLight}`,
                  borderRadius: 12,
                  cursor: 'pointer',
                  fontFamily: fonts.body,
                  fontSize: 12,
                  fontWeight: 700,
                  color: selected ? C.accent : C.text,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  textAlign: 'center',
                  lineHeight: 1.2,
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      <OnboardingCtaBar
        label="Continue"
        onClick={handleContinue}
        disabled={nameInvalid}
      />
    </div>
  );
}

function FieldLabel({ children, style = {} }) {
  return (
    <div style={{
      fontSize: 12, color: C.textMuted, fontWeight: 700,
      fontFamily: fonts.body,
      letterSpacing: 0.3,
      textTransform: 'uppercase',
      marginBottom: 4,
      ...style,
    }}>
      {children}
    </div>
  );
}
