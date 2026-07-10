import { useEffect, useState } from 'react';
import { C, fonts, type as t, radius, shadows, cardBase } from '../../../styles/theme';
import { m, fadeUp, listContainer, listItem, spring } from '../../../lib/motion';
import { useOnboarding } from '../OnboardingContext';
import { warmPaywallOfferings } from '../warmPaywallOfferings';
import { sanitizeUserText } from '../../../lib/sanitizeUserText';
import { scrollOnFocus } from '../../../lib/formHelpers';
import { useNativeKeyboard } from '../../../hooks/useNativeKeyboard';
import { readPendingProviderDisplayName } from '../../../hooks/useUserProfile';
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
  width: '100%',
  minHeight: 48,
  padding: '12px 16px',
  fontSize: 16,
  fontFamily: fonts.body,
  fontWeight: 500,
  borderRadius: radius.md,
  border: `1.5px solid ${C.border}`,
  background: C.cream,
  color: C.text,
  outline: 'none',
  boxSizing: 'border-box',
  boxShadow: shadows.e1,
  WebkitAppearance: 'none',
  transition: 'border-color 0.18s ease, box-shadow 0.18s ease',
};

const selectStyle = {
  ...inputStyle,
  appearance: 'none',
  WebkitAppearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23A86A38' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 16px center',
  paddingRight: 40,
  cursor: 'pointer',
};

export default function R07Preferences() {
  const { dispatch, answers, user } = useOnboarding();

  const [grinder, setGrinder] = useState(answers?.preferences?.grinder || 'fellow-ode-gen2');
  const [grinderCustom, setGrinderCustom] = useState(answers?.preferences?.grinderCustomName || '');
  const [brewMethod, setBrewMethod] = useState(answers?.preferences?.brewMethod || 'aiden');
  const [displayName, setDisplayName] = useState(
    answers?.preferences?.displayName || user?.displayName || readPendingProviderDisplayName() || ''
  );

  useNativeKeyboard({ hideTabBar: false });
  useEffect(() => { warmPaywallOfferings(); }, []);

  const handleContinue = () => {
    const prefs = {
      grinder,
      grinderCustomName: grinder === 'other' ? sanitizeUserText(grinderCustom) : null,
      brewMethod,
    };
    prefs.displayName = sanitizeUserText(displayName);
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
      <OnboardingTopBar overlay />

      <MascotStage src="/images/ruphus-animations/ruphus-holding-grinder.mp4" height={220} />

      <m.div
        variants={listContainer}
        initial="initial"
        animate="animate"
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
        <m.div variants={listItem}>
          <NoteBubble>
            Last bit. Tell me what you've got and I'll set up your kit.
          </NoteBubble>
        </m.div>

        <m.div variants={listItem} style={{
          ...t.h1,
          color: C.text,
          marginTop: 2,
        }}>
          Set up your kit
        </m.div>

        <m.div variants={listItem}>
          <FieldLabel>What should I call you? <span style={{ opacity: 0.5, fontWeight: 500 }}>(optional)</span></FieldLabel>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            onFocus={scrollOnFocus}
            placeholder="Your name"
            maxLength={50}
            style={inputStyle}
          />
        </m.div>

        <m.div variants={listItem}>
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
            <m.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={spring.soft}
            >
              <input
                type="text"
                value={grinderCustom}
                onChange={(e) => setGrinderCustom(e.target.value)}
                onFocus={scrollOnFocus}
                placeholder="Your grinder name"
                maxLength={50}
                style={{ ...inputStyle, marginTop: 8 }}
              />
            </m.div>
          )}
        </m.div>

        <m.div variants={listItem}>
          <FieldLabel style={{ marginTop: 6 }}>How do you brew?</FieldLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {BREW_OPTIONS.map((method) => {
              const selected = brewMethod === method.key;
              return (
                <m.button
                  key={method.key}
                  onClick={() => setBrewMethod(method.key)}
                  whileTap={{ scale: 0.96 }}
                  transition={spring.snappy}
                  style={{
                    minHeight: 72,
                    padding: 8,
                    background: selected ? C.accentSoft : C.cream,
                    border: `${selected ? 2 : 1.5}px solid ${selected ? C.accent : C.border}`,
                    borderRadius: radius.md,
                    cursor: 'pointer',
                    fontFamily: fonts.body,
                    fontSize: 12,
                    fontWeight: 700,
                    color: selected ? C.accent : C.text,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    lineHeight: 1.2,
                    boxShadow: selected ? shadows.e1 : shadows.e0,
                    transition: 'background 0.16s ease, border-color 0.16s ease, color 0.16s ease, box-shadow 0.16s ease',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  {method.label}
                </m.button>
              );
            })}
          </div>
        </m.div>
      </m.div>

      <OnboardingCtaBar
        label="Continue"
        onClick={handleContinue}
        disabled={false}
      />
    </div>
  );
}

function FieldLabel({ children, style = {} }) {
  return (
    <div style={{
      ...t.label,
      color: C.textMuted,
      marginBottom: 6,
      ...style,
    }}>
      {children}
    </div>
  );
}
